import { useContext } from "react";
import { Cable, LogOut } from "lucide-react";
import { LockState } from "@zmkfirmware/zmk-studio-ts-client/core";

import { ActionButton, Notice } from "../carbon/CarbonChrome";
import type { CarbonTheme } from "../carbon/theme";
import type { Translate } from "../misc/format";
import { LockStateContext } from "../rpc/LockStateContext";
import { DonglePanel } from "./DonglePanel";
import type { DongleController } from "./useDongle";

interface ReceiverSetupProps {
  th: CarbonTheme;
  t: Translate;
  dongle: DongleController;
  keyboardName?: string;
  onConnectKeyboard: () => void;
  onPaired: () => void;
  onDisconnect: () => void;
}

export function ReceiverSetup({
  th, t, dongle, keyboardName, onConnectKeyboard, onPaired, onDisconnect,
}: ReceiverSetupProps) {
  const lockState = useContext(LockStateContext);
  const unlocked = lockState === LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED;
  const paired = dongle.status?.pairState === "PAIRED";
  const separatePort = dongle.status?.studioPort === "SECOND_CDC";
  const connection = t("carbon.nav.connection", "Connection");

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-base-300 bg-header px-4">
        <span className="text-sm font-semibold text-base-content">ZMK Studio / PH-dongle</span>
        <ActionButton th={th} label={t("carbon.disconnect", "Disconnect")} icon={<LogOut size={15} />} onClick={onDisconnect} />
      </header>
      <div className="flex min-h-0 flex-1">
        <nav className="hidden w-56 shrink-0 border-r border-base-300 bg-layer1 sm:block">
          <div aria-current="page" className="mt-4 flex items-center gap-3 border-l-2 border-primary bg-selected-layer px-4 py-3 text-sm text-base-content">
            <Cable size={18} /> {connection}
          </div>
        </nav>
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-10 shrink-0 items-center border-b border-base-300 bg-breadcrumb px-4 text-xs font-medium text-base-content">
            {connection}
          </div>
          <div className="carbon-editor-scroll custom-scrollbar">
            <div className="mr-auto w-full max-w-[920px] space-y-3">
              {paired && separatePort && (
                <Notice th={th} tone="neutral">
                  {t("carbon.conn.receiverSeparatePort", "This receiver has a separate Studio USB port. Select that port to edit the keyboard over 2.4G.")}
                </Notice>
              )}
              <div className="flex flex-wrap items-center gap-2">
                {keyboardName ? (
                  <span className="text-sm text-secondary-content">{keyboardName}</span>
                ) : (
                  <ActionButton th={th} label={t("carbon.conn.receiverConnectKeyboard", "Connect keyboard via USB")}
                    onClick={onConnectKeyboard} primary />
                )}
              </div>
              <DonglePanel th={th} t={t} dongle={dongle} canPair={unlocked}
                onPaired={onPaired} />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
