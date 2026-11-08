// React state and AT transport for USB dongles.
import { useEffect, useRef, useState } from "react";

import { errorText } from "../misc/errors";
import { sleep, type Translate } from "../misc/format";

export type DonglePhase = "idle" | "connecting" | "open" | "lost";

export interface TranscriptEntry {
  id: number;
  at: number;
  dir: "tx" | "rx";
  text: string;
}

export interface DongleController {
  supported: boolean;
  phase: DonglePhase;
  port?: string;
  firmware?: string;
  status?: DongleStatus;
  error?: string;
  busy: boolean;
  transcript: TranscriptEntry[];
  connect: (anyPort?: boolean) => Promise<void>;
  disconnect: () => Promise<void>;
  refresh: () => Promise<void>;
  send: (command: string) => Promise<AtResult | undefined>;
  pair: (keyHex: string, rfAddrHex: string, channel: number) => Promise<AtResult>;
  queryStatus: () => Promise<DongleStatus>;
  clear: () => Promise<AtResult | undefined>;
  reset: () => Promise<AtResult | undefined>;
  bootloader: () => Promise<AtResult | undefined>;
  clearTranscript: () => void;
}

const TRANSCRIPT_LIMIT = 400;
const AT_TIMEOUT_MS = 3000;
const CONNECT_TIMEOUT_MS = 10000;

function dongleErrorText(t: Translate, error: unknown): string {
  if (error instanceof DongleError) {
    switch (error.code) {
      case "unsupported":
        return t("carbon.conn.dongleUnsupportedShort", "This browser has no Web Serial support.");
      case "cancelled":
        return t("carbon.conn.dongleCancelled", "Port selection was cancelled — nothing was opened.");
      case "not-open":
        return t("carbon.conn.atNotOpen", "The dongle's serial port is not open.");
      case "open-failed":
        return `${t("carbon.conn.dongleOpenFailed", "Could not open the serial port")}：${error.message}`;
      default:
        break;
    }
  }

  return errorText(t, error);
}

function atFailureText(t: Translate, result: AtResult): string | undefined {
  if (result.note) return result.note;
  if (result.timedOut) {
    return t(
      "carbon.conn.atTimeout",
      "No answer within a few seconds. Check the dongle has compatible AT firmware and that nothing else holds the port."
    );
  }
  if (!result.ok) {
    return `${t("carbon.conn.atError", "The dongle answered with ERROR")}：${result.raw.trim().split("\n")[0] || "ERROR"}`;
  }
  return undefined;
}

