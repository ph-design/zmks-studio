import {test,expect} from "bun:test";
import {Request,Response} from "@zmkfirmware/zmk-studio-ts-client";
import {Writer} from "protobufjs/minimal";
import {encodeRequest} from "../src/rpc/connection";
import {extendBootloader} from "../src/rpc/bootloaderProtocol";
import {fields,nested} from "../src/motion/guardProtocol";
const wrap=(core:Uint8Array)=>Writer.create().uint32(10).bytes(Writer.create().uint32(8).uint32(12).uint32(26).bytes(core).finish()).finish();
test("BL uses additive core request field 5 and retains the RPC ID",()=>{
 for(const enterBootloader of [true,false]){
  const req={requestId:12,core:{enterBootloader}} as unknown as Request;
  const bytes=encodeRequest(req);expect(fields(bytes).get(1)).toBe(12);
  expect(fields(nested(bytes,[3])).get(5)).toBe(enterBootloader?1:0);
 }
 const req={requestId:12,core:{getDeviceInfo:true}};
 expect(encodeRequest(req)).toEqual(Request.encode(req).finish());
});
test("BL capability is opt-in and legacy device details remain intact",()=>{
 for(const version of [0,1]){
  const info=Writer.create().uint32(10).string("EVO").uint32(24).uint32(version).finish();
  const bytes=wrap(Writer.create().uint32(10).bytes(info).finish());
  const response=extendBootloader(bytes,Response.decode(bytes));
  expect(response.requestResponse?.core?.getDeviceInfo?.name).toBe("EVO");
  expect((response.requestResponse?.core?.getDeviceInfo as any).bootloaderVersion).toBe(version);
 }
});
test("BL confirmed true and rejected false responses both survive decoding",()=>{
 for(const ok of [false,true]){
  const bytes=wrap(Writer.create().uint32(40).bool(ok).finish());
  expect((extendBootloader(bytes,Response.decode(bytes)).requestResponse?.core as any).enterBootloader).toBe(ok);
 }
});
