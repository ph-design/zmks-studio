import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronRight, Keyboard as KeyboardIcon, Layers, Zap, Link2,
  Settings, Sun, Moon, Save, Undo2, Redo2, RotateCcw, LogOut,
  Plus, Trash2, Pencil, Check, X, Lock, Unlock, Copy, Cpu, Info, FileText, Lightbulb, Wifi, Gauge,
} from "lucide-react";

import { LockState } from "@zmkfirmware/zmk-studio-ts-client/core";
import { LockStateContext } from "../rpc/LockStateContext";
import { useConnectedDeviceData } from "../rpc/useConnectedDeviceData";
import { useSub } from "../usePubSub";
import { useLocalStorageState } from "../misc/useLocalStorageState";

import { useCarbonTheme, type CarbonTheme } from "./theme";
import { useKeyboardModel } from "./useKeyboardModel";
import { usePressedKeys } from "./usePressedKeys";

import { Keymap as KeymapComp } from "../keyboard/Keymap";
import { BehaviorBindingPicker } from "../behaviors/BehaviorBindingPicker";
import { OtherPanel } from "../keyboard/OtherPanel";
import { PhysicalLayoutPicker } from "../keyboard/PhysicalLayoutPicker";
import LightingControl, { type LightSource } from "../lighting/LightingControl";
import LayerLedMap from "../lighting/LayerLedMap";

type NavId = "keyboard" | "layers" | "behaviors" | "lighting" | "combos" | "settings";

export interface CarbonShellProps {
  carbon: ReturnType<typeof useCarbonTheme>;
  connectedDeviceName?: string;
  onDisconnect: () => void;
  onResetSettings: () => void;
  onSave: () => void;
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

  const goToNav = (id: NavId) => {
    setActiveNav(id);
    model.setSelectedKeyPosition(undefined);
  };

  const [deviceInfo] = useConnectedDeviceData<{ name: string }>(
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

  const deviceName = deviceInfo?.name || props.connectedDeviceName || "Keyboard";
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
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <div style={{ width: 20, height: 20, background: th.interactive, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <KeyboardIcon size={12} color="#fff" />
            </div>
            <span style={{ fontSize: 14, fontWeight: 600, color: th.textPrimary }}>ZMK Studio</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 10px", fontSize: 12, background: th.successBg, border: `1px solid ${th.success}`, color: th.success, minWidth: 0, overflow: "hidden", whiteSpace: "nowrap" }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{deviceName}</span>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: th.success, flexShrink: 0 }} />
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4, minWidth: 0 }}>
          {unsaved && (
            <button onClick={props.onSave} style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 12px", height: 32, background: th.interactive, color: "#fff", border: "none", cursor: "pointer", fontSize: 13, fontFamily: "var(--font-sans)", marginRight: 4, flexShrink: 0, whiteSpace: "nowrap" }}>
              <Save size={13} />{t("carbon.saveToKeyboard", "Save to keyboard")}
            </button>
          )}
          <button onClick={props.onUndo} disabled={!props.canUndo} title={t("carbon.undo", "Undo")} style={iconBtn(th, !props.canUndo)}><Undo2 size={15} /></button>
          <button onClick={props.onRedo} disabled={!props.canRedo} title={t("carbon.redo", "Redo")} style={iconBtn(th, !props.canRedo)}><Redo2 size={15} /></button>
          <div style={{ width: 1, height: 16, background: th.border, margin: "0 4px" }} />
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
                <OtherPanel behaviors={model.behaviorList} th={th} />
              </div>
            ) : activeNav === "keyboard" ? (
              <QuickSettingsView model={model} th={th} t={t} deviceName={deviceName}
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
      <footer style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 28, padding: "0 16px", background: th.statusBg, borderTop: `1px solid ${th.border}`, flexShrink: 0, fontSize: 11, fontFamily: "var(--font-mono)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5, color: th.success }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: th.success }} />
            {t("carbon.statusConnected", "Device connected")}
          </span>
          <span style={{ color: th.textHelper }}>{deviceName}</span>
        </div>
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
    </div>
  );
}

function iconBtn(th: CarbonTheme, disabled?: boolean): React.CSSProperties {
  return { width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: disabled ? "default" : "pointer", color: disabled ? th.textDisabled : th.textSecondary };
}

