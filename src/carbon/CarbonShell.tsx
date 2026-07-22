import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronRight, Keyboard as KeyboardIcon, Layers, Zap, Link2,
  Settings, Sun, Moon, Save, Undo2, Redo2, LogOut,
  Check, X, Lock, Gauge, Lightbulb,
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
import { OtherPanel } from "../keyboard/OtherPanel";

import { LayersView } from "./LayersView";
import { LightingView } from "./LightingView";
import { QuickSettingsView } from "./QuickSettingsView";
import { SettingsView } from "./SettingsView";
import { iconBtn, CombosPlaceholder } from "./CarbonChrome";

type NavId = "keyboard" | "layers" | "behaviors" | "lighting" | "combos" | "settings";

export interface CarbonShellProps {
  carbon: ReturnType<typeof useCarbonTheme>;
  connectedDeviceName?: string;
  connectionType?: string;
  onDisconnect: () => void;
  onSwitchDevice: () => void;
  onResetSettings: () => void;
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
  onShowAbout: () => void;
  onShowLicense: () => void;
}

export function CarbonShell(props: CarbonShellProps) {
  const { t, i18n } = useTranslation();
  const { isDark, setting, setSetting, theme: th, toggle } = props.carbon;
  const model = useKeyboardModel({
    onReady: props.onReady,
    onProgress: props.onProgress,
    onLightingChanged: props.onLightingChanged,
  });

  const lockState = useContext(LockStateContext);
  const isUnlocked = lockState === LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED;

  const [defaultNav, setDefaultNav] = useLocalStorageState<NavId>(
    "zmk-studio-default-nav",
    "layers"
  );
  const [activeNav, setActiveNav] = useState<NavId>(defaultNav);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [toast, setToast] = useState<{ type: "success" | "error"; title: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const showToast = (type: "success" | "error", title: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ type, title });
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  };
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const [saving, setSaving] = useState(false);
  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const ok = await props.onSave();
      showToast(ok === false ? "error" : "success",
        ok === false ? t("carbon.saveFailed", "Save failed — please retry")
          : t("carbon.saveSuccess", "Saved to keyboard"));
    } catch {
      showToast("error", t("carbon.saveFailed", "Save failed — please retry"));
    } finally {
      setSaving(false);
    }
  };

  const goToNav = (id: NavId) => {
    setActiveNav(id);
    model.setSelectedKeyPosition(undefined);
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

  // Ctrl/Cmd+S save, Ctrl+Z undo, Ctrl+Shift+Z / Ctrl+Y redo.
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
        if (props.canUndo) { e.preventDefault(); props.onUndo(); }
      } else if ((k === "z" && e.shiftKey) || k === "y") {
        if (props.canRedo) { e.preventDefault(); props.onRedo(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isUnlocked, unsaved, props.canUndo, props.canRedo, props.onUndo, props.onRedo, handleSave]);

  // Hold-tap configs lifted to shell so the cache survives tab switches
  // and the Behaviors panel doesn't reload-flash on re-entry.
  const holdTapIds = useMemo(
    () => model.behaviorList.filter(isHoldTapShape).map((b) => b.id),
    [model.behaviorList]
  );
  const holdTap = useHoldTapConfigs(holdTapIds);

  const deviceName = deviceInfo?.name || props.connectedDeviceName || "Keyboard";
  const serialHex = deviceInfo?.serialNumber && deviceInfo.serialNumber.length > 0
    ? Array.from(deviceInfo.serialNumber).map((b) => b.toString(16).padStart(2, "0")).join("")
    : undefined;
  const keyCount = model.layouts?.[model.selectedPhysicalLayoutIndex]?.keys.length ?? 0;
  const layerCount = model.keymap?.layers.length ?? 0;

  const NAV: { id: NavId; label: string; icon: React.ReactNode }[] = [
    { id: "keyboard", label: t("carbon.nav.quick", "Quick settings"), icon: <Gauge size={16} /> },
    { id: "layers", label: t("carbon.nav.map", "Map"), icon: <Layers size={16} /> },
    { id: "behaviors", label: t("carbon.nav.behaviors", "Behaviors"), icon: <Zap size={16} /> },
    { id: "lighting", label: t("carbon.nav.lighting", "Lighting"), icon: <Lightbulb size={16} /> },
    { id: "combos", label: t("carbon.nav.combos", "Combos"), icon: <Link2 size={16} /> },
    { id: "settings", label: t("carbon.nav.settings", "Settings"), icon: <Settings size={16} /> },
  ];
  const currentNav = NAV.find((n) => n.id === activeNav)!;

  // Breadcrumb: App > Section > (Layer). Non-leaf crumbs are clickable.
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

  const navItemStyle = (active: boolean): React.CSSProperties => ({
    width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "0 16px", height: 40, textAlign: "left", cursor: "pointer",
    background: active ? th.selectedBg : "transparent",
    color: active ? th.textPrimary : th.textSecondary,
    // `border` must precede `borderLeft` or the shorthand wipes the accent.
    border: "none", borderLeft: `3px solid ${active ? th.selectedBorder : "transparent"}`,
    fontFamily: "var(--font-sans)", transition: "background 0.1s",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", width: "100vw", overflow: "hidden", fontFamily: "var(--font-sans)", background: th.bg, color: th.textPrimary }}>

      {/* ── Header ── */}
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, height: 48, padding: "0 16px", background: th.headerBg, borderBottom: `1px solid ${th.border}`, flexShrink: 0, zIndex: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, minWidth: 0 }}>
          <button onClick={() => setSidebarCollapsed((v) => !v)} style={iconBtn(th)}>
            {sidebarCollapsed ? <ChevronRight size={16} /> : <X size={16} />}
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, minWidth: 0 }}>
            <div style={{ width: 20, height: 20, background: th.interactive, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <KeyboardIcon size={12} color="#fff" />
            </div>
            <span style={{ fontSize: 14, fontWeight: 600, color: th.textPrimary, whiteSpace: "nowrap" }}>ZMK Studio</span>
            <span style={{ fontSize: 14, color: th.textDisabled, flexShrink: 0 }}>/</span>
            <button onClick={props.onSwitchDevice} title={t("carbon.switchDevice", "Switch device")}
              style={{ fontSize: 14, color: th.textSecondary, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "var(--font-sans)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160, textAlign: "left" }}>
              {deviceName}
            </button>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, minWidth: 0 }}>
          {unsaved && (
            <>
              <button onClick={props.onDiscard}
                style={{ display: "flex", alignItems: "center", padding: "0 16px", height: 32, background: "transparent", color: th.error, border: `1px solid ${th.error}`, cursor: "pointer", fontSize: 14, fontFamily: "var(--font-sans)", flexShrink: 0, whiteSpace: "nowrap" }}>
                {t("common.discard")}
              </button>
              <button onClick={handleSave} disabled={saving}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 16px", height: 32, background: th.interactive, color: "#fff", border: "none", cursor: saving ? "default" : "pointer", opacity: saving ? 0.7 : 1, fontSize: 14, fontFamily: "var(--font-sans)", flexShrink: 0, whiteSpace: "nowrap" }}>
                <Save size={14} />{saving ? t("carbon.saving", "Saving…") : t("carbon.saveToKeyboard", "Save to keyboard")}
              </button>
            </>
          )}
          <div style={{ width: 1, height: 16, background: th.border, margin: "0 8px", flexShrink: 0 }} />
          <button onClick={props.onUndo} disabled={!props.canUndo} title={t("carbon.undo", "Undo")} style={iconBtn(th, !props.canUndo)}><Undo2 size={15} /></button>
          <button onClick={props.onRedo} disabled={!props.canRedo} title={t("carbon.redo", "Redo")} style={iconBtn(th, !props.canRedo)}><Redo2 size={15} /></button>
          <div style={{ width: 1, height: 16, background: th.border, margin: "0 8px", flexShrink: 0 }} />
          <button onClick={toggle} title={isDark ? t("carbon.lightTheme", "Light") : t("carbon.darkTheme", "Dark")} style={iconBtn(th)}>
            {isDark ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <button onClick={props.onDisconnect} title={t("carbon.disconnect", "Disconnect")} style={iconBtn(th)}><LogOut size={15} /></button>
        </div>
      </header>

      {/* ── Body ── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* Primary sidebar — fixed-width inner box so content doesn't reflow
            (jitter) while the nav animates between 0 and 220px. */}
        <nav style={{ width: sidebarCollapsed ? 0 : 220, flexShrink: 0, overflow: "hidden", background: th.layer1, borderRight: sidebarCollapsed ? "none" : `1px solid ${th.border}`, transition: "width 0.2s" }}>
          <div style={{ width: 220, height: "100%", display: "flex", flexDirection: "column", overflowY: "auto" }} className="custom-scrollbar">
            <div style={{ padding: "20px 16px 8px", fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: th.textHelper }}>{t("carbon.config", "CONFIGURATION")}</div>
            <div style={{ flex: 1 }}>
              {NAV.map((item) => {
                const active = activeNav === item.id;
                return (
                  <button key={item.id} onClick={() => goToNav(item.id)} style={navItemStyle(active)}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ color: active ? th.interactive : th.iconSecondary }}>{item.icon}</span>
                      <span style={{ fontSize: 14, fontWeight: active ? 500 : 400 }}>{item.label}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </nav>

        {/* Main column */}
        <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: th.bg }}>
          {/* Breadcrumb bar */}
          <div style={{ display: "flex", alignItems: "center", padding: "0 24px", height: 40, background: th.breadcrumbBg, borderBottom: `1px solid ${th.border}`, flexShrink: 0, gap: 6, fontSize: 12, color: th.textHelper }}>
            {crumbs.map((c, i) => {
              const last = i === crumbs.length - 1;
              return (
                <span key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {i > 0 && <ChevronRight size={11} style={{ color: th.iconSecondary }} />}
                  {last || !c.onClick ? (
                    <span style={{ color: th.textPrimary, fontWeight: 500 }}>{c.label}</span>
                  ) : (
                    <button onClick={c.onClick}
                      style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: th.textHelper, fontSize: 12, fontFamily: "var(--font-sans)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = th.linkPrimary)}
                      onMouseLeave={(e) => (e.currentTarget.style.color = th.textHelper)}>
                      {c.label}
                    </button>
                  )}
                </span>
              );
            })}
          </div>

          <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 0 }}>
            {!isUnlocked ? (
              <LockedNotice th={th} t={t} />
            ) : activeNav === "layers" ? (
              <LayersView model={model} th={th} t={t} deviceName={deviceName} />
            ) : activeNav === "lighting" ? (
              <LightingView model={model} th={th} t={t} />
            ) : activeNav === "behaviors" ? (
              <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
                <OtherPanel behaviors={model.behaviorList} th={th} getConfig={holdTap.getConfig} applyConfig={holdTap.applyConfig} />
              </div>
            ) : activeNav === "keyboard" ? (
              <QuickSettingsView model={model} th={th} t={t} deviceName={deviceName} serial={serialHex}
                setting={setting} setSetting={setSetting} lang={i18n.language} setLang={(l) => i18n.changeLanguage(l)}
                defaultNav={defaultNav} setDefaultNav={setDefaultNav}
                navOptions={NAV.map((n) => ({ id: n.id, label: n.label }))} />
            ) : activeNav === "settings" ? (
              <SettingsView th={th} t={t} setting={setting} setSetting={setSetting} lang={i18n.language} setLang={(l) => i18n.changeLanguage(l)}
                defaultNav={defaultNav} setDefaultNav={setDefaultNav}
                navOptions={NAV.map((n) => ({ id: n.id, label: n.label }))}
                onShowAbout={props.onShowAbout} onShowLicense={props.onShowLicense} onResetSettings={props.onResetSettings} />
            ) : activeNav === "combos" ? (
              <CombosPlaceholder th={th} t={t} />
            ) : null}
          </div>
        </main>
      </div>

      {/* ── Status bar ── */}
      <footer style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 32, padding: "0 16px", background: th.statusBg, borderTop: `1px solid ${th.border}`, flexShrink: 0, fontSize: 12, fontFamily: "var(--font-mono)" }}>
        <span style={{
          display: "inline-flex", alignItems: "center", height: 20, padding: "0 8px",
          fontSize: 11, fontWeight: 500, fontFamily: "var(--font-sans)",
          background: th.successBg, color: th.success,
        }}>
          {props.connectionType === "BLE"
            ? t("carbon.statusBle", "BLE")
            : t("carbon.statusUsb", "USB")}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 16, color: th.textHelper }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5, color: unsaved ? th.warning : th.textHelper }}>
            {unsaved && <div style={{ width: 5, height: 5, borderRadius: "50%", background: th.warning }} />}
            {unsaved ? t("carbon.unsavedMark", "Unsaved changes *") : t("carbon.allSaved", "All changes saved")}
          </span>
          {keyCount > 0 && (
            <span>{keyCount} {t("carbon.keysUnit", "keys")} / {layerCount} {t("carbon.layersUnit", "layers")}</span>
          )}
        </div>
      </footer>

      {/* Toast — action feedback (auto-dismisses) */}
      {toast && (
        <div style={{ position: "fixed", right: 16, bottom: 44, zIndex: 50, display: "flex", alignItems: "flex-start", gap: 12, minWidth: 260, maxWidth: 360, padding: "12px 14px", background: toast.type === "success" ? th.successBg : th.errorBg, borderLeft: `3px solid ${toast.type === "success" ? th.success : th.error}`, boxShadow: "0 2px 8px rgba(0,0,0,0.25)" }} className="animate-fade-in">
          <span style={{ color: toast.type === "success" ? th.success : th.error, flexShrink: 0, marginTop: 1, display: "flex" }}>
            {toast.type === "success" ? <Check size={16} /> : <X size={16} />}
          </span>
          <span style={{ flex: 1, fontSize: 13, color: th.textPrimary }}>{toast.title}</span>
          <button onClick={() => setToast(null)} style={{ background: "none", border: "none", cursor: "pointer", color: th.iconSecondary, padding: 0, display: "flex" }}>
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

function LockedNotice({ th, t }: { th: CarbonTheme; t: (k: string, d: string) => string }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, textAlign: "center" }}>
      <Lock size={40} style={{ color: th.warning }} />
      <div style={{ fontSize: 16, fontWeight: 600, color: th.textPrimary }}>{t("carbon.lockedTitle", "Keyboard locked")}</div>
      <div style={{ fontSize: 13, color: th.textHelper, maxWidth: 340 }}>{t("carbon.lockedDesc", "Press the studio-unlock key combo on your keyboard to edit.")}</div>
    </div>
  );
}
