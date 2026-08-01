/*
 * Section ids for the primary sidebar. Shared so the shell and the two views
 * that expose a "default view" picker can't drift apart as capability-gated
 * sections are added.
 *
 * The split is deliberate: `device` holds what lives on the keyboard (identity,
 * active layout, unlock shortcut, factory reset), `preferences` holds what lives
 * in this app (theme, language, default view). Anything that issues an RPC
 * belongs on the device side.
 */
export type NavId =
  | "device"
  | "layers"
  | "behaviors"
  | "lighting"
  | "combos"
  | "motion"
  | "preferences";

/** Sections that exist on every device, so a stored default is always valid. */
export const ALWAYS_AVAILABLE_NAV: NavId[] = ["device", "layers", "preferences"];

export const FALLBACK_NAV: NavId = "layers";

/** Ids used before the device/preferences split, kept readable from storage. */
const LEGACY_NAV_IDS: Record<string, NavId> = {
  keyboard: "device",
  settings: "preferences",
};

const KNOWN_NAV_IDS: NavId[] = [
  "device", "layers", "behaviors", "lighting", "combos", "motion", "preferences",
];

/**
 * Reads a persisted nav id, migrating the pre-split names so a user's chosen
 * default view doesn't silently move on upgrade.
 */
export function deserializeNav(raw: string): NavId {
  const migrated = LEGACY_NAV_IDS[raw];
  if (migrated) return migrated;
  return (KNOWN_NAV_IDS as string[]).includes(raw) ? (raw as NavId) : FALLBACK_NAV;
}

/** Guards a persisted default against a device that lacks that section. */
export function resolveNav(candidate: NavId, available: NavId[]): NavId {
  if (available.includes(candidate)) return candidate;
  if (available.includes(FALLBACK_NAV)) return FALLBACK_NAV;
  return available[0] ?? FALLBACK_NAV;
}
