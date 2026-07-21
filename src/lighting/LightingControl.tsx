import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Label } from "react-aria-components";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";

import { ConnectionContext } from "../rpc/ConnectionContext";
import { LockStateContext } from "../rpc/LockStateContext";
import { LockState } from "@zmkfirmware/zmk-studio-ts-client/core";
import { call_rpc } from "../rpc/logging";

import type {
  RgbUnderglowState,
  BacklightState,
  CapsLockIndicatorState,
  ConnectionIndicatorState,
  GetLayerLedColorsResponse,
  SetCapsLockIndicatorRequest,
  SetConnectionIndicatorRequest,
} from "@zmkfirmware/zmk-studio-ts-client/lighting";
import type { Keymap } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import type { IndicatorPositionDraft } from "../carbon/useKeyboardModel";

import HsbColorPicker, {
  type HsbColor,
  rgbToHsb,
  hsbToRgb,
} from "./HsbColorPicker";

export type LightSource = "rgb" | "backlight" | "capslock" | "connection" | "layerLed";

const ANY_LAYER_ID = 0xff;

export interface LightingControlProps {
  selectedSource: LightSource;
  hasLayerLed?: boolean;
  selectedLedPositions?: Set<number>;
  ledData?: GetLayerLedColorsResponse | null;
  selectedLayerIndex?: number;
  keymap?: Keymap;
  onLayerLedColorChanged?: (positions: number[], color: number) => void;
  layerLedEnabled?: boolean;
  onLayerLedEnabledChanged?: (enabled: boolean) => void;
  rgbState: RgbUnderglowState | null;
  setRgbState: React.Dispatch<React.SetStateAction<RgbUnderglowState | null>>;
  backlightState: BacklightState | null;
  setBacklightState: React.Dispatch<React.SetStateAction<BacklightState | null>>;
  capsLockState: CapsLockIndicatorState | null;
  setCapsLockState: React.Dispatch<React.SetStateAction<CapsLockIndicatorState | null>>;
  connectionState?: ConnectionIndicatorState | null;
  setConnectionState?: React.Dispatch<React.SetStateAction<ConnectionIndicatorState | null>>;
  hasRgb: boolean;
  hasBacklight: boolean;
  hasCapsLock: boolean;
  hasConnection?: boolean;
  indicatorPositionDraft?: IndicatorPositionDraft;
  onClearIndicator?: () => void;
  onLightingChanged?: () => void;
}

const capsLockIndicatorFieldOrder: (keyof SetCapsLockIndicatorRequest)[] = [
  "enabled",
  "offColor",
  "onColor",
  "keyPosition",
  "layerId",
];

const connectionIndicatorFieldOrder: (keyof SetConnectionIndicatorRequest)[] = [
  "enabled",
  "usbColor",
  "btColor",
  "keyPosition",
  "layerId",
];

