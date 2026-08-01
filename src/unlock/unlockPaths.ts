import type { ComboConfig } from "@zmkfirmware/zmk-studio-ts-client/combos";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import type { Keymap } from "@zmkfirmware/zmk-studio-ts-client/keymap";

import { shortHidLabel } from "../combos/comboUtils";

type BehaviorMap = Record<number, GetBehaviorDetailsResponse>;

/*
 * Studio can lock a keyboard (`core.lock`) but there is deliberately no unlock
 * RPC — unlocking has to be a physical action so a malicious host can't do it.
 * That makes the unlock binding the one piece of keymap the user must never be
 * able to delete: without it the keyboard can never be edited again, and
 * `core.resetSettings` is no escape hatch because it too requires being
 * unlocked.
 *
 * So Studio's job here is (a) find every way this keyboard can be unlocked,
 * (b) show the user what it is, (c) refuse any edit that would take the count
 * to zero. Firmware backs (c) up on the reserved combo slot by reporting
 * `editableBehavior: false`, which is the authoritative guard — a different
 * client could ignore ours.
 */

/**
 * `GetBehaviorDetailsResponse` carries no stable identifier, only `id` (a local
 * id that varies per firmware build) and `displayName`. Matching on the display
 * name is what the rest of the app does too (see `summarizeBinding` and the
 * keycap renderer), but it breaks if the name is ever changed or localized —
 * worth a stable `identifier` field in the behaviors proto.
 */
export const STUDIO_UNLOCK_BEHAVIOR_NAME = "Studio Unlock";

/**
 * The gesture our firmware ships with. Needed because nothing about the
 * keyboard is readable while it is locked, so the unlock prompt has no way to
 * show the real one on a first connection — see docs/unlock-combo.md.
 */
export const FACTORY_UNLOCK_KEYS = ["Fn", "\\"];

export function findUnlockBehaviorId(behaviors: BehaviorMap): number | undefined {
  for (const details of Object.values(behaviors)) {
    if (details.displayName === STUDIO_UNLOCK_BEHAVIOR_NAME) return details.id;
  }
  return undefined;
}

export interface UnlockComboPath {
  combo: ComboConfig;
  keyLabels: string[];
  /** Firmware refuses to let the slot be repointed away from studio unlock. */
  protectedByFirmware: boolean;
}

export interface UnlockKeymapPath {
  layerIndex: number;
  layerName: string;
  keyPosition: number;
}

export interface UnlockPaths {
  /** Undefined when the firmware doesn't expose a studio unlock behavior. */
  behaviorId?: number;
  combos: UnlockComboPath[];
  keymap: UnlockKeymapPath[];
  /** Every way this keyboard can be unlocked; must never reach zero. */
  total: number;
}

export function collectUnlockPaths(
  behaviors: BehaviorMap,
  keymap: Keymap | undefined,
  combos: ComboConfig[]
): UnlockPaths {
  const behaviorId = findUnlockBehaviorId(behaviors);
  if (behaviorId === undefined) {
    return { behaviorId: undefined, combos: [], keymap: [], total: 0 };
  }

  const comboPaths: UnlockComboPath[] = combos
    .filter((c) => c.behavior?.behaviorId === behaviorId && c.keyPositions.length > 0)
    .map((combo) => ({
      combo,
      keyLabels: combo.keyPositions.map((p) => unlockKeyLabel(p, keymap, behaviors)),
      protectedByFirmware: !combo.editableBehavior,
    }));

  const keymapPaths: UnlockKeymapPath[] = [];
  keymap?.layers.forEach((layer, layerIndex) => {
    layer.bindings.forEach((binding, keyPosition) => {
      if (binding.behaviorId === behaviorId) {
        keymapPaths.push({
          layerIndex,
          layerName: layer.name || `Layer ${layerIndex}`,
          keyPosition,
        });
      }
    });
  });

  return {
    behaviorId,
    combos: comboPaths,
    keymap: keymapPaths,
    total: comboPaths.length + keymapPaths.length,
  };
}

