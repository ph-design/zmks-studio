import {
  Request,
  type Response,
  type RpcConnection,
} from "@zmkfirmware/zmk-studio-ts-client";
import { Writer } from "protobufjs/minimal";
import { call_rpc } from "../rpc/logging";
import { fields, nested } from "./guardProtocol";
export interface ImuConfig {
  source: number;
  rangeDeg: number;
  deadzoneDeg: number;
  smoothingMs: number;
  invert: boolean;
  swapXy: boolean;
  flipMask: number;
  centerRoll: number;
  centerPitch: number;
}
export interface ImuLive {
  xMg: number;
  yMg: number;
  zMg: number;
  sampleTime: number;
  tiltValid: boolean;
  gameActive: boolean;
  gameAxis: number;
  rollCdeg: number;
  pitchCdeg: number;
  gameSupported: boolean;
}
export const IMU_DEFAULTS: ImuConfig = {
  source: 1,
  rangeDeg: 45,
  deadzoneDeg: 2,
  smoothingMs: 60,
  invert: false,
  swapXy: false,
  flipMask: 0,
  centerRoll: 0,
  centerPitch: 0,
};
const names = [
  "source",
  "rangeDeg",
  "deadzoneDeg",
  "smoothingMs",
  "invert",
  "swapXy",
  "flipMask",
  "centerRoll",
  "centerPitch",
] as const;
export function validImu(c: ImuConfig) {
  return (
    names.every(
      (k) =>
        typeof c[k] ===
        (k === "invert" || k === "swapXy" ? "boolean" : "number"),
    ) &&
    names
      .filter((k) => typeof c[k] === "number")
      .every((k) => Number.isInteger(c[k])) &&
    c.source >= 0 &&
    c.source <= 1 &&
    c.rangeDeg >= 5 &&
    c.rangeDeg <= 90 &&
    c.deadzoneDeg >= 0 &&
    c.deadzoneDeg <= 10 &&
    c.deadzoneDeg < c.rangeDeg &&
    c.smoothingMs >= 0 &&
    c.smoothingMs <= 200 &&
    c.flipMask >= 0 &&
    c.flipMask <= 7 &&
    Math.abs(c.centerRoll) <= 18000 &&
    Math.abs(c.centerPitch) <= 9000
  );
}
interface ImuRequest {
  getImuGameConfig?: boolean;
  setImuGameConfig?: ImuConfig;
  setImuGameMode?: boolean;
}
export function encodeImu(req: Request): Uint8Array | undefined {
  const m = req.motion as ImuRequest | undefined;
  if (!m) return;
  const w = Writer.create();
  if (m.getImuGameConfig) w.uint32(136).bool(true);
  else if (m.setImuGameConfig) {
    const c = m.setImuGameConfig;
    if (!validImu(c)) throw Error("Invalid IMU configuration");
    const body = Writer.create();
    names.forEach((key, i) => {
      const v = c[key];
      body.uint32((i + 1) << 3);
      if (typeof v === "boolean") body.bool(v);
      else if (i >= 7) body.int32(v);
      else body.uint32(v);
    });
    w.uint32(146).bytes(body.finish());
  } else if (m.setImuGameMode !== undefined)
    w.uint32(152).bool(m.setImuGameMode);
  else return;
  const base = Request.encode({ ...req, motion: undefined }).finish(),
    extra = Writer.create().uint32(66).bytes(w.finish()).finish();
  const out = new Uint8Array(base.length + extra.length);
  out.set(base);
  out.set(extra, base.length);
  return out;
}
export function extendImu(bytes: Uint8Array, response: Response): Response {
  const motion = response.requestResponse?.motion;
  if (motion) {
    const cap = nested(bytes, [1, 8, 1]);
    if (cap && motion.capabilities)
      Object.assign(motion.capabilities, {
        imuVersion: fields(cap).get(12) ?? 0,
      });
    const c = nested(bytes, [1, 8, 17]);
    if (c) {
      const raw = fields(c),
        out = {} as ImuConfig;
      names.forEach((key, i) =>
        Object.assign(out, {
          [key]:
            i === 4 || i === 5
              ? raw.get(i + 1) === 1
              : Number(raw.get(i + 1) ?? 0) | 0,
        }),
      );
      Object.assign(motion, { imuGameConfig: out });
    }
    const body = nested(bytes, [1, 8]);
    if (body) {
      const raw = fields(body);
      if (raw.has(18))
        Object.assign(motion, { setImuGameConfig: raw.get(18) === 1 });
      if (raw.has(19))
        Object.assign(motion, { setImuGameMode: raw.get(19) === 1 });
    }
  }
  const live = response.notification?.motion?.liveState,
    body = nested(bytes, [2, 8, 1]);
  if (live && body) {
    const raw = fields(body);
    const keys = [
      "xMg",
      "yMg",
      "zMg",
      "sampleTime",
      "tiltValid",
      "gameActive",
      "gameAxis",
      "rollCdeg",
      "pitchCdeg",
      "gameSupported",
    ];
    keys.forEach((key, i) =>
      Object.assign(live, {
        [key]: [4, 5, 9].includes(i)
          ? raw.get(i + 6) === 1
          : Number(raw.get(i + 6) ?? 0) | 0,
      }),
    );
  }
  return response;
}
let demoConfig = { ...IMU_DEFAULTS },
  demoUntil = 0;
