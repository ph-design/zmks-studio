import { Channel, invoke } from "@tauri-apps/api/core";

import type { RpcTransport } from "@zmkfirmware/zmk-studio-ts-client/transport/index";
import type { AvailableDevice } from ".";
import type { UsbTransport } from "../connection/usbTransport";

let nextSession = 0;

export async function list_devices(): Promise<Array<AvailableDevice>> {
  return invoke("serial_list_devices");
}

export async function connect(dev: AvailableDevice): Promise<UsbTransport> {
  const session = ++nextSession;
  const abortController = new AbortController();
  const onData = new Channel<number[] | null>();
  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      onData.onmessage = (bytes) => {
        if (bytes === null) {
          controller.close();
          abortController.abort();
        } else {
          controller.enqueue(new Uint8Array(bytes));
        }
      };
    },
    cancel() {
      onData.onmessage = () => {};
    },
  });
  const writable: RpcTransport["writable"] = new WritableStream({
    write(chunk) {
      return invoke("serial_send", new Uint8Array(chunk), {
        headers: { "x-serial-session": String(session) },
      });
    },
  });

  await invoke("serial_connect", { id: dev.id, session, onData });
  abortController.signal.addEventListener("abort", () => {
    void invoke("serial_close", { session }).catch(console.error);
  }, { once: true });

  return {
    label: dev.label, abortController, readable, writable,
    usb: { usbVendorId: dev.usbVendorId ?? undefined, usbProductId: dev.usbProductId ?? undefined },
  };
}