/*
 * Verifying a candidate gesture: bind it to an otherwise unused keystroke in a
 * spare slot and watch for that keystroke arriving at the host. Studio observes
 * host keystrokes (that's how the key tester works) but never key *positions*,
 * and a layer key emits nothing at all — so the gesture can't be captured by
 * watching the user press it, only confirmed after the fact.
 *
 * The point of going through a spare slot is that the keyboard is never locked
 * during the test, so a gesture the user turns out not to be able to perform
 * strands nobody.
 */
export const PROBE_KEY = {
  /** `KeyboardEvent.code` we listen for. */
  code: "F13",
  /** HID keyboard page id for F13. */
  hidId: 0x68,
  label: "F13",
};

/** An unused, fully editable slot the probe binding can borrow. */
export function findSpareComboSlot(
  combos: ComboConfig[],
  unlockBehaviorId: number | undefined
): ComboConfig | undefined {
  return combos.find(
    (c) =>
      c.editableBehavior &&
      c.editableKeyPositions &&
      c.keyPositions.length === 0 &&
      c.behavior?.behaviorId !== unlockBehaviorId
  );
}

/** Combos already using exactly these keys, which would fight the new gesture. */
export function conflictingCombos(
  combos: ComboConfig[],
  positions: number[],
  exceptIndex: number
): ComboConfig[] {
  const key = [...positions].sort((a, b) => a - b).join(",");
  return combos.filter(
    (c) =>
      c.index !== exceptIndex &&
      c.keyPositions.length > 0 &&
      [...c.keyPositions].sort((a, b) => a - b).join(",") === key
  );
}

/**
 * Whether a gesture is safe to leave without a prior-idle requirement.
 *
 * A chord of ordinary letters can fire in the middle of normal typing, which
 * would unlock the keyboard behind the user's back. One layer or modifier key in
 * the chord makes that impossible, since those don't appear in typed text.
 */
export function gestureResistsTyping(
  positions: number[],
  keymap: Keymap | undefined,
  behaviors: BehaviorMap
): boolean {
  const SAFE = new Set([
    "Momentary Layer", "Toggle Layer", "To Layer", "Sticky Layer", "Layer-Tap",
  ]);
  return positions.some((p) => {
    const binding = keymap?.layers[0]?.bindings[p];
    if (!binding) return false;
    const name = behaviors[binding.behaviorId]?.displayName;
    if (name && SAFE.has(name)) return true;
    // Modifiers live at 0xE0-0xE7 on the HID keyboard page.
    if (name === "Key Press" || name === "Mod-Tap") {
      const id = binding.param1 & 0xffff;
      return id >= 0xe0 && id <= 0xe7;
    }
    return false;
  });
}

/** Prior-idle applied when a gesture could otherwise fire mid-typing. */
export const TYPING_GUARD_IDLE_MS = 200;

/**
 * Short label for the key at a position, for rendering a gesture as chips.
 *
 * Read off the base layer, since that's what the user's fingers see. Layer keys
 * can only be described by their target ("L1") — the physical legend ("Fn")
 * isn't in the protocol at all, which is the same gap the proposed
 * `KeyPhysicalAttrs.label` field would close.
 */
export function unlockKeyLabel(
  position: number,
  keymap: Keymap | undefined,
  behaviors: BehaviorMap
): string {
  const binding = keymap?.layers[0]?.bindings[position];
  if (!binding) return `#${position}`;

  const name = behaviors[binding.behaviorId]?.displayName;
  switch (name) {
    case "Key Press":
      return shortHidLabel(binding.param1);
    case "Mod-Tap":
    case "Layer-Tap":
      return shortHidLabel(binding.param2);
    case "Momentary Layer":
    case "Toggle Layer":
    case "To Layer":
    case "Sticky Layer":
      return `L${binding.param1}`;
    case undefined:
      return `#${position}`;
    default:
      return name;
  }
}
