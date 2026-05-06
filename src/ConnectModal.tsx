import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { RpcTransport } from "@zmkfirmware/zmk-studio-ts-client/transport/index";
import { UserCancelledError } from "@zmkfirmware/zmk-studio-ts-client/transport/errors";
import { LockState } from "@zmkfirmware/zmk-studio-ts-client/core";
import type { AvailableDevice } from "./tauri/index";
import { AlertCircle, Bluetooth, Cable, RefreshCw, Languages, Download, X, LoaderCircle, LockKeyhole } from "lucide-react";
import {
  Key,
  ListBox,
  ListBoxItem,
  Selection,
  Button,
} from "react-aria-components";
import { useModalRef } from "./misc/useModalRef";
import { ExternalLink } from "./misc/ExternalLink";
import { GenericModal } from "./GenericModal";

export type TransportFactory = {
  label: string;
  isWireless?: boolean;
  connect?: () => Promise<RpcTransport>;
  pick_and_connect?: {
    list: () => Promise<Array<AvailableDevice>>;
    connect: (dev: AvailableDevice) => Promise<RpcTransport>;
  };
};

export type ConnectionPhase = "idle" | "connecting" | "initializing" | "connected";

export interface ConnectModalProps {
  open?: boolean;
  transports: TransportFactory[];
  onTransportCreated: (t: RpcTransport) => void;
  connectionError?: string;
  onConnectionError?: (message: string | undefined) => void;
  connectionPhase?: ConnectionPhase;
  lockState?: LockState;
  onCancelConnection?: () => void;
  footer?: ReactNode;
}

function errorMessageFrom(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error) {
    return error;
  }

  return fallback;
}

function connectionErrorHelpKey(message: string, failedToConnectMessage: string) {
  const normalized = message.toLowerCase();
  const genericFailure = failedToConnectMessage.toLowerCase();

  if (
    normalized.includes("notallowed") ||
    normalized.includes("permission") ||
    normalized.includes("denied") ||
    normalized.includes("权限") ||
    normalized.includes("拒绝")
  ) {
    return "welcome.connectionErrorHelpPermission";
  }

  if (
    normalized.includes("bluetooth") ||
    normalized.includes("ble") ||
    normalized.includes("gatt") ||
    normalized.includes("networkerror") ||
    normalized.includes("蓝牙")
  ) {
    return "welcome.connectionErrorHelpBle";
  }

  if (
    normalized.includes("serial") ||
    normalized.includes("usb") ||
    normalized.includes("port") ||
    normalized.includes("串口")
  ) {
    return "welcome.connectionErrorHelpUsb";
  }

  if (
    normalized === genericFailure ||
    normalized.includes("rpc") ||
    normalized.includes("timeout") ||
    normalized.includes("timed out") ||
    normalized.includes("超时")
  ) {
    return "welcome.connectionErrorHelpFirmware";
  }

  return "welcome.connectionErrorHelpGeneric";
}

