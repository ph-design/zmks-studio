import { useEffect, useState } from "react";
import type { CarbonTheme } from "../carbon/theme";
import { ActionButton, Facts, Notice, Select } from "../carbon/CarbonChrome";
import type { Translate } from "../misc/format";
import { receiverIndicator } from "./receiverState";
import type { DongleController } from "./useDongle";

export function DongleLedPanel({ th, t, dongle }: { th: CarbonTheme; t: Translate; dongle: DongleController }) {
  const s = dongle.status;
  const [mode, setMode] = useState("AUTO");
  const [brightness, setBrightness] = useState(100);
  const [threshold, setThreshold] = useState(20);
  const [period, setPeriod] = useState(2000);
  const [editing, setEditing] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string>();
  const label = (key: string, fallback: string) => t(`carbon.dongleLed.${key}`, fallback);
  const supported = s?.ledCaps === 1 && s.ledMode !== undefined && s.ledBrightness !== undefined && s.ledLowPct !== undefined && s.ledPeriodMs !== undefined;
  const disabled = dongle.phase !== "open" || dongle.busy || working || !supported;
  useEffect(() => {
    if (editing) return;
    setMode(s?.ledMode ?? "AUTO"); setBrightness(s?.ledBrightness ?? 100);
    setThreshold(s?.ledLowPct ?? 20); setPeriod(s?.ledPeriodMs ?? 2000);
  }, [s?.ledMode, s?.ledBrightness, s?.ledLowPct, s?.ledPeriodMs, editing]);
  useEffect(() => { if (dongle.phase !== "open") { setEditing(false); setMessage(undefined); } }, [dongle.phase]);
  const update = async (save: boolean) => {
    setWorking(true); setMessage(undefined);
    try {
      const applied = await dongle.send(`AT+LED=${mode},${brightness},${threshold},${period}`);
      if (!applied?.ok) return;
      const result = save ? await dongle.send("AT+LEDSAVE") : applied;
      if (result?.ok) {
        setEditing(false);
        setMessage(save ? label("saved", "Saved to receiver. Settings remain after unplugging.") : label("applied", "Applied. Save to keep these settings after unplugging."));
      } else setMessage(label("saveFailed", "Applied, but saving failed. These settings may be lost after unplugging."));
      await dongle.queryStatus();
    } finally { setWorking(false); }
  };
  const identify = async () => {
    setWorking(true); setMessage(undefined);
    try { const r = await dongle.send("AT+LEDIDENTIFY"); if (r?.ok) setMessage(label("identifying", "The receiver indicator flashes for 5 seconds, then returns to its configured mode.")); }
    finally { setWorking(false); }
  };
  return <section className="my-6 min-w-0 border-t border-base-300 pt-6">
    <h3 className="mb-3 text-sm font-semibold">{label("title", "Receiver indicator")}</h3>
    {!supported ? <Notice th={th} tone="neutral">{label("upgrade", "Indicator controls need compatible receiver firmware. Connection and pairing remain available.")}</Notice> : <>
      <p className="mb-4 text-xs text-helper">{label("hint", "Controls the user indicator only. Auto mode shows connection and keyboard low battery; the separate charging lamp is unchanged.")}</p>
      <Facts th={th} rows={[{ label: label("motionSummary", "Keyboard protection summary"), value: label(`motion_${receiverIndicator(s)}`, "Unknown") }, { label: label("pending", "Unsaved receiver settings"), value: s?.ledDirty ? label("yes", "Yes") : label("no", "No") }]} />
      <div className="my-3 rounded border border-base-300 p-3 text-xs leading-relaxed text-helper">
        <p>{label("motionRules", "Auto: all connected keyboards locked — full breathing; some locked — shallow breathing; none locked — normal status.")}</p>
        <p className="mt-1">{label("motionPriority", "Connection/disconnection double flashes, identification and low-battery warnings take priority. Unknown states are never treated as locked.")}</p>
        <p className="mt-1">{label("motionFirmware", "Lock telemetry requires compatible keyboard firmware. Breathing uses a fixed 2.4 s cycle; the blink-cycle setting below controls the legacy status pattern.")}</p>
      </div>
      <fieldset disabled={disabled} className="my-4 grid min-w-0 gap-4 sm:grid-cols-2">
        <label className="flex min-w-0 flex-col gap-2 text-xs">{label("mode", "Mode")}
          <Select th={th} label={label("mode", "Mode")} value={mode} onChange={v => { setMode(v); setEditing(true); setMessage(undefined); }} opts={[
            {id:"AUTO",label:label("auto","Auto status")},{id:"ON",label:label("on","Always on")},{id:"OFF",label:label("off","Off")},
          ]} />
        </label>
        <label className="flex min-w-0 flex-col gap-2 text-xs">{label("brightness", "Brightness")} · {brightness}%
          <input aria-label={label("brightness", "Brightness")} type="range" min="0" max="100" step="5" value={brightness} onChange={e => { setBrightness(Number(e.target.value)); setEditing(true); setMessage(undefined); }} />
        </label>
        <label className="flex min-w-0 flex-col gap-2 text-xs">{label("threshold", "Low battery threshold")} · {threshold}%
          <input aria-label={label("threshold", "Low battery threshold")} type="range" min="5" max="50" step="5" value={threshold} onChange={e => { setThreshold(Number(e.target.value)); setEditing(true); setMessage(undefined); }} />
        </label>
        <label className="flex min-w-0 flex-col gap-2 text-xs">{label("period", "Blink cycle")} · {(period/1000).toFixed(1)} s
          <input aria-label={label("period", "Blink cycle")} type="range" min="500" max="5000" step="100" value={period} onChange={e => { setPeriod(Number(e.target.value)); setEditing(true); setMessage(undefined); }} />
        </label>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <ActionButton th={th} label={label("apply", "Apply")} disabled={disabled} onClick={() => void update(false)} />
        <ActionButton th={th} primary label={label("save", "Save to receiver")} disabled={disabled} onClick={() => void update(true)} />
        <ActionButton th={th} label={label("identify", "Identify receiver")} disabled={disabled} onClick={() => void identify()} />
      </div>
      {message && <p role="status" className="mt-3 text-xs text-helper">{message}</p>}
    </>}
  </section>;
}
