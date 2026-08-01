import type { RpcTransport } from "@zmkfirmware/zmk-studio-ts-client/transport/index";
import { Request, Response, RequestResponse } from "@zmkfirmware/zmk-studio-ts-client";
import { LockState } from "@zmkfirmware/zmk-studio-ts-client/core";
import type { ComboConfig } from "@zmkfirmware/zmk-studio-ts-client/combos";
import type { Layer } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import { setDemoMotionEnabled } from "./motionBackend";
import { setDemoKeyMeta } from "./demoKeyMeta";
import { hid_usage_from_page_and_id } from "../hid-usages";

const FRAMING_SOF = 0xab;
const FRAMING_ESC = 0xac;
const FRAMING_EOF = 0xad;

// Behavior local_ids used by the demo keymap/bindings.
const B = {
  kp: 1,
  mt: 2,
  lt: 3,
  mo: 4,
  trans: 5,
  none: 6,
  studioUnlock: 7,
  sysReset: 8,
  bootloader: 9,
  bt: 10,
  out: 11,
  softOff: 12,
  capsWord: 13,
};

/*
 * Real firmware sends `&kp` parameters as a full HID usage — `(page << 16) | id`
 * — so the bare ids below have to be encoded the same way, or every label in
 * Studio resolves to "?" and live keypress highlighting never matches.
 */
const KB_PAGE = 7;
const CONSUMER_PAGE = 0x0c;

const KEY = (id: number) => ({
  behaviorId: B.kp,
  param1: hid_usage_from_page_and_id(KB_PAGE, id),
  param2: 0,
});
const CKEY = (id: number) => ({
  behaviorId: B.kp,
  param1: hid_usage_from_page_and_id(CONSUMER_PAGE, id),
  param2: 0,
});
const TRANS = { behaviorId: B.trans, param1: 0, param2: 0 };
const MO = (l: number) => ({ behaviorId: B.mo, param1: l, param2: 0 });
const LT = (l: number, id: number) => ({
  behaviorId: B.lt,
  param1: l,
  param2: hid_usage_from_page_and_id(KB_PAGE, id),
});

// Bare usage ids. Keyboard page (0x07) unless noted; `idxOf` also matches on
// these, so they stay unencoded here.
const U = {
  ESC: 0x29, N1: 0x1e, N2: 0x1f, N3: 0x20, N4: 0x21, N5: 0x22, N6: 0x23, N7: 0x24,
  N8: 0x25, N9: 0x26, N0: 0x27, MINUS: 0x2d, EQUAL: 0x2e, BSPC: 0x2a, TAB: 0x2b,
  Q: 0x14, W: 0x1a, E: 0x08, R: 0x15, T: 0x17, U: 0x18, Y: 0x1c, I: 0x0c, O: 0x12, P: 0x13,
  LBKT: 0x2f, RBKT: 0x30, BSLH: 0x31, CAPS: 0x39, A: 0x04, S: 0x16, D: 0x07,
  F: 0x09, G: 0x0a, H: 0x0b, J: 0x0d, K: 0x0e, L: 0x0f, SEMI: 0x33, SQT: 0x34,
  RET: 0x28, LSHFT: 0xe1, Z: 0x1d, X: 0x1b, C: 0x06, V: 0x19, B_: 0x05, N: 0x11,
  M: 0x10, COMMA: 0x36, DOT: 0x37, SLASH: 0x38, RSHFT: 0xe5, LCTRL: 0xe0,
  LGUI: 0xe3, LALT: 0xe2, SPACE: 0x2c, RALT: 0xe6, RGUI: 0xe7, RCTRL: 0xe4,
  GRAVE: 0x35, F1: 0x3a, F2: 0x3b, F3: 0x3c, F4: 0x3d, F5: 0x3e, F6: 0x3f,
  F7: 0x40, F8: 0x41, F9: 0x42, F10: 0x43, F11: 0x44, F12: 0x45, DEL: 0x4c,
  UP: 0x52, LEFT: 0x50, DOWN: 0x51, RIGHT: 0x4f, PSCRN: 0x46, SCROLL: 0x47,
  PAUSE: 0x48, INS: 0x49, HOME: 0x4a, PG_UP: 0x4b, END: 0x4d, PG_DN: 0x4e,
  NUMLOCK: 0x53, KP_SLASH: 0x54, KP_ASTERISK: 0x55, KP_MINUS: 0x56, KP_PLUS: 0x57,
  KP_ENTER: 0x58, KP_1: 0x59, KP_2: 0x5a, KP_3: 0x5b, KP_4: 0x5c, KP_5: 0x5d,
  KP_6: 0x5e, KP_7: 0x5f, KP_8: 0x60, KP_9: 0x61, KP_0: 0x62, KP_DOT: 0x63,
  MENU: 0x65,
};

