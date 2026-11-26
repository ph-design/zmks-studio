import { useContext, useEffect, useMemo, useRef, useState } from "react";
import type { TapCapture, TapDiagnostics } from "@zmkfirmware/zmk-studio-ts-client/motion";

import { ActionButton, Facts, InlineError } from "../carbon/CarbonChrome";
import type { CarbonTheme } from "../carbon/theme";
import type { Translate } from "../misc/format";
import { ConnectionContext } from "../rpc/ConnectionContext";
import { getMotionBackend } from "./motionRpc";

export function TapDiagnosticsPanel({ th, t, enabled }: {
  th: CarbonTheme;
  t: Translate;
  enabled: boolean;
}) {
  const { conn } = useContext(ConnectionContext);
  const backend = useMemo(() => getMotionBackend(conn), [conn]);
  const getDiagnostics = backend?.getTapDiagnostics;
  const setTest = backend?.setTapTest;
  const getCapture = backend?.getTapCapture;
  const [diagnostics, setDiagnostics] = useState<TapDiagnostics | null>(null);
  const [capture, setCapture] = useState<TapCapture | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const session = useRef<{ active: boolean; startedHere: boolean }>();

  useEffect(() => {
    if (!getDiagnostics || !setTest) return;
    const current = { active: true, startedHere: false };
    session.current = current;
    setDiagnostics(null);
    setCapture(null);
    setBusy(false);
    setFailed(false);
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        if (!document.hidden) {
          const value = await getDiagnostics();
          if (current.active) {
            setDiagnostics(value);
            setFailed(!value);
          }
        }
      } catch {
        if (current.active) setFailed(true);
      } finally {
        if (current.active) timer = setTimeout(poll, 1000);
      }
    };
    void poll();
    return () => {
      current.active = false;
      clearTimeout(timer);
      if (current.startedHere) void setTest(false).catch(() => {});
    };
  }, [getDiagnostics, setTest]);

  const testing = !!diagnostics?.testRemainingMs;
  const toggleTest = async () => {
    const current = session.current;
    if (!setTest || !getDiagnostics || !current || busy) return;
    const on = !testing;
    setBusy(true);
    setFailed(false);
    try {
      if (!await setTest(on)) throw Error("Tap test rejected");
      if (!current.active) {
        if (on) await setTest(false);
        return;
      }
      current.startedHere = on;
      if (on) setCapture(null);
      const value = await getDiagnostics();
      if (current.active) {
        setDiagnostics(value);
        setFailed(!value);
      }
    } catch {
      if (current.active) setFailed(true);
    } finally {
      if (current.active) setBusy(false);
    }
  };

  const readCapture = async () => {
    const current = session.current;
    if (!getCapture || !current || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const value = await getCapture();
      if (current.active) {
        setCapture(value);
        setFailed(!value);
      }
    } catch {
      if (current.active) setFailed(true);
    } finally {
      if (current.active) setBusy(false);
    }
  };

  if (!getDiagnostics) return null;

  return (
    <section className="mt-4 grid gap-3 border-t border-base-300 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <ActionButton th={th} primary disabled={!diagnostics || busy || (!enabled && !testing)}
          label={testing ? t("motion.tap.stopTest", "Stop test") : t("motion.tap.startTest", "Start test")}
          onClick={() => void toggleTest()} />
        <ActionButton th={th} disabled={busy || !(diagnostics?.doubleCount || diagnostics?.singleCount)}
          label={t("motion.tap.readCapture", "Read waveform")} onClick={() => void readCapture()} />
        {testing && (
          <span role="status" className="text-sm text-success">
            {t("motion.tap.dryRun", "Actions paused")} · {Math.ceil(diagnostics!.testRemainingMs / 1000)} s
          </span>
        )}
      </div>
      <p className="text-sm text-helper">{t("motion.tap.safeTestHint", "During the 60-second test, double taps are counted without running their bindings.")}</p>
      {(failed || !!diagnostics?.error) && (
        <InlineError th={th} t={t} message={t("motion.tap.testFailed", "Could not read tap diagnostics or change test mode.")} />
      )}
      {diagnostics && (
        <Facts th={th} rows={[
          { label: t("motion.tap.interrupts", "Sensor interrupts"), value: diagnostics.irqCount },
          { label: t("motion.tap.hardwareDoubles", "Hardware double taps"), value: diagnostics.doubleCount },
          { label: t("motion.tap.acceptedDoubles", "Accepted double taps"), value: diagnostics.gestureCount },
          { label: t("motion.tap.actions", "Actions run"), value: diagnostics.actionCount },
          { label: t("motion.tap.suppressed", "Suppressed"), value: diagnostics.suppressedCount },
          { label: t("motion.tap.queueDrops", "Dropped events"), value: diagnostics.queueDrops },
          { label: t("motion.tap.sampleRate", "Sensor sample rate"), value: diagnostics.odrHz + " Hz" },
        ]} />
      )}
      {capture && <TapWaveform t={t} capture={capture} />}
    </section>
  );
}

function TapWaveform({ t, capture }: { t: Translate; capture: TapCapture }) {
  const { frames } = capture;
  const n = Math.min(capture.count, Math.floor(frames.byteLength / 8), 32);
  if (n === 0) return <p className="text-sm text-helper">{t("motion.tap.noCapture", "No motion was captured.")}</p>;
  const view = new DataView(frames.buffer, frames.byteOffset, frames.byteLength);
  const start = view.getUint16(0, true);
  const time = (i: number) => (view.getUint16(i * 8, true) - start) & 0xffff;
  const axes = [2, 4, 6].map((offset) => {
    const initial = view.getInt16(offset, true);
    return Array.from({ length: n }, (_, i) => view.getInt16(i * 8 + offset, true) - initial);
  });
  const span = time(n - 1);
  const peak = Math.max(1, ...axes.flat().map(Math.abs));

  return (
    <figure>
      <figcaption className="mb-1 text-xs text-helper">
        {t("motion.tap.waveform", "Motion before the tap")} · {n} · {span} ms · ±{peak} mg
      </figcaption>
      <svg viewBox="0 0 600 120" className="h-28 w-full border border-base-300" role="img"
        aria-label={t("motion.tap.waveform", "Motion before the tap")}>
        <path d="M0 60 H600" stroke="currentColor" opacity=".2" />
        {axes.map((samples, axis) => (
          <polyline key={axis} fill="none" stroke={["#fa4d56", "#42be65", "#78a9ff"][axis]} strokeWidth="2"
            points={samples.map((mg, i) => (time(i) * 600 / Math.max(1, span)) + "," + (60 - mg * 48 / peak)).join(" ")} />
        ))}
      </svg>
      <p className="mt-1 text-xs"><span className="text-error">X</span> / <span className="text-success">Y</span> / <span className="text-primary">Z</span></p>
    </figure>
  );
}
