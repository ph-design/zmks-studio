import {useContext,useState} from "react";
import {Transport} from "@zmkfirmware/zmk-studio-ts-client/connection";
import type {CarbonTheme} from "../carbon/theme";
import {ConfirmAction,Facts,Notice} from "../carbon/CarbonChrome";
import type {Translate} from "../misc/format";
import {ConnectionContext} from "../rpc/ConnectionContext";
import {call_rpc} from "../rpc/logging";
import type {ExtendedRequest} from "../rpc/connection";
import {generateKeyboardPairing,getKeyboardPairState,useConnectionSnapshot} from "./useConnectionState";
import type {DongleController} from "./useDongle";

export function HubKeyboardsPanel({th,t,dongle}:{th:CarbonTheme;t:Translate;dongle:DongleController}) {
 const conn=useContext(ConnectionContext).conn;
 const snapshot=useConnectionSnapshot();
 const [working,setWorking]=useState(false),[message,setMessage]=useState<string>();
 const s=dongle.status;
 const l=(key:string,fallback:string)=>t(`carbon.hubKeyboards.${key}`,fallback);
 if(s?.hubCapacity!==2)return null;
 const blocked=working || dongle.busy || dongle.phase!=="open" || s.hubStudioOpen;
 const wired=!!conn && snapshot.state?.activeTransport===Transport.ZMK_CONNECTION_TRANSPORT_USB && !conn.label.startsWith("2.4G");
 const pair=async(slot:number)=>{
   if(!conn || !wired)return;
   setWorking(true);setMessage(undefined);
   try {
     const channel=s.hubPeers?.find(p=>p.slot!==slot && p.enabled)?.rfChannel ?? s.rfChannel;
     if(channel===undefined)throw Error(l("noChannel","Read the receiver channel first."));
     const setChannel=async()=>{
       const req:Omit<ExtendedRequest,"requestId">={pairing:{setChannel:{channel}}};
       const result=await call_rpc(conn,req);if(result instanceof Error)throw Error(l("upgrade","This keyboard needs firmware with channel configuration support."));
       const state=await getKeyboardPairState(conn);if(state.rfChannel!==channel)throw Error(l("channelFailed","Keyboard channel did not update."));
     };
     // Confirm channel RPC support before replacing any key material.
     await setChannel();
     const generated=await generateKeyboardPairing(conn);
     await setChannel();
     const result=await dongle.send(`AT+PEERPAIR=${slot},${generated.keyHex},${generated.rfAddrHex},${channel.toString(16).padStart(2,"0")}`);
     if(!result?.ok)throw Error(l("retry","Keyboard pairing changed, but the receiver did not confirm it. Keep USB connected, close wireless Studio, and retry."));
     const after=await dongle.queryStatus(),peer=after.hubPeers?.find(p=>p.slot===slot);
     if(!peer?.paired || peer.keyId!==generated.keyId || peer.rfAddr!==generated.rfAddrHex || peer.rfChannel!==channel)throw Error(l("verifyFailed","Receiver pairing verification failed."));
     setMessage(l("paired","Pairing verified. Unplug keyboard USB and select 2.4G mode; choose its slot on the connection screen to remap it."));
   }catch(e){setMessage(e instanceof Error?e.message:String(e));}
   finally{setWorking(false);}
 };
 const clear=async(slot:number)=>{setWorking(true);setMessage(undefined);try{if((await dongle.send(`AT+PEERCLEAR=${slot}`))?.ok)await dongle.queryStatus();}finally{setWorking(false);}};
 return <section className="my-6 min-w-0 border-t border-base-300 pt-6">
  <h3 className="mb-3 text-sm font-semibold">{l("title","Keyboards in this Hub")}</h3>
  <Notice th={th} tone="neutral">{l("hint","Both keyboards can type simultaneously. To pair a slot, connect that keyboard directly over USB and unlock Studio. To remap wirelessly, choose Keyboard 1 or 2 on the 2.4G connection screen.")}</Notice>
  {s.hubStudioOpen && <p className="my-3 text-xs text-helper">{l("busy","Close the receiver Studio connection before pairing or clearing a slot.")}</p>}
  {(s.hubPeers??[]).map(p=><div key={p.slot} className="my-4 border border-base-300 p-3">
   <h4 className="mb-2 text-sm font-semibold">{l("keyboard","Keyboard")} {p.slot+1}{s.hubTarget===p.slot?` · ${l("target","Studio target")}`:""}</h4>
   <Facts th={th} rows={[
    {label:l("pairState","Pairing"),value:p.paired?l("yes","Paired"):l("no","Not paired")},
    {label:l("link","Link"),value:p.connected?l("online","Connected"):l("offline","Disconnected")},
    {label:l("battery","Battery"),value:p.connected && p.batteryPercent!==undefined?`${p.batteryPercent}%`:"—"},
    {label:l("channel","RF channel"),value:String(p.rfChannel)},
    {label:l("reports","Packets / decrypt errors / queue drops"),value:`${p.rx} / ${p.decryptFail} / ${p.queueDrop}`},
   ]}/>
   <div className="mt-3 flex flex-wrap gap-2">
    <ConfirmAction th={th} t={t} label={l("pair","Pair connected USB keyboard here")} confirmLabel={l("confirmPair","Click again to pair")}
      hint={l("pairHint","Replaces only this Hub slot and the connected USB keyboard's radio pairing. Existing keyboard mappings are preserved.")}
      disabled={!!blocked || !wired} onConfirm={()=>pair(p.slot)}/>
    <ConfirmAction th={th} t={t} tone="danger" label={l("clear","Clear this slot")} confirmLabel={l("confirmClear","Click again to clear")}
      hint={l("clearHint","Clears only this receiver slot; the other keyboard and BLE mouse are preserved.")}
      disabled={!!blocked || !p.paired} onConfirm={()=>clear(p.slot)}/>
   </div>
  </div>)}
  {message && <p role="status" className="break-words text-sm">{message}</p>}
 </section>;
}
