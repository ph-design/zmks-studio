// Shared connection state, RPC actions and 2.4G pairing helpers.
import { useContext, useEffect, useMemo, useSyncExternalStore } from "react";

import type { RequestResponse, RpcConnection } from "@zmkfirmware/zmk-studio-ts-client";
import { ErrorConditions } from "@zmkfirmware/zmk-studio-ts-client/meta";
import {
  Transport,
  type Response as ConnectionResponse,
  type SelectTransportResponse,
  type State,
} from "@zmkfirmware/zmk-studio-ts-client/connection";

import { ConnectionContext } from "../rpc/ConnectionContext";
import { call_rpc } from "../rpc/logging";
import { useSub } from "../usePubSub";
import { DASH, keyIdHex, toHex, transportName } from "../misc/format";
import { ConnRpcError } from "../misc/errors";
import type { AtResult, DongleStatus } from "./useDongle";

// unsupported means built without the subsystem, not an error.
export type ConnectionSupport = "loading" | "ready" | "unsupported" | "error";

export interface ConnectionSnapshot {
  support: ConnectionSupport;
  state?: State;
  detail?: string;
}

let snapshot: ConnectionSnapshot = { support: "loading" };
let activeConnection: Parameters<typeof call_rpc>[0] | null = null;
let requestGeneration = 0;
const listeners = new Set<() => void>();

