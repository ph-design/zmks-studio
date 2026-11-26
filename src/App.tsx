import i18n from "./i18n";
import { I18nextProvider, useTranslation } from "react-i18next";

import { create_rpc_connection, type RpcConnection } from "@zmkfirmware/zmk-studio-ts-client";
import { call_rpc } from "./rpc/logging";

import type { Notification } from "@zmkfirmware/zmk-studio-ts-client/studio";
import { ConnectionState, ConnectionContext } from "./rpc/ConnectionContext";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ConnectModal,
  type ConnectionPhase,
  type TransportFactory,
} from "./ConnectModal";

import type { RpcTransport } from "@zmkfirmware/zmk-studio-ts-client/transport/index";
import { connect as gatt_connect } from "@zmkfirmware/zmk-studio-ts-client/transport/gatt";
import { connectUsb, isUsbTransport, type UsbTransport } from "./connection/usbTransport";
import { isDonglePortInfo, useDongle } from "./connection/useDongle";
import { openReceiverRpc } from "./connection/receiverRpc";
import { ReceiverSetup } from "./connection/ReceiverSetup";
import {
  connect as tauri_ble_connect,
  list_devices as ble_list_devices,
} from "./tauri/ble";
import {
  connect as tauri_serial_connect,
  list_devices as serial_list_devices,
} from "./tauri/serial";
import { UndoRedoContext, useUndoRedo } from "./undoRedo";
import { usePub, useSub } from "./usePubSub";
import { LockState } from "@zmkfirmware/zmk-studio-ts-client/core";
import { LockStateContext } from "./rpc/LockStateContext";
import { valueAfter } from "./misc/async";
import { AboutModal } from "./AboutModal";
import { LicenseNoticeModal } from "./misc/LicenseNoticeModal";
import { CarbonShell } from "./carbon/CarbonShell";
import { saveMotionState } from "./motion/useMotion";
import { useCarbonTheme } from "./carbon/theme";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: object;
  }
}

