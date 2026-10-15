import type { StepId, StepResult } from "./factoryTypes";

/*
 * One line per keyboard that came off the bench.
 *
 * The log exists for the case that matters a week later: a unit comes back and
 * somebody has to know which build was on it, what the key scan saw, and whether
 * anyone was standing at the bench. So the serial number and the firmware file's
 * timestamp are recorded even when every step passed — a PASS with no trace is
 * not evidence of anything.
 *
 * localStorage rather than a file: the web build has no filesystem, and the
 * export button covers getting the data out.
 */

export const FACTORY_LOG_KEY = "zmk-studio-factory-log";
const MAX_ENTRIES = 200;

export interface FactoryLogEntry {
  at: number;
  verdict: "pass" | "fail";
  device?: string;
  serial?: string;
  firmware?: { name: string; modifiedMs: number; size: number };
  steps: { id: StepId; status: string; detail: string }[];
}

export function readFactoryLog(): FactoryLogEntry[] {
  try {
    const raw = localStorage.getItem(FACTORY_LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as FactoryLogEntry[]) : [];
  } catch {
    return [];
  }
}

export function appendFactoryLog(entry: FactoryLogEntry): void {
  try {
    const entries = [entry, ...readFactoryLog()].slice(0, MAX_ENTRIES);
    localStorage.setItem(FACTORY_LOG_KEY, JSON.stringify(entries));
  } catch {
    // A full quota must not take the bench down with it.
  }
}

function csvCell(value: unknown): string {
  const text = value === undefined || value === null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Per-step columns, so a spreadsheet can filter on the step that failed. */
export function factoryLogToCsv(entries: FactoryLogEntry[], stepIds: StepId[]): string {
  const header = [
    "time",
    "verdict",
    "device",
    "serial",
    "firmware",
    "firmware_modified",
    ...stepIds,
  ];
  const rows = entries.map((entry) => {
    const byStep = new Map(entry.steps.map((s) => [s.id, s]));
    return [
      new Date(entry.at).toISOString(),
      entry.verdict,
      entry.device,
      entry.serial,
      entry.firmware?.name,
      entry.firmware ? new Date(entry.firmware.modifiedMs).toISOString() : "",
      ...stepIds.map((id) => {
        const step = byStep.get(id);
        return step ? `${step.status} ${step.detail}`.trim() : "";
      }),
    ];
  });
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

export function downloadText(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function summarizeResult(result: StepResult): string {
  return `${result.status} ${result.detail}`.trim();
}
