// Stream routing follows the MIT-licensed zmk-studio-ts-client implementation.
// Additive pairing / Motion Guard extensions, bounded requests, and independent stream cancellation.
import {Request,Response,type RpcConnection} from "@zmkfirmware/zmk-studio-ts-client";
import {get_encoder,get_decoder} from "@zmkfirmware/zmk-studio-ts-client/framing";
import type {RpcTransport} from "@zmkfirmware/zmk-studio-ts-client/transport/index";
import {Writer} from "protobufjs/minimal";
import { encodeGuardRequest, decodeGuardResponse } from "../motion/guardProtocol";
export type ExtendedRequest=Omit<Request,"pairing"> & {pairing?: NonNullable<Request["pairing"]> & {setChannel?:{channel:number}}};
export function encodeRequest(req:ExtendedRequest):Uint8Array {
  const channel=req.pairing?.setChannel?.channel;
  if(channel===undefined)return encodeGuardRequest(req) ?? Request.encode(req).finish();
  if(!Number.isInteger(channel) || channel<0 || channel>100 || [2,26,80].includes(channel))throw Error("Invalid radio channel");
  const base=Request.encode({...req,pairing:undefined}).finish();
  const body=Writer.create().uint32(8).uint32(channel).finish();
  const pairing=Writer.create().uint32(34).bytes(body).finish();
  const extra=Writer.create().uint32(74).bytes(pairing).finish();
  const all=new Uint8Array(base.length+extra.length);all.set(base);all.set(extra,base.length);return all;
}
export function create_rpc_connection(transport:RpcTransport,opts?:{signal?:AbortSignal;timeoutMs?:number}):RpcConnection {
  const lifetime = new AbortController();
  const signal = lifetime.signal;
  let replyController!: ReadableStreamDefaultController<NonNullable<Response["requestResponse"]>>;
  let notificationController!: ReadableStreamDefaultController<NonNullable<Response["notification"]>>;
  const replies = new ReadableStream<NonNullable<Response["requestResponse"]>>({start(c){replyController=c;}});
  const notifications = new ReadableStream<NonNullable<Response["notification"]>>({start(c){notificationController=c;}});
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pendingId: number | undefined;
  const stop = (reason?: unknown) => {
    if (signal.aborted) return;
    clearTimeout(timer);
    // Error both consumer streams immediately. A tee cancellation can otherwise
    // wait forever for the other branch while the SDK holds its global mutex.
    try { replyController.error(reason ?? new Error("Connection closed")); } catch {}
    try { notificationController.error(reason ?? new Error("Connection closed")); } catch {}
    lifetime.abort(reason);
    transport.abortController.abort(reason);
  };
  const fromCaller = () => stop(opts?.signal?.reason);
  const fromTransport = () => stop(transport.abortController.signal.reason);
  opts?.signal?.addEventListener("abort", fromCaller, {once:true});
  transport.abortController.signal.addEventListener("abort", fromTransport, {once:true});
  signal.addEventListener("abort", () => {
    clearTimeout(timer);
    opts?.signal?.removeEventListener("abort", fromCaller);
    transport.abortController.signal.removeEventListener("abort", fromTransport);
  }, {once:true});
  if (opts?.signal?.aborted || transport.abortController.signal.aborted) stop(opts?.signal?.reason);
  const startDeadline = (id: number) => {
    clearTimeout(timer); pendingId = id;
    timer = setTimeout(() => stop(new Error("Keyboard RPC timed out. Save result is unknown; reconnect and check before retrying.")), opts?.timeoutMs ?? 15000);
  };
  const requests=new TransformStream<Request,Uint8Array>({transform(req,c){startDeadline(req.requestId);c.enqueue(encodeRequest(req));}});
  const closed=requests.readable.pipeThrough(new TransformStream(get_encoder()),{signal}).pipeTo(transport.writable,{signal});
  void closed.then(()=>transport.abortController.abort(),reason=>transport.abortController.abort(reason));
  const decoded=transport.readable.pipeThrough(new TransformStream(get_decoder()),{signal})
    .pipeThrough(new TransformStream<Uint8Array,Response>({transform(bytes,c){const response=decodeGuardResponse(bytes);
      if(response.requestResponse?.requestId===pendingId){clearTimeout(timer);pendingId=undefined;}
      c.enqueue(response);}}),{signal});
  const decodedReader=decoded.getReader();
  void (async () => {
    try {
      for (;;) {
        const {value,done}=await decodedReader.read();
        if(done){stop(new Error("Keyboard connection ended"));break;}
        if(value.requestResponse)replyController.enqueue(value.requestResponse);
        if(value.notification)notificationController.enqueue(value.notification);
      }
    } catch(error) { stop(error); }
    finally { decodedReader.releaseLock(); }
  })();
  return {
    label:transport.label,current_request:0,request_writable:requests.writable,
    request_response_readable:replies,
    notification_readable:notifications,
  };
}
