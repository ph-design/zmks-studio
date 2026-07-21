import { useEffect } from "react";
import { Sun, Lightbulb, Lock, Wifi, Layers } from "lucide-react";

import type { CarbonTheme } from "./theme";
import { useKeyboardModel } from "./useKeyboardModel";
import LightingControl, { type LightSource } from "../lighting/LightingControl";
import LayerLedMap from "../lighting/LayerLedMap";
import { Loading } from "./CarbonChrome";

interface LightingViewProps {
  model: ReturnType<typeof useKeyboardModel>;
  th: CarbonTheme;
  t: (k: string, d: string) => string;
}

export function LightingView({ model, th, t }: LightingViewProps) {
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
  }, [currentSource, model, sources.length]);

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