function ConnectionErrorNotice({
  message,
  onDismiss,
}: {
  message?: string;
  onDismiss?: () => void;
}) {
  const { t } = useTranslation();
  const [visibleMessage, setVisibleMessage] = useState(message);
  const [closing, setClosing] = useState(false);
  const helpKey = connectionErrorHelpKey(visibleMessage || "", t("errors.failedToConnect"));

  useEffect(() => {
    if (message) {
      setVisibleMessage(message);
      setClosing(false);
      return;
    }

    if (!visibleMessage) {
      return;
    }

    setClosing(true);
    const closeTimer = window.setTimeout(() => {
      setVisibleMessage(undefined);
      setClosing(false);
    }, 220);

    return () => window.clearTimeout(closeTimer);
  }, [message]);

  const dismiss = useCallback(() => {
    onDismiss?.();
  }, [onDismiss]);

  return (
    <div
      className={`notice-region ${
        visibleMessage ? (closing ? "notice-region-closing" : "notice-region-open") : ""
      }`}
    >
      <div className="min-h-0 overflow-hidden">
        {visibleMessage && (
          <div
            role="alert"
            className={`grid grid-cols-[auto_1fr_auto] gap-3 rounded-md border border-base-300 bg-base-200/70 p-3 text-sm shadow-sm ${
              closing ? "animate-panel-out" : "animate-panel-in"
            }`}
          >
            <AlertCircle className="size-4 text-primary" />
            <div className="min-w-0">
              <p className="font-medium">{t("welcome.connectionErrorTitle")}</p>
              <p className="break-words text-[0.9rem] opacity-80">{visibleMessage}</p>
              <p className="mt-2 text-[0.8rem] opacity-80">
                <span className="font-medium">{t("welcome.connectionErrorHelpTitle")}</span>{" "}
                {t(helpKey)}
              </p>
            </div>
            <Button
              className="rounded p-1 opacity-70 transition-colors hover:bg-base-300 hover:opacity-100"
              onPress={dismiss}
              aria-label={t("common.close")}
            >
              <X className="size-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function isWirelessTransport(transport: TransportFactory) {
  const label = transport.label.toLowerCase();
  return transport.isWireless || label.includes("ble") || label.includes("bluetooth");
}

function isUsbTransport(transport: TransportFactory) {
  return transport.label.toLowerCase().includes("usb");
}

function ConnectionMethodCards({
  transports,
  selectedTransport,
  onSelectTransport,
}: {
  transports: TransportFactory[];
  selectedTransport?: TransportFactory;
  onSelectTransport?: (transport: TransportFactory) => void;
}) {
  const { t } = useTranslation();
  const methods = [
    {
      id: "usb",
      label: "USB",
      icon: Cable,
      transport: transports.find(isUsbTransport),
      description: t("welcome.usbConnectionDescription"),
    },
    {
      id: "ble",
      label: "BLE",
      icon: Bluetooth,
      transport: transports.find(isWirelessTransport),
      description: t("welcome.bleConnectionDescription"),
    },
  ];

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {methods.map((method) => {
        const Icon = method.icon;
        const available = !!method.transport;
        const selected = method.transport && selectedTransport === method.transport;

        return (
          <Button
            key={method.id}
            className="grid grid-cols-[auto_1fr] gap-3 rounded-md border border-base-300 p-3 text-left transition-colors duration-150 hover:border-primary hover:bg-base-200 disabled:cursor-not-allowed disabled:opacity-60"
            isDisabled={!available || selected}
            onPress={() => method.transport && onSelectTransport?.(method.transport)}
          >
            <Icon className="size-6 self-center text-primary" />
            <span className="min-w-0">
              <span className="block font-medium">{method.label}</span>
              <span className="block text-[0.8rem] opacity-75">
                {available ? method.description : t("welcome.connectionUnavailableHint")}
              </span>
            </span>
          </Button>
        );
      })}
    </div>
  );
}

function FlowStep({
  icon,
  title,
  body,
  children,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <div className="grid gap-4 rounded-md border border-base-300 bg-base-200/60 p-5 text-center animate-panel-in">
      <div className="mx-auto grid size-12 place-items-center rounded-full bg-base-100 text-primary shadow-sm">
        {icon}
      </div>
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-1 text-sm opacity-75">{body}</p>
      </div>
      {children}
    </div>
  );
}

function ConnectingStep({ onCancel }: { onCancel?: () => void }) {
  const { t } = useTranslation();

  return (
    <FlowStep
      icon={<LoaderCircle className="size-7 animate-spin" />}
      title={t("welcome.connectingTitle")}
      body={t("welcome.connectingDescription")}
    >
      <div className="grid gap-2">
        <div className="h-2 overflow-hidden rounded-full bg-base-300">
          <div className="h-full w-1/3 rounded-full bg-primary animate-[connect-progress_1.4s_ease-in-out_infinite]" />
        </div>
      </div>
      <Button
        className="mx-auto rounded-md px-3 py-2 text-sm transition-colors hover:bg-base-300"
        onPress={onCancel}
      >
        {t("welcome.cancelConnection")}
      </Button>
    </FlowStep>
  );
}

function UnlockStep() {
  const { t } = useTranslation();

  return (
    <FlowStep
      icon={<LockKeyhole className="size-7" />}
      title={t("unlock.title")}
      body={t("unlock.body1")}
    >
      <p className="text-sm opacity-75">
        {t("unlock.body2Prefix")} {" "}
        <ExternalLink href="https://zmk.dev/docs/keymaps/behaviors/studio-unlock">
          {t("unlock.docs")}
        </ExternalLink>{" "}
        {t("unlock.body2Suffix")}
      </p>
      <div className="h-2 overflow-hidden rounded-full bg-base-300">
        <div className="h-full w-1/3 rounded-full bg-primary animate-[connect-progress_1.4s_ease-in-out_infinite]" />
      </div>
    </FlowStep>
  );
}

function DeviceList({
  open,
  transports,
  onTransportCreated,
  onConnectionError,
}: {
  open: boolean;
  transports: TransportFactory[];
  onTransportCreated: (t: RpcTransport) => void;
  onConnectionError?: (message: string | undefined) => void;
}) {
  const { t } = useTranslation();
  const [devices, setDevices] = useState<
    Array<[TransportFactory, AvailableDevice]>
  >([]);
  const [selectedDev, setSelectedDev] = useState(new Set<Key>());
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | undefined>(undefined);
  const scanId = useRef(0);

  const loadDevices = useCallback(async () => {
    const currentScanId = scanId.current + 1;
    scanId.current = currentScanId;
    setRefreshing(true);
    setRefreshError(undefined);

    const scanTransports = transports.filter((transport) => transport.pick_and_connect);

    if (scanTransports.length === 0) {
      setDevices([]);
      setRefreshing(false);
      return;
    }

    const results = await Promise.allSettled(
      scanTransports.map(async (transport) => {
        const transportDevices = await transport.pick_and_connect?.list();
        const entries = (transportDevices || []).map<[TransportFactory, AvailableDevice]>(
          (device) => [transport, device]
        );

        if (scanId.current === currentScanId && entries.length > 0) {
          setDevices((currentDevices) => [...currentDevices, ...entries]);
        }

        return entries;
      })
    );

    if (scanId.current !== currentScanId) {
      return;
    }

    const entries = results.flatMap((result) =>
      result.status === "fulfilled" ? result.value : []
    );
    const errors = results
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .map((result) => errorMessageFrom(result.reason, t("errors.failedToConnect")));

    setRefreshing(false);

    if (entries.length === 0 && errors.length > 0) {
      setRefreshError(errors[0]);
    }
  }, [transports, t]);

  useEffect(() => {
    setSelectedDev(new Set());
    setDevices([]);

    loadDevices();
  }, [transports, open, setDevices, loadDevices]);

  const onRefresh = useCallback(() => {
    setSelectedDev(new Set());
    setDevices([]);

    loadDevices();
  }, [setDevices, loadDevices]);

  const onSelect = useCallback(
    async (keys: Selection) => {
      if (keys === "all") {
        return;
      }
      setSelectedDev(new Set(keys));
      const dev = devices.find(([transport, d]) => keys.has(`${transport.label}:${d.id}`));
      if (dev) {
        dev[0]
          .pick_and_connect!.connect(dev[1])
          .then(onTransportCreated)
          .catch((e) => {
            console.error(e);
            onConnectionError?.(errorMessageFrom(e, t("errors.failedToConnect")));
          });
      }
    },
    [devices, onTransportCreated, onConnectionError, t]
  );

  return (
    <section className="grid gap-3">
      <div className="grid grid-cols-[1fr_auto] items-start gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t("welcome.selectDevice")}</h2>
          <p className="text-sm opacity-75">{t("welcome.deviceListHint")}</p>
        </div>
        <Button
          className="inline-flex items-center gap-2 rounded-md border border-base-300 px-3 py-2 text-sm transition-colors hover:bg-base-200 disabled:opacity-60"
          isDisabled={refreshing}
          onPress={onRefresh}
          aria-label={t("welcome.refresh")}
        >
          <RefreshCw className={`size-4 transition-transform ${refreshing ? "animate-spin" : ""}`} />
          <span>{t("welcome.refresh")}</span>
        </Button>
      </div>

      <div className="relative min-h-[14rem] overflow-hidden rounded-md border border-base-300 bg-base-100/30">
        <ListBox
          aria-label="Device"
          items={devices}
          onSelectionChange={onSelect}
          selectionMode="single"
          selectedKeys={selectedDev}
          className="flex max-h-[20rem] min-h-[14rem] flex-col gap-1 overflow-y-auto p-1"
        >
          {([transport, device]) => (
            <ListBoxItem
              className="device-row grid cursor-pointer grid-cols-[auto_1fr] items-center gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-base-300 rac-selected:bg-primary rac-selected:text-primary-content"
              id={`${transport.label}:${device.id}`}
              aria-label={device.label}
            >
              {isWirelessTransport(transport) ? (
                <Bluetooth className="size-5 self-center" />
              ) : (
                <Cable className="size-5 self-center" />
              )}
              <div className="min-w-0">
                <span className="block truncate">{device.label}</span>
              </div>
            </ListBoxItem>
          )}
        </ListBox>
        {devices.length === 0 && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center p-4 text-center text-sm opacity-75">
            <div className="grid gap-2 justify-items-center">
              {refreshing && <RefreshCw className="size-5 animate-spin" />}
              <span>{refreshError || (refreshing ? t("welcome.scanningDevices") : t("welcome.noDevices"))}</span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function SimpleDevicePicker({
  transports,
  onTransportCreated,
  onConnectionError,
}: {
  transports: TransportFactory[];
  onTransportCreated: (t: RpcTransport) => void;
  onConnectionError?: (message: string | undefined) => void;
}) {
  const { t } = useTranslation();
  const [availableDevices, setAvailableDevices] = useState<
    AvailableDevice[] | undefined
  >(undefined);
  const [selectedTransport, setSelectedTransport] = useState<
    TransportFactory | undefined
  >(undefined);

  useEffect(() => {
    if (!selectedTransport) {
      setAvailableDevices(undefined);
      return;
    }

    let ignore = false;

    if (selectedTransport.connect) {
      async function connectTransport() {
        try {
          const transport = await selectedTransport?.connect?.();

          if (!ignore) {
            if (transport) {
              onTransportCreated(transport);
            }
            setSelectedTransport(undefined);
          }
        } catch (e) {
          if (!ignore) {
            console.error(e);
            if (e instanceof Error && !(e instanceof UserCancelledError)) {
              onConnectionError?.(errorMessageFrom(e, t("errors.failedToConnect")));
            }
            setSelectedTransport(undefined);
          }
        }
      }

      connectTransport();
    } else {
      async function loadAvailableDevices() {
        const devices = await selectedTransport?.pick_and_connect?.list();

        if (!ignore) {
          setAvailableDevices(devices);
        }
      }

      loadAvailableDevices();
    }

    return () => {
      ignore = true;
    };
  }, [selectedTransport, onConnectionError, onTransportCreated, t]);

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-medium">{t("welcome.selectConnection")}</h2>
        <p className="text-sm opacity-75">{t("welcome.webConnectionHint")}</p>
      </div>
      <ConnectionMethodCards
        transports={transports}
        selectedTransport={selectedTransport}
        onSelectTransport={setSelectedTransport}
      />
      {selectedTransport && availableDevices && (
        <ul className="rounded-md border border-base-300 p-1">
          {availableDevices.map((d) => (
            <li
              key={d.id}
              className="m-1 cursor-pointer rounded px-3 py-2 hover:bg-base-300"
              onClick={async () => {
                onTransportCreated(
                  await selectedTransport!.pick_and_connect!.connect(d)
                );
                setSelectedTransport(undefined);
              }}
            >
              {d.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function noTransportsOptionsPrompt() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-3 rounded-md border border-base-300 p-4">
      <h2 className="text-base font-medium">{t("welcome.unsupportedTitle")}</h2>
      <ConnectionMethodCards transports={[]} />
      <p>
        {t("welcome.unsupportedPrefix")} {" "}
        <ExternalLink href="https://caniuse.com/web-serial">Web Serial</ExternalLink> {" "}
        {t("welcome.unsupportedMiddle")} {" "}
        <ExternalLink href="https://caniuse.com/web-bluetooth">Web Bluetooth</ExternalLink> {" "}
        {t("welcome.unsupportedSuffix")}
      </p>

      <div>
        <p className="font-medium">{t("welcome.unsupportedOptions")}</p>
        <ul className="list-disc list-inside">
          <li>
            {t("welcome.chromeBrowser")}
          </li>
          <li>
            {t("welcome.downloadAppPrefix")} {" "}
            <ExternalLink href="/download">{t("welcome.crossPlatformApp")}</ExternalLink>
            .
          </li>
        </ul>
      </div>
    </div>
  );
}

function ConnectOptions({
  transports,
  onTransportCreated,
  onConnectionError,
  open,
}: {
  transports: TransportFactory[];
  onTransportCreated: (t: RpcTransport) => void;
  onConnectionError?: (message: string | undefined) => void;
  open?: boolean;
}) {
  const useSimplePicker = useMemo(
    () => transports.every((t) => !t.pick_and_connect),
    [transports]
  );

  return useSimplePicker
    ? <SimpleDevicePicker transports={transports} onTransportCreated={onTransportCreated} onConnectionError={onConnectionError} />
    : <DeviceList open={open || false} transports={transports} onTransportCreated={onTransportCreated} onConnectionError={onConnectionError} />;
}

function ClientRecommendation() {
  const { t } = useTranslation();

  return (
    <section className="grid gap-3 rounded-md border border-base-300 p-3 transition-colors duration-150 sm:grid-cols-[1fr_auto] sm:items-center">
      <div>
        <p className="font-medium">{t("welcome.clientTitle")}</p>
        <p className="text-sm opacity-75">
          {t("welcome.clientDescriptionPrefix")} {" "}
          <ExternalLink href="https://caniuse.com/web-serial">Web Serial</ExternalLink> / {" "}
          <ExternalLink href="https://caniuse.com/web-bluetooth">Web Bluetooth</ExternalLink> {" "}
          {t("welcome.clientDescriptionSuffix")}
        </p>
      </div>
      <a
        className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-content hover:opacity-85"
        href="/download"
      >
        <Download className="size-4" />
        {t("welcome.downloadClient")}
      </a>
    </section>
  );
}

export const ConnectModal = ({
  open,
  transports,
  onTransportCreated,
  connectionError,
  onConnectionError,
  connectionPhase = "idle",
  lockState,
  onCancelConnection,
  footer,
}: ConnectModalProps) => {
  const { t, i18n } = useTranslation();
  const dialog = useModalRef(open || false, false, false);
  const [langOpen, setLangOpen] = useState(false);
  const langRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(event.target as Node)) {
        setLangOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const haveTransports = useMemo(() => transports.length > 0, [transports]);
  const isLocked = lockState === LockState.ZMK_STUDIO_CORE_LOCK_STATE_LOCKED;
  const showConnecting = connectionPhase === "connecting";
  const showInitializing = connectionPhase === "initializing";
  const showConnected = connectionPhase === "connected";
  const showCheckingLock = showConnected && lockState === undefined;
  const showUnlock = showConnected && isLocked;
  const liveView = showConnecting || showInitializing || showCheckingLock
    ? "progress"
    : showUnlock
      ? "unlock"
      : "options";
  const lastFlowView = useRef<typeof liveView>("options");
  if (liveView !== "options") {
    lastFlowView.current = liveView;
  }
  const displayView = !open && liveView === "options" ? lastFlowView.current : liveView;
  const isDesktopClient = !!window.__TAURI_INTERNALS__;

  return (
    <GenericModal ref={dialog} className="w-[min(92vw,42rem)] max-h-[90vh] overflow-y-auto">
      <div className="flex items-start justify-between gap-4">
        <div className="grid grid-cols-[auto_1fr] items-center gap-3">
          <img src="/zmk.svg" alt="ZMK Logo" className="size-10 rounded-md" />
          <div>
            <h1 className="text-xl font-semibold">{t("welcome.title")}</h1>
            <p className="text-sm opacity-75">{t("welcome.subtitle")}</p>
          </div>
        </div>
        <div className="flex-shrink-0 relative" ref={langRef}>
          <Button
            className="p-1 rounded hover:bg-base-300 ml-4"
            onPress={() => setLangOpen((open) => !open)}
          >
            <Languages className="w-4" />
          </Button>
          {langOpen && (
            <div className="absolute right-0 mt-1 shadow-lg rounded border border-base-300 bg-base-100 text-base-content overflow-hidden z-50 min-w-32">
              <button
                className="w-full text-left px-2 py-1 hover:bg-base-200"
                onClick={() => {
                  i18n.changeLanguage("en");
                  setLangOpen(false);
                }}
              >
                English
              </button>
              <button
                className="w-full text-left px-2 py-1 hover:bg-base-200"
                onClick={() => {
                  i18n.changeLanguage("zh");
                  setLangOpen(false);
                }}
              >
                中文
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="mt-4">
        <ConnectionErrorNotice
          message={connectionError}
          onDismiss={() => onConnectionError?.(undefined)}
        />
        <div className="space-y-4">
          {displayView === "progress" && (
            <ConnectingStep onCancel={onCancelConnection} />
          )}
          {displayView === "unlock" && <UnlockStep />}
          {displayView === "options" && (
            <>
              {haveTransports
                ? <ConnectOptions transports={transports} onTransportCreated={onTransportCreated} onConnectionError={onConnectionError} open={open} />
                : noTransportsOptionsPrompt()}
              {!isDesktopClient && <ClientRecommendation />}
            </>
          )}
          {footer}
        </div>
      </div>
    </GenericModal>
  );
};
