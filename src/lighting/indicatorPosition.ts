export const INDICATOR_POSITION_UNSET = 0xff;

export function hasIndicatorPosition(keyPosition: number): boolean {
  return keyPosition !== INDICATOR_POSITION_UNSET;
}