const TRANSPORTS: TransportFactory[] = [
  navigator.serial && { label: "USB", connect: connectUsb },
  ...(navigator.bluetooth && navigator.userAgent.indexOf("Linux") >= 0
    ? [{ label: "BLE", isWireless: true, connect: gatt_connect }]
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

const USB_TRANSPORTS = TRANSPORTS.filter((transport) => transport.label === "USB");

async function listen_for_notifications(
  notification_stream: ReadableStream<Notification>,
  signal: AbortSignal
): Promise<void> {
  let reader = notification_stream.getReader();
  const pub = usePub();
  const onAbort = () => {
    reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    do {
      if (signal.aborted) {
        break;
      }

      let { done, value } = await reader.read();
      if (done) {
        break;
      }

      if (!value) {
        continue;
      }

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

async function getKeyboardInfo(conn: RpcConnection, timeout: number) {
  return Promise.race([
    call_rpc(conn, { core: { getDeviceInfo: true } }).then((response) => response?.core?.getDeviceInfo),
    valueAfter(undefined, timeout),
  ]);
}

type ReceiverStage = "waiting" | "connecting" | "retry";


function App() {
  const { t } = useTranslation();
  const carbon = useCarbonTheme();
  const dongle = useDongle(t);
  const dongleRef = useRef(dongle);
  dongleRef.current = dongle;
  const [receiverSetup, setReceiverSetup] = useState(false);
  const [receiverStage, setReceiverStage] = useState<ReceiverStage>();
  const receiverPort = useRef<UsbTransport>();
  const [choosingKeyboard, setChoosingKeyboard] = useState(false);
  const [conn, setConn] = useState<ConnectionState>({ conn: null });
  const [connectedDeviceName, setConnectedDeviceName] = useState<
    string | undefined
  >(undefined);
  const [doIt, undo, redo, canUndo, canRedo, reset] = useUndoRedo();
  const [showAbout, setShowAbout] = useState(false);
  const [showLicenseNotice, setShowLicenseNotice] = useState(false);
  const [connectionError, setConnectionError] = useState<string | undefined>();
  const [connectionPhase, setConnectionPhase] = useState<ConnectionPhase>("idle");
  const [keyboardReady, setKeyboardReady] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const connectionAbortRef = useRef(new AbortController());

  const [lockState, updateLockState] = useState<LockState | undefined>(undefined);
  const [lockCheckFailed, setLockCheckFailed] = useState(false);
  const lockStateVersion = useRef(0);
  const activeLockCheck = useRef<AbortController>();
  const setLockState = useCallback((state: LockState | undefined) => {
    lockStateVersion.current++;
    updateLockState(state);
  }, []);
  const [hasUnsavedLightingChanges, setHasUnsavedLightingChanges] = useState(false);
  const [hasUnsavedMotionChanges, setHasUnsavedMotionChanges] = useState(false);
  /*
   * Combo writes are a `combos` call, but the header's unsaved indicator reads
   * `keymap.checkUnsavedChanges`. Rather than assume firmware flags one
   * subsystem's write on another's counter, track it here — `keymap.saveChanges`
   * (always issued by `save`) is what persists combos, so this only has to make
   * the Save button appear. It not appearing is how an unlock combo was lost.
   */
  const [hasUnsavedComboChanges, setHasUnsavedComboChanges] = useState(false);
  const [connectionType, setConnectionType] = useState<string | undefined>();

  useSub("rpc_notification.core.lockStateChanged", (ls) => {
    setLockCheckFailed(false);
    setLockState(ls);
  });

  const checkLockState = useCallback(async () => {
    const rpc = conn.conn;
    const session = connectionAbortRef.current;
    if (!rpc || session.signal.aborted || activeLockCheck.current === session) return;

    activeLockCheck.current = session;
    const version = lockStateVersion.current;
    const isCurrent = () => connectionAbortRef.current === session &&
      !session.signal.aborted && lockStateVersion.current === version;

    // One read in flight; if it never answers, still tell the user rather than
    // leave the modal on a fake spinner.
    const timer = window.setTimeout(() => {
      if (isCurrent()) setLockCheckFailed(true);
    }, 5000);
    try {
      const response = await call_rpc(rpc, { core: { getLockState: true } });
      if (!isCurrent()) return;

      const state = response?.core?.getLockState;
      if (state === LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED ||
          state === LockState.ZMK_STUDIO_CORE_LOCK_STATE_LOCKED) {
        setLockCheckFailed(false);
        setLockState(state);
      } else {
        setLockCheckFailed(true);
      }
    } catch {
      if (isCurrent()) setLockCheckFailed(true);
    } finally {
      window.clearTimeout(timer);
      if (activeLockCheck.current === session) {
        activeLockCheck.current = undefined;
      }
    }
  }, [conn.conn, setLockState]);

  useEffect(() => {
    if (!conn.conn) {
      reset();
      setLockState(undefined);
      setLockCheckFailed(false);
      setHasUnsavedLightingChanges(false);
      return;
    }
    void checkLockState();
  }, [conn, checkLockState, setLockState]);

  useEffect(() => {
    if (!conn.conn) {
      setKeyboardReady(false);
      return;
    }

    if (receiverSetup) {
      if (lockState === LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED) {
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
  }, [conn.conn, connectionPhase, keyboardReady, lockState, receiverSetup]);

  const markLightingChanged = useCallback(() => {
    setHasUnsavedLightingChanges(true);
  }, []);

  const markMotionChanged = useCallback(() => {
    setHasUnsavedMotionChanges(true);
  }, []);

  const markCombosChanged = useCallback(() => {
    setHasUnsavedComboChanges(true);
  }, []);

  const save = useCallback(async (saveOtherChanges: boolean, saveRgbGeneral: boolean): Promise<boolean> => {
    if (!conn.conn) {
      return false;
    }

    let saved = true;
    if (saveOtherChanges) {
      const resp = await call_rpc(conn.conn, { keymap: { saveChanges: true } });
      if (!resp.keymap?.saveChanges || resp.keymap.saveChanges.err) {
        saved = false;
        console.error(t("errors.failedToSave"), resp.keymap?.saveChanges);
      }
    }

    if (hasUnsavedLightingChanges || saveRgbGeneral) {
      const response = await call_rpc(conn.conn, { lighting: { saveState: true } });
      if (!response.lighting?.saveState) {
        saved = false;
        console.error(t("errors.failedToSave"), response);
      }
    }
    if (hasUnsavedLightingChanges) {
      const response = await call_rpc(conn.conn, { lighting: { saveLayerLedState: true } });
      if (!response.lighting?.saveLayerLedState) {
        saved = false;
        console.error(t("errors.failedToSave"), response);
      }
    }

    if (hasUnsavedMotionChanges) {
      const motionSaved = await saveMotionState(conn.conn);
      if (!motionSaved) {
        saved = false;
        console.error(t("errors.failedToSave"), "motion");
      }
    }

    if (saved) {
      setHasUnsavedLightingChanges(false);
      setHasUnsavedMotionChanges(false);
      setHasUnsavedComboChanges(false);
    }
    return saved;
  }, [conn, hasUnsavedLightingChanges, hasUnsavedMotionChanges, t]);

  const discard = useCallback(async (): Promise<boolean> => {
    if (!conn.conn) return false;

    const resp = await call_rpc(conn.conn, { keymap: { discardChanges: true } });
    if (!resp.keymap?.discardChanges) {
      console.error(t("errors.failedToDiscard"), resp);
      return false;
    }

    reset();
    setConn({ conn: conn.conn });
    return true;
  }, [conn, reset, t]);

  /*
   * Returns a promise so the caller can show a busy state — a factory reset takes
   * long enough on hardware that without one the button looks unresponsive and
   * gets clicked again.
   */
  const resetSettings = useCallback(async (): Promise<boolean> => {
    if (!conn.conn) {
      return false;
    }

    const resp = await call_rpc(conn.conn, {
      core: { resetSettings: true },
    });
    if (!resp.core?.resetSettings) {
      console.error(t("errors.failedToReset"), resp);
      return false;
    }

    reset();
    // Everything the keyboard held is gone, so no subsystem has pending edits.
    setHasUnsavedLightingChanges(false);
    setHasUnsavedMotionChanges(false);
    setHasUnsavedComboChanges(false);
    setConn({ conn: conn.conn });
    return true;
  }, [conn]);

  const resetConnection = useCallback(() => {
    connectionAbortRef.current.abort();
    setConn({ conn: null });
    setConnectedDeviceName(undefined);
    setKeyboardReady(false);
    setLockState(undefined);
    setLockCheckFailed(false);
    setHasUnsavedLightingChanges(false);
    setHasUnsavedMotionChanges(false);
    setHasUnsavedComboChanges(false);
    setConnectionType(undefined);
    setConnectionPhase("idle");
    setChoosingKeyboard(false);
  }, [setLockState]);

  const disconnect = useCallback(() => {
    const receiver = receiverPort.current;
    receiverPort.current = undefined;
    receiver?.abortController.abort();
    resetConnection();
    setReceiverStage(undefined);
    void dongleRef.current.disconnect();
  }, [resetConnection]);

  // Give up if initialization stalls past 60s instead of spinning forever.
  useEffect(() => {
    if (connectionPhase !== "initializing" || keyboardReady) {
      return;
    }

    const timer = setTimeout(() => {
      setConnectionError(i18n.t("errors.loadTimeout"));
      disconnect();
    }, 60000);

    return () => clearTimeout(timer);
  }, [connectionPhase, keyboardReady, disconnect]);

  const onKeyboardDropped = useCallback(() => {
    resetConnection();
    const receiver = receiverPort.current;
    if (receiver && !receiver.abortController.signal.aborted) {
      setReceiverStage("connecting");
      return;
    }

    receiverPort.current = undefined;
    setReceiverStage(undefined);
    setConnectionError(i18n.t(receiver ? "carbon.conn.receiverUnplugged" : "errors.connectionLost"));
  }, [resetConnection]);

  const showKeyboard = useCallback((
    rpc: RpcConnection, name: string, attempt: AbortSignal, owner: AbortSignal, closeSession?: () => Promise<void>
  ) => {
    setConnectedDeviceName(name || i18n.t("welcome.unknownDevice"));
    setConnectionError(undefined);
    setConn({ conn: rpc });
    setConnectionPhase("connected");
    setChoosingKeyboard(false);

    const dropped = async () => {
      await closeSession?.();
      if (!owner.aborted) onKeyboardDropped();
    };
    void listen_for_notifications(rpc.notification_readable, attempt).then(dropped, dropped);
  }, [onKeyboardDropped]);

  useEffect(() => {
    const receiver = receiverPort.current;
    if (receiverStage !== "connecting" || !receiver) return;

    const owner = new AbortController();
    connectionAbortRef.current.abort();
    connectionAbortRef.current = owner;
    setConnectionError(undefined);
    setConnectionType("2.4G");

    void (async () => {
      for (let tries = 0; tries < 3; tries++) {
        if (owner.signal.aborted || receiver.abortController.signal.aborted) break;
        const radio = openReceiverRpc(receiver, owner.signal);
        const details = await getKeyboardInfo(radio.conn, 2500);
        if (details && !radio.signal.aborted && !owner.signal.aborted) {
          setReceiverStage(undefined);
          showKeyboard(radio.conn, details.name, radio.signal, owner.signal, radio.close);
          return;
        }
        await radio.close();
      }

      if (owner.signal.aborted) return;
      if (receiver.abortController.signal.aborted) onKeyboardDropped();
      else setReceiverStage("retry");
    })().catch(() => {
      if (!owner.signal.aborted) setReceiverStage("retry");
    });
  }, [receiverStage, onKeyboardDropped, showKeyboard]);

  const onConnect = useCallback(
    async (transport: RpcTransport, meta?: { isWireless?: boolean }) => {
      const receiver = isUsbTransport(transport) && isDonglePortInfo(transport.usb);
      if (receiverSetup && (receiver || !isUsbTransport(transport))) {
        transport.abortController.abort();
        setConnectionError(i18n.t("carbon.conn.receiverChooseKeyboard"));
        return;
      }

      resetConnection();
      const owner = new AbortController();
      const closeTransport = () => transport.abortController.abort();
      owner.signal.addEventListener("abort", closeTransport, { once: true });
      connectionAbortRef.current = owner;
      setConnectionType(receiver ? "2.4G" : meta?.isWireless ? "BLE" : "USB");
      setConnectionError(undefined);
      setConnectionPhase("connecting");
      if (receiverSetup) setChoosingKeyboard(true);

      try {
        if (receiver) {
          const radio = openReceiverRpc(transport, owner.signal);
          const details = await getKeyboardInfo(radio.conn, 2500);
          if (owner.signal.aborted) return;

          if (details && !radio.signal.aborted) {
            owner.signal.removeEventListener("abort", closeTransport);
            receiverPort.current = transport;
            showKeyboard(radio.conn, details.name, radio.signal, owner.signal, radio.close);
            return;
          }

          await radio.close();
          if (owner.signal.aborted) return;
          const dongle = dongleRef.current;
          const status = await dongle.prepare(transport);
          if (owner.signal.aborted) return;

          if (status) {
            owner.signal.removeEventListener("abort", closeTransport);
            setConnectionPhase("idle");
            if (status.pairState === "PAIRED" && status.studioPort !== "SECOND_CDC") {
              receiverPort.current = dongle.release() ?? undefined;
              setReceiverStage("connecting");
            } else {
              setReceiverSetup(true);
            }
            return;
          }
        } else {
          const rpc = create_rpc_connection(transport, { signal: owner.signal });
          const details = await getKeyboardInfo(rpc, 1000);
          if (owner.signal.aborted) return;
          if (details) {
            showKeyboard(rpc, details.name, owner.signal, owner.signal);
            return;
          }
        }

        setConnectionError(i18n.t("errors.failedToConnect"));
      } catch (error) {
        if (owner.signal.aborted) return;
        setConnectionError(error instanceof Error ? error.message : i18n.t("errors.failedToConnect"));
      }
      owner.abort();
      setConnectionPhase("idle");
    },
    [receiverSetup, resetConnection, showKeyboard]
  );

  const cancelConnection = () => {
    if (receiverStage === "waiting") {
      const receiver = receiverPort.current;
      receiverPort.current = undefined;
      receiver?.abortController.abort();
      setReceiverStage(undefined);
      setConnectionPhase("connected");
    } else if (receiverStage) {
      disconnect();
    } else {
      resetConnection();
    }
    setConnectionError(undefined);
  };

  const onReceiverPaired = () => {
    const receiver = dongleRef.current.release();
    if (!receiver) return;
    receiverPort.current = receiver;
    setReceiverSetup(false);
    setReceiverStage(conn.conn ? "waiting" : "connecting");
  };

  const closeReceiverSetup = () => {
    disconnect();
    setReceiverSetup(false);
    setConnectionError(undefined);
  };

  const connectModalOpen = !!receiverStage || (receiverSetup
    ? choosingKeyboard || (!!conn.conn && lockState !== LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED)
    : !conn.conn || connectionPhase !== "idle" ||
      lockState !== LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED);

  return (
    <I18nextProvider i18n={i18n}>
      <ConnectionContext.Provider value={conn}>
        <LockStateContext.Provider value={lockState}>
          <UndoRedoContext.Provider value={doIt}>
            <ConnectModal
              open={connectModalOpen}
              transports={receiverSetup ? USB_TRANSPORTS : TRANSPORTS}
              keyboardOnly={receiverSetup}
              receiverStage={receiverStage}
              onRetryReceiver={() => setReceiverStage("connecting")}
              onTransportCreated={onConnect}
              connectionError={connectionError}
              onConnectionError={setConnectionError}
              connectionPhase={connectionPhase}
              loadProgress={loadProgress}
              lockState={lockState}
              lockCheckFailed={lockCheckFailed}
              onCancelConnection={cancelConnection}
            />
            <AboutModal open={showAbout} onClose={() => setShowAbout(false)} />
            <LicenseNoticeModal
              open={showLicenseNotice}
              onClose={() => setShowLicenseNotice(false)}
            />
            {receiverSetup ? (
              <ReceiverSetup
                th={carbon.theme}
                t={t}
                dongle={dongle}
                onDisconnect={closeReceiverSetup}
                onConnectKeyboard={() => setChoosingKeyboard(true)}
                onPaired={onReceiverPaired}
                keyboardName={connectedDeviceName}
              />
            ) : conn.conn ? (
              <CarbonShell
                carbon={carbon}
                connectedDeviceName={connectedDeviceName}
                connectionType={connectionType}
                dongle={dongle}
                onReceiverPaired={onReceiverPaired}
                onDisconnect={disconnect}
                onSwitchDevice={disconnect}
                onResetSettings={resetSettings}
                onSave={save}
                onDiscard={discard}
                canUndo={canUndo}
                canRedo={canRedo}
                onUndo={undo}
                onRedo={redo}
                extraSaveEnabled={hasUnsavedLightingChanges || hasUnsavedMotionChanges || hasUnsavedComboChanges}
                onReady={setKeyboardReady}
                onProgress={setLoadProgress}
                onLightingChanged={markLightingChanged}
                onMotionChanged={markMotionChanged}
                onCombosChanged={markCombosChanged}
                onShowAbout={() => setShowAbout(true)}
                onShowLicense={() => setShowLicenseNotice(true)}
              />
            ) : (
              // Carbon-toned backdrop behind the connect modal
              <div style={{ height: "100vh", width: "100vw", background: carbon.theme.bg }} />
            )}
          </UndoRedoContext.Provider>
        </LockStateContext.Provider>
      </ConnectionContext.Provider>
    </I18nextProvider>
  );
}

export default App;
