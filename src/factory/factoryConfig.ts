import { useCallback, useMemo } from "react";

import { useLocalStorageState } from "../misc/useLocalStorageState";

/*
 * Bench configuration. Every value here is something the person bringing a bench
 * up may need to change without a rebuild, so it lives in localStorage rather
 * than being compiled in.
 *
 * Two defaults are deliberately empty — `firmwareDir` (where CI builds land) and
 * `expectedModel` (the board the line is currently building). Guessing either one
 * silently is how a bench ends up flashing the wrong build onto the wrong board,
 * so the UI keeps warning until someone sets them.
 */
export interface FactoryConfig {
  /** Folder the bench keeps .uf2 builds in. */
  firmwareDir: string;
  /** Substring matched against the bootloader's reported Model. Empty accepts anything. */
  expectedModel: string;
  /** Gate on the Preferences entry, so a shipped build is not an open door. */
  pin: string;
  /**
   * Positions per key-scan pass; capped by the test-code pool (55). A board with
   * more keys than this takes another sweep, not another code.
   */
  groupSize: number;
  /** Quiet period before a group's keys are armed, so a stray press can't pass it. */
  settleMs: number;
  /**
   * How long a sweep may go without a *new* position answering before the scan
   * ends. Measured from the last progress, not from the start: a bench hand who
   * stops to look at the screen, or takes a second sweep, must not be timed out
   * for it — an earlier version counted from the beginning and cut a run off
   * while the operator was still reading.
   *
   * It still has a job: without it a genuinely dead key would hold the scan open
   * forever and stall the line on one unit.
   */
  stallTimeoutMs: number;
  /** How long the operator has to prove the host receives keystrokes. */
  precheckMs: number;
  /**
   * How long a *sweep* may produce nothing before the scan stops and says so.
   * This is the difference between a tool that hangs for two and a half minutes
   * and one that reports the problem in ten seconds.
   */
  noInputMs: number;
  /** Raw LIS2DH12 counts a deliberate shake has to beat. */
  imuMagnitude: number;
  /** Dwell per colour in the LED sweep. */
  rgbDwellMs: number;
}

export const DEFAULT_FACTORY_CONFIG: FactoryConfig = {
  firmwareDir: "",
  expectedModel: "",
  pin: "246813",
  groupSize: 55,
  settleMs: 400,
  stallTimeoutMs: 90000,
  precheckMs: 30000,
  noInputMs: 20000,
  imuMagnitude: 48,
  rgbDwellMs: 900,
};

const STORAGE_KEY = "zmk-studio-factory-config";

export function useFactoryConfig(): [
  FactoryConfig,
  (next: Partial<FactoryConfig>) => void,
] {
  const [raw, setRaw] = useLocalStorageState<string>(
    STORAGE_KEY,
    JSON.stringify(DEFAULT_FACTORY_CONFIG)
  );

  const config = useMemo<FactoryConfig>(() => {
    try {
      return { ...DEFAULT_FACTORY_CONFIG, ...(JSON.parse(raw) as Partial<FactoryConfig>) };
    } catch {
      return DEFAULT_FACTORY_CONFIG;
    }
  }, [raw]);

  const update = useCallback(
    (next: Partial<FactoryConfig>) => {
      setRaw(JSON.stringify({ ...config, ...next }));
    },
    [config, setRaw]
  );

  return [config, update];
}
