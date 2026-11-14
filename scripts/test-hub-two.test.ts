import {expect,test} from "bun:test";
import {Request} from "@zmkfirmware/zmk-studio-ts-client";
import {Reader} from "protobufjs/minimal";
import {encodeRequest} from "../src/rpc/connection";
import {verifyReceiverTarget} from "../src/connection/verifyReceiverTarget";
import {parseDongleStatus} from "../src/connection/useDongle";
test("ordinary RPC encoding is unchanged and channel uses pairing field 4",()=>{
 for(const requestId of [0,1,300]){
  const req={requestId,core:{getDeviceInfo:true}};
  expect(encodeRequest(req)).toEqual(Request.encode(req).finish());
 }
 const r=Reader.create(encodeRequest({requestId:7,pairing:{setChannel:{channel:82}}}));
 expect(r.uint32()).toBe(8);expect(r.uint32()).toBe(7);expect(r.uint32()).toBe(74);
 const p=Reader.create(r.bytes());expect(p.uint32()).toBe(34);
 const c=Reader.create(p.bytes());expect(c.uint32()).toBe(8);expect(c.uint32()).toBe(82);
 for(const channel of [-1,2,26,80,101,1.5])expect(()=>encodeRequest({requestId:1,pairing:{setChannel:{channel}}})).toThrow();
});
function transport(chunks:Uint8Array[]){return {label:"receiver",abortController:new AbortController(),
 readable:new ReadableStream<Uint8Array>({start(c){chunks.forEach(b=>c.enqueue(b));}}),writable:new WritableStream<Uint8Array>()};}
test("slot 2 confirms target before exposing RPC and keeps trailing binary bytes",async()=>{
 const t=transport([new TextEncoder().encode("HUB_TAR"),new Uint8Array([...new TextEncoder().encode("GET=1\r\n"),0xab,0xad])]);
 const verified=await verifyReceiverTarget(t,1),reader=verified.readable.getReader();
 expect([...(await reader.read()).value!]).toEqual([0xab,0xad]);await reader.cancel();reader.releaseLock();
});
test("slot 2 rejects a wrong or old receiver before allowing RPC",async()=>{
 const t=transport([new TextEncoder().encode("HUB_TARGET=0\r\n")]);
 await expect(verifyReceiverTarget(t,1)).rejects.toThrow("Wrong receiver target");expect(t.abortController.signal.aborted).toBe(true);
 expect(t.readable.locked).toBe(false);
});
test("parses independent keyboard telemetry without exposing key material",()=>{
 const s=parseDongleStatus("HUB_PEERS=2\nHUB_TARGET=1\nHUB_STUDIO_OPEN=1\nHUB_PEER=0,1,1,1,90,11223344,0102030405,82,100,0,0\nHUB_PEER=1,1,1,0,-1,AABBCCDD,060708090A,82,20,1,2");
 expect(s.hubTarget).toBe(1);expect(s.hubCapacity).toBe(2);expect(s.hubStudioOpen).toBe(true);
 expect(s.hubPeers?.[0].batteryPercent).toBe(90);expect(s.hubPeers?.[1].batteryPercent).toBeUndefined();
 expect(s.hubPeers?.[1].queueDrop).toBe(2);
 expect(parseDongleStatus("HUB_PEER=2,1,1,1,80,11223344,0102030405,82,0,0,0").hubPeers).toBeUndefined();
});
