import { describe, expect, test } from "bun:test";
import { parseDongleStatus } from "../src/connection/useDongle";
describe("receiver status capability parsing", () => {
  test("reads new battery and validated LED controls", () => {
    expect(parseDongleStatus("BATTERY_PCT=95\r\nLED_CAPS=1\r\nLED_MODE=AUTO\r\nLED_BRIGHTNESS=30\r\nLED_LOW_PCT=20\r\nLED_PERIOD_MS=2000\r\nLED_DIRTY=0")).toEqual({batteryPercent:95,ledCaps:1,ledMode:"AUTO",ledBrightness:30,ledLowPct:20,ledPeriodMs:2000,ledDirty:false});
  });
  test("old firmware keeps pairing while leaving controls unsupported", () => {
    const status=parseDongleStatus("PAIR_STATE=PAIRED\nLINK=CONNECTED\nRF_CH=82\nBATTERY_PCT=-1");
    expect(status.pairState).toBe("PAIRED"); expect(status.rfChannel).toBe(82);
    expect(status.batteryPercent).toBeUndefined(); expect(status.ledCaps).toBeUndefined();
  });
  test("rejects malformed, empty and out-of-range values", () => {
    for(const value of ["", "NaN", "101", "-1", "5.5", "Infinity"])
      expect(parseDongleStatus(`BATTERY_PCT=${value}`).batteryPercent).toBeUndefined();
    expect(parseDongleStatus("LED_CAPS=2\nLED_MODE=INVALID\nLED_BRIGHTNESS=101\nLED_LOW_PCT=0\nLED_PERIOD_MS=100\nLED_DIRTY=wrong")).toEqual({});
    expect(parseDongleStatus("BATTERY_PCT=0").batteryPercent).toBe(0);
  });
});
