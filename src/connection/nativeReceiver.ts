import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { AvailableDevice } from "../tauri";
export type ReceiverPort = SerialPort & { device?: AvailableDevice };
export const isDesktop = () => typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;
const ports = new Map<string, ReceiverPort>();
class NativeReceiverPort extends EventTarget {
  readable: ReadableStream<Uint8Array> | null = null;
  writable: WritableStream<Uint8Array> | null = null;
  private session = "";
  private input?: ReadableStreamDefaultController<Uint8Array>;
  private unlisten: UnlistenFn[] = [];
  constructor(readonly device: AvailableDevice) { super(); }
  getInfo() { return { usbVendorId: 0x5048, usbProductId: 0xff11 }; }
  async open() {
    if (this.session) throw new Error("Receiver management interface is already open");
    const session = crypto.randomUUID(); this.session = session;
    this.readable = new ReadableStream({ start: c => { this.input = c; }, cancel: () => this.close() });
    this.writable = new WritableStream({ write: bytes => invoke("receiver_serial_write", { session, data: [...bytes] }) });
    try {
      this.unlisten.push(await listen<{ session: string; data: number[] }>("receiver_serial_data", e => {
        if (e.payload.session === this.session) this.input?.enqueue(Uint8Array.from(e.payload.data));
      }));
      this.unlisten.push(await listen<{ session: string }>("receiver_serial_lost", e => {
        if (e.payload.session === this.session) {
          try { this.input?.close(); } catch { /* already cancelled */ }
          this.dispatchEvent(new Event("disconnect"));
        }
      }));
      await invoke("receiver_serial_open", { id: this.device.id, session });
    } catch (e) { await this.close(); throw e; }
  }
  async setSignals() { /* native open asserts DTR */ }
  async close() {
    const session = this.session; this.session = "";
    this.unlisten.splice(0).forEach(f => f());
    if (session) await invoke("receiver_serial_close", { session }).catch(() => {});
    try { this.input?.close(); } catch { /* read stream already cancelled */ }
    this.input = undefined;
  }
}
export function nativeReceiverApi(): Serial {
  return {
    async getPorts() {
      const devices = await invoke<AvailableDevice[]>("serial_list_devices", { dongleOnly: true });
      return devices.filter(d => d.serialRole !== "receiver-studio").map(d => {
        if (!ports.has(d.id)) ports.set(d.id, new NativeReceiverPort(d) as unknown as ReceiverPort);
        return ports.get(d.id)!;
      });
    },
    async requestPort() {
      const candidates = await this.getPorts();
      if (candidates.length !== 1) throw new Error("Select a receiver management interface from the device list");
      return candidates[0];
    },
  } as Serial;
}
