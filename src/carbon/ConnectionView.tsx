import { useContext, useEffect, useState } from "react";
import type { RpcConnection } from "@zmkfirmware/zmk-studio-ts-client";
import { Transport } from "@zmkfirmware/zmk-studio-ts-client/connection";

import { ContentSwitcher, Facts, InlineError, Loading } from "./CarbonChrome";
import type { CarbonTheme } from "./theme";
import { DonglePanel } from "../connection/DonglePanel";
import { LinkCard } from "../connection/LinkCard";
import { useConnectionActions, useConnectionSnapshot } from "../connection/useConnectionState";
import type { DongleController } from "../connection/useDongle";
import { DASH, type Translate } from "../misc/format";
import { ConnectionContext } from "../rpc/ConnectionContext";
import { call_rpc } from "../rpc/logging";

interface ConnectionViewProps {
  th: CarbonTheme;
  t: Translate;
  onDisconnect: () => void;
  connectionType?: string;
  dongle: DongleController;
  onReceiverPaired: () => void;
}

export function ConnectionView({ th, t, onDisconnect, connectionType, dongle, onReceiverPaired }: ConnectionViewProps) {
  const { conn } = useContext(ConnectionContext);
  const snapshot = useConnectionSnapshot();
  const actions = useConnectionActions();
  const state = snapshot.state;
  const active = connectionType === "2.4G" ? "radio" : connectionType === "BLE" ? "ble" : "usb";
  const [selected, setSelected] = useState<"usb" | "ble" | "radio">(active);
  const mode = selected === "radio" ? Transport.ZMK_CONNECTION_TRANSPORT_2G4 :
    selected === "ble" ? Transport.ZMK_CONNECTION_TRANSPORT_BLE : Transport.ZMK_CONNECTION_TRANSPORT_USB;
  const currentRadio = selected === "radio" && active === "radio" && (!state || state.activeTransport === mode);

  return (
    <div className="carbon-editor-scroll custom-scrollbar">
      <div className="mr-auto w-full max-w-[920px] space-y-4">
        <ContentSwitcher th={th} label={t("carbon.nav.connection", "Connection")} value={selected} onChange={setSelected} opts={[
          { id: "usb", label: "USB" },
          { id: "ble", label: t("carbon.conn.linkBle", "Bluetooth") },
          { id: "radio", label: "2.4G" },
        ]} />

        {conn && selected !== "usb" && selected === active && (
          <LinkSignal key={selected} th={th} t={t} conn={conn} radio={selected === "radio"} />
        )}
        {!currentRadio && (state ? (
          <LinkCard th={th} t={t} state={state} mode={mode} disabled={snapshot.support !== "ready"}
            onDisconnect={onDisconnect} />
        ) : snapshot.support === "loading" ? <Loading th={th} t={t} /> : snapshot.support === "error" && (
          <InlineError th={th} t={t} message={t("carbon.conn.noState", "The firmware returned no connection state.")} onRetry={() => void actions.refresh()} />
        ))}
        {selected === "radio" && active !== "radio" && conn?.label !== "Demo" && (
          <DonglePanel th={th} t={t} dongle={dongle} canPair={active === "usb"} onPaired={onReceiverPaired} />
        )}
      </div>
    </div>
  );
}

// PH Lite's 2 Mbps ESB frame carrying the default NKRO keyboard report.
const radioPayloadBytes = 15 + 1 + 12; // Report body, message type, encryption overhead.
const radioOverheadBits = 16 + 5 * 8 + 6 + 3 + 16; // Preamble, address, length, flags, CRC.
const radioBitsPerMs = 2000;
const radioStartupMs = 0.04;
const firstAttemptMs = radioStartupMs + (radioOverheadBits + radioPayloadBytes * 8) / radioBitsPerMs;
const retryIntervalMs = firstAttemptMs + 0.35 + 0.15; // ACK window and EVO's post-timeout wait.

const radioMaxAttempts = 8; // EVO sends once and can retry up to seven times.

function estimateRadioLatency(loss: number | undefined) {
  if (loss === undefined || loss >= 100) return undefined;

  // A report is lost only if all attempts fail. Condition the average on delivery.
  const attemptFailure = (loss / 100) ** (1 / radioMaxAttempts);
  let weight = 1;
  let deliveryWeight = 0;
  let retryWeight = 0;
  for (let retries = 0; retries < radioMaxAttempts; retries++) {
    deliveryWeight += weight;
    retryWeight += retries * weight;
    weight *= attemptFailure;
  }
  return firstAttemptMs + retryIntervalMs * retryWeight / deliveryWeight;
}