// Consumer page (0x0C) — media keys aren't on the keyboard page.
const C = {
  MUTE: 0xe2, VOL_UP: 0xe9, VOL_DN: 0xea,
  PLAY_PAUSE: 0xcd, NEXT: 0xb5, PREV: 0xb6,
};

// Standard 104-key ANSI layout matching KLE format.
// Each row is a flat list of { w (key width in u), u (HID usage, 0 = &trans), h (optional height, default 1) }.
// Negative w values create a visual gap of |w| units.
type RowKey = { w: number; u: number; h?: number };
const K = (u: number, w = 1, h = 1): RowKey => ({ w, u, h });
const GAP = (w: number): RowKey => ({ w: -w, u: -1, h: 0 });

const ROW_DEFS: { y: number; keys: RowKey[] }[] = [
  // F-row: Esc, gap(1), F1-F4, gap(0.5), F5-F8, gap(0.5), F9-F12, gap(0.25), PrtSc ScrLk Pause
  {
    y: 0,
    keys: [
      K(U.ESC), GAP(1), K(U.F1), K(U.F2), K(U.F3), K(U.F4), GAP(0.5),
      K(U.F5), K(U.F6), K(U.F7), K(U.F8), GAP(0.5),
      K(U.F9), K(U.F10), K(U.F11), K(U.F12), GAP(0.25),
      K(U.PSCRN), K(U.SCROLL), K(U.PAUSE),
    ],
  },
  // Number row: ` 1-0 - = Backspace(w:2)  gap(0.25) Ins Home PgUp  gap(0.25) Num / * -
  {
    y: 1.5,
    keys: [
      K(U.GRAVE), K(U.N1), K(U.N2), K(U.N3), K(U.N4), K(U.N5), K(U.N6),
      K(U.N7), K(U.N8), K(U.N9), K(U.N0), K(U.MINUS), K(U.EQUAL), K(U.BSPC, 2),
      GAP(0.25), K(U.INS), K(U.HOME), K(U.PG_UP),
      GAP(0.25), K(U.NUMLOCK), K(U.KP_SLASH), K(U.KP_ASTERISK), K(U.KP_MINUS),
    ],
  },
  // QWERTY row: Tab(w:1.5) Q-P [ ] \(w:1.5)  gap(0.25) Del End PgDn  gap(0.25) 7 8 9 +
  {
    y: 2.5,
    keys: [
      K(U.TAB, 1.5), K(U.Q), K(U.W), K(U.E), K(U.R), K(U.T), K(U.Y),
      K(U.U), K(U.I), K(U.O), K(U.P), K(U.LBKT), K(U.RBKT), K(U.BSLH, 1.5),
      GAP(0.25), K(U.DEL), K(U.END), K(U.PG_DN),
      GAP(0.25), K(U.KP_7), K(U.KP_8), K(U.KP_9), K(U.KP_PLUS, 1, 2),
    ],
  },
  // Home row: Caps(w:1.75) A-L ; ' Enter(w:2.25)  gap(3.5) 4 5 6
  {
    y: 3.5,
    keys: [
      K(U.CAPS, 1.75), K(U.A), K(U.S), K(U.D), K(U.F), K(U.G), K(U.H),
      K(U.J), K(U.K), K(U.L), K(U.SEMI), K(U.SQT), K(U.RET, 2.25),
      GAP(3.5), K(U.KP_4), K(U.KP_5), K(U.KP_6),
    ],
  },
  // Shift row: LShift(w:2.25) Z-M , . / RShift(w:2.75)  gap(1.25) Up  gap(1.25) 1 2 3 Enter
  {
    y: 4.5,
    keys: [
      K(U.LSHFT, 2.25), K(U.Z), K(U.X), K(U.C), K(U.V), K(U.B_), K(U.N),
      K(U.M), K(U.COMMA), K(U.DOT), K(U.SLASH), K(U.RSHFT, 2.75),
      GAP(1.25), K(U.UP), GAP(1.25), K(U.KP_1), K(U.KP_2), K(U.KP_3), K(U.KP_ENTER, 1, 2),
    ],
  },
  // Bottom row: Ctrl(w:1.25) Win(w:1.25) Alt(w:1.25) Space(w:6.25) Alt Win Menu Ctrl  gap(0.25) ←↓→  gap(0.25) 0(w:2) .
  {
    y: 5.5,
    keys: [
      K(U.LCTRL, 1.25), K(U.LGUI, 1.25), K(U.LALT, 1.25),
      K(U.SPACE, 6.25),
      K(U.RALT, 1.25), K(U.RGUI, 1.25), K(U.MENU, 1.25), K(U.RCTRL, 1.25),
      GAP(0.25), K(U.LEFT), K(U.DOWN), K(U.RIGHT),
      GAP(0.25), K(U.KP_0, 2), K(U.KP_DOT),
    ],
  },
];

