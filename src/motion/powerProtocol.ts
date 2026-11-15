import { Request, type Response } from "@zmkfirmware/zmk-studio-ts-client";
import { Writer } from "protobufjs/minimal";
import { fields, nested } from "./guardProtocol";

export interface PowerConfig {
  idleTimeoutMs: number;
  rgbOffMs: number;
  backlightOffMs: number;
  deepSleepMs: number;
  onUsb: boolean;
  offWhenLocked: boolean;
}
export const POWER_DEFAULTS: PowerConfig = {
  idleTimeoutMs: 120000,
  rgbOffMs: 30000,
  backlightOffMs: 30000,
  deepSleepMs: 0,
  onUsb: false,
  offWhenLocked: true,
};
export const POWER_TIMERS = [
  "idleTimeoutMs",
  "rgbOffMs",
  "backlightOffMs",
  "deepSleepMs",
] as const;
export function validPowerConfig(c: PowerConfig): boolean {
  return (
    typeof c.onUsb === "boolean" &&
    typeof c.offWhenLocked === "boolean" &&
    POWER_TIMERS.every(
      (key, i) =>
        Number.isInteger(c[key]) &&
        (c[key] === 0 ||
          (c[key] >= (i === 3 ? 60000 : 1000) &&
            c[key] <= 86400000 &&
            c[key] % 1000 === 0)),
    ) &&
    (c.deepSleepMs === 0 ||
      c.deepSleepMs >= Math.max(c.idleTimeoutMs, c.rgbOffMs, c.backlightOffMs))
  );
}
export interface PowerRequest {
  getPowerConfig?: boolean;
  setPowerConfig?: PowerConfig;
}
export interface PowerResponse {
  powerConfig?: PowerConfig;
  setPowerConfig?: boolean;
}
export function encodePowerRequest(req: Request): Uint8Array | undefined {
  const motion = req.motion as
    | (NonNullable<Request["motion"]> & PowerRequest)
    | undefined;
  if (!motion?.getPowerConfig && !motion?.setPowerConfig) return undefined;
  const writer = Writer.create();
  if (motion.setPowerConfig) {
    if (motion.getPowerConfig || !validPowerConfig(motion.setPowerConfig))
      throw Error("Invalid power settings");
    const config = motion.setPowerConfig,
      body = Writer.create();
    POWER_TIMERS.forEach((key, i) =>
      body.uint32((i + 1) << 3).uint32(config[key]),
    );
    body.uint32(40).bool(config.onUsb).uint32(48).bool(config.offWhenLocked);
    writer.uint32(106).bytes(body.finish());
  } else writer.uint32(96).bool(true);
  const base = Request.encode({ ...req, motion: undefined }).finish();
  const extension = Writer.create().uint32(66).bytes(writer.finish()).finish();
  const bytes = new Uint8Array(base.length + extension.length);
  bytes.set(base);
  bytes.set(extension, base.length);
  return bytes;
}
export function extendPowerResponse(
  bytes: Uint8Array,
  response: Response,
): Response {
  const motion = response.requestResponse?.motion;
  if (!motion) return response;
  const caps = nested(bytes, [1, 8, 1]);
  if (caps && motion.capabilities) {
    const raw = fields(caps);
    for (const [field, key] of [
      [9, "powerVersion"],
      [10, "powerLights"],
    ] as const) {
      const value = raw.get(field);
      if (typeof value === "number")
        Object.assign(motion.capabilities, { [key]: value });
    }
  }
  const body = nested(bytes, [1, 8, 12]);
  if (body) {
    const raw = fields(body),
      config: PowerConfig = {
        idleTimeoutMs: 0,
        rgbOffMs: 0,
        backlightOffMs: 0,
        deepSleepMs: 0,
        onUsb: false,
        offWhenLocked: false,
      };
    POWER_TIMERS.forEach((key, i) => {
      const value = raw.get(i + 1);
      if (typeof value === "number") config[key] = value;
    });
    config.onUsb = raw.get(5) === 1;
    config.offWhenLocked = raw.get(6) === 1;
    if (validPowerConfig(config))
      Object.assign(motion, { powerConfig: config });
  }
  const motionBytes = nested(bytes, [1, 8]);
  const accepted = motionBytes && fields(motionBytes).get(13);
  if (accepted === 0 || accepted === 1)
    Object.assign(motion, { setPowerConfig: accepted === 1 });
  return response;
}
