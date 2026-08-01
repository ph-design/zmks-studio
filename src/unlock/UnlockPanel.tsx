import { KeyRound, ShieldCheck, AlertTriangle, Pencil } from "lucide-react";

import type { CarbonTheme } from "../carbon/theme";
import { GestureChips } from "./GestureChips";
import type { UnlockPaths } from "./unlockPaths";

/*
 * How this keyboard can be unlocked. Changing the gesture hands off to
 * UnlockChangeFlow, which proves the new one works before giving up the old —
 * see docs/unlock-combo.md.
 */
export function UnlockPanel({ th, t, paths, canChange, noSpareSlot, onChange }: {
  th: CarbonTheme;
  t: (k: string, d: string) => string;
  paths: UnlockPaths;
  canChange?: boolean;
  /** Re-triggering needs a free slot to borrow while confirming the gesture. */
  noSpareSlot?: boolean;
  onChange?: () => void;
}) {
  const rowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    borderBottom: `1px solid ${th.border}`,
  };

  return (
    <div style={{ padding: "16px 0", borderBottom: `1px solid ${th.border}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <KeyRound size={15} style={{ color: th.interactive }} />
        <span style={{ fontSize: 14, color: th.textPrimary, fontWeight: 500 }}>
          {t("unlockPanel.title", "Unlock shortcut")}
        </span>
      </div>
      <p style={{ fontSize: 12, color: th.textHelper, marginBottom: 10, lineHeight: 1.6 }}>
        {t("unlockPanel.desc", "The keyboard locks itself so a web page can't change your keymap without you. Unlocking is always a physical action — Studio cannot do it remotely.")}
      </p>

      {paths.total === 0 ? (
        <div style={{ display: "flex", gap: 10, padding: "10px 14px", background: th.layer1, border: `1px solid ${th.border}`, borderLeft: `3px solid ${th.error}` }}>
          <AlertTriangle size={16} style={{ color: th.error, flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontSize: 13, color: th.textPrimary, fontWeight: 500 }}>
              {t("unlockPanel.noneTitle", "No unlock shortcut found")}
            </div>
            <div style={{ fontSize: 12, color: th.textHelper, marginTop: 2, lineHeight: 1.5 }}>
              {t("unlockPanel.noneDesc", "This firmware exposes no studio unlock binding. Once the keyboard locks, Studio won't be able to edit it again — reflash before locking it.")}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ border: `1px solid ${th.border}` }}>
          {paths.combos.map(({ combo, keyLabels, protectedByFirmware }) => (
            <div key={`combo-${combo.index}`} style={rowStyle}>
              <span style={{ width: 92, flexShrink: 0, fontSize: 12, color: th.textHelper }}>
                {t("unlockPanel.viaCombo", "Combo")}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <GestureChips keys={keyLabels} />
              </span>
              {protectedByFirmware && (
                <span title={t("unlockPanel.protectedHint", "Firmware reserves this slot for unlocking, so it can't be repointed at another behavior.")}
                  style={{ display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0, fontSize: 11, color: th.success }}>
                  <ShieldCheck size={13} />{t("unlockPanel.protected", "Protected")}
                </span>
              )}
            </div>
          ))}
          {paths.keymap.map((p) => (
            <div key={`keymap-${p.layerIndex}-${p.keyPosition}`} style={rowStyle}>
              <span style={{ width: 92, flexShrink: 0, fontSize: 12, color: th.textHelper }}>
                {t("unlockPanel.viaKeymap", "Keymap")}
              </span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: th.textPrimary, fontFamily: "var(--font-mono)" }}>
                #{p.keyPosition} · {p.layerName}
              </span>
            </div>
          ))}
        </div>
      )}

      {canChange && (
        <div style={{ marginTop: 12 }}>
          <button onClick={onChange}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", fontSize: 13, background: th.layer2, color: th.textPrimary, border: "none", cursor: "pointer", fontFamily: "var(--font-sans)" }}>
            <Pencil size={13} />{t("unlockPanel.change", "Change shortcut")}
          </button>
          <p style={{ fontSize: 12, color: th.textHelper, marginTop: 8, lineHeight: 1.6 }}>
            {t("unlockPanel.changeHint", "You'll be asked to perform the new gesture before it replaces the current one, and the keyboard stays unlocked throughout.")}
          </p>
        </div>
      )}

      {noSpareSlot && (
        <p style={{ fontSize: 12, color: th.textHelper, marginTop: 12, lineHeight: 1.6 }}>
          {t("unlockPanel.noSpareSlot", "Changing the shortcut needs one free combo slot to confirm the new gesture with. Free a slot on the Combos page first.")}
        </p>
      )}
    </div>
  );
}