const LAYOUT_KEYS = (() => {
  const keys: { width: number; height: number; x: number; y: number; r: number; rx: number; ry: number }[] = [];
  for (const { y, keys: rowKeys } of ROW_DEFS) {
    let x = 0;
    for (const { w, u, h } of rowKeys) {
      const width = Math.abs(w);
      const height = (h ?? 1) * 100;
      if (u >= 0) {
        keys.push({ width: width * 100, height, x: x * 100, y: y * 100, r: 0, rx: 0, ry: 0 });
      }
      x += width;
    }
  }
  return keys;
})();

const KEY_COUNT = LAYOUT_KEYS.length;

/*
 * A frame-mounted programmable button (ES60). It is an ordinary per-layer key
 * position — the only thing that makes it special is the `kind`/`label`
 * metadata published via `setDemoKeyMeta`.
 *
 * Parked in the top-right corner: the F-row stops at 18.25u while the number
 * row runs to 22.5u, so this slot is empty and costs the layout no extra
 * bounding box (auto-fit zoom derives its scale from `max(x + width)`).
 */
const SIDE_KEY_ATTRS = { width: 100, height: 100, x: 2150, y: 0, r: 0, rx: 0, ry: 0 };
const SIDE_KEY_POSITION = KEY_COUNT;

// Index of a key position by scanning ROW_DEFS for a usage (first match).
function idxOf(usage: number): number {
  let i = 0;
  for (const { keys: rowKeys } of ROW_DEFS) {
    for (const { u } of rowKeys) {
      if (u < 0) continue;
      if (u === usage) return i;
      i++;
    }
  }
  return -1;
}

// Bindings for one layer, in the exact same positional order as LAYOUT_KEYS.
// `usage` of 0 means &trans; special behaviors are patched in per layer below.
function baseBindings(): { behaviorId: number; param1: number; param2: number }[] {
  const out: { behaviorId: number; param1: number; param2: number }[] = [];
  for (const { keys: rowKeys } of ROW_DEFS) {
    for (const { u } of rowKeys) {
      if (u >= 0) {
        out.push(u > 0 ? KEY(u) : TRANS);
      }
    }
  }
  return out;
}

