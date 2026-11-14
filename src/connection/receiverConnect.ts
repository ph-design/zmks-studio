import { connect as webConnect } from "./serial2g4";
import { connect as nativeConnect, list_devices } from "../tauri/serial";
import { verifyReceiverTarget } from "./verifyReceiverTarget";
import { isDesktop, type ReceiverPort } from "./nativeReceiver";
import { receiverStudioCandidates } from "./receiverPorts";
export async function connectReceiverKeyboard(management: SerialPort | undefined, slot: 0 | 1) {
  if (!management) throw new Error("Connect the receiver before selecting a keyboard");
  if (!isDesktop()) return webConnect(slot, management);
  const parent = (management as ReceiverPort).device;
  const candidates = receiverStudioCandidates(await list_devices(true), parent);
  if (candidates.length !== 1) throw new Error("Unable to identify this receiver's Studio interface. Check its USB connection.");
  const transport = await verifyReceiverTarget(await nativeConnect(candidates[0], true, slot ? 230400 : 115200), slot);
  return { ...transport, label: `2.4G keyboard ${slot + 1} · ${transport.label}` };
}
