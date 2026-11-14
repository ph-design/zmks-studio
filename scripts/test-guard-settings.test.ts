import { test, expect } from "bun:test";
import { Writer, Reader } from "protobufjs/minimal";
import { Request, Response } from "@zmkfirmware/zmk-studio-ts-client";
import { encodeRequest } from "../src/rpc/connection";
import {
  decodeGuardResponse,
  GUARD_DEFAULTS,
  GUARD_FIELDS,
  GUARD_LIMITS,
  validGuardSettings,
} from "../src/motion/guardProtocol";

function field(bytes: Uint8Array, number: number): Uint8Array {
  const reader = Reader.create(bytes);
  while (reader.pos < reader.len) {
    const tag = reader.uint32();
    if (tag >>> 3 === number) return reader.bytes();
    reader.skipType(tag & 7);
  }
  throw Error(`Missing field ${number}`);
}
test("guard settings extend the wire message without changing legacy fields or requests", () => {
  const legacy = {
    requestId: 7,
    motion: {
      setCarryConfig: {
        enabled: true,
        motionThreshold: 32,
        motionDurationMs: 2000,
      },
    },
  };
  expect(encodeRequest(legacy)).toEqual(Request.encode(legacy).finish());
  const bytes = encodeRequest({
    ...legacy,
    motion: {
      setCarryConfig: { ...legacy.motion.setCarryConfig, ...GUARD_DEFAULTS },
    },
  });
  expect(Request.decode(bytes)).toEqual(legacy);
  const carry = Reader.create(field(field(bytes, 8), 5));
  const decoded: Record<number, number> = {};
  while (carry.pos < carry.len) decoded[carry.uint32() >>> 3] = carry.uint32();
  expect(decoded).toEqual({
    1: 1,
    2: 32,
    3: 2000,
    4: 180,
    5: 60,
    6: 60,
    7: 200,
    8: 30,
  });
});
test("real response envelope exposes versioned settings and tolerates unknown or absent extensions", () => {
  const config = Writer.create().uint32(8).bool(true);
  GUARD_FIELDS.forEach((key, i) =>
    config.uint32((i + 4) << 3).uint32(GUARD_DEFAULTS[key]),
  );
  const envelope = (motion: Uint8Array) =>
    Writer.create()
      .uint32(10)
      .bytes(
        Writer.create().uint32(8).uint32(7).uint32(66).bytes(motion).finish(),
      )
      .finish();
  const bytes = envelope(
    Writer.create().uint32(34).bytes(config.finish()).finish(),
  );
  expect(
    decodeGuardResponse(bytes).requestResponse?.motion?.carryConfig,
  ).toMatchObject(GUARD_DEFAULTS);
  const caps = envelope(
    Writer.create()
      .uint32(10)
      .bytes(Writer.create().uint32(64).uint32(1).finish())
      .finish(),
  );
  expect(
    decodeGuardResponse(caps).requestResponse?.motion?.capabilities,
  ).toMatchObject({ guardVersion: 1 });
  const legacy = Response.encode({
    requestResponse: {
      requestId: 3,
      motion: {
        carryConfig: {
          enabled: true,
          motionThreshold: 32,
          motionDurationMs: 2000,
        },
      },
    },
  }).finish();
  expect(decodeGuardResponse(legacy)).toEqual(Response.decode(legacy));
  expect(
    decodeGuardResponse(
      envelope(
        Writer.create()
          .uint32(34)
          .bytes(new Uint8Array([32, 1]))
          .finish(),
      ),
    ).requestResponse?.motion?.carryConfig,
  ).not.toHaveProperty("carriedSettleMs");
});
test("reject partial, fractional, unsafe and inconsistent settings before sending", () => {
  expect(validGuardSettings(GUARD_DEFAULTS)).toBe(true);
  GUARD_FIELDS.forEach((key, i) => {
    for (const value of [
      NaN,
      1.5,
      GUARD_LIMITS[i][0] - 1,
      GUARD_LIMITS[i][1] + 1,
    ])
      expect(validGuardSettings({ ...GUARD_DEFAULTS, [key]: value })).toBe(
        false,
      );
  });
  expect(
    validGuardSettings({
      ...GUARD_DEFAULTS,
      carriedSettleMs: 100,
      briefSettleMs: 200,
    }),
  ).toBe(false);
  expect(() =>
    encodeRequest({
      requestId: 0,
      motion: {
        setCarryConfig: {
          enabled: true,
          motionThreshold: 32,
          motionDurationMs: 2000,
          carriedSettleMs: 180,
        },
      },
    }),
  ).toThrow();
});
import { create_rpc_connection } from '../src/rpc/connection';
import { getMotionBackend } from '../src/motion/motionRpc';
test('guard capabilities, readback and apply traverse the actual framed RPC pipeline', async () => {
  let input!: ReadableStreamDefaultController<Uint8Array>;
  const abortController = new AbortController();
  let collecting=false, escaped=false, packet:number[]=[], applied:number[]=[];
  const transport={label:'wire fixture',abortController,
    readable:new ReadableStream<Uint8Array>({start(c){input=c;}}),
    writable:new WritableStream<Uint8Array>({write(chunk){for(const byte of chunk){
      if(escaped){packet.push(byte);escaped=false;continue;}
      if(byte===0xab){collecting=true;packet=[];continue;}
      if(byte===0xac){escaped=true;continue;}
      if(byte===0xad && collecting){
        collecting=false;const bytes=Uint8Array.from(packet),req=Request.decode(bytes);let motion:Uint8Array;
        if(req.motion?.getCapabilities)motion=Writer.create().uint32(10).bytes(Writer.create().uint32(64).uint32(1).finish()).finish();
        else if(req.motion?.getCarryConfig){const cfg=Writer.create().uint32(8).bool(true).uint32(16).uint32(32).uint32(24).uint32(2000);GUARD_FIELDS.forEach((key,i)=>cfg.uint32((i+4)<<3).uint32(GUARD_DEFAULTS[key]));motion=Writer.create().uint32(34).bytes(cfg.finish()).finish();}
        else {applied=[...field(field(bytes,8),5)];motion=Writer.create().uint32(40).bool(true).finish();}
        const reply=Writer.create().uint32(10).bytes(Writer.create().uint32(8).uint32(req.requestId).uint32(66).bytes(motion).finish()).finish();
        input.enqueue(Uint8Array.from([0xab,...Array.from(reply).flatMap(b=>[0xab,0xac,0xad].includes(b)?[0xac,b]:[b]),0xad]));
      }else if(collecting)packet.push(byte);
    }}})};
  const backend=getMotionBackend(create_rpc_connection(transport))!;
  try {
    expect((await backend.getCapabilities())?.guardVersion).toBe(1);
    const config=(await backend.getCarryConfig())!;expect(config).toMatchObject(GUARD_DEFAULTS);
    expect(await backend.setCarryConfig({...config,carriedSettleMs:300})).toBe(true);
    const reader=Reader.create(Uint8Array.from(applied));const values:Record<number,number>={};
    while(reader.pos<reader.len)values[reader.uint32()>>>3]=reader.uint32();
    expect(values[4]).toBe(300);expect(values[7]).toBe(200);
  }finally{abortController.abort();}
});