function buildLayers(): Layer[] {
  const base = baseBindings();

  // Layer 1 — Lower: numbers/symbols on home row, arrows on right hand
  const lower = baseBindings();
  const lo: Record<number, { behaviorId: number; param1: number; param2: number }> = {
    [idxOf(U.A)]: KEY(U.N1), [idxOf(U.S)]: KEY(U.N2), [idxOf(U.D)]: KEY(U.N3),
    [idxOf(U.F)]: KEY(U.N4), [idxOf(U.G)]: KEY(U.N5),
    [idxOf(U.H)]: KEY(U.N6), [idxOf(U.J)]: KEY(U.N7), [idxOf(U.K)]: KEY(U.N8),
    [idxOf(U.L)]: KEY(U.N9), [idxOf(U.SEMI)]: KEY(U.N0),
    [idxOf(U.I)]: KEY(U.UP), [idxOf(U.O)]: KEY(U.DOWN), [idxOf(U.P)]: KEY(U.LEFT), [idxOf(U.LBKT)]: KEY(U.RIGHT),
    [idxOf(U.ESC)]: KEY(U.GRAVE), [idxOf(U.BSPC)]: KEY(U.DEL),
  };
  Object.entries(lo).forEach(([i, b]) => { lower[Number(i)] = b; });

  // Layer 2 — Raise: F-keys, media, nav on left hand
  const raise = baseBindings();
  const ra: Record<number, { behaviorId: number; param1: number; param2: number }> = {
    [idxOf(U.N1)]: KEY(U.F1), [idxOf(U.N2)]: KEY(U.F2), [idxOf(U.N3)]: KEY(U.F3),
    [idxOf(U.N4)]: KEY(U.F4), [idxOf(U.N5)]: KEY(U.F5), [idxOf(U.N6)]: KEY(U.F6),
    [idxOf(U.N7)]: KEY(U.F7), [idxOf(U.N8)]: KEY(U.F8),
    [idxOf(U.N9)]: KEY(U.F9), [idxOf(U.N0)]: KEY(U.F10), [idxOf(U.MINUS)]: KEY(U.F11), [idxOf(U.EQUAL)]: KEY(U.F12),
    [idxOf(U.Q)]: KEY(U.HOME), [idxOf(U.W)]: KEY(U.END), [idxOf(U.E)]: KEY(U.PG_UP), [idxOf(U.R)]: KEY(U.PG_DN),
    [idxOf(U.A)]: CKEY(C.MUTE), [idxOf(U.S)]: CKEY(C.VOL_DN), [idxOf(U.D)]: CKEY(C.VOL_UP),
    [idxOf(U.Z)]: CKEY(C.PREV), [idxOf(U.X)]: CKEY(C.PLAY_PAUSE), [idxOf(U.C)]: CKEY(C.NEXT),
  };
  Object.entries(ra).forEach(([i, b]) => { raise[Number(i)] = b; });

  // Layer 3 — Adjust: bluetooth, system, studio-unlock
  const adjust = baseBindings();
  const ad: Record<number, { behaviorId: number; param1: number; param2: number }> = {
    [idxOf(U.N1)]: { behaviorId: B.bt, param1: 4, param2: 0 },
    [idxOf(U.N2)]: { behaviorId: B.bt, param1: 4, param2: 1 },
    [idxOf(U.N3)]: { behaviorId: B.bt, param1: 4, param2: 2 },
    [idxOf(U.N4)]: { behaviorId: B.bt, param1: 4, param2: 3 },
    [idxOf(U.N5)]: { behaviorId: B.bt, param1: 4, param2: 4 },
    [idxOf(U.GRAVE)]: { behaviorId: B.out, param1: 0, param2: 0 },
    [idxOf(U.TAB)]: { behaviorId: B.bootloader, param1: 0, param2: 0 },
    [idxOf(U.INS)]: { behaviorId: B.sysReset, param1: 0, param2: 0 },
    [idxOf(U.DEL)]: { behaviorId: B.softOff, param1: 0, param2: 0 },
    [idxOf(U.PSCRN)]: { behaviorId: B.studioUnlock, param1: 0, param2: 0 },
  };
  Object.entries(ad).forEach(([i, b]) => { adjust[Number(i)] = b; });

  // Base layer: layer-tap on bottom-row mods
  base[idxOf(U.RALT)] = LT(1, U.LEFT);
  base[idxOf(U.RGUI)] = LT(2, U.RIGHT);
  base[idxOf(U.LALT)] = LT(1, U.UP);
  base[idxOf(U.LGUI)] = LT(2, U.DOWN);
  base[idxOf(U.MENU)] = MO(3);

  return [
    { id: 0, name: "Base", bindings: base },
    { id: 1, name: "Lower", bindings: lower },
    { id: 2, name: "Raise", bindings: raise },
    { id: 3, name: "Adjust", bindings: adjust },
  ];
}

