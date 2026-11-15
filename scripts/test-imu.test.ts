import { maintainImuLease } from "../src/motion/imuLease";
import { test, expect } from "bun:test";
import { Request, Response } from "@zmkfirmware/zmk-studio-ts-client";
import { Writer } from "protobufjs/minimal";
import { imuBackend } from "../src/motion/imuProtocol";
import { create_rpc_connection, encodeRequest } from "../src/rpc/connection";
import {
  encodeImu,
  extendImu,
  validImu,
  IMU_DEFAULTS,
  type ImuConfig,
} from "../src/motion/imuProtocol";
import { fields, nested } from "../src/motion/guardProtocol";
const req = (motion: unknown) => ({ requestId: 22, motion }) as Request;
const envelope = (field: number, body: Uint8Array) =>
  Writer.create()
    .uint32(10)
    .bytes(
      Writer.create()
        .uint32(8)
        .uint32(22)
        .uint32(66)
        .bytes(Writer.create().uint32(field).bytes(body).finish())
        .finish(),
    )
    .finish();
test("IMU configuration validates ranges, signed centers and explicit false mode", () => {
  expect(validImu(IMU_DEFAULTS)).toBe(true);
  for (const patch of [
    { rangeDeg: 2 },
    { rangeDeg: 5, deadzoneDeg: 5 },
    { source: 2 },
    { flipMask: 8 },
    { smoothingMs: 201 },
    { centerPitch: 9001 },
    { centerRoll: -18001 },
    { rangeDeg: NaN },
  ])
    expect(validImu({ ...IMU_DEFAULTS, ...patch })).toBe(false);
  const config = { ...IMU_DEFAULTS, centerRoll: -1234, centerPitch: -567 };
  const encoded = encodeRequest(req({ setImuGameConfig: config }));
  const body = nested(encoded, [8, 18])!;
  expect(Number(fields(body).get(8)) | 0).toBe(-1234);
  expect(Number(fields(body).get(9)) | 0).toBe(-567);
  expect(
    fields(nested(encodeRequest(req({ setImuGameMode: false })), [8])!).get(19),
  ).toBe(0);
  expect(() =>
    encodeImu(req({ setImuGameConfig: { ...config, deadzoneDeg: 90 } })),
  ).toThrow();
  expect(encodeRequest(req({ getCapabilities: true }))).toEqual(
    Request.encode(req({ getCapabilities: true })).finish(),
  );
});
test("IMU config and capabilities decode additive fields without changing the SDK contract", () => {
  const cap = envelope(10, Writer.create().uint32(96).uint32(1).finish());
  expect(
    (
      extendImu(cap, Response.decode(cap)).requestResponse?.motion
        ?.capabilities as unknown as { imuVersion: number }
    ).imuVersion,
  ).toBe(1);
  const c = Writer.create()
    .uint32(8)
    .uint32(1)
    .uint32(16)
    .uint32(45)
    .uint32(24)
    .uint32(2)
    .uint32(32)
    .uint32(60)
    .uint32(40)
    .bool(false)
    .uint32(48)
    .bool(true)
    .uint32(56)
    .uint32(3)
    .uint32(64)
    .int32(-1200)
    .uint32(72)
    .int32(-400)
    .finish();
  const bytes = envelope(138, c);
  const result = extendImu(bytes, Response.decode(bytes)).requestResponse
    ?.motion as unknown as { imuGameConfig: ImuConfig };
  expect(result.imuGameConfig).toEqual({
    ...IMU_DEFAULTS,
    swapXy: true,
    flipMask: 3,
    centerRoll: -1200,
    centerPitch: -400,
  });
});
test("live pose notification keeps signed vectors, validity, axis and time", () => {
  const live = Writer.create()
    .uint32(8)
    .uint32(10)
    .uint32(48)
    .int32(-100)
    .uint32(56)
    .int32(200)
    .uint32(64)
    .int32(-950)
    .uint32(72)
    .uint32(500)
    .uint32(80)
    .bool(true)
    .uint32(88)
    .bool(true)
    .uint32(96)
    .int32(-32767)
    .uint32(104)
    .int32(-17000)
    .uint32(112)
    .int32(1500)
    .uint32(120)
    .bool(true)
    .finish();
  const bytes = Writer.create()
    .uint32(18)
    .bytes(
      Writer.create()
        .uint32(66)
        .bytes(Writer.create().uint32(10).bytes(live).finish())
        .finish(),
    )
    .finish();
  const decoded = extendImu(bytes, Response.decode(bytes)).notification?.motion
    ?.liveState as unknown as Record<string, unknown>;
  expect(decoded.xMg).toBe(-100);
  expect(decoded.zMg).toBe(-950);
  expect(decoded.gameAxis).toBe(-32767);
  expect(decoded.rollCdeg).toBe(-17000);
  expect(decoded.sampleTime).toBe(500);
  expect(decoded.tiltValid).toBe(true);
  expect(decoded.gameSupported).toBe(true);
});

