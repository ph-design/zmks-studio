import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import type { RpcTransport } from "@zmkfirmware/zmk-studio-ts-client/transport/index";
import { AvailableDevice } from ".";

export async function list_devices(dongleOnly = false): Promise<Array<AvailableDevice>> {
  const devices = await invoke<Array<AvailableDevice>>("serial_list_devices", { dongleOnly });
  return dongleOnly ? devices : devices.filter(d => !d.serialRole);
}

export async function connect(dev: AvailableDevice, dtr = false, baudRate = 9600): Promise<RpcTransport> {
  if (dev.serialRole === "receiver-management") throw new Error("Select the receiver Studio interface for keyboard configuration");
  const abortController = new AbortController();
  let input!: ReadableStreamDefaultController<Uint8Array>;
  let opened = false, cleaning = false;
  const readable = new ReadableStream<Uint8Array>({ start(c) { input = c; }, cancel: () => cleanup() });
  const unlistenData = await listen<number[]>("connection_data", event => {
    if (!cleaning) input.enqueue(Uint8Array.from(event.payload));
  });
  const unlistenLost = await listen("connection_disconnected", () => { void cleanup(); });
  async function cleanup() {
    if (cleaning) return;
    cleaning = true;
    unlistenData(); unlistenLost();
    try { input.close(); } catch { /* stream already cancelled */ }
    if (opened) await invoke("transport_close").catch(() => {});
    if (!abortController.signal.aborted) abortController.abort();
  }
  abortController.signal.addEventListener("abort", () => { void cleanup(); }, { once: true });
  try {
    // Register listeners BEFORE DTR can produce the target-confirmation banner.
    if (!(await invoke("serial_connect", { ...dev, dtr, baudRate }))) throw new Error("Failed to connect");
    opened = true;
  } catch (e) { await cleanup(); throw e; }
  const writable = new WritableStream<Uint8Array>({
    write: chunk => invoke("transport_send_data", new Uint8Array(chunk)),
    close: cleanup,
    abort: cleanup,
  });
  return { label: dev.label, abortController, readable, writable };
}
