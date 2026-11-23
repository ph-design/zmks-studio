import { FeatureRail } from "./FeatureRail";
import { useEffect } from "react";
import { Sun, Lightbulb, Lock, Wifi, Layers, SlidersHorizontal } from "lucide-react";

import type { CarbonTheme } from "./theme";
import { useKeyboardModel } from "./useKeyboardModel";
import LightingControl, { type LightSource } from "../lighting/LightingControl";
import { RgbGeneralControls } from "../lighting/RgbGeneralControls";
import type { useRgbGeneralDraft } from "../lighting/useRgbGeneralDraft";
import LayerLedMap from "../lighting/LayerLedMap";
import RgbEffectPreview from "../lighting/RgbEffectPreview";
import { KeyboardCanvas } from "../keyboard/KeyboardCanvas";
import { ResizableDrawer } from "./ResizableDrawer";
import { Loading, NotSupportedHint } from "./CarbonChrome";

interface LightingViewProps {
  model: ReturnType<typeof useKeyboardModel>;
  generalLighting: ReturnType<typeof useRgbGeneralDraft>;
  saving: boolean;
  th: CarbonTheme;
  t: (k: string, d: string) => string;
}

export function LightingView({ model, generalLighting, saving, th, t }: LightingViewProps) {
  const km = model.keymap;
  const rgb = model.rgbState;

  // Light sources become a Layers-style left rail; only available ones show.
  const allSources: { id: LightSource; label: string; icon: React.ReactNode; has: boolean }[] = [
    {
      id: "general",
      label: t("lighting.general.title", "General"),
      icon: <SlidersHorizontal size={16} />,
      has: !!(rgb?.fade || rgb?.idle || rgb?.layerWake),
    },
    { id: "rgb", label: t("lighting.rgbUnderglow", "RGB Underglow"), icon: <Sun size={16} />, has: model.hasRgb },
    { id: "backlight", label: t("lighting.backlight", "Backlight"), icon: <Lightbulb size={16} />, has: model.hasBacklight },
    { id: "capslock", label: t("lighting.capsLock.title", "Caps Lock"), icon: <Lock size={16} />, has: model.hasCapsLock },
    { id: "connection", label: t("lighting.connection.title", "Connection"), icon: <Wifi size={16} />, has: model.hasConnection },
    { id: "layerLed", label: t("lighting.layerLed.title", "Layer LED"), icon: <Layers size={16} />, has: model.hasLayerLed },
  ];
  const sources = allSources.filter((s) => s.has);

  const { lightingSource, lightingLoaded, handleLightingSourceChanged } = model;
  const currentSource = sources.find((source) => source.id === lightingSource)?.id ?? sources[0]?.id;

  useEffect(() => {
    if (lightingLoaded && currentSource && lightingSource !== currentSource) {
      handleLightingSourceChanged(currentSource);
    }
  }, [currentSource, lightingLoaded, lightingSource, handleLightingSourceChanged]);

  if (!model.dataReady || !lightingLoaded || !km || !model.layouts) return <Loading th={th} t={t} />;

  if (sources.length === 0) {
    return (
      <NotSupportedHint th={th}
        icon={<Lightbulb size={40} />}
        title={t("lighting.emptyTitle", "Lighting unavailable")}
        desc={t("lighting.emptyHint", "This device does not expose lighting controls. Check the hardware configuration and firmware support.")}
      />
    );
  }

  const previewScale = model.keymapScale;

  return (
    <div className="carbon-feature-page">
      {/* Left source rail */}
      <FeatureRail title={t("carbon.nav.lighting", "Lighting")} style={{ background: th.railBg, borderRight: `1px solid ${th.border}` }}>
        <div style={{ padding: "12px 16px", background: th.layer1, borderBottom: `1px solid ${th.border}`, display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <Lightbulb size={16} style={{ color: th.interactive }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: th.textPrimary }}>{t("carbon.nav.lighting", "Lighting")}</span>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }} className="custom-scrollbar">
          {sources.map((s) => {
            const active = s.id === currentSource;
            return (
              <button key={s.id} onClick={() => model.handleLightingSourceChanged(s.id)} aria-pressed={active}
                style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", minHeight: 44, padding: "0 14px", cursor: "pointer", textAlign: "left", background: active ? th.selectedLayer : "transparent", border: "none", borderLeft: `3px solid ${active ? th.interactive : "transparent"}`, fontFamily: "var(--font-sans)" }}>
                <span style={{ color: active ? th.interactive : th.iconSecondary, display: "flex", flexShrink: 0 }}>{s.icon}</span>
                <span style={{ fontSize: 14, fontWeight: active ? 500 : 400, color: active ? th.textPrimary : th.textSecondary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.label}</span>
              </button>
            );
          })}
        </div>
      </FeatureRail>

      {/* Main: LED canvas + control drawer */}
      <div className="carbon-feature-content">
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", borderBottom: `1px solid ${th.border}`, background: th.layer1, overflowX: "auto" }} className="custom-scrollbar">
          <span style={{ fontSize: 12, color: th.textSecondary, marginRight: 6, flexShrink: 0 }}>{t("carbon.nav.layers", "Layers")}</span>
          {km.layers.map((l, idx) => {
            const active = idx === model.selectedLayerIndex;
            return (
              <button key={l.id} onClick={() => model.setSelectedLayerIndex(idx)}
                style={{ flexShrink: 0, padding: "3px 10px", fontSize: 12, cursor: "pointer", border: `1px solid ${active ? th.interactive : th.border}`, background: active ? th.selectedLayer : "transparent", color: active ? th.textPrimary : th.textSecondary, fontFamily: "var(--font-sans)" }}>
                {l.name || `${t("carbon.layer", "Layer")} ${idx}`}
              </button>
            );
          })}
        </div>
        <KeyboardCanvas th={th} t={t} scale={previewScale} setScale={model.setKeymapScale}>
          {(fitContainerRef) =>
            (currentSource === "rgb" || currentSource === "general") && rgb ? (
              <RgbEffectPreview
                key={model.selectedPhysicalLayoutIndex}
                layout={model.layouts![model.selectedPhysicalLayoutIndex]}
                keymap={km}
                rgbState={rgb}
                scale={previewScale}
                ledData={model.ledData}
                selectedLayerIndex={model.selectedLayerIndex}
                fitContainerRef={fitContainerRef}
              />
            ) : (
              <LayerLedMap
                keymap={km}
                layout={model.layouts![model.selectedPhysicalLayoutIndex]}
                scale={previewScale}
                selectedLayerIndex={model.selectedLayerIndex}
                ledData={model.ledData}
                selectedPositions={model.selectedLedPositions}
                onSelectionChanged={(sel) => { if (!model.handleIndicatorPick(sel)) model.setSelectedLedPositions(sel); }}
                indicatorPositions={model.indicatorPositions}
                activeSource={model.lightingSource}
                fitContainerRef={fitContainerRef}
              />
            )
          }
        </KeyboardCanvas>
        <ResizableDrawer th={th} storageKey="zmk-studio-drawer-h-lighting">
          {currentSource === "general" ? (
            <RgbGeneralControls
              settings={generalLighting.settings}
              layers={km.layers}
              onChange={generalLighting.edit}
              saving={saving || generalLighting.previewing}
              previewFailed={generalLighting.previewFailed}
            />
          ) : (
            <LightingControl
              th={th}
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
          )}
        </ResizableDrawer>
      </div>
    </div>
  );
}
