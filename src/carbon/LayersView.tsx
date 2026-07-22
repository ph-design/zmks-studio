import { useState } from "react";
import {
  ChevronUp, ChevronDown, Keyboard as KeyboardIcon, Layers,
  Plus, Trash2, Pencil, Check, X, Lock, Unlock, Copy,
} from "lucide-react";

import type { CarbonTheme } from "./theme";
import { useKeyboardModel } from "./useKeyboardModel";
import { usePressedKeys } from "./usePressedKeys";
import { useLocalStorageState } from "../misc/useLocalStorageState";
import { Keymap as KeymapComp } from "../keyboard/Keymap";
import { BehaviorBindingPicker } from "../behaviors/BehaviorBindingPicker";
import { PhysicalLayoutPicker } from "../keyboard/PhysicalLayoutPicker";
import { Loading, ZoomControl, rowIcon } from "./CarbonChrome";

interface LayersViewProps {
  model: ReturnType<typeof useKeyboardModel>;
  th: CarbonTheme;
  t: (k: string, d: string) => string;
  deviceName: string;
}

export function LayersView({ model, th, t, deviceName }: LayersViewProps) {
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
            const layerLabel = l.name || `${t("carbon.layer", "Layer")} ${idx}`;
            const duping = model.duplicateProgress?.layerIndex === idx;

            return (
              <div key={l.id}
                style={{ position: "relative", display: "flex", alignItems: "center", gap: 4, minHeight: 44, paddingRight: 10, background: active ? th.selectedLayer : "transparent", borderLeft: `3px solid ${active || duping ? th.interactive : "transparent"}` }}>
                {editing ? (
                  <input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { model.changeLayerName(l.id, l.name || "", editName); setEditIdx(null); }
                      if (e.key === "Escape") setEditIdx(null);
                    }}
                    style={{ flex: 1, minWidth: 0, height: 28, margin: "0 6px 0 12px", padding: "0 6px", fontSize: 13, background: th.fieldBg, border: `1px solid ${th.interactive}`, color: th.textPrimary, outline: "none", fontFamily: "var(--font-sans)" }} />
                ) : (
                  // Real button so the row is Tab-focusable and Enter/Space works.
                  <button onClick={() => model.setSelectedLayerIndex(idx)} aria-pressed={active} title={layerLabel}
                    style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8, height: 44, padding: "0 8px 0 9px", background: "none", border: "none", cursor: "pointer", textAlign: "left", fontFamily: "var(--font-sans)" }}>
                    <span style={{ width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, background: active || duping ? th.interactive : th.layer2, color: active || duping ? "#fff" : th.textHelper, fontFamily: "var(--font-mono)", flexShrink: 0 }}>{idx}</span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: active ? th.textPrimary : th.textSecondary, fontWeight: active ? 500 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {duping ? t("carbon.copying", "Copying…") : layerLabel}
                    </span>
                  </button>
                )}
                {editing ? (
                  <button title={t("carbon.rename", "Rename")} onClick={() => { model.changeLayerName(l.id, l.name || "", editName); setEditIdx(null); }} style={rowIcon(th)}><Check size={14} /></button>
                ) : (
                  <>
                    {locked && <Lock size={11} style={{ color: th.textDisabled, flexShrink: 0 }} />}
                    {/* Only rename on the row; copy/lock/delete live at the bottom */}
                    <button title={t("carbon.rename", "Rename")} onClick={() => { setEditIdx(idx); setEditName(l.name || ""); }} style={rowIcon(th)}><Pencil size={13} /></button>
                  </>
                )}
                {duping && model.duplicateProgress && (
                  <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 2, background: th.border, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.round((model.duplicateProgress.done / model.duplicateProgress.total) * 100)}%`, background: th.interactive, transition: "width 0.3s ease" }} />
                  </div>
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
            {bottomAction(<ChevronUp size={13} />, t("carbon.moveLayerUp", "Move up"), () => model.moveLayer(model.selectedLayerIndex, model.selectedLayerIndex - 1), { disabled: model.selectedLayerIndex <= 0 })}
            {bottomAction(<ChevronDown size={13} />, t("carbon.moveLayerDown", "Move down"), () => model.moveLayer(model.selectedLayerIndex, model.selectedLayerIndex + 1), { disabled: model.selectedLayerIndex >= km.layers.length - 1 })}
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
            <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: th.textHelper, fontWeight: 600 }}>{t("carbon.physicalLayout", "Layout")}</span>
            <PhysicalLayoutPicker layouts={model.layouts} selectedPhysicalLayoutIndex={model.selectedPhysicalLayoutIndex} onPhysicalLayoutClicked={model.doSelectPhysicalLayout} />
          </div>
        )}

        <div style={{ position: "relative", flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, overflow: "auto", minHeight: 0 }}
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
          <ZoomControl th={th} t={t} scale={model.keymapScale} setScale={model.setKeymapScale} />
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
