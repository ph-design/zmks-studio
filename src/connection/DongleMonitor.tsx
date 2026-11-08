import { useEffect, useRef, useState } from "react";
import type { CarbonTheme } from "../carbon/theme";
import { Facts, ActionButton } from "../carbon/CarbonChrome";
import type { Translate } from "../misc/format";
import type { DongleController } from "./useDongle";

type Sample = { at: number; rx: number; rate?: number };
export function DongleMonitor({ th, t, dongle, autoStart = false }: { th: CarbonTheme; t: Translate; dongle: Pick<DongleController, "phase" | "busy" | "status" | "queryStatus">; autoStart?: boolean }) {
  const [active, setActive] = useState(autoStart);
  const [samples, setSamples] = useState<Sample[]>([]);
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
    const poll = async () => {
      const d = latest.current;
      if (d.phase === "open" && !d.busy && !document.hidden) {
        const result = await d.queryStatus();
        if (cancelled) return;
        const rx = result.rx;
        setFailed(rx === undefined);
        if (rx === undefined) setSamples([]);
        if (rx !== undefined && Number.isFinite(rx)) {
          const at = performance.now();
          setSamples(previous => {
            const last = previous[previous.length - 1];
            const sample = { at, rx, rate: last && rx >= last.rx && at > last.at ? (rx - last.rx) * 1000 / (at - last.at) : undefined };
            return [...(last && rx < last.rx ? [] : previous), sample].slice(-60);
          });
        }
      }
      if (!cancelled) timer = setTimeout(poll, 1000);
    };
    timer = setTimeout(poll, 1000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [active]);
  if (dongle.phase !== "open") return null;
  const label = (key: string, fallback: string) => t(`carbon.conn.monitor.${key}`, fallback);
  const rate = samples[samples.length - 1]?.rate;
  const max = Math.max(1, ...samples.map(s => s.rate ?? 0));
  return <section style={{ marginBottom: 20, minWidth: 0 }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
      <strong>{label("title", "Receiver activity")}</strong>
      <ActionButton th={th} label={active ? label("pause", "Pause monitoring") : label("start", "Start monitoring")} onClick={() => { setSamples([]); setFailed(false); setActive(!active); }} />
    </div>
    <Facts th={th} rows={[
      { label: label("channel", "Current channel"), value: String(dongle.status?.rfChannel ?? "—") },
      { label: label("link", "Keyboard link"), value: dongle.status?.link === "CONNECTED" ? label("connected", "Connected") : dongle.status?.link === "LOST" ? label("lost", "Disconnected") : "—" },
      { label: label("rate", "Receive rate (packets/s)"), value: active && !failed && rate !== undefined ? rate.toFixed(1) : "—" },
      { label: label("rx", "Received packets / decryption failures"), value: `${dongle.status?.rx ?? "—"} / ${dongle.status?.rxDecryptFail ?? "—"}` },
    ]} />
    <svg role="img" aria-label={label("chart", "Receive activity history (up to 60 samples)")} viewBox="0 0 600 90" style={{ width: "100%", height: 90, background: th.bg, color: th.textSecondary }}>
      <line x1="0" y1="85" x2="600" y2="85" stroke="currentColor" opacity="0.25" />
      {samples.map((s, i) => s.rate === undefined ? null : <rect key={s.at} x={i * 10} y={85 - s.rate / max * 80} width="8" height={Math.max(1, s.rate / max * 80)} fill="currentColor" />)}
      <text x="598" y="12" textAnchor="end" fill="currentColor" fontSize="11">{max.toFixed(1)} pkt/s</text>
    </svg>
    <p style={{ fontSize: 12, color: th.textHelper }}>{failed ? label("failed", "Read failed; waiting for the next sample.") : !active ? label("paused", "Monitoring paused.") : label("sampling", "Sampling once per second while this page is visible.")}</p>
    <p style={{ fontSize: 12, color: th.textHelper }}>{label("note", "Activity is not signal strength. This firmware does not report RSSI, packet loss or retries; decryption failures are not packet loss.")}</p>
  </section>;
}
