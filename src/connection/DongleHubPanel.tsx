import { useEffect, useRef, useState } from "react";
import type { CarbonTheme } from "../carbon/theme";
import { ActionButton, ConfirmAction, Facts, Notice } from "../carbon/CarbonChrome";
import type { Translate } from "../misc/format";
import type { DongleController } from "./useDongle";

export function DongleHubPanel({ th, t, dongle }: { th: CarbonTheme; t: Translate; dongle: DongleController }) {
  const [working, setWorking] = useState(false);
  const s = dongle.status;
  const [watchUntil, setWatchUntil] = useState(0);
  const dongleRef = useRef(dongle);
  dongleRef.current = dongle;
  useEffect(() => {
    if (!watchUntil || dongle.phase !== "open") return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (stopped) return;
      if (Date.now() >= watchUntil) { setWatchUntil(0); return; }
      if (!dongleRef.current.busy) await dongleRef.current.queryStatus(true);
      if (!stopped) timer = setTimeout(() => void poll(), 750);
    };
    timer = setTimeout(() => void poll(), 400);
    return () => { stopped = true; clearTimeout(timer); };
  }, [watchUntil, dongle.phase]);
  const label = (key: string, fallback: string) => t(`carbon.dongleHub.${key}`, fallback);
  if (!s?.studio2g4 && !s?.bleMouse) return null;
  const disabled = working || dongle.busy || dongle.phase !== "open";
  const command = async (text: string) => {
    setWorking(true);
    try {
      if ((await dongle.send(text))?.ok) {
        setWatchUntil(Date.now() + (text === "AT+BLEPAIR" ? 35000 : 15000));
        await dongle.queryStatus();
      }
    }
    finally { setWorking(false); }
  };
  const state = s.bleState === "READY" ? label("ready", "Connected")
    : s.bleState === "CONNECTING" ? label("connecting", "Connecting / preparing HID")
    : s.bleState === "SCANNING" ? label("scanning", "Scanning") : label("idle", "Not connected");
  return <section className="my-6 min-w-0 border-t border-base-300 pt-6">
    <h3 className="mb-3 text-sm font-semibold">{label("title", "Wireless hub")}</h3>
    {s.studio2g4 && <div className="mb-4"><Notice th={th} tone="neutral" title={label("studio", "Remap over 2.4G")}>
      {label("studioHint", "Choose 2.4G receiver on the connection screen, select its Studio serial port, then unlock the keyboard. Keep the keyboard on battery; this management port controls receiver settings and the BLE mouse.")}
    </Notice></div>}
    {s.bleMouse && <>
      <p className="mb-4 text-xs text-helper">{label("hint", "Connect one BLE HID mouse alongside the 2.4G keyboard. Put the mouse in pairing mode, scan, and choose it below. Pairing may briefly interrupt the keyboard link. Do not pair the mouse in the PC's Bluetooth dialog.")}</p>
      <Facts th={th} rows={[
        { label: label("state", "BLE mouse"), value: state },
        { label: label("reports", "Mouse reports received"), value: String(s.bleRx ?? 0) },
        ...(s.bleError && s.bleState !== "READY" ? [{ label: label("error", "BLE diagnostic code"), value: String(s.bleError) }] : []),
      ]} />
      <div className="my-4 flex flex-wrap gap-2">
        <ActionButton th={th} label={label("scan", "Scan for mouse")} disabled={disabled || s.bleState === "READY" || s.bleState === "CONNECTING"} onClick={() => void command("AT+BLEPAIR")} />
        <ConfirmAction th={th} t={t} tone="danger" label={label("clear", "Forget BLE mouse")}
          confirmLabel={label("clearConfirm", "Click again to forget")}
          hint={label("clearHint", "Removes only the receiver's BLE mouse bond. Keyboard 2.4G pairing is preserved.")}
          disabled={disabled} onConfirm={() => command("AT+BLECLEAR")} />
      </div>
      {s.bleState !== "READY" && s.bleState !== "CONNECTING" && (s.bleDevices ?? []).map(d => <div key={d.index} className="mb-2 flex min-w-0 flex-wrap items-center justify-between gap-3 border border-base-300 p-3">
        <div className="min-w-0"><div className="break-words text-sm">{d.name}</div><div className="text-xs text-helper">{d.rssi} dBm</div></div>
        <ActionButton th={th} label={label("connect", "Connect")} disabled={disabled || s.bleState !== "SCANNING"} onClick={() => void command(`AT+BLECONNECT=${d.index}`)} />
      </div>)}
    </>}
  </section>;
}
