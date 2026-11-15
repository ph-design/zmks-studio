import { expect, test } from "bun:test";
import { Request, Response } from "@zmkfirmware/zmk-studio-ts-client";
import { Writer } from "protobufjs/minimal";
import { create_rpc_connection, encodeRequest } from "../src/rpc/connection";
import { fields, nested } from "../src/motion/guardProtocol";
import {
  POWER_DEFAULTS,
  POWER_TIMERS,
  validPowerConfig,
  extendPowerResponse,
  type PowerConfig,
} from "../src/motion/powerProtocol";
import { getMotionBackend } from "../src/motion/motionRpc";

const envelope = (motion: Uint8Array, id = 0) =>
  Writer.create()
    .uint32(10)
    .bytes(
      Writer.create().uint32(8).uint32(id).uint32(66).bytes(motion).finish(),
    )
    .finish();
function configBytes(c: PowerConfig) {
  const w = Writer.create();
  POWER_TIMERS.forEach((key, i) => w.uint32((i + 1) << 3).uint32(c[key]));
  return w.uint32(40).bool(c.onUsb).uint32(48).bool(c.offWhenLocked).finish();
}
test("power settings reject fractional/range/inconsistent timers and default to no System OFF", () => {
  expect(validPowerConfig(POWER_DEFAULTS)).toBe(true);
  expect(POWER_DEFAULTS.deepSleepMs).toBe(0);
  for (const key of POWER_TIMERS)
    for (const n of [-1, 1001, 86401000, NaN])
      expect(validPowerConfig({ ...POWER_DEFAULTS, [key]: n })).toBe(false);
  expect(
    validPowerConfig({
      ...POWER_DEFAULTS,
      idleTimeoutMs: 0,
      rgbOffMs: 0,
      backlightOffMs: 0,
      deepSleepMs: 60000,
    }),
  ).toBe(true);
  expect(validPowerConfig({ ...POWER_DEFAULTS, deepSleepMs: 60000 })).toBe(
    false,
  );
  expect(validPowerConfig({ ...POWER_DEFAULTS, deepSleepMs: 1800000 })).toBe(
    true,
  );
});
test("power protobuf is additive and explicitly carries disabled timers and switches", () => {
  const legacy = { requestId: 17, motion: { getCarryConfig: true } };
  expect(encodeRequest(legacy)).toEqual(Request.encode(legacy).finish());
  const bytes = encodeRequest({
    requestId: 3,
    motion: { setPowerConfig: POWER_DEFAULTS },
  } as unknown as Request);
  const raw = fields(nested(bytes, [8, 13])!);
  expect([...raw.values()]).toEqual([120000, 30000, 30000, 0, 0, 1]);
  const query = encodeRequest({
    requestId: 4,
    motion: { getPowerConfig: true },
  } as unknown as Request);
  expect(fields(nested(query, [8])!).get(12)).toBe(1);
  expect(() =>
    encodeRequest({
      requestId: 0,
      motion: { setPowerConfig: { ...POWER_DEFAULTS, deepSleepMs: 1 } },
    } as unknown as Request),
  ).toThrow();
});
test("decode power version, hardware lights, config and rejection without altering legacy replies", () => {
  const decode = (motion: Uint8Array) => {
    const bytes = envelope(motion);
    return extendPowerResponse(bytes, Response.decode(bytes));
  };
  expect(
    decode(
      Writer.create()
        .uint32(10)
        .bytes(
          Writer.create().uint32(72).uint32(1).uint32(80).uint32(1).finish(),
        )
        .finish(),
    ).requestResponse?.motion?.capabilities,
  ).toMatchObject({ powerVersion: 1, powerLights: 1 });
  expect(
    decode(
      Writer.create().uint32(98).bytes(configBytes(POWER_DEFAULTS)).finish(),
    ).requestResponse?.motion,
  ).toMatchObject({ powerConfig: POWER_DEFAULTS });
  expect(
    decode(Writer.create().uint32(104).bool(false).finish()).requestResponse
      ?.motion,
  ).toMatchObject({ setPowerConfig: false });
  expect(
    decode(
      Writer.create()
        .uint32(98)
        .bytes(configBytes({ ...POWER_DEFAULTS, rgbOffMs: 1234 }))
        .finish(),
    ).requestResponse?.motion,
  ).not.toHaveProperty("powerConfig");
  const old = Response.encode({
    requestResponse: { requestId: 9, motion: { saveState: true } },
  }).finish();
  expect(extendPowerResponse(old, Response.decode(old))).toEqual(
    Response.decode(old),
  );
});
test("power settings survive the real framed RPC pipeline and use the existing save request", async () => {
  let input!: ReadableStreamDefaultController<Uint8Array>;
  let packet: number[] = [],
    escaped = false,
    current = { ...POWER_DEFAULTS },
    saves = 0;
  const abortController = new AbortController();
  const transport = {
    label: "power wire fixture",
    abortController,
    readable: new ReadableStream<Uint8Array>({
      start(c) {
        input = c;
      },
    }),
    writable: new WritableStream<Uint8Array>({
      write(chunk) {
        for (const byte of chunk) {
          if (escaped) {
            packet.push(byte);
            escaped = false;
            continue;
          }
          if (byte === 0xab) {
            packet = [];
            continue;
          }
          if (byte === 0xac) {
            escaped = true;
            continue;
          }
          if (byte !== 0xad) {
            packet.push(byte);
            continue;
          }
          const bytes = Uint8Array.from(packet),
            req = Request.decode(bytes),
            raw = fields(nested(bytes, [8])!);
          let motion: Uint8Array;
          if (req.motion?.getCapabilities)
            motion = Writer.create()
              .uint32(10)
              .bytes(
                Writer.create()
                  .uint32(72)
                  .uint32(1)
                  .uint32(80)
                  .uint32(1)
                  .finish(),
              )
              .finish();
          else if (raw.has(12))
            motion = Writer.create()
              .uint32(98)
              .bytes(configBytes(current))
              .finish();
          else if (raw.has(13)) {
            const p = fields(raw.get(13) as Uint8Array);
            POWER_TIMERS.forEach(
              (key, i) => (current[key] = p.get(i + 1) as number),
            );
            current.onUsb = p.get(5) === 1;
            current.offWhenLocked = p.get(6) === 1;
            motion = Writer.create().uint32(104).bool(true).finish();
          } else {
            saves++;
            motion = Writer.create().uint32(48).bool(true).finish();
          }
          const response = envelope(motion, req.requestId);
          input.enqueue(
            Uint8Array.from([
              0xab,
              ...Array.from(response).flatMap((b) =>
                [0xab, 0xac, 0xad].includes(b) ? [0xac, b] : [b],
              ),
              0xad,
            ]),
          );
        }
      },
    }),
  };
  const backend = getMotionBackend(create_rpc_connection(transport))!;
  try {
    const capabilities = await backend.getCapabilities();
    expect(capabilities?.powerVersion).toBe(1);
    expect(capabilities?.supportsTap).toBe(false);
    expect(capabilities?.supportsCarry).toBe(false);
    expect(await backend.getPowerConfig()).toEqual(POWER_DEFAULTS);
    expect(
      await backend.setPowerConfig({
        ...POWER_DEFAULTS,
        rgbOffMs: 10000,
        onUsb: true,
      }),
    ).toBe(true);
    expect((await backend.getPowerConfig())?.rgbOffMs).toBe(10000);
    expect(saves).toBe(0);
    expect(await backend.saveState()).toBe(true);
    expect(saves).toBe(1);
  } finally {
    abortController.abort();
  }
});