export function useDongle(t: Translate): DongleController {
  const [client] = useState(() => new DongleSerial());
  const [phase, setPhase] = useState<DonglePhase>("idle");
  const [port, setPort] = useState<string | undefined>();
  const [firmware, setFirmware] = useState<string | undefined>();
  const [status, setStatus] = useState<DongleStatus | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);

  const tRef = useRef(t);
  tRef.current = t;
  const nextId = useRef(0);
  const [connectState] = useState(() => {
    const state = { generation: 0 };
    return {
      state,
      invalidate: () => {
        state.generation++;
      },
    };
  });

  const push = (dir: "tx" | "rx", text: string) => {
    const entry: TranscriptEntry = { id: (nextId.current += 1), at: Date.now(), dir, text };
    setTranscript((prev) => {
      const next = [...prev, entry];
      return next.length > TRANSCRIPT_LIMIT ? next.slice(next.length - TRANSCRIPT_LIMIT) : next;
    });
  };

  useEffect(() => {
    client.onLine = (line) => {
      if (line.trim()) push("rx", line);
    };
    client.onLost = (reason) => {
      const head = tRef.current(
        "carbon.conn.dongleLost",
        "The dongle's serial port disappeared. Plug it back in and reconnect."
      );
      setPhase("lost");
      setPort(undefined);
      setFirmware(undefined);
      setStatus(undefined);
      setBusy(false);
      setError(reason ? `${head}（${reason}）` : head);
    };

    return () => {
      connectState.invalidate();
      client.onLine = undefined;
      client.onLost = undefined;
      void client.close();
    };
  }, [client, connectState]);

  const refresh = async () => {
    if (!client.isOpen) {
      setError(tRef.current("carbon.conn.atNotOpen", "The dongle's serial port is not open."));
      return;
    }

    setBusy(true);
    try {
      push("tx", "AT+GMR");
      const version = await client.send("AT+GMR");
      if (version.ok) setFirmware(parseDongleVersion(version.raw));

      push("tx", "AT+2G4?");
      const queried = await client.send("AT+2G4?");
      if (queried.ok) {
        setStatus(parseDongleStatus(queried.raw));
        setError(undefined);
      } else {
        setError(atFailureText(tRef.current, queried));
      }
    } catch (thrown) {
      setError(dongleErrorText(tRef.current, thrown));
    } finally {
      setBusy(false);
    }
  };

  const connect = async (anyPort = false) => {
    const generation = ++connectState.state.generation;
    setError(undefined);
    setFirmware(undefined);
    setStatus(undefined);
    setPhase("connecting");
    push("tx", anyPort ? "opening any serial port" : "opening 5048:FF11");

    try {
      const candidates = anyPort ? [await requestAnySerialPort()] : await requestDonglePorts();
      if (generation !== connectState.state.generation) return;

      const attempt = async () => {
        let lastError: unknown;

        for (let i = 0; i < candidates.length; i++) {
          const candidate = candidates[i];
          try {
            push("tx", `probing ${portLabel(candidate)} (${i + 1}/${candidates.length})`);
            await client.open(candidate);
            const probe = await client.send("AT");

            if (generation !== connectState.state.generation) {
              await client.close();
              return;
            }

            if (!probe.ok) {
              lastError = new DongleError(
                "open-failed",
                probe.note || probe.raw.trim() || "No AT response on this serial port"
              );
              await client.close();
              continue;
            }

            setPort(portLabel(candidate));
            setPhase("open");
            push("rx", `— ${portLabel(candidate)} open @ 115200 8N1 —`);
            await refresh();
            return;
          } catch (thrown) {
            lastError = thrown;
            await client.close();
            if (generation !== connectState.state.generation) return;
          }
        }

        throw lastError ?? new DongleError("open-failed", "No compatible AT serial port found");
      };

      await withTimeout(attempt(), CONNECT_TIMEOUT_MS, "Dongle connection timed out");
    } catch (thrown) {
      if (generation !== connectState.state.generation) {
        void client.close();
        return;
      }
      connectState.state.generation++;
      void client.close();
      setPhase("idle");
      setPort(undefined);
      setError(dongleErrorText(tRef.current, thrown));
    }
  };

  const disconnect = async () => {
    connectState.state.generation++;
    await client.close();
    setPhase("idle");
    setPort(undefined);
    setFirmware(undefined);
    setStatus(undefined);
    setError(undefined);
    push("rx", "— port closed —");
  };

  const send = async (command: string): Promise<AtResult | undefined> => {
    const commandLine = command.trim();
    if (!commandLine) return undefined;

    if (!client.isOpen) {
      setError(tRef.current("carbon.conn.atNotOpen", "The dongle's serial port is not open."));
      return undefined;
    }

    push("tx", commandLine);
    setBusy(true);
    try {
      const result = await client.send(commandLine, AT_TIMEOUT_MS);
      setError(atFailureText(tRef.current, result));

      // Keep the parsed state in step with whatever the terminal asked.
      if (/^AT\+?(INFO|2G4\?)/i.test(commandLine)) {
        const parsed = parseDongleStatus(result.raw);
        if (Object.keys(parsed).length > 0) setStatus(parsed);
      }
      if (/^AT\+GMR/i.test(commandLine)) {
        const version = parseDongleVersion(result.raw);
        if (version) setFirmware(version);
      }

      return result;
    } catch (thrown) {
      setError(dongleErrorText(tRef.current, thrown));
      return undefined;
    } finally {
      setBusy(false);
    }
  };

  const pair = async (keyHex: string, rfAddrHex: string, channel: number): Promise<AtResult> => {
    push("tx", `AT+PAIR=${keyHex},${rfAddrHex},${channel.toString(16).toUpperCase().padStart(2, "0")}`);
    return client.pair(keyHex, rfAddrHex, channel);
  };

  const queryStatus = async (): Promise<DongleStatus> => {
    const result = await send("AT+2G4?");
    const parsed = result?.ok ? parseDongleStatus(result.raw) : {};
    if (result?.ok) setStatus(parsed);
    return parsed;
  };

  return {
    supported: dongleSupported(),
    phase,
    port,
    firmware,
    status,
    error,
    busy,
    transcript,
    connect,
    disconnect,
    refresh,
    send,
    pair,
    queryStatus,
    clear: () => send("AT+CLEAR"),
    reset: () => send("AT+RST"),
    bootloader: () => send("AT+BL"),
    clearTranscript: () => setTranscript([]),
  };
}


export const DONGLE_VENDOR_ID = 0x5048;
export const DONGLE_PRODUCT_ID = 0xff11;
export const DONGLE_BAUD_RATE = 115200;

export const DONGLE_FILTERS: SerialPortFilter[] = [
  { usbVendorId: DONGLE_VENDOR_ID, usbProductId: DONGLE_PRODUCT_ID },
];

const DEFAULT_TIMEOUT_MS = 2500;
const FLASH_TIMEOUT_MS = 3500;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

export type DongleErrorCode = "unsupported" | "cancelled" | "not-open" | "open-failed";

