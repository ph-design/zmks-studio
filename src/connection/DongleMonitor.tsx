import { useEffect, useRef, useState } from "react";
import type { CarbonTheme } from "../carbon/theme";
import { Facts, ActionButton } from "../carbon/CarbonChrome";
import type { Translate } from "../misc/format";
import type { DongleController } from "./useDongle";

type Sample = { at: number; rx?: number; rate?: number; failures?: number; delta?: number; latency?: number; link?: string; event?: string };
export function DongleMonitor({ th, t, dongle, autoStart = false }: { th: CarbonTheme; t: Translate; dongle: Pick<DongleController, "phase" | "busy" | "status" | "queryStatus">; autoStart?: boolean }) {
  const [active, setActive] = useState(autoStart);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [range, setRange] = useState(60);
  const [selected, setSelected] = useState<number>();
  const [failed, setFailed] = useState(false);
  const latest = useRef(dongle);
  latest.current = dongle;
  useEffect(() => {
    if (dongle.phase !== "open") { setActive(false); setSamples([]); }
  }, [dongle.phase]);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let baseline: Sample | undefined;
    const poll = async () => {
      const d = latest.current;
      if (d.phase === "open" && !d.busy && !document.hidden) {
        const started = performance.now();
        let result;
        try { result = await d.queryStatus(); } catch { result = {}; }
        if (cancelled) return;
        const at = Date.now();
        const valid = result.rx !== undefined && Number.isFinite(result.rx);
        setFailed(!valid);
        const last = baseline;
        const reset = valid && last?.rx !== undefined && (result.rx! < last.rx || (result.rxDecryptFail !== undefined && last.failures !== undefined && result.rxDecryptFail < last.failures));
        const continuous = valid && last?.rx !== undefined && at > last.at && at - last.at < 4000 && !reset;
        const sample: Sample = {
          at, rx: valid ? result.rx : undefined, failures: result.rxDecryptFail,
          latency: valid ? performance.now() - started : undefined,
          link: valid ? result.link : undefined,
          rate: continuous ? (result.rx! - last.rx!) * 1000 / (at - last.at) : undefined,
          delta: continuous && result.rxDecryptFail !== undefined && last.failures !== undefined ? result.rxDecryptFail - last.failures : undefined,
          event: !valid ? "readFailed" : reset ? "counterReset" : last && last.link !== result.link ? (result.link === "CONNECTED" ? "reconnected" : "disconnected") : undefined,
        };
        baseline = valid ? sample : undefined;
        setSamples(previous => [...previous, sample].slice(-3600));
      } else { baseline = undefined; }

      if (!cancelled) timer = setTimeout(poll, 1000);
    };
    timer = setTimeout(poll, 1000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [active]);
  if (dongle.phase !== "open") return null;
  const label = (key: string, fallback: string) => t(`carbon.conn.monitor.${key}`, fallback);
  const rate = samples[samples.length - 1]?.rate;
  const end = samples[samples.length - 1]?.at ?? Date.now();
  const visible = samples.filter(s => !range || s.at >= end - range * 1000);
  const start = range ? end - range * 1000 : visible[0]?.at ?? end - 1000;
  const chosen = samples.find(s => s.at === selected);
  const exportCsv = () => {
    const rows = ["timestamp,rx,receive_packets_per_second,decrypt_failures,decrypt_delta,management_query_ms,link,event", ...samples.map(s => [new Date(s.at).toISOString(), s.rx, s.rate, s.failures, s.delta, s.latency, s.link, s.event].join(","))];
    const url = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "receiver-analysis.csv"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const eventLabel = (event: string) => label(event, ({ readFailed: "Read failed", counterReset: "Counters reset", reconnected: "Link restored", disconnected: "Link disconnected" } as Record<string, string>)[event] ?? event);
  return <section style={{ marginBottom: 20, minWidth: 0 }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
      <strong>{label("title", "Receiver activity")}</strong>
      <ActionButton th={th} label={active ? label("pause", "Pause monitoring") : label("start", "Start monitoring")} onClick={() => { setFailed(false); setActive(!active); }} />
    </div>
    <Facts th={th} rows={[
      { label: label("channel", "Current channel"), value: String(dongle.status?.rfChannel ?? "—") },
      { label: label("link", "Keyboard link"), value: dongle.status?.link === "CONNECTED" ? label("connected", "Connected") : dongle.status?.link === "LOST" ? label("lost", "Disconnected") : "—" },
      { label: label("rate", "Receive rate (packets/s)"), value: active && !failed && rate !== undefined ? rate.toFixed(1) : "—" },
      { label: label("rx", "Received packets / decryption failures"), value: `${dongle.status?.rx ?? "—"} / ${dongle.status?.rxDecryptFail ?? "—"}` },
    ]} />
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
      <label>{label("range", "Time range")} <select value={range} onChange={e => setRange(Number(e.target.value))} style={{ background: th.bg, color: th.textSecondary }}>
        <option value={60}>{label("minute", "1 minute")}</option><option value={300}>{label("fiveMinutes", "5 minutes")}</option><option value={0}>{label("session", "Session (up to 3600 samples)")}</option>
      </select></label>
      <ActionButton th={th} label={label("export", "Export CSV")} onClick={exportCsv} disabled={!samples.length} />
    </div>
    {([
      ["rate", label("rate", "Receive rate (packets/s)")],
      ["delta", label("errors", "Decryption failures per sample")],
      ["latency", label("latency", "USB management query (ms)")],
      ["link", label("linkTimeline", "Link state: 1 connected / 0 disconnected")],
    ] as const).map(([key, title]) => {
      const value = (s: Sample) => key === "link" ? s.link === "CONNECTED" ? 1 : s.link === "LOST" ? 0 : undefined : s[key];
      const max = Math.max(1, ...visible.map(s => value(s) ?? 0));
      return <figure key={key} style={{ margin: "12px 0" }}>
        <figcaption style={{ fontSize: 12 }}>{title}</figcaption>
        <svg role="img" aria-label={title} viewBox="0 0 600 100" style={{ width: "100%", height: 100, background: th.bg, color: th.textSecondary }}>
          <line x1="0" y1="80" x2="600" y2="80" stroke="currentColor" opacity="0.2" />
          <text x="598" y="12" textAnchor="end" fill="currentColor" fontSize="10">{max.toFixed(1)}</text>
          {visible.map(s => { const v = value(s); const x = (s.at - start) / Math.max(1000, end - start) * 592;
            return v === undefined ? null : <rect key={s.at} x={x} y={80 - v / max * 60} width={Math.max(1, Math.min(8, 590 / Math.max(60, visible.length)))} height={Math.max(2, v / max * 60)} fill={s.at === selected ? "#0f62fe" : "currentColor"} onMouseEnter={() => setSelected(s.at)}><title>{new Date(s.at).toLocaleTimeString()} — {v.toFixed(1)}</title></rect>;
          })}
          <text x="0" y="97" fill="currentColor" fontSize="10">{new Date(start).toLocaleTimeString()}</text><text x="598" y="97" textAnchor="end" fill="currentColor" fontSize="10">{new Date(end).toLocaleTimeString()}</text>
        </svg>
      </figure>;
    })}
    {chosen && <p style={{ fontSize: 12 }}>{new Date(chosen.at).toLocaleTimeString()} · {chosen.rate?.toFixed(1) ?? "—"} pkt/s · {chosen.latency?.toFixed(1) ?? "—"} ms · {chosen.link ?? "—"}</p>}
    <details><summary>{label("events", "Events")}</summary><div style={{ maxHeight: 180, overflow: "auto" }}>
      {samples.filter(s => s.event).slice(-100).reverse().map(s => <div key={s.at}><button type="button" onClick={() => { setSelected(s.at); setRange(0); }} style={{ color: th.textSecondary }}>{new Date(s.at).toLocaleTimeString()} · {eventLabel(s.event!)}</button></div>)}
      {!samples.some(s => s.event) && label("noEvents", "No events recorded.")}
    </div></details>
    <p style={{ fontSize: 12, color: th.textHelper }}>{failed ? label("failed", "Read failed; waiting for the next sample.") : !active ? label("paused", "Monitoring paused.") : label("sampling", "Sampling once per second while this page is visible.")}</p>
    <p style={{ fontSize: 12, color: th.textHelper }}>{label("note", "Activity is not signal strength. This firmware does not report RSSI, packet loss or retries; decryption failures are not packet loss.")}</p>
  </section>;
}
