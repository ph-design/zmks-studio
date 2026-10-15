import { invoke } from "@tauri-apps/api/core";

/*
 * Bench-side filesystem work, done in Rust: the webview cannot enumerate drives
 * or write to one, and the bootloader volume only exists while the board sits in
 * it, so this is the one part of the flow that cannot go through the RPC
 * connection the rest of the app uses.
 */

export interface Uf2Drive {
  path: string;
  label: string;
  model: string;
  board_id: string;
}

export interface FirmwareCandidate {
  path: string;
  name: string;
  size: number;
  modified_ms: number;
}

export async function listUf2Drives(): Promise<Uf2Drive[]> {
  return await invoke("factory_list_uf2_drives");
}

export async function listFirmware(dir: string): Promise<FirmwareCandidate[]> {
  return await invoke("factory_list_firmware", { dir });
}

/** Resolves once the board has rebooted out of mass-storage mode. */
export async function flashUf2(uf2Path: string, drive: string): Promise<string> {
  return await invoke("factory_flash_uf2", { uf2Path, drive });
}

/** The Rust commands only exist in the desktop build. */
export function factoryBackendAvailable(): boolean {
  return typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;
}
