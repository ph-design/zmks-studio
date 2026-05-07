import type { RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Lock, Wifi } from "lucide-react";

import {
  PhysicalLayout,
  Keymap,
} from "@zmkfirmware/zmk-studio-ts-client/keymap";
import type {
  GetLayerLedColorsResponse,
} from "@zmkfirmware/zmk-studio-ts-client/lighting";
import {
  LayoutZoom,
  PhysicalLayout as PhysicalLayoutComp,
} from "../keyboard/PhysicalLayout";
import { colorToHex } from "./HsbColorPicker";

export interface LayerLedMapProps {
  layout: PhysicalLayout;
  keymap: Keymap;
  scale: LayoutZoom;
  selectedLayerIndex: number;
  ledData: GetLayerLedColorsResponse | null;
  selectedPositions: Set<number>;
  onSelectionChanged: (positions: Set<number>) => void;
  fitContainerRef?: RefObject<HTMLElement>;
  indicatorPositions?: Set<number>;
  activeSource?: string;
}

export default function LayerLedMap({
  layout,
  keymap,
  scale,
  selectedLayerIndex,
  ledData,
  selectedPositions,
  onSelectionChanged,
  fitContainerRef,
  indicatorPositions,
  activeSource,
}: LayerLedMapProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(
    null
  );
  const [dragEnd, setDragEnd] = useState<{ x: number; y: number } | null>(
    null
  );

  const getKeyColor = useCallback(
    (keyPosition: number): number => {
      if (!ledData || !keymap.layers[selectedLayerIndex]) return 0;
      const layerId = keymap.layers[selectedLayerIndex].id;
      const layerConfig = ledData.layers.find((l) => l.layerId === layerId);
      if (!layerConfig) return 0;
      const binding = layerConfig.bindings.find(
        (b) => b.keyPosition === keyPosition
      );
      return binding?.color ?? 0;
    },
    [ledData, keymap, selectedLayerIndex]
  );

  const handlePositionClicked = useCallback(
    (pos: number, event: React.MouseEvent) => {
      if (event.ctrlKey || event.metaKey) {
        const next = new Set(selectedPositions);
        if (next.has(pos)) next.delete(pos);
        else next.add(pos);
        onSelectionChanged(next);
      } else {
        onSelectionChanged(new Set([pos]));
      }
    },
    [selectedPositions, onSelectionChanged]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest("button")) return;
      e.preventDefault();
      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });
      setDragEnd({ x: e.clientX, y: e.clientY });
    },
    []
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      setDragEnd({ x: e.clientX, y: e.clientY });
    };

    const handleMouseUp = (e: MouseEvent) => {
      setIsDragging(false);

      if (!containerRef.current || !dragStart) return;

      const endX = e.clientX;
      const endY = e.clientY;
      const minX = Math.min(dragStart.x, endX);
      const maxX = Math.max(dragStart.x, endX);
      const minY = Math.min(dragStart.y, endY);
      const maxY = Math.max(dragStart.y, endY);

      if (maxX - minX < 5 && maxY - minY < 5) {
        if (!e.ctrlKey && !e.metaKey) {
          onSelectionChanged(new Set());
        }
        setDragStart(null);
        setDragEnd(null);
        return;
      }

      const buttons = containerRef.current.querySelectorAll("button");
      const newSelection = e.ctrlKey || e.metaKey
        ? new Set(selectedPositions)
        : new Set<number>();

      buttons.forEach((btn, idx) => {
        const rect = btn.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        if (
          centerX >= minX &&
          centerX <= maxX &&
          centerY >= minY &&
          centerY <= maxY
        ) {
          newSelection.add(idx);
        }
      });

      onSelectionChanged(newSelection);
      setDragStart(null);
      setDragEnd(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, dragStart, selectedPositions, onSelectionChanged]);

  const positions = useMemo(() => {
    return layout.keys.map((k, i) => {
      const color = activeSource === "layerLed" ? getKeyColor(i) : 0;
      const bgColor = color !== 0 ? colorToHex(color) : undefined;
      const header: string | undefined = undefined;
      const isIndicator = indicatorPositions?.has(i);
      const IndicatorIcon = activeSource === "connection" ? Wifi : Lock;
      const indicatorTitle = activeSource === "connection"
        ? t("lighting.connection.title")
        : t("lighting.capsLock.title");

      return {
        id: `led-${i}`,
        header,
        x: k.x / 100.0,
        y: k.y / 100.0,
        width: k.width / 100,
        height: k.height / 100.0,
        r: (k.r || 0) / 100.0,
        rx: (k.rx || 0) / 100.0,
        ry: (k.ry || 0) / 100.0,
        children: (
          <>
            <div
              className="absolute inset-[2px] rounded transition-colors duration-300"
              style={{
                backgroundColor: bgColor ?? "transparent",
                opacity: bgColor ? 1 : 0,
              }}
            />
            {isIndicator && (
              <span
                className="absolute bottom-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-sm border border-base-content/15 bg-base-100/95 text-base-content/50"
                title={indicatorTitle}
              >
                <IndicatorIcon className="h-3 w-3" aria-hidden />
              </span>
            )}
            {!bgColor && !isIndicator && (
              <span className="text-xs opacity-30">—</span>
            )}
          </>
        ),
      };
    });
  }, [layout, getKeyColor, activeSource, indicatorPositions, t]);

  if (!ledData) {
    return (
      <div className="flex items-center justify-center h-full text-base-content/50 text-sm">
        {t("lighting.layerLed.loading")}
      </div>
    );
  }

  const selectionRect =
    isDragging && dragStart && dragEnd
      ? {
          left: Math.min(dragStart.x, dragEnd.x),
          top: Math.min(dragStart.y, dragEnd.y),
          width: Math.abs(dragEnd.x - dragStart.x),
          height: Math.abs(dragEnd.y - dragStart.y),
        }
      : null;

  return (
    <div
      ref={containerRef}
      className="h-full w-full grid items-center justify-center relative min-w-0 min-h-0 select-none"
      onMouseDown={handleMouseDown}
    >
      <PhysicalLayoutComp
        positions={positions}
        oneU={48}
        hoverZoom={true}
        zoom={scale}
        fitContainerRef={fitContainerRef}
        selectedPositions={activeSource === "layerLed" ? selectedPositions : new Set()}
        onPositionClicked={handlePositionClicked}
      />

      {selectionRect && (
        <div
          className="fixed border-2 border-primary bg-primary/10 pointer-events-none z-50"
          style={selectionRect}
        />
      )}
    </div>
  );
}
