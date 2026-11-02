import {
  CSSProperties,
  PropsWithChildren,
  RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Key } from "./Key";

export type KeyPosition = PropsWithChildren<{
  id: string;
  header?: string;
  width: number;
  height: number;
  x: number;
  y: number;
  r?: number;
  rx?: number;
  ry?: number;
  pressed?: boolean;
  accent?: boolean;
  cornerLabel?: string;
  dimmed?: boolean;
}>;

export type LayoutZoom = number | "auto";

export function deserializeLayoutZoom(value: string): LayoutZoom {
  if (value === "auto") {
    return "auto";
  }
  return parseFloat(value) || "auto";
}

interface PhysicalLayoutProps {
  positions: Array<KeyPosition>;
  selectedPosition?: number;
  selectedPositions?: Set<number>;
  oneU?: number;
  hoverZoom?: boolean;
  zoom?: LayoutZoom;
  fitContainerRef?: RefObject<HTMLElement>;
  onPositionClicked?: (position: number, event: React.MouseEvent) => void;
}

interface PhysicalLayoutPositionLocation {
  x: number;
  y: number;
  r?: number;
  rx?: number;
  ry?: number;
}

function scalePosition(
  { x, y, r, rx, ry }: PhysicalLayoutPositionLocation,
  oneU: number,
): CSSProperties {
  const left = x * oneU;
  const top = y * oneU;
  let transformOrigin = undefined;
  let transform = undefined;

  if (r) {
    const transformX = ((rx || x) - x) * oneU;
    const transformY = ((ry || y) - y) * oneU;
    transformOrigin = `${transformX}px ${transformY}px`;
    transform = `rotate(${r}deg)`;
  }

  return {
    top,
    left,
    transformOrigin,
    transform,
  };
}

