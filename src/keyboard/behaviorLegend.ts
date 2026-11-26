import type { LucideIcon } from "lucide-react";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";

import { BEHAVIOR_CATEGORIES } from "../behaviors/BehaviorCategories";
import { hid_usage_get_label, hid_usage_page_and_id_from_usage } from "../hid-usages";

// Keycap legend generated from the behavior itself, not from a table of
// per-behavior entries: the icon comes from the binding picker's category, the
// text from the metadata the firmware publishes for the behavior's parameters
// (value names like "USB Output", range params like "Profile", layer params),
// and the short form from a small vocabulary of words shared by all behaviors.
// A new behavior therefore gets a sane cap with no client changes; only genuinely
// new *words* need a line in WORD_SHORT.

export interface LegendBinding {
  param1?: number;
  param2?: number;
}

export interface LegendLayer {
  id: number;
  name?: string;
}

export interface BehaviorLegend {
  icon: LucideIcon;
  text: string;
}

// Words that mean the same thing in any behavior's value names. "" drops the
// word; short forms are what lands on the cap.
const WORD_SHORT: Record<string, string> = {
  toggle: "TOG",
  turn: "",
  clear: "CLR",
  select: "SEL",
  selected: "",
  profile: "",
  profiles: "",
  output: "",
  outputs: "",
  color: "",
  of: "",
  to: "",
  the: "",
  a: "",
  an: "",
  all: "ALL",
  disconnect: "DISC",
  usb: "USB",
  ble: "BLE",
  "2.4g": "2.4G",
  hue: "HUE",
  saturation: "SAT",
  brightness: "BRI",
  speed: "SPD",
  effect: "EFF",
  on: "ON",
  off: "OFF",
  power: "PWR",
  unlock: "UNLOCK",
  word: "",
  studio: "",
  external: "",
  z: "",
  so: "",
};

// Commands are verbs: they name the binding on their own, so the noun after them
// is dropped.
const COMMAND_WORDS = new Set(["toggle", "clear", "disconnect"]);

const DIRECTION_SUFFIX: Record<string, string> = { up: "+", down: "-", next: ">", previous: "<", prev: "<" };
const DIRECTION_ALONE: Record<string, string> = { up: "UP", down: "DN", next: "NXT", previous: "PRV", prev: "PRV" };

const splitWords = (name: string) =>
  name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[\s_/-]+/)
    .filter(Boolean);

const shapeWord = (word: string) => {
  const upper = word.toUpperCase();
  return upper.length <= 5 ? upper : upper.slice(0, 4);
};

export function shortenBehaviorLabel(name: string): string {
  const words = splitWords(name).map((w) => w.toLowerCase());
  const hasCommand = words.some((w) => COMMAND_WORDS.has(w));
  const out: string[] = [];
  let pending = "";
  let soloDirection = "";

  for (const word of words) {
    if (word in DIRECTION_SUFFIX) {
      soloDirection = DIRECTION_ALONE[word];
      if (out.length) out[out.length - 1] += DIRECTION_SUFFIX[word];
      else pending = DIRECTION_SUFFIX[word];
      continue;
    }
    if (COMMAND_WORDS.has(word)) {
      out.push(WORD_SHORT[word]);
      continue;
    }
    if (word in WORD_SHORT) {
      if (WORD_SHORT[word]) out.push(WORD_SHORT[word]);
      continue;
    }
    out.push(shapeWord(word));
  }

  if (pending && out.length) out[0] += pending;

  if (hasCommand) {
    return words.includes("all") ? `${out[0]} ALL` : out[0];
  }
  if (!out.length) return soloDirection;
  if (out.join(" ").length > 6) return out[out.length - 1];
  return out.join(" ");
}

// Same first-match-wins order the binding picker uses for its category rail.
function categoryIcon(displayName: string): LucideIcon {
  for (const category of BEHAVIOR_CATEGORIES) {
    if (category.id === "other") continue;
    for (const pattern of category.patterns) {
      if (typeof pattern === "string" ? pattern === displayName : pattern.test(displayName)) {
        return category.icon;
      }
    }
  }
  return BEHAVIOR_CATEGORIES[BEHAVIOR_CATEGORIES.length - 1].icon;
}

// The parameter set that describes this binding: the ones whose enumerated
// values include param1, preferring a set that also has a ranged param2 (a
// profile index matters more than the command that selects it).
function pickParameterSet(behavior: GetBehaviorDetailsResponse, binding: LegendBinding) {
  const sets = behavior.metadata ?? [];
  const byValue = sets.filter((set) => set.param1?.some((value) => value.constant === binding.param1));
  const ranged = byValue.find((set) => set.param2?.some((value) => value.range !== undefined));
  if (ranged) return ranged;
  if (byValue.length) return byValue[0];
  if (binding.param2) {
    const withSecond = sets.find((set) => set.param2?.length);
    if (withSecond) return withSecond;
  }
  return sets[0];
}

function layerName(layers: LegendLayer[], id: number | undefined): string | undefined {
  if (id === undefined) return undefined;
  return layers.find((layer) => layer.id === id)?.name || `L${id}`;
}

function hidLabel(usage: number | undefined): string | undefined {
  if (!usage) return undefined;
  const [page, id] = hid_usage_page_and_id_from_usage(usage & 0x00ffffff);
  return hid_usage_get_label(page, id)?.replace(/^Keyboard /, "");
}

export function behaviorLegend(
  behavior: GetBehaviorDetailsResponse | undefined,
  binding: LegendBinding,
  layers: LegendLayer[] = []
): BehaviorLegend | undefined {
  const displayName = behavior?.displayName;
  // Transparent/None draw their own glyphs, and plain keycodes keep the
  // responsive HID usage label instead of a generated one.
  if (!displayName || displayName === "Transparent" || displayName === "None") return undefined;
  if (displayName === "Key Press") return undefined;

  const icon = categoryIcon(displayName);
  const set = behavior ? pickParameterSet(behavior, binding) : undefined;

  if (!set) {
    const text = shortenBehaviorLabel(displayName);
    return text ? { icon, text } : undefined;
  }

  // A ranged parameter (Bluetooth profile) is what the user varies: show it.
  const rangedSecond = set.param2?.find((value) => value.range !== undefined);
  if (rangedSecond && binding.param2 !== undefined) {
    return { icon, text: String(binding.param2) };
  }

  const first = set.param1?.[0];
  if (!first) {
    const text = shortenBehaviorLabel(displayName);
    return text ? { icon, text } : undefined;
  }

  if (first.hidUsage) return undefined; // HidUsageLabel renders these better.
  if (first.layerId) {
    const text = layerName(layers, binding.param1);
    return text ? { icon, text } : undefined;
  }

  const matched = set.param1?.find((value) => value.constant === binding.param1);
  if (matched?.name) {
    const text = shortenBehaviorLabel(matched.name);
    if (text) return { icon, text };
  }
  if (first.range && binding.param1 !== undefined) {
    return { icon, text: String(binding.param1) };
  }

  const fallback = hidLabel(binding.param1) ?? shortenBehaviorLabel(displayName);
  return fallback ? { icon, text: fallback } : undefined;
}
