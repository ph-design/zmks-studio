import { useContext, useMemo } from "react";

import type {
  KeyPhysicalAttrs,
  PhysicalLayout,
} from "@zmkfirmware/zmk-studio-ts-client/keymap";

import { ConnectionContext } from "../rpc/ConnectionContext";
import { getDemoKeyMeta } from "../demo/demoKeyMeta";

/*
 * Non-matrix inputs (ES60's frame button, and encoders later) are ordinary
 * per-layer key positions — they bind, undo, and save through the keymap like
 * any other key. What the keymap message can't tell us today is that a given
 * position *isn't* part of the main matrix, so the canvas renders it as an
 * anonymous square somewhere off to the side.
 *
 * The fix is two optional fields on `KeyPhysicalAttrs`:
 *
 *   optional KeyKind kind  = 8;  // MATRIX | SIDE_BUTTON | ENCODER
 *   optional string  label = 9;  // "Side", "Fn", …
 *
 * Old firmware omits them and everything renders exactly as it does now, so the
 * change is backward compatible. This module is the single place that reads
 * them — if the firmware team lands different field names, only `attrsMeta`
 * changes.
 */

export type KeyKind = "matrix" | "side" | "encoder";

export interface KeyMeta {
  kind: KeyKind;
  label?: string;
}

/** Proposed proto fields, absent from the generated client so far. */
type ExtendedAttrs = KeyPhysicalAttrs & {
  kind?: number;
  label?: string;
};

const KIND_BY_PROTO_VALUE: Record<number, KeyKind> = {
  0: "matrix",
  1: "side",
  2: "encoder",
};

function attrsMeta(attrs: KeyPhysicalAttrs): KeyMeta | undefined {
  const ext = attrs as ExtendedAttrs;
  if (ext.kind === undefined && ext.label === undefined) return undefined;

  const kind = ext.kind !== undefined ? KIND_BY_PROTO_VALUE[ext.kind] : undefined;
  if ((kind ?? "matrix") === "matrix" && !ext.label) return undefined;

  return { kind: kind ?? "matrix", label: ext.label };
}

/**
 * Key positions that have no LED behind them, so the lighting views can show
 * them as unlit instead of offering a colour that would go nowhere.
 *
 * Two signals, both conservative:
 *  - beyond `ledKeyCount` — the firmware's own count of LED-mapped positions,
 *    which is authoritative when reported;
 *  - a frame button, which is a bare switch on the case (encoders are left
 *    alone; those can carry an LED).
 */
export function ledlessPositions(
  keyCount: number,
  meta: Record<number, KeyMeta>,
  ledKeyCount?: number
): Set<number> {
  const out = new Set<number>();
  for (let i = 0; i < keyCount; i++) {
    if (ledKeyCount !== undefined && ledKeyCount > 0 && i >= ledKeyCount) {
      out.add(i);
    } else if (meta[i]?.kind === "side") {
      out.add(i);
    }
  }
  return out;
}

/**
 * Metadata for the non-matrix positions of a layout, keyed by key position.
 * Positions absent from the map are plain matrix keys.
 */
export function useKeyMeta(layout: PhysicalLayout | undefined): Record<number, KeyMeta> {
  const { conn } = useContext(ConnectionContext);
  const label = conn?.label ?? "";

  return useMemo(() => {
    if (!layout) return {};

    const meta: Record<number, KeyMeta> = {};
    layout.keys.forEach((attrs, i) => {
      const fromProto = attrsMeta(attrs);
      if (fromProto) meta[i] = fromProto;
    });

    // Out-of-band demo metadata, only until the codec carries the fields above.
    for (const [position, demo] of Object.entries(getDemoKeyMeta(label))) {
      const index = Number(position);
      if (meta[index] === undefined && index < layout.keys.length) {
        meta[index] = { kind: demo.kind, label: demo.label };
      }
    }

    return meta;
  }, [layout, label]);
}