function buildCombos(): ComboConfig[] {
  const base = {
    timeoutMs: 50,
    requirePriorIdleMs: -1,
    slowRelease: false,
    layerMask: 0,
    editableBehavior: true,
    editableKeyPositions: true,
  };
  return [
    /*
     * Slot 0 is the studio unlock shortcut, the keyboard's front door. Firmware
     * reserves it: the trigger keys can be changed but the behavior can't be
     * repointed, which is what stops anyone (Studio included) from deleting the
     * only way back in. A generous timeout because Fn+\ can't be hit by
     * accident while typing — Fn produces no keystroke of its own.
     */
    {
      ...base,
      index: 0,
      behavior: { behaviorId: B.studioUnlock, param1: 0, param2: 0 },
      // Fn + \ — MENU carries `&mo 3` on the base layer, so it stands in for Fn.
      keyPositions: [idxOf(U.MENU), idxOf(U.BSLH)],
      timeoutMs: 200,
      editableBehavior: false,
    },
    { ...base, index: 1, behavior: KEY(U.ESC), keyPositions: [idxOf(U.J), idxOf(U.K)] },
    { ...base, index: 2, behavior: KEY(U.TAB), keyPositions: [idxOf(U.D), idxOf(U.F)] },
    { ...base, index: 3, behavior: undefined, keyPositions: [] },
    { ...base, index: 4, behavior: undefined, keyPositions: [] },
  ];
}

const BEHAVIOR_NAMES: Record<number, string> = {
  [B.kp]: "Key Press",
  [B.mt]: "Mod-Tap",
  [B.lt]: "Layer-Tap",
  [B.mo]: "Momentary Layer",
  [B.trans]: "Transparent",
  [B.none]: "None",
  [B.studioUnlock]: "Studio Unlock",
  [B.sysReset]: "Reset",
  [B.bootloader]: "Bootloader",
  [B.bt]: "Bluetooth",
  [B.out]: "Output Select",
  [B.softOff]: "Soft Off",
  [B.capsWord]: "Caps Word",
};

// Which features the demo firmware advertises. Each maps to a Studio panel or
// subsystem, so toggling one changes what the UI offers (and lets people see
// how ZMK Studio degrades on less-capable firmware).
export interface DemoFeatures {
  combos: boolean;      // combos subsystem + reserved slots
  holdTap: boolean;     // hold-tap runtime configs in the Behaviors panel
  lighting: boolean;    // RGB underglow / backlight subsystem
  sideKey: boolean;     // a frame-mounted programmable key position (ES60)
  motion: boolean;      // IMU: case-tap action + walk-detect lock (PH60SCV2EVO)
}

export const DEFAULT_DEMO_FEATURES: DemoFeatures = {
  combos: true,
  holdTap: true,
  lighting: true,
  sideKey: true,
  motion: true,
};

// In-memory demo firmware: answers the RPCs ZMK Studio issues during connect
// and while browsing the panels. State (keymap/combos) lives only for the
// session — nothing is persisted.
class DemoFirmware {
  layers: Layer[];
  combos = buildCombos();
  availableLayers = 5;
  unsaved = false;
  features: DemoFeatures;

  constructor(features: DemoFeatures) {
    this.features = features;
    this.layers = this.freshLayers();
  }

