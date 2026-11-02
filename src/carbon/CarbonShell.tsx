import { useContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronRight, Keyboard as KeyboardIcon, Layers, Zap, Link2,
  Settings, Sun, Moon, Save, Undo2, Redo2, LogOut,
  Check, X, Lock, Cpu, Lightbulb, Waves, Cable,
} from "lucide-react";

import { LockState } from "@zmkfirmware/zmk-studio-ts-client/core";
import { LockStateContext } from "../rpc/LockStateContext";
import { useConnectedDeviceData } from "../rpc/useConnectedDeviceData";
import { useSub } from "../usePubSub";
import { useLocalStorageState } from "../misc/useLocalStorageState";

import { useCarbonTheme, type CarbonTheme } from "./theme";
import { useKeyboardModel } from "./useKeyboardModel";
import { useHoldTapConfigs } from "../behaviors/useHoldTapConfigs";
import { isHoldTapShape } from "../behaviors/holdTapUtils";
import { useCombos } from "../combos/useCombos";
import { ComboPanel } from "../combos/ComboPanel";

import { LayersView } from "./LayersView";
import { LightingView } from "./LightingView";
import { MotionView } from "./MotionView";
import { DeviceView } from "./DeviceView";
import { PreferencesView } from "./PreferencesView";
import { TapHoldView } from "./TapHoldView";
import { ConnectionView } from "./ConnectionView";
import { linkBadge, useConnectionRuntime } from "../connection/useConnectionState";
import { deserializeNav, resolveNav, type NavId } from "./navIds";
import { useMotion } from "../motion/useMotion";
import { GestureChips } from "../unlock/GestureChips";
import { FACTORY_UNLOCK_KEYS } from "../unlock/unlockPaths";

const iconButtonClass = "flex h-8 w-8 items-center justify-center text-secondary-content disabled:text-disabled";

export interface CarbonShellProps {
  carbon: ReturnType<typeof useCarbonTheme>;
  connectedDeviceName?: string;
  connectionType?: string;
  onDisconnect: () => void;
  onSwitchDevice: () => void;
  /** Awaitable so the Device page can show a busy state — this one is slow. */
  onResetSettings: () => Promise<boolean> | void;
  onSave: () => void | Promise<boolean>;
  onDiscard: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  extraSaveEnabled: boolean;
  onReady?: (ready: boolean) => void;
  onProgress?: (value: number) => void;
  onLightingChanged?: () => void;
  onMotionChanged?: () => void;
  onCombosChanged?: () => void;
  onShowAbout: () => void;
  onShowLicense: () => void;
}

