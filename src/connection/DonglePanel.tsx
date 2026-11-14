// Dongle connection, pairing and channel management.
import { useContext, useEffect, useRef, useState } from "react";
import { Check, Plug, RefreshCw, Terminal, Unplug, X, Zap } from "lucide-react";

import type { CarbonTheme } from "../carbon/theme";
import { ConnectionContext } from "../rpc/ConnectionContext";
import { ActionButton, ConfirmAction, Facts, InlineError, Notice, SettingsBlock, Badge } from "../carbon/CarbonChrome";
import { errorText } from "../misc/errors";
import { channelToMhz, DASH, format2g4Address, type Translate } from "../misc/format";
import { clearKeyboardPairing, runOneClickPair, type ConsistencyRow, type PairOutcome, type PairStepId } from "./useConnectionState";
import { DongleMonitor } from "./DongleMonitor";
import type { DongleController } from "./useDongle";

interface DonglePanelProps {
  th: CarbonTheme;
  t: Translate;
  dongle: DongleController;
  firmwareHasConnection: boolean;
  showAdvanced: boolean;
}

export function DonglePanel({ th, t, dongle, firmwareHasConnection, showAdvanced }: DonglePanelProps) {
  return (
    <SettingsBlock
      th={th}
      title={t("carbon.conn.dongleTitle", "2.4G pairing")}
      hint={t(
        "carbon.conn.dongleDesc",
        "Connect the keyboard and dongle over USB, then pair them in one click. No AT commands are needed."
      )}
      right={
        !dongle.supported ? undefined : dongle.phase === "open" ? (
          <>
            <ActionButton
              th={th}
              label={dongle.busy ? t("carbon.conn.refreshing", "Reading…") : t("carbon.conn.refresh", "Refresh")}
              icon={<RefreshCw size={13} />}
              onClick={() => void dongle.refresh()}
              disabled={dongle.busy}
            />
            <ActionButton
              th={th}
              label={t("carbon.conn.dongleDisconnect", "Close port")}
              icon={<Unplug size={13} />}
              onClick={() => void dongle.disconnect()}
            />
          </>
        ) : (
          <>
            <ActionButton
              th={th}
              primary
              label={
                dongle.phase === "connecting"
                  ? t("carbon.conn.dongleConnecting", "Opening…")
                  : dongle.phase === "lost"
                    ? t("carbon.conn.dongleReconnect", "Reconnect")
                    : t("carbon.conn.dongleConnect", "Connect dongle")
              }
              icon={<Plug size={13} />}
              onClick={() => void dongle.connect(false)}
              disabled={dongle.phase === "connecting"}
            />
            {showAdvanced && (
              <ActionButton
                th={th}
                label={t("carbon.conn.dongleConnectAny", "Pick any serial port")}
                onClick={() => void dongle.connect(true)}
                disabled={dongle.phase === "connecting"}
              />
            )}
          </>
        )
      }
    >
      {!dongle.supported ? (
        <Notice
          th={th}
          tone="err"
          title={t("carbon.conn.dongleUnsupportedTitle", "Web Serial is not available")}
        >
          {t(
            "carbon.conn.dongleUnsupported",
            "This browser exposes no Web Serial API (Firefox and Safari do not), so the dongle cannot be reached from here. Use Chrome or Edge — or the desktop client — to pair the 2.4G link from Studio."
          )}
        </Notice>
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
            <Badge th={th} tone={dongle.phase === "open" ? "ok" : dongle.phase === "lost" ? "err" : "neutral"}>
              {dongle.phase === "open"
                ? t("carbon.conn.dongleOpen", "Open")
                : dongle.phase === "lost"
                  ? t("carbon.conn.dongleLostTag", "Lost")
                  : dongle.phase === "connecting"
                    ? t("carbon.conn.dongleConnectingTag", "Opening")
                    : t("carbon.conn.dongleIdle", "Not connected")}
            </Badge>
            {dongle.port && <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: th.textSecondary }}>{dongle.port}</span>}
            {dongle.firmware && (
              <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: th.textHelper }}>{dongle.firmware}</span>
            )}
          </div>

          {showAdvanced && dongle.phase === "open" && (
            <div style={{ fontSize: 12, color: th.textHelper, marginBottom: 10 }}>
              {t(
                "carbon.conn.dongleClosesOnLeave",
                "The port is held only while this page is open — coming back needs «Connect dongle» again, without a new picker."
              )}
            </div>
          )}

          {dongle.phase === "lost" && (
            <div style={{ marginBottom: 12 }}>
              <Notice th={th} tone="warn" title={t("carbon.conn.dongleLostTitle", "Serial port closed")}>
                {t(
                  "carbon.conn.dongleLostHint",
                  "The dongle dropped off the bus — unplugged, or it rebooted after AT+RST / AT+BL. Plug it back in and use «Reconnect»; the granted port is reused without a new picker."
                )}
              </Notice>
            </div>
          )}

          {dongle.error && (
            <div style={{ marginBottom: 12 }}>
              <InlineError th={th} t={t} message={dongle.error} onRetry={() => void dongle.refresh()} />
            </div>
          )}

          <DongleMonitor th={th} t={t} dongle={dongle} />
          <DongleStatusFacts th={th} t={t} dongle={dongle} showAdvanced={showAdvanced} />
          <PairingBlock th={th} t={t} dongle={dongle} firmwareHasConnection={firmwareHasConnection} />
          {showAdvanced && <TerminalBlock th={th} t={t} dongle={dongle} />}
        </>
      )}
    </SettingsBlock>
  );
}

