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
  NEW_UNLOCK_TIMEOUT_MS,
  overlappingCombos,
  gestureResistsTyping,
  probeUsage,
  TYPING_GUARD_IDLE_MS,
  unlockKeyLabel,
  usableProbeKeys,
  type ProbeKey,
} from "./unlockPaths";

/** How long to wait for the probe keystroke before offering a way out. */
const PROBE_TIMEOUT_MS = 30_000;

type Step = "pick" | "arming" | "waiting" | "committing" | "done";

interface UnlockChangeFlowProps {
  th: CarbonTheme;
  t: (k: string, d: string) => string;
  /**
   * `change` re-triggers an existing unlock combo; `create` turns a free slot
   * into one. Firmware doesn't ship a reserved unlock combo today — the factory
   * gesture is a keymap binding — so `create` is the path most users hit first.
   */
  mode: "change" | "create";
  /** Change mode only: the slot being re-triggered; its behavior is untouched. */
  unlockCombo?: ComboConfig;
  /**
   * The slot borrowed for the probe. In `create` mode it also becomes the unlock
   * combo, so one free slot is enough for the whole flow.
   */
  spareCombo: ComboConfig;
  /** Create mode only: what to bind once the gesture is confirmed. */
  unlockBehaviorId: number;
  allCombos: ComboConfig[];
  keymap: Keymap | undefined;
  behaviors: Record<number, GetBehaviorDetailsResponse>;
  layout: PhysicalLayoutMsg | undefined;
  scale: LayoutZoom;
  setScale: (v: LayoutZoom) => void;
  /** Total unlock paths; more than one means a bad guess isn't fatal. */
  otherPathCount: number;
  applyCombo: (cfg: ComboConfig) => Promise<boolean>;
  /** Reads a slot back from firmware, to confirm the write actually landed. */
  readCombo: (index: number) => Promise<ComboConfig | null>;
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
  th, t, mode, unlockCombo, spareCombo, unlockBehaviorId, allCombos, keymap,
  behaviors, layout, scale, setScale, otherPathCount, applyCombo, readCombo, onClose,
}: UnlockChangeFlowProps) {
  const [step, setStep] = useState<Step>("pick");
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(unlockCombo?.keyPositions ?? [])
  );

  /*
   * Trigger conditions the probe must reproduce. In change mode they come from
   * the combo being replaced, so the test is faithful to it; in create mode
   * there's nothing to copy, so use a deliberately generous timeout and leave
   * the gesture active on every layer.
   */
  const trigger = unlockCombo ?? {
    timeoutMs: NEW_UNLOCK_TIMEOUT_MS,
    requirePriorIdleMs: -1,
    layerMask: 0,
    slowRelease: false,
  };
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [priorIdleApplied, setPriorIdleApplied] = useState(false);
  /** What firmware reports is in the borrowed slot once the test is armed. */
  const [armedSlot, setArmedSlot] = useState<ComboConfig | null>(null);

  const positions = useMemo(
    () => [...selected].sort((a, b) => a - b),
    [selected]
  );
  const labels = positions.map((p) => unlockKeyLabel(p, keymap, behaviors));

  const conflicts = useMemo(
    () => conflictingCombos(allCombos, positions, unlockCombo?.index ?? spareCombo.index),
    [allCombos, positions, unlockCombo?.index, spareCombo.index]
  );

  /*
   * Combos merely sharing a key aren't a clash, but ZMK resolves overlapping
   * combos against each other and the winner isn't predictable from here. A
   * hand-made F+J combo silently beating the probe is exactly how this looked
   * broken in testing, so say it rather than let it be debugged the hard way.
   */
  const overlaps = useMemo(
    () =>
      overlappingCombos(allCombos, positions, unlockCombo?.index ?? spareCombo.index)
        .filter((c) => !conflicts.some((x) => x.index === c.index)),
    [allCombos, positions, unlockCombo?.index, spareCombo.index, conflicts]
  );
  const resistsTyping = useMemo(
    () => gestureResistsTyping(positions, keymap, behaviors),
    [positions, keymap, behaviors]
  );

  /*
   * Two separate things, and conflating them was a bug: `probeIndex` points at
   * the candidate to arm *next*, while `armedProbe` is the key actually written
   * to the keyboard. Deriving the listener and the on-screen label from the
   * former meant that after switching keys, Studio watched for the new key while
   * the keyboard still emitted the old one — so the test could never succeed, and
   * the output always lagged one step behind the label.
   */
  const [probeIndex, setProbeIndex] = useState(0);
  const [armedProbe, setArmedProbe] = useState<ProbeKey | null>(null);
  const probeCandidates = useMemo(
    () => usableProbeKeys(positions, keymap, behaviors),
    [positions, keymap, behaviors]
  );
  const nextProbe = probeCandidates[probeIndex + 1];
  const hasAnotherProbe = !!nextProbe;

  const hits = useKeyProbe(armedProbe?.code ?? "", step === "waiting");
  const sawProbe = hits > 0;

  // Did the write land? A slot that triggers but emits nothing usually means the
  // behavior was dropped while the key positions took effect.
  const armedBehaviorWrong =
    !!armedSlot && !!armedProbe &&
    ((armedSlot.behavior?.behaviorId ?? -1) < 0 ||
      armedSlot.behavior?.param1 !== probeUsage(armedProbe.hidId));
  const armedPositionsWrong =
    !!armedSlot &&
    [...armedSlot.keyPositions].sort((a, b) => a - b).join(",") !== positions.join(",");

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

  /*
   * `candidate` is passed in rather than read from state: the retry button sets
   * `probeIndex` and re-arms in the same handler, and a state update isn't
   * visible to the closure that follows it.
   */
  const arm = async (candidate?: ProbeKey) => {
    const useProbe = candidate ?? probeCandidates[Math.min(probeIndex, probeCandidates.length - 1)];
    setError(null);
    setTimedOut(false);
    setArmedProbe(null);
    setArmedSlot(null);
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
      timeoutMs: trigger.timeoutMs,
      requirePriorIdleMs: trigger.requirePriorIdleMs,
      layerMask: trigger.layerMask,
      slowRelease: trigger.slowRelease,
      behavior: { behaviorId: kpBehaviorId, param1: probeUsage(useProbe.hidId), param2: 0 },
    });

    if (!ok) {
      setError(t("unlockChange.errArm", "Couldn't set up the test. Nothing was changed."));
      setStep("pick");
      return;
    }
    armedRef.current = true;
    // Only now start watching for it: the keyboard is armed with this key.
    setArmedProbe(useProbe);
    setStep("waiting");

    /*
     * Read the slot back from firmware rather than trusting the write's own
     * "ok". A combo that swallows its keys but emits nothing looks identical to
     * a broken test, and the two have opposite causes: the trigger landed and
     * the behavior didn't. Showing what firmware actually holds settles it.
     */
    const stored = await readCombo(spareCombo.index);
    setArmedSlot(stored);
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
     * Change mode rewrites only the trigger keys, echoing the behavior back
     * exactly as firmware reported it — a reserved slot would (rightly) reject a
     * differing behavior. Create mode instead keeps the borrowed slot and binds
     * studio unlock to it, so the probe slot becomes the real thing and no
     * second free slot is needed.
     */
    const base = unlockCombo
      ? { ...unlockCombo, keyPositions: positions }
      : {
          ...spareCombo,
          keyPositions: positions,
          timeoutMs: NEW_UNLOCK_TIMEOUT_MS,
          layerMask: 0,
          slowRelease: false,
          behavior: { behaviorId: unlockBehaviorId, param1: 0, param2: 0 },
        };
    const needsGuard = !resistsTyping && trigger.requirePriorIdleMs < TYPING_GUARD_IDLE_MS;

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
    // In create mode the borrowed slot *is* the new unlock combo, so releasing it
    // would immediately undo the change.
    armedRef.current = false;
    if (unlockCombo) {
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
        {mode === "create"
          ? t("unlockChange.titleCreate", "Add an unlock shortcut")
          : t("unlockChange.title", "Change unlock shortcut")}
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
              {mode === "create" && ` ${t("unlockChange.pickHintCreate", "Your existing unlock key stays as it is, so this is purely an addition.")}`}
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
            {overlaps.length > 0 && notice("warn",
              `${t("unlockChange.warnOverlap", "These keys are also used by another combo")} (${overlaps.map((c) => `#${c.index}`).join(", ")}). ${t("unlockChange.warnOverlapHint", "Overlapping combos compete, and the other one may win — which makes the test below look like it failed for no reason.")}`)}
            {positions.length >= 2 && !resistsTyping && notice("warn",
              t("unlockChange.warnTyping", "These are all ordinary keys, so the chord could fire while typing. Studio will require a brief pause before it counts — including one layer or modifier key is safer."))}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>
                {positions.length > 0
                  ? <GestureChips keys={labels} />
                  : <span style={{ fontSize: 12, color: th.textHelper }}>{t("unlockChange.nothingPicked", "Nothing picked yet")}</span>}
              </span>
              <button onClick={() => arm()} disabled={positions.length < 2 || conflicts.length > 0}
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
                    {t("unlockChange.probeKey", "Test key")}: <span style={{ fontFamily: "var(--font-mono)", color: th.textSecondary }}>{armedProbe?.label ?? "…"}</span>
                    {armedProbe?.typed && ` · ${t("unlockChange.probeTyped", "swallowed, not typed anywhere")}`}
                  </span>
                  <span>
                    {seenKeys.length > 0
                      ? `${t("unlockChange.keysSeen", "Keystrokes reaching Studio")}: ${seenKeys.join(" ")}`
                      : t("unlockChange.noKeysSeen", "No keystrokes reaching Studio yet")}
                  </span>
                  {armedSlot && (
                    <span style={{ fontFamily: "var(--font-mono)", color: th.textSecondary }}>
                      {t("unlockChange.slotReadback", "Slot")} #{armedSlot.index}
                      {" · keys ["}{armedSlot.keyPositions.join(",")}{"]"}
                      {" · behavior "}{armedSlot.behavior?.behaviorId ?? "none"}
                      {" · param1 0x"}{(armedSlot.behavior?.param1 ?? 0).toString(16)}
                      {" · layers 0x"}{armedSlot.layerMask.toString(16)}
                      {" · "}{armedSlot.timeoutMs}ms
                    </span>
                  )}
                </div>
              )}

              {armedSlot && (armedBehaviorWrong || armedPositionsWrong) && notice("error",
                armedPositionsWrong
                  ? t("unlockChange.errStoredPositions", "Firmware accepted the test but stored different trigger keys, so this device isn't taking the write as sent.")
                  : t("unlockChange.errStoredBehavior", "Firmware accepted the test but didn't store the test keystroke on the slot. That's why the chord swallows keys and emits nothing — the trigger landed and the behavior didn't. This needs a firmware fix; the read-back above is the evidence."))}

              {error && notice("error", error)}
              {timedOut && step === "waiting" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 470 }}>
                  {notice("warn", seenKeys.length > 0
                    ? t("unlockChange.timeoutSwallowed", "If pressing them together shows nothing at all, the combo IS firing — ZMK swallows the keys it consumes and sends the test key instead, so only the test key is going missing. Try a different one. (Seeing the keys individually just means the chord didn't complete.)")
                    : t("unlockChange.timeoutNoInput", "No keystrokes are reaching Studio at all. Make sure this window has focus and that the keyboard is typing into this computer."))}
                  {hasAnotherProbe && (
                    <button onClick={() => { setProbeIndex(probeIndex + 1); arm(nextProbe); }}
                      style={{ alignSelf: "center", padding: "8px 16px", fontSize: 13, background: th.layer2, color: th.textPrimary, border: "none", cursor: "pointer", fontFamily: "var(--font-sans)" }}>
                      {t("unlockChange.tryAnotherProbe", "Retry with a different test key")}
                      {" — "}
                      <span style={{ fontFamily: "var(--font-mono)" }}>
                        {nextProbe?.label}
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
            {mode === "create"
              ? t("unlockChange.doneCreate", "Unlock shortcut added")
              : t("unlockChange.done", "Unlock shortcut updated")}
          </div>
          <GestureChips keys={labels} />
          {priorIdleApplied && notice("ok",
            t("unlockChange.priorIdleApplied", "A brief pause is now required before the chord counts, so it can't fire while typing."))}
          {error && notice("warn", error)}
          <p style={{ maxWidth: 420, fontSize: 12, color: th.textHelper, lineHeight: 1.6 }}>
            {/* Deliberately not "press Save": a combo write doesn't mark the
                session dirty, so that button may not even be showing. Whether
                combos persist on their own is a firmware question. */}
            {t("unlockChange.doneHint", "It's active right now. If a “Save to keyboard” button is showing, use it — otherwise power-cycle the keyboard once to check the shortcut survived.")}
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