// ─── Locked notice ────────────────────────────────────────────────────────────
function LockedNotice({ th, t }: { th: CarbonTheme; t: (k: string, d: string) => string }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, textAlign: "center" }}>
      <Lock size={40} style={{ color: th.warning }} />
      <div style={{ fontSize: 16, fontWeight: 600, color: th.textPrimary }}>{t("carbon.lockedTitle", "Keyboard locked")}</div>
      <div style={{ fontSize: 13, color: th.textHelper, maxWidth: 340 }}>{t("carbon.lockedDesc", "Press the studio-unlock key combo on your keyboard to edit.")}</div>
    </div>
  );
}

// ─── Layers view (secondary sidebar + canvas + binding drawer) ─────────────────
function LayersView({ model, th, t, deviceName }: { model: ReturnType<typeof useKeyboardModel>; th: CarbonTheme; t: (k: string, d: string) => string; deviceName: string }) {
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  // Frontend-only "soft lock": marks a layer read-only in the UI. Not a ZMK
  // firmware feature — it only gates editing in this client, no backend calls.
  // Persisted per device (keyed by name) so locks survive reloads.
  const [lockedMap, setLockedMap] = useLocalStorageState<Record<string, number[]>>(
    "zmk-studio-locked-layers",
    {},
    { deserialize: (s) => JSON.parse(s) }
  );
  // Live input feedback: highlight on-screen keys as they're physically pressed.
  const pressedUsages = usePressedKeys(true);
  const km = model.keymap;

  if (!model.dataReady || !km || !model.layouts) {
    return <Loading th={th} t={t} />;
  }

  const canAdd = (km.availableLayers || 0) > 0;
  const currentLayer = km.layers[model.selectedLayerIndex];
  const lockedIds = new Set(lockedMap[deviceName] || []);
  const currentLocked = currentLayer ? lockedIds.has(currentLayer.id) : false;

  const toggleLock = (id: number) =>
    setLockedMap((prev) => {
      const set = new Set(prev[deviceName] || []);
      set.has(id) ? set.delete(id) : set.add(id);
      return { ...prev, [deviceName]: Array.from(set) };
    });

  const bottomAction = (icon: React.ReactNode, label: string, onClick: () => void, opts?: { color?: string; disabled?: boolean }) => (
    <button onClick={opts?.disabled ? undefined : onClick} disabled={opts?.disabled}
      style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 16px", fontSize: 12, color: opts?.disabled ? th.textDisabled : (opts?.color || th.textSecondary), background: "none", border: "none", cursor: opts?.disabled ? "default" : "pointer", fontFamily: "var(--font-sans)", textAlign: "left" }}>
      {icon}{label}
    </button>
  );

  return (
    <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
      {/* Secondary sidebar: layer list */}
      <aside style={{ width: 210, flexShrink: 0, display: "flex", flexDirection: "column", background: th.railBg, borderRight: `1px solid ${th.border}` }}>
        <div style={{ padding: "12px 16px", background: th.layer1, borderBottom: `1px solid ${th.border}`, display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <Layers size={16} style={{ color: th.interactive }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: th.textPrimary }}>{t("carbon.nav.layers", "Layers")}</span>
          <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 11, color: th.textHelper }}>{km.layers.length}</span>
        </div>

        {/* Scrollable list + dashed add box */}
        <div style={{ flex: 1, overflowY: "auto" }} className="custom-scrollbar">
          {km.layers.map((l, idx) => {
            const active = idx === model.selectedLayerIndex;
            const editing = editIdx === idx;
            const locked = lockedIds.has(l.id);
            return (
              <div key={l.id}
                onClick={() => !editing && model.setSelectedLayerIndex(idx)}
                style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44, padding: "0 12px", cursor: "pointer", background: active ? th.selectedLayer : "transparent", borderLeft: `3px solid ${active ? th.interactive : "transparent"}` }}>
                <div style={{ width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, background: active ? th.interactive : th.layer2, color: active ? "#fff" : th.textHelper, fontFamily: "var(--font-mono)", flexShrink: 0 }}>{idx}</div>
                {editing ? (
                  <input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { model.changeLayerName(l.id, l.name || "", editName); setEditIdx(null); }
                      if (e.key === "Escape") setEditIdx(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    style={{ flex: 1, minWidth: 0, height: 28, padding: "0 6px", fontSize: 13, background: th.fieldBg, border: `1px solid ${th.interactive}`, color: th.textPrimary, outline: "none", fontFamily: "var(--font-sans)" }} />
                ) : (
                  <span style={{ flex: 1, fontSize: 13, color: active ? th.textPrimary : th.textSecondary, fontWeight: active ? 500 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {l.name || `${t("carbon.layer", "Layer")} ${idx}`}
                  </span>
                )}
                {editing ? (
                  <button onClick={(e) => { e.stopPropagation(); model.changeLayerName(l.id, l.name || "", editName); setEditIdx(null); }} style={rowIcon(th)}><Check size={14} /></button>
                ) : (
                  <span style={{ display: "flex", gap: 2, alignItems: "center" }} onClick={(e) => e.stopPropagation()}>
                    {locked && <Lock size={11} style={{ color: th.textDisabled }} />}
                    {/* Only rename on the row; copy/lock/delete live at the bottom */}
                    <button title={t("carbon.rename", "Rename")} onClick={() => { setEditIdx(idx); setEditName(l.name || ""); }} style={rowIcon(th)}><Pencil size={13} /></button>
                  </span>
                )}
              </div>
            );
          })}

          {/* Dashed "add layer" box below the last layer */}
          {canAdd && (
            <button onClick={model.addLayer}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "calc(100% - 24px)", margin: "10px 12px", padding: "10px 12px", fontSize: 13, color: th.textHelper, background: "none", border: `1px dashed ${th.borderStrong}`, cursor: "pointer", fontFamily: "var(--font-sans)" }}>
              <Plus size={13} />{t("carbon.addLayer", "Add layer")}
            </button>
          )}
        </div>

        {/* Bottom action bar for the selected layer */}
        {currentLayer && (
          <div style={{ borderTop: `1px solid ${th.border}`, padding: "6px 0", flexShrink: 0 }}>
            {bottomAction(<Copy size={13} />, t("carbon.duplicateLayer", "Duplicate layer"), model.duplicateLayer, { disabled: !canAdd })}
            {bottomAction(
              currentLocked ? <Unlock size={13} /> : <Lock size={13} />,
              currentLocked ? t("carbon.unlockLayer", "Unlock layer") : t("carbon.lockLayer", "Lock layer"),
              () => toggleLock(currentLayer.id)
            )}
            {bottomAction(<Trash2 size={13} />, t("carbon.deleteLayer", "Delete layer"), () => model.removeLayer(), { color: th.error, disabled: km.layers.length <= 1 })}
          </div>
        )}
      </aside>

      {/* Canvas + binding drawer */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0 }}>
        {/* Layout picker strip (only when multiple layouts) */}
        {model.layouts.length > 1 && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 24px", borderBottom: `1px solid ${th.border}`, flexShrink: 0 }}>
            <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: th.textHelper, fontWeight: 600 }}>{t("carbon.model", "Model")}</span>
            <PhysicalLayoutPicker layouts={model.layouts} selectedPhysicalLayoutIndex={model.selectedPhysicalLayoutIndex} onPhysicalLayoutClicked={model.doSelectPhysicalLayout} />
          </div>
        )}

        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, overflow: "auto", minHeight: 0 }}
          onClick={(e) => { if (!(e.target as HTMLElement).closest("button")) model.setSelectedKeyPosition(undefined); }}>
          <KeymapComp
            keymap={km}
            layout={model.layouts[model.selectedPhysicalLayoutIndex]}
            behaviors={model.behaviors}
            scale={model.keymapScale}
            selectedLayerIndex={model.selectedLayerIndex}
            selectedKeyPosition={model.selectedKeyPosition}
            pressedUsages={currentLocked ? undefined : pressedUsages}
            onKeyPositionClicked={currentLocked ? () => {} : model.setSelectedKeyPosition}
          />
        </div>

        {/* Binding drawer — always expanded, fixed height, so the canvas layout
            never jumps and the picker keeps a definite height for full dividers. */}
        <div style={{ flexShrink: 0, height: 380, borderTop: `1px solid ${th.border}`, background: th.layer1, display: "flex", flexDirection: "column", minHeight: 0 }}>
          {/* Compact single-line header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 36, padding: "0 8px 0 16px", borderBottom: `1px solid ${th.border}`, flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              {model.selectedKeyPosition !== undefined ? (
                <>
                  <span style={{ minWidth: 20, height: 18, padding: "0 5px", display: "flex", alignItems: "center", justifyContent: "center", background: th.interactive, color: "#fff", fontSize: 10, fontWeight: 700, fontFamily: "var(--font-mono)", flexShrink: 0 }}>
                    {model.selectedKeyPosition}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: th.textPrimary }}>{t("carbon.editBinding", "Edit binding")}</span>
                  <span style={{ fontSize: 12, color: th.textHelper, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    · {currentLayer?.name || `${t("carbon.layer", "Layer")} ${model.selectedLayerIndex}`}
                  </span>
                </>
              ) : (
                <span style={{ fontSize: 12, fontWeight: 600, color: th.textHelper }}>{t("carbon.editBinding", "Edit binding")}</span>
              )}
            </div>
            {model.selectedKeyPosition !== undefined && !currentLocked && (
              <button onClick={() => model.setSelectedKeyPosition(undefined)} title={t("carbon.close", "Close")} style={rowIcon(th)}><X size={15} /></button>
            )}
          </div>
          {/* Body */}
          <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
            {currentLocked ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 12, color: th.textHelper }}>
                <Lock size={13} />{t("carbon.layerLockedHint", "This layer is locked. Unlock it to edit bindings.")}
              </div>
            ) : model.selectedBinding ? (
              <BehaviorBindingPicker
                binding={model.selectedBinding}
                behaviors={model.behaviorList}
                layers={km.layers.map(({ id, name }, li) => ({ id, name: name || li.toLocaleString() }))}
                onBindingChanged={model.doUpdateBinding}
              />
            ) : (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, color: th.textDisabled }}>
                <KeyboardIcon size={28} style={{ opacity: 0.5 }} />
                <span style={{ fontSize: 12 }}>{t("carbon.clickKeyHint", "Click any key to edit its binding")}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Lighting view (source rail + canvas + control panel) ──────────────────────
