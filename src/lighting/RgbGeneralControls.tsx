import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { Keymap } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import { SelectionButton } from "../carbon/CarbonChrome";
import { RealCarbonToggle } from "../carbon/RealCarbonToggle";
import type { RgbGeneralSettings } from "./useRgbGeneralDraft";

const FADE_MAX_MS = 1000;
const IDLE_MAX_SECONDS = 24 * 60 * 60;

interface NumberSettingProps {
  label: string;
  value: number;
  min: number;
  max: number;
  fraction?: boolean;
  disabled?: boolean;
  onChange: (value: number) => void;
}

function rounded(value: number) {
  return Math.round(value * 1000) / 1000;
}

function NumberSetting({ label, value, min, max, fraction, disabled, onChange }: NumberSettingProps) {
  const [text, setText] = useState(String(rounded(value)));
  useEffect(() => setText(String(rounded(value))), [value]);

  return (
    <label className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={fraction ? "any" : 1}
        value={text}
        disabled={disabled}
        onChange={(event) => setText(event.currentTarget.value)}
        onBlur={() => {
          const next = Number(text);
          const valid = text.trim() !== "" && Number.isFinite(next) &&
            next >= min && next <= max && (fraction || Number.isInteger(next));
          if (valid && next !== rounded(value)) onChange(next);
          setText(String(rounded(value)));
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        className="w-24 border border-base-300 bg-base-100 px-2 py-1 text-right tabular-nums"
      />
    </label>
  );
}

export function RgbGeneralControls({
  settings,
  layers,
  onChange,
  saving,
  previewFailed,
}: {
  settings: RgbGeneralSettings;
  layers: Keymap["layers"];
  onChange: (change: RgbGeneralSettings) => void;
  saving: boolean;
  previewFailed: boolean;
}) {
  const { t } = useTranslation();
  const { fade, idle, layerWake } = settings;

  return (
    <div className="h-full overflow-y-auto px-5 py-4 text-sm custom-scrollbar">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {fade && (
          <fieldset className="min-w-0 space-y-3 border border-base-300 p-3" disabled={saving}>
            <legend className="px-1 font-semibold">{t("lighting.fade")}</legend>
            <div className="flex items-center justify-between gap-3">
              <span>{t("lighting.general.fadeEnabled")}</span>
              <RealCarbonToggle
                ariaLabel={t("lighting.fade")}
                checked={fade.enabled}
                disabled={saving}
                onChange={(enabled) => onChange({ fade: { ...fade, enabled } })}
              />
            </div>
            <NumberSetting
              label={t("lighting.fadeDuration")}
              value={fade.durationMs}
              min={1}
              max={FADE_MAX_MS}
              disabled={!fade.enabled}
              onChange={(durationMs) => onChange({ fade: { ...fade, durationMs } })}
            />
          </fieldset>
        )}
        {idle && (
          <fieldset className="min-w-0 space-y-3 border border-base-300 p-3" disabled={saving}>
            <legend className="px-1 font-semibold">{t("lighting.general.idle")}</legend>
            <div className="flex items-center justify-between gap-3">
              <span>{t("lighting.general.sleepOnUsb")}</span>
              <RealCarbonToggle
                ariaLabel={t("lighting.general.sleepOnUsb")}
                checked={idle.sleepOnUsb}
                disabled={saving}
                onChange={(sleepOnUsb) => onChange({ idle: { ...idle, sleepOnUsb } })}
              />
            </div>
            <NumberSetting
              label={t("lighting.general.idleSeconds")}
              value={idle.timeoutMs / 1000}
              min={0}
              max={IDLE_MAX_SECONDS}
              fraction
              onChange={(seconds) => onChange({ idle: { ...idle, timeoutMs: Math.round(seconds * 1000) } })}
            />
            <p className="text-base-content/60">{t("lighting.general.idleHint")}</p>
          </fieldset>
        )}
        {layerWake && (
          <fieldset className="min-w-0 space-y-2 border border-base-300 p-3" disabled={saving}>
            <legend className="px-1 font-semibold">{t("lighting.general.layerWake")}</legend>
            <p className="text-base-content/60">{t("lighting.general.layerWakeHint")}</p>
            <div className="flex flex-wrap gap-1.5">
              {layers.map((layer, index) => {
                // Masks count layer positions, like the combo mask.
                if (index === 0 || index >= 32) return null;
                const bit = 1 << index;
                const selected = (layerWake.layers & bit) !== 0;
                return (
                  <SelectionButton key={layer.id} selected={selected} onClick={() => {
                    const mask = selected ? layerWake.layers & ~bit : layerWake.layers | bit;
                    onChange({ layerWake: { layers: mask >>> 0 } });
                  }}>
                    {layer.name || `${t("carbon.layer", "Layer")} ${index}`}
                  </SelectionButton>
                );
              })}
            </div>
          </fieldset>
        )}
      </div>
      {previewFailed && (
        <p role="alert" className="mt-3 text-error">
          {t("lighting.general.previewFailed")}
        </p>
      )}
    </div>
  );
}
