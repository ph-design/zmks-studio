import type { RpcConnection } from "@zmkfirmware/zmk-studio-ts-client";
import type { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import {
  Orientation,
  type Capabilities as BaseCapabilities,
  type CarryConfig as BaseCarryConfig,
  type LiveState,
  type Request as MotionRequest,
  type Response as MotionResponse,
  type StillWakeConfig,
  type TapConfig,
} from "@zmkfirmware/zmk-studio-ts-client/motion";

import { call_rpc } from "../rpc/logging";
import { DEMO_LABEL, getDemoMotionBackend } from "../demo/motionBackend";

import type { GuardSettings } from "./guardProtocol";
export type CarryConfig = BaseCarryConfig & Partial<GuardSettings>;
export type MotionCapabilities = BaseCapabilities & { guardVersion?: number };
// Generated codec types, re-exported so the app imports motion types from here.
export { Orientation };
export type {
  LiveState as MotionLiveState,
  StillWakeConfig,
  TapConfig,
};

export type TapSlot =
  | "leftSingleBinding"
  | "leftDoubleBinding"
  | "rightSingleBinding"
  | "rightDoubleBinding";

export const TAP_SLOTS: { slot: TapSlot; side: "left" | "right"; taps: 1 | 2 }[] = [
  { slot: "leftSingleBinding", side: "left", taps: 1 },
  { slot: "leftDoubleBinding", side: "left", taps: 2 },
  { slot: "rightSingleBinding", side: "right", taps: 1 },
  { slot: "rightDoubleBinding", side: "right", taps: 2 },
];

export interface MotionBackend {
  getCapabilities(): Promise<MotionCapabilities | null>;
  getTapConfig(): Promise<TapConfig | null>;
  setTapConfig(config: TapConfig): Promise<boolean>;
  getCarryConfig(): Promise<CarryConfig | null>;
  setCarryConfig(config: CarryConfig): Promise<boolean>;
  getStillWakeConfig(): Promise<StillWakeConfig | null>;
  setStillWakeConfig(config: StillWakeConfig): Promise<boolean>;
  saveState(): Promise<boolean>;
  /** Live push is metered — only on while a calibration view is mounted. */
  setLiveStream(on: boolean): Promise<boolean>;
  /** Non-RPC backends deliver live state here; the RPC one uses notifications. */
  subscribeLive?: (cb: (state: LiveState) => void) => () => void;
}

async function callMotion(
  conn: RpcConnection,
  motion: MotionRequest
): Promise<MotionResponse | undefined> {
  const resp = await call_rpc(conn, { motion });
  return resp.motion;
}

/*
 * Request fields are getCapabilities/setTapConfig/… but the Response oneof
 * fields are capabilities/tapConfig/… — read the response by its own names.
 */
function rpcBackend(conn: RpcConnection): MotionBackend {
  return {
    async getCapabilities() {
      const r = await callMotion(conn, { getCapabilities: true });
      return r?.capabilities ?? null;
    },
    async getTapConfig() {
      const r = await callMotion(conn, { getTapConfig: true });
      return r?.tapConfig ?? null;
    },
    async setTapConfig(config) {
      const r = await callMotion(conn, { setTapConfig: config });
      return r?.setTapConfig === true;
    },
    async getCarryConfig() {
      const r = await callMotion(conn, { getCarryConfig: true });
      return r?.carryConfig ?? null;
    },
    async setCarryConfig(config) {
      const r = await callMotion(conn, { setCarryConfig: config });
      return r?.setCarryConfig === true;
    },
    async getStillWakeConfig() {
      const r = await callMotion(conn, { getStillWakeConfig: true });
      return r?.stillWakeConfig ?? null;
    },
    async setStillWakeConfig(config) {
      const r = await callMotion(conn, { setStillWakeConfig: config });
      return r?.setStillWakeConfig === true;
    },
    async saveState() {
      const r = await callMotion(conn, { saveState: true });
      return r?.saveState === true;
    },
    async setLiveStream(on) {
      const r = await callMotion(conn, { setLiveStream: on });
      return r?.setLiveStream === true;
    },
  };
}

// Demo connections get the in-memory firmware — or null when the demo has the
// feature toggled off. Everything else gets real RPC.
export function getMotionBackend(
  conn: RpcConnection | null | undefined
): MotionBackend | null {
  if (!conn) return null;
  if (conn.label === DEMO_LABEL) return getDemoMotionBackend(conn.label);
  return rpcBackend(conn);
}

// ─── Defaults / helpers ────────────────────────────────────────────────────────

export const ALL_LAYERS_MASK = 0;

export function slotBinding(config: TapConfig, slot: TapSlot): BehaviorBinding | undefined {
  return config[slot];
}

export function withSlotBinding(
  config: TapConfig,
  slot: TapSlot,
  binding: BehaviorBinding | undefined
): TapConfig {
  return { ...config, [slot]: binding };
}

export const CLICK_SRC = {
  IA: 0x40,
  DCLICK: 0x20,
  SCLICK: 0x10,
  SIGN: 0x08,
  Z: 0x04,
  Y: 0x02,
  X: 0x01,
} as const;

export interface TapEvent {
  side: "left" | "right";
  taps: 1 | 2;
  axes: string;
  src: number;
  at: number;
}

export function decodeClickSrc(src: number): TapEvent {
  const axes =
    [
      src & CLICK_SRC.X ? "X" : "",
      src & CLICK_SRC.Y ? "Y" : "",
      src & CLICK_SRC.Z ? "Z" : "",
    ]
      .filter(Boolean)
      .join("+") || "?";
  return {
    side: src & CLICK_SRC.SIGN ? "left" : "right",
    taps: src & CLICK_SRC.DCLICK ? 2 : 1,
    axes,
    src,
    at: Date.now(),
  };
}