export class DongleError extends Error {
  readonly code: DongleErrorCode;

  constructor(code: DongleErrorCode, message: string) {
    super(message);
    this.name = "DongleError";
    this.code = code;
  }
}

export interface AtResult {
  command: string;
  ok: boolean;
  lines: string[];
  raw: string;
  timedOut: boolean;
  note?: string;
}

export interface DongleStatus {
  pairState?: string;
  factoryKey?: boolean;
  keyId?: string;
  addrPaired?: boolean;
  rfAddr?: string;
  rfChannel?: number;
  link?: string;
  rx?: number;
  rxDecryptFail?: number;
}

interface Pending {
  command: string;
  lines: string[];
  raw: string;
  resolve: (result: AtResult) => void;
  timer: ReturnType<typeof setTimeout>;
}

export function serialApi(): Serial | undefined {
  if (typeof navigator === "undefined") return undefined;
  return (navigator as unknown as { serial?: Serial }).serial;
}

export function dongleSupported(): boolean {
  return !!serialApi();
}

export function isDonglePortInfo(info: SerialPortInfo): boolean {
  return info.usbVendorId === DONGLE_VENDOR_ID && info.usbProductId === DONGLE_PRODUCT_ID;
}

export function portLabel(port: SerialPort): string {
  const info = port.getInfo();
  if (info.usbVendorId === undefined) return "serial";
  const vid = info.usbVendorId.toString(16).padStart(4, "0").toUpperCase();
  const pid = (info.usbProductId ?? 0).toString(16).padStart(4, "0").toUpperCase();
  return `USB ${vid}:${pid}`;
}

function isCancel(error: unknown): boolean {
  return error instanceof DOMException && error.name === "NotFoundError";
}

export async function requestDonglePorts(): Promise<SerialPort[]> {
  const serial = serialApi();
  if (!serial) {
    throw new DongleError("unsupported", "Web Serial is not available in this browser");
  }

  const granted = await serial.getPorts().catch(() => [] as SerialPort[]);
  const known = granted.filter((port) => isDonglePortInfo(port.getInfo()));
  if (known.length > 0) return known;

  try {
    return [await serial.requestPort({ filters: DONGLE_FILTERS })];
  } catch (error) {
    if (isCancel(error)) {
      throw new DongleError("cancelled", "Port selection cancelled");
    }
    try {
      return [await serial.requestPort()];
    } catch (retry) {
      throw isCancel(retry)
        ? new DongleError("cancelled", "Port selection cancelled")
        : new DongleError("open-failed", describe(retry));
    }
  }
}

// Unfiltered picker
export async function requestAnySerialPort(): Promise<SerialPort> {
  const serial = serialApi();
  if (!serial) {
    throw new DongleError("unsupported", "Web Serial is not available in this browser");
  }

  const granted = await serial.getPorts().catch(() => [] as SerialPort[]);
  if (granted.length === 1) return granted[0];

  try {
    return await serial.requestPort();
  } catch (error) {
    throw isCancel(error)
      ? new DongleError("cancelled", "Port selection cancelled")
      : new DongleError("open-failed", describe(error));
  }
}

function describe(value: unknown): string {
  if (value instanceof Error && value.message) return value.message;
  return String(value);
}

export function parseDongleStatus(raw: string): DongleStatus {
  const status: DongleStatus = {};

  for (const line of raw.split(/\r?\n/)) {
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim().toUpperCase();
    const value = line.slice(eq + 1).trim();

    switch (key) {
      case "PAIR_STATE":
        status.pairState = value.toUpperCase();
        break;
      case "FACTORY_KEY":
        status.factoryKey = value === "1";
        break;
      case "KEY_ID":
        status.keyId = value.toUpperCase();
        break;
      case "ADDR_PAIRED":
        status.addrPaired = value === "1";
        break;
      case "RF_ADDR":
        status.rfAddr = value.toUpperCase();
        break;
      case "RF_CH":
        status.rfChannel = Number(value);
        break;
      case "LINK":
        status.link = value.toUpperCase();
        break;
      case "RX":
        status.rx = Number(value);
        break;
      case "RX_DECRYPT_FAIL":
        status.rxDecryptFail = Number(value);
        break;
      default:
        break;
    }
  }

  return status;
}

export function parseDongleVersion(raw: string): string | undefined {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /ph_(?:nano|lite)_dongle/i.test(line));
}

export class DongleSerial {
  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private readLoop: Promise<void> | null = null;
  private buffer = "";
  private pending: Pending | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  private lostReason: string | undefined;

  onLine?: (line: string) => void;
  onLost?: (reason: string) => void;

  get isOpen(): boolean {
    return !!this.port && !this.lostReason;
  }

  get info(): SerialPortInfo | undefined {
    return this.port?.getInfo();
  }

