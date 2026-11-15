import { expect, test } from "bun:test";
import { parseDongleStatus } from "../src/connection/useDongle";
import { hasMotionGuard, receiverIndicator } from "../src/connection/receiverState";
import { receiverStudioCandidates } from "../src/connection/receiverPorts";
import { connect } from "../src/connection/serial2g4";
const peer = (slot:number,online=true) => `HUB_PEER=${slot},1,1,${online?1:0},80,11223344,0102030405,82,100,0,0`;
const raw = (a:string,b:string,online=true) => `HUB_PEERS=2\nLED_MODE=AUTO\nLED_BRIGHTNESS=100\n${peer(0)}\nHUB_MOTION=0,${a}\n${peer(1,online)}\nHUB_MOTION=1,${b}`;
test("motion states are independent, order-independent, and never inferred from an absent field",()=>{
 const status=parseDongleStatus(raw("LOCKED","READY"));
 expect(status.hubPeers?.map(p=>p.motionState)).toEqual(["LOCKED","READY"]);
 expect(receiverIndicator(status)).toBe("mixed");expect(hasMotionGuard(status,1)).toBe(true);
 const reordered=parseDongleStatus(`HUB_MOTION=1,LOCKED\n${peer(1)}\n${peer(0)}`);
 expect(reordered.hubPeers?.find(p=>p.slot===1)?.motionState).toBe("LOCKED");
 expect(reordered.hubPeers?.find(p=>p.slot===0)?.motionState).toBe("UNKNOWN");
 expect(parseDongleStatus(`${peer(0)}\nHUB_MOTION=0,INVALID`).hubPeers?.[0].motionState).toBe("UNKNOWN");
 expect(hasMotionGuard(parseDongleStatus(peer(0)),0)).toBe(false);
});
test("offline or unknown peers cannot be counted as locked; LED rules follow connected peers only",()=>{
 expect(receiverIndicator(parseDongleStatus(raw("LOCKED","LOCKED")))).toBe("locked");
 expect(receiverIndicator(parseDongleStatus(raw("READY","READY")))).toBe("normal");
 expect(receiverIndicator(parseDongleStatus(raw("LOCKED","UNKNOWN")))).toBe("mixed");
 expect(receiverIndicator(parseDongleStatus(raw("LOCKED","LOCKED",false)))).toBe("locked");
 const offline=parseDongleStatus(`${peer(0,false)}\nHUB_MOTION=0,LOCKED\nLED_MODE=AUTO`);
 expect(offline.hubPeers?.[0].motionState).toBe("UNKNOWN");expect(hasMotionGuard(offline,0)).toBe(false);
 expect(receiverIndicator(offline)).toBe("waiting");
});
test("Studio interface belongs to the selected receiver, independent of COM ordering",()=>{
 const devices=[{id:"COM90",label:"AT A",serialRole:"receiver-management" as const,receiverId:"A"},
 {id:"COM3",label:"Studio B",serialRole:"receiver-studio" as const,receiverId:"B"},
 {id:"COM17",label:"Studio A",serialRole:"receiver-studio" as const,receiverId:"A"}];
 expect(receiverStudioCandidates(devices,devices[0]).map(p=>p.id)).toEqual(["COM17"]);
 expect(receiverStudioCandidates(devices.slice(0,2),devices[0])).toEqual([]);
});
test("browser refuses the already connected management interface before writing Studio traffic",async()=>{
 let opens=0;
 const management={open:async()=>{opens++;},getInfo:()=>({usbVendorId:0x5048,usbProductId:0xff11})} as unknown as SerialPort;
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,"navigator");
 Object.defineProperty(globalThis,"navigator",{value:{serial:{getPorts:async()=>[management],requestPort:async()=>management}},configurable:true});
 try {await expect(connect(1,management)).rejects.toThrow("management interface");expect(opens).toBe(0);}
 finally {if(descriptor)Object.defineProperty(globalThis,"navigator",descriptor);else Reflect.deleteProperty(globalThis,"navigator");}
});
