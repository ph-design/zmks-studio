import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { ConnectionContext } from "../rpc/ConnectionContext";
import { getMotionBackend } from "./motionRpc";
import type { TapCapture, TapDiagnostics } from "./tapProtocol";

export function TapDiagnosticsPanel({
  enabled,
  t,
}: {
  enabled: boolean;
  t: (key: string, fallback: string) => string;
}) {
  const { conn } = useContext(ConnectionContext);
  const backend = useMemo(() => getMotionBackend(conn), [conn]);
  const [diag, setDiag] = useState<TapDiagnostics | null>(null);
  const [capture, setCapture] = useState<TapCapture | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const startedHere = useRef(false);
  const alive = useRef(true);
  const l = (key: string, fallback = "") => t(`motion.tapV1.${key}`, fallback);
  useEffect(() => {
    if (!backend) return;
    alive.current = true;
    let stopped = false,
      timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        if (!document.hidden) {
          const d = await backend.getTapDiagnostics();
          if (!stopped) setDiag(d);
        }
      } catch {
        if (!stopped) setError(true);
      } finally {
        if (!stopped) timer = setTimeout(() => void poll(), 1000);
      }
    };
    void poll();
    return () => {
      alive.current = false;
      stopped = true;
      clearTimeout(timer);
      if (startedHere.current) {
        startedHere.current = false;
        void backend.setTapTest(false).catch(() => {});
      }
    };
  }, [backend]);
  const test = async () => {
    if (!backend) return;
    setBusy(true);
    setError(false);
    try {
      const on = !diag?.testRemainingMs;
      if (!(await backend.setTapTest(on))) {
        setError(true);
        return;
      }
      if (!alive.current) {
        if (on) await backend.setTapTest(false);
        return;
      }
      startedHere.current = on;
      setDiag(await backend.getTapDiagnostics());
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  const readCapture = async () => {
    if (!backend) return;
    setBusy(true);
    setError(false);
    try {
      setCapture(await backend.getTapCapture());
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  const rows: [string, number | string][] = diag
    ? [
        [l("irq"), diag.irqCount],
        [l("hardwareSingle"), diag.singleCount],
        [l("hardwareDouble"), diag.doubleCount],
        [l("gestures"), diag.gestureCount],
        [l("actions"), diag.actionCount],
        [l("suppressed"), diag.suppressedCount],
        [l("drops"), diag.queueDrops],
        [l("odr"), `${diag.odrHz} Hz`],
        [l("engine"), l(`engine${diag.engine}`)],
      ]
    : [];
  const samples = capture?.samples ?? [];
  const span = samples[samples.length - 1]?.t ?? 1;
  const peak = Math.max(
    1,
    ...samples.flatMap((s) => [
      Math.abs(s.x - (samples[0]?.x ?? 0)),
      Math.abs(s.y - (samples[0]?.y ?? 0)),
      Math.abs(s.z - (samples[0]?.z ?? 0)),
    ]),
  );
  const line = (axis: "x" | "y" | "z") =>
    samples
      .map(
        (s) =>
          `${(s.t / Math.max(1, span)) * 600},${60 - ((s[axis] - samples[0][axis]) / peak) * 48}`,
      )
      .join(" ");
  return (
    <section className="border-t border-base-300 py-4 text-xs">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-semibold">{l("title")}</h3>
        <button
          className="border border-base-300 px-3 py-2 disabled:opacity-40"
          disabled={!enabled || busy}
          onClick={() => void test()}
        >
          {l(diag?.testRemainingMs ? "stop" : "start")}
        </button>
        <button
          className="border border-base-300 px-3 py-2 disabled:opacity-40"
          disabled={busy || !diag || !(diag.singleCount + diag.doubleCount)}
          onClick={() => void readCapture()}
        >
          {l("capture")}
        </button>
        {!!diag?.testRemainingMs && (
          <span role="status" className="text-success">
            {l("dryRun")} · {Math.ceil(diag.testRemainingMs / 1000)} s
          </span>
        )}
      </div>
      <p className="mt-2 leading-relaxed text-helper">{l("hint")}</p>
      {conn?.label === "Demo" && (
        <p className="mt-1 text-helper">{l("demo")}</p>
      )}
      {(error || !!diag?.error) && (
        <p role="alert" className="mt-2 text-error">
          {l("error")} {diag?.error || ""}
        </p>
      )}
      <dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2 sm:grid-cols-3">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3">
            <dt className="text-helper">{label}</dt>
            <dd className="font-mono">{value}</dd>
          </div>
        ))}
      </dl>
      {diag && (
        <p className="mt-3 font-mono">
          X {diag.xMg} mg · Y {diag.yMg} mg · Z {diag.zMg} mg · |g|{" "}
          {Math.round(Math.hypot(diag.xMg, diag.yMg, diag.zMg))} mg
        </p>
      )}
      <p className="mt-2 leading-relaxed text-helper">{l("axesHint")}</p>
      {!!samples.length && (
        <figure className="mt-3" aria-label={l("waveform")}>
          <figcaption>
            {l("waveform")} · {samples.length} samples / {span} ms · ±{peak} mg
          </figcaption>
          <svg
            viewBox="0 0 600 120"
            className="mt-2 h-28 w-full border border-base-300"
            role="img"
            aria-label={l("waveform")}
          >
            <path d="M0 60 H600" stroke="currentColor" opacity=".2" />
            {(["x", "y", "z"] as const).map((axis, i) => (
              <polyline
                key={axis}
                points={line(axis)}
                fill="none"
                stroke={["#e76f51", "#2a9d8f", "#457bdf"][i]}
                strokeWidth="2"
              />
            ))}
          </svg>
          <p className="mt-1 text-helper">X / Y / Z · {l("waveHint")}</p>
        </figure>
      )}
      <details className="mt-3 text-helper">
        <summary className="cursor-pointer">{l("registers")}</summary>
        <p className="mt-2 break-all font-mono">
          CTRL1/2/3/4/6 · CLICK_CFG/THS/LIMIT/LATENCY/WINDOW · CTRL5
          <br />
          {Array.from(diag?.registers ?? [])
            .map((v) => v.toString(16).padStart(2, "0"))
            .join(" ")}
        </p>
        {diag && (
          <p className="mt-1">
            {l("actualThreshold")} ≈{" "}
            {Math.round(
              (((diag.registers[6] ?? 0) & 127) * diag.fullScaleMg) / 128,
            )}{" "}
            mg · {l("axisEvents")} X {diag.xCount} / Y {diag.yCount} / Z{" "}
            {diag.zCount}
          </p>
        )}
      </details>
    </section>
  );
}
