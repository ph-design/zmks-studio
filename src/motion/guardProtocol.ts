import { Request, Response } from "@zmkfirmware/zmk-studio-ts-client";
import { CarryConfig } from "@zmkfirmware/zmk-studio-ts-client/motion";
import { Reader, Writer } from "protobufjs/minimal";

// Additive protobuf fields; no existing field is reused or reinterpreted.
export interface GuardSettings {
  carriedSettleMs: number;
  briefSettleMs: number;
  stableSpanMg: number;
  departureMg: number;
  verifyMs: number;
}
export const GUARD_DEFAULTS: GuardSettings = {
  carriedSettleMs: 180,
  briefSettleMs: 60,
  stableSpanMg: 60,
  departureMg: 200,
  verifyMs: 30,
};
export const GUARD_FIELDS = [
  "carriedSettleMs",
  "briefSettleMs",
  "stableSpanMg",
  "departureMg",
  "verifyMs",
] as const;
export const GUARD_LIMITS = [
  [100, 600],
  [40, 200],
  [20, 100],
  [120, 350],
  [20, 60],
] as const;
export function validGuardSettings(
  value: Partial<GuardSettings>,
): value is GuardSettings {
  return (
    GUARD_FIELDS.every(
      (key, i) =>
        Number.isInteger(value[key]) &&
        value[key]! >= GUARD_LIMITS[i][0] &&
        value[key]! <= GUARD_LIMITS[i][1],
    ) && value.carriedSettleMs! >= value.briefSettleMs!
  );
}
function concat(a: Uint8Array, b: Uint8Array) {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}
export function encodeGuardRequest(req: Request): Uint8Array | undefined {
  const carry = req.motion?.setCarryConfig as
    | (CarryConfig & Partial<GuardSettings>)
    | undefined;
  if (!carry || !GUARD_FIELDS.some((key) => carry[key] !== undefined))
    return undefined;
  if (!validGuardSettings(carry))
    throw new Error("Invalid movement-lock settings");
  const writer = Writer.create();
  GUARD_FIELDS.forEach((key, i) =>
    writer.uint32((i + 4) << 3).uint32(carry[key]),
  );
  const body = concat(CarryConfig.encode(carry).finish(), writer.finish());
  const motion = Writer.create().uint32(42).bytes(body).finish(); // motion.set_carry_config = 5
  return concat(
    Request.encode({ ...req, motion: undefined }).finish(),
    Writer.create().uint32(66).bytes(motion).finish(),
  ); // studio.motion = 8
}
function fields(bytes: Uint8Array) {
  const reader = Reader.create(bytes),
    found = new Map<number, number | Uint8Array>();
  while (reader.pos < reader.len) {
    const tag = reader.uint32();
    if ((tag & 7) === 0) found.set(tag >>> 3, reader.uint32());
    else if ((tag & 7) === 2) found.set(tag >>> 3, reader.bytes());
    else reader.skipType(tag & 7);
  }
  return found;
}
function nested(bytes: Uint8Array, path: number[]): Uint8Array | undefined {
  let current: Uint8Array | undefined = bytes;
  for (const field of path) {
    const value = fields(current).get(field);
    if (!(value instanceof Uint8Array)) return undefined;
    current = value;
  }
  return current;
}
export function decodeGuardResponse(bytes: Uint8Array): Response {
  const response = Response.decode(bytes);
  const motion = response.requestResponse?.motion;
  if (!motion) return response;
  const caps = nested(bytes, [1, 8, 1]);
  if (caps && motion.capabilities) {
    const version = fields(caps).get(8);
    if (typeof version === "number")
      Object.assign(motion.capabilities, { guardVersion: version });
  }
  const carry = nested(bytes, [1, 8, 4]);
  if (carry && motion.carryConfig) {
    const raw = fields(carry),
      settings: Partial<GuardSettings> = {};
    GUARD_FIELDS.forEach((key, i) => {
      const value = raw.get(i + 4);
      if (typeof value === "number") settings[key] = value;
    });
    if (validGuardSettings(settings))
      Object.assign(motion.carryConfig, settings);
  }
  return response;
}
