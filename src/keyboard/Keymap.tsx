import type { RefObject } from "react";

import {
  PhysicalLayout,
  Keymap as KeymapMsg,
} from "@zmkfirmware/zmk-studio-ts-client/keymap";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";

import {
  LayoutZoom,
  PhysicalLayout as PhysicalLayoutComp,
} from "./PhysicalLayout";
import { HidUsageLabel } from "./HidUsageLabel";
import {
  hid_usage_page_and_id_from_usage,
  hid_usage_get_label,
} from "../hid-usages";

type BehaviorMap = Record<number, GetBehaviorDetailsResponse>;

function getShortHidLabel(usage?: number): string {
  if (usage === undefined || usage === 0) return "?";
  const masked = usage & 0x00ffffff;
  const [page, id] = hid_usage_page_and_id_from_usage(masked);
  const label = hid_usage_get_label(page, id) || "?";
  return label.replace(/^Keyboard /, "");
}

export interface KeymapProps {
  layout: PhysicalLayout;
  keymap: KeymapMsg;
  behaviors: BehaviorMap;
  scale: LayoutZoom;
  selectedLayerIndex: number;
  selectedKeyPosition: number | undefined;
  pressedUsages?: Set<number>;
  fitContainerRef?: RefObject<HTMLElement>;
  onKeyPositionClicked: (keyPosition: number) => void;
}

export const Keymap = ({
  layout,
  keymap,
  behaviors,
  scale,
  selectedLayerIndex,
  selectedKeyPosition,
  pressedUsages,
  fitContainerRef,
  onKeyPositionClicked,
}: KeymapProps) => {
  if (!keymap.layers[selectedLayerIndex]) {
    return <></>;
  }

  // A key lights up when a live keypress's HID usage matches its bound keycode
  // (param1 for &kp, param2 for the tap side of mod-tap/layer-tap). The mod byte
  // (bits 24-31) is masked off so plain letters match regardless of held mods.
  const isPressed = (binding: { param1?: number; param2?: number } | undefined) => {
    if (!pressedUsages || pressedUsages.size === 0 || !binding) return false;
    const p1 = (binding.param1 ?? 0) & 0x00ffffff;
    const p2 = (binding.param2 ?? 0) & 0x00ffffff;
    return (p1 !== 0 && pressedUsages.has(p1)) || (p2 !== 0 && pressedUsages.has(p2));
  };

  const positions = layout.keys.map((k, i) => {
    if (i >= keymap.layers[selectedLayerIndex].bindings.length) {
      return {
        id: `key-${i}`,
        header: "Unknown",
        x: k.x / 100.0,
        y: k.y / 100.0,
        width: k.width / 100,
        height: k.height / 100.0,
        children: <div key={`${selectedLayerIndex}-${i}`} className="animate-fade-in"><span></span></div>,
      };
    }

    return {
      id: `key-${i}`,
      header:
        behaviors[keymap.layers[selectedLayerIndex].bindings[i].behaviorId]
          ?.displayName || "Unknown",
      x: k.x / 100.0,
      y: k.y / 100.0,
      width: k.width / 100,
      height: k.height / 100.0,
      r: (k.r || 0) / 100.0,
      rx: (k.rx || 0) / 100.0,
      ry: (k.ry || 0) / 100.0,
      pressed: isPressed(keymap.layers[selectedLayerIndex].bindings[i]),
      children: (
        <div key={`${selectedLayerIndex}-${i}`} className="animate-fade-in">
          {(() => {
            const binding = keymap.layers[selectedLayerIndex].bindings[i];
            const behaviorName = behaviors[binding.behaviorId]?.displayName;
            if (behaviorName === "None") {
              return <span className="text-xl opacity-60">⊘</span>;
            }
            if (behaviorName === "Transparent") {
              return (
                <svg className="w-5 h-5 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14" />
                  <path d="M18 13l-6 6" />
                  <path d="M6 13l6 6" />
                </svg>
              );
            }
            if (behaviorName === "Mod-Tap") {
              const holdLabel = getShortHidLabel(binding.param1);
              const tapLabel = getShortHidLabel(binding.param2);
              return (
                <div className="flex flex-col items-center leading-none text-center max-w-full px-0.5">
                  <span className="text-[0.45rem] opacity-50 leading-none">hold</span>
                  <span className="text-[0.6rem] font-semibold leading-tight truncate max-w-full">{holdLabel}</span>
                  <span className="text-[0.45rem] opacity-50 leading-none mt-0.5">tap</span>
                  <span className="text-[0.6rem] font-semibold leading-tight truncate max-w-full">{tapLabel}</span>
                </div>
              );
            }
            if (behaviorName === "Layer-Tap") {
              const layerName = keymap.layers.find(l => l.id === binding.param1)?.name || `L${binding.param1}`;
              const tapLabel = getShortHidLabel(binding.param2);
              return (
                <div className="flex flex-col items-center leading-none text-center max-w-full px-0.5">
                  <span className="text-[0.45rem] opacity-50 leading-none">hold</span>
                  <span className="text-[0.6rem] font-semibold leading-tight truncate max-w-full">{layerName}</span>
                  <span className="text-[0.45rem] opacity-50 leading-none mt-0.5">tap</span>
                  <span className="text-[0.6rem] font-semibold leading-tight truncate max-w-full">{tapLabel}</span>
                </div>
              );
            }
            if (behaviorName === "Momentary Layer" || behaviorName === "Toggle Layer" || behaviorName === "Sticky Layer" || behaviorName === "To Layer") {
              const layerName = keymap.layers.find(l => l.id === binding.param1)?.name || `L${binding.param1}`;
              return (
                <span className="text-xs font-semibold text-center leading-tight">{layerName}</span>
              );
            }
            return (
              <span className="text-[0.7rem] font-medium leading-tight">
                <HidUsageLabel hid_usage={binding.param1} />
              </span>
            );
          })()}
        </div>
      ),
    };
  });

  return (
    <PhysicalLayoutComp
      positions={positions}
      oneU={42}
      hoverZoom={true}
      zoom={scale}
      fitContainerRef={fitContainerRef}
      selectedPosition={selectedKeyPosition}
      onPositionClicked={onKeyPositionClicked}
    />
  );
};
