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
  type ConnectionProgress,
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
  setConnectionError: Dispatch<string | undefined>,
  setConnectionProgress: Dispatch<ConnectionProgress | undefined>
): Promise<boolean> {
  let conn;
  try {
    setConnectionProgress({ labelKey: "welcome.connectProgressTransport", percent: 15 });
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

  setConnectionProgress({ labelKey: "welcome.connectProgressRpcSession", percent: 25 });

  setConnectionProgress({ labelKey: "welcome.connectProgressDeviceInfo", percent: 35 });
  let details = await Promise.race([
    call_rpc(conn, { core: { getDeviceInfo: true } })
      .then((r) => r?.core?.getDeviceInfo)
      .catch((e) => {
        console.error("Failed first RPC call", e);
        return undefined;
      }),
    valueAfter(undefined, 1000),
  ]);

  if (!details) {
    setConnectionError(i18n.t("errors.failedToConnect"));
    return false;
  }

  setConnectionProgress({ labelKey: "welcome.connectProgressResponse", percent: 45 });

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

  setConnectionProgress({ labelKey: "welcome.connectProgressNotifications", percent: 55 });
  setConnectedDeviceName(details.name);
  setConnectionError(undefined);
  setConn({ conn });
  setConnectionProgress({ labelKey: "welcome.connectProgressConnected", percent: 60 });
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
  const [connectionProgress, setConnectionProgress] = useState<ConnectionProgress | undefined>();
  const [keyboardReady, setKeyboardReady] = useState(false);
  const connectionPhaseRef = useRef(connectionPhase);

  const [lockState, setLockState] = useState<LockState | undefined>(undefined);

  useEffect(() => {
    connectionPhaseRef.current = connectionPhase;
  }, [connectionPhase]);

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
      setConnectionProgress((progress) => {
        if (progress) {
          return { labelKey: "welcome.connectProgressLockState", percent: Math.max(progress?.percent ?? 0, 58) };
        }

        return progress;
      });

      const locked_resp = await call_rpc(conn.conn, {
        core: { getLockState: true },
      });

      if (ignore) {
        return;
      }

      setLockState(
        locked_resp.core?.getLockState ||
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
      if (connectionPhase === "connected") {
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
      setConnectionProgress({ labelKey: "welcome.connectProgressInitStart", percent: 62 });
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
      setConnectionPhase("connected");
      setConnectionProgress({ labelKey: "welcome.connectProgressReady", percent: 100 });
      return;
    }

    if (
      connectionPhase === "connected" &&
      lockState === LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED &&
      keyboardReady
    ) {
      const closeTimer = window.setTimeout(() => {
        setConnectionPhase("idle");
        setConnectionProgress(undefined);
      }, 1200);

      return () => window.clearTimeout(closeTimer);
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
      if (!conn.conn) {
        return;
      }

      await conn.conn.request_writable.close();
      connectionAbort.abort("User disconnected");
      setConnectionAbort(new AbortController());
      setConnectionPhase("idle");
      setConnectionProgress(undefined);
    }

    doDisconnect();
  }, [conn]);

  const onConnect = useCallback(
    (t: RpcTransport) => {
      const ac = new AbortController();
      setConnectionAbort(ac);
      setConnectionError(undefined);
      setKeyboardReady(false);
      setLockState(undefined);
      setConnectionPhase("connecting");
      setConnectionProgress({ labelKey: "welcome.connectProgressTransport", percent: 10 });
      connect(t, setConn, setConnectedDeviceName, ac.signal, setConnectionError, setConnectionProgress)
        .then((connected) => {
          setConnectionPhase(connected ? "connected" : "idle");
          if (!connected) {
            setConnectionProgress(undefined);
          }
        })
        .catch((e) => {
          console.error(e);
          setConnectionPhase("idle");
          setConnectionProgress(undefined);
          setConnectionError(
            e instanceof Error && e.message ? e.message : i18n.t("errors.failedToConnect")
          );
        });
    },
    [setConn, setConnectedDeviceName, setConnectionError]
  );

  const onKeyboardStartupProgress = useCallback(
    (progress: ConnectionProgress) => {
      if (
        connectionPhaseRef.current === "initializing" ||
        connectionPhaseRef.current === "connected"
      ) {
        setConnectionProgress(progress);
      }
    },
    []
  );

  const cancelConnection = useCallback(() => {
    connectionAbort.abort("User cancelled connection");
    setConnectionAbort(new AbortController());
    setKeyboardReady(false);
    setConnectionPhase("idle");
    setConnectionProgress(undefined);
  }, [connectionAbort]);

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
              connectionProgress={connectionProgress}
              connectedDeviceName={connectedDeviceName}
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
              <Keyboard
                onStartupProgress={onKeyboardStartupProgress}
                onReady={setKeyboardReady}
              />
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
