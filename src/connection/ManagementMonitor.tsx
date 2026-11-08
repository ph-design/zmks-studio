import { useContext, useRef, useState } from "react";
import type { CarbonTheme } from "../carbon/theme";
import { SettingsBlock, Notice } from "../carbon/CarbonChrome";
import { ConnectionContext } from "../rpc/ConnectionContext";
import { call_rpc } from "../rpc/logging";
import type { Translate } from "../misc/format";
import type { DongleStatus } from "./useDongle";
import { DongleMonitor } from "./DongleMonitor";

export function ManagementMonitor({ th, t, connectionType }: { th: CarbonTheme; t: Translate; connectionType?: string }) {
  const conn = useContext(ConnectionContext).conn;
  const demo = conn?.label === "Demo";
  const [mode, setMode] = useState("USB");
  const [scenario, setScenario] = useState("normal");
  return <SettingsBlock th={th} title={t("carbon.conn.management.title", "Studio management channel")}>
    {demo && <><Notice th={th} tone="neutral">{t("carbon.conn.management.demo", "Simulated USB/Bluetooth management traffic; no hardware is accessed.")}</Notice>
      <label>{t("carbon.conn.management.mode", "Demo transport")} <select value={mode} onChange={e => setMode(e.target.value)}><option>USB</option><option>BLE</option></select></label>
      <label style={{ marginLeft: 12 }}>{t("carbon.conn.monitor.scenario", "Demo scenario")} <select value={scenario} onChange={e => setScenario(e.target.value)}>
        <option value="normal">{t("carbon.conn.management.normal", "Stable responses")}</option><option value="slow">{t("carbon.conn.management.slow", "Variable response time")}</option><option value="failure">{t("carbon.conn.management.failure", "Intermittent query failures")}</option>
      </select></label></>}
    {conn && <Probe key={`${conn.label}-${mode}-${scenario}`} th={th} t={t} mode={demo ? mode : connectionType ?? "Studio"} demo={demo} scenario={scenario} />}
  </SettingsBlock>;
}
function Probe({ th, t, mode, demo, scenario }: { th: CarbonTheme; t: Translate; mode: string; demo: boolean; scenario: string }) {
  const conn = useContext(ConnectionContext).conn!;
  const [status, setStatus] = useState<DongleStatus>();
  const counters = useRef({ rx: 0, errors: 0, tick: 0, pending: false });
  const queryStatus = async (): Promise<DongleStatus> => {
    const c = counters.current;
    if (c.pending) return {};
    c.pending = true;
    let success = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (demo) {
        c.tick++;
        await new Promise(resolve => setTimeout(resolve, (mode === "BLE" ? 35 : 8) + (scenario === "slow" ? (c.tick % 5) * 100 : c.tick % 7)));
        success = scenario !== "failure" || c.tick % 5 !== 0;
        c.pending = false;
      } else {
        // Keep a timed-out request marked pending until the transport settles.
        const request = call_rpc(conn, { core: { getDeviceInfo: true } }).finally(() => { c.pending = false; });
        const response = await Promise.race([request, new Promise<undefined>(resolve => { timer = setTimeout(() => resolve(undefined), 3000); })]);
        success = !!response?.core?.getDeviceInfo;
      }
    } catch { c.pending = false; } finally { if (timer) clearTimeout(timer); }
    if (success) c.rx++; else c.errors++;
    const next = { rx: c.rx, rxDecryptFail: c.errors, link: success ? "CONNECTED" : "LOST" };
    setStatus(next);
    return next;
  };
  return <DongleMonitor th={th} t={t} autoStart={demo} management={mode} dongle={{ phase: "open", get busy() { return counters.current.pending; }, status, queryStatus }} />;
}
