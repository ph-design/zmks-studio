import { useCallback, useContext, useEffect, useState } from "react";

import { LockState } from "@zmkfirmware/zmk-studio-ts-client/core";
import type { RequestResponse } from "@zmkfirmware/zmk-studio-ts-client";
import type {
  Diagnostics,
  FirmwareInfo,
  HardwareInfo,
  Identity,
  RuntimeState,
} from "@zmkfirmware/zmk-studio-ts-client/sysinfo";

import { ConnectionContext } from "../rpc/ConnectionContext";
import { LockStateContext } from "../rpc/LockStateContext";
import { call_rpc } from "../rpc/logging";

// Fetch sysinfo groups independently and tolerate unsupported firmware.
export type GroupStatus = "idle" | "loading" | "ok" | "unavailable";

export interface SysInfoGroup<T> {
  status: GroupStatus;
  data?: T;
}

export interface SysInfoState {
  identity: SysInfoGroup<Identity>;
  firmware: SysInfoGroup<FirmwareInfo>;
  hardware: SysInfoGroup<HardwareInfo>;
  runtime: SysInfoGroup<RuntimeState>;
  diagnostics: SysInfoGroup<Diagnostics>;
}

export interface SysInfoResult extends SysInfoState {
  loaded: boolean;
  busy: boolean;
  loadedAt: number | null;
  refresh: () => void;
}

const idleState = (): SysInfoState => ({
  identity: { status: "idle" },
  firmware: { status: "idle" },
  hardware: { status: "idle" },
  runtime: { status: "idle" },
  diagnostics: { status: "idle" },
});

const loadingState = (): SysInfoState => ({
  identity: { status: "loading" },
  firmware: { status: "loading" },
  hardware: { status: "loading" },
  runtime: { status: "loading" },
  diagnostics: { status: "loading" },
});

// Ignore empty or stub responses.
const hasIdentity = (d: Identity) =>
  !!(d.name || d.model || d.manufacturer || d.family || d.serialNumber.length);

const hasFirmware = (d: FirmwareInfo) =>
  !!(d.zmkVersion || d.zephyrVersion || d.board || d.studioProtocol || d.imageSizeKb);

const hasHardware = (d: HardwareInfo) =>
  !!(
    d.mcu ||
    d.flashKb ||
    d.keyCount ||
    d.ledCount ||
    d.layoutCount ||
    d.resetCause ||
    d.hasUsb ||
    d.hasBle ||
    d.has2g4
  );

const hasRuntime = (d: RuntimeState) =>
  !!(
    d.endpoint ||
    d.uptimeS ||
    d.highestLayer ||
    d.bleConnected ||
    d.usbPresent ||
    d.batteryPercent !== 0
  );

const hasDiagnostics = (d: Diagnostics) =>
  !!(
    d.workqStackUsedPct ||
    d.heapFree ||
    d.settingsSavePending ||
    d.twoG4TxTotal
  );

function settle<T>(
  result: PromiseSettledResult<RequestResponse>,
  read: (resp: RequestResponse) => T | undefined,
  usable: (data: T) => boolean
): SysInfoGroup<T> {
  if (result.status !== "fulfilled") return { status: "unavailable" };

  // call_rpc may return an Error instead of rejecting.
  const raw: unknown = result.value;
  if (!raw || raw instanceof Error) return { status: "unavailable" };

  const resp = raw as RequestResponse;
  if (resp.meta?.noResponse || resp.meta?.simpleError !== undefined) {
    return { status: "unavailable" };
  }

  const data = read(resp);
  return data && usable(data) ? { status: "ok", data } : { status: "unavailable" };
}

/** Keep previous data visible during refresh. */
function anyAnswered(state: SysInfoState): boolean {
  return Object.values(state).some((group) => group.status === "ok");
}

export function useSysInfo(): SysInfoResult {
  const connection = useContext(ConnectionContext);
  const lockState = useContext(LockStateContext);
  const unlocked = lockState === LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED;

  const [state, setState] = useState<SysInfoState>(idleState);
  const [loaded, setLoaded] = useState(false);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [nonce, setNonce] = useState(0);

  const conn = connection.conn;

  useEffect(() => {
    let active = true;

    if (!conn || !unlocked) {
      setState(idleState());
      setLoaded(false);
      setLoadedAt(null);
      setBusy(false);
      return;
    }

    setState((prev) => (anyAnswered(prev) ? prev : loadingState()));
    setBusy(true);
    setLoaded(false);

    (async () => {
      const results = await Promise.allSettled([
        call_rpc(conn, { sysinfo: { getIdentity: true } }),
        call_rpc(conn, { sysinfo: { getFirmware: true } }),
        call_rpc(conn, { sysinfo: { getHardware: true } }),
        call_rpc(conn, { sysinfo: { getRuntime: true } }),
        call_rpc(conn, { sysinfo: { getDiagnostics: true } }),
      ]);

      if (!active) return;

      setState({
        identity: settle(results[0], (r) => r.sysinfo?.identity, hasIdentity),
        firmware: settle(results[1], (r) => r.sysinfo?.firmware, hasFirmware),
        hardware: settle(results[2], (r) => r.sysinfo?.hardware, hasHardware),
        runtime: settle(results[3], (r) => r.sysinfo?.runtime, hasRuntime),
        diagnostics: settle(results[4], (r) => r.sysinfo?.diagnostics, hasDiagnostics),
      });
      setLoaded(true);
      setLoadedAt(Date.now());
      setBusy(false);
    })();

    return () => {
      active = false;
    };
  }, [conn, unlocked, nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  return { ...state, loaded, loadedAt, busy, refresh };
}
