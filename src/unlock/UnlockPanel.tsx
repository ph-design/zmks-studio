import { KeyRound, ShieldCheck, AlertTriangle } from "lucide-react";

import type { CarbonTheme } from "../carbon/theme";
import { GestureChips } from "./GestureChips";
import type { UnlockPaths } from "./unlockPaths";

/*
 * Read-only view of how this keyboard can be unlocked. Editing the gesture is a
 * separate, riskier flow (the new one has to be proven to work before the old
 * one is given up) and isn't wired up yet — see docs/unlock-combo.md.
 */
export function UnlockPanel({ th, t, paths }: {
  th: CarbonTheme;
  t: (k: string, d: string) => string;
  paths: UnlockPaths;
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

      {paths.total > 0 && (
        <p style={{ fontSize: 12, color: th.textHelper, marginTop: 8, lineHeight: 1.6 }}>
          {t("unlockPanel.changeComingSoon", "Changing the shortcut isn't available yet: the new gesture has to be proven to work before the old one is given up, so it needs its own guided flow.")}
        </p>
      )}
    </div>
  );
}
