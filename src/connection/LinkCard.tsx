// Current transport, confirmed transport switches, and the BLE slots under it.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Bluetooth, Cable, Radio } from "lucide-react";

import {
  SwitchResult,
  Transport,
  type State,
} from "@zmkfirmware/zmk-studio-ts-client/connection";

import type { CarbonTheme } from "../carbon/theme";
import { ConfirmAction, InlineError, Notice, SettingsBlock, Badge, type Tone } from "../carbon/CarbonChrome";
import { useConnectionActions } from "./useConnectionState";
import type { Translate } from "../misc/format";
import { errorText } from "../misc/errors";

interface LinkCardProps {
  th: CarbonTheme;
  t: Translate;
  state: State;
  mode: Transport;
  disabled: boolean;
  onDisconnect: () => void;
}

export function LinkCard({ th, t, state, mode, disabled, onDisconnect }: LinkCardProps) {
  const actions = useConnectionActions();
  const [phase, setPhase] = useState<"idle" | "pending" | "detached">("idle");
  const [note, setNote] = useState<{ tone: Tone; text: string } | null>(null);
  const detachTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => { if (detachTimer.current) clearTimeout(detachTimer.current); }, []);

  const targetIsCurrent = (target: Transport) => state.activeTransport === target;
  const frozen = disabled || state.radioSwitching || phase !== "idle";

  const runSwitch = async (target: Transport) => {
    setNote(null);
    try {
      const response = await actions.selectTransport(target);

      switch (response.result) {
        case SwitchResult.ZMK_CONNECTION_SWITCH_RESULT_OK:
          setNote({ tone: "ok", text: t("carbon.conn.switchOk", "Switched. The keyboard is sending on the new link.") });
          break;
        case SwitchResult.ZMK_CONNECTION_SWITCH_RESULT_PENDING:
          // The RPC link will drop after a pending radio switch.
          setPhase("pending");
          detachTimer.current = setTimeout(() => {
            setPhase("detached");
            onDisconnect();
          }, 600);
          break;
        case SwitchResult.ZMK_CONNECTION_SWITCH_RESULT_USB_REQUIRED:
          setNote({
            tone: "err",
            text: t(
              "carbon.conn.resultUsbRequired",
              "The firmware refuses to leave USB while a USB cable is attached. Unplug the cable first, then switch."
            ),
          });
          break;
        case SwitchResult.ZMK_CONNECTION_SWITCH_RESULT_BUSY:
          setNote({
            tone: "err",
            text: t("carbon.conn.resultBusy", "A radio switch is already running. Try again in a moment."),
          });
          break;
        case SwitchResult.ZMK_CONNECTION_SWITCH_RESULT_UNSUPPORTED:
          setNote({
            tone: "err",
            text: t(
              "carbon.conn.resultUnsupported",
              "This firmware does not have that link compiled in (the matching Kconfig option is off)."
            ),
          });
          break;
        case SwitchResult.ZMK_CONNECTION_SWITCH_RESULT_INVALID:
          setNote({
            tone: "err",
            text: t("carbon.conn.resultInvalid", "The firmware rejected that target link for this board."),
          });
          break;
        default:
          setNote({
            tone: "err",
            text: t("carbon.conn.resultUnknown", "Switch failed — the firmware returned an unrecognised result."),
          });
          break;
      }
    } catch (error) {
      setNote({ tone: "err", text: errorText(t, error) });
    }
  };

  const targets = {
    [Transport.ZMK_CONNECTION_TRANSPORT_USB]: {
      name: t("carbon.conn.linkUsb", "Wired (USB)"), label: t("carbon.conn.switchToUsb", "Switch to USB"),
      icon: <Cable size={16} />, description: t("carbon.conn.wiredPriority", "The keyboard uses USB while its data cable is connected."), enabled: state.supportsUsb,
    },
    [Transport.ZMK_CONNECTION_TRANSPORT_BLE]: {
      name: t("carbon.conn.linkBle", "Bluetooth"), label: t("carbon.conn.switchToBle", "Switch to Bluetooth"),
      icon: <Bluetooth size={16} />, description: t("carbon.conn.bleSwitchHint", "Use Bluetooth for wireless input."), enabled: state.supportsBle,
    },
    [Transport.ZMK_CONNECTION_TRANSPORT_2G4]: {
      name: t("carbon.conn.link2g4", "2.4G"), label: t("carbon.conn.switchTo2g4", "Switch to 2.4G"),
      icon: <Radio size={16} />, description: t("carbon.conn.radioSwitchHint", "Use the USB receiver for wireless input."), enabled: state.supports2g4,
    },
  };

  const target = targets[mode as keyof typeof targets];
  if (!target?.enabled) return null;
  return (
    <SettingsBlock th={th} title={t("carbon.conn.linkTitle", "Current link")} dimmed={disabled}>
      {phase !== "idle" ? (
        <Notice
          th={th}
          tone={phase === "pending" ? "warn" : "info"}
          title={
            phase === "pending"
              ? t("carbon.conn.switchPending", "Switching…")
              : t("carbon.conn.switchDetached", "Disconnected")
          }
        >
          {phase === "pending"
            ? t(
                "carbon.conn.switchPendingBody",
                "The radio is restarting. This Studio connection drops as soon as it does — reconnect when the keyboard is back."
              )
            : t("carbon.conn.switchDetachedBody", "Disconnected. Reconnect to carry on setting the keyboard up.")}
        </Notice>
      ) : (
        <SwitchTarget th={th} t={t} {...target}
          current={targetIsCurrent(mode)} disabled={frozen}
          confirmLabel={t("carbon.conn.switchConfirm", "Confirm switch")} onConfirm={() => runSwitch(mode)} />
      )}

      {note && (
        <div style={{ marginTop: 12 }}>
          {note.tone === "err" ? <InlineError th={th} t={t} message={note.text} /> : <Notice th={th} tone={note.tone}>{note.text}</Notice>}
        </div>
      )}
    </SettingsBlock>
  );
}

function SwitchTarget({
  th, t, icon, name, description, current, disabled, label, confirmLabel, onConfirm,
}: {
  th: CarbonTheme;
  t: Translate;
  icon: ReactNode;
  name: string;
  description: string;
  current: boolean;
  disabled: boolean;
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, border: `1px solid ${th.border}`, background: th.bg }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: current ? th.interactive : th.textPrimary }}>
        {icon}
        <span style={{ fontSize: 13, fontWeight: 600 }}>{name}</span>
        {current && <Badge th={th} tone="info">{t("carbon.conn.current", "Current")}</Badge>}
      </div>
      <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: th.textHelper }}>{description}</p>
      <div style={{ marginTop: "auto" }}>
        <ConfirmAction
          th={th} t={t}
          label={label}
          confirmLabel={confirmLabel}
          icon={icon}
          disabled={disabled || current}
          onConfirm={onConfirm}
        />
      </div>
    </div>
  );
}
