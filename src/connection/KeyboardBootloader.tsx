import {useContext,useEffect,useState} from "react";
import type {CarbonTheme} from "../carbon/theme";
import {ActionButton,Notice,SettingsBlock} from "../carbon/CarbonChrome";
import {ConnectionContext} from "../rpc/ConnectionContext";
import {call_rpc} from "../rpc/logging";
import type {BootloaderCore} from "../rpc/bootloaderProtocol";
import type {Request} from "@zmkfirmware/zmk-studio-ts-client";
import type {Translate} from "../misc/format";
export function KeyboardBootloader({th,t,connectionType}:{th:CarbonTheme;t:Translate;connectionType?:string}) {
  const {conn}=useContext(ConnectionContext);
  const [version,setVersion]=useState(0),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  const usb=connectionType==="USB";
  useEffect(()=>{let alive=true;setVersion(0);setMessage("");
    if(conn && usb)void call_rpc(conn,{core:{getDeviceInfo:true}}).then(r=>{
      if(alive)setVersion((r.core?.getDeviceInfo as {bootloaderVersion?:number})?.bootloaderVersion ?? 0);
    });return()=>{alive=false;};},[conn,usb]);
  const run=async()=>{if(!conn || !usb || !version || busy)return;setBusy(true);setMessage("");
    try {
      const core={enterBootloader:true} as NonNullable<Request["core"]> & BootloaderCore;
      const r=await call_rpc(conn,{core});
      setMessage((r.core as BootloaderCore)?.enterBootloader===true ? t("bootloader.keyboardDone","Keyboard is restarting. Open its UF2 drive to install firmware.") : t("bootloader.failed","Bootloader entry was not confirmed. Check the USB cable and firmware version."));
    }catch{setMessage(t("bootloader.failed","Bootloader entry was not confirmed. Check the USB cable and firmware version."));}
    finally{setBusy(false);}
  };
  return <SettingsBlock th={th} title={t("bootloader.keyboardTitle","Keyboard firmware update")} hint={t("bootloader.keyboardHint","Save your changes first. The USB keyboard restarts into its UF2 bootloader and disconnects from Studio.")}>
    <ActionButton th={th} label={t("bootloader.keyboardButton","Enter keyboard bootloader (BL)")} disabled={!usb || !version || busy} onClick={()=>void run()} />
    {!usb && <p className="mt-2 text-xs text-helper">{t("bootloader.usbRequired","Connect the keyboard directly by USB and choose USB in Studio. Wireless entry cannot create a keyboard UF2 drive on this PC.")}</p>}
    {usb && !version && <p className="mt-2 text-xs text-helper">{t("bootloader.upgradeRequired","Requires keyboard firmware preview.11 or newer.")}</p>}
    {message && <Notice th={th} tone="neutral">{message}</Notice>}
  </SettingsBlock>;
}
