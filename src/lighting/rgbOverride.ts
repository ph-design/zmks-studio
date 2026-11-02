const RGB_OVERRIDE = 0x01000000;
const RGB_MASK = 0x00ffffff;

// Null means transparent; zero means explicit black.
export function encodeRgbOverride(color: number | null): number {
  return color === null ? 0 : RGB_OVERRIDE | (color & RGB_MASK);
}

export function isRgbOverrideTransparent(color: number): boolean {
  return color === 0;
}
