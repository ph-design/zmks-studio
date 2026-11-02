// Advanced keyboard-side 2.4G pairing controls.
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { KeyRound, RefreshCw, Trash2 } from "lucide-react";

import type { CarbonTheme } from "../carbon/theme";
import { ConnectionContext } from "../rpc/ConnectionContext";
import { ActionButton, ConfirmAction, CopyBlock, Facts, InlineError, Notice, SettingsBlock } from "../carbon/CarbonChrome";
import { ConnRpcError, errorText } from "../misc/errors";
import { channelToMhz, DASH, format2g4Address, type Translate } from "../misc/format";
import {
  atPairCommand,
  clearKeyboardPairing,
  generateKeyboardPairing,
  getKeyboardPairState,
  type GeneratedPairing,
  type KeyboardPairState,
} from "./useConnectionState";

interface Pair2g4PanelProps {
  th: CarbonTheme;
  t: Translate;
  disabled: boolean;
  endpoint?: string;
}

export function Pair2g4Panel({ th, t, disabled, endpoint }: Pair2g4PanelProps) {
  const conn = useContext(ConnectionContext).conn;
  const [pairState, setPairState] = useState<KeyboardPairState | null>(null);
  const [generated, setGenerated] = useState<GeneratedPairing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  const [unsupportedDetail, setUnsupportedDetail] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  const onTwoG4 = endpoint?.startsWith("2.4G") ?? false;

  const tRef = useRef(t);
  tRef.current = t;

  const reload = useCallback(async () => {
    if (!conn) return;
    setLoading(true);
    try {
      setPairState(await getKeyboardPairState(conn));
      setError(null);
      setUnsupported(false);
      setUnsupportedDetail(undefined);
    } catch (thrown) {
      if (thrown instanceof ConnRpcError && thrown.key === "carbon.conn.pairingMissing") {
        setUnsupported(true);
        setUnsupportedDetail(thrown.detail);
        setPairState(null);
      } else {
        setError(errorText(tRef.current, thrown));
      }
    } finally {
      setLoading(false);
    }
  }, [conn]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const guard = async (action: () => Promise<void>) => {
    if (!conn) return;
    setError(null);
    try {
      await action();
    } catch (thrown) {
      setError(errorText(t, thrown));
    }
  };

  const onGenerate = async () => {
    if (!conn) return;
    setError(null);
    try {
      const result = await generateKeyboardPairing(conn);
      setGenerated(result);
      await reload();
    } catch (thrown) {
      setError(errorText(t, thrown));
    }
  };

  const onClear = async () => {
    if (!conn) return;
    await guard(async () => {
      await clearKeyboardPairing(conn);
      setGenerated(null);
      await reload();
    });
  };

  return (
    <SettingsBlock
      th={th}
      title={t("carbon.conn.rfTitle", "2.4G pairing (keyboard side)")}
      dimmed={disabled}
      right={
        <ActionButton
          th={th}
          label={loading ? t("carbon.conn.refreshing", "Reading…") : t("carbon.conn.refresh", "Refresh")}
          icon={<RefreshCw size={13} />}
          onClick={() => void reload()}
          disabled={disabled || loading || unsupported}
        />
      }
    >
      {unsupported ? (
        <Notice th={th} tone="warn" title={t("carbon.conn.rfNotSupportedTitle", "No pairing subsystem")}>
          {t(
            "carbon.conn.rfNotSupported",
            "This firmware has no zmk.pairing subsystem, so pairing cannot be generated from here. Rebuild with the pairing handler enabled, or pair with the keyboard's own 2.4G binding."
          )}
          {unsupportedDetail && (
            <div style={{ marginTop: 6, fontFamily: "var(--font-mono)", color: th.textDisabled }}>
              {t("carbon.conn.firmwareAnswer", "Firmware answer")}: {unsupportedDetail}
            </div>
          )}
        </Notice>
      ) : (
        <>
          <Facts
            th={th}
            rows={[
              {
                label: t("carbon.conn.rfKeySource", "Key source"),
                value: pairState
                  ? pairState.usesFactoryKey
                    ? t("carbon.conn.rfFactoryKey", "Factory key (not uniquely paired)")
                    : t("carbon.conn.rfOwnKey", "Generated key")
                  : DASH,
              },
              {
                label: t("carbon.conn.rfKeyId", "Key id"),
                value: pairState?.keyId || DASH,
                mono: true,
              },
              {
                label: t("carbon.conn.rfAddrPaired", "Address paired"),
                value: pairState ? (pairState.addrPaired ? t("carbon.conn.yes", "Yes") : t("carbon.conn.no", "No")) : DASH,
              },
              {
                label: t("carbon.conn.rfAddr", "RF address"),
                value: format2g4Address(pairState?.rfAddrHex) || DASH,
                mono: true,
              },
              {
                label: t("carbon.conn.rfChannel", "Channel"),
                value: pairState ? `${pairState.rfChannel} (${channelToMhz(pairState.rfChannel)})` : DASH,
              },
            ]}
          />

          {onTwoG4 && (
            <div style={{ marginTop: 12 }}>
              <Notice th={th} tone="warn" title={t("carbon.conn.rfNoRpcTitle", "2.4G cannot carry Studio")}>
                {t(
                  "carbon.conn.rfNoRpc",
                  "The link is on 2.4G, which has no Studio RPC. Switch to USB or Bluetooth above, then come back."
                )}
              </Notice>
            </div>
          )}

          <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <ConfirmAction
              th={th} t={t}
              label={t("carbon.conn.rfGenerate", "Generate a new pairing (keyboard only)")}
              confirmLabel={t("carbon.conn.rfGenerateConfirm", "Click again to generate")}
              hint={t(
                "carbon.conn.rfGenerateHint",
                "The keyboard immediately jumps to the new key and address, so the current 2.4G link goes dead until the same three values reach the dongle."
              )}
              icon={<KeyRound size={13} />}
              disabled={disabled || !conn || onTwoG4}
              onConfirm={onGenerate}
            />
            <ConfirmAction
              th={th} t={t}
              tone="danger"
              label={t("carbon.conn.rfClear", "Clear keyboard pairing")}
              confirmLabel={t("carbon.conn.rfClearConfirm", "Click again to clear")}
              hint={t(
                "carbon.conn.rfClearHint",
                "Drops the stored key and address on the keyboard. A paired dongle stops hearing it until both ends are paired again."
              )}
              icon={<Trash2 size={13} />}
              disabled={disabled || !conn || onTwoG4}
              onConfirm={onClear}
            />
          </div>

          {generated && (
            <div style={{ marginTop: 14, padding: 12, border: `1px solid ${th.borderStrong}`, background: th.layer1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: th.textPrimary, marginBottom: 8 }}>
                {t("carbon.conn.rfNewKey", "New key (16 bytes)")} · key_id {generated.keyId}
              </div>
              <CopyBlock
                th={th} t={t}
                value={generated.keyHex}
                note={t(
                  "carbon.conn.rfNewKeyNote",
                  "This is the secret, shown once. Copy it or send it to the dongle now."
                )}
              />
              <div style={{ marginTop: 10 }}>
                <CopyBlock
                  th={th} t={t}
                  value={atPairCommand(generated)}
                  note={t(
                    "carbon.conn.rfAtCommandNote",
                    "Paste this into the dongle's serial port at 115200 baud, or use «Pair both ends at once» below when the dongle is connected here."
                  )}
                />
              </div>
            </div>
          )}
        </>
      )}

      {error && (
        <div style={{ marginTop: 12 }}>
          <InlineError th={th} t={t} message={error} onRetry={() => void reload()} />
        </div>
      )}
    </SettingsBlock>
  );
}