  /*
   * The frame button is just one more position appended to every layer's
   * bindings — nothing about it needs a separate code path, which is the whole
   * argument for keeping it in the keymap instead of its own subsystem.
   */
  private freshLayers(): Layer[] {
    const layers = buildLayers();
    if (!this.features.sideKey) return layers;
    return layers.map((layer, i) => ({
      ...layer,
      bindings: [
        ...layer.bindings,
        i === 0 ? { behaviorId: B.bt, param1: 0, param2: 0 } : TRANS,
      ],
    }));
  }

  private layoutKeys() {
    return this.features.sideKey ? [...LAYOUT_KEYS, SIDE_KEY_ATTRS] : LAYOUT_KEYS;
  }

  handle(req: Request): Response | null {
    const r = req.requestId;
    const respond = (subsystem: Omit<RequestResponse, "requestId">): Response => ({
      requestResponse: { requestId: r, ...subsystem },
    });

    if (req.core) {
      const c = req.core;
      if (c.getDeviceInfo) {
        return respond({ core: { getDeviceInfo: { name: "Demo Keyboard", serialNumber: new Uint8Array([0xde, 0xad, 0xbe, 0xef]) } } });
      }
      if (c.getLockState) {
        return respond({
          core: { getLockState: LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED },
        });
      }
      if (c.resetSettings) {
        this.layers = this.freshLayers();
        this.combos = buildCombos();
        this.unsaved = false;
        return respond({ core: { resetSettings: true } });
      }
    }

    if (req.keymap) {
      const k = req.keymap;
      if (k.getKeymap) {
        return respond({ keymap: { getKeymap: { layers: this.layers, availableLayers: this.availableLayers, maxLayerNameLength: 16 } } });
      }
      if (k.getPhysicalLayouts) {
        return respond({ keymap: { getPhysicalLayouts: { activeLayoutIndex: 0, layouts: [{ name: "Demo 60%", keys: this.layoutKeys() }] } } });
      }
      if (k.checkUnsavedChanges) {
        return respond({ keymap: { checkUnsavedChanges: this.unsaved } });
      }
      if (k.saveChanges) {
        this.unsaved = false;
        return respond({ keymap: { saveChanges: { ok: true } } });
      }
      if (k.discardChanges) {
        this.unsaved = false;
        return respond({ keymap: { discardChanges: true } });
      }
      if (k.setLayerBinding) {
        const { layerId, keyPosition, binding } = k.setLayerBinding;
        const layer = this.layers.find((l) => l.id === layerId);
        if (layer && binding && keyPosition >= 0 && keyPosition < layer.bindings.length) {
          layer.bindings[keyPosition] = binding;
          this.unsaved = true;
          return respond({ keymap: { setLayerBinding: 0 } });
        }
        return respond({ keymap: { setLayerBinding: 1 } });
      }
      if (k.setLayerProps) {
        const layer = this.layers.find((l) => l.id === k.setLayerProps?.layerId);
        if (layer && k.setLayerProps.name !== undefined) {
          layer.name = k.setLayerProps.name;
          this.unsaved = true;
          return respond({ keymap: { setLayerProps: 0 } });
        }
        return respond({ keymap: { setLayerProps: 1 } });
      }
    }

    if (req.behaviors) {
      const b = req.behaviors;
      if (b.listAllBehaviors) {
        return respond({ behaviors: { listAllBehaviors: { behaviors: Object.keys(BEHAVIOR_NAMES).map(Number) } } });
      }
      if (b.getBehaviorDetails) {
        const id = b.getBehaviorDetails.behaviorId;
        if (BEHAVIOR_NAMES[id]) {
          // Provide metadata so isHoldTapShape() recognises Mod-Tap / Layer-Tap.
          // Protobuf requires { name, hidUsage?: { keyboardMax, consumerMax }, layerId?: {} }
          const hidMeta = { keyboardMax: 255, consumerMax: 65535 };
          const layerMeta = {};
          const meta: { param1: { name: string; hidUsage?: { keyboardMax: number; consumerMax: number }; layerId?: {} }[]; param2: { name: string; hidUsage?: { keyboardMax: number; consumerMax: number }; layerId?: {} }[] }[] = [];
          if (id === B.mt) {
            meta.push({ param1: [{ name: "mod", hidUsage: hidMeta }], param2: [{ name: "key", hidUsage: hidMeta }] });
          } else if (id === B.lt) {
            meta.push({ param1: [{ name: "layer", layerId: layerMeta }], param2: [{ name: "key", hidUsage: hidMeta }] });
          }
          return respond({ behaviors: { getBehaviorDetails: { id, displayName: BEHAVIOR_NAMES[id], metadata: meta } } });
        }
      }
      if (b.getBehaviorConfig) {
        // holdTap disabled → no editable config, so the panel shows read-only.
        const cfg: Record<string, unknown> = { behaviorId: b.getBehaviorConfig.behaviorId };
        if (this.features.holdTap) {
          cfg.holdTap = {
            tappingTermMs: 200,
            requirePriorIdleMs: -1,
            quickTapMs: 0,
            flavor: 0,
            retroTap: false,
            holdWhileUndecided: false,
            holdWhileUndecidedLinger: false,
            holdTriggerOnRelease: false,
          };
        }
        return respond({ behaviors: { getBehaviorConfig: cfg as never } });
      }
      if (b.setBehaviorConfig) {
        return respond({ behaviors: { setBehaviorConfig: this.features.holdTap } });
      }
    }

    if (req.combos) {
      if (!this.features.combos) {
        return { requestResponse: { requestId: r, meta: { noResponse: true } } };
      }
      const c = req.combos;
      if (c.listAllCombos) {
        return respond({ combos: { listAllCombos: { combos: this.combos } } });
      }
      if (c.getCombo) {
        const found = this.combos.find((x) => x.index === c.getCombo?.index);
        if (found) return respond({ combos: { getCombo: found } });
      }
      if (c.setCombo?.combo) {
        const idx = c.setCombo.index;
        const i = this.combos.findIndex((x) => x.index === idx);
        if (i >= 0) {
          this.combos[i] = { ...c.setCombo.combo, index: idx, editableBehavior: true, editableKeyPositions: true };
          this.unsaved = true;
          return respond({ combos: { setCombo: { ok: true } } });
        }
        return respond({ combos: { setCombo: { err: 2 } } });
      }
    }

    if (req.lighting) {
      if (!this.features.lighting) {
        return { requestResponse: { requestId: r, meta: { noResponse: true } } };
      }
      const l = req.lighting;
      if (l.getRgbUnderglowState) {
        return respond({ lighting: { getRgbUnderglowState: { on: true, color: { h: 0, s: 0, b: 80 }, effect: 0, speed: 3, effectCount: 1, effectNames: ["Solid"] } } });
      }
      if (l.getBacklightState) {
        return respond({ lighting: { getBacklightState: { on: false, brightness: 60 } } });
      }
      if (l.getLayerLedColors) {
        // Generate mock LED data: one binding per key position, with a simple
        // gradient-like color scheme so the canvas renders every key.
        const bindings: { keyPosition: number; color: number }[] = [];
        for (let i = 0; i < KEY_COUNT; i++) {
          // Assign a visible color so keys appear on the LED canvas.
          // Use a rainbow-ish pattern: hue cycles, constant saturation/brightness.
          const hue = Math.round((i / KEY_COUNT) * 360);
          const r = hue < 120 ? 255 : hue < 240 ? 0 : 255;
          const g = hue < 120 ? Math.round(((hue) / 120) * 255) : hue < 240 ? 255 : Math.round(((360 - hue) / 120) * 255);
          const b = hue < 120 ? 0 : hue < 240 ? Math.round(((hue - 120) / 120) * 255) : 255;
          bindings.push({ keyPosition: i, color: (r << 16) | (g << 8) | b });
        }
        // Matrix keys only — the frame button has no LED behind it.
        return respond({ lighting: { getLayerLedColors: { layers: [{ layerId: 0, bindings }], keyCount: KEY_COUNT, layerCount: this.layers.length, enabled: true } } });
      }
      if (l.getCapsLockIndicator) {
        return respond({ lighting: { getCapsLockIndicator: { enabled: false, offColor: 0, onColor: 0, keyPosition: 0, layerId: 0 } } });
      }
      if (l.getConnectionIndicator) {
        return respond({ lighting: { getConnectionIndicator: { enabled: false, usbColor: 0, btColor: 0, keyPosition: 0, layerId: 0 } } });
      }
      if (l.setRgbUnderglowState) return respond({ lighting: { setRgbUnderglowState: true } });
      if (l.setBacklightState) return respond({ lighting: { setBacklightState: true } });
      if (l.saveState) return respond({ lighting: { saveState: true } });
      if (l.saveLayerLedState) return respond({ lighting: { saveLayerLedState: true } });
      if (l.setLayerLedBinding) return respond({ lighting: { setLayerLedBinding: true } });
      if (l.setLayerLedEnabled) return respond({ lighting: { setLayerLedEnabled: true } });
      if (l.setCapsLockIndicator) return respond({ lighting: { setCapsLockIndicator: true } });
      if (l.setConnectionIndicator) return respond({ lighting: { setConnectionIndicator: true } });
      return { requestResponse: { requestId: r, meta: { noResponse: true } } };
    }

    // Unknown / unsupported request: no_response meta so call_rpc rejects cleanly.
    return { requestResponse: { requestId: r, meta: { noResponse: true } } };
  }
}

