import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { RpcTransport } from "@zmkfirmware/zmk-studio-ts-client/transport/index";
import { useReceiver } from "./ReceiverContext";
import { connectReceiverKeyboard } from "./receiverConnect";
import { isDesktop, nativeReceiverApi, type ReceiverPort } from "./nativeReceiver";
import { DongleLedPanel } from "./DongleLedPanel";
import { DongleHubPanel } from "./DongleHubPanel";
import { useCarbonTheme } from "../carbon/theme";

export function ReceiverPortHelp({ management = true }: { management?: boolean }) {
  const { t } = useTranslation();
  return <div className="rounded-md border border-base-300 bg-base-200/60 p-3 text-xs leading-relaxed" role="note">
    <p className="font-medium">{t(management ? "receiverFlow.managementPort" : "receiverFlow.studioPort")}</p>
    <p className="mt-1 opacity-75">{t(management ? "receiverFlow.managementHint" : "receiverFlow.studioHint")}</p>
    <p className="mt-1 opacity-75">{t(management ? "receiverFlow.studioHint" : "receiverFlow.managementHint")}</p>
    <p className="mt-1 opacity-65">{t("receiverFlow.portNumbers")}</p>
  </div>;
}
export function ReceiverAccess({ onTransportCreated, onConnectionError }: {
  onTransportCreated: (t: RpcTransport, meta?: { connectionType?: "2.4G"; isWireless?: boolean }) => void;
  onConnectionError?: (message: string | undefined) => void;
}) {
  const { t } = useTranslation();
  const { dongle, selectSlot } = useReceiver();
  const { theme } = useCarbonTheme();
  const [ports, setPorts] = useState<ReceiverPort[]>([]);
  const [opening, setOpening] = useState<number>();
  const [error, setError] = useState<string>();
  const connected = dongle.phase === "open";
  const connect = async () => {
    setError(undefined);
    try {
      if (isDesktop()) {
        const candidates = await nativeReceiverApi().getPorts() as ReceiverPort[];
        if (candidates.length !== 1) { setPorts(candidates); if (!candidates.length) setError(t("receiverFlow.noReceiver")); return; }
        await dongle.connect(false, candidates[0]);
      } else await dongle.connect();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  const openKeyboard = async (slot: 0 | 1) => {
    setOpening(slot); setError(undefined); onConnectionError?.(undefined);
    try {
      const transport = await connectReceiverKeyboard(dongle.managementPort, slot);
      selectSlot(slot);
      onTransportCreated(transport, { connectionType: "2.4G", isWireless: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message); onConnectionError?.(message);
    } finally { setOpening(undefined); }
  };
  const peers = dongle.status?.hubPeers ?? (connected ? [{ slot: 0, paired: true, connected: dongle.status?.link === "CONNECTED", motionState: "UNKNOWN" }] : []);
  return <section className="grid gap-3 rounded-md border border-base-300 p-4" aria-label={t("receiverFlow.title")}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-base font-semibold">{t("receiverFlow.title")}</h2>
        <p className="mt-1 text-xs opacity-75">{t(connected ? "receiverFlow.chooseKeyboard" : "receiverFlow.connectFirst")}</p></div>
      <button className="rounded-md bg-primary px-3 py-2 text-sm text-primary-content disabled:opacity-50"
        disabled={dongle.phase === "connecting" || opening !== undefined} onClick={() => void (connected ? dongle.disconnect() : connect())}>
        {t(connected ? "receiverFlow.disconnectReceiver" : dongle.phase === "connecting" ? "receiverFlow.connecting" : "receiverFlow.connectReceiver")}
      </button>
    </div>
    <ReceiverPortHelp management={!connected} />
    {ports.length > 0 && !connected && <ul className="grid gap-2">{ports.map(p => <li key={p.device?.id}>
      <button className="w-full rounded border border-base-300 p-3 text-left text-sm" onClick={() => void dongle.connect(false, p)}>
        {p.device?.id} · {t("receiverFlow.managementPort")}<span className="block text-xs opacity-65">{p.device?.label}</span>
      </button></li>)}</ul>}
    {(error || dongle.error) && <p role="alert" className="text-sm text-error">{error || dongle.error}</p>}
    {connected && <>
      <p className="break-words text-xs opacity-65">{dongle.port} · {dongle.firmware}</p>
      <div className="grid gap-2 sm:grid-cols-2">{peers.map(peer => <article key={peer.slot} className="rounded-md border border-base-300 p-3">
        <h3 className="text-sm font-medium">{t("receiverFlow.keyboard", { number: peer.slot + 1 })}</h3>
        <p className="mt-1 text-xs opacity-75">{t(peer.connected ? "receiverFlow.online" : "receiverFlow.offline")} · {t(`receiverFlow.motion.${peer.connected ? peer.motionState ?? "UNKNOWN" : "UNKNOWN"}`)}</p>
        <button className="mt-3 rounded-md border border-base-300 px-3 py-2 text-sm hover:bg-base-200 disabled:opacity-40"
          disabled={!peer.paired || !peer.connected || opening !== undefined || dongle.busy || !!dongle.status?.hubStudioOpen}
          onClick={() => void openKeyboard(peer.slot as 0 | 1)}>{opening === peer.slot ? t("receiverFlow.connecting") : t("receiverFlow.manageKeyboard")}</button>
      </article>)}</div>
      <p className="text-xs opacity-75">{t("receiverFlow.wakeHint")}</p>
      <details className="text-sm"><summary className="cursor-pointer">{t("receiverFlow.settings")}</summary>
        <DongleLedPanel th={theme} t={t} dongle={dongle} />
        <DongleHubPanel th={theme} t={t} dongle={dongle} />
      </details>
    </>}
  </section>;
}
