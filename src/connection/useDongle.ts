// React state and AT transport for USB dongles.
import { useEffect, useRef, useState } from "react";

import { errorText } from "../misc/errors";
import type { Translate } from "../misc/format";

import { openUsbPort, type UsbTransport } from "./usbTransport";

export type DonglePhase = "idle" | "connecting" | "open" | "lost";

export interface DongleController {
  supported: boolean;
  phase: DonglePhase;
  status?: DongleStatus;
  error?: string;
  busy: boolean;
  disconnect: () => Promise<void>;
  connect: (transport?: UsbTransport) => Promise<boolean>;
  refresh: () => Promise<void>;
  pair: (keyHex: string, rfAddrHex: string, channel: number) => Promise<AtResult>;
  queryStatus: () => Promise<DongleStatus>;
  clear: () => Promise<AtResult | undefined>;
  prepare: (transport: UsbTransport) => Promise<DongleStatus | undefined>;
  release: () => UsbTransport | null;
}

const AT_TIMEOUT_MS = 3000;

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
  const [status, setStatus] = useState<DongleStatus | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const tRef = useRef(t);
  tRef.current = t;
  const [connectState] = useState(() => {
    const state = { generation: 0 };
    return {
      state,
      invalidate: () => {
        state.generation++;
      },
    };
  });

  useEffect(() => {
    client.onLost = (reason) => {
      const head = tRef.current(
        "carbon.conn.dongleLost",
        "The dongle's serial port disappeared. Plug it back in and reconnect."
      );
      setPhase("lost");
      setStatus(undefined);
      setBusy(false);
      setError(reason ? `${head}（${reason}）` : head);
    };

    return () => {
      connectState.invalidate();
      client.onLost = undefined;
      client.close();
    };
  }, [client, connectState]);

  const refresh = async () => {
    if (!client.isOpen) {
      setError(tRef.current("carbon.conn.atNotOpen", "The dongle's serial port is not open."));
      return;
    }

    setBusy(true);
    try {
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

  const prepare = async (transport: UsbTransport) => {
    const generation = connectState.state.generation;
    setError(undefined);
    setStatus(undefined);
    client.close();
    client.attach(transport);

    let reply = await client.send("AT+2G4?", 600);
    if (generation !== connectState.state.generation) return;
    if (reply.timedOut && client.isOpen) reply = await client.send("AT+2G4?", 1000);
    if (generation !== connectState.state.generation) return;
    const parsed = reply.ok ? parseDongleStatus(reply.raw) : undefined;
    if (!parsed?.pairState) {
      client.detach();
      setPhase("idle");
      return;
    }

    setStatus(parsed);
    setPhase("open");
    return parsed;
  };

  const connect = async (transport?: UsbTransport) => {
    const generation = ++connectState.state.generation;
    setError(undefined);
    setPhase("connecting");
    let connected = false;

    try {
      if (!transport) {
        const [port] = await requestDonglePorts();
        if (generation !== connectState.state.generation) return false;
        transport = await openUsbPort(port, portLabel(port));
      }
      if (generation !== connectState.state.generation) return false;

      const status = await prepare(transport);
      if (generation !== connectState.state.generation) return false;
      if (!status) {
        setError(tRef.current("carbon.conn.receiverNoResponse", "The receiver did not respond. Select its Studio port."));
        return false;
      }

      connected = true;
      return true;
    } catch (error) {
      if (generation === connectState.state.generation) {
        client.close();
        setPhase("idle");
        setError(dongleErrorText(tRef.current, error));
      }
      return false;
    } finally {
      if (!connected) transport?.abortController.abort();
    }
  };

  const release = () => {
    const transport = client.detach();
    setPhase("idle");
    setStatus(undefined);
    setError(undefined);
    return transport;
  };

  const disconnect = async () => {
    connectState.state.generation++;
    client.close();
    setPhase("idle");
    setStatus(undefined);
    setError(undefined);
  };

  const send = async (command: string): Promise<AtResult | undefined> => {
    const commandLine = command.trim();
    if (!commandLine) return undefined;

    if (!client.isOpen) {
      setError(tRef.current("carbon.conn.atNotOpen", "The dongle's serial port is not open."));
      return undefined;
    }

    setBusy(true);
    try {
      const result = await client.send(commandLine, AT_TIMEOUT_MS);
      setError(atFailureText(tRef.current, result));

      // Keep the parsed state in step with whatever the terminal asked.
      if (/^AT\+?(INFO|2G4\?)/i.test(commandLine)) {
        const parsed = parseDongleStatus(result.raw);
        if (Object.keys(parsed).length > 0) setStatus(parsed);
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
    return client.pair(keyHex, rfAddrHex, channel);
  };

  const queryStatus = async (): Promise<DongleStatus> => {
    const result = await send("AT+2G4?");
    if (!result?.ok) throw new Error(result && atFailureText(tRef.current, result));
    return parseDongleStatus(result.raw);
  };

  return {
    supported: dongleSupported() || !!window.__TAURI_INTERNALS__,
    phase,
    status,
    error,
    busy,
    connect,
    disconnect,
    refresh,
    pair,
    queryStatus,
    clear: () => send("AT+CLEAR"),
    prepare,
    release,
  };
}


export const DONGLE_VENDOR_ID = 0x5048;
export const DONGLE_PRODUCT_ID = 0xff11;

export const DONGLE_FILTERS: SerialPortFilter[] = [
  { usbVendorId: DONGLE_VENDOR_ID, usbProductId: DONGLE_PRODUCT_ID },
];

const DEFAULT_TIMEOUT_MS = 2500;
const FLASH_TIMEOUT_MS = 3500;

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
  studioPort?: string;
}

interface Pending {
  command: string;
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

export function isDonglePortInfo(info: { usbVendorId?: number | null; usbProductId?: number | null }): boolean {
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
  if (known.length === 1) return known;

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
        if (/^[\da-f]{10}$/i.test(value)) status.rfAddr = value.toUpperCase();
        break;
      case "RF_CH":
        status.rfChannel = Number(value);
        break;
      case "STUDIO_PORT":
        status.studioPort = value.toUpperCase();
        break;
      case "LINK":
        status.link = value.toUpperCase();
        break;
      default:
        break;
    }
  }

  return status;
}

export class DongleSerial {
  private port: UsbTransport | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private buffer = "";
  private pending: Pending | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  private lostReason: string | undefined;

  onLost?: (reason: string) => void;

  get isOpen(): boolean {
    return !!this.port && !this.lostReason;
  }

  attach(port: UsbTransport): void {
    this.port = port;
    this.lostReason = undefined;
    this.buffer = "";
    this.startReads();
  }

  detach(): UsbTransport | null {
    const port = this.port;
    this.port = null;
    const reader = this.reader;
    this.reader = null;
    reader?.releaseLock();
    this.failPending("port closed");
    return port;
  }

  close(): void {
    this.detach()?.abortController.abort();
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

  private startReads(): void {
    const port = this.port;
    if (!port?.readable) return;

    const reader = port.readable.getReader();
    const decoder = new TextDecoder();
    this.reader = reader;

    void (async () => {
      try {
        while (this.reader === reader) {
          const { value, done } = await reader.read();
          if (done || this.reader !== reader) break;
          if (value) this.feed(decoder.decode(value, { stream: true }));
        }
      } catch {
        // Releasing the reader during a handoff also ends a pending read.
      } finally {
        if (this.reader === reader) {
          this.reader = null;
          reader.releaseLock();
          this.markLost("dongle disconnected");
        }
      }
    })();
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
    const pending = this.pending;
    if (pending) {
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
        raw: "",
        resolve,
        timer: setTimeout(() => this.finish(false, true), timeoutMs),
      };
    });

    const writer = port.writable.getWriter();
    return writer
      .write(new TextEncoder().encode(`${command}\r\n`))
      .catch((error: unknown) => this.failPending(`write failed: ${describe(error)}`))
      .finally(() => {
        try {
          writer.releaseLock();
        } catch {
          // nothing to release if the stream errored out
        }
      }).then(() => result);
  }

  private finish(ok: boolean, timedOut = false): void {
    const pending = this.pending;
    if (!pending) return;

    this.pending = null;
    clearTimeout(pending.timer);
    pending.resolve({
      command: pending.command,
      ok,
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
