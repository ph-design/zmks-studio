// Connection management and 2.4G pairing.
import { useContext, useState } from "react";
import { Transport } from "@zmkfirmware/zmk-studio-ts-client/connection";

import type { CarbonTheme } from "./theme";
import { ActionButton, SettingsBlock, InlineError, Notice } from "./CarbonChrome";
import { DonglePanel } from "../connection/DonglePanel";
import { LinkCard } from "../connection/LinkCard";
import { Pair2g4Panel } from "../connection/Pair2g4Panel";
import type { Translate } from "../misc/format";
import { useConnectionActions, useConnectionSnapshot } from "../connection/useConnectionState";
import { ConnectionContext } from "../rpc/ConnectionContext";
import { DemoDonglePanel } from "../demo/DemoDonglePanel";
import { useDongle } from "../connection/useDongle";

export interface ConnectionViewProps {
  th: CarbonTheme;
  t: Translate;
  onDisconnect: () => void;
  // no 2g4 for now
  connectionType?: string;
}

export function ConnectionView({ th, t, onDisconnect, connectionType }: ConnectionViewProps) {
  const isDemo = useContext(ConnectionContext).conn?.label === "Demo";
  const snapshot = useConnectionSnapshot();
  const actions = useConnectionActions();
  const dongle = useDongle(t);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const state = snapshot.support === "ready" ? snapshot.state : undefined;
  const studioIsBle =
    connectionType === "BLE" ||
    (connectionType === undefined && state?.activeTransport === Transport.ZMK_CONNECTION_TRANSPORT_BLE);

  return (
    <div className="carbon-editor-scroll custom-scrollbar">
      <div className="mr-auto w-full max-w-[920px]">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="mb-1 text-base font-semibold text-base-content">
              {t("carbon.conn.title", "Connection")}
            </h2>
            <p className="m-0 text-xs leading-relaxed text-helper">
              {t("carbon.conn.subtitle", "View connection status and manage pairing between the keyboard and a 2.4G dongle.")}
            </p>
          </div>
          <ActionButton
            th={th}
            label={showAdvanced
              ? t("carbon.conn.advancedHide", "Hide advanced")
              : t("carbon.conn.advanced", "Advanced")}
            onClick={() => setShowAdvanced((value) => !value)}
          />
        </div>

        {snapshot.support === "loading" && (
          <Notice th={th} tone="neutral">
            {t("carbon.conn.loading", "Reading the connection state…")}
          </Notice>
        )}

        {snapshot.support === "unsupported" && (
          <Notice
            th={th}
            tone="warn"
            title={t("carbon.conn.unsupportedTitle", "This firmware has no connection management")}
          >
            {t(
              "carbon.conn.unsupportedBody",
              "Unable to read. Check the firmware version."
            )}
            <div className="mt-1.5">
              {t(
                "carbon.conn.unsupportedNote",
                "The dongle section still works — it talks to the dongle over its own serial port, not to the keyboard firmware."
              )}
            </div>
            {snapshot.detail && (
              <div className="mt-1.5 font-mono text-disabled">
                {t("carbon.conn.firmwareAnswer", "Firmware answer")}: {snapshot.detail}
              </div>
            )}
          </Notice>
        )}

        {snapshot.support === "ready" && !state && (
          <InlineError
            th={th}
            t={t}
            message={t("carbon.conn.noState", "The firmware returned no connection state.")}
            onRetry={() => void actions.refresh()}
          />
        )}

        {state ? (
          <LinkCard
            th={th}
            t={t}
            state={state}
            disabled={snapshot.support !== "ready"}
            studioIsBle={studioIsBle}
            onDisconnect={onDisconnect}
          />
        ) : (
          snapshot.support !== "loading" && (
            <SettingsBlock
              th={th}
              title={t("carbon.conn.frozenTitle", "Link, Bluetooth and 2.4G pairing")}
              dimmed
            >
              <Notice th={th} tone="neutral">
                {t(
                  "carbon.conn.frozenBody",
                  "No keyboard 2.4G support detected."
                )}
              </Notice>
            </SettingsBlock>
          )
        )}

        {isDemo ? <DemoDonglePanel th={th} t={t} /> : <DonglePanel
          th={th} t={t} dongle={dongle}
          firmwareHasConnection={snapshot.support === "ready"}
          showAdvanced={showAdvanced}
        />}

        {showAdvanced && state && (
          <Pair2g4Panel th={th} t={t} disabled={snapshot.support !== "ready"} endpoint={state.endpoint} />
        )}
      </div>
    </div>
  );
}


