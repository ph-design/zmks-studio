import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Label } from "react-aria-components";
import { useTranslation } from "react-i18next";

export interface HsbColor {
  h: number; // 0-359
  s: number; // 0-100
  b: number; // 0-100
}

function hsbToHsl(h: number, s: number, b: number) {
  const s01 = s / 100;
  const b01 = b / 100;
  const l = b01 * (1 - s01 / 2);
  const sl = l === 0 || l === 1 ? 0 : (b01 - l) / Math.min(l, 1 - l);
  return { h, s: Math.round(sl * 100), l: Math.round(l * 100) };
}

/** Convert 0xRRGGBB to HSB */
export function rgbToHsb(rgb: number): HsbColor {
  const r = ((rgb >> 16) & 0xff) / 255;
  const g = ((rgb >> 8) & 0xff) / 255;
  const b = (rgb & 0xff) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d + 6) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }

  const s = max === 0 ? 0 : d / max;

  return {
    h: Math.round(h),
    s: Math.round(s * 100),
    b: Math.round(max * 100),
  };
}

/** Convert HSB to 0xRRGGBB */
export function hsbToRgb(hsb: HsbColor): number {
  const s = hsb.s / 100;
  const v = hsb.b / 100;
  const c = v * s;
  const x = c * (1 - Math.abs(((hsb.h / 60) % 2) - 1));
  const m = v - c;

  let r1: number, g1: number, b1: number;
  const h = ((hsb.h % 360) + 360) % 360;
  if (h < 60) {
    r1 = c; g1 = x; b1 = 0;
  } else if (h < 120) {
    r1 = x; g1 = c; b1 = 0;
  } else if (h < 180) {
    r1 = 0; g1 = c; b1 = x;
  } else if (h < 240) {
    r1 = 0; g1 = x; b1 = c;
  } else if (h < 300) {
    r1 = x; g1 = 0; b1 = c;
  } else {
    r1 = c; g1 = 0; b1 = x;
  }

  const r = Math.round((r1 + m) * 255);
  const g = Math.round((g1 + m) * 255);
  const b = Math.round((b1 + m) * 255);

  return (r << 16) | (g << 8) | b;
}

/** Convert 0xRRGGBB to CSS hex string */
export function colorToHex(color: number): string {
  return "#" + (color & 0xffffff).toString(16).padStart(6, "0");
}