export default function LightingControl({
  selectedSource,
  hasLayerLed,
  selectedLedPositions,
  ledData,
  selectedLayerIndex,
  keymap,
  onLayerLedColorChanged,
  layerLedEnabled,
  onLayerLedEnabledChanged,
  rgbState,
  setRgbState,
  backlightState,
  setBacklightState,
  capsLockState,
  setCapsLockState,
  connectionState,
  setConnectionState,
  hasRgb,
  hasBacklight,
  hasCapsLock,
  hasConnection,
  indicatorPositionDraft,
  onClearIndicator,
  onLightingChanged,
}: LightingControlProps) {
  const { t } = useTranslation();
  const conn = useContext(ConnectionContext);
  const lockState = useContext(LockStateContext);
  const isUnlocked =
    lockState === LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED;

  const [layerLedHsb, setLayerLedHsb] = useState<HsbColor>({ h: 0, s: 100, b: 100 });

  const [capsOnHsb, setCapsOnHsb] = useState<HsbColor>({ h: 0, s: 100, b: 100 });
  const [capsOffHsb, setCapsOffHsb] = useState<HsbColor>({ h: 0, s: 0, b: 0 });

  const [connUsbHsb, setConnUsbHsb] = useState<HsbColor>({ h: 0, s: 0, b: 100 });
  const [connBtHsb, setConnBtHsb] = useState<HsbColor>({ h: 240, s: 100, b: 100 });

  const capsInitialized = useRef(false);
  const connInitialized = useRef(false);

  if (!capsLockState) {
    capsInitialized.current = false;
  }
  if (!connectionState) {
    connInitialized.current = false;
  }

  useEffect(() => {
    if (!capsLockState || capsInitialized.current) return;
    capsInitialized.current = true;
    setCapsOnHsb(rgbToHsb(capsLockState.onColor));
    setCapsOffHsb(rgbToHsb(capsLockState.offColor));
  }, [capsLockState]);

  useEffect(() => {
    if (!connectionState || connInitialized.current) return;
    connInitialized.current = true;
    setConnUsbHsb(rgbToHsb(connectionState.usbColor));
    setConnBtHsb(rgbToHsb(connectionState.btColor));
  }, [connectionState]);

  useEffect(() => {
    if (!selectedLedPositions || selectedLedPositions.size === 0 || !ledData || !keymap) return;
    const layerIdx = selectedLayerIndex ?? 0;
    const layerId = keymap.layers[layerIdx]?.id;
    if (layerId === undefined) return;
    const firstPos = Math.min(...selectedLedPositions);
    const layerConfig = ledData.layers.find((l) => l.layerId === layerId);
    const binding = layerConfig?.bindings.find((b) => b.keyPosition === firstPos);
    const color = binding?.color ?? 0;
    if (color > 0) {
      setLayerLedHsb(rgbToHsb(color));
    } else {
      setLayerLedHsb({ h: 0, s: 100, b: 100 });
    }
  }, [selectedLedPositions, ledData, keymap, selectedLayerIndex]);

  const handleLayerLedHsbChanged = useCallback(
    (hsb: HsbColor) => {
      setLayerLedHsb(hsb);
      if (!selectedLedPositions || selectedLedPositions.size === 0 || !onLayerLedColorChanged) return;
      const rgbColor = hsbToRgb(hsb);
      onLayerLedColorChanged(Array.from(selectedLedPositions), rgbColor);
    },
    [selectedLedPositions, onLayerLedColorChanged]
  );

  const handleClearLayerLed = useCallback(() => {
    if (!selectedLedPositions || selectedLedPositions.size === 0 || !onLayerLedColorChanged) return;
    onLayerLedColorChanged(Array.from(selectedLedPositions), 0);
  }, [selectedLedPositions, onLayerLedColorChanged]);

  const setRgbProp = useCallback(
    async (props: Partial<RgbUnderglowState>) => {
      if (!conn.conn) return;
      try {
        const resp = await call_rpc(conn.conn, {
          lighting: { setRgbUnderglowState: props },
        });
        if (resp.lighting?.setRgbUnderglowState) {
          setRgbState((prev) => (prev ? { ...prev, ...props } : prev));
          onLightingChanged?.();
        }
      } catch (e) {
        console.error("Failed to set RGB state", e);
      }
    },
    [conn, setRgbState, onLightingChanged]
  );

  const setBlProp = useCallback(
    async (props: Partial<BacklightState>) => {
      if (!conn.conn) return;
      try {
        const resp = await call_rpc(conn.conn, {
          lighting: { setBacklightState: props },
        });
        if (resp.lighting?.setBacklightState) {
          setBacklightState((prev) => (prev ? { ...prev, ...props } : prev));
          onLightingChanged?.();
        }
      } catch (e) {
        console.error("Failed to set backlight state", e);
      }
    },
    [conn, setBacklightState, onLightingChanged]
  );

  const setCapsLockProp = useCallback(
    async (props: Partial<SetCapsLockIndicatorRequest>) => {
      if (!conn.conn) return false;
      const applied: Partial<SetCapsLockIndicatorRequest> = {};
      try {
        for (const field of capsLockIndicatorFieldOrder) {
          const value = props[field];
          if (value === undefined) continue;

          const request = { [field]: value } as Partial<SetCapsLockIndicatorRequest>;
          const resp = await call_rpc(conn.conn, {
            lighting: { setCapsLockIndicator: request },
          });
          if (!resp.lighting?.setCapsLockIndicator) {
            console.error("Failed to set CapsLock indicator", resp);
            return false;
          }
          Object.assign(applied, request);
        }

        if (Object.keys(applied).length > 0) {
          setCapsLockState((prev) => (prev ? { ...prev, ...applied } : prev));
          onLightingChanged?.();
        }
        return true;
      } catch (e) {
        console.error("Failed to set CapsLock indicator", e);
        return false;
      }
    },
    [conn, setCapsLockState, onLightingChanged]
  );

  const setConnectionProp = useCallback(
    async (props: Partial<SetConnectionIndicatorRequest>) => {
      if (!conn.conn) return false;
      const applied: Partial<SetConnectionIndicatorRequest> = {};
      try {
        for (const field of connectionIndicatorFieldOrder) {
          const value = props[field];
          if (value === undefined) continue;

          const request = { [field]: value } as Partial<SetConnectionIndicatorRequest>;
          const resp = await call_rpc(conn.conn, {
            lighting: { setConnectionIndicator: request },
          });
          if (!resp.lighting?.setConnectionIndicator) {
            console.error("Failed to set Connection indicator", resp);
            return false;
          }
          Object.assign(applied, request);
        }

        if (Object.keys(applied).length > 0) {
          setConnectionState?.((prev) => (prev ? { ...prev, ...applied } : prev));
          onLightingChanged?.();
        }
        return true;
      } catch (e) {
        console.error("Failed to set Connection indicator", e);
        return false;
      }
    },
    [conn, setConnectionState, onLightingChanged]
  );

  const effectNames = useMemo(() => {
    if (!rgbState) return [];
    if (rgbState.effectNames && rgbState.effectNames.length > 0) {
      return rgbState.effectNames;
    }
    const count = rgbState.effectCount ?? 0;
    return Array.from({ length: count }, (_, i) => `Effect ${i}`);
  }, [rgbState]);

  const isRgbSelected = selectedSource === "rgb" && hasRgb;
  const isBlSelected = selectedSource === "backlight" && hasBacklight;
  const isCapsSelected = selectedSource === "capslock" && hasCapsLock;
  const isConnSelected = selectedSource === "connection" && !!hasConnection;
  const isLayerLedSelected = selectedSource === "layerLed" && hasLayerLed;

  const selectedLayerId = keymap?.layers[selectedLayerIndex ?? 0]?.id;
  const capsStoredAllLayers = capsLockState?.layerId === ANY_LAYER_ID;
  const connStoredAllLayers = connectionState?.layerId === ANY_LAYER_ID;

  const resolvedIndicatorLayerId = (isCapsSelected && capsStoredAllLayers) || (isConnSelected && connStoredAllLayers)
    ? ANY_LAYER_ID
    : selectedLayerId ?? 0;

  useEffect(() => {
    if (!indicatorPositionDraft) return;

    const draft = indicatorPositionDraft;
    let cancelled = false;
    async function applyIndicatorPosition() {
      const position = { keyPosition: draft.keyPosition, layerId: resolvedIndicatorLayerId };
      let ok = false;
      if (isCapsSelected) {
        ok = await setCapsLockProp(position);
      } else if (isConnSelected) {
        ok = await setConnectionProp(position);
      }

      if (ok && !cancelled) {
        onClearIndicator?.();
      }
    }

    applyIndicatorPosition();
    return () => {
      cancelled = true;
    };
  }, [resolvedIndicatorLayerId, indicatorPositionDraft, isCapsSelected, isConnSelected, onClearIndicator, setCapsLockProp, setConnectionProp]);

  if (!conn.conn || !isUnlocked) {
    return null;
  }

  if (!hasRgb && !hasBacklight && !hasCapsLock && !hasConnection && !hasLayerLed) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 px-8">
        <AlertTriangle className="w-8 h-8 text-warning" />
        <span className="text-sm font-medium text-base-content">
          {t("lighting.notSupported")}
        </span>
        <p className="text-sm text-base-content/50 text-center max-w-md leading-relaxed">
          {t("lighting.notSupportedDesc")}
        </p>
      </div>
    );
  }

  const setIndicatorAllLayers = (allLayers: boolean) => {
    async function apply() {
      const layerId = allLayers ? ANY_LAYER_ID : selectedLayerId;
      if (layerId === undefined) return;

      let ok = false;
      if (isCapsSelected) {
        ok = await setCapsLockProp({ layerId });
      } else if (isConnSelected) {
        ok = await setConnectionProp({ layerId });
      }
      if (ok) {
        onClearIndicator?.();
      }
    }

    apply();
  };

  const scopeSelect = (allLayers: boolean) => (
    <label className="flex items-center gap-2 text-sm text-base-content/60 whitespace-nowrap">
      <span>{t("lighting.indicator.scope")}</span>
      <select
        value={allLayers ? "any" : "current"}
        onChange={(e) => setIndicatorAllLayers(e.currentTarget.value === "any")}
        disabled={!isUnlocked || (!allLayers && selectedLayerId === undefined)}
        className="h-8 border border-base-300 bg-base-100 px-2 text-sm text-base-content focus:outline-none focus:border-primary"
      >
        <option value="current">{t("lighting.indicator.currentLayer")}</option>
        <option value="any">{t("lighting.indicator.anyLayer")}</option>
      </select>
    </label>
  );

  const positionInfo = (state: { enabled: boolean; keyPosition: number; layerId: number }, storedAllLayers: boolean) => {
    const showPos =
      indicatorPositionDraft || state.enabled || state.keyPosition > 0 || state.layerId !== 0;
    return (
      <div className="flex items-center gap-3 flex-wrap">
        {showPos ? (
          <span className="text-sm text-base-content/60">
            {t("lighting.indicator.positionLabel", {
              pos: indicatorPositionDraft ? indicatorPositionDraft.keyPosition : state.keyPosition,
            })}
          </span>
        ) : (
          <span className="text-sm text-base-content/60">{t("lighting.indicator.clickKeyHint")}</span>
        )}
        {scopeSelect(
          indicatorPositionDraft ? resolvedIndicatorLayerId === ANY_LAYER_ID : storedAllLayers
        )}
      </div>
    );
  };

  // Top bar: on/off (+ scope & position for indicators). Blocks below hold the
  // per-source content laid out horizontally.
  let topBar: React.ReactNode = null;
  let blocks: React.ReactNode = null;

  if (isRgbSelected && rgbState) {
    topBar = <OnOff value={rgbState.on} onChange={(v) => setRgbProp({ on: v })} disabled={!isUnlocked} />;
    blocks = (
      <>
        <Block title={t("lighting.block.effect", "Effect")}>
          <div className={`flex items-center gap-1.5 flex-wrap ${!rgbState.on ? "opacity-40 pointer-events-none" : ""}`}>
            {effectNames.map((name, i) => (
              <SegButton key={i} active={rgbState.effect === i} disabled={!isUnlocked || !rgbState.on} onClick={() => setRgbProp({ effect: i })}>
                {name}
              </SegButton>
            ))}
          </div>
        </Block>
        <Block title={t("lighting.block.color", "Color")}>
          <div className={`flex flex-col gap-3 ${!rgbState.on ? "opacity-40 pointer-events-none" : ""}`}>
            <HsbColorPicker
              hsb={{ h: rgbState.color?.h ?? 0, s: rgbState.color?.s ?? 0, b: rgbState.color?.b ?? 0 }}
              onHsbChanged={(hsb) => setRgbProp({ color: { h: hsb.h, s: hsb.s, b: hsb.b } })}
              disabled={!isUnlocked}
            />
            <div className="flex items-center gap-3">
              <Label className="text-sm text-base-content/60 w-16 shrink-0">{t("lighting.speed")}</Label>
              <input type="range" min={1} max={10} value={rgbState.speed ?? 1}
                onChange={(e) => setRgbProp({ speed: Number(e.target.value) })} disabled={!isUnlocked}
                className="flex-1 accent-primary" />
              <span className="text-sm text-base-content/50 w-8 text-right tabular-nums">{rgbState.speed ?? 1}</span>
            </div>
          </div>
        </Block>
      </>
    );
  } else if (isBlSelected && backlightState) {
    topBar = <OnOff value={backlightState.on} onChange={(v) => setBlProp({ on: v })} disabled={!isUnlocked} />;
    blocks = (
      <Block title={t("lighting.brt", "Brightness")}>
        <div className={`flex items-center gap-3 ${!backlightState.on ? "opacity-40 pointer-events-none" : ""}`}>
          <input type="range" min={0} max={100} value={backlightState.brightness}
            onChange={(e) => setBlProp({ brightness: Number(e.target.value) })} disabled={!isUnlocked}
            className="flex-1 accent-primary" />
          <span className="text-sm text-base-content/50 w-10 text-right tabular-nums">{backlightState.brightness}</span>
        </div>
      </Block>
    );
  } else if (isCapsSelected && capsLockState) {
    topBar = (
      <>
        <OnOff value={capsLockState.enabled} onChange={(v) => setCapsLockProp({ enabled: v })} disabled={!isUnlocked} />
        <div className="ml-auto">{positionInfo(capsLockState, !!capsStoredAllLayers)}</div>
      </>
    );
    blocks = (
      <>
        <Block title={t("lighting.capsLock.offColor", "Off color")}>
          <div className={!capsLockState.enabled ? "opacity-40 pointer-events-none" : ""}>
            <HsbColorPicker hsb={capsOffHsb}
              onHsbChanged={(hsb) => { setCapsOffHsb(hsb); setCapsLockProp({ offColor: hsbToRgb(hsb) }); }}
              disabled={!isUnlocked} />
          </div>
        </Block>
        <Block title={t("lighting.capsLock.onColor", "On color")}>
          <div className={!capsLockState.enabled ? "opacity-40 pointer-events-none" : ""}>
            <HsbColorPicker hsb={capsOnHsb}
              onHsbChanged={(hsb) => { setCapsOnHsb(hsb); setCapsLockProp({ onColor: hsbToRgb(hsb) }); }}
              disabled={!isUnlocked} />
          </div>
        </Block>
      </>
    );
  } else if (isConnSelected && connectionState) {
    topBar = (
      <>
        <OnOff value={connectionState.enabled} onChange={(v) => setConnectionProp({ enabled: v })} disabled={!isUnlocked} />
        <div className="ml-auto">{positionInfo(connectionState, !!connStoredAllLayers)}</div>
      </>
    );
    blocks = (
      <>
        <Block title={t("lighting.connection.usbColor", "USB color")}>
          <div className={!connectionState.enabled ? "opacity-40 pointer-events-none" : ""}>
            <HsbColorPicker hsb={connUsbHsb}
              onHsbChanged={(hsb) => { setConnUsbHsb(hsb); setConnectionProp({ usbColor: hsbToRgb(hsb) }); }}
              disabled={!isUnlocked} />
          </div>
        </Block>
        <Block title={t("lighting.connection.btColor", "Bluetooth color")}>
          <div className={!connectionState.enabled ? "opacity-40 pointer-events-none" : ""}>
            <HsbColorPicker hsb={connBtHsb}
              onHsbChanged={(hsb) => { setConnBtHsb(hsb); setConnectionProp({ btColor: hsbToRgb(hsb) }); }}
              disabled={!isUnlocked} />
          </div>
        </Block>
      </>
    );
  } else if (isLayerLedSelected) {
    topBar = <OnOff value={!!layerLedEnabled} onChange={(v) => onLayerLedEnabledChanged?.(v)} disabled={!isUnlocked} />;
    blocks = (
      <Block title={t("lighting.block.color", "Color")}>
        <div className={`flex flex-col gap-2 ${!layerLedEnabled ? "opacity-40 pointer-events-none" : ""}`}>
          {(!selectedLedPositions || selectedLedPositions.size === 0) ? (
            <div className="text-sm text-base-content/50">{t("lighting.layerLed.selectKey")}</div>
          ) : (
            <>
              <div className="text-sm text-base-content/60 mb-1">
                {selectedLedPositions.size === 1
                  ? t("lighting.layerLed.editKey", { key: Math.min(...selectedLedPositions) })
                  : t("lighting.layerLed.editKeys", { count: selectedLedPositions.size })}
              </div>
              <HsbColorPicker hsb={layerLedHsb} onHsbChanged={handleLayerLedHsbChanged} disabled={!isUnlocked} />
              <button onClick={handleClearLayerLed} disabled={!isUnlocked}
                className="mt-1 px-3 py-1.5 text-sm cursor-pointer transition-colors border border-base-300 bg-base-100 hover:border-base-content/40 self-start">
                {t("lighting.layerLed.clear")}
              </button>
            </>
          )}
        </div>
      </Block>
    );
  }

  return (
    <div className="flex flex-col min-h-0 h-full w-full">
      {/* Top bar: power + scope */}
      <div className="flex items-center gap-4 px-5 h-12 border-b border-base-300 flex-shrink-0">
        {topBar}
      </div>
      {/* Horizontal content blocks */}
      <div className="flex flex-1 min-h-0 overflow-x-auto">
        {blocks}
      </div>
    </div>
  );
}