const lossWindowMs = 5 * 60 * 1000;
type TxSample = { at: number; sent: number; failed: number };
const lossHistory = new WeakMap<RpcConnection, TxSample[]>();

function sampleLoss(conn: RpcConnection, sent: number, failed: number) {
  const at = performance.now();
  const samples = (lossHistory.get(conn) ?? []).filter((sample) => at - sample.at <= lossWindowMs);
  const last = samples[samples.length - 1];
  if (last && (sent < last.sent || failed < last.failed)) samples.length = 0;

  const first = samples[0];
  samples.push({ at, sent, failed });
  lossHistory.set(conn, samples);
  if (!first || sent <= first.sent) return undefined;

  const lost = failed - first.failed;
  const completed = sent - first.sent;
  return lost <= completed ? (lost * 100) / completed : undefined;
}

function LinkSignal({ th, t, conn, radio }: {
  th: CarbonTheme;
  t: Translate;
  conn: RpcConnection;
  radio: boolean;
}) {
  const [rssi, setRssi] = useState<number>();
  const [loss, setLoss] = useState<number>();

  useEffect(() => {
    setRssi(undefined);
    setLoss(undefined);

    let stopped = false;
    let pending = false;
    const sample = async () => {
      if (pending || document.hidden) return;
      pending = true;
      try {
        const result = await call_rpc(conn, { sysinfo: { getDiagnostics: true } });
        if (stopped) return;
        const data = result?.sysinfo?.diagnostics;
        const value = data && "rssiDbm" in data ? data.rssiDbm : undefined;
        setRssi(typeof value === "number" && Number.isFinite(value) ? value : undefined);
        const sent = data?.twoG4TxTotal;
        const failed = data?.twoG4TxFail;
        setLoss(radio && typeof sent === "number" && typeof failed === "number"
          ? sampleLoss(conn, sent, failed) : undefined);
      } finally {
        pending = false;
      }
    };
    void sample();
    const timer = window.setInterval(sample, 5000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [conn, radio]);

  const bands = [
    { below: -85, label: t("carbon.conn.signalBand.veryWeak", "Very weak") },
    { below: -75, label: t("carbon.conn.signalBand.weak", "Weak") },
    { below: -65, label: t("carbon.conn.signalBand.good", "Good") },
    { below: -55, label: t("carbon.conn.signalBand.strong", "Strong") },
    { below: Infinity, label: t("carbon.conn.signalBand.excellent", "Excellent") },
  ];
  const level = rssi === undefined ? -1 : bands.findIndex(({ below }) => rssi < below);
  const latency = estimateRadioLatency(loss);

  return (
    <div className="space-y-2">
      <div className="border border-base-300 bg-layer1 p-3">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="text-sm font-semibold text-base-content">{t("carbon.conn.rssi", "Signal strength")}</span>
          <div className="flex items-baseline gap-3">
            {level >= 0 && <span className="text-sm font-semibold" style={{ color: th.linkPrimary }}>{bands[level].label}</span>}
            <span className="font-mono text-sm text-helper">{rssi === undefined ? DASH : rssi + " dBm"}</span>
          </div>
        </div>
        <div className="grid grid-cols-5 gap-1" aria-hidden="true">
          {bands.map(({ below }, index) => (
            <div key={below} className="h-2" style={{ background: index <= level ? th.interactive : th.layer3 }} />
          ))}
        </div>
      </div>
      {radio && <Facts th={th} rows={[
        {
          label: t("carbon.conn.loss5min", "Packet loss · last 5 min"),
          value: loss === undefined ? DASH : loss > 0 && loss < 0.1 ? "<0.1%" : loss.toFixed(1) + "%",
          title: t("carbon.conn.lossHint", "Final send failures divided by completed sends. Successful retries count as success."),
        },
        {
          label: t("carbon.conn.latency", "Wireless latency estimate"),
          value: latency === undefined ? DASH : "≈ " + latency.toFixed(2) + " ms",
          title: t("carbon.conn.latencyHint", "Estimate based on five-minute packet loss and eight allowed attempts. It assumes independent failures and excludes queueing and USB time."),
        },
      ]} />}
    </div>
  );
}
