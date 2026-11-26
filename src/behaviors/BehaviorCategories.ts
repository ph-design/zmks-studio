import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import {
  Keyboard,
  Layers,
  Wrench,
  Wifi,
  Settings,
  MoreHorizontal,
  Sun,
  Mouse,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface BehaviorCategory {
  id: string;
  label: string;
  icon: LucideIcon;
  patterns: (string | RegExp)[];
}

export const BEHAVIOR_CATEGORIES: BehaviorCategory[] = [
  {
    id: "basic",
    label: "Basic",
    icon: Keyboard,
    patterns: ["Key Press", "None", "Transparent"],
  },
  {
    id: "layers",
    label: "Layers",
    icon: Layers,
    patterns: [
      "Momentary Layer",
      "To Layer",
      "Toggle Layer",
      "Layer-Tap",
      "Sticky Layer",
    ],
  },
  {
    id: "modifiers",
    label: "Modifiers",
    icon: Wrench,
    patterns: [
      "Mod-Tap",
      "Sticky Key",
      "Grave/Escape",
      "Key Repeat",
      "Key Toggle",
      "Caps Word",
    ],
  },
  {
    id: "bluetooth",
    label: "Connection",
    icon: Wifi,
    patterns: ["Bluetooth", "Output Selection", "Output Select"],
  },
  {
    id: "system",
    label: "System",
    icon: Settings,
    patterns: [
      "External Power",
      "Reset",
      "Bootloader",
      "Studio Unlock",
      "z_so_off",
    ],
  },
  {
    id: "lighting",
    label: "Lighting",
    icon: Sun,
    patterns: ["Underglow"],
  },
  {
    id: "mouse",
    label: "Mouse",
    icon: Mouse,
    patterns: ["Mouse Key Press", "mouse_move", "mouse_scroll"],
  },
  {
    id: "other",
    label: "Other",
    icon: MoreHorizontal,
    patterns: [], // catch-all
  },
];

export function categorizeBehaviors(
  behaviors: GetBehaviorDetailsResponse[]
): Record<string, GetBehaviorDetailsResponse[]> {
  const result: Record<string, GetBehaviorDetailsResponse[]> = {};

  for (const cat of BEHAVIOR_CATEGORIES) {
    result[cat.id] = [];
  }

  for (const behavior of behaviors) {
    let matched = false;
    for (const cat of BEHAVIOR_CATEGORIES) {
      if (cat.id === "other") continue;
      for (const pattern of cat.patterns) {
        if (typeof pattern === "string") {
          if (behavior.displayName === pattern) {
            result[cat.id].push(behavior);
            matched = true;
            break;
          }
        } else if (pattern.test(behavior.displayName)) {
          result[cat.id].push(behavior);
          matched = true;
          break;
        }
      }
      if (matched) break;
    }
    if (!matched) {
      result["other"].push(behavior);
    }
  }

  for (const cat of BEHAVIOR_CATEGORIES) {
    result[cat.id].sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  return result;
}