  async open(port: SerialPort): Promise<void> {
    if (this.port) await this.close();

    try {
      await port.open({ baudRate: DONGLE_BAUD_RATE });
    } catch (error) {
      throw new DongleError("open-failed", describe(error));
    }

    this.port = port;
    this.lostReason = undefined;
    this.buffer = "";

    port.addEventListener("disconnect", this.handlePortDisconnect);
    this.startReads();
    // Let the freshly opened CDC settle; the first AT otherwise races the open.
    await sleep(150);
  }

  async close(): Promise<void> {
    const port = this.port;
    this.port = null;
    this.lostReason = undefined;

    this.failPending("port closed");

    if (port) {
      port.removeEventListener("disconnect", this.handlePortDisconnect);
    }

    try {
      await this.reader?.cancel();
    } catch {
    }
    this.reader = null;

    try {
      await this.readLoop;
    } catch {
    }
    this.readLoop = null;

    try {
      await port?.close();
    } catch (e) {
      console.warn("Dongle port close failed", e);
    }
  }

  send(command: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<AtResult> {
    const run = () => this.exec(command, timeoutMs);
    const next = this.chain.then(run, run);
    this.chain = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }

  async pair(keyHex: string, rfAddrHex: string, channel: number): Promise<AtResult> {
    const ch = channel.toString(16).toUpperCase().padStart(2, "0");
    return this.send(`AT+PAIR=${keyHex.toUpperCase()},${rfAddrHex.toUpperCase()},${ch}`, FLASH_TIMEOUT_MS);
  }

  async queryStatus(): Promise<DongleStatus> {
    const result = await this.send("AT+2G4?");
    return parseDongleStatus(result.raw);
  }

  async version(): Promise<string | undefined> {
    const result = await this.send("AT+GMR");
    return parseDongleVersion(result.raw);
  }

  private handlePortDisconnect = () => {
    this.markLost("dongle disconnected");
  };

  private startReads(): void {
    const port = this.port;
    if (!port?.readable) return;

    const reader = port.readable.getReader();
    const decoder = new TextDecoder();
    this.reader = reader;

    const loop = (async () => {
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) this.feed(decoder.decode(value, { stream: true }));
        }
      } catch (error) {
        this.markLost(describe(error));
      } finally {
        try {
          reader.releaseLock();
        } catch {
        }
      }
    })();

    this.readLoop = loop;
  }

  private feed(chunk: string): void {
    this.buffer += chunk;

    for (;;) {
      const newline = this.buffer.indexOf("\n");
      if (newline < 0) break;
      const line = this.buffer.slice(0, newline).replace(/\r$/, "");
      this.buffer = this.buffer.slice(newline + 1);
      this.handleLine(line);
    }
  }

  private handleLine(line: string): void {
    this.onLine?.(line);

    const pending = this.pending;
    if (pending) {
      pending.lines.push(line);
      pending.raw += `${line}\n`;
    }

    const trimmed = line.trim();
    if (!trimmed) return;

    if (trimmed === "OK") {
      this.finish(true);
    } else if (trimmed.startsWith("ERROR") || trimmed === "NOT_IMPLEMENTED") {
      this.finish(false);
    }
  }

  private exec(command: string, timeoutMs: number): Promise<AtResult> {
    const port = this.port;
    if (!port || this.lostReason || !port.writable) {
      return Promise.reject(new DongleError("not-open", "dongle serial port is not open"));
    }

    const result = new Promise<AtResult>((resolve) => {
      this.pending = {
        command,
        lines: [],
        raw: "",
        resolve,
        timer: setTimeout(() => this.finish(false, true), timeoutMs),
      };
    });

    const writer = port.writable.getWriter();
    void writer
      .write(new TextEncoder().encode(`${command}\r\n`))
      .catch((error: unknown) => this.failPending(`write failed: ${describe(error)}`))
      .finally(() => {
        try {
          writer.releaseLock();
        } catch {
          // nothing to release if the stream errored out
        }
      });

    return result;
  }

  private finish(ok: boolean, timedOut = false): void {
    const pending = this.pending;
    if (!pending) return;

    this.pending = null;
    clearTimeout(pending.timer);
    pending.resolve({
      command: pending.command,
      ok,
      lines: pending.lines,
      raw: pending.raw,
      timedOut,
    });
  }

  private failPending(note: string): void {
    const pending = this.pending;
    if (!pending) return;

    this.pending = null;
    clearTimeout(pending.timer);
    pending.resolve({
      command: pending.command,
      ok: false,
      lines: pending.lines,
      raw: pending.raw,
      timedOut: false,
      note,
    });
  }

  private markLost(reason: string): void {
    if (!this.port || this.lostReason) return;
    this.lostReason = reason;
    this.failPending(reason);
    this.onLost?.(reason);
  }
}
