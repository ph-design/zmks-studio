import { test, expect } from "bun:test";
import { Request, Response } from "@zmkfirmware/zmk-studio-ts-client";
import { TapConfig as TapCodec } from "@zmkfirmware/zmk-studio-ts-client/motion";
import { Writer } from "protobufjs/minimal";
import { create_rpc_connection, encodeRequest } from "../src/rpc/connection";
import { fields, nested } from "../src/motion/guardProtocol";
import {
  TAP_DEFAULTS,
  extendTapResponse,
  validTapOptions,
  type TapConfig,
} from "../src/motion/tapProtocol";
import { getMotionBackend } from "../src/motion/motionRpc";
const config: TapConfig = {
  enabled: true,
  threshold: 40,
  timeLimitMs: 30,
  latencyMs: 80,
  windowMs: 240,
  layerMask: 0,
  leftSingleBinding: undefined,
  leftDoubleBinding: undefined,
  rightSingleBinding: undefined,
  rightDoubleBinding: undefined,
  ...TAP_DEFAULTS,
};
const envelope = (motion: Uint8Array, id = 0) =>
  Writer.create()
    .uint32(10)
    .bytes(
      Writer.create().uint32(8).uint32(id).uint32(66).bytes(motion).finish(),
    )
    .finish();
const decode = (motion: Uint8Array) => {
  const bytes = envelope(motion);
  return extendTapResponse(bytes, Response.decode(bytes));
};
test("tap options preserve legacy encoding and reject partial or invalid extensions", () => {
  const old = { requestId: 3, motion: { getTapConfig: true } };
  expect(encodeRequest(old)).toEqual(Request.encode(old).finish());
  const bytes = encodeRequest({
    requestId: 1,
    motion: { setTapConfig: config },
  });
  expect(fields(nested(bytes, [8, 3])!).get(11)).toBe(7);
  expect(fields(nested(bytes, [8, 3])!).get(12)).toBe(0);
  expect(fields(nested(bytes, [8, 3])!).get(13)).toBe(120);
  expect(validTapOptions({ ...TAP_DEFAULTS, axesMask: 0 })).toBe(false);
  expect(validTapOptions({ ...TAP_DEFAULTS, typingQuietMs: 1001 })).toBe(false);
  const { axesMask, splitSides, typingQuietMs, ...legacy } = config;
  expect(() =>
    encodeRequest({
      requestId: 1,
      motion: { setTapConfig: { ...legacy, splitSides: true } },
    } as unknown as Request),
  ).toThrow();
  const stop = encodeRequest({
    requestId: 2,
    motion: { setTapTest: false },
  } as unknown as Request);
  expect(fields(nested(stop, [8])!).get(15)).toBe(0);
});
test("diagnostics distinguish hardware, gesture and action stages and signed axes", () => {
  const diag = Writer.create()
    .uint32(8)
    .uint32(8)
    .uint32(16)
    .uint32(7)
    .uint32(32)
    .uint32(3)
    .uint32(40)
    .uint32(0)
    .uint32(64)
    .uint32(400)
    .uint32(146)
    .bytes(
      Uint8Array.from([0x77, 0xc4, 0, 0x80, 0x80, 0x15, 0x94, 12, 32, 96, 0]),
    )
    .uint32(152)
    .int32(-1000)
    .uint32(160)
    .int32(500)
    .uint32(168)
    .int32(800)
    .finish();
  expect(
    decode(Writer.create().uint32(114).bytes(diag).finish()).requestResponse
      ?.motion,
  ).toMatchObject({
    tapDiagnostics: {
      irqCount: 8,
      singleCount: 7,
      gestureCount: 3,
      actionCount: 0,
      odrHz: 400,
      xMg: -1000,
      yMg: 500,
      zMg: 800,
    },
  });
  expect(
    decode(Writer.create().uint32(120).bool(false).finish()).requestResponse
      ?.motion,
  ).toMatchObject({ setTapTest: false });
});
test("bounded capture decodes signed sensor samples and timestamp rollover", () => {
  const frame = new Uint8Array(16),
    v = new DataView(frame.buffer);
  v.setUint16(0, 65535, true);
  v.setInt16(2, -1000, true);
  v.setInt16(4, 1000, true);
  v.setInt16(6, 500, true);
  v.setUint16(8, 2, true);
  v.setInt16(10, -500, true);
  v.setInt16(12, 250, true);
  v.setInt16(14, 1000, true);
  const wire = (count: number) =>
    Writer.create()
      .uint32(130)
      .bytes(
        Writer.create()
          .uint32(8)
          .uint32(5)
          .uint32(16)
          .uint32(count)
          .uint32(26)
          .bytes(frame)
          .finish(),
      )
      .finish();
  expect(decode(wire(2)).requestResponse?.motion).toMatchObject({
    tapCapture: {
      sequence: 5,
      samples: [
        { t: 0, x: -1000, y: 1000, z: 500 },
        { t: 3, x: -500, y: 250, z: 1000 },
      ],
    },
  });
  expect(decode(wire(33)).requestResponse?.motion).not.toHaveProperty(
    "tapCapture",
  );
  expect(decode(wire(1)).requestResponse?.motion).not.toHaveProperty(
    "tapCapture",
  );
});
test("tap capabilities, config and test start/stop pass through real framed RPC", async () => {
  let input!: ReadableStreamDefaultController<Uint8Array>,
    packet: number[] = [],
    escaped = false,
    testing = false;
  const abortController = new AbortController();
  const transport = {
    label: "tap wire fixture",
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
              .bytes(Writer.create().uint32(88).uint32(1).finish())
              .finish();
          else if (req.motion?.getTapConfig) {
            const base = TapCodec.encode(config).finish(),
              extra = Writer.create()
                .uint32(88)
                .uint32(7)
                .uint32(96)
                .bool(false)
                .uint32(104)
                .uint32(120)
                .finish();
            const full = new Uint8Array(base.length + extra.length);
            full.set(base);
            full.set(extra, base.length);
            motion = Writer.create().uint32(18).bytes(full).finish();
          } else if (raw.has(15)) {
            testing = raw.get(15) === 1;
            motion = Writer.create().uint32(120).bool(true).finish();
          } else
            motion = Writer.create()
              .uint32(114)
              .bytes(
                Writer.create()
                  .uint32(80)
                  .uint32(testing ? 60000 : 0)
                  .finish(),
              )
              .finish();
          const reply = envelope(motion, req.requestId);
          input.enqueue(
            Uint8Array.from([
              0xab,
              ...Array.from(reply).flatMap((b) =>
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
    expect((await backend.getCapabilities())?.tapVersion).toBe(1);
    expect(await backend.getTapConfig()).toMatchObject(TAP_DEFAULTS);
    expect(await backend.setTapTest(true)).toBe(true);
    expect((await backend.getTapDiagnostics())?.testRemainingMs).toBe(60000);
    expect(await backend.setTapTest(false)).toBe(true);
    expect((await backend.getTapDiagnostics())?.testRemainingMs).toBe(0);
  } finally {
    abortController.abort();
  }
});
