import { useContext, useState } from "react";
import { Transport } from "@zmkfirmware/zmk-studio-ts-client/connection";

import { ContentSwitcher, InlineError, Loading } from "./CarbonChrome";
import type { CarbonTheme } from "./theme";
import { DonglePanel } from "../connection/DonglePanel";
import { LinkCard } from "../connection/LinkCard";
import { useConnectionActions, useConnectionSnapshot } from "../connection/useConnectionState";
import type { DongleController } from "../connection/useDongle";
import type { Translate } from "../misc/format";
import { ConnectionContext } from "../rpc/ConnectionContext";

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

  return (
    <div className="carbon-editor-scroll custom-scrollbar">
      <div className="mr-auto w-full max-w-[920px] space-y-4">
        <ContentSwitcher th={th} label={t("carbon.nav.connection", "Connection")} value={selected} onChange={setSelected} opts={[
          { id: "usb", label: "USB" },
          { id: "ble", label: t("carbon.conn.linkBle", "Bluetooth") },
          { id: "radio", label: "2.4G" },
        ]} />

        {state ? (
          <LinkCard th={th} t={t} state={state} mode={mode} disabled={snapshot.support !== "ready"}
            onDisconnect={onDisconnect} />
        ) : snapshot.support === "loading" ? <Loading th={th} t={t} /> : snapshot.support === "error" && (
          <InlineError th={th} t={t} message={t("carbon.conn.noState", "The firmware returned no connection state.")} onRetry={() => void actions.refresh()} />
        )}
        {selected === "radio" && active !== "radio" && conn?.label !== "Demo" && (
          <DonglePanel th={th} t={t} dongle={dongle} canPair={active === "usb"} onPaired={onReceiverPaired} />
        )}
      </div>
    </div>
  );
}
