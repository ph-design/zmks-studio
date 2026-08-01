/*
 * Section ids for the primary sidebar. Shared so the shell and the two settings
 * views (which both expose a "default view" picker) can't drift apart as
 * capability-gated sections are added.
 */
export type NavId =
  | "keyboard"
  | "layers"
  | "behaviors"
  | "lighting"
  | "combos"
  | "motion"
  | "settings";

/** Sections that exist on every device, so a stored default is always valid. */
export const ALWAYS_AVAILABLE_NAV: NavId[] = ["keyboard", "layers", "settings"];

export const FALLBACK_NAV: NavId = "layers";

/** Guards a persisted default against a device that lacks that section. */
export function resolveNav(candidate: NavId, available: NavId[]): NavId {
  if (available.includes(candidate)) return candidate;
  if (available.includes(FALLBACK_NAV)) return FALLBACK_NAV;
  return available[0] ?? FALLBACK_NAV;
}