// Demo transport: a loopback RpcTransport backed by an in-memory firmware, so
// people without a keyboard can try ZMK Studio. Requests written to `writable`
// are deframed, answered by the demo model, and pushed back on `readable`.
export function connect(features: DemoFeatures = DEFAULT_DEMO_FEATURES): Promise<RpcTransport> {
  const fw = new DemoFirmware(features);
  const abortController = new AbortController();

  /*
   * Two features are served beside the transport rather than through it: the
   * generated protobuf codec drops fields it doesn't know, so neither the
   * `motion` subsystem nor the `kind`/`label` key attributes can survive a
   * round trip until the ts-client fork is regenerated. Both move inside once
   * it is.
   */
  setDemoMotionEnabled(features.motion);
  setDemoKeyMeta(
    features.sideKey ? { [SIDE_KEY_POSITION]: { kind: "side", label: "Side" } } : {}
  );

  let readableController!: ReadableStreamDefaultController<Uint8Array>;
  const readable = new ReadableStream<Uint8Array>({
    start: (c) => {
      readableController = c;
    },
    cancel: () => {},
  });

  const emit = (resp: Response) => {
    const bytes = Response.encode(resp).finish();
    const framed: number[] = [FRAMING_SOF];
    for (const b of bytes) {
      if (b === FRAMING_SOF || b === FRAMING_ESC || b === FRAMING_EOF) framed.push(FRAMING_ESC);
      framed.push(b);
    }
    framed.push(FRAMING_EOF);
    readableController.enqueue(new Uint8Array(framed));
  };

  // Accumulate a deframed request byte stream; on each EOF, decode + answer.
  let inFrame = false;
  let escaped = false;
  let buf: number[] = [];
  const feed = (b: number) => {
    if (!inFrame) {
      if (b === FRAMING_SOF) {
        inFrame = true;
        buf = [];
      }
      return;
    }
    if (escaped) {
      buf.push(b);
      escaped = false;
      return;
    }
    if (b === FRAMING_ESC) {
      escaped = true;
      return;
    }
    if (b === FRAMING_EOF) {
      inFrame = false;
      try {
        const resp = fw.handle(Request.decode(new Uint8Array(buf)));
        if (resp) emit(resp);
      } catch (e) {
        console.error("Demo transport decode failed", e);
      }
      return;
    }
    buf.push(b);
  };

  const writable = new WritableStream<Uint8Array>({
    write: (chunk) => {
      for (const b of chunk) feed(b);
    },
    close: () => readableController.close(),
    abort: () => readableController.close(),
  });

  abortController.signal.addEventListener("abort", () => {
    try {
      readableController.close();
    } catch {}
  });

  return Promise.resolve({ label: "Demo", abortController, readable, writable });
}
