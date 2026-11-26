import { useContext, useState } from "react";

import { ActionButton, ConfirmAction, InlineError, Notice, SettingsBlock } from "../carbon/CarbonChrome";
import type { CarbonTheme } from "../carbon/theme";
import { errorText } from "../misc/errors";
import type { Translate } from "../misc/format";
import { ConnectionContext } from "../rpc/ConnectionContext";
import { clearKeyboardPairing, runOneClickPair } from "./useConnectionState";
import type { DongleController } from "./useDongle";

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
  const [message, setMessage] = useState<{ text: string; error?: boolean }>();
  const open = dongle.phase === "open";
  const paired = dongle.status?.pairState === "PAIRED";

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
      if (result.status?.studioPort === "SECOND_CDC") {
        setMessage({ text: t("carbon.conn.receiverSeparatePort", "This receiver has a separate Studio USB port. Select that port to edit the keyboard over 2.4G.") });
      } else {
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
          <ActionButton th={th} label={t("carbon.conn.dongleConnect", "Connect dongle")} primary
            disabled={!dongle.supported || dongle.phase === "connecting"}
            onClick={() => { setMessage(undefined); void dongle.connect(); }} />
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
      {(message || dongle.error) && (
        <div className="mt-3">
          {message && !message.error
            ? <Notice th={th} tone="ok">{message.text}</Notice>
            : <InlineError th={th} t={t} message={message?.text || dongle.error!} />}
        </div>
      )}
    </SettingsBlock>
  );
}
