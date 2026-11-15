import {Request, type Response} from "@zmkfirmware/zmk-studio-ts-client";
import {Writer} from "protobufjs/minimal";
import {fields,nested} from "../motion/guardProtocol";
export type BootloaderCore = {enterBootloader?: boolean};
export function encodeBootloader(req: Request): Uint8Array | undefined {
  const core=req.core as (Request["core"] & BootloaderCore);
  if(core?.enterBootloader===undefined)return;
  const base=Request.encode({...req,core:undefined}).finish();
  const extra=Writer.create().uint32(26).bytes(Writer.create().uint32(40).bool(core.enterBootloader).finish()).finish();
  const out=new Uint8Array(base.length+extra.length);out.set(base);out.set(extra,base.length);return out;
}
export function extendBootloader(bytes: Uint8Array,response: Response): Response {
  const core=response.requestResponse?.core;
  if(!core)return response;
  const info=nested(bytes,[1,3,1]);
  if(info && core.getDeviceInfo)Object.assign(core.getDeviceInfo,{bootloaderVersion:fields(info).get(3) ?? 0});
  const raw=nested(bytes,[1,3]);
  if(raw && fields(raw).has(5))Object.assign(core,{enterBootloader:fields(raw).get(5)===1});
  return response;
}
