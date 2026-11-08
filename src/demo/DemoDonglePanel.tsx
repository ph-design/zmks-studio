import { useRef, useState } from "react";
import type { CarbonTheme } from "../carbon/theme";
import { SettingsBlock, Notice } from "../carbon/CarbonChrome";
import { DongleMonitor } from "../connection/DongleMonitor";
import type { DongleStatus } from "../connection/useDongle";
import type { Translate } from "../misc/format";

export function DemoDonglePanel({ th, t }: { th: CarbonTheme; t: Translate }) {
  const [status, setStatus] = useState<DongleStatus>({ rfChannel: 38, link: "CONNECTED", rx: 1200, rxDecryptFail: 0 });
  const state = useRef({ rx: 1200, tick: 0 });
  const queryStatus = async () => {
    const current = state.current;
    const tick = current.tick++ % 30;
    const connected = tick < 25;
    current.rx += connected ? (tick >= 20 ? 4 : Math.round(4 + 60 * Math.pow(Math.sin(tick / 4), 2))) : 0;
    const next = { rfChannel: 38, link: connected ? "CONNECTED" : "LOST", rx: current.rx, rxDecryptFail: 0 };
    setStatus(next);
    return next;
  };
  return <SettingsBlock th={th} title={t("carbon.conn.monitor.demoTitle", "Demo receiver")}>
    <Notice th={th} tone="neutral">{t("carbon.conn.monitor.demoNote", "Simulated data: cycles through activity, idle and disconnection. No serial port or receiver hardware is used.")}</Notice>
    <DongleMonitor th={th} t={t} autoStart dongle={{ phase: "open", busy: false, status, queryStatus }} />
  </SettingsBlock>;
}