function DongleStatusFacts({ th, t, dongle, showAdvanced }: { th: CarbonTheme; t: Translate; dongle: DongleController; showAdvanced: boolean }) {
  const status = dongle.status;

  if (!status) {
    return (
      <Notice th={th} tone="neutral">
        {t("carbon.conn.dongleNoStatus", "Connect the dongle to read its pairing status.")}
      </Notice>
    );
  }

  return (
    <Facts
      th={th}
      rows={[
        {
          label: t("carbon.conn.donglePairState", "Pair state"),
          value: status.pairState || DASH,
        },
        { label: t("carbon.conn.dongleLink", "Keyboard link"), value: status.link || DASH },
        ...(showAdvanced
          ? [
              {
                label: t("carbon.conn.dongleFactoryKey", "Factory key"),
                value: status.factoryKey === undefined ? DASH : status.factoryKey ? t("carbon.conn.yes", "Yes") : t("carbon.conn.no", "No"),
              },
              { label: t("carbon.conn.dongleKeyId", "Key id"), value: status.keyId || DASH, mono: true },
              {
                label: t("carbon.conn.dongleAddrPaired", "Address paired"),
                value: status.addrPaired === undefined ? DASH : status.addrPaired ? t("carbon.conn.yes", "Yes") : t("carbon.conn.no", "No"),
              },
              { label: t("carbon.conn.dongleRfAddr", "RF address"), value: format2g4Address(status.rfAddr) || DASH, mono: true },
              {
                label: t("carbon.conn.dongleRfCh", "Channel"),
                value: status.rfChannel === undefined ? DASH : `${status.rfChannel} (${channelToMhz(status.rfChannel)})`,
              },
              {
                label: t("carbon.conn.dongleRx", "Packets / decrypt failures"),
                value: `${status.rx ?? DASH} / ${status.rxDecryptFail ?? DASH}`,
              },
            ]
          : []),
      ]}
    />
  );
}

function stepLabel(t: Translate, id: PairStepId): string {
  switch (id) {
    case "generate":
      return t("carbon.conn.pairStepGenerate", "Pairing information generated on the keyboard");
    case "atPair":
      return t("carbon.conn.pairStepAtPair", "Pairing information written to the dongle");
    default:
      return t("carbon.conn.pairStepVerify", "Keyboard and dongle information matched");
  }
}

