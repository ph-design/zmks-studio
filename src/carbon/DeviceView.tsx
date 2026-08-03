import { useEffect, useRef, useState } from "react";
import { Check, Cpu, Loader, RotateCcw } from "lucide-react";

import type { ComboConfig } from "@zmkfirmware/zmk-studio-ts-client/combos";

import type { CarbonTheme } from "./theme";
import { useKeyboardModel } from "./useKeyboardModel";
import { PhysicalLayoutPicker } from "../keyboard/PhysicalLayoutPicker";
import { SettingsBlock } from "./CarbonChrome";
import { UnlockPanel } from "../unlock/UnlockPanel";
import { UnlockChangeFlow } from "../unlock/UnlockChangeFlow";
import { findSpareComboSlot, type UnlockPaths } from "../unlock/unlockPaths";

/*
 * What lives on the keyboard: identity, active layout, unlock shortcut and
 * factory reset. Everything here issues an RPC — app-level settings belong in
 * PreferencesView.
 */
interface DeviceViewProps {
  model: ReturnType<typeof useKeyboardModel>;
  th: CarbonTheme;
  t: (k: string, d: string) => string;
  deviceName: string;
  serial?: string;
  unlockPaths: UnlockPaths;
  combos: ComboConfig[];
  applyCombo: (cfg: ComboConfig) => Promise<boolean>;
  readCombo: (index: number) => Promise<ComboConfig | null>;
  /** Same save the header runs; the unlock flow offers it inline. */
  onSaveToKeyboard?: () => Promise<boolean> | void;
  onResetSettings: () => Promise<boolean> | void;
}

export function DeviceView({
  model, th, t, deviceName, serial, unlockPaths, combos, applyCombo, readCombo,
  onSaveToKeyboard, onResetSettings,
}: DeviceViewProps) {
  /*
   * The two slots are snapshotted on entry rather than re-derived: writing the
   * probe binding makes the borrowed slot stop looking spare, which would tear
   * the flow down halfway through its own test.
   */
  const [unlockEdit, setUnlockEdit] = useState<
    { mode: "change" | "create"; unlockCombo?: ComboConfig; spareCombo: ComboConfig } | null
  >(null);

  const rows: [string, string][] = [
    [t("carbon.deviceName", "Device name"), deviceName],
    ...(serial ? [[t("carbon.serialNumber", "Serial number"), serial] as [string, string]] : []),
    [t("carbon.layoutCount", "Physical layouts"), String(model.layouts?.length ?? 0)],
    [t("carbon.layerCount", "Layers"), String(model.keymap?.layers.length ?? 0)],
  ];

  /*
   * Two shapes, both needing one free slot to confirm the gesture with:
   * re-trigger an existing unlock combo, or — the usual case, since firmware
   * ships its factory gesture as a keymap binding rather than a combo — turn a
   * free slot into one.
   */
  const editableUnlockCombo = unlockPaths.combos.find(
    (p) => p.combo.editableKeyPositions
  )?.combo;
  const spareCombo = findSpareComboSlot(combos, unlockPaths.behaviorId);
  const unlockMode: "change" | "create" | null = !spareCombo
    ? null
    : editableUnlockCombo
      ? "change"
      : unlockPaths.behaviorId !== undefined
        ? "create"
        : null;

  if (unlockEdit) {
    return (
      <UnlockChangeFlow
        th={th} t={t}
        mode={unlockEdit.mode}
        unlockCombo={unlockEdit.unlockCombo}
        spareCombo={unlockEdit.spareCombo}
        unlockBehaviorId={unlockPaths.behaviorId ?? -1}
        allCombos={combos}
        keymap={model.keymap}
        behaviors={model.behaviors}
        layout={model.layouts?.[model.selectedPhysicalLayoutIndex]}
        scale={model.keymapScale}
        setScale={model.setKeymapScale}
        otherPathCount={unlockPaths.total}
        applyCombo={applyCombo}
        readCombo={readCombo}
        onSaveToKeyboard={onSaveToKeyboard}
        onClose={() => setUnlockEdit(null)}
      />
    );
  }

  return (
    <div style={{ flex: 1, overflow: "auto", padding: 24 }} className="custom-scrollbar">
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <div style={{ width: 48, height: 48, background: th.layer2, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Cpu size={24} style={{ color: th.interactive }} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 600, color: th.textPrimary }}>{deviceName}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3, fontSize: 12, color: th.success }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: th.success }} />
            {t("carbon.statusConnected", "Device connected")}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 720 }}>
        <div style={{ border: `1px solid ${th.border}` }}>
          {rows.map(([k, v], i) => (
            <div key={k} style={{ display: "flex", padding: "10px 16px", borderBottom: i < rows.length - 1 ? `1px solid ${th.border}` : "none", background: i % 2 === 0 ? th.layer1 : th.bg }}>
              <span style={{ width: 140, fontSize: 13, color: th.textHelper, flexShrink: 0 }}>{k}</span>
              <span style={{ fontSize: 13, color: th.textPrimary, fontFamily: "var(--font-mono)", minWidth: 0, wordBreak: "break-all" }}>{v}</span>
            </div>
          ))}
        </div>

        {model.layouts && model.layouts.length > 1 &&
          <SettingsBlock th={th} label={t("carbon.activeLayout", "Active layout")}>
            <PhysicalLayoutPicker layouts={model.layouts} selectedPhysicalLayoutIndex={model.selectedPhysicalLayoutIndex} onPhysicalLayoutClicked={model.doSelectPhysicalLayout} />
          </SettingsBlock>
        }

        <UnlockPanel th={th} t={t} paths={unlockPaths}
          mode={unlockMode}
          noSpareSlot={!spareCombo && unlockPaths.behaviorId !== undefined}
          onChange={() => {
            if (!spareCombo || !unlockMode) return;
            setUnlockEdit({
              mode: unlockMode,
              unlockCombo: unlockMode === "change" ? editableUnlockCombo : undefined,
              spareCombo,
            });
          }} />

        <div style={{ paddingTop: 20 }}>
          <ResetButton th={th} t={t} onReset={onResetSettings} />
        </div>
      </div>
    </div>
  );
}

