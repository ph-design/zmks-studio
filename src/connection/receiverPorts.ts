import type { AvailableDevice } from "../tauri";
export function receiverStudioCandidates(devices: AvailableDevice[], management: AvailableDevice | undefined) {
  return devices.filter(d => d.id !== management?.id && d.serialRole !== "receiver-management" &&
    (!management?.receiverId || d.receiverId === management.receiverId));
}