function PairingBlock({
  th, t, dongle, firmwareHasConnection,
}: {
  th: CarbonTheme;
  t: Translate;
  dongle: DongleController;
  firmwareHasConnection: boolean;
}) {
  const conn = useContext(ConnectionContext).conn;
  const [outcome, setOutcome] = useState<PairOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cleared, setCleared] = useState<string[]>([]);
  const [clearError, setClearError] = useState<string | null>(null);

  const open = dongle.phase === "open";

  const pairBoth = async () => {
    setError(null);
    setOutcome(null);
    try {
      const result = await runOneClickPair(conn, {
        pair: dongle.pair,
        queryStatus: dongle.queryStatus,
      });
      setOutcome(result);
      await dongle.refresh();
    } catch (thrown) {
      setError(errorText(t, thrown));
    }
  };

  const clearBoth = async () => {
    setClearError(null);
    setCleared([]);
    const done: string[] = [];

    try {
      if (conn) {
        await clearKeyboardPairing(conn);
        done.push(t("carbon.conn.dongleClearKbdOk", "Keyboard pairing cleared"));
      }
    } catch (thrown) {
      setClearError(errorText(t, thrown));
    }

    const reply = await dongle.clear();
    if (reply?.ok) {
      done.push(t("carbon.conn.dongleClearDongleOk", "Dongle pairing cleared"));
    } else if (reply && !reply.ok) {
      setClearError(`${t("carbon.conn.dongleClearDongleFailed", "The dongle did not confirm AT+CLEAR")}：${reply.raw.trim()}`);
    }

    setCleared(done);
    if (done.length > 0) await dongle.refresh();
  };

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: th.textPrimary, marginBottom: 8 }}>
        {t("carbon.conn.donglePairTitle", "One-click pairing")}
      </div>
      <p style={{ margin: "0 0 10px", fontSize: 12, lineHeight: 1.6, color: th.textHelper, maxWidth: 640 }}>
        {t(
          "carbon.conn.donglePairHint",
          "The keyboard and dongle receive the same key and address automatically. The 2.4G link may disconnect briefly while they restart."
        )}
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <ConfirmAction
          th={th} t={t}
          label={t("carbon.conn.donglePairBoth", "Pair now")}
          confirmLabel={t("carbon.conn.donglePairBothConfirm", "Click again to pair")}
          hint={t(
            "carbon.conn.donglePairBothHint",
            "The keyboard jumps to the new pair immediately, so the existing 2.4G link dies until the dongle accepts the same values."
          )}
          icon={<Zap size={13} />}
          disabled={!open || !conn || !firmwareHasConnection}
          onConfirm={pairBoth}
        />
        <ConfirmAction
          th={th} t={t}
          tone="danger"
          label={t("carbon.conn.dongleClearBoth", "Clear pairing")}
          confirmLabel={t("carbon.conn.dongleClearBothConfirm", "Click again to clear")}
          hint={t(
            "carbon.conn.dongleClearBothHint",
            "Clears the keyboard's key/address and sends AT+CLEAR to the dongle. The 2.4G link stays down until both are paired again."
          )}
          icon={<X size={13} />}
          disabled={!open || !conn || !firmwareHasConnection}
          onConfirm={clearBoth}
        />
      </div>

      {!open && (
        <div style={{ marginTop: 10 }}>
          <Notice th={th} tone="neutral">
            {t("carbon.conn.donglePairNeedsPort", "Connect the dongle first, then pair or clear the pairing.")}
          </Notice>
        </div>
      )}

      {error && (
        <div style={{ marginTop: 10 }}>
          <InlineError th={th} t={t} message={error} />
        </div>
      )}

      {outcome && (
        <div style={{ marginTop: 12, border: `1px solid ${outcome.ok ? th.success : th.error}`, padding: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: outcome.rows.length ? 10 : 0 }}>
            {outcome.steps.map((step) => (
              <div key={step.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12 }}>
                <span style={{ color: step.ok ? th.success : th.error, display: "flex", marginTop: 1 }}>
                  {step.ok ? <Check size={13} /> : <X size={13} />}
                </span>
                <span style={{ minWidth: 0, color: th.textPrimary }}>
                  {stepLabel(t, step.id)}
                  {step.detail && (
                    <span style={{ color: th.textHelper, fontFamily: "var(--font-mono)" }}> — {step.detail}</span>
                  )}
                </span>
              </div>
            ))}
          </div>

          {outcome.rows.length > 0 && <ConsistencyTable th={th} t={t} rows={outcome.rows} />}

          {outcome.errorKey && (
            <div style={{ marginTop: 10 }}>
              <InlineError th={th} t={t} message={t(outcome.errorKey, "Pairing failed")} />
            </div>
          )}
          {outcome.ok && (
            <div style={{ marginTop: 10 }}>
              <Notice th={th} tone="ok" title={t("carbon.conn.pairOkTitle", "Pairing complete")}>
                {t(
                  "carbon.conn.pairOk",
                  "The keyboard and dongle are paired. Switch the keyboard to 2.4G to start using it."
                )}
              </Notice>
            </div>
          )}
        </div>
      )}

      {cleared.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <Notice th={th} tone="ok" title={t("carbon.conn.dongleClearedTitle", "Cleared")}>
            {cleared.join(" · ")}
          </Notice>
        </div>
      )}
      {clearError && (
        <div style={{ marginTop: 10 }}>
          <InlineError th={th} t={t} message={clearError} />
        </div>
      )}
    </div>
  );
}

