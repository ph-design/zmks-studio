import { Request, type Response } from "@zmkfirmware/zmk-studio-ts-client";
import {
  TapConfig as TapCodec,
  type TapConfig as BaseTapConfig,
} from "@zmkfirmware/zmk-studio-ts-client/motion";
import { Writer } from "protobufjs/minimal";
import { fields, nested } from "./guardProtocol";
export interface TapOptions {
  axesMask: number;
  splitSides: boolean;
  typingQuietMs: number;
}
export type TapConfig = BaseTapConfig & Partial<TapOptions>;
export const TAP_DEFAULTS: TapOptions = {
  axesMask: 7,
  splitSides: false,
  typingQuietMs: 120,
};
export function validTapOptions(c: Partial<TapOptions>): c is TapOptions {
  return (
    Number.isInteger(c.axesMask) &&
    c.axesMask! >= 1 &&
    c.axesMask! <= 7 &&
    typeof c.splitSides === "boolean" &&
    Number.isInteger(c.typingQuietMs) &&
    c.typingQuietMs! >= 0 &&
    c.typingQuietMs! <= 1000
  );
}
export interface TapDiagnostics {
  irqCount: number;
  singleCount: number;
  doubleCount: number;
  gestureCount: number;
  actionCount: number;
  suppressedCount: number;
  queueDrops: number;
  odrHz: number;
  engine: number;
  testRemainingMs: number;
  lastSource: number;
  lastGesture: number;
  xCount: number;
  yCount: number;
  zCount: number;
  xMg: number;
  yMg: number;
  zMg: number;
  fullScaleMg: number;
  error: number;
  registers: Uint8Array;
}
export interface TapCapture {
  sequence: number;
  samples: { t: number; x: number; y: number; z: number }[];
}
export interface TapRequest {
  getTapDiagnostics?: boolean;
  setTapTest?: boolean;
  getTapCapture?: boolean;
}
export interface TapResponse {
  tapDiagnostics?: TapDiagnostics;
  setTapTest?: boolean;
  tapCapture?: TapCapture;
}
export function encodeTapRequest(req: Request): Uint8Array | undefined {
  const m = req.motion as
    | (NonNullable<Request["motion"]> & TapRequest)
    | undefined;
  if (!m) return undefined;
  const w = Writer.create();
  if (
    m.setTapConfig &&
    ["axesMask", "splitSides", "typingQuietMs"].some(
      (key) =>
        (m.setTapConfig as unknown as Record<string, unknown>)[key] !==
        undefined,
    )
  ) {
    const c = m.setTapConfig as TapConfig;
    if (!validTapOptions(c)) throw Error("Invalid tap options");
    const base = TapCodec.encode(c).finish(),
      extra = Writer.create()
        .uint32(88)
        .uint32(c.axesMask)
        .uint32(96)
        .bool(c.splitSides)
        .uint32(104)
        .uint32(c.typingQuietMs)
        .finish();
    const body = new Uint8Array(base.length + extra.length);
    body.set(base);
    body.set(extra, base.length);
    w.uint32(26).bytes(body);
  } else if (m.getTapDiagnostics) w.uint32(112).bool(true);
  else if (m.setTapTest !== undefined) w.uint32(120).bool(m.setTapTest);
  else if (m.getTapCapture) w.uint32(128).bool(true);
  else return undefined;
  const base = Request.encode({ ...req, motion: undefined }).finish(),
    extra = Writer.create().uint32(66).bytes(w.finish()).finish();
  const out = new Uint8Array(base.length + extra.length);
  out.set(base);
  out.set(extra, base.length);
  return out;
}
export function extendTapResponse(
  bytes: Uint8Array,
  response: Response,
): Response {
  const motion = response.requestResponse?.motion;
  if (!motion) return response;
  const caps = nested(bytes, [1, 8, 1]);
  if (caps && motion.capabilities) {
    const version = fields(caps).get(11);
    if (typeof version === "number")
      Object.assign(motion.capabilities, { tapVersion: version });
  }
  const config = nested(bytes, [1, 8, 2]);
  if (config && motion.tapConfig) {
    const raw = fields(config),
      options = {
        axesMask: raw.get(11),
        splitSides: raw.get(12) === 1,
        typingQuietMs: raw.get(13) ?? 0,
      };
    if (validTapOptions(options as Partial<TapOptions>))
      Object.assign(motion.tapConfig, options);
  }
  const diag = nested(bytes, [1, 8, 14]);
  if (diag) {
    const raw = fields(diag),
      names = [
        "irqCount",
        "singleCount",
        "doubleCount",
        "gestureCount",
        "actionCount",
        "suppressedCount",
        "queueDrops",
        "odrHz",
        "engine",
        "testRemainingMs",
        "lastSource",
        "lastGesture",
        "xCount",
        "yCount",
        "zCount",
        "fullScaleMg",
        "error",
      ] as const;
    const d = {} as TapDiagnostics;
    names.forEach(
      (key, i) =>
        (d[key] =
          typeof raw.get(i + 1) === "number" ? (raw.get(i + 1) as number) : 0),
    );
    d.xMg = Number(raw.get(19) ?? 0) | 0;
    d.yMg = Number(raw.get(20) ?? 0) | 0;
    d.zMg = Number(raw.get(21) ?? 0) | 0;
    d.error |= 0;
    const regs = raw.get(18);
    d.registers = regs instanceof Uint8Array ? regs : new Uint8Array();
    Object.assign(motion, { tapDiagnostics: d });
  }
  const body = nested(bytes, [1, 8]);
  if (body) {
    const accepted = fields(body).get(15);
    if (accepted === 0 || accepted === 1)
      Object.assign(motion, { setTapTest: accepted === 1 });
  }
  const capture = nested(bytes, [1, 8, 16]);
  if (capture) {
    const raw = fields(capture),
      count = raw.get(2) ?? 0,
      frames = raw.get(3) ?? new Uint8Array();
    if (
      typeof count === "number" &&
      count <= 32 &&
      frames instanceof Uint8Array &&
      frames.length === count * 8
    ) {
      const view = new DataView(
          frames.buffer,
          frames.byteOffset,
          frames.byteLength,
        ),
        samples: TapCapture["samples"] = [];
      const first = count ? view.getUint16(0, true) : 0;
      for (let i = 0; i < count; i++)
        samples.push({
          t: (view.getUint16(i * 8, true) - first + 65536) % 65536,
          x: view.getInt16(i * 8 + 2, true),
          y: view.getInt16(i * 8 + 4, true),
          z: view.getInt16(i * 8 + 6, true),
        });
      Object.assign(motion, {
        tapCapture: { sequence: raw.get(1) ?? 0, samples },
      });
    }
  }
  return response;
}