/*
 * Factory reset, in three states.
 *
 * The confirmation is the button turning into itself-but-committed rather than a
 * dialog: the action is one click either way, and a modal for it would be more
 * ceremony than the rest of this page uses. Carbon's danger button is the solid
 * red one, so the armed state is exactly that — the colour is the warning.
 *
 * The busy state matters as much as the confirmation. On hardware this takes long
 * enough that an unchanged button reads as "didn't work", and the obvious response
 * is to click it again.
 */
function ResetButton({ th, t, onReset }: {
  th: CarbonTheme;
  t: (k: string, d: string) => string;
  onReset: () => Promise<boolean> | void;
}) {
  const [state, setState] = useState<"idle" | "armed" | "working" | "done">("idle");
  const doneTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(doneTimer.current), []);

  // Don't leave it armed indefinitely — a red button left over from a click a
  // minute ago is a trap.
  useEffect(() => {
    if (state !== "armed") return;
    const id = setTimeout(() => setState("idle"), 6000);
    return () => clearTimeout(id);
  }, [state]);

  /*
   * A successful reset makes the app refetch everything from the keyboard, which
   * unmounts this button — so the "done" state is usually never seen, and doesn't
   * need to be. What matters is that "working" is on screen for however long the
   * RPC takes, with the button disabled so a second click can't land.
   */
  const run = async () => {
    setState("working");
    try {
      await onReset();
    } finally {
      setState("done");
      doneTimer.current = setTimeout(() => setState("idle"), 2500);
    }
  };

  const base: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 8, padding: "10px 16px",
    fontSize: 13, fontFamily: "var(--font-sans)", border: `1px solid ${th.error}`,
  };

  if (state === "working" || state === "done") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
        <button disabled
          style={{ ...base, background: th.error, color: "#fff", borderColor: th.error, cursor: "default", opacity: 0.85 }}>
          {state === "working"
            ? <Loader size={14} style={{ animation: "circular-rotate 1s linear infinite" }} />
            : <Check size={14} />}
          {state === "working"
            ? t("carbon.resetWorking", "Restoring…")
            : t("carbon.resetDone", "Settings restored")}
        </button>
        {state === "working" && (
          <span style={{ fontSize: 12, color: th.textHelper }}>
            {t("carbon.resetWorkingHint", "This can take a few seconds — don't unplug the keyboard.")}
          </span>
        )}
      </div>
    );
  }

  if (state === "armed") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={run} autoFocus
            style={{ ...base, background: th.error, color: "#fff", cursor: "pointer", fontWeight: 500 }}>
            <RotateCcw size={14} />{t("carbon.resetConfirm", "Click again to erase everything")}
          </button>
          <button onClick={() => setState("idle")}
            style={{ ...base, background: "transparent", color: th.textSecondary, borderColor: th.borderStrong, cursor: "pointer" }}>
            {t("common.cancel", "Cancel")}
          </button>
        </div>
        <span style={{ fontSize: 12, color: th.textHelper, maxWidth: 460, lineHeight: 1.5 }}>
          {t("carbon.resetConfirmHint", "Your keymap, combos and lighting all go back to how the firmware shipped. This can't be undone from Studio.")}
        </span>
      </div>
    );
  }

  return (
    <button onClick={() => setState("armed")}
      style={{ ...base, background: "transparent", color: th.error, cursor: "pointer" }}>
      <RotateCcw size={14} />{t("carbon.factoryReset", "Restore stock settings")}
    </button>
  );
}
