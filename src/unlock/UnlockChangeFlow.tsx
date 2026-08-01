import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Check, KeyRound, Loader } from "lucide-react";

import type { ComboConfig } from "@zmkfirmware/zmk-studio-ts-client/combos";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import type { Keymap, PhysicalLayout as PhysicalLayoutMsg } from "@zmkfirmware/zmk-studio-ts-client/keymap";

import type { CarbonTheme } from "../carbon/theme";
import { PhysicalLayout, type LayoutZoom } from "../keyboard/PhysicalLayout";
import { KeyboardCanvas } from "../keyboard/KeyboardCanvas";
import { usePressedKeys } from "../carbon/usePressedKeys";
import { shortHidLabel } from "../combos/comboUtils";
import { GestureChips } from "./GestureChips";
import { useKeyProbe } from "./useKeyProbe";
import {
  conflictingCombos,
  gestureResistsTyping,
  probeUsage,
  TYPING_GUARD_IDLE_MS,
  unlockKeyLabel,
  usableProbeKeys,
} from "./unlockPaths";

/** How long to wait for the probe keystroke before offering a way out. */
const PROBE_TIMEOUT_MS = 30_000;

type Step = "pick" | "arming" | "waiting" | "committing" | "done";

interface UnlockChangeFlowProps {
  th: CarbonTheme;
  t: (k: string, d: string) => string;
  /** The reserved slot being re-triggered; its behavior is left untouched. */
  unlockCombo: ComboConfig;
  /** An unused slot the probe binding borrows for the duration of the test. */
  spareCombo: ComboConfig;
  allCombos: ComboConfig[];
  keymap: Keymap | undefined;
  behaviors: Record<number, GetBehaviorDetailsResponse>;
  layout: PhysicalLayoutMsg | undefined;
  scale: LayoutZoom;
  setScale: (v: LayoutZoom) => void;
  /** Total unlock paths; more than one means a bad guess isn't fatal. */
  otherPathCount: number;
  applyCombo: (cfg: ComboConfig) => Promise<boolean>;
  onClose: () => void;
}

/*
 * Guided replacement of the unlock gesture.
 *
 * The ordering is the whole point: the reserved slot is only written *after* the
 * candidate gesture has been seen to fire, so the working gesture is never given
 * up on the strength of a guess. Nothing here ever locks the keyboard, so even a
 * failed attempt leaves the user exactly where they started.
 */