function LightingView({ model, th, t }: { model: ReturnType<typeof useKeyboardModel>; th: CarbonTheme; t: (k: string, d: string) => string }) {
  const km = model.keymap;

  // Light sources become a Layers-style left rail; only available ones show.
  const allSources: { id: LightSource; label: string; icon: React.ReactNode; has: boolean }[] = [
    { id: "rgb", label: t("lighting.rgbUnderglow", "RGB Underglow"), icon: <Sun size={16} />, has: model.hasRgb },
    { id: "backlight", label: t("lighting.backlight", "Backlight"), icon: <Lightbulb size={16} />, has: model.hasBacklight },
    { id: "capslock", label: t("lighting.capsLock.title", "Caps Lock"), icon: <Lock size={16} />, has: model.hasCapsLock },
    { id: "connection", label: t("lighting.connection.title", "Connection"), icon: <Wifi size={16} />, has: model.hasConnection },
    { id: "layerLed", label: t("lighting.layerLed.title", "Layer LED"), icon: <Layers size={16} />, has: model.hasLayerLed },
  ];
  const sources = allSources.filter((s) => s.has);

  const currentSource = sources.some((s) => s.id === model.lightingSource)
    ? (model.lightingSource as LightSource)
    : sources[0]?.id;

  // Keep the model's source valid when the current one isn't available.
  useEffect(() => {
    if (sources.length > 0 && model.lightingSource !== currentSource && currentSource) {
      model.handleLightingSourceChanged(currentSource);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSource, model.lightingSource, sources.length]);

  if (!model.dataReady || !km || !model.layouts) return <Loading th={th} t={t} />;

  return (
    <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
      {/* Left source rail */}
      <aside style={{ width: 210, flexShrink: 0, display: "flex", flexDirection: "column", background: th.railBg, borderRight: `1px solid ${th.border}` }}>
        <div style={{ padding: "12px 16px", background: th.layer1, borderBottom: `1px solid ${th.border}`, display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <Lightbulb size={16} style={{ color: th.interactive }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: th.textPrimary }}>{t("carbon.nav.lighting", "Lighting")}</span>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }} className="custom-scrollbar">
          {sources.map((s) => {
            const active = s.id === currentSource;
            return (
              <button key={s.id} onClick={() => model.handleLightingSourceChanged(s.id)}
                style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", minHeight: 44, padding: "0 14px", cursor: "pointer", textAlign: "left", background: active ? th.selectedLayer : "transparent", border: "none", borderLeft: `3px solid ${active ? th.interactive : "transparent"}`, fontFamily: "var(--font-sans)" }}>
                <span style={{ color: active ? th.interactive : th.iconSecondary, display: "flex", flexShrink: 0 }}>{s.icon}</span>
                <span style={{ fontSize: 14, fontWeight: active ? 500 : 400, color: active ? th.textPrimary : th.textSecondary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.label}</span>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Main: LED canvas + control drawer */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0 }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, overflow: "auto", minHeight: 0 }}>
          <LayerLedMap
            keymap={km}
            layout={model.layouts[model.selectedPhysicalLayoutIndex]}
            scale={model.keymapScale}
            selectedLayerIndex={model.selectedLayerIndex}
            ledData={model.ledData}
            selectedPositions={model.selectedLedPositions}
            onSelectionChanged={(sel) => { if (!model.handleIndicatorPick(sel)) model.setSelectedLedPositions(sel); }}
            indicatorPositions={model.indicatorPositions}
            activeSource={model.lightingSource}
          />
        </div>
        <div style={{ flexShrink: 0, height: 360, borderTop: `1px solid ${th.border}`, background: th.layer1, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <LightingControl
            selectedSource={currentSource ?? "rgb"}
            hasLayerLed={model.hasLayerLed}
            selectedLedPositions={model.selectedLedPositions}
            ledData={model.ledData}
            selectedLayerIndex={model.selectedLayerIndex}
            keymap={km}
            onLayerLedColorChanged={model.handleLayerLedColorChanged}
            layerLedEnabled={model.ledData?.enabled ?? true}
            onLayerLedEnabledChanged={model.handleLayerLedEnabledChanged}
            rgbState={model.rgbState}
            setRgbState={model.setRgbState}
            backlightState={model.backlightState}
            setBacklightState={model.setBacklightState}
            capsLockState={model.capsLockState}
            setCapsLockState={model.setCapsLockState}
            connectionState={model.connectionState}
            setConnectionState={model.setConnectionState}
            hasRgb={model.hasRgb}
            hasBacklight={model.hasBacklight}
            hasCapsLock={model.hasCapsLock}
            hasConnection={model.hasConnection}
            indicatorPositionDraft={model.indicatorPositionDraft}
            onClearIndicator={() => model.setIndicatorPositionDraft(undefined)}
            onLightingChanged={model.onLightingChanged}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Quick settings (device info + a few streamlined controls) ─────────────────
function QuickSettingsView({ model, th, t, deviceName, setting, setSetting, lang, setLang, defaultNav, setDefaultNav, navOptions }: {
  model: ReturnType<typeof useKeyboardModel>; th: CarbonTheme; t: (k: string, d: string) => string; deviceName: string;
  setting: string; setSetting: (s: "dark" | "light" | "system") => void;
  lang: string; setLang: (l: string) => void;
  defaultNav: NavId; setDefaultNav: (n: NavId) => void;
  navOptions: { id: NavId; label: string }[];
}) {
  const rows: [string, string][] = [
    [t("carbon.deviceName", "Device name"), deviceName],
    [t("carbon.layoutCount", "Physical layouts"), String(model.layouts?.length ?? 0)],
    [t("carbon.layerCount", "Layers"), String(model.keymap?.layers.length ?? 0)],
  ];
  const seg = (opts: { id: string; label: string }[], value: string, onChange: (v: string) => void) => (
    <div style={{ display: "inline-flex", border: `1px solid ${th.borderStrong}` }}>
      {opts.map((o, i) => (
        <button key={o.id} onClick={() => onChange(o.id)}
          style={{ padding: "7px 14px", fontSize: 13, cursor: "pointer", border: "none", borderLeft: i ? `1px solid ${th.border}` : "none", background: value === o.id ? th.interactive : th.fieldBg, color: value === o.id ? "#fff" : th.textSecondary, fontFamily: "var(--font-sans)" }}>
          {o.label}
        </button>
      ))}
    </div>
  );
  const block = (label: string, node: React.ReactNode) => (
    <div style={{ padding: "16px 0", borderBottom: `1px solid ${th.border}` }}>
      <div style={{ fontSize: 14, color: th.textPrimary, fontWeight: 500, marginBottom: 8 }}>{label}</div>
      {node}
    </div>
  );
  return (
    <div style={{ flex: 1, overflow: "auto", padding: 24, maxWidth: 560 }} className="custom-scrollbar">
      {/* Device summary */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{ width: 48, height: 48, background: th.layer2, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Cpu size={24} style={{ color: th.interactive }} />
        </div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 600, color: th.textPrimary }}>{deviceName}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3, fontSize: 12, color: th.success }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: th.success }} />
            {t("carbon.statusConnected", "Device connected")}
          </div>
        </div>
      </div>
      <div style={{ border: `1px solid ${th.border}` }}>
        {rows.map(([k, v], i) => (
          <div key={k} style={{ display: "flex", padding: "10px 16px", borderBottom: i < rows.length - 1 ? `1px solid ${th.border}` : "none", background: i % 2 === 0 ? th.layer1 : th.bg }}>
            <span style={{ width: 140, fontSize: 13, color: th.textHelper, flexShrink: 0 }}>{k}</span>
            <span style={{ fontSize: 13, color: th.textPrimary, fontFamily: "var(--font-mono)" }}>{v}</span>
          </div>
        ))}
      </div>

      {model.layouts && model.layouts.length > 1 &&
        block(t("carbon.activeLayout", "Active layout"), (
          <PhysicalLayoutPicker layouts={model.layouts} selectedPhysicalLayoutIndex={model.selectedPhysicalLayoutIndex} onPhysicalLayoutClicked={model.doSelectPhysicalLayout} />
        ))}

      {/* Quick controls — streamlined duplicates of the most-used settings */}
      <div style={{ marginTop: 8, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: th.textHelper, paddingTop: 12 }}>
        {t("carbon.quickControls", "QUICK CONTROLS")}
      </div>
      {block(t("carbon.theme", "Theme"), seg([
        { id: "system", label: t("carbon.themeSystem", "System") },
        { id: "light", label: t("carbon.lightTheme", "Light") },
        { id: "dark", label: t("carbon.darkTheme", "Dark") },
      ], setting, (v) => setSetting(v as "dark" | "light" | "system")))}
      {block(t("carbon.language", "Language"), seg([
        { id: "en", label: "English" },
        { id: "zh", label: "中文" },
      ], lang.startsWith("zh") ? "zh" : "en", setLang))}
      <div style={{ padding: "16px 0" }}>
        <div style={{ fontSize: 14, color: th.textPrimary, fontWeight: 500, marginBottom: 8 }}>{t("carbon.defaultView", "Default view")}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {navOptions.map((o) => (
            <button key={o.id} onClick={() => setDefaultNav(o.id)}
              style={{ padding: "6px 14px", fontSize: 13, cursor: "pointer", background: defaultNav === o.id ? th.interactive : th.fieldBg, color: defaultNav === o.id ? "#fff" : th.textSecondary, border: `1px solid ${defaultNav === o.id ? th.interactive : th.borderStrong}`, fontFamily: "var(--font-sans)" }}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Settings ──────────────────────────────────────────────────────────────────
function SettingsView({ th, t, setting, setSetting, lang, setLang, defaultNav, setDefaultNav, navOptions, onShowAbout, onShowLicense, onResetSettings }: {
  th: CarbonTheme; t: (k: string, d: string) => string;
  setting: string; setSetting: (s: "dark" | "light" | "system") => void;
  lang: string; setLang: (l: string) => void;
  defaultNav: NavId; setDefaultNav: (n: NavId) => void;
  navOptions: { id: NavId; label: string }[];
  onShowAbout: () => void; onShowLicense: () => void; onResetSettings: () => void;
}) {
  const seg = (opts: { id: string; label: string }[], value: string, onChange: (v: string) => void) => (
    <div style={{ display: "inline-flex", border: `1px solid ${th.borderStrong}` }}>
      {opts.map((o, i) => (
        <button key={o.id} onClick={() => onChange(o.id)}
          style={{ padding: "8px 16px", fontSize: 13, cursor: "pointer", border: "none", borderLeft: i ? `1px solid ${th.border}` : "none", background: value === o.id ? th.interactive : th.fieldBg, color: value === o.id ? "#fff" : th.textSecondary, fontFamily: "var(--font-sans)" }}>
          {o.label}
        </button>
      ))}
    </div>
  );
  const block = (label: string, node: React.ReactNode) => (
    <div style={{ padding: "16px 0", borderBottom: `1px solid ${th.border}` }}>
      <div style={{ fontSize: 14, color: th.textPrimary, fontWeight: 500, marginBottom: 8 }}>{label}</div>
      {node}
    </div>
  );
  return (
    <div style={{ flex: 1, overflow: "auto", padding: 24, maxWidth: 560 }} className="custom-scrollbar">
      <h2 style={{ fontSize: 16, fontWeight: 600, color: th.textPrimary, marginBottom: 20 }}>{t("carbon.nav.settings", "Settings")}</h2>
      {block(t("carbon.theme", "Theme"), seg([
        { id: "system", label: t("carbon.themeSystem", "System") },
        { id: "light", label: t("carbon.lightTheme", "Light") },
        { id: "dark", label: t("carbon.darkTheme", "Dark") },
      ], setting, (v) => setSetting(v as "dark" | "light" | "system")))}
      {block(t("carbon.language", "Language"), seg([
        { id: "en", label: "English" },
        { id: "zh", label: "中文" },
      ], lang.startsWith("zh") ? "zh" : "en", setLang))}
      {block(t("carbon.defaultView", "Default view"), (
        <>
          <p style={{ fontSize: 12, color: th.textHelper, marginTop: -4, marginBottom: 8 }}>
            {t("carbon.defaultViewDesc", "Which section opens when you connect a keyboard.")}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {navOptions.map((o) => (
              <button key={o.id} onClick={() => setDefaultNav(o.id)}
                style={{ padding: "6px 14px", fontSize: 13, cursor: "pointer", background: defaultNav === o.id ? th.interactive : th.fieldBg, color: defaultNav === o.id ? "#fff" : th.textSecondary, border: `1px solid ${defaultNav === o.id ? th.interactive : th.borderStrong}`, fontFamily: "var(--font-sans)" }}>
                {o.label}
              </button>
            ))}
          </div>
        </>
      ))}
      {block(t("carbon.about", "About"), (
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onShowAbout} style={secBtn(th)}><Info size={13} />{t("carbon.aboutApp", "About ZMK Studio")}</button>
          <button onClick={onShowLicense} style={secBtn(th)}><FileText size={13} />{t("carbon.license", "License")}</button>
        </div>
      ))}
      <div style={{ paddingTop: 20 }}>
        <button onClick={onResetSettings} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", fontSize: 13, background: "transparent", color: th.error, border: `1px solid ${th.error}`, cursor: "pointer", fontFamily: "var(--font-sans)" }}>
          <RotateCcw size={14} />{t("carbon.factoryReset", "Restore stock settings")}
        </button>
      </div>
    </div>
  );
}

// ─── Combos placeholder (kept per user choice, backend support TBD) ─────────────
function CombosPlaceholder({ th, t }: { th: CarbonTheme; t: (k: string, d: string) => string }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, textAlign: "center", padding: 48 }}>
      <Link2 size={40} style={{ color: th.iconSecondary, opacity: 0.6 }} />
      <div style={{ fontSize: 16, fontWeight: 600, color: th.textPrimary }}>{t("carbon.combosTitle", "Combos")}</div>
      <div style={{ fontSize: 13, color: th.textHelper, maxWidth: 340 }}>{t("carbon.combosDesc", "Combo editing is not yet wired to this firmware. Coming soon.")}</div>
    </div>
  );
}

function Loading({ th, t }: { th: CarbonTheme; t: (k: string, d: string) => string }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
      <div style={{ width: 32, height: 32, borderRadius: "50%", border: `3px solid ${th.border}`, borderTopColor: th.interactive, animation: "circular-rotate 0.8s linear infinite" }} />
      <span style={{ fontSize: 13, color: th.textHelper }}>{t("carbon.loading", "Loading…")}</span>
    </div>
  );
}

function rowIcon(th: CarbonTheme, color?: string): React.CSSProperties {
  return { width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", color: color || th.iconSecondary };
}
function secBtn(th: CarbonTheme): React.CSSProperties {
  return { display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", fontSize: 13, background: th.layer2, color: th.textPrimary, border: "none", cursor: "pointer", fontFamily: "var(--font-sans)" };
}
