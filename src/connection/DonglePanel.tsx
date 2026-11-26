import { useContext, useState } from "react";

import { ActionButton, ConfirmAction, InlineError, Notice, SettingsBlock } from "../carbon/CarbonChrome";
import type { CarbonTheme } from "../carbon/theme";
import { DeviceList, type TransportFactory } from "../ConnectModal";
import { GenericModal } from "../GenericModal";
import { errorText } from "../misc/errors";
import type { Translate } from "../misc/format";
import { useModalRef } from "../misc/useModalRef";
import { ConnectionContext } from "../rpc/ConnectionContext";
import { connect as connectNative, list_devices } from "../tauri/serial";
import { clearKeyboardPairing, runOneClickPair } from "./useConnectionState";
import { isUsbTransport } from "./usbTransport";
import { isDonglePortInfo, type DongleController } from "./useDongle";

const RECEIVER_TRANSPORTS: TransportFactory[] = [{
  label: "USB",
  pick_and_connect: {
    list: async () => (await list_devices()).filter(isDonglePortInfo),
    connect: connectNative,
  },
}];

interface DonglePanelProps {
  th: CarbonTheme;
  t: Translate;
  dongle: DongleController;
  canPair: boolean;
  onPaired: () => void;
}

export function DonglePanel({ th, t, dongle, canPair, onPaired }: DonglePanelProps) {
  const { conn } = useContext(ConnectionContext);
  const [working, setWorking] = useState(false);
  const [pickingPort, setPickingPort] = useState(false);
  const [pickerError, setPickerError] = useState<string>();
  const picker = useModalRef(pickingPort);
  const [message, setMessage] = useState<{ text: string; error?: boolean }>();
  const open = dongle.phase === "open";
  const paired = dongle.status?.pairState === "PAIRED";
  const connectLabel = t("carbon.conn.dongleConnect", "Connect receiver");

  const connectReceiver = () => {
    setMessage(undefined);
    setPickerError(undefined);
    if (window.__TAURI_INTERNALS__) {
      setPickingPort(true);
    } else {
      void dongle.connect();
    }
  };

  const cancelPicker = () => {
    setPickingPort(false);
    void dongle.disconnect();
  };

  const update = async (clear: boolean) => {
    if (!conn || working) return;
    setWorking(true);
    setMessage(undefined);
    try {
      if (clear) {
        await clearKeyboardPairing(conn);
        const reply = await dongle.clear();
        if (!reply?.ok) throw new Error(t("carbon.conn.dongleClearDongleFailed", "The dongle did not confirm AT+CLEAR"));
        await dongle.refresh();
        setMessage({ text: t("carbon.conn.dongleClearDongleOk", "Dongle pairing cleared") });
        return;
      }

      const result = await runOneClickPair(conn, dongle);
      if (!result.ok) {
        setMessage({ text: t(result.errorKey ?? "carbon.conn.pairErrorVerify", "Pairing could not be verified."), error: true });
        return;
      }
      const switchFailed = result.switched === false;
      if (result.status?.studioPort === "SECOND_CDC") {
        setMessage({ text: t("carbon.conn.receiverSeparatePort", "This receiver has a separate Studio USB port. Select that port to edit the keyboard over 2.4G.") });
      } else if (switchFailed) {
        setMessage({ text: t("carbon.conn.donglePairSwitchFailed", "Paired, but the keyboard did not switch to 2.4G. Switch the output manually."), error: true });
      } else {
        setMessage({ text: t("carbon.conn.donglePairSwitched", "Paired. The keyboard is now on 2.4G.") });
        onPaired();
      }
    } catch (error) {
      setMessage({ text: errorText(t, error), error: true });
    } finally {
      setWorking(false);
    }
  };

  return (
    <SettingsBlock th={th} title={t("carbon.conn.donglePairTitle", "One-click pairing")}
      hint={open ? t("carbon.conn.dongleDesc", "Connect the keyboard by USB and unlock Studio.") : t("carbon.conn.donglePairNeedsPort", "Connect the receiver first.")}>
      <div className="flex flex-wrap items-center gap-2">
        {!open ? (
          <ActionButton th={th} label={connectLabel} primary
            disabled={!dongle.supported || dongle.phase === "connecting" || pickingPort}
            onClick={connectReceiver} />
        ) : (
          <>
            <span className="mr-2 text-sm text-secondary-content">
              {paired ? t("carbon.conn.donglePaired", "Paired") : t("carbon.conn.dongleUnpaired", "Unpaired")}
            </span>
            <ActionButton th={th} label={t("carbon.conn.donglePairBoth", "Pair keyboard")} primary
              disabled={!canPair || working || dongle.busy} onClick={() => void update(false)} />
            {paired && (
              <ConfirmAction th={th} t={t} tone="danger"
                label={t("carbon.conn.dongleClearBoth", "Clear pairing")} confirmLabel={t("carbon.conn.dongleClearBothConfirm", "Click again to clear")}
                disabled={!canPair || working || dongle.busy} onConfirm={() => update(true)} />
            )}
          </>
        )}
      </div>
      {open && !canPair && <p className="mt-3 text-xs text-helper">{t("carbon.conn.receiverPairNeedsKeyboard", "Connect and unlock the keyboard over USB to pair.")}</p>}
      {(message || (!pickingPort && dongle.error)) && (
        <div className="mt-3">
          {message && !message.error
            ? <Notice th={th} tone="ok">{message.text}</Notice>
            : <InlineError th={th} t={t} message={message?.text || dongle.error!} />}
        </div>
      )}
      <GenericModal ref={picker} className="w-[min(92vw,32rem)]"
        onClose={() => { if (pickingPort) cancelPicker(); }}>
        <div className="grid gap-3">
          <DeviceList
            open={pickingPort}
            transports={RECEIVER_TRANSPORTS}
            title={connectLabel}
            hint={t("carbon.conn.receiverPickerHint", "Choose the receiver's Studio port.")}
            emptyMessage={t("carbon.conn.receiverPickerEmpty", "No receiver found. Plug in PH-dongle and refresh.")}
            onConnectionError={setPickerError}
            onTransportCreated={async (transport) => {
              if (isUsbTransport(transport) && await dongle.connect(transport)) setPickingPort(false);
            }}
          />
          {(pickerError || dongle.error) && (
            <InlineError th={th} t={t} message={(pickerError || dongle.error)!} />
          )}
          <div className="flex justify-end">
            <ActionButton th={th} label={t("common.cancel", "Cancel")} onClick={cancelPicker} />
          </div>
        </div>
      </GenericModal>
    </SettingsBlock>
  );
}
