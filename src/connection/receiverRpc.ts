import { create_rpc_connection } from "@zmkfirmware/zmk-studio-ts-client";
import type { UsbTransport } from "./usbTransport";

const nextRequestId = new WeakMap<UsbTransport, number>();

// Abort the RPC session without closing the USB port. Pairing commands and
// subsequent RPC sessions can then use the same CDC.
export function openReceiverRpc(usb: UsbTransport, signal: AbortSignal) {
  const attempt = new AbortController();
  const stop = () => attempt.abort();
  const owner = AbortSignal.any([signal, usb.abortController.signal]);
  if (owner.aborted) stop();
  else owner.addEventListener("abort", stop, { once: true });

  let started = false;
  const input = new TransformStream<Uint8Array, Uint8Array>({
    transform(bytes, controller) {
      if (started) {
        controller.enqueue(bytes);
        return;
      }
      const start = bytes.indexOf(0xab);
      if (start !== -1) {
        started = true;
        controller.enqueue(bytes.subarray(start));
      }
    },
  });
  const output = new TransformStream<Uint8Array, Uint8Array>();
  const io = Promise.allSettled([
    usb.readable.pipeTo(input.writable, { signal: attempt.signal, preventCancel: true }),
    output.readable.pipeTo(usb.writable, {
      signal: attempt.signal, preventAbort: true, preventClose: true,
    }),
  ]);
  const conn = create_rpc_connection({
    label: usb.label, readable: input.readable, writable: output.writable, abortController: attempt,
  }, { signal: attempt.signal });
  conn.current_request = nextRequestId.get(usb) ?? 0;

  let timer: ReturnType<typeof setTimeout> | undefined;
  let requestId: number | undefined;
  const writer = conn.request_writable.getWriter();
  attempt.signal.addEventListener("abort", () => {
    clearTimeout(timer);
    nextRequestId.set(usb, conn.current_request);
    writer.releaseLock();
    owner.removeEventListener("abort", stop);
  }, { once: true });
  conn.request_writable = new WritableStream({
    write(request) {
      if (!request.confirmAction) {
        clearTimeout(timer);
        requestId = request.requestId;
        timer = setTimeout(stop, 8000);
      }
      return writer.write(request);
    },
  });
  conn.request_response_readable = conn.request_response_readable.pipeThrough(new TransformStream({
    transform(response, controller) {
      if (response.requestId === requestId) clearTimeout(timer);
      controller.enqueue(response);
    },
  }), { signal: attempt.signal });

  return {
    conn, signal: attempt.signal,
    async close() {
      stop();
      await io;
    },
  };
}
