import {verifyReceiverTarget} from "./verifyReceiverTarget";
import type { RpcTransport } from "@zmkfirmware/zmk-studio-ts-client/transport/index";
import { UserCancelledError } from "@zmkfirmware/zmk-studio-ts-client/transport/errors";

export const RECEIVER_USB_FILTER = { usbVendorId: 0x5048, usbProductId: 0xff11 };

// Both CDC functions share a VID/PID. The picker must select Studio, not AT.
export async function connect(slot: 0 | 1 = 0): Promise<RpcTransport> {
  let port: SerialPort;
  try {
    port = await navigator.serial.requestPort({ filters: [RECEIVER_USB_FILTER] });
  } catch (e) {
    if (e instanceof DOMException && e.name === "NotFoundError") throw new UserCancelledError("Receiver port selection cancelled", { cause: e });
    throw e;
  }
  return verifyReceiverTarget(await openReceiverStudioPort(port, slot), slot);
}

export async function openReceiverStudioPort(port: SerialPort, slot: 0 | 1 = 0): Promise<RpcTransport> {
  await port.open({ baudRate: slot ? 230400 : 115200 });
  try {
    // The receiver creates the encrypted radio session on DTR's rising edge.
    await port.setSignals({ dataTerminalReady: true });
    if (!port.readable || !port.writable) throw new Error("Receiver serial streams unavailable");
  } catch (e) {
    await port.close().catch(() => {});
    throw e;
  }
  const abortController = new AbortController();
  const reader = port.readable!.getReader();
  const writer = port.writable!.getWriter();
  let input!: ReadableStreamDefaultController<Uint8Array>;
  let output!: WritableStreamDefaultController;
  let cleaning = false;
  const cleanup = async (reason?: unknown) => {
    if (cleaning) return;
    cleaning = true;
    abortController.abort(reason);
    await Promise.allSettled([reader.cancel(reason), writer.abort(reason)]);
    reader.releaseLock(); writer.releaseLock();
    try { input.close(); } catch { /* wrapper may already be cancelled */ }
    try { output.error(reason); } catch { /* wrapper may already be closed */ }
    await port.setSignals({ dataTerminalReady: false }).catch(() => {});
    await port.close().catch(() => {});
  };
  const readable = new ReadableStream<Uint8Array>({
    start(c) { input = c; },
    async pull(c) {
      try {
        const { value, done } = await reader.read();
        if (cleaning) return;
        if (done) { c.close(); void cleanup(); }
        else c.enqueue(value);
      } catch (e) { if (!cleaning) { c.error(e); void cleanup(e); } }
    },
    cancel: cleanup,
  });
  const writable = new WritableStream<Uint8Array>({
    start(c) { output = c; },
    write: bytes => writer.write(bytes),
    close: () => cleanup(),
    abort: cleanup,
  });
  abortController.signal.addEventListener("abort", () => { void cleanup(abortController.signal.reason); }, { once: true });
  return { label: `2.4G receiver Studio ${slot+1}`, abortController, readable, writable };
}
