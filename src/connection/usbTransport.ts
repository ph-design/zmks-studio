import type { RpcTransport } from "@zmkfirmware/zmk-studio-ts-client/transport/index";

export type UsbTransport = RpcTransport & { usb: SerialPortInfo };

export function isUsbTransport(transport: RpcTransport): transport is UsbTransport {
  return "usb" in transport;
}

export async function openUsbPort(port: SerialPort, label: string): Promise<UsbTransport> {
  await port.open({ baudRate: 115200 });
  try {
    await port.setSignals({ dataTerminalReady: true });
  } catch (error) {
    await port.close();
    throw error;
  }
  const reader = port.readable!.getReader();
  const writer = port.writable!.getWriter();
  const abortController = new AbortController();
  const readable = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await reader.read();
        if (done) {
          controller.close();
          abortController.abort();
        } else {
          controller.enqueue(value);
        }
      } catch (error) {
        controller.error(error);
        abortController.abort(error);
      }
    },
    cancel(reason) {
      abortController.abort(reason);
    },
  }, { highWaterMark: 0 });
  const writable: RpcTransport["writable"] = new WritableStream({
    write: (bytes) => writer.write(bytes),
    close: () => abortController.abort(),
    abort: (reason) => abortController.abort(reason),
  });

  const onDisconnect = () => abortController.abort();
  port.addEventListener("disconnect", onDisconnect);
  abortController.signal.addEventListener("abort", () => {
    port.removeEventListener("disconnect", onDisconnect);
    void Promise.allSettled([reader.cancel(), writer.abort()]).then(() => {
      reader.releaseLock();
      writer.releaseLock();
      return port.close();
    }).catch(console.error);
  }, { once: true });

  return { label, abortController, readable, writable, usb: port.getInfo() };
}

export async function connectUsb(): Promise<UsbTransport> {
  const port = await navigator.serial.requestPort();
  return openUsbPort(port, "USB");
}
