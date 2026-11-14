import type { DongleStatus } from "./useDongle";
export type MotionLockState = "READY" | "LOCKED" | "UNKNOWN";
export type ReceiverIndicator = "waiting" | "normal" | "mixed" | "locked" | "lowBattery" | "override";
export function receiverIndicator(s: DongleStatus | undefined): ReceiverIndicator {
  if (s?.ledMode !== "AUTO" || s?.ledBrightness === 0) return "override";
  const online = (s.hubPeers ?? []).filter(p => p.connected);
  if (!online.length) return s.link === "CONNECTED" ? "normal" : "waiting";
  if (online.some(p => p.batteryPercent !== undefined && p.batteryPercent <= (s.ledLowPct ?? 20))) return "lowBattery";
  const locked = online.filter(p => p.motionState === "LOCKED").length;
  return locked === online.length ? "locked" : locked ? "mixed" : "normal";
}
export function hasMotionGuard(s: DongleStatus | undefined, slot: number | undefined): boolean {
  return slot !== undefined && !!s?.hubPeers?.some(p => p.slot === slot && p.connected &&
    (p.motionState === "READY" || p.motionState === "LOCKED"));
}
