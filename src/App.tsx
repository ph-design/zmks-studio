import { AppHeader } from "./AppHeader";
import i18n from "./i18n";
import { I18nextProvider, useTranslation } from "react-i18next";

import { create_rpc_connection } from "@zmkfirmware/zmk-studio-ts-client";
import { call_rpc } from "./rpc/logging";

import type { Notification } from "@zmkfirmware/zmk-studio-ts-client/studio";
import { ConnectionState, ConnectionContext } from "./rpc/ConnectionContext";
import { Dispatch, useCallback, useEffect, useRef, useState } from "react";
import {
  ConnectModal,
  type ConnectionPhase,
  type TransportFactory,
} from "./ConnectModal";

import type { RpcTransport } from "@zmkfirmware/zmk-studio-ts-client/transport/index";
import { connect as gatt_connect } from "@zmkfirmware/zmk-studio-ts-client/transport/gatt";
import { connect as serial_connect } from "@zmkfirmware/zmk-studio-ts-client/transport/serial";
import {
  connect as tauri_ble_connect,
  list_devices as ble_list_devices,
} from "./tauri/ble";
import {
  connect as tauri_serial_connect,
  list_devices as serial_list_devices,
} from "./tauri/serial";
import Keyboard from "./keyboard/Keyboard";
import { UndoRedoContext, useUndoRedo } from "./undoRedo";
import { usePub, useSub } from "./usePubSub";
import { LockState } from "@zmkfirmware/zmk-studio-ts-client/core";
import { LockStateContext } from "./rpc/LockStateContext";
import { valueAfter } from "./misc/async";
import { AppFooter } from "./AppFooter";
import { AboutModal } from "./AboutModal";
import { LicenseNoticeModal } from "./misc/LicenseNoticeModal";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: object;
  }
}

const TRANSPORTS: TransportFactory[] = [
  navigator.serial && { label: "USB", connect: serial_connect },
  ...(navigator.bluetooth && navigator.userAgent.indexOf("Linux") >= 0
    ? [{ label: "BLE", connect: gatt_connect }]
    : []),
  ...(window.__TAURI_INTERNALS__
    ? [
        {
          label: "USB",
          pick_and_connect: {
            connect: tauri_serial_connect,
            list: serial_list_devices,
          },
        },
      ]
    : []),
  ...(window.__TAURI_INTERNALS__
    ? [
        {
          label: "BLE",
          isWireless: true,
          pick_and_connect: {
            connect: tauri_ble_connect,
            list: ble_list_devices,
          },
        },
      ]
    : []),
].filter((t) => t !== undefined);