// Titled sub-block — a full-height column (Carbon), divided by a right border.
const Block = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="flex flex-col flex-1 min-w-0 px-5 py-4 border-r border-base-300 last:border-r-0 overflow-y-auto custom-scrollbar">
    <h4 className="text-sm font-semibold text-base-content/70 mb-3">{title}</h4>
    {children}
  </section>
);

// Carbon bordered segmented On/Off control.
const OnOff = ({
  value,
  onChange,
  disabled,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) => {
  const { t } = useTranslation();
  return (
  <div className="inline-flex border border-base-300">
    <button
      onClick={() => onChange(true)}
      disabled={disabled}
      className={`px-4 py-1.5 text-sm cursor-pointer transition-colors ${
        value ? "bg-primary text-primary-content" : "bg-base-100 text-base-content hover:bg-base-300"
      }`}
    >
      {t("lighting.on", "On")}
    </button>
    <button
      onClick={() => onChange(false)}
      disabled={disabled}
      className={`px-4 py-1.5 text-sm cursor-pointer transition-colors border-l border-base-300 ${
        !value ? "bg-primary text-primary-content" : "bg-base-100 text-base-content hover:bg-base-300"
      }`}
    >
      {t("lighting.off", "Off")}
    </button>
  </div>
  );
};

const SegButton = ({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`px-3 py-1.5 text-sm cursor-pointer transition-colors border whitespace-nowrap ${
      active
        ? "bg-primary text-primary-content border-primary"
        : "bg-base-100 text-base-content border-base-300 hover:border-base-content/40"
    }`}
  >
    {children}
  </button>
);
