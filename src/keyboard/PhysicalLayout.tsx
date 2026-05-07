import {
  CSSProperties,
  PropsWithChildren,
  RefObject,
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
  const [animateScale, setAnimateScale] = useState(false);

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

    const resizeObserver = new ResizeObserver(() => {
      // Throttle: only recalc once per frame to avoid layout thrashing
      if (rafId !== undefined) return;
      rafId = requestAnimationFrame(() => {
        rafId = undefined;
        calculateScale();
      });
    });

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
      className="relative"
      style={{
        height: bottomMost * oneU + "px",
        width: rightMost * oneU + "px",
        transform: `scale(${scale})`,
        transformOrigin: "center center",
        transition: animateScale ? "transform 240ms ease" : "none",
        willChange: "transform",
      }}
      ref={ref}
    >
      {positionItems}
    </div>
  );
};
