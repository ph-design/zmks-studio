import type {RpcTransport} from "@zmkfirmware/zmk-studio-ts-client/transport/index";
// Require proof for slot 2: an old single-keyboard Hub must never silently
// route a "Keyboard 2" edit to Keyboard 1.
export async function verifyReceiverTarget(t:RpcTransport,slot:0|1):Promise<RpcTransport> {
 if(!slot)return t;
 const reader=t.readable.getReader();
 let timer:ReturnType<typeof setTimeout>|undefined;
 const expected=new TextEncoder().encode("HUB_TARGET=1\r\n");
 let offset=0,extra=new Uint8Array(0);
 try {
   await Promise.race([
    (async()=>{
     while(offset<expected.length) {
      const {value,done}=await reader.read();if(done || !value)throw Error("Receiver closed before target confirmation");
      let i=0;for(;i<value.length && offset<expected.length;i++,offset++)if(value[i]!==expected[offset])throw Error("Wrong receiver target confirmation");
      if(i<value.length)extra=value.slice(i);
     }
    })(),
    new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error("Keyboard 2 needs paired slot 2 and multi-keyboard Hub firmware")),2500);}),
   ]);
 } catch(e) {
   await reader.cancel(e).catch(()=>{});reader.releaseLock();t.abortController.abort(e);throw e;
 } finally {if(timer)clearTimeout(timer);}
 let cancelled=false;
 const readable=new ReadableStream<Uint8Array>({
   start(c){if(extra.length)c.enqueue(extra);},
   async pull(c){try{const r=await reader.read();if(cancelled)return;if(r.done){c.close();reader.releaseLock();}else c.enqueue(r.value);}catch(e){if(!cancelled)c.error(e);}},
   async cancel(reason){cancelled=true;await reader.cancel(reason).catch(()=>{});reader.releaseLock();},
 });
 return {...t,label:`2.4G keyboard ${slot+1} · ${t.label}`,readable};
}