function hsbToCssColor(h: number, s: number, b: number): string {
  const hsl = hsbToHsl(h, s, b);
  return `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;
}

interface NumericInputProps {
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (v: number) => void;
}

function NumericInput({ value, min, max, disabled, onChange }: NumericInputProps) {
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(String(value));
  }, [value, focused]);

  const commit = useCallback(() => {
    setFocused(false);
    const n = parseInt(draft, 10);
    if (!isNaN(n)) {
      onChange(Math.max(min, Math.min(max, n)));
    } else {
      setDraft(String(value));
    }
  }, [draft, value, min, max, onChange]);

  return (
    <input
      type="text"
      inputMode="numeric"
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => {
        setFocused(true);
        e.target.select();
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
      }}
      className="w-10 px-0 py-0.5 rounded border border-base-300 bg-base-100 text-sm text-base-content tabular-nums text-center focus:outline-none focus:border-primary"
    />
  );
}

interface HexInputProps {
  hsb: HsbColor;
  disabled?: boolean;
  onHsbChanged: (hsb: HsbColor) => void;
}

function HexInput({ hsb, disabled, onHsbChanged }: HexInputProps) {
  const rgbNum = useMemo(() => hsbToRgb(hsb), [hsb]);
  const hexStr = useMemo(() => colorToHex(rgbNum).toUpperCase(), [rgbNum]);
  const [draft, setDraft] = useState(hexStr);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(hexStr);
  }, [hexStr, focused]);

  const commit = useCallback(() => {
    setFocused(false);
    const cleaned = draft.replace(/^#/, "");
    if (/^[0-9a-fA-F]{6}$/.test(cleaned)) {
      onHsbChanged(rgbToHsb(parseInt(cleaned, 16)));
    } else {
      setDraft(hexStr);
    }
  }, [draft, hexStr, onHsbChanged]);

  return (
    <input
      type="text"
      maxLength={7}
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => {
        setFocused(true);
        e.target.select();
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
      }}
      className="w-20 px-0 py-0.5 rounded border border-base-300 bg-base-100 text-sm text-base-content font-mono text-center shrink-0 focus:outline-none focus:border-primary"
    />
  );
}

interface ColorSliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  trackStyle: React.CSSProperties;
  onChange: (v: number) => void;
}

function ColorSliderRow({
  label,
  value,
  min,
  max,
  disabled,
  trackStyle,
  onChange,
}: ColorSliderRowProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const resolve = useCallback(
    (clientX: number) => {
      const rect = barRef.current?.getBoundingClientRect();
      if (!rect) return;
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      onChange(Math.round(min + ratio * (max - min)));
    },
    [min, max, onChange]
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return;
      dragging.current = true;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      resolve(e.clientX);
    },
    [disabled, resolve]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      resolve(e.clientX);
    },
    [resolve]
  );

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div className="flex items-center gap-3">
      <Label className="text-sm text-base-content/60 w-10 shrink-0">
        {label}
      </Label>
      <div
        ref={barRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className={`relative flex-1 h-3 rounded-full select-none touch-none ${
          disabled ? "opacity-40 pointer-events-none" : "cursor-pointer"
        }`}
        style={trackStyle}
      >
        <div
          className="absolute top-1/2 w-3.5 h-3.5 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.2)] -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          style={{ left: `${pct}%` }}
        />
      </div>
      <NumericInput
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        onChange={onChange}
      />
    </div>
  );
}

interface HsbColorPickerProps {
  hsb: HsbColor;
  onHsbChanged: (hsb: HsbColor) => void;
  disabled?: boolean;
}

export default function HsbColorPicker({
  hsb,
  onHsbChanged,
  disabled,
}: HsbColorPickerProps) {
  const { t } = useTranslation();

  const previewColor = useMemo(
    () => hsbToCssColor(hsb.h, hsb.s, hsb.b),
    [hsb]
  );

  const hueTrack: React.CSSProperties = useMemo(
    () => ({
      background:
        "linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)",
    }),
    []
  );

  const satTrack: React.CSSProperties = useMemo(
    () => ({
      background: `linear-gradient(to right, ${hsbToCssColor(hsb.h, 0, 100)}, ${hsbToCssColor(hsb.h, 100, 100)})`,
    }),
    [hsb.h]
  );

  const brtTrack: React.CSSProperties = useMemo(
    () => ({
      background: `linear-gradient(to right, ${hsbToCssColor(hsb.h, hsb.s, 0)}, ${hsbToCssColor(hsb.h, hsb.s, 100)})`,
    }),
    [hsb.h, hsb.s]
  );

  return (
    <div className="flex flex-col gap-2">
      {/* Color preview + hex input */}
      <div className="flex items-center gap-3">
        <Label className="text-sm text-base-content/60 w-10 shrink-0">
          {t("lighting.color")}
        </Label>
        <div
          className="flex-1 h-8 rounded border border-base-300"
          style={{ backgroundColor: previewColor }}
        />
        <HexInput hsb={hsb} disabled={disabled} onHsbChanged={onHsbChanged} />
      </div>

      {/* H / S / B sliders with editable inputs */}
      <ColorSliderRow
        label={t("lighting.hue")}
        value={hsb.h}
        min={0}
        max={359}
        disabled={disabled}
        trackStyle={hueTrack}
        onChange={(h) => onHsbChanged({ ...hsb, h })}
      />
      <ColorSliderRow
        label={t("lighting.sat")}
        value={hsb.s}
        min={0}
        max={100}
        disabled={disabled}
        trackStyle={satTrack}
        onChange={(s) => onHsbChanged({ ...hsb, s })}
      />
      <ColorSliderRow
        label={t("lighting.brt")}
        value={hsb.b}
        min={0}
        max={100}
        disabled={disabled}
        trackStyle={brtTrack}
        onChange={(b) => onHsbChanged({ ...hsb, b })}
      />
    </div>
  );
}
