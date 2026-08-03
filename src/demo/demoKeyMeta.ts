/*
 * ES60's frame button is a per-layer key position, so it belongs in the keymap
 * — the only thing Studio is missing is *which* position it is and what to call
 * it. That wants two optional fields on `KeyPhysicalAttrs` (`kind`, `label`);
 * until the generated client carries them, the demo layout publishes the same
 * metadata out-of-band so the rendering path can be built and reviewed.
 */

const DEMO_LABEL = "Demo";

export interface DemoKeyMeta {
  kind: "side" | "encoder";
  label: string;
}

let demoKeyMeta: Record<number, DemoKeyMeta> = {};

/** Called by the demo transport when it builds its physical layout. */
export function setDemoKeyMeta(meta: Record<number, DemoKeyMeta>) {
  demoKeyMeta = meta;
}

export function getDemoKeyMeta(connectionLabel: string): Record<number, DemoKeyMeta> {
  return connectionLabel === DEMO_LABEL ? demoKeyMeta : {};
}
