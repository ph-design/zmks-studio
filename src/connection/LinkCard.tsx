// Current transport, confirmed transport switches, and the BLE slots under it.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Bluetooth, Cable, Link2, Radio, Unlink } from "lucide-react";

import {
  SwitchResult,
  Transport,
  type BleProfile,
  type State,
} from "@zmkfirmware/zmk-studio-ts-client/connection";

import type { CarbonTheme } from "../carbon/theme";
import { ConfirmAction, Facts, InlineError, Notice, SettingsBlock, Badge, type Tone } from "../carbon/CarbonChrome";
import { useConnectionActions } from "./useConnectionState";
import {
  channelToMhz, DASH, format2g4Address, formatBleAddress, toHex, transportName, type Translate,
} from "../misc/format";
import { errorText } from "../misc/errors";

interface LinkCardProps {
  th: CarbonTheme;
  t: Translate;
  state: State;
  disabled: boolean;
  /** Whether the *Studio* link itself is BLE — decides who gets disconnected. */
  studioIsBle: boolean;
  onDisconnect: () => void;
}

export function LinkCard({ th, t, state, disabled, studioIsBle, onDisconnect }: LinkCardProps) {
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

  const usbCopy = !state.usbAttached
    ? t(
        "carbon.conn.usbNoCable",
        "No USB data cable detected. The keyboard only really runs on the wire once the cable is in — in ZMK, a plugged USB link wins unless wireless was picked by hand."
      )
    : studioIsBle
      ? t(
          "carbon.conn.usbDropsStudio",
          "Studio is on Bluetooth right now, so switching to USB shuts the radio link down and this connection drops. Reconnect over USB afterwards."
        )
      : t("carbon.conn.usbKeepsStudio", "Studio is already on USB — switching back to wired does not disturb it.");

  const bleCopy = studioIsBle
    ? t(
        "carbon.conn.bleDropsStudio",
        "Studio is on Bluetooth right now. Selecting another slot or cancelling a pairing restarts the BLE link and this connection drops."
      )
    : t(
        "carbon.conn.bleKeepsStudio",
        "Studio is on USB, so switching to Bluetooth does not disconnect it. The host still has to be paired with the keyboard to receive keystrokes."
      );

  const rfCopy = t(
    "carbon.conn.rf2g4Warning",
    "Bluetooth and 2.4G share one radio, so switching restarts the radio stack (roughly 50 ms–1 s). The 2.4G link does not carry Studio RPC at all — switching to it always disconnects Studio; reconnect the cable afterwards."
  );

  const noBleBonds = state.bleProfiles.length > 0
    ? state.bleProfiles.every((profile) => profile.open)
    : state.bleProfileCount === 0;

  return (
    <SettingsBlock th={th} title={t("carbon.conn.linkTitle", "Current link")} dimmed={disabled}>
      <div style={{ border: `1px solid ${th.border}`, background: th.layer1, padding: 16, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ color: th.interactive, display: "flex" }}>
            {state.activeTransport === Transport.ZMK_CONNECTION_TRANSPORT_USB ? (
              <Cable size={22} />
            ) : state.activeTransport === Transport.ZMK_CONNECTION_TRANSPORT_BLE ? (
              <Bluetooth size={22} />
            ) : (
              <Radio size={22} />
            )}
          </span>
          <span style={{ fontSize: 22, fontWeight: 600, color: th.textPrimary, fontFamily: "var(--font-mono)" }}>
            {transportName(state.activeTransport, state.bleActiveProfile)}
          </span>
          <span style={{ display: "flex", gap: 6, flexWrap: "wrap", marginLeft: "auto" }}>
            <Badge th={th} tone={state.usbAttached ? "ok" : "neutral"}>
              {state.usbAttached
                ? t("carbon.conn.usbAttachedYes", "USB cable in")
                : t("carbon.conn.usbAttachedNo", "No USB")}
            </Badge>
            <Badge th={th} tone={state.usbHidReady ? "ok" : "neutral"}>
              {state.usbHidReady
                ? t("carbon.conn.usbHidReady", "USB HID ready")
                : t("carbon.conn.usbHidNotReady", "USB HID idle")}
            </Badge>
            <Badge th={th} tone={state.radioSwitching ? "warn" : "neutral"}>
              {state.radioSwitching
                ? t("carbon.conn.radioSwitching", "Radio switching")
                : t("carbon.conn.radioIdle", "Radio idle")}
            </Badge>
          </span>
        </div>

        <div style={{ marginTop: 12 }}>
          <Facts
            th={th}
            rows={[
              {
                label: t("carbon.conn.endpoint", "Endpoint"),
                value: state.endpoint?.trim() || DASH,
                mono: true,
              },
              ...(state.supportsBle
                ? [
                    {
                      label: t("carbon.conn.bleActiveSlot", "Active slot"),
                      value: state.bleProfileCount > 0 ? `#${state.bleActiveProfile + 1} / ${state.bleProfileCount}` : DASH,
                    },
                    {
                      label: t("carbon.conn.bleAdvertising", "Advertising"),
                      value: state.bleAdvertising
                        ? t("carbon.conn.yes", "Yes")
                        : t("carbon.conn.no", "No"),
                    },
                  ]
                : []),
              ...(state.supports2g4
                ? [
                    {
                      label: t("carbon.conn.rf2g4State", "2.4G"),
                      value: state.twoG4Ready
                        ? [
                            t("carbon.conn.rf2g4Ready", "Ready"),
                            format2g4Address(toHex(state.twoG4Address)) || DASH,
                            channelToMhz(state.twoG4Channel),
                          ].join(" · ")
                        : t("carbon.conn.rf2g4NotReady", "Not ready"),
                    },
                  ]
                : []),
            ]}
          />
        </div>
      </div>

      {state.preferredWireless2g4 && (
        <div style={{ marginBottom: 12 }}>
          <Notice th={th} tone="info" title={t("carbon.conn.preferred2g4Title", "2.4G locked by hand")}>
            {t(
              "carbon.conn.preferred2g4",
              "2.4G was picked manually, so the keyboard stays there. Plugging USB in still makes wired the preferred link."
            )}
          </Notice>
        </div>
      )}

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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          <SwitchTarget
            th={th} t={t}
            icon={<Cable size={16} />}
            name={t("carbon.conn.linkUsb", "Wired (USB)")}
            description={usbCopy}
            current={targetIsCurrent(Transport.ZMK_CONNECTION_TRANSPORT_USB)}
            disabled={frozen || !state.supportsUsb}
            label={t("carbon.conn.switchToUsb", "Switch to USB")}
            confirmLabel={t("carbon.conn.switchConfirm", "Confirm switch")}
            onConfirm={() => runSwitch(Transport.ZMK_CONNECTION_TRANSPORT_USB)}
          />
          <SwitchTarget
            th={th} t={t}
            icon={<Bluetooth size={16} />}
            name={t("carbon.conn.linkBle", "Bluetooth")}
            description={
              noBleBonds
                ? `${bleCopy} ${t("carbon.conn.bleNoBondYet", "No slot is paired yet — the keyboard will just start advertising.")}`
                : bleCopy
            }
            current={targetIsCurrent(Transport.ZMK_CONNECTION_TRANSPORT_BLE)}
            disabled={frozen || !state.supportsBle}
            label={t("carbon.conn.switchToBle", "Switch to Bluetooth")}
            confirmLabel={t("carbon.conn.switchConfirm", "Confirm switch")}
            onConfirm={() => runSwitch(Transport.ZMK_CONNECTION_TRANSPORT_BLE)}
          />
          <SwitchTarget
            th={th} t={t}
            icon={<Radio size={16} />}
            name={t("carbon.conn.link2g4", "2.4G")}
            description={rfCopy}
            current={targetIsCurrent(Transport.ZMK_CONNECTION_TRANSPORT_2G4)}
            disabled={frozen || !state.supports2g4}
            label={t("carbon.conn.switchTo2g4", "Switch to 2.4G")}
            confirmLabel={t("carbon.conn.switchConfirm", "Confirm switch")}
            onConfirm={() => runSwitch(Transport.ZMK_CONNECTION_TRANSPORT_2G4)}
          />
        </div>
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

interface BleSlotsProps {
  th: CarbonTheme;
  t: Translate;
  state: State;
  disabled: boolean;
  studioIsBle: boolean;
}

export function BleSlots({ th, t, state, disabled, studioIsBle }: BleSlotsProps) {
  const actions = useConnectionActions();
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<void>) => {
    setError(null);
    try {
      await action();
    } catch (thrown) {
      setError(errorText(t, thrown));
    }
  };

  const profiles = [...state.bleProfiles].sort((a, b) => a.index - b.index);
  const bonded = profiles.filter((profile) => !profile.open).length;

  const switchingHint = studioIsBle
    ? t("carbon.conn.bleSlotHintDrops", "Studio is on Bluetooth: switching slots drops this connection.")
    : undefined;

  return (
    <SettingsBlock
      th={th}
      title={t("carbon.conn.bleTitle", "Bluetooth")}
      hint={t(
        "carbon.conn.bleDesc",
        "Five slots. Pick an empty one, then search for the keyboard from the computer or phone you want to pair."
      )}
      dimmed={disabled}
      right={
        <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Bluetooth size={14} style={{ color: th.iconSecondary }} />
          <Badge th={th}>{profiles.length || state.bleProfileCount}</Badge>
        </span>
      }
    >
      {!state.supportsBle && (
        <Notice th={th} tone="warn">
          {t("carbon.conn.bleNotSupported", "This firmware was built without Bluetooth (CONFIG_ZMK_BLE is off).")}
        </Notice>
      )}

      {studioIsBle && (
        <div style={{ marginBottom: 12 }}>
          <Notice th={th} tone="warn" title={t("carbon.conn.bleDropsStudioTitle", "These actions drop Studio")}>
            {t(
              "carbon.conn.bleDropsStudioBody",
              "Studio is connected over Bluetooth. Switching slots or unpairing restarts the BLE link and closes this connection — switching to an empty slot always does."
            )}
          </Notice>
        </div>
      )}

      {profiles.length === 0 ? (
        <Notice th={th} tone="neutral">
          {state.bleProfileCount > 0
            ? t(
                "carbon.conn.bleNoDetails",
                "The firmware reports slots but did not return their details, so there is nothing to edit here."
              )
            : t("carbon.conn.bleNoSlots", "The firmware reported no Bluetooth slots.")}
        </Notice>
      ) : (
        <div style={{ border: `1px solid ${th.border}` }}>
          <div
            style={{
              display: "grid", gridTemplateColumns: "56px 1fr 84px minmax(240px, auto)", gap: 10,
              alignItems: "center", padding: "8px 12px", background: th.bg,
              fontSize: 11, fontWeight: 600, color: th.textHelper, textTransform: "uppercase", letterSpacing: "0.04em",
            }}
          >
            <span>{t("carbon.conn.bleSlot", "Slot")}</span>
            <span>{t("carbon.conn.bleAddress", "Peer address")}</span>
            <span>{t("carbon.conn.bleStatus", "State")}</span>
            <span style={{ textAlign: "right" }}>{t("carbon.conn.bleActions", "Actions")}</span>
          </div>

          {profiles.map((profile, rowIndex) => (
            <SlotRow
              key={profile.index}
              th={th} t={t}
              profile={profile}
              striped={rowIndex % 2 === 0}
              disabled={disabled || !state.supportsBle}
              studioIsBle={studioIsBle}
              switchingHint={switchingHint}
              onSelect={() => run(() => actions.selectBleProfile(profile.index))}
              onUnpair={() => run(() => actions.unpairBleProfile(profile.index))}
            />
          ))}
        </div>
      )}

      <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-start", justifyContent: "space-between" }}>
        <p style={{ margin: 0, maxWidth: 540, fontSize: 12, lineHeight: 1.6, color: th.textHelper }}>
          {t(
            "carbon.conn.blePairHint",
            "To pair a new host: select an empty slot here, then start a Bluetooth scan on that computer or phone and pick the keyboard name."
          )}
        </p>
        <ConfirmAction
          th={th} t={t}
          tone="danger"
          label={t("carbon.conn.bleUnpairAll", "Unpair everything")}
          confirmLabel={t("carbon.conn.bleUnpairAllConfirm", "Click again to unpair all")}
          hint={t(
            "carbon.conn.bleUnpairAllHint",
            "Clears all paired slots on the keyboard. Every host has to be paired again from scratch."
          )}
          icon={<Unlink size={13} />}
          disabled={disabled || !state.supportsBle || bonded === 0}
          onConfirm={() => run(() => actions.unpairAllBle())}
        />
      </div>

      {error && (
        <div style={{ marginTop: 12 }}>
          <InlineError th={th} t={t} message={error} />
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        <Facts
          th={th}
          rows={[
            {
              label: t("carbon.conn.bleActiveSlotFact", "Active slot"),
              value: state.bleProfileCount > 0 ? `#${state.bleActiveProfile + 1}` : "—",
            },
            {
              label: t("carbon.conn.bleBondedFact", "Paired slots"),
              value: `${bonded} / ${profiles.length || state.bleProfileCount}`,
            },
          ]}
        />
      </div>
    </SettingsBlock>
  );
}

function SlotRow({
  th, t, profile, striped, disabled, studioIsBle, switchingHint, onSelect, onUnpair,
}: {
  th: CarbonTheme;
  t: Translate;
  profile: BleProfile;
  striped: boolean;
  disabled: boolean;
  studioIsBle: boolean;
  switchingHint?: string;
  onSelect: () => Promise<void>;
  onUnpair: () => Promise<void>;
}) {
  const state: { tone: Tone; label: string } = profile.active
    ? { tone: "info", label: t("carbon.conn.bleActive", "Current") }
    : profile.connected
      ? { tone: "ok", label: t("carbon.conn.bleConnected", "Connected") }
      : profile.open
        ? { tone: "neutral", label: t("carbon.conn.bleOpen", "Empty") }
        : { tone: "neutral", label: t("carbon.conn.blePaired", "Paired") };

  const address = profile.open
    ? t("carbon.conn.bleOpenSlot", "Empty slot")
    : formatBleAddress(profile.address) || t("carbon.conn.bleNoAddress", "Address unavailable");

  return (
    <div
      style={{
        display: "grid", gridTemplateColumns: "56px 1fr 84px minmax(240px, auto)", gap: 10,
        alignItems: "center", padding: "8px 12px", fontSize: 12,
        borderTop: `1px solid ${th.border}`, background: striped ? th.layer1 : th.bg,
      }}
    >
      <span style={{ fontFamily: "var(--font-mono)", color: th.textHelper }}>#{profile.index + 1}</span>
      <span
        title={profile.open ? undefined : toHex(profile.address, ":")}
        style={{
          fontFamily: "var(--font-mono)", color: profile.open ? th.textHelper : th.textPrimary,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}
      >
        {address}
      </span>
      <Badge th={th} tone={state.tone}>{state.label}</Badge>
      <span style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <ConfirmAction
          th={th} t={t}
          label={t("carbon.conn.bleSelect", "Use this slot")}
          confirmLabel={t("carbon.conn.bleSelectConfirm", "Click again to switch")}
          hint={switchingHint}
          tone={studioIsBle ? "danger" : "primary"}
          icon={<Link2 size={13} />}
          disabled={disabled || profile.active}
          onConfirm={onSelect}
        />
        <ConfirmAction
          th={th} t={t}
          tone="danger"
          label={t("carbon.conn.bleUnpair", "Unpair")}
          confirmLabel={t("carbon.conn.bleUnpairConfirm", "Click again to unpair")}
          hint={t(
            "carbon.conn.bleUnpairHint",
            "Removes the bond stored in this slot. The host keeps its own copy until you delete the keyboard there too."
          )}
          icon={<Unlink size={13} />}
          disabled={disabled || profile.open}
          onConfirm={onUnpair}
        />
      </span>
    </div>
  );
}
