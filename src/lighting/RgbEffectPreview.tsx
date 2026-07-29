import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";

import type { PhysicalLayout } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import type { RgbUnderglowState } from "@zmkfirmware/zmk-studio-ts-client/lighting";
import {
  LayoutZoom,
  PhysicalLayout as PhysicalLayoutComp,
} from "../keyboard/PhysicalLayout";
import { RgbEffectEngine, type LedPosition } from "./rgbEffectEngine";

export interface RgbEffectPreviewProps {
  layout: PhysicalLayout;
  rgbState: RgbUnderglowState;
  scale: LayoutZoom;
}

// Interactive effects that respond to key clicks in the preview
const INTERACTIVE_EFFECTS = new Set([11, 12, 13, 14, 15]);

export default function RgbEffectPreview({
  layout,
  rgbState,
  scale,
}: RgbEffectPreviewProps) {
  const { t } = useTranslation();
  const engineRef = useRef<RgbEffectEngine | null>(null);
  const colorDivsRef = useRef<(HTMLDivElement | null)[]>([]);
  const frameBufRef = useRef<Float32Array>(new Float32Array(0));

  const stateRef = useRef(rgbState);
  stateRef.current = rgbState;

  const ledPositions = useMemo<LedPosition[]>(() => {
    if (layout.keys.length === 0) return [];
    let maxX = 0, maxY = 0;
    const centers = layout.keys.map((k) => {
      const cx = (k.x + k.width / 2) / 100;
      const cy = (k.y + k.height / 2) / 100;
      if (cx > maxX) maxX = cx;
      if (cy > maxY) maxY = cy;
      return { cx, cy };
    });
    return centers.map(({ cx, cy }) => ({
      x: maxX > 0 ? cx / maxX : 0.5,
      y: maxY > 0 ? cy / maxY : 0.5,
    }));
  }, [layout]);

  // Reconfigure engine when LED layout changes
  useEffect(() => {
    if (!engineRef.current) engineRef.current = new RgbEffectEngine();
    engineRef.current.setPositions(ledPositions);
    frameBufRef.current = new Float32Array(ledPositions.length * 3);
    colorDivsRef.current = colorDivsRef.current.slice(0, ledPositions.length);
  }, [ledPositions]);

  useEffect(() => {
    engineRef.current?.reset(rgbState.effect);
  }, [rgbState.effect]);

  // Animation loop
  useEffect(() => {
    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const engine = engineRef.current;
      const st = stateRef.current;
      const buf = frameBufRef.current;
      if (engine && st && buf.length > 0) {
        const dt = Math.min(100, now - last);
        const hsv = {
          h: st.color?.h ?? 0,
          s: st.color?.s ?? 0,
          b: st.on ? (st.color?.b ?? 0) : 0,
        };
        engine.advance(st.effect, st.speed, dt);
        engine.draw(st.effect, hsv, st.speed, buf);
        for (let i = 0; i < buf.length / 3; i++) {
          const div = colorDivsRef.current[i];
          if (!div) continue;
          const r = Math.round(buf[i * 3] * 255);
          const g = Math.round(buf[i * 3 + 1] * 255);
          const b = Math.round(buf[i * 3 + 2] * 255);
          div.style.backgroundColor = `rgb(${r},${g},${b})`;
        }
      }
      last = now;
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const handlePositionClicked = (pos: number) => {
    if (!INTERACTIVE_EFFECTS.has(stateRef.current.effect)) return;
    const p = ledPositions[pos];
    if (p) engineRef.current?.triggerKey(p.x, p.y);
  };

  const isInteractive = INTERACTIVE_EFFECTS.has(rgbState.effect);

  const positions = useMemo(
    () =>
      layout.keys.map((k, i) => ({
        id: `fx-${i}`,
        x: k.x / 100.0,
        y: k.y / 100.0,
        width: k.width / 100,
        height: k.height / 100.0,
        r: (k.r || 0) / 100.0,
        rx: (k.rx || 0) / 100.0,
        ry: (k.ry || 0) / 100.0,
        children: (
          <div
            ref={(el) => {
              colorDivsRef.current[i] = el;
            }}
            className="absolute inset-[2px] rounded"
            style={{ backgroundColor: "rgb(0,0,0)" }}
          />
        ),
      })),
    [layout],
  );

  return (
    <div className="h-full w-full grid items-center justify-center relative min-w-0 min-h-0 select-none">
      <PhysicalLayoutComp
        positions={positions}
        oneU={48}
        hoverZoom={!isInteractive}
        zoom={scale}
        onPositionClicked={handlePositionClicked}
      />
      {isInteractive && (
        <span className="absolute bottom-2 right-3 text-xs text-base-content/40 pointer-events-none">
          {t("lighting.preview.clickToTrigger", "点击按键触发")}
        </span>
      )}
    </div>
  );
}