function ConsistencyTable({ th, t, rows }: { th: CarbonTheme; t: Translate; rows: ConsistencyRow[] }) {
  const label: Record<ConsistencyRow["id"], string> = {
    keyId: t("carbon.conn.dongleKeyId", "Key id"),
    rfAddr: t("carbon.conn.dongleRfAddr", "RF address"),
    rfChannel: t("carbon.conn.dongleRfCh", "Channel"),
  };

  return (
    <div style={{ border: `1px solid ${th.border}` }}>
      <div
        style={{
          display: "grid", gridTemplateColumns: "1fr 1fr 1fr 64px", gap: 10, padding: "6px 10px",
          fontSize: 11, fontWeight: 600, color: th.textHelper, background: th.bg,
          textTransform: "uppercase", letterSpacing: "0.04em",
        }}
      >
        <span>{t("carbon.conn.colItem", "Item")}</span>
        <span>{t("carbon.conn.colKeyboard", "Keyboard")}</span>
        <span>{t("carbon.conn.colDongle", "Dongle")}</span>
        <span style={{ textAlign: "right" }}>{t("carbon.conn.colResult", "Match")}</span>
      </div>
      {rows.map((row, index) => (
        <div
          key={row.id}
          style={{
            display: "grid", gridTemplateColumns: "1fr 1fr 1fr 64px", gap: 10, padding: "6px 10px",
            fontSize: 12, fontFamily: "var(--font-mono)",
            borderTop: `1px solid ${th.border}`, background: index % 2 === 0 ? th.layer1 : th.bg,
          }}
        >
          <span style={{ fontFamily: "var(--font-sans)", color: th.textSecondary }}>{label[row.id]}</span>
          <span style={{ color: th.textPrimary, overflow: "hidden", textOverflow: "ellipsis" }}>{row.keyboard || DASH}</span>
          <span style={{ color: th.textPrimary, overflow: "hidden", textOverflow: "ellipsis" }}>{row.dongle || DASH}</span>
          <span style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 4, color: row.match ? th.success : th.error }}>
            {row.match ? <Check size={13} /> : <X size={13} />}
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 11 }}>
              {row.match ? t("carbon.conn.matchYes", "OK") : t("carbon.conn.matchNo", "Differs")}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

function TerminalBlock({ th, t, dongle }: { th: CarbonTheme; t: Translate; dongle: DongleController }) {
  const [command, setCommand] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const open = dongle.phase === "open";

  useEffect(() => {
    const element = logRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [dongle.transcript]);

  const submit = async () => {
    const line = command.trim();
    if (!line) return;
    setCommand("");
    await dongle.send(line);
  };

  const quick = (line: string) => void dongle.send(line);

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <Terminal size={14} style={{ color: th.iconSecondary }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: th.textPrimary }}>
          {t("carbon.conn.atTerminal", "Raw AT terminal")}
        </span>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        {["AT+INFO", "AT+2G4?", "AT+GMR"].map((line) => (
          <ActionButton key={line} th={th} label={line} onClick={() => quick(line)} disabled={!open} />
        ))}
        <ConfirmAction
          th={th} t={t}
          label="AT+RST"
          confirmLabel={t("carbon.conn.atResetConfirm", "Click again to reboot")}
          hint={t("carbon.conn.atResetHint", "Reboots the dongle; the serial port closes and has to be reconnected.")}
          disabled={!open}
          onConfirm={() => quick("AT+RST")}
        />
        <ConfirmAction
          th={th} t={t}
          tone="danger"
          label="AT+BL"
          confirmLabel={t("carbon.conn.atBootloaderConfirm", "Click again for bootloader")}
          hint={t(
            "carbon.conn.atBootloaderHint",
            "Reboots the dongle into DFU/bootloader. It leaves the serial port until you flash it again or power-cycle it out of bootloader."
          )}
          disabled={!open}
          onConfirm={() => quick("AT+BL")}
        />
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        style={{ display: "flex", gap: 8, marginBottom: 8 }}
      >
        <input
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          placeholder={t("carbon.conn.atPlaceholder", "AT+2G4?")}
          spellCheck={false}
          style={{
            flex: 1, minWidth: 0, height: 34, padding: "0 10px", fontSize: 12,
            fontFamily: "var(--font-mono)", background: th.fieldBg, color: th.textPrimary,
            border: "none", borderBottom: `1px solid ${th.borderStrong}`, outline: "none",
          }}
        />
        <ActionButton
          th={th}
          primary
          label={t("carbon.conn.atSend", "Send")}
          onClick={() => void submit()}
          disabled={!open || !command.trim()}
        />
        <ActionButton th={th} label={t("carbon.conn.atClear", "Clear")} onClick={dongle.clearTranscript} />
      </form>

      <div
        ref={logRef}
        className="custom-scrollbar"
        style={{
          height: 200, overflowY: "auto", padding: "8px 10px",
          background: th.statusBg, border: `1px solid ${th.border}`,
          fontFamily: "var(--font-mono)", fontSize: 11, lineHeight: 1.7,
        }}
      >
        {dongle.transcript.length === 0 ? (
          <span style={{ color: th.textDisabled }}>
            {t("carbon.conn.atNoOutput", "No traffic yet.")}
          </span>
        ) : (
          dongle.transcript.map((entry) => (
            <div
              key={entry.id}
              style={{ color: entry.dir === "tx" ? th.linkPrimary : th.textSecondary, whiteSpace: "pre-wrap", wordBreak: "break-all" }}
            >
              <span style={{ color: th.textDisabled }}>{entry.dir === "tx" ? "» " : "« "}</span>
              {entry.text}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

