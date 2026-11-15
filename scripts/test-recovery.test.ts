import {expect,test} from 'bun:test';
import {DongleSerial} from '../src/connection/useDongle';
import {create_rpc_connection} from '../src/rpc/connection';
import {call_rpc,Response} from '@zmkfirmware/zmk-studio-ts-client';

test('AT reply before write completion cannot overlap the next writer',async()=>{
 let input!:ReadableStreamDefaultController<Uint8Array>, release!:()=>void;
 const commands:string[]=[];
 const readable=new ReadableStream<Uint8Array>({start(c){input=c;}});
 const writable=new WritableStream<Uint8Array>({write(bytes){
  commands.push(new TextDecoder().decode(bytes));input.enqueue(new TextEncoder().encode('OK\r\n'));
  if(commands.length===1)return new Promise<void>(r=>release=r);
 }});
 const port={readable,writable,open:async()=>{},close:async()=>{},addEventListener(){},removeEventListener(){}} as unknown as SerialPort;
 const client=new DongleSerial();await client.open(port);
 const one=client.send('AT'),two=client.send('AT+INFO');
 await new Promise(r=>setTimeout(r,10));expect(commands).toEqual(['AT\r\n']);
 release();expect((await one).ok).toBe(true);expect((await two).ok).toBe(true);
 expect(writable.locked).toBe(false);await client.close();
});

test('AT timeout settles queued commands and rejects reuse until reconnect',async()=>{
 const port={readable:new ReadableStream<Uint8Array>(),writable:new WritableStream<Uint8Array>(),
 open:async()=>{},close:async()=>{},addEventListener(){},removeEventListener(){}} as unknown as SerialPort;
 const client=new DongleSerial();await client.open(port);
 expect((await client.send('AT',15)).timedOut).toBe(true);
 await expect(client.send('AT')).rejects.toThrow('not open');
 expect(port.writable!.locked).toBe(false);await client.close();
});

function mockTransport(reply=false){
 let input!:ReadableStreamDefaultController<Uint8Array>;
 const abortController=new AbortController();
 const readable=new ReadableStream<Uint8Array>({start(c){input=c;}});
 let responded=false;
 const writable=new WritableStream<Uint8Array>({write(){if(reply && !responded){
  responded=true;
  const bytes=Response.encode({requestResponse:{requestId:0,core:{getDeviceInfo:{name:'EVO',serialNumber:new Uint8Array([1])}}}}).finish();
  input.enqueue(Uint8Array.from([0xab,...Array.from(bytes).flatMap(b=>[0xab,0xac,0xad].includes(b)?[0xac,b]:[b]),0xad]));
 }}});
 return {label:'test',abortController,readable,writable};
}
test('RPC timeout aborts a stalled connection and releases the global RPC mutex',async()=>{
 const stalled=mockTransport();const conn=create_rpc_connection(stalled,{timeoutMs:25});
 // Consume notifications as App does, so stream tee cancellation can settle.
 const notifications=conn.notification_readable.getReader();
 const notices=notifications.read().catch(()=>{});
 await expect(call_rpc(conn,{core:{getDeviceInfo:true}})).rejects.toBeDefined();
 expect(stalled.abortController.signal.aborted).toBe(true);
 await notices;notifications.releaseLock();
 const healthy=mockTransport(true);const next=create_rpc_connection(healthy,{timeoutMs:1000});
 expect((await call_rpc(next,{core:{getDeviceInfo:true}})).core?.getDeviceInfo?.name).toBe('EVO');
 healthy.abortController.abort();
});