export function UnlockChangeFlow({
  th, t, unlockCombo, spareCombo, allCombos, keymap, behaviors, layout,
  scale, setScale, otherPathCount, applyCombo, onClose,
}: UnlockChangeFlowProps) {
  const [step, setStep] = useState<Step>("pick");
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(unlockCombo.keyPositions)
  );
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [priorIdleApplied, setPriorIdleApplied] = useState(false);

  const positions = useMemo(
    () => [...selected].sort((a, b) => a - b),
    [selected]
  );
  const labels = positions.map((p) => unlockKeyLabel(p, keymap, behaviors));

  const conflicts = useMemo(
    () => conflictingCombos(allCombos, positions, unlockCombo.index),
    [allCombos, positions, unlockCombo.index]
  );
  const resistsTyping = useMemo(
    () => gestureResistsTyping(positions, keymap, behaviors),
    [positions, keymap, behaviors]
  );

  // Which probe key we're currently bound to; the user can move on if their
  // system doesn't deliver it.
  const [probeIndex, setProbeIndex] = useState(0);
  const probeCandidates = useMemo(
    () => usableProbeKeys(positions, keymap, behaviors),
    [positions, keymap, behaviors]
  );
  const probe = probeCandidates[Math.min(probeIndex, probeCandidates.length - 1)];
  const hasAnotherProbe = probeIndex < probeCandidates.length - 1;

  const hits = useKeyProbe(probe.code, step === "waiting");
  const sawProbe = hits > 0;

  /*
   * Anything else the keyboard is sending while we wait. If these light up but
   * the probe key never arrives, the host link is fine and the combo isn't
   * firing; if nothing arrives at all, the keystrokes aren't reaching Studio.
   * That distinction is the difference between a firmware problem and a focus
   * problem, and it's invisible without showing it.
   */
  const otherKeys = usePressedKeys(step === "waiting");
  const [seenKeys, setSeenKeys] = useState<string[]>([]);
  useEffect(() => {
    if (step !== "waiting") {
      setSeenKeys([]);
      return;
    }
    if (otherKeys.size === 0) return;
    setSeenKeys((prev) => {
      const next = new Set(prev);
      for (const usage of otherKeys) next.add(shortHidLabel(usage));
      return [...next].slice(-8);
    });
  }, [otherKeys, step]);

  // Restore the borrowed slot no matter how the flow ends, including unmount.
  const releaseSpare = useCallback(async () => {
    await applyCombo({ ...spareCombo, keyPositions: [], behavior: undefined });
  }, [applyCombo, spareCombo]);

  const releaseRef = useRef(releaseSpare);
  releaseRef.current = releaseSpare;
  const armedRef = useRef(false);
  useEffect(() => {
    return () => {
      if (armedRef.current) {
        armedRef.current = false;
        releaseRef.current();
      }
    };
  }, []);

  const arm = async () => {
    setError(null);
    setTimedOut(false);
    setStep("arming");

    const kpBehaviorId = findKeyPressBehaviorId(behaviors);
    if (kpBehaviorId === undefined) {
      setError(t("unlockChange.errNoKeyPress", "This firmware has no Key Press behavior, so the gesture can't be tested."));
      setStep("pick");
      return;
    }

    /*
     * Mirror the unlock combo's trigger conditions, `layerMask` included —
     * inheriting the spare slot's mask instead was a real bug: `0` means "all
     * layers", so a spare slot restricted to layers the user isn't on gives a
     * combo that can never fire, and the test looks broken for no visible
     * reason.
     */
    const ok = await applyCombo({
      ...spareCombo,
      keyPositions: positions,
      timeoutMs: unlockCombo.timeoutMs,
      requirePriorIdleMs: unlockCombo.requirePriorIdleMs,
      layerMask: unlockCombo.layerMask,
      slowRelease: unlockCombo.slowRelease,
      behavior: { behaviorId: kpBehaviorId, param1: probeUsage(probe.hidId), param2: 0 },
    });

    if (!ok) {
      setError(t("unlockChange.errArm", "Couldn't set up the test. Nothing was changed."));
      setStep("pick");
      return;
    }
    armedRef.current = true;
    setStep("waiting");
  };

  // Give the user a way forward if the host never delivers the probe key.
  useEffect(() => {
    if (step !== "waiting") return;
    const timer = setTimeout(() => setTimedOut(true), PROBE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [step]);

  const commit = async (verified: boolean) => {
    setError(null);
    setStep("committing");

    /*
     * Only the trigger keys change; the behavior stays exactly as firmware
     * reported it, since the slot is reserved and a differing behavior would
     * (rightly) be rejected. Prior-idle is added when the gesture could
     * otherwise fire mid-typing — some firmware may refuse that field on a
     * reserved slot, so fall back to a positions-only write rather than
     * failing the whole change.
     */
    const base = { ...unlockCombo, keyPositions: positions };
    const needsGuard = !resistsTyping && unlockCombo.requirePriorIdleMs < TYPING_GUARD_IDLE_MS;

    let ok = false;
    let guarded = false;
    if (needsGuard) {
      ok = await applyCombo({ ...base, requirePriorIdleMs: TYPING_GUARD_IDLE_MS });
      guarded = ok;
    }
    if (!ok) ok = await applyCombo(base);

    if (!ok) {
      setError(t("unlockChange.errCommit", "Writing the new shortcut failed. Your old one still works."));
      setStep("waiting");
      return;
    }

    setPriorIdleApplied(guarded);
    if (armedRef.current) {
      armedRef.current = false;
      await releaseSpare();
    }
    setStep("done");
    if (!verified) {
      setError(t("unlockChange.warnUnverified", "Applied without confirmation — test it before you let the keyboard lock."));
    }
  };

  const cancel = async () => {
    if (armedRef.current) {
      armedRef.current = false;
      await releaseSpare();
    }
    onClose();
  };

  const header = (
    <div style={{ display: "flex", alignItems: "center", gap: 10, height: 48, padding: "0 20px", background: th.layer1, borderBottom: `1px solid ${th.border}`, flexShrink: 0 }}>
      <KeyRound size={15} style={{ color: th.interactive, flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: th.textPrimary }}>
        {t("unlockChange.title", "Change unlock shortcut")}
      </span>
      {step !== "done" && (
        <button onClick={cancel}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", fontSize: 13, background: "none", border: `1px solid ${th.borderStrong}`, color: th.textSecondary, cursor: "pointer", fontFamily: "var(--font-sans)" }}>
          <ArrowLeft size={13} />{t("common.cancel", "Cancel")}
        </button>
      )}
    </div>
  );

  const notice = (tone: "warn" | "error" | "ok", text: string) => (
    <div style={{ display: "flex", gap: 10, padding: "10px 14px", background: th.layer1, border: `1px solid ${th.border}`, borderLeft: `3px solid ${tone === "ok" ? th.success : tone === "warn" ? th.warning : th.error}` }}>
      {tone === "ok"
        ? <Check size={15} style={{ color: th.success, flexShrink: 0, marginTop: 1 }} />
        : <AlertTriangle size={15} style={{ color: tone === "warn" ? th.warning : th.error, flexShrink: 0, marginTop: 1 }} />}
      <span style={{ fontSize: 12, color: th.textPrimary, lineHeight: 1.6 }}>{text}</span>
    </div>
  );

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      {header}

      {step === "pick" && (
        <>
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <p style={{ margin: 0, padding: "12px 20px 0", fontSize: 13, color: th.textSecondary }}>
              {t("unlockChange.pickHint", "Click the keys the shortcut should use — at least two, pressed together.")}
            </p>
            {layout ? (
              <KeyboardCanvas th={th} t={t} scale={scale} setScale={setScale}>
                {(fitContainerRef) => (
                  <PhysicalLayout
                    positions={layout.keys.map((k, i) => ({
                      id: `unlock-key-${i}`,
                      header: unlockKeyLabel(i, keymap, behaviors),
                      x: k.x / 100.0,
                      y: k.y / 100.0,
                      width: k.width / 100,
                      height: k.height / 100.0,
                      r: (k.r || 0) / 100.0,
                      rx: (k.rx || 0) / 100.0,
                      ry: (k.ry || 0) / 100.0,
                    }))}
                    zoom={scale}
                    fitContainerRef={fitContainerRef}
                    selectedPositions={selected}
                    onPositionClicked={(pos) =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(pos)) next.delete(pos);
                        else next.add(pos);
                        return next;
                      })
                    }
                  />
                )}
              </KeyboardCanvas>
            ) : (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: th.textHelper }}>
                {t("unlockChange.noLayout", "No physical layout reported, so keys can't be picked.")}
              </div>
            )}
          </div>
          <div style={{ flexShrink: 0, borderTop: `1px solid ${th.border}`, background: th.layer1, padding: "12px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
            {error && notice("error", error)}
            {conflicts.length > 0 && notice("warn",
              t("unlockChange.warnConflict", "Another combo already uses exactly these keys. Pick a different set."))}
            {positions.length >= 2 && !resistsTyping && notice("warn",
              t("unlockChange.warnTyping", "These are all ordinary keys, so the chord could fire while typing. Studio will require a brief pause before it counts — including one layer or modifier key is safer."))}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>
                {positions.length > 0
                  ? <GestureChips keys={labels} />
                  : <span style={{ fontSize: 12, color: th.textHelper }}>{t("unlockChange.nothingPicked", "Nothing picked yet")}</span>}
              </span>
              <button onClick={arm} disabled={positions.length < 2 || conflicts.length > 0}
                style={{ padding: "8px 16px", fontSize: 13, fontWeight: 500, border: "none", background: th.interactive, color: "#fff", cursor: positions.length < 2 || conflicts.length > 0 ? "not-allowed" : "pointer", opacity: positions.length < 2 || conflicts.length > 0 ? 0.5 : 1, fontFamily: "var(--font-sans)" }}>
                {t("unlockChange.next", "Test this shortcut")}
              </button>
            </div>
          </div>
        </>
      )}

      {(step === "arming" || step === "waiting" || step === "committing") && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24, textAlign: "center" }}>
          {sawProbe && step === "waiting" ? (
            <>
              <Check size={36} style={{ color: th.success }} />
              <div style={{ fontSize: 15, fontWeight: 600, color: th.textPrimary }}>
                {t("unlockChange.confirmed", "Shortcut fired")}
              </div>
              <GestureChips keys={labels} />
              <p style={{ maxWidth: 420, fontSize: 12, color: th.textHelper, lineHeight: 1.6 }}>
                {t("unlockChange.confirmedHint", "The keyboard produced the test keystroke, so this gesture works. Apply it as the unlock shortcut?")}
              </p>
              <button onClick={() => commit(true)}
                style={{ padding: "8px 18px", fontSize: 13, fontWeight: 500, border: "none", background: th.interactive, color: "#fff", cursor: "pointer", fontFamily: "var(--font-sans)" }}>
                {t("unlockChange.apply", "Apply")}
              </button>
            </>
          ) : (
            <>
              <Loader size={30} style={{ color: th.interactive, animation: "circular-rotate 1s linear infinite" }} />
              <div style={{ fontSize: 15, fontWeight: 600, color: th.textPrimary }}>
                {step === "committing"
                  ? t("unlockChange.applying", "Applying…")
                  : t("unlockChange.pressNow", "Press the shortcut now")}
              </div>
              {step !== "committing" && <GestureChips keys={labels} />}
              <p style={{ maxWidth: 440, fontSize: 12, color: th.textHelper, lineHeight: 1.6 }}>
                {t("unlockChange.pressHint", "Your current shortcut is untouched until this one is confirmed, and the keyboard stays unlocked throughout — so nothing is at risk if it doesn't work.")}
              </p>

              {/* What Studio is watching for, and what it's actually receiving. */}
              {step === "waiting" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center", fontSize: 11, color: th.textHelper }}>
                  <span>
                    {t("unlockChange.probeKey", "Test key")}: <span style={{ fontFamily: "var(--font-mono)", color: th.textSecondary }}>{probe.label}</span>
                    {probe.typed && ` · ${t("unlockChange.probeTyped", "swallowed, not typed anywhere")}`}
                  </span>
                  <span>
                    {seenKeys.length > 0
                      ? `${t("unlockChange.keysSeen", "Keystrokes reaching Studio")}: ${seenKeys.join(" ")}`
                      : t("unlockChange.noKeysSeen", "No keystrokes reaching Studio yet")}
                  </span>
                </div>
              )}

              {error && notice("error", error)}
              {timedOut && step === "waiting" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 470 }}>
                  {notice("warn", seenKeys.length > 0
                    ? t("unlockChange.timeoutSwallowed", "If pressing them together shows nothing at all, the combo IS firing — ZMK swallows the keys it consumes and sends the test key instead, so only the test key is going missing. Try a different one. (Seeing the keys individually just means the chord didn't complete.)")
                    : t("unlockChange.timeoutNoInput", "No keystrokes are reaching Studio at all. Make sure this window has focus and that the keyboard is typing into this computer."))}
                  {hasAnotherProbe && (
                    <button onClick={() => { setProbeIndex((i) => i + 1); setTimedOut(false); arm(); }}
                      style={{ alignSelf: "center", padding: "8px 16px", fontSize: 13, background: th.layer2, color: th.textPrimary, border: "none", cursor: "pointer", fontFamily: "var(--font-sans)" }}>
                      {t("unlockChange.tryAnotherProbe", "Retry with a different test key")}
                      {" — "}
                      <span style={{ fontFamily: "var(--font-mono)" }}>
                        {probeCandidates[probeIndex + 1]?.label}
                      </span>
                    </button>
                  )}
                  {notice("warn", otherPathCount > 1
                    ? t("unlockChange.timeoutSafe", "You can apply without confirmation; this keyboard still has another way to unlock.")
                    : t("unlockChange.timeoutRisky", "Applying without confirmation means that if the gesture doesn't work, the keyboard can't be edited again without reflashing."))}
                  <button onClick={() => commit(false)}
                    style={{ alignSelf: "center", padding: "8px 16px", fontSize: 13, background: "transparent", color: th.warning, border: `1px solid ${th.warning}`, cursor: "pointer", fontFamily: "var(--font-sans)" }}>
                    {t("unlockChange.applyAnyway", "Apply without confirmation")}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {step === "done" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24, textAlign: "center" }}>
          <Check size={36} style={{ color: th.success }} />
          <div style={{ fontSize: 15, fontWeight: 600, color: th.textPrimary }}>
            {t("unlockChange.done", "Unlock shortcut updated")}
          </div>
          <GestureChips keys={labels} />
          {priorIdleApplied && notice("ok",
            t("unlockChange.priorIdleApplied", "A brief pause is now required before the chord counts, so it can't fire while typing."))}
          {error && notice("warn", error)}
          <p style={{ maxWidth: 420, fontSize: 12, color: th.textHelper, lineHeight: 1.6 }}>
            {t("unlockChange.doneHint", "Save to keyboard to keep it across a power cycle.")}
          </p>
          <button onClick={onClose}
            style={{ padding: "8px 18px", fontSize: 13, fontWeight: 500, border: "none", background: th.interactive, color: "#fff", cursor: "pointer", fontFamily: "var(--font-sans)" }}>
            {t("unlockChange.close", "Done")}
          </button>
        </div>
      )}
    </div>
  );
}

function findKeyPressBehaviorId(
  behaviors: Record<number, GetBehaviorDetailsResponse>
): number | undefined {
  for (const b of Object.values(behaviors)) {
    if (b.displayName === "Key Press") return b.id;
  }
  return undefined;
}

