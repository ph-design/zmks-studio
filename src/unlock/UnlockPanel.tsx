import { KeyRound, ShieldCheck, AlertTriangle } from "lucide-react";

import type { CarbonTheme } from "../carbon/theme";
import { GestureChips } from "./GestureChips";
import type { UnlockPaths } from "./unlockPaths";

/*
 * How this keyboard can be unlocked. Changing the gesture hands off to
 * UnlockChangeFlow, which proves the new one works before giving up the old —
 * see docs/unlock-combo.md.
 */
export function UnlockPanel({ th, t, paths, mode, noSpareSlot, onChange }: {
  th: CarbonTheme;
  t: (k: string, d: string) => string;
  paths: UnlockPaths;
  /**
   * `create` when no combo unlocks this keyboard yet — the normal state on
   * firmware whose factory gesture is a keymap binding. `null` when neither is
   * possible (no free slot, or no studio unlock behavior at all).
   */
  mode: "change" | "create" | null;
  /** Confirming a gesture needs a free slot to borrow. */
  noSpareSlot?: boolean;
  onChange?: () => void;
}) {
  /*
   * Rules go on the top edge of every row but the first, not the bottom of every
   * row: a trailing bottom border sits on top of the container's own and reads as
   * a double-thickness edge — obvious with a single row, which is the normal case
   * before a combo has been set up.
   */
  const rowStyle = (first: boolean): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    borderTop: first ? undefined : `1px solid ${th.border}`,
  });

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
          {paths.combos.map(({ combo, keyLabels, protectedByFirmware }, i) => (
            <div key={`combo-${combo.index}`} style={rowStyle(i === 0)}>
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
          {paths.keymap.map((p, i) => (
            <div key={`keymap-${p.layerIndex}-${p.keyPosition}`} style={rowStyle(i === 0 && paths.combos.length === 0)}>
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

      {mode && (
        <div style={{ marginTop: 12 }}>
          {/*
            Adding is safe — the existing unlock key stays — so it gets the plain
            secondary treatment. Replacing an existing combo is cautioned: the
            flow won't give up a working gesture, but it is still the keyboard's
            only key, and it shouldn't look like changing the theme.
          */}
          <button onClick={onChange}
            style={mode === "create"
              ? { display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", fontSize: 13, background: th.layer2, color: th.textPrimary, border: "none", cursor: "pointer", fontFamily: "var(--font-sans)" }
              : { display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", fontSize: 13, background: "transparent", color: th.warning, border: `1px solid ${th.warning}`, cursor: "pointer", fontFamily: "var(--font-sans)" }}>
            <KeyRound size={13} />
            {mode === "create"
              ? t("unlockPanel.create", "Add a combo shortcut")
              : t("unlockPanel.change", "Change shortcut")}
          </button>
          <p style={{ fontSize: 12, color: th.textHelper, marginTop: 8, lineHeight: 1.6 }}>
            {mode === "create"
              ? t("unlockPanel.createHint", "Sets up a key combination that unlocks the keyboard, alongside the existing unlock key. You'll be asked to perform it once before it's saved.")
              : t("unlockPanel.changeHint", "You'll be asked to perform the new gesture before it replaces the current one, and the keyboard stays unlocked throughout.")}
          </p>
        </div>
      )}

      {!mode && noSpareSlot && (
        <p style={{ fontSize: 12, color: th.textHelper, marginTop: 12, lineHeight: 1.6 }}>
          {t("unlockPanel.noSpareSlot", "Setting up a combo shortcut needs one free combo slot to confirm the gesture with. Free a slot on the Combos page first.")}
        </p>
      )}
    </div>
  );
}
