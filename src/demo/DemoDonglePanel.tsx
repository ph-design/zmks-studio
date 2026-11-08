import { useRef, useState } from "react";
import type { CarbonTheme } from "../carbon/theme";
import { SettingsBlock, Notice } from "../carbon/CarbonChrome";
import { DongleMonitor } from "../connection/DongleMonitor";
import type { DongleStatus } from "../connection/useDongle";
import type { Translate } from "../misc/format";

export function DemoDonglePanel({ th, t }: { th: CarbonTheme; t: Translate }) {
  const [scenario, setScenario] = useState("cycle");
  const [status, setStatus] = useState<DongleStatus>({ rfChannel: 38, link: "CONNECTED", rx: 1200, rxDecryptFail: 0 });
  const state = useRef({ rx: 1200, tick: 0, errors: 0 });
  const queryStatus = async () => {
    const current = state.current;
    const tick = current.tick++ % 30;
    await new Promise(resolve => setTimeout(resolve, 15 + tick * 2));
    if (scenario === "readFailure" && tick % 5 === 0) return {};
    const connected = scenario === "disconnect" ? tick < 15 : scenario === "cycle" ? tick < 25 : true;
    if (scenario === "reset" && tick === 15) { current.rx = 0; current.errors = 0; }
    if (scenario === "errors" && tick % 4 === 0) current.errors += 3;
    current.rx += connected ? (scenario === "idle" || tick >= 20 ? 4 : Math.round(4 + 60 * Math.pow(Math.sin(tick / 4), 2))) : 0;
    const next = { rfChannel: 38, link: connected ? "CONNECTED" : "LOST", rx: current.rx, rxDecryptFail: current.errors };
    setStatus(next);
    return next;
  };
  return <SettingsBlock th={th} title={t("carbon.conn.monitor.demoTitle", "Demo receiver")}>
    <Notice th={th} tone="neutral">{t("carbon.conn.monitor.demoNote", "Simulated data: cycles through activity, idle and disconnection. No serial port or receiver hardware is used.")}</Notice>
    <label>{t("carbon.conn.monitor.scenario", "Demo scenario")} <select value={scenario} onChange={e => { state.current = { rx: 1200, tick: 0, errors: 0 }; setScenario(e.target.value); }} style={{ background: th.bg, color: th.textSecondary }}>
      {["cycle", "idle", "disconnect", "errors", "reset", "readFailure"].map(id => <option key={id} value={id}>{t(`carbon.conn.monitor.scenario_${id}`, id)}</option>)}
    </select></label>
    <DongleMonitor key={scenario} th={th} t={t} autoStart dongle={{ phase: "open", busy: false, status, queryStatus }} />
  </SettingsBlock>;
}
