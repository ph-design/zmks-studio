import { useEffect, useRef, useState } from "react";
import { Copy, Cpu, RefreshCw } from "lucide-react";

import type { CarbonTheme } from "./theme";
import { useKeyboardModel } from "./useKeyboardModel";
import { DeviceInfoSections } from "../deviceinfo/DeviceInfoSections";
import {
  buildDeviceSections,
  sectionsToClipboardText,
  type DeviceFallback,
} from "../deviceinfo/sections";
import { useSysInfo } from "../deviceinfo/useSysInfo";
import { copyText } from "../misc/format";
import { ActionButton } from "./CarbonChrome";

interface DeviceViewProps {
  model: ReturnType<typeof useKeyboardModel>;
  th: CarbonTheme;
  t: (k: string, d: string) => string;
  deviceName: string;
  serial?: string;
  onResetSettings: () => Promise<boolean> | void;
}

export function DeviceView({ model, th, t, deviceName, serial, onResetSettings }: DeviceViewProps) {
  const info = useSysInfo();
  const [copiedAll, setCopiedAll] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout>>();

  const fallback: DeviceFallback = {
    deviceName,
    serial,
    layerCount: model.keymap?.layers.length,
    layoutCount: model.layouts?.length,
  };
  const sections = buildDeviceSections(info, fallback, t);

  useEffect(() => () => clearTimeout(copyTimer.current), []);

  const copyAll = async () => {
    if (!(await copyText(sectionsToClipboardText(sections)))) return;
    setCopiedAll(true);
    copyTimer.current = setTimeout(() => setCopiedAll(false), 1600);
  };

  return (
    <div className="carbon-editor-scroll custom-scrollbar">
      <div className="mr-auto w-full max-w-[920px]">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center bg-layer2">
          <Cpu size={24} className="text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-lg font-semibold text-base-content">{deviceName}</div>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-success">
            <div className="h-1.5 w-1.5 rounded-full bg-success" />
            {t("carbon.statusConnected", "Device connected")}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <ActionButton th={th} onClick={info.refresh} disabled={info.busy}
            icon={<RefreshCw size={13} />} label={t("carbon.deviceRefresh", "Re-read")} />
          <ActionButton th={th} onClick={copyAll} icon={<Copy size={13} />}
            label={copiedAll ? t("carbon.conn.copied", "Copied") : t("carbon.deviceCopyAll", "Copy all")} />
        </div>
      </div>

      <DeviceInfoSections th={th} t={t} sections={sections} />

      <div className="pt-5">
        <ResetButton th={th} t={t} onReset={onResetSettings} />
      </div>
      </div>
    </div>
  );
}

function ResetButton({ t, onReset }: {
  th: CarbonTheme;
  t: (k: string, d: string) => string;
  onReset: () => Promise<boolean> | void;
}) {
  const [state, setState] = useState<"idle" | "armed" | "working" | "done" | "error">("idle");
  const doneTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(doneTimer.current), []);

  useEffect(() => {
    if (state !== "armed") return;
    const id = setTimeout(() => setState("idle"), 6000);
    return () => clearTimeout(id);
  }, [state]);

  const run = async () => {
    setState("working");
    try {
      const ok = await onReset();
      setState(ok === false ? "error" : "done");
    } catch {
      setState("error");
    } finally {
      doneTimer.current = setTimeout(() => setState("idle"), 2500);
    }
  };

  const label =
    state === "armed"
      ? t("carbon.resetConfirm", "Click again to reset")
      : state === "working"
        ? t("carbon.resetWorking", "Resetting…")
        : state === "done"
          ? t("carbon.resetDone", "Settings cleared")
          : state === "error"
            ? t("carbon.resetFailed", "Reset failed")
            : t("carbon.resetSettings", "Factory reset");

  return (
    <button
      onClick={() => (state === "armed" ? void run() : setState("armed"))}
      disabled={state === "working"}
      className={`border border-error px-3.5 py-2 font-sans text-[13px] ${
        state === "armed" || state === "working"
          ? "bg-error text-primary-content"
          : "bg-transparent text-error"
      }`}
    >
      {label}
    </button>
  );
}
