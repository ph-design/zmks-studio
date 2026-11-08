import { useEffect, useRef, useState } from "react";
import type { CarbonTheme } from "../carbon/theme";
import { Facts, ActionButton, Select } from "../carbon/CarbonChrome";
import type { Translate } from "../misc/format";
import type { DongleController } from "./useDongle";

type Sample = { at: number; rx?: number; rate?: number; failures?: number; delta?: number; latency?: number; link?: string; event?: string };
export function DongleMonitor({ th, t, dongle, autoStart = false, management }: { th: CarbonTheme; t: Translate; dongle: Pick<DongleController, "phase" | "busy" | "status" | "queryStatus">; autoStart?: boolean; management?: string }) {
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
          rate: management ? (valid ? result.link === "CONNECTED" ? 1 : result.link === "LOST" ? 0 : undefined : undefined) : continuous ? (result.rx! - last.rx!) * 1000 / (at - last.at) : undefined,
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
  const label = (key: string, fallback: string) => {
    const copy: Record<string, string> = { title: "Studio management channel", channel: "Connection", link: "RPC response state", connected: "Responding", lost: "Query failed", rate: "Successful queries per sample", rx: "Successful queries / failed queries", errors: "Failed queries per sample", latency: "RPC round-trip time (ms)", linkTimeline: "Query response history", note: "Management queries are not keyboard reports. Query time includes transport, firmware and host processing; it is not key latency. RSSI, radio retries and packet loss are unavailable.", reconnected: "Queries resumed", disconnected: "Query failed" };
    return management && copy[key] ? t(`carbon.conn.management.${key}`, copy[key]) : t(`carbon.conn.monitor.${key}`, fallback);
  };
  const rate = samples[samples.length - 1]?.rate;
  const end = samples[samples.length - 1]?.at ?? Date.now();
  const visible = samples.filter(s => !range || s.at >= end - range * 1000);
  const start = range ? end - range * 1000 : visible[0]?.at ?? end - 1000;
  const chosen = samples.find(s => s.at === selected);
  const exportCsv = () => {
    const rows = [management ? "timestamp,successful_queries,successful_queries_per_sample,failed_queries,failure_delta,rpc_round_trip_ms,response_state,event" : "timestamp,rx,receive_packets_per_second,decrypt_failures,decrypt_delta,management_query_ms,link,event", ...samples.map(s => [new Date(s.at).toISOString(), s.rx, s.rate, s.failures, s.delta, s.latency, s.link, s.event].join(","))];
    const url = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "receiver-analysis.csv"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const eventLabel = (event: string) => label(event, ({ readFailed: "Read failed", counterReset: "Counters reset", reconnected: "Link restored", disconnected: "Link disconnected" } as Record<string, string>)[event] ?? event);
  return <section style={{ marginBottom: 20, minWidth: 0 }}>
    {!management && <div className="mb-4 text-sm font-semibold text-base-content">{label("title", "Receiver activity")}</div>}
    <Facts th={th} rows={[
      { label: label("channel", "Current channel"), value: management ?? String(dongle.status?.rfChannel ?? "—") },
      { label: label("link", "Keyboard link"), value: dongle.status?.link === "CONNECTED" ? label("connected", "Connected") : dongle.status?.link === "LOST" ? label("lost", "Disconnected") : "—" },
      { label: label("rate", "Receive rate (packets/s)"), value: active && !failed && rate !== undefined ? rate.toFixed(management ? 0 : 1) : "—" },
      { label: label("rx", "Received packets / decryption failures"), value: `${dongle.status?.rx ?? "—"} / ${dongle.status?.rxDecryptFail ?? "—"}` },
    ]} />
    <div className="my-6 flex flex-wrap items-end gap-4" data-monitor-toolbar>
      <div className="flex min-w-0 flex-col gap-2" style={{ flex: "1 1 240px", maxWidth: 420 }}>
        <span className="text-xs text-secondary-content">{label("range", "Time range")}</span>
        <Select th={th} label={label("range", "Time range")} value={String(range)} onChange={value => setRange(Number(value))}
          opts={[{ id: "60", label: label("minute", "1 minute") }, { id: "300", label: label("fiveMinutes", "5 minutes") }, { id: "0", label: label("session", "Session (up to 3600 samples)") }]} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <ActionButton th={th} label={active ? label("pause", "Pause monitoring") : label("start", "Start monitoring")} onClick={() => { setFailed(false); setActive(!active); }} />
        <ActionButton th={th} label={label("export", "Export CSV")} onClick={exportCsv} disabled={!samples.length} />
      </div>
    </div>
    {([
      ["rate", label("rate", "Receive rate (packets/s)")],
      ["delta", label("errors", "Decryption failures per sample")],
      ["latency", label("latency", "USB management query (ms)")],
      ["link", label("linkTimeline", "Link state: 1 connected / 0 disconnected")],
    ] as const).map(([key, title]) => {
      const value = (s: Sample) => key === "link" ? s.link === "CONNECTED" ? 1 : s.link === "LOST" ? 0 : undefined : s[key];
      const discrete = key === "delta" || (key === "rate" && !!management);
      const rawMax = Math.max(1, ...visible.map(s => value(s) ?? 0));
      const max = discrete ? Math.ceil(rawMax) : rawMax;
      const color = { rate: th.linkPrimary, delta: th.error, latency: th.warning, link: th.success }[key];
      const x = (at: number) => 44 + (at - start) / Math.max(1000, end - start) * 540;
      const y = (v: number) => 116 - v / max * 88;
      let previous: Sample | undefined;
      const path = visible.map(s => {
        const v = value(s);
        if (v === undefined) { previous = undefined; return ""; }
        const connected = previous && s.at - previous.at < 4000;
        const segment = connected ? key === "link" ? `H${x(s.at)}V${y(v)}` : `L${x(s.at)},${y(v)}` : `M${x(s.at)},${y(v)}`;
        previous = s;
        return segment;
      }).join(" ");
      const current = chosen && visible.includes(chosen) ? chosen : visible[visible.length - 1];
      const currentValue = current && value(current);
      return <figure key={key} style={{ margin: "12px 0", border: `1px solid ${th.border}`, background: th.layer1 }}>
        <figcaption style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, padding: "12px 16px", borderBottom: `1px solid ${th.border}`, fontSize: 12, color: th.textPrimary }}>
          <span aria-hidden="true" style={{ width: 16, height: 2, background: color, flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{title}</span>
          {key === "link" && <span style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 11, color: th.textHelper }}>
            {[[th.success, label("connected", "Connected")], [th.error, label("lost", "Disconnected")], [th.bg, label("gap", "Gap: no sample")]].map(([swatch, text]) => <span key={text} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><span aria-hidden="true" style={{ width: 6, height: 6, background: swatch, border: `1px solid ${th.borderStrong}` }} />{text}</span>)}
          </span>}
          <span style={{ fontFamily: "var(--font-mono)", color }}>{currentValue === undefined ? "—" : key === "link" ? currentValue === 1 ? label("connected", "Connected") : label("lost", "Disconnected") : currentValue.toFixed(discrete ? 0 : 1)}</span>
        </figcaption>
        <svg role="img" aria-label={title} viewBox={key === "link" ? "0 0 600 66" : "0 0 600 148"} style={{ display: "block", width: "100%", height: "auto", minHeight: 0, color: th.textHelper }}
          onMouseMove={event => { const box = event.currentTarget.getBoundingClientRect(); const at = start + ((event.clientX - box.left) / box.width * 600 - 44) / 540 * (end - start); const nearest = visible.reduce<Sample | undefined>((best, s) => !best || Math.abs(s.at - at) < Math.abs(best.at - at) ? s : best, undefined); if (nearest) setSelected(nearest.at); }}>
          {key === "link" ? <>
            <rect x="44" y="20" width="540" height="14" fill={th.bg} stroke={th.border} />
            {visible.map((s, i) => {
              const v = value(s); if (v === undefined) return null;
              const next = visible[i + 1];
              const until = Math.min(end, next?.at ?? s.at + 1000, s.at + 1500);
              const text = v === 1 ? label("connected", "Connected") : label("lost", "Disconnected");
              return <rect key={s.at} x={Math.min(583, x(s.at))} y="20" width={Math.min(584 - Math.min(583, x(s.at)), Math.max(1, x(until) - x(s.at)))} height="14" fill={v === 1 ? th.success : th.error}><title>{new Date(s.at).toLocaleTimeString()} — {text}</title></rect>;
            })}
          </> : <>
          {(discrete && max === 1 ? [0, 1] : [0, 0.5, 1]).map(f => <g key={f}>
            <line x1="44" y1={y(max * f)} x2="584" y2={y(max * f)} stroke={th.border} strokeDasharray={f === 0 ? undefined : "3 4"} />
            <text x="36" y={y(max * f) + 3} textAnchor="end" fill="currentColor" fontSize="10">{(max * f).toFixed(discrete && Number.isInteger(max * f) ? 0 : max < 10 ? 1 : 0)}</text>
          </g>)}
          <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          {visible.map(s => { const v = value(s); return v === undefined ? null : <circle key={s.at} cx={x(s.at)} cy={y(v)} r={s.at === selected ? 3.5 : visible.length < 90 ? 1.8 : 0} fill={color}><title>{new Date(s.at).toLocaleTimeString()} — {v.toFixed(discrete ? 0 : 1)}</title></circle>; })}
          </>}
          {chosen && chosen.at >= start && chosen.at <= end && <line x1={x(chosen.at)} x2={x(chosen.at)} y1={key === "link" ? 14 : 20} y2={key === "link" ? 40 : 116} stroke={th.borderStrong} strokeDasharray="3 3" />}
          <text x="44" y={key === "link" ? 56 : 138} fill="currentColor" fontSize="10">{new Date(start).toLocaleTimeString()}</text><text x="584" y={key === "link" ? 56 : 138} textAnchor="end" fill="currentColor" fontSize="10">{new Date(end).toLocaleTimeString()}</text>
        </svg>
      </figure>;
    })}
    {chosen && <p style={{ fontSize: 12 }}>{new Date(chosen.at).toLocaleTimeString()} · {chosen.rate?.toFixed(management ? 0 : 1) ?? "—"} {management ? label("queries", "queries/sample") : "pkt/s"} · {chosen.latency?.toFixed(1) ?? "—"} ms · {chosen.link ?? "—"}</p>}
    <details><summary>{label("events", "Events")}</summary><div style={{ maxHeight: 180, overflow: "auto" }}>
      {samples.filter(s => s.event).slice(-100).reverse().map(s => <div key={s.at}><button type="button" onClick={() => { setSelected(s.at); setRange(0); }} style={{ color: th.textSecondary }}>{new Date(s.at).toLocaleTimeString()} · {eventLabel(s.event!)}</button></div>)}
      {!samples.some(s => s.event) && label("noEvents", "No events recorded.")}
    </div></details>
    <p style={{ fontSize: 12, color: th.textHelper }}>{failed ? label("failed", "Read failed; waiting for the next sample.") : !active ? label("paused", "Monitoring paused.") : label("sampling", "Sampling once per second while this page is visible.")}</p>
    <p style={{ fontSize: 12, color: th.textHelper }}>{label("note", "Activity is not signal strength. This firmware does not report RSSI, packet loss or retries; decryption failures are not packet loss.")}</p>
  </section>;
}