export const PhysicalLayout = ({
  positions,
  selectedPosition,
  selectedPositions,
  oneU = 48,
  hoverZoom,
  zoom,
  fitContainerRef,
  onPositionClicked,
}: PhysicalLayoutProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const hasMeasuredScaleRef = useRef(false);
  const [scale, setScale] = useState(1);
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const [animateScale, setAnimateScale] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);

  // Viewport bounds for a zoom: a canvas smaller than the container stays
  // fully inside it; a larger one pans until its far edge reaches the
  // container centre, so the edge keys can be brought to the middle.
  const panLimit = useCallback((s: number) => {
    const element = ref.current;
    const el = fitContainerRef?.current;
    if (!element || !el) return { x: Infinity, y: Infinity };
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    const ws = element.clientWidth * s;
    const hs = element.clientHeight * s;
    return { x: ws <= cw ? (cw - ws) / 2 : ws / 2, y: hs <= ch ? (ch - hs) / 2 : hs / 2 };
  }, [fitContainerRef]);

  // Fit means centred, so "auto" recentres. Numeric zoom changes keep the
  // pan (clamped to the new bounds) — zooming shouldn't throw a viewport away.
  useEffect(() => {
    if (zoom === "auto") {
      setPan({ x: 0, y: 0 });
      return;
    }
    const s = typeof zoom === "number" && zoom > 0 ? zoom : scaleRef.current;
    const { x: limitX, y: limitY } = panLimit(s);
    setPan((p) => {
      const x = Math.min(limitX, Math.max(-limitX, p.x));
      const y = Math.min(limitY, Math.max(-limitY, p.y));
      return x === p.x && y === p.y ? p : { x, y };
    });
  }, [zoom, fitContainerRef, panLimit]);

  // Right-button drag pans via a translate layer, so it works at any zoom —
  // scroll-based panning dies below 100% because nothing overflows then.
  useEffect(() => {
    const el = fitContainerRef?.current;
    if (!el) return;
    let last: { x: number; y: number } | null = null;
    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 2) return;
      last = { x: e.clientX, y: e.clientY };
      setPanning(true);
      el.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!last) return;
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      last = { x: e.clientX, y: e.clientY };
      const { x: limitX, y: limitY } = panLimit(scaleRef.current);
      setPan((p) => ({
        x: Math.min(limitX, Math.max(-limitX, p.x + dx)),
        y: Math.min(limitY, Math.max(-limitY, p.y + dy)),
      }));
    };
    const onPointerEnd = () => {
      last = null;
      setPanning(false);
    };
    const onContextMenu = (e: Event) => e.preventDefault();
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerEnd);
    el.addEventListener("pointercancel", onPointerEnd);
    el.addEventListener("contextmenu", onContextMenu);
    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerEnd);
      el.removeEventListener("pointercancel", onPointerEnd);
      el.removeEventListener("contextmenu", onContextMenu);
    };
  }, [fitContainerRef, panLimit]);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    const fitElement = fitContainerRef?.current ?? element.parentElement;
    if (!fitElement) return;
    let animationFrame: number | undefined;
    let rafId: number | undefined;

    const calculateScale = () => {
      if (zoom === "auto") {
        const padding = Math.min(window.innerWidth, window.innerHeight) * 0.05; // Padding when in auto mode
        const newScale = Math.min(
          fitElement.clientWidth / (element.clientWidth + 2 * padding),
          fitElement.clientHeight / (element.clientHeight + 2 * padding),
        );
        setScale(newScale);
      } else {
        setScale(zoom || 1);
      }
    };

    if (!hasMeasuredScaleRef.current) {
      setAnimateScale(false);
    }

    calculateScale(); // Initial calculation
    if (!hasMeasuredScaleRef.current) {
      hasMeasuredScaleRef.current = true;
      animationFrame = requestAnimationFrame(() => setAnimateScale(true));
    }

    /*
     * Throttled to one recalc per frame, but on the *leading* edge: dragging the
     * drawer resizes this container continuously, and deferring every update by a
     * frame put the keyboard visibly behind the pointer. Recalculating first and
     * then holding off for a frame keeps it in step.
     */
    let pending = false;
    const schedule = () => {
      if (rafId !== undefined) {
        pending = true;
        return;
      }
      calculateScale();
      rafId = requestAnimationFrame(() => {
        rafId = undefined;
        if (pending) {
          pending = false;
          schedule();
        }
      });
    };

    const resizeObserver = new ResizeObserver(schedule);

    resizeObserver.observe(element);
    resizeObserver.observe(fitElement);

    return () => {
      if (animationFrame !== undefined) {
        cancelAnimationFrame(animationFrame);
      }
      if (rafId !== undefined) {
        cancelAnimationFrame(rafId);
      }
      resizeObserver.disconnect();
    };
  }, [zoom, fitContainerRef]);

  // TODO: Add a bit of padding for rotation when supported
  const rightMost = positions
    .map((k) => k.x + k.width)
    .reduce((a, b) => Math.max(a, b), 0);
  const bottomMost = positions
    .map((k) => k.y + k.height)
    .reduce((a, b) => Math.max(a, b), 0);

  const positionItems = positions.map((p, idx) => {
    const isSelected = selectedPositions
      ? selectedPositions.has(idx)
      : idx === selectedPosition;
    return (
      <div key={p.id} className="absolute hover:z-50" style={scalePosition(p, oneU)}>
        <div
          onClick={(e) => onPositionClicked?.(idx, e)}
          className="transition-transform duration-200"
        >
          <Key
            oneU={oneU}
            hoverZoom={hoverZoom}
            selected={isSelected}
            {...p}
          />
        </div>
      </div>
    );
  });

  return (
    <div
      className="relative keyboard-scale"
      style={{
        height: bottomMost * oneU + "px",
        width: rightMost * oneU + "px",
        flexShrink: 0,
        transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
        transformOrigin: "center center",
        transition: animateScale && !panning ? "transform 240ms ease" : "none",
        willChange: "transform",
      }}
      ref={ref}
    >
      {positionItems}
    </div>
  );
};