test("IMU configuration and mode pass through the actual framed RPC pipeline", async () => {
  let input!: ReadableStreamDefaultController<Uint8Array>;
  let packet: number[] = [],
    escaped = false,
    mode = false,
    stored = { ...IMU_DEFAULTS };
  const abortController = new AbortController();
  const transport = {
    label: "IMU wire fixture",
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
          const data = Uint8Array.from(packet),
            request = Request.decode(data),
            m = fields(nested(data, [8])!);
          let response: Uint8Array;
          if (m.has(17)) {
            const w = Writer.create();
            [
              "source",
              "rangeDeg",
              "deadzoneDeg",
              "smoothingMs",
              "invert",
              "swapXy",
              "flipMask",
              "centerRoll",
              "centerPitch",
            ].forEach((key, i) => {
              const value = stored[key as keyof typeof stored];
              w.uint32((i + 1) << 3);
              if (typeof value === "boolean") w.bool(value);
              else w.int32(value);
            });
            response = Writer.create().uint32(138).bytes(w.finish()).finish();
          } else if (m.has(18)) {
            const values = fields(m.get(18) as Uint8Array);
            Object.keys(stored).forEach((key, i) =>
              Object.assign(stored, {
                [key]:
                  i === 4 || i === 5
                    ? values.get(i + 1) === 1
                    : Number(values.get(i + 1)) | 0,
              }),
            );
            response = Writer.create().uint32(144).bool(true).finish();
          } else {
            mode = m.get(19) === 1;
            response = Writer.create().uint32(152).bool(true).finish();
          }
          const bytes = Writer.create()
            .uint32(10)
            .bytes(
              Writer.create()
                .uint32(8)
                .uint32(request.requestId)
                .uint32(66)
                .bytes(response)
                .finish(),
            )
            .finish();
          input.enqueue(
            Uint8Array.from([
              0xab,
              ...Array.from(bytes).flatMap((b) =>
                [0xab, 0xac, 0xad].includes(b) ? [0xac, b] : [b],
              ),
              0xad,
            ]),
          );
        }
      },
    }),
  };
  const backend = imuBackend(create_rpc_connection(transport))!;
  try {
    expect(await backend.get()).toEqual(IMU_DEFAULTS);
    expect(
      await backend.set({ ...IMU_DEFAULTS, rangeDeg: 30, centerRoll: -1234 }),
    ).toBe(true);
    expect((await backend.get())?.centerRoll).toBe(-1234);
    expect(await backend.mode(true)).toBe(true);
    expect(mode).toBe(true);
    expect(await backend.mode(false)).toBe(true);
    expect(mode).toBe(false);
  } finally {
    abortController.abort();
  }
});

test("game lease never queues overlapping renewals and stops a late successful renewal", async () => {
  const calls: boolean[] = [];
  let resolve!: (ok: boolean) => void;
  let lost = 0;
  const stop = maintainImuLease(
    (on) => {
      calls.push(on);
      return on
        ? new Promise<boolean>((r) => {
            resolve = r;
          })
        : Promise.resolve(true);
    },
    () => lost++,
    1,
  );
  await new Promise((r) => setTimeout(r, 12));
  expect(calls).toEqual([true]);
  stop();
  resolve(true);
  await new Promise((r) => setTimeout(r, 6));
  expect(calls).toEqual([true, false, false]);
  expect(lost).toBe(0);
});
