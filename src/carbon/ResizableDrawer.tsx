import { useCallback, useRef, type ReactNode } from "react";

import type { CarbonTheme } from "./theme";
import { useLocalStorageState } from "../misc/useLocalStorageState";

/**
 * The bottom drawer under a keyboard canvas — binding picker, lighting controls —
 * resizable by dragging its top edge.
 *
 * Height was a set of `min-height` media queries before, which meant the split
 * between keyboard and drawer was whatever we guessed for that window size. The
 * canvas already re-fits on its own: `PhysicalLayout` observes the fit container,
 * so shrinking the drawer widens the keyboard live with no extra wiring.
 *
 * Two things make the drag feel right rather than merely work:
 *  - `maxHeight` is a percentage, so a height stored on a tall window can't
 *    squash the canvas to nothing on a short one. Clamping the stored number on
 *    resize would fight the user; letting CSS cap it doesn't.
 *  - `panel-resizing` on <html> suppresses the canvas's 240ms scale transition
 *    for the duration, otherwise every drag frame starts a new easing curve and
 *    the keyboard lags a quarter second behind the pointer.
 */
const HANDLE_H = 6;

/* Hoisted: `useLocalStorageState` has its options in an effect's dep list, so a
   fresh literal would re-run the write on every render — and this component
   re-renders on every frame of a drag. */
const STORE = {
  serialize: String,
  deserialize: (v: string) => Number(v) || defaultDrawerHeight(),
};

export function ResizableDrawer({ th, storageKey, minHeight = 150, children }: {
  th: CarbonTheme;
  /** Per-panel, so the keymap and lighting splits are remembered separately. */
  storageKey: string;
  minHeight?: number;
  children: ReactNode;
}) {
  const [height, setHeight] = useLocalStorageState<number>(
    storageKey,
    defaultDrawerHeight(),
    STORE
  );
  const ref = useRef<HTMLDivElement>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const el = ref.current;
      if (!el || e.button !== 0) return;
      e.preventDefault();

      const startY = e.clientY;
      const startH = el.getBoundingClientRect().height;
      // Leave the canvas a usable minimum whatever the pointer does.
      const available = el.parentElement?.getBoundingClientRect().height ?? window.innerHeight;
      const maxH = Math.max(minHeight, available - 180);

      document.documentElement.classList.add("panel-resizing");

      const onMove = (ev: PointerEvent) => {
        const next = startH - (ev.clientY - startY);
        setHeight(Math.round(Math.min(maxH, Math.max(minHeight, next))));
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        document.documentElement.classList.remove("panel-resizing");
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp, { once: true });
      window.addEventListener("pointercancel", onUp, { once: true });
    },
    [minHeight, setHeight]
  );

  return (
    <div
      ref={ref}
      style={{
        position: "relative",
        flexShrink: 0,
        height,
        maxHeight: "70%",
        minHeight,
        background: th.layer1,
        borderTop: `1px solid ${th.border}`,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Sits on the border itself, hanging above the drawer so the whole edge is
          grabbable rather than just the pixels inside it. */}
      <div
        role="separator"
        aria-orientation="horizontal"
        title="Drag to resize"
        onPointerDown={onPointerDown}
        onDoubleClick={() => setHeight(defaultDrawerHeight())}
        className="drawer-resize-handle"
        style={{
          position: "absolute",
          top: -HANDLE_H / 2 - 1,
          left: 0,
          right: 0,
          height: HANDLE_H,
          cursor: "ns-resize",
          zIndex: 5,
          touchAction: "none",
        }}
      />
      {children}
    </div>
  );
}

/** Roughly what the old media-query ladder produced for this window height. */
function defaultDrawerHeight(): number {
  const h = window.innerHeight;
  if (h >= 1080) return 400;
  if (h >= 900) return 340;
  if (h >= 750) return 280;
  if (h >= 650) return 240;
  return 200;
}