function publish(next: ConnectionSnapshot): void {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useConnectionSnapshot(): ConnectionSnapshot {
  return useSyncExternalStore(subscribe, () => snapshot);
}

// Only RPC_NOT_FOUND means anything else stays retryable.
export async function refreshConnectionState(conn: RpcConnectionLike | null): Promise<void> {
  if (!conn) {
    activeConnection = null;
    requestGeneration++;
    publish({ support: "loading" });
    return;
  }

  if (activeConnection !== conn) {
    activeConnection = conn;
    publish({ support: "loading" });
  }
  const generation = ++requestGeneration;

  // A transport switch can leave the old RPC unanswered.
  const raw: unknown = await Promise.race([
    call_rpc(conn, { connection: { getState: true } }),
    new Promise<Error>((resolve) =>
      setTimeout(() => resolve(new Error("get_state timed out")), 3000)
    ),
  ]);

  if (generation !== requestGeneration || activeConnection !== conn) return;

  if (raw instanceof Error) {
    const missing = (raw as { condition?: ErrorConditions }).condition === ErrorConditions.RPC_NOT_FOUND;

    if (missing) {
      publish({ support: "unsupported", detail: raw.message });
    } else if (!snapshot.state) {
      publish({ support: "error", detail: raw.message });
    }
    return;
  }

  const state = (raw as RequestResponse).connection?.getState;
  if (!state) {
    if (!snapshot.state) publish({ support: "error", detail: "firmware returned no connection state" });
    return;
  }

  publish({ support: "ready", state });
}

type RpcConnectionLike = Parameters<typeof call_rpc>[0];
type RpcRequest = Parameters<typeof call_rpc>[1];

export interface ConnectionActions {
  refresh: () => Promise<void>;
  selectTransport: (target: Transport) => Promise<SelectTransportResponse>;
  selectBleProfile: (index: number) => Promise<void>;
  unpairBleProfile: (index: number) => Promise<void>;
  unpairAllBle: () => Promise<void>;
}

export function useConnectionActions(): ConnectionActions {
  const conn = useContext(ConnectionContext).conn;

  return useMemo<ConnectionActions>(() => {
    const requireConn = (): RpcConnectionLike => {
      if (!conn) {
        throw new ConnRpcError("carbon.conn.notConnected", "Keyboard is not connected");
      }
      return conn;
    };

    const adopt = (state: State | undefined): void => {
      if (state && activeConnection === conn) publish({ support: "ready", state });
    };

    const request = async (payload: RpcRequest): Promise<ConnectionResponse> => {
      const raw: unknown = await call_rpc(requireConn(), payload);
      if (raw instanceof Error) {
        throw new ConnRpcError("carbon.conn.rpcFailed", "RPC failed", raw.message);
      }
      const response = (raw as RequestResponse).connection;
      if (!response) {
        throw new ConnRpcError("carbon.conn.rpcNoResult", "Firmware returned no connection reply");
      }
      return response;
    };

    return {
      async refresh() {
        await refreshConnectionState(requireConn());
      },

      async selectTransport(target) {
        const response = await request({ connection: { selectTransport: { transport: target } } });
        const result = response.selectTransport;
        if (!result) {
          throw new ConnRpcError("carbon.conn.rpcNoResult", "Firmware returned no switch result");
        }
        adopt(result.state);
        return result;
      },

      async selectBleProfile(index) {
        adopt((await request({ connection: { selectBleProfile: { index } } })).selectBleProfile);
      },

      async unpairBleProfile(index) {
        adopt((await request({ connection: { unpairBleProfile: { index } } })).unpairBleProfile);
      },

      async unpairAllBle() {
        adopt((await request({ connection: { unpairAllBle: true } })).unpairAllBle);
      },
    };
  }, [conn]);
}

export function useConnectionRuntime(): ConnectionSnapshot {
  const snapshotValue = useConnectionSnapshot();
  const conn = useContext(ConnectionContext).conn;

  useEffect(() => {
    void refreshConnectionState(conn);
    return () => {
      if (activeConnection === conn) {
        activeConnection = null;
        requestGeneration++;
      }
      publish({ support: "loading" });
    };
  }, [conn]);

  useSub("rpc_notification.connection.connectionStateChanged", () => {
    if (conn) void refreshConnectionState(conn);
  });

  return snapshotValue;
}

export type LinkTone = "usb" | "ble" | "2g4";

// Footer badge
export function linkBadge(
  value: ConnectionSnapshot,
  connectionType?: string
): { label?: string; tone: LinkTone } {
  const fallbackTone: LinkTone = connectionType === "2.4G" ? "2g4" : connectionType === "BLE" ? "ble" : "usb";
  const state = value.support === "ready" ? value.state : undefined;
  if (!state) return { tone: fallbackTone };

  const tone: LinkTone =
    state.activeTransport === Transport.ZMK_CONNECTION_TRANSPORT_2G4
      ? "2g4"
      : state.activeTransport === Transport.ZMK_CONNECTION_TRANSPORT_BLE
        ? "ble"
        : "usb";

  const derived = transportName(state.activeTransport, state.bleActiveProfile);
  const label = state.endpoint?.trim() || (derived === DASH ? undefined : derived);

  return { label, tone };
}

export interface KeyboardPairState {
  usesFactoryKey: boolean;
  keyId: string;
  addrPaired: boolean;
  rfAddrHex: string;
  rfChannel: number;
}

export interface GeneratedPairing {
  keyId: string;
  key: Uint8Array;
  keyHex: string;
  rfAddr: Uint8Array;
  rfAddrHex: string;
  rfChannel: number;
}

export interface DonglePairSink {
  pair(keyHex: string, rfAddrHex: string, channel: number): Promise<AtResult>;
  queryStatus(): Promise<DongleStatus>;
}

function pairingFailure(error: Error): ConnRpcError {
  const condition = (error as { condition?: ErrorConditions }).condition;

  if (condition === ErrorConditions.RPC_NOT_FOUND) {
    return new ConnRpcError("carbon.conn.pairingMissing", "Firmware has no pairing subsystem", error.message);
  }
  if (condition === ErrorConditions.UNLOCK_REQUIRED) {
    return new ConnRpcError(
      "carbon.conn.rfLocked",
      "The keyboard is locked, so it refuses to hand out a pairing key. Unlock it with its own gesture first.",
      error.message
    );
  }

  return new ConnRpcError(
    "carbon.conn.rfRejected",
    "The keyboard refused the pairing request.",
    error.message
  );
}

async function pairingRequest(
  conn: RpcConnection,
  request: Parameters<typeof call_rpc>[1]
): Promise<NonNullable<Awaited<ReturnType<typeof call_rpc>>["pairing"]>> {
  const raw: unknown = await call_rpc(conn, request);
  if (raw instanceof Error) {
    throw pairingFailure(raw);
  }

  const response = (raw as Awaited<ReturnType<typeof call_rpc>>).pairing;
  if (!response) {
    throw new ConnRpcError("carbon.conn.pairingMissing", "Firmware has no pairing subsystem");
  }

  return response;
}

export async function getKeyboardPairState(conn: RpcConnection): Promise<KeyboardPairState> {
  const response = await pairingRequest(conn, { pairing: { getPairState: {} } });
  const state = response.getPairState;
  if (!state) {
    throw new ConnRpcError("carbon.conn.rpcNoResult", "Firmware returned no pairing state");
  }

  return {
    usesFactoryKey: state.usesFactoryKey,
    keyId: keyIdHex(state.keyId),
    addrPaired: state.addrPaired,
    rfAddrHex: toHex(state.rfAddr),
    rfChannel: state.rfChannel,
  };
}

export async function generateKeyboardPairing(conn: RpcConnection): Promise<GeneratedPairing> {
  const response = await pairingRequest(conn, { pairing: { generateAndPair: {} } });
  const generated = response.generateAndPair;
  if (!generated) {
    throw new ConnRpcError("carbon.conn.pairErrorGenerate", "Keyboard did not generate a pairing");
  }

  const keyHex = toHex(generated.key);
  const rfAddrHex = toHex(generated.rfAddr);
  if (keyHex.length !== 32 || rfAddrHex.length !== 10) {
    throw new ConnRpcError(
      "carbon.conn.pairErrorGenerate",
      "Keyboard returned an incomplete pairing",
      `key=${keyHex || "∅"} addr=${rfAddrHex || "∅"}`
    );
  }

  return {
    keyId: keyIdHex(generated.keyId),
    key: generated.key,
    keyHex,
    rfAddr: generated.rfAddr,
    rfAddrHex,
    rfChannel: generated.rfChannel,
  };
}

export async function clearKeyboardPairing(conn: RpcConnection): Promise<void> {
  await pairingRequest(conn, { pairing: { clearPairing: {} } });
}

export function atPairCommand(generated: GeneratedPairing): string {
  const channel = generated.rfChannel.toString(16).toUpperCase().padStart(2, "0");
  return `AT+PAIR=${generated.keyHex},${generated.rfAddrHex},${channel}`;
}

export type ConsistencyId = "keyId" | "rfAddr" | "rfChannel";

export interface ConsistencyRow {
  id: ConsistencyId;
  keyboard: string;
  dongle: string;
  match: boolean;
}

export function comparePairings(
  keyboard: Pick<GeneratedPairing, "keyId" | "rfAddrHex" | "rfChannel">,
  dongle: DongleStatus | undefined
): ConsistencyRow[] {
  const keyId = dongle?.keyId?.toUpperCase();
  const rfAddr = dongle?.rfAddr?.toUpperCase();

  const rows: ConsistencyRow[] = [
    { id: "keyId", keyboard: keyboard.keyId, dongle: keyId ?? "", match: !!keyId && keyId === keyboard.keyId },
    {
      id: "rfAddr",
      keyboard: keyboard.rfAddrHex,
      dongle: rfAddr ?? "",
      match: !!rfAddr && rfAddr === keyboard.rfAddrHex,
    },
    {
      id: "rfChannel",
      keyboard: String(keyboard.rfChannel),
      dongle: dongle?.rfChannel === undefined ? "" : String(dongle.rfChannel),
      match: dongle?.rfChannel !== undefined && dongle.rfChannel === keyboard.rfChannel,
    },
  ];

  return rows;
}

export type PairStepId = "generate" | "atPair" | "verify";

export interface PairStep {
  id: PairStepId;
  ok: boolean;
  detail?: string;
  errorKey?: string;
}

export interface PairOutcome {
  ok: boolean;
  steps: PairStep[];
  generated?: GeneratedPairing;
  status?: DongleStatus;
  rows: ConsistencyRow[];
  errorKey?: string;
  errorDetail?: string;
}

function atErrorKey(detail: string): string {
  if (/STORAGE/i.test(detail)) return "carbon.conn.pairErrorStorage";
  if (/INVALID_ARGS|USAGE/i.test(detail)) return "carbon.conn.pairErrorAtArgs";
  if (/NOT_IMPLEMENTED/i.test(detail)) return "carbon.conn.pairErrorNoAt";
  return "carbon.conn.pairErrorAt";
}

export async function runOneClickPair(
  conn: RpcConnection | null,
  dongle: DonglePairSink
): Promise<PairOutcome> {
  const steps: PairStep[] = [];

  if (!conn) {
    return {
      ok: false,
      steps,
      rows: [],
      errorKey: "carbon.conn.pairErrorNoKeyboard",
      errorDetail: "keyboard RPC not connected",
    };
  }

  let generated: GeneratedPairing;
  try {
    generated = await generateKeyboardPairing(conn);
    steps.push({ id: "generate", ok: true });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    steps.push({ id: "generate", ok: false, errorKey: "carbon.conn.pairErrorGenerate", detail });
    return {
      ok: false,
      steps,
      rows: [],
      errorKey: "carbon.conn.pairErrorGenerate",
      errorDetail: detail,
    };
  }

  const reply = await dongle.pair(generated.keyHex, generated.rfAddrHex, generated.rfChannel);
  if (!reply.ok) {
    const detail = reply.note || reply.raw.trim() || (reply.timedOut ? "timeout" : "ERROR");
    const errorKey = atErrorKey(detail);
    steps.push({ id: "atPair", ok: false, errorKey, detail });
    return { ok: false, steps, generated, rows: [], errorKey, errorDetail: detail };
  }
  steps.push({ id: "atPair", ok: true });

  let status: DongleStatus | undefined;
  try {
    status = await dongle.queryStatus();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    steps.push({ id: "verify", ok: false, errorKey: "carbon.conn.pairErrorVerify", detail });
    return {
      ok: false,
      steps,
      generated,
      rows: comparePairings(generated, undefined),
      errorKey: "carbon.conn.pairErrorVerify",
      errorDetail: detail,
    };
  }

  const rows = comparePairings(generated, status);
  const matched = rows.every((row) => row.match);
  steps.push({ id: "verify", ok: matched });

  return {
    ok: matched,
    steps,
    generated,
    status,
    rows,
    errorKey: matched ? undefined : "carbon.conn.pairErrorVerify",
  };
}
