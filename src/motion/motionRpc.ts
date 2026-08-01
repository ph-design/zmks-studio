import { Request } from "@zmkfirmware/zmk-studio-ts-client";
import type { RpcConnection } from "@zmkfirmware/zmk-studio-ts-client";
import type { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";

import { call_rpc } from "../rpc/logging";
import { getDemoMotionBackend } from "../demo/motionBackend";

/*
 * Client-side contract for the proposed `zmk.motion` RPC subsystem (IMU /
 * LIS2DH12 features on PH60SCV2EVO): case-tap actions and the walk-detect key
 * lock. See docs/motion-proto.md for the .proto this mirrors field-for-field.
 *
 * The generated ts-client (`@ph-design/zmk-studio-ts-client-fork`) does not
 * carry this subsystem yet, and ts-proto encoders silently drop fields they
 * don't know — so until the fork is regenerated we cannot put a `motion`
 * request on the wire at all. Everything above this module is written against
 * the real contract; only `clientSupportsMotion` + `rpcBackend` care whether
 * the codec has caught up, and both start working the day it does with no
 * code change here.
 */

export enum TapKind {
  SINGLE = 0,
  DOUBLE = 1,
}

/** What the walk-detect lock disables while it is engaged. */
export enum LockScope {
  KEYS = 0,
  KEYS_AND_LEDS = 1,
  SOFT_OFF = 2,
}

/** Case orientation, from the sensor's 6D position detection. */
export enum Orientation {
  UNKNOWN = 0,
  FLAT_UP = 1,
  FLAT_DOWN = 2,
  TILTED = 3,
}

export interface MotionCapabilities {
  /** Sensor part number, e.g. "lis2dh12". Shown as-is in the device panel. */
  sensor: string;
  supportsTap: boolean;
  supportsDoubleTap: boolean;
  supportsLock: boolean;
  /** Upper bound for every threshold field, so sliders aren't hard-coded here. */
  thresholdMax: number;
}

export interface TapConfig {
  enabled: boolean;
  kind: TapKind;
  /** LIS2DH12 CLICK_THS. */
  threshold: number;
  /** LIS2DH12 TIME_LIMIT — how long a tap may last to still count. */
  timeLimitMs: number;
  /** LIS2DH12 TIME_LATENCY — dead time after a tap. */
  latencyMs: number;
  /** LIS2DH12 TIME_WINDOW — second-tap window; DOUBLE only. */
  windowMs: number;
  binding: BehaviorBinding | undefined;
  /** Bitmask of layers the tap is active on; 0 = every layer. */
  layerMask: number;
}

export interface LockConfig {
  enabled: boolean;
  /** Sustained-movement threshold that engages the lock (ACT_THS). */
  motionThreshold: number;
  /** How long movement must persist before locking — rejects single jolts. */
  motionDurationMs: number;
  /** Below this the case counts as still. */
  stillThreshold: number;
  /** How long it must stay still before unlocking. */
  stillDurationMs: number;
  /** Require a flat-face-up orientation to unlock, not just stillness. */
  requireFlat: boolean;
  flatToleranceDeg: number;
  scope: LockScope;
}

/** Pushed while live streaming is on; drives threshold calibration. */
export interface MotionLiveState {
  magnitude: number;
  orientation: Orientation;
  locked: boolean;
  tapDetected: boolean;
}

export interface MotionBackend {
  getCapabilities(): Promise<MotionCapabilities | null>;
  getTapConfig(): Promise<TapConfig | null>;
  setTapConfig(config: TapConfig): Promise<boolean>;
  getLockConfig(): Promise<LockConfig | null>;
  setLockConfig(config: LockConfig): Promise<boolean>;
  saveState(): Promise<boolean>;
  /** Live push is metered — only on while a calibration view is mounted. */
  setLiveStream(on: boolean): Promise<boolean>;
  /** Non-RPC backends deliver live state here; the RPC one uses notifications. */
  subscribeLive?: (cb: (state: MotionLiveState) => void) => () => void;
}

/*
 * Round-trip a motion request through the generated codec: if the field
 * survives, the fork carries the subsystem and real RPC is safe to use. This
 * beats a version check — it tracks the artifact actually installed.
 */
let codecSupport: boolean | undefined;
export function clientSupportsMotion(): boolean {
  if (codecSupport === undefined) {
    try {
      const encoded = Request.encode({
        requestId: 0,
        motion: { getCapabilities: true },
      } as unknown as Request).finish();
      const decoded = Request.decode(encoded) as unknown as { motion?: unknown };
      codecSupport = decoded.motion !== undefined;
    } catch {
      codecSupport = false;
    }
  }
  return codecSupport;
}

type MotionRequest = Record<string, unknown>;
type MotionResponse = Record<string, unknown> | undefined;

async function callMotion(
  conn: RpcConnection,
  motion: MotionRequest
): Promise<MotionResponse> {
  const resp = await call_rpc(conn, { motion } as unknown as Parameters<typeof call_rpc>[1]);
  return (resp as unknown as { motion?: Record<string, unknown> }).motion;
}

function rpcBackend(conn: RpcConnection): MotionBackend {
  return {
    async getCapabilities() {
      const r = await callMotion(conn, { getCapabilities: true });
      return (r?.getCapabilities as MotionCapabilities) ?? null;
    },
    async getTapConfig() {
      const r = await callMotion(conn, { getTapConfig: true });
      return (r?.getTapConfig as TapConfig) ?? null;
    },
    async setTapConfig(config) {
      const r = await callMotion(conn, { setTapConfig: config });
      return r?.setTapConfig === true;
    },
    async getLockConfig() {
      const r = await callMotion(conn, { getLockConfig: true });
      return (r?.getLockConfig as LockConfig) ?? null;
    },
    async setLockConfig(config) {
      const r = await callMotion(conn, { setLockConfig: config });
      return r?.setLockConfig === true;
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

/*
 * Resolve the backend for a connection. Real hardware reports "unsupported"
 * until the codec catches up — deliberately, so a device never shows invented
 * state. Demo connections get an in-memory firmware so the panel stays
 * reviewable in the meantime.
 */
export function getMotionBackend(
  conn: RpcConnection | null | undefined
): MotionBackend | null {
  if (!conn) return null;
  if (clientSupportsMotion()) return rpcBackend(conn);
  return getDemoMotionBackend(conn.label);
}

// ─── Defaults / helpers ────────────────────────────────────────────────────────

export const ALL_LAYERS_MASK = 0;

export function orientationIsFlat(o: Orientation): boolean {
  return o === Orientation.FLAT_UP || o === Orientation.FLAT_DOWN;
}

export function tapConfigsEqual(a: TapConfig, b: TapConfig): boolean {
  return (
    a.enabled === b.enabled &&
    a.kind === b.kind &&
    a.threshold === b.threshold &&
    a.timeLimitMs === b.timeLimitMs &&
    a.latencyMs === b.latencyMs &&
    a.windowMs === b.windowMs &&
    a.layerMask === b.layerMask &&
    (a.binding?.behaviorId ?? -1) === (b.binding?.behaviorId ?? -1) &&
    (a.binding?.param1 ?? 0) === (b.binding?.param1 ?? 0) &&
    (a.binding?.param2 ?? 0) === (b.binding?.param2 ?? 0)
  );
}

export function lockConfigsEqual(a: LockConfig, b: LockConfig): boolean {
  return (
    a.enabled === b.enabled &&
    a.motionThreshold === b.motionThreshold &&
    a.motionDurationMs === b.motionDurationMs &&
    a.stillThreshold === b.stillThreshold &&
    a.stillDurationMs === b.stillDurationMs &&
    a.requireFlat === b.requireFlat &&
    a.flatToleranceDeg === b.flatToleranceDeg &&
    a.scope === b.scope
  );
}
