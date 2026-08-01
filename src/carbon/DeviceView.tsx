import { useState } from "react";
import { Cpu, RotateCcw } from "lucide-react";

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
  onResetSettings: () => void;
}

export function DeviceView({
  model, th, t, deviceName, serial, unlockPaths, combos, applyCombo, onResetSettings,
}: DeviceViewProps) {
  /*
   * The two slots are snapshotted on entry rather than re-derived: writing the
   * probe binding makes the borrowed slot stop looking spare, which would tear
   * the flow down halfway through its own test.
   */
  const [unlockEdit, setUnlockEdit] = useState<
    { unlockCombo: ComboConfig; spareCombo: ComboConfig } | null
  >(null);

  const rows: [string, string][] = [
    [t("carbon.deviceName", "Device name"), deviceName],
    ...(serial ? [[t("carbon.serialNumber", "Serial number"), serial] as [string, string]] : []),
    [t("carbon.layoutCount", "Physical layouts"), String(model.layouts?.length ?? 0)],
    [t("carbon.layerCount", "Layers"), String(model.keymap?.layers.length ?? 0)],
  ];

  // Only the reserved slot can be re-triggered, and only with a spare slot to
  // borrow for the confirmation step.
  const editableUnlockCombo = unlockPaths.combos.find(
    (p) => p.combo.editableKeyPositions
  )?.combo;
  const spareCombo = findSpareComboSlot(combos, unlockPaths.behaviorId);
  const canChangeUnlock = !!editableUnlockCombo && !!spareCombo;

  if (unlockEdit) {
    return (
      <UnlockChangeFlow
        th={th} t={t}
        unlockCombo={unlockEdit.unlockCombo}
        spareCombo={unlockEdit.spareCombo}
        allCombos={combos}
        keymap={model.keymap}
        behaviors={model.behaviors}
        layout={model.layouts?.[model.selectedPhysicalLayoutIndex]}
        scale={model.keymapScale}
        setScale={model.setKeymapScale}
        otherPathCount={unlockPaths.total}
        applyCombo={applyCombo}
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

      {/* Two columns where there's room, stacked when there isn't. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 32, alignItems: "start", maxWidth: 1180 }}>
        <div style={{ minWidth: 0 }}>
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

          <div style={{ paddingTop: 20 }}>
            <button onClick={onResetSettings} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", fontSize: 13, background: "transparent", color: th.error, border: `1px solid ${th.error}`, cursor: "pointer", fontFamily: "var(--font-sans)" }}>
              <RotateCcw size={14} />{t("carbon.factoryReset", "Restore stock settings")}
            </button>
          </div>
        </div>

        <div style={{ minWidth: 0 }}>
          <UnlockPanel th={th} t={t} paths={unlockPaths}
            canChange={canChangeUnlock}
            noSpareSlot={!!editableUnlockCombo && !spareCombo}
            onChange={() => {
              if (editableUnlockCombo && spareCombo) {
                setUnlockEdit({ unlockCombo: editableUnlockCombo, spareCombo });
              }
            }} />
        </div>
      </div>
    </div>
  );
}
