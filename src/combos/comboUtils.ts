import type { ComboConfig } from "@zmkfirmware/zmk-studio-ts-client/combos";
import type { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import {
  hid_usage_page_and_id_from_usage,
  hid_usage_get_label,
} from "../hid-usages";

type BehaviorMap = Record<number, GetBehaviorDetailsResponse>;

export function shortHidLabel(usage?: number): string {
  if (usage === undefined || usage === 0) return "?";
  const [page, id] = hid_usage_page_and_id_from_usage(usage & 0x00ffffff);
  return (hid_usage_get_label(page, id) || "?").replace(/^Keyboard /, "");
}

// Best-effort behavior + params label matching the labels used on keycaps.
export function summarizeBinding(
  binding: BehaviorBinding | undefined,
  behaviors: BehaviorMap
): string {
  if (!binding || binding.behaviorId < 0) return "—";
  const name = behaviors[binding.behaviorId]?.displayName;
  if (!name) return `Behavior ${binding.behaviorId}`;
  switch (name) {
    case "None":
      return "None";
    case "Transparent":
      return "▽";
    case "Key Press":
      return shortHidLabel(binding.param1);
    case "Mod-Tap":
      return `${shortHidLabel(binding.param1)} / ${shortHidLabel(binding.param2)}`;
    case "Momentary Layer":
    case "Toggle Layer":
    case "To Layer":
      return `${name} ${binding.param1}`;
    default:
      return name;
  }
}

//empty slots read as unused.
export function summarizeCombo(
  combo: ComboConfig,
  behaviors: BehaviorMap,
  t: (k: string, d: string) => string
): string {
  if (combo.keyPositions.length === 0) {
    return t("combos.unusedSlot", "Unused slot");
  }
  const trigger = combo.keyPositions.map((p) => `#${p}`).join(" + ");
  return `${trigger} → ${summarizeBinding(combo.behavior, behaviors)}`;
}
