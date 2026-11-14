import { expect, test } from "bun:test";
import { parseDongleStatus } from "../src/connection/useDongle";
test("parses wireless Studio and BLE HID scan records independently", () => {
  const s=parseDongleStatus("STUDIO_2G4=1\nSTUDIO_ACTIVE=0\nBLE_MOUSE=1\nBLE_STATE=SCANNING\nBLE_RX=360\nBLE_ERROR=-12\nBLE_DEVICE=0,-56,Inphic IN10\nBLE_DEVICE=1,-70,Mouse, BLE\nBLE_DEVICE=0,-50,Inphic IN10");
  expect(s.studio2g4).toBe(true);expect(s.studioActive).toBe(false);
  expect(s.bleMouse).toBe(true);expect(s.bleError).toBe(-12);expect(s.bleRx).toBe(360);
  expect(s.bleDevices).toEqual([{index:1,rssi:-70,name:"Mouse, BLE"},{index:0,rssi:-50,name:"Inphic IN10"}]);
});
test("rejects malformed scan indices, state and counters", () => {
  expect(parseDongleStatus("STUDIO_2G4=x\nBLE_MOUSE=2\nBLE_STATE=UNKNOWN\nBLE_RX=-1\nBLE_ERROR=NaN\nBLE_DEVICE=8,-40,Mouse\nBLE_DEVICE=0,-128,Mouse\nBLE_DEVICE=0,-40,")).toEqual({});
});
