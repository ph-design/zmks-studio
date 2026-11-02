import { Transport } from "@zmkfirmware/zmk-studio-ts-client/connection";
export type Translate = (key: string, defaultValue: string) => string;
export const DASH = "—";

export function toHex(bytes: Uint8Array | undefined, separator = ""): string {
  if (!bytes || bytes.length === 0) return "";
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(separator)
    .toUpperCase();
}

export function keyIdHex(id: number | undefined): string {
  if (id === undefined || Number.isNaN(id)) return "";
  return (id >>> 0).toString(16).padStart(8, "0").toUpperCase();
}

export function formatBleAddress(bytes: Uint8Array | undefined): string {
  if (!bytes || bytes.length < 6) return "";
  return Array.from(bytes.slice(0, 6))
    .reverse()
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(":")
    .toUpperCase();
}

export function format2g4Address(hex: string | undefined): string {
  if (!hex) return "";
  const upper = hex.toUpperCase();
  return upper.length === 10 ? `${upper.slice(0, 8)}:${upper.slice(8)}` : upper;
}

export function channelToMhz(channel: number | undefined): string {
  if (channel === undefined || Number.isNaN(channel)) return DASH;
  return `${2400 + channel} MHz`;
}

export function transportName(transport: Transport, bleProfile = 0): string {
  switch (transport) {
    case Transport.ZMK_CONNECTION_TRANSPORT_USB:
      return "USB";
    case Transport.ZMK_CONNECTION_TRANSPORT_BLE:
      return `BLE:${bleProfile}`;
    case Transport.ZMK_CONNECTION_TRANSPORT_2G4:
      return "2.4G";
    default:
      return DASH;
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
