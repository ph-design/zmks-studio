import type {
  GetBehaviorDetailsResponse,
  HoldTapConfig,
} from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import { HoldTapFlavor_Flavor } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import type { TFunction } from "i18next";

// Must be outside a component for react-refresh to allow export.
export const FLAVOR_I18N: Record<number, { title: string; desc: string }> = {
  [HoldTapFlavor_Flavor.HOLD_PREFERRED]: {
    title: "holdTap.flavor.holdPreferred",
    desc: "holdTap.flavorDesc.holdPreferred",
  },
  [HoldTapFlavor_Flavor.BALANCED]: {
    title: "holdTap.flavor.balanced",
    desc: "holdTap.flavorDesc.balanced",
  },
  [HoldTapFlavor_Flavor.TAP_PREFERRED]: {
    title: "holdTap.flavor.tapPreferred",
    desc: "holdTap.flavorDesc.tapPreferred",
  },
  [HoldTapFlavor_Flavor.TAP_UNLESS_INTERRUPTED]: {
    title: "holdTap.flavor.tapUnlessInterrupted",
    desc: "holdTap.flavorDesc.tapUnlessInterrupted",
  },
};

export const BUILTIN_MOD_TAP = "Mod-Tap";
export const BUILTIN_LAYER_TAP = "Layer-Tap";

export const USER_PRESET_PREFIX = "ht_";

// Firmware defaults from mod_tap.dtsi, layer_tap.dtsi, behavior-hold-tap.yaml; stock &mt/&lt only.
const BUILTIN_HT_DEFAULTS_COMMON: Omit<HoldTapConfig, "flavor"> = {
  tappingTermMs: 200,
  quickTapMs: -1,
  requirePriorIdleMs: -1,
  retroTap: false,
  holdWhileUndecided: false,
  holdWhileUndecidedLinger: false,
  holdTriggerOnRelease: false,
};

const BUILTIN_DEFAULTS: Record<string, HoldTapConfig> = {
  [BUILTIN_MOD_TAP]: {
    ...BUILTIN_HT_DEFAULTS_COMMON,
    flavor: HoldTapFlavor_Flavor.HOLD_PREFERRED,
  },
  [BUILTIN_LAYER_TAP]: {
    ...BUILTIN_HT_DEFAULTS_COMMON,
    flavor: HoldTapFlavor_Flavor.TAP_PREFERRED,
  },
};

export function getBuiltinDefault(name: string): HoldTapConfig | null {
  return BUILTIN_DEFAULTS[name] ?? null;
}

export function isHoldTapShape(b: GetBehaviorDetailsResponse): boolean {
  return (
    b.metadata?.some(
      (m) =>
        (m.param1?.some((v) => v.hidUsage !== undefined) &&
          (m.param2?.some((v) => v.hidUsage !== undefined) ?? false)) ||
        (m.param1?.some((v) => v.layerId !== undefined) &&
          (m.param2?.some((v) => v.hidUsage !== undefined) ?? false))
    ) ?? false
  );
}

export function isLayerTapShape(b: GetBehaviorDetailsResponse): boolean {
  return (
    b.metadata?.some(
      (m) =>
        m.param1?.some((v) => v.layerId !== undefined) &&
        (m.param2?.some((v) => v.hidUsage !== undefined) ?? false)
    ) ?? false
  );
}

export function isUserPreset(b: GetBehaviorDetailsResponse): boolean {
  return b.displayName.startsWith(USER_PRESET_PREFIX);
}

export function isBuiltinHoldTap(b: GetBehaviorDetailsResponse): boolean {
  return b.displayName === BUILTIN_MOD_TAP || b.displayName === BUILTIN_LAYER_TAP;
}

export function findBuiltinHoldTap(
  behaviors: GetBehaviorDetailsResponse[],
  name: string
): GetBehaviorDetailsResponse | undefined {
  return behaviors.find((b) => b.displayName === name);
}

export function builtinNameForShape(b: GetBehaviorDetailsResponse): string {
  return isLayerTapShape(b) ? BUILTIN_LAYER_TAP : BUILTIN_MOD_TAP;
}

export function byDisplayName(
  a: { displayName: string },
  b: { displayName: string }
): number {
  return a.displayName.localeCompare(b.displayName);
}

export function holdTapPresets(
  behaviors: GetBehaviorDetailsResponse[]
): GetBehaviorDetailsResponse[] {
  return behaviors.filter((b) => isHoldTapShape(b) && isUserPreset(b)).sort(byDisplayName);
}

export function configsEqual(a: HoldTapConfig, b: HoldTapConfig): boolean {
  return (
    a.tappingTermMs === b.tappingTermMs &&
    a.flavor === b.flavor &&
    a.requirePriorIdleMs === b.requirePriorIdleMs &&
    a.quickTapMs === b.quickTapMs &&
    a.retroTap === b.retroTap &&
    a.holdWhileUndecided === b.holdWhileUndecided &&
    a.holdWhileUndecidedLinger === b.holdWhileUndecidedLinger &&
    a.holdTriggerOnRelease === b.holdTriggerOnRelease
  );
}

export function summarizeConfig(cfg: HoldTapConfig, t: TFunction): string {
  const flavor = t(FLAVOR_I18N[cfg.flavor]?.title ?? "holdTap.flavorLabel");
  return `${flavor} · ${cfg.tappingTermMs}${t("holdTap.ms", "ms")}`;
}
