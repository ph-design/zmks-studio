import type { ComboConfig } from "@zmkfirmware/zmk-studio-ts-client/combos";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import type { Keymap } from "@zmkfirmware/zmk-studio-ts-client/keymap";

import { shortHidLabel } from "../combos/comboUtils";

type BehaviorMap = Record<number, GetBehaviorDetailsResponse>;

/*
 * Studio can lock a keyboard (`core.lock`) but there is deliberately no unlock
 * RPC — unlocking has to be a physical action so a malicious host can't do it.
 * That makes the unlock binding the one piece of keymap the user must never be
 * able to delete: without it the keyboard can never be edited again, and
 * `core.resetSettings` is no escape hatch because it too requires being
 * unlocked.
 *
 * So Studio's job here is (a) find every way this keyboard can be unlocked,
 * (b) show the user what it is, (c) refuse any edit that would take the count
 * to zero. Firmware backs (c) up on the reserved combo slot by reporting
 * `editableBehavior: false`, which is the authoritative guard — a different
 * client could ignore ours.
 */

/**
 * `GetBehaviorDetailsResponse` carries no stable identifier, only `id` (a local
 * id that varies per firmware build) and `displayName`. Matching on the display
 * name is what the rest of the app does too (see `summarizeBinding` and the
 * keycap renderer), but it breaks if the name is ever changed or localized —
 * worth a stable `identifier` field in the behaviors proto.
 */
export const STUDIO_UNLOCK_BEHAVIOR_NAME = "Studio Unlock";

/**
 * The gesture our firmware ships with. Needed because nothing about the
 * keyboard is readable while it is locked, so the unlock prompt has no way to
 * show the real one on a first connection — see docs/unlock-combo.md.
 */
export const FACTORY_UNLOCK_KEYS = ["Fn", "\\"];

export function findUnlockBehaviorId(behaviors: BehaviorMap): number | undefined {
  for (const details of Object.values(behaviors)) {
    if (details.displayName === STUDIO_UNLOCK_BEHAVIOR_NAME) return details.id;
  }
  return undefined;
}

export interface UnlockComboPath {
  combo: ComboConfig;
  keyLabels: string[];
  /** Firmware refuses to let the slot be repointed away from studio unlock. */
  protectedByFirmware: boolean;
}

export interface UnlockKeymapPath {
  layerIndex: number;
  layerName: string;
  keyPosition: number;
}

export interface UnlockPaths {
  /** Undefined when the firmware doesn't expose a studio unlock behavior. */
  behaviorId?: number;
  combos: UnlockComboPath[];
  keymap: UnlockKeymapPath[];
  /** Every way this keyboard can be unlocked; must never reach zero. */
  total: number;
}

export function collectUnlockPaths(
  behaviors: BehaviorMap,
  keymap: Keymap | undefined,
  combos: ComboConfig[]
): UnlockPaths {
  const behaviorId = findUnlockBehaviorId(behaviors);
  if (behaviorId === undefined) {
    return { behaviorId: undefined, combos: [], keymap: [], total: 0 };
  }

  const comboPaths: UnlockComboPath[] = combos
    .filter((c) => c.behavior?.behaviorId === behaviorId && c.keyPositions.length > 0)
    .map((combo) => ({
      combo,
      keyLabels: combo.keyPositions.map((p) => unlockKeyLabel(p, keymap, behaviors)),
      protectedByFirmware: !combo.editableBehavior,
    }));

  const keymapPaths: UnlockKeymapPath[] = [];
  keymap?.layers.forEach((layer, layerIndex) => {
    layer.bindings.forEach((binding, keyPosition) => {
      if (binding.behaviorId === behaviorId) {
        keymapPaths.push({
          layerIndex,
          layerName: layer.name || `Layer ${layerIndex}`,
          keyPosition,
        });
      }
    });
  });

  return {
    behaviorId,
    combos: comboPaths,
    keymap: keymapPaths,
    total: comboPaths.length + keymapPaths.length,
  };
}

/**
 * Short label for the key at a position, for rendering a gesture as chips.
 *
 * Read off the base layer, since that's what the user's fingers see. Layer keys
 * can only be described by their target ("L1") — the physical legend ("Fn")
 * isn't in the protocol at all, which is the same gap the proposed
 * `KeyPhysicalAttrs.label` field would close.
 */
export function unlockKeyLabel(
  position: number,
  keymap: Keymap | undefined,
  behaviors: BehaviorMap
): string {
  const binding = keymap?.layers[0]?.bindings[position];
  if (!binding) return `#${position}`;

  const name = behaviors[binding.behaviorId]?.displayName;
  switch (name) {
    case "Key Press":
      return shortHidLabel(binding.param1);
    case "Mod-Tap":
    case "Layer-Tap":
      return shortHidLabel(binding.param2);
    case "Momentary Layer":
    case "Toggle Layer":
    case "To Layer":
    case "Sticky Layer":
      return `L${binding.param1}`;
    case undefined:
      return `#${position}`;
    default:
      return name;
  }
}
