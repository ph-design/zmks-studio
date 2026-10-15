import type { CarbonTheme } from "../../carbon/theme";
import type { FactoryConfig } from "../factoryConfig";
import type { StepResult } from "../factoryTypes";

/** What the bench captured about the unit, for the log line. */
export interface FactoryRecord {
  device?: string;
  serial?: string;
  firmware?: { name: string; modifiedMs: number; size: number };
}

export interface StepProps {
  th: CarbonTheme;
  t: (key: string, fallback: string) => string;
  config: FactoryConfig;
  /**
   * Attaches to the first USB serial device App can find. The bench has exactly
   * one keyboard plugged in, so there is nothing to choose between — which is
   * the whole reason the factory flow does not reuse the connect modal.
   */
  onAutoConnect: () => Promise<boolean>;
  onDisconnect: () => void;
  record: FactoryRecord;
  updateRecord: (patch: Partial<FactoryRecord>) => void;
  onDone: (result: StepResult) => void;
}

export function serialHex(serial?: Uint8Array): string | undefined {
  if (!serial || serial.length === 0) return undefined;
  return Array.from(serial)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