export function CarbonShell(props: CarbonShellProps) {
  const { t, i18n } = useTranslation();
  const { isDark, setting, setSetting, theme: th, toggle, accent, setAccent } = props.carbon;
  const [modelReady, setModelReady] = useState(false);
  const model = useKeyboardModel({
    onReady: setModelReady,
    onProgress: props.onProgress,
    onLightingChanged: props.onLightingChanged,
  });
  const motion = useMotion({ onMotionChanged: props.onMotionChanged });

  // Wait for both capability probes before showing navigation.
  const { onReady } = props;
  useEffect(() => {
    onReady?.(modelReady && motion.loaded);
  }, [modelReady, motion.loaded, onReady]);

  const lockState = useContext(LockStateContext);
  const isUnlocked = lockState === LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED;

  const [defaultNav, setDefaultNav] = useLocalStorageState<NavId>(
    "zmk-studio-default-nav",
    "layers",
    { deserialize: deserializeNav }
  );
  const [navSelection, setNavSelection] = useState<NavId>(defaultNav);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 1023px)");
    const apply = () => setSidebarCollapsed(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  const [toast, setToast] = useState<{ type: "success" | "error"; title: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const showToast = useCallback((type: "success" | "error", title: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ type, title });
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const [saving, setSaving] = useState(false);
  const onSave = props.onSave;
  const handleSave = useCallback(async (): Promise<boolean> => {
    if (saving) return false;
    setSaving(true);
    try {
      const ok = await onSave();
      showToast(ok === false ? "error" : "success",
        ok === false ? t("carbon.saveFailed", "Save failed — please retry")
          : t("carbon.saveSuccess", "Saved to keyboard"));
      return ok !== false;
    } catch {
      showToast("error", t("carbon.saveFailed", "Save failed — please retry"));
      return false;
    } finally {
      setSaving(false);
    }
  }, [saving, onSave, showToast, t]);

  const goToNav = (id: NavId) => {
    setNavSelection(id);
    model.setSelectedKeyPosition(undefined);
    if (window.matchMedia("(max-width: 767px)").matches) setSidebarCollapsed(true);
  };

  const [deviceInfo] = useConnectedDeviceData<{ name: string; serialNumber?: Uint8Array }>(
    { core: { getDeviceInfo: true } },
    (r) => r.core?.getDeviceInfo,
    true
  );

  const [keymapUnsaved, setKeymapUnsaved] = useConnectedDeviceData<boolean>(
    { keymap: { checkUnsavedChanges: true } },
    (r) => r.keymap?.checkUnsavedChanges
  );
  useSub("rpc_notification.keymap.unsavedChangesStatusChanged", (u) => setKeymapUnsaved(u));
  const unsaved = !!keymapUnsaved || props.extraSaveEnabled;
  const { canUndo, canRedo, onUndo, onRedo } = props;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isUnlocked || !(e.ctrlKey || e.metaKey)) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (k === "s") {
        e.preventDefault();
        if (unsaved) handleSave();
      } else if (k === "z" && !e.shiftKey) {
        if (canUndo) { e.preventDefault(); onUndo(); }
      } else if ((k === "z" && e.shiftKey) || k === "y") {
        if (canRedo) { e.preventDefault(); onRedo(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isUnlocked, unsaved, canUndo, canRedo, onUndo, onRedo, handleSave]);

  const holdTapIds = useMemo(
    () => model.behaviorList.filter(isHoldTapShape).map((b) => b.id),
    [model.behaviorList]
  );
  const holdTap = useHoldTapConfigs(holdTapIds);
  const combos = useCombos(props.onCombosChanged);
  const connection = useConnectionRuntime();
  const badge = linkBadge(connection, props.connectionType);

  const deviceName = deviceInfo?.name || props.connectedDeviceName || "Keyboard";
  const serialHex = deviceInfo?.serialNumber && deviceInfo.serialNumber.length > 0
    ? Array.from(deviceInfo.serialNumber).map((b) => b.toString(16).padStart(2, "0")).join("")
    : undefined;
  const keyCount = model.layouts?.[model.selectedPhysicalLayoutIndex]?.keys.length ?? 0;
  const layerCount = model.keymap?.layers.length ?? 0;

  const hasLighting =
    model.hasRgb || model.hasBacklight || model.hasCapsLock ||
    model.hasConnection || model.hasLayerLed;

  const NAV = [
    { id: "device" as NavId, label: t("carbon.nav.device", "Device"), icon: <Cpu size={18} />, available: true },
    { id: "layers" as NavId, label: t("carbon.nav.map", "Map"), icon: <Layers size={18} />, available: true },
    { id: "lighting" as NavId, label: t("carbon.nav.lighting", "Lighting"), icon: <Lightbulb size={18} />, available: hasLighting },
    { id: "behaviors" as NavId, label: t("carbon.nav.tapHold", "Tap-Hold"), icon: <Zap size={18} />, available: holdTapIds.length > 0 },
    { id: "combos" as NavId, label: t("carbon.nav.combos", "Combos"), icon: <Link2 size={18} />, available: combos.loaded },
    { id: "motion" as NavId, label: t("carbon.nav.motion", "Motion"), icon: <Waves size={18} />, available: motion.hasMotion },
    { id: "connection" as NavId, label: t("carbon.nav.connection", "Connection"), icon: <Cable size={18} />, available: true },
    { id: "preferences" as NavId, label: t("carbon.nav.preferences", "Preferences"), icon: <Settings size={18} />, available: true },
  ].filter((n) => n.available);

  const activeNav = resolveNav(navSelection, NAV.map((n) => n.id));
  const currentNav = NAV.find((n) => n.id === activeNav)!;

  const crumbs: { label: string; onClick?: () => void }[] = [
    { label: "ZMK Studio", onClick: () => goToNav(defaultNav) },
    { label: currentNav.label, onClick: () => model.setSelectedKeyPosition(undefined) },
  ];
  if (activeNav === "layers" && model.keymap) {
    const layer = model.keymap.layers[model.selectedLayerIndex];
    crumbs.push({
      label: layer?.name || `${t("carbon.layer", "Layer")} ${model.selectedLayerIndex}`,
    });
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background font-sans text-base-content">

      {/* ── Header ── */}
      <header className="z-20 flex h-12 shrink-0 items-center justify-between gap-2 border-b border-base-300 bg-header px-2 sm:gap-4 sm:px-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-4">
          <button onClick={() => setSidebarCollapsed((v) => !v)} className={iconButtonClass}>
            {sidebarCollapsed ? <ChevronRight size={18} /> : <X size={18} />}
          </button>
          <div className="hidden min-w-0 shrink-0 items-center gap-2 min-[480px]:flex">
            <div className="flex h-5 w-5 shrink-0 items-center justify-center bg-primary">
              <KeyboardIcon size={12} color="#fff" />
            </div>
            <span className="whitespace-nowrap text-sm font-semibold text-base-content">ZMK Studio</span>
            <span className="shrink-0 text-sm text-disabled">/</span>
            <button onClick={props.onSwitchDevice} title={t("carbon.switchDevice", "Switch device")}
              className="max-w-40 overflow-hidden text-ellipsis whitespace-nowrap bg-transparent p-0 text-left font-sans text-sm text-secondary-content">
              {deviceName}
            </button>
          </div>
        </div>

        <div className="flex min-w-0 items-center justify-end gap-1 sm:gap-2">
          {unsaved && (
            <>
              <button onClick={props.onDiscard}
                className="flex h-8 shrink-0 items-center whitespace-nowrap border border-error bg-transparent px-2 font-sans text-sm text-error sm:px-4">
                {t("common.discard")}
              </button>
              <button onClick={handleSave} disabled={saving}
                className={`flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap bg-primary px-2 font-sans text-sm text-primary-content sm:px-4 ${saving ? "opacity-70" : ""}`}>
                <Save size={14} /><span className="hidden sm:inline">{saving ? t("carbon.saving", "Saving…") : t("carbon.saveToKeyboard", "Save to keyboard")}</span>
              </button>
            </>
          )}
          <div className="mx-2 hidden h-4 w-px shrink-0 bg-base-300 sm:block" />
          <button onClick={props.onUndo} disabled={!props.canUndo} title={t("carbon.undo", "Undo")} className={iconButtonClass}><Undo2 size={15} /></button>
          <button onClick={props.onRedo} disabled={!props.canRedo} title={t("carbon.redo", "Redo")} className={iconButtonClass}><Redo2 size={15} /></button>
          <div className="mx-2 hidden h-4 w-px shrink-0 bg-base-300 sm:block" />
          <button onClick={toggle} title={isDark ? t("carbon.lightTheme", "Light") : t("carbon.darkTheme", "Dark")} className={iconButtonClass}>
            {isDark ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <button onClick={props.onDisconnect} title={t("carbon.disconnect", "Disconnect")} className={iconButtonClass}><LogOut size={15} /></button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="relative flex flex-1 overflow-hidden">
        {!sidebarCollapsed && (
          <button aria-label="Close navigation" onClick={() => setSidebarCollapsed(true)}
            className="absolute inset-0 z-20 bg-black/40 md:hidden" />
        )}

        <nav className={`shrink-0 overflow-hidden bg-layer1 transition-[width] duration-200 ${sidebarCollapsed ? "w-0" : "w-56 border-r border-base-300 max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:z-30"}`}>
          <div className="flex h-full w-56 flex-col overflow-y-auto custom-scrollbar">
            <div className="px-4 pb-2 pt-5 text-xs font-semibold tracking-[0.08em] text-helper">{t("carbon.config", "CONFIGURATION")}</div>
            <div className="flex-1">
              {NAV.map((item) => {
                const active = activeNav === item.id;
                return (
                  <button key={item.id} onClick={() => goToNav(item.id)}
                    className={`flex h-12 w-full items-center justify-between border-l-[3px] px-4 text-left font-sans transition-colors ${
                      active ? "border-l-selected-border bg-selected text-base-content" : "border-l-transparent text-secondary-content"
                    }`}>
                    <div className="flex items-center gap-3">
                      <span className={active ? "text-primary" : "text-icon"}>{item.icon}</span>
                      <span className={`text-[15px] ${active ? "font-medium" : "font-normal"}`}>{item.label}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </nav>

        <main className="flex flex-1 flex-col overflow-hidden bg-background">
          <div className="flex h-10 shrink-0 items-center gap-1.5 border-b border-base-300 bg-breadcrumb px-3 text-xs text-helper sm:px-6">
            {crumbs.map((c, i) => {
              const last = i === crumbs.length - 1;
              return (
                <span key={i} className="flex items-center gap-1.5">
                  {i > 0 && <ChevronRight size={11} className="text-icon" />}
                  {last || !c.onClick ? (
                    <span className="font-medium text-base-content">{c.label}</span>
                  ) : (
                    <button onClick={c.onClick}
                      className="bg-transparent p-0 font-sans text-xs text-helper hover:text-link">
                      {c.label}
                    </button>
                  )}
                </span>
              );
            })}
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {!isUnlocked ? (
              <LockedNotice th={th} t={t} />
            ) : activeNav === "layers" ? (
              <LayersView model={model} th={th} t={t} deviceName={deviceName} />
            ) : activeNav === "lighting" ? (
              <LightingView model={model} th={th} t={t} />
            ) : activeNav === "motion" ? (
              <MotionView motion={motion} behaviors={model.behaviors} behaviorList={model.behaviorList}
                layers={model.keymap?.layers ?? []} th={th} t={t} />
            ) : activeNav === "behaviors" ? (
              <div className="flex min-h-0 flex-1">
                <TapHoldView behaviors={model.behaviorList} th={th} getConfig={holdTap.getConfig} applyConfig={holdTap.applyConfig} />
              </div>
            ) : activeNav === "device" ? (
              <DeviceView model={model} th={th} t={t} deviceName={deviceName} serial={serialHex}
                onResetSettings={props.onResetSettings} />
            ) : activeNav === "connection" ? (
              <ConnectionView th={th} t={t} onDisconnect={props.onDisconnect}
                connectionType={props.connectionType} />
            ) : activeNav === "preferences" ? (
              <PreferencesView th={th} t={t} setting={setting} setSetting={setSetting}
                accent={accent} setAccent={setAccent}
                lang={i18n.language} setLang={(l) => i18n.changeLanguage(l)}
                defaultNav={defaultNav} setDefaultNav={setDefaultNav}
                navOptions={NAV.map((n) => ({ id: n.id, label: n.label }))}
                onShowAbout={props.onShowAbout} onShowLicense={props.onShowLicense} />
            ) : activeNav === "combos" ? (
              <div className="flex min-h-0 flex-1">
                <ComboPanel
                  combos={combos.combos}
                  reservedCount={0}
                  loaded={combos.loaded}
                  behaviors={model.behaviors}
                  behaviorList={model.behaviorList}
                  layers={model.keymap?.layers ?? []}
                  layout={model.layouts?.[model.selectedPhysicalLayoutIndex]}
                  th={th}
                  applyConfig={combos.applyConfig}
                />
              </div>
            ) : null}
          </div>
        </main>
      </div>

      <footer className="flex h-8 shrink-0 items-center justify-between border-t border-base-300 bg-status px-4 font-mono text-xs">
        <span className="inline-flex h-5 items-center bg-success-bg px-2 font-sans text-[11px] font-medium text-success">
          {badge.tone === "2g4"
            ? t("carbon.conn.twoG4", "2.4G")
            : badge.tone === "ble"
              ? t("carbon.statusBle", "BLE")
              : t("carbon.statusUsb", "USB")}
        </span>
        <div className="flex items-center gap-4 text-helper">
          <span className={`flex items-center gap-1.5 ${unsaved ? "text-warning" : "text-helper"}`}>
            {unsaved && <div className="h-[5px] w-[5px] rounded-full bg-warning" />}
            {unsaved ? t("carbon.unsavedMark", "Unsaved changes *") : t("carbon.allSaved", "All changes saved")}
          </span>
          {keyCount > 0 && (
            <span className="hidden md:inline">{keyCount} {t("carbon.keysUnit", "keys")} / {layerCount} {t("carbon.layersUnit", "layers")}</span>
          )}
        </div>
      </footer>

      {/* Toast — action feedback (auto-dismisses) */}
      {toast && (
        <div className={`fixed bottom-11 right-4 z-50 flex min-w-[260px] max-w-[360px] items-start gap-3 border-l-[3px] px-3.5 py-3 shadow-[0_2px_8px_rgba(0,0,0,0.25)] animate-fade-in ${toast.type === "success" ? "border-l-success bg-success-bg" : "border-l-error bg-error-bg"}`}>
          <span className={`mt-px flex shrink-0 ${toast.type === "success" ? "text-success" : "text-error"}`}>
            {toast.type === "success" ? <Check size={18} /> : <X size={18} />}
          </span>
          <span className="flex-1 text-[13px] text-base-content">{toast.title}</span>
          <button onClick={() => setToast(null)} className="flex bg-transparent p-0 text-icon">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

// Locked devices expose no keymap, so only the factory gesture is shown.
function LockedNotice({ t }: { th: CarbonTheme; t: (k: string, d: string) => string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <Lock size={40} className="text-warning" />
      <div className="text-base font-semibold text-base-content">{t("carbon.lockedTitle", "Keyboard locked")}</div>
      <div className="flex items-center gap-2 text-[13px] text-secondary-content">
        <span>{t("carbon.lockedPress", "Press")}</span>
        <GestureChips keys={FACTORY_UNLOCK_KEYS} />
        <span>{t("carbon.lockedToUnlock", "to unlock")}</span>
      </div>
      <div className="max-w-[360px] text-xs leading-relaxed text-helper">
        {t("carbon.lockedCustomHint", "If you changed the unlock shortcut, use your own instead. Studio can't unlock the keyboard for you — that's the point.")}
      </div>
    </div>
  );
}
