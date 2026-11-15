import { expect, test } from "bun:test";
import { openReceiverStudioPort } from "../src/connection/serial2g4";

function mockPort(failDtr = false) {
  const calls: unknown[]=[];
  let input!: ReadableStreamDefaultController<Uint8Array>;
  const rawRead=new ReadableStream<Uint8Array>({start(c){input=c;}});
  const rawWrite=new WritableStream<Uint8Array>({write(b){calls.push([...b]);}});
  const port={readable:rawRead,writable:rawWrite,
    async open(options:unknown){calls.push(options);},
    async setSignals(signals:{dataTerminalReady:boolean}){calls.push(signals);if(failDtr && signals.dataTerminalReady)throw Error('DTR failed');},
    async close(){expect(rawRead.locked).toBe(false);expect(rawWrite.locked).toBe(false);calls.push('closed');},
  } as unknown as SerialPort;
  return {port,calls,input};
}
test("starts the radio session with DTR and forwards framed bytes without altering them",async()=>{
  const m=mockPort();const transport=await openReceiverStudioPort(m.port);
  expect(m.calls.slice(0,2)).toEqual([{baudRate:115200},{dataTerminalReady:true}]);
  const reader=transport.readable.getReader();const writer=transport.writable.getWriter();
  m.input.enqueue(Uint8Array.from([0xab,0,0xad]));
  expect([...(await reader.read()).value!]).toEqual([0xab,0,0xad]);
  await writer.write(Uint8Array.from([0xab,1,0xad]));
  transport.abortController.abort();
  await new Promise(r=>setTimeout(r,30));
  expect(m.calls).toContainEqual([0xab,1,0xad]);
  expect(m.calls).toContainEqual({dataTerminalReady:false});expect(m.calls.at(-1)).toBe('closed');
  reader.releaseLock();writer.releaseLock();
});
test("closes the port if DTR startup fails",async()=>{
  const m=mockPort(true);
  await expect(openReceiverStudioPort(m.port)).rejects.toThrow('DTR failed');
  expect(m.calls.at(-1)).toBe('closed');
});