export function demoImu(time: number): ImuLive {
  const baseRoll = (15 * Math.sin(time / 1800) * Math.PI) / 180,
    basePitch = (12 * Math.sin(time / 2600) * Math.PI) / 180;
  const raw = [
    Math.round(-1000 * Math.sin(basePitch)),
    Math.round(1000 * Math.sin(baseRoll) * Math.cos(basePitch)),
    Math.round(1000 * Math.cos(baseRoll) * Math.cos(basePitch)),
  ];
  const a = [
    raw[demoConfig.swapXy ? 1 : 0],
    raw[demoConfig.swapXy ? 0 : 1],
    raw[2],
  ].map((v, i) => (demoConfig.flipMask & (1 << i) ? -v : v));
  const roll = (Math.atan2(a[1], a[2]) * 180) / Math.PI,
    pitch = (Math.atan2(-a[0], Math.hypot(a[1], a[2])) * 180) / Math.PI;
  const active = Date.now() < demoUntil;
  let angle =
    (demoConfig.source ? pitch : roll) -
    (demoConfig.source ? demoConfig.centerPitch : demoConfig.centerRoll) / 100;
  while (angle > 180) angle -= 360;
  while (angle < -180) angle += 360;
  const value =
    Math.max(0, Math.abs(angle) - demoConfig.deadzoneDeg) /
    (demoConfig.rangeDeg - demoConfig.deadzoneDeg);
  return {
    xMg: raw[0],
    yMg: raw[1],
    zMg: raw[2],
    sampleTime: time,
    tiltValid: true,
    gameActive: active,
    gameAxis: active
      ? Math.round(
          Math.min(1, value) *
            Math.sign(angle) *
            (demoConfig.invert ? -1 : 1) *
            32767,
        )
      : 0,
    rollCdeg: Math.round(roll * 100),
    pitchCdeg: Math.round(pitch * 100),
    gameSupported: true,
  };
}
export function imuBackend(conn: RpcConnection | null | undefined) {
  if (!conn) return null;
  const request = async (m: ImuRequest) => {
    const r = await call_rpc(conn, { motion: m } as unknown as Request);
    return r.motion as unknown as {
      imuGameConfig?: ImuConfig;
      setImuGameConfig?: boolean;
      setImuGameMode?: boolean;
    };
  };
  return conn.label === "Demo"
    ? {
        get: async () => ({ ...demoConfig }),
        set: async (c: ImuConfig) => {
          if (!validImu(c)) return false;
          demoConfig = { ...c };
          return true;
        },
        mode: async (on: boolean) => {
          demoUntil = on ? Date.now() + 3000 : 0;
          return true;
        },
      }
    : {
        get: async () =>
          (await request({ getImuGameConfig: true }))?.imuGameConfig ?? null,
        set: async (c: ImuConfig) =>
          (await request({ setImuGameConfig: c }))?.setImuGameConfig === true,
        mode: async (on: boolean) =>
          (await request({ setImuGameMode: on }))?.setImuGameMode === true,
      };
}