async function listen_for_notifications(
  notification_stream: ReadableStream<Notification>,
  signal: AbortSignal
): Promise<void> {
  let reader = notification_stream.getReader();
  const onAbort = () => {
    reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    do {
      if (signal.aborted) {
        break;
      }

      let pub = usePub();
      let { done, value } = await reader.read();
      if (done) {
        break;
      }

      if (!value) {
        continue;
      }

      console.log("Notification", value);
      pub("rpc_notification", value);

      const subsystem = Object.entries(value).find(
        ([_k, v]) => v !== undefined
      );
      if (!subsystem) {
        continue;
      }

      const [subId, subData] = subsystem;
      const event = Object.entries(subData).find(([_k, v]) => v !== undefined);

      if (!event) {
        continue;
      }

      const [eventName, eventData] = event;
      const topic = ["rpc_notification", subId, eventName].join(".");

      pub(topic, eventData);
    } while (true);
  } catch (e) {
    if (!signal.aborted) {
      throw e;
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
    try {
      await reader.cancel();
    } catch {}
    reader.releaseLock();
  }
}

async function connect(
  transport: RpcTransport,
  setConn: Dispatch<ConnectionState>,
  setConnectedDeviceName: Dispatch<string | undefined>,
  signal: AbortSignal,
  setConnectionError: Dispatch<string | undefined>
): Promise<boolean> {
  let conn;
  try {
    conn = await create_rpc_connection(transport, { signal });
  } catch (e) {
    if (signal.aborted) {
      return false;
    }

    console.error("Failed to create RPC connection", e);
    setConnectionError(
      e instanceof Error && e.message ? e.message : i18n.t("errors.failedToConnect")
    );
    return false;
  }

  let details = await Promise.race([
    call_rpc(conn, { core: { getDeviceInfo: true } })
      .then((r) => r?.core?.getDeviceInfo)
      .catch((e) => {
        console.error("Failed first RPC call", e);
        return undefined;
      }),
    valueAfter(undefined, 1000),
  ]);

  if (signal.aborted) {
    return false;
  }

  if (!details) {
    setConnectionError(i18n.t("errors.failedToConnect"));
    return false;
  }

  listen_for_notifications(conn.notification_readable, signal)
    .then(() => {
      if (signal.aborted) {
        return;
      }

      setConnectedDeviceName(undefined);
      setConn({ conn: null });
    })
    .catch((_e) => {
      if (signal.aborted) {
        return;
      }

      setConnectedDeviceName(undefined);
      setConn({ conn: null });
    });

  setConnectedDeviceName(details.name);
  setConnectionError(undefined);
  setConn({ conn });
  return true;
}

function App() {
  const { t } = useTranslation();
  const [conn, setConn] = useState<ConnectionState>({ conn: null });
  const [connectedDeviceName, setConnectedDeviceName] = useState<
    string | undefined
  >(undefined);
  const [doIt, undo, redo, canUndo, canRedo, reset] = useUndoRedo();
  const [showAbout, setShowAbout] = useState(false);
  const [showLicenseNotice, setShowLicenseNotice] = useState(false);
  const [connectionAbort, setConnectionAbort] = useState(new AbortController());
  const [connectionError, setConnectionError] = useState<string | undefined>();
  const [connectionPhase, setConnectionPhase] = useState<ConnectionPhase>("idle");
  const [keyboardReady, setKeyboardReady] = useState(false);
  const connectionAbortRef = useRef(connectionAbort);

  const [lockState, setLockState] = useState<LockState | undefined>(undefined);

  useEffect(() => {
    connectionAbortRef.current = connectionAbort;
  }, [connectionAbort]);

  useSub("rpc_notification.core.lockStateChanged", (ls) => {
    setLockState(ls);
  });

  useEffect(() => {
    let ignore = false;

    if (!conn.conn) {
      reset();
      setLockState(undefined);
      return;
    }

    async function updateLockState() {
      if (!conn.conn) {
        return;
      }

      setLockState(undefined);

      const locked_resp = await call_rpc(conn.conn, {
        core: { getLockState: true },
      });

      if (ignore) {
        return;
      }

      setLockState(
        locked_resp.core?.getLockState ??
          LockState.ZMK_STUDIO_CORE_LOCK_STATE_LOCKED
      );
    }

    updateLockState();
    return () => {
      ignore = true;
    };
  }, [conn]);

  useEffect(() => {
    if (!conn.conn) {
      setKeyboardReady(false);
      if (connectionPhase !== "idle") {
        setConnectionPhase("idle");
      }
      return;
    }

    if (
      connectionPhase === "connected" &&
      lockState === LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED &&
      !keyboardReady
    ) {
      setConnectionPhase("initializing");
      return;
    }

    if (
      connectionPhase === "initializing" &&
      lockState !== LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED
    ) {
      setConnectionPhase("connected");
      return;
    }

    if (connectionPhase === "initializing" && keyboardReady) {
      setConnectionPhase("idle");
    }
  }, [conn.conn, connectionPhase, keyboardReady, lockState]);

  const save = useCallback(() => {
    async function doSave() {
      if (!conn.conn) {
        return;
      }

      let resp = await call_rpc(conn.conn, { keymap: { saveChanges: true } });
      if (!resp.keymap?.saveChanges || resp.keymap?.saveChanges.err) {
        console.error(t("errors.failedToSave"), resp.keymap?.saveChanges);
      }
    }

    doSave();
  }, [conn]);

  const discard = useCallback(() => {
    async function doDiscard() {
      if (!conn.conn) {
        return;
      }

      let resp = await call_rpc(conn.conn, {
        keymap: { discardChanges: true },
      });
      if (!resp.keymap?.discardChanges) {
        console.error(t("errors.failedToDiscard"), resp);
      }

      reset();
      setConn({ conn: conn.conn });
    }

    doDiscard();
  }, [conn]);

  const resetSettings = useCallback(() => {
    async function doReset() {
      if (!conn.conn) {
        return;
      }

      let resp = await call_rpc(conn.conn, {
        core: { resetSettings: true },
      });
      if (!resp.core?.resetSettings) {
        console.error(t("errors.failedToReset"), resp);
      }

      reset();
      setConn({ conn: conn.conn });
    }

    doReset();
  }, [conn]);

  const disconnect = useCallback(() => {
    async function doDisconnect() {
      const currentConn = conn.conn;
      if (!currentConn) {
        return;
      }

      connectionAbortRef.current.abort("User disconnected");
      const nextAbort = new AbortController();
      connectionAbortRef.current = nextAbort;
      setConnectionAbort(nextAbort);
      setConn({ conn: null });
      setConnectedDeviceName(undefined);
      setKeyboardReady(false);
      setLockState(undefined);
      setConnectionPhase("idle");

      try {
        await currentConn.request_writable.close();
      } catch (e) {
        console.error("Failed to close RPC writable stream", e);
      }
    }

    doDisconnect();
  }, [conn]);

  const onConnect = useCallback(
    (t: RpcTransport) => {
      const ac = new AbortController();
      connectionAbortRef.current = ac;
      setConnectionAbort(ac);
      setConnectionError(undefined);
      setKeyboardReady(false);
      setLockState(undefined);
      setConnectionPhase("connecting");
      connect(t, setConn, setConnectedDeviceName, ac.signal, setConnectionError)
        .then((connected) => {
          if (ac.signal.aborted) {
            return;
          }

          setConnectionPhase(connected ? "connected" : "idle");
        })
        .catch((e) => {
          if (ac.signal.aborted) {
            return;
          }

          console.error(e);
          setConnectionPhase("idle");
          setConnectionError(
            e instanceof Error && e.message ? e.message : i18n.t("errors.failedToConnect")
          );
        });
    },
    [setConn, setConnectedDeviceName, setConnectionError]
  );

  const cancelConnection = useCallback(() => {
    connectionAbortRef.current.abort("User cancelled connection");
    const nextAbort = new AbortController();
    connectionAbortRef.current = nextAbort;
    setConnectionAbort(nextAbort);
    setConn({ conn: null });
    setConnectedDeviceName(undefined);
    setKeyboardReady(false);
    setLockState(undefined);
    setConnectionPhase("idle");
  }, []);

  const connectModalOpen =
    !conn.conn ||
    connectionPhase !== "idle" ||
    lockState !== LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED;

  return (
    <I18nextProvider i18n={i18n}>
      <ConnectionContext.Provider value={conn}>
        <LockStateContext.Provider value={lockState}>
          <UndoRedoContext.Provider value={doIt}>
            <ConnectModal
              open={connectModalOpen}
              transports={TRANSPORTS}
              onTransportCreated={onConnect}
              connectionError={connectionError}
              onConnectionError={setConnectionError}
              connectionPhase={connectionPhase}
              lockState={lockState}
              onCancelConnection={cancelConnection}
              footer={
                <AppFooter
                  variant="modal"
                  onShowAbout={() => setShowAbout(true)}
                  onShowLicenseNotice={() => setShowLicenseNotice(true)}
                />
              }
            />
            <AboutModal open={showAbout} onClose={() => setShowAbout(false)} />
            <LicenseNoticeModal
              open={showLicenseNotice}
              onClose={() => setShowLicenseNotice(false)}
            />
            <div className="relative bg-base-100 text-base-content h-full max-h-[100vh] w-full max-w-[100vw] inline-grid grid-cols-[auto] grid-rows-[auto_1fr] overflow-hidden">
              <AppHeader
                connectedDeviceLabel={connectedDeviceName}
                canUndo={canUndo}
                canRedo={canRedo}
                onUndo={undo}
                onRedo={redo}
                onSave={save}
                onDiscard={discard}
                onDisconnect={disconnect}
                onResetSettings={resetSettings}
              />
              <Keyboard onReady={setKeyboardReady} />
              {conn.conn && (
                <AppFooter
                  variant="floating"
                  onShowAbout={() => setShowAbout(true)}
                  onShowLicenseNotice={() => setShowLicenseNotice(true)}
                />
              )}
            </div>
          </UndoRedoContext.Provider>
        </LockStateContext.Provider>
      </ConnectionContext.Provider>
    </I18nextProvider>
  );
}

export default App;
