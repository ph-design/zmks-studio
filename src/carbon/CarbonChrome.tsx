import { useEffect, useRef, useState } from "react";
import {
  Plus, Minus, Link2, ChevronDown,
  AlertTriangle, Check, Copy, Info, Loader, ShieldAlert,
} from "lucide-react";
import type { CarbonTheme } from "./theme";
import type { ReactNode } from "react";
import { copyText, type Translate } from "../misc/format";

export type Tone = "ok" | "warn" | "err" | "info" | "neutral";
type ChromeProps = { th: CarbonTheme };

export function SegmentedControl({ opts, value, onChange }: ChromeProps & {
  opts: { id: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="inline-flex border border-strong">
      {opts.map((o, i) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`px-4 py-2 text-[13px] font-sans ${
            i ? "border-l border-base-300" : ""
          } ${value === o.id ? "bg-primary text-primary-content" : "bg-field text-secondary-content"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ContentSwitcher<T extends string>({ opts, value, onChange, size = "sm", label }: ChromeProps & {
  opts: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "md" | "lg";
  label?: string;
}) {
  const selectedIdx = opts.findIndex((o) => o.id === value);
  const height = size === "sm" ? "h-8" : size === "lg" ? "h-12" : "h-10";

  return (
    <div role="tablist" aria-label={label} className="flex w-full max-w-[420px] border border-base-content">
      {opts.map((o, i) => {
        const selected = i === selectedIdx;
        const divider = i > 0 && !selected && i - 1 !== selectedIdx;
        return (
          <button
            key={o.id}
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(o.id)}
            className={`${height} min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap px-3 font-sans text-sm transition-colors ${
              divider ? "shadow-[inset_1px_0_0_var(--carbon-border-strong)]" : ""
            } ${selected ? "bg-base-content text-background" : "bg-field text-secondary-content"}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Select<T extends string>({ opts, value, onChange, label }: ChromeProps & {
  opts: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label?: string;
}) {
  return (
    <div className="relative inline-flex w-full max-w-[420px]">
      <select
        value={value}
        aria-label={label}
        onChange={(e) => onChange(e.target.value as T)}
        className="h-10 w-full appearance-none border-0 border-b border-strong bg-field px-4 pr-10 font-sans text-sm text-base-content"
      >
        {opts.map((o) => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>
      <ChevronDown size={16} className="pointer-events-none absolute right-3.5 top-3 text-base-content" />
    </div>
  );
}

export function SettingsBlock({ label, title, hint, right, dimmed, children }: ChromeProps & {
  label?: string;
  title?: string;
  hint?: string;
  right?: ReactNode;
  dimmed?: boolean;
  children: React.ReactNode;
}) {
  const heading = label ?? title ?? "";
  return (
    <div className={`border-b border-base-300 py-4 transition-opacity ${dimmed ? "opacity-[0.55]" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold leading-[18px] tracking-[0.16px] text-base-content">{heading}</div>
          {hint && (
            <div className="mt-1 max-w-[640px] text-xs leading-4 tracking-[0.32px] text-helper">{hint}</div>
          )}
        </div>
        {right && <div className="flex flex-wrap gap-2">{right}</div>}
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

const badgeTones: Record<Tone, string> = {
  ok: "bg-success-bg text-success",
  warn: "bg-layer1 text-warning",
  err: "bg-error-bg text-error",
  info: "bg-info-bg text-info",
  neutral: "bg-layer2 text-helper",
};

export function Badge({ active, tone, children }: ChromeProps & {
  active?: boolean;
  tone?: Tone;
  children: React.ReactNode;
}) {
  return (
    <span className={`inline-flex h-5 min-w-5 shrink-0 items-center justify-center whitespace-nowrap px-1.5 font-sans text-xs font-normal leading-4 tracking-[0.32px] ${
      tone ? badgeTones[tone] : active ? "bg-primary text-primary-content" : badgeTones.neutral
    }`}>
      {children}
    </span>
  );
}

export function Loading({ t }: ChromeProps & { t: (k: string, d: string) => string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3">
      <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-base-300 border-t-primary" />
      <span className="text-[13px] text-helper">{t("carbon.loading", "Loading…")}</span>
    </div>
  );
}

export function CombosPlaceholder({ th, t }: ChromeProps & { t: (k: string, d: string) => string }) {
  return (
    <NotSupportedHint th={th} icon={<Link2 size={40} />}
      title={t("carbon.combosTitle", "Combos")}
      desc={t("carbon.combosDesc", "Combo editing is coming soon.")} />
  );
}

export function NotSupportedHint({ icon, title, desc }: ChromeProps & {
  icon: ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-12 text-center">
      <div className="flex text-icon opacity-50">{icon}</div>
      <div className="text-base font-semibold text-base-content">{title}</div>
      <div className="max-w-[380px] text-[13px] text-helper">{desc}</div>
    </div>
  );
}

export function ZoomControl({ t, scale, setScale }: ChromeProps & {
  t: (k: string, d: string) => string;
  scale: number | "auto";
  setScale: (v: number | "auto") => void;
}) {
  const numeric = typeof scale === "number" ? scale : 1;
  const change = (delta: number) => setScale(Math.min(2, Math.max(0.4, Math.round((numeric + delta) * 10) / 10)));
  const label = scale === "auto" ? t("carbon.zoomFit", "Fit") : `${Math.round(numeric * 100)}%`;
  const btn = "flex h-7 items-center justify-center border border-base-300 bg-layer1 text-secondary-content";
  return (
    <div className="absolute bottom-4 right-4 flex items-center shadow-[0_1px_4px_rgba(0,0,0,0.2)]">
      <button title={t("carbon.zoomOut", "Zoom out")} onClick={() => change(-0.1)} className={`${btn} w-7`}><Minus size={14} /></button>
      <button title={t("carbon.zoomFit", "Fit")} onClick={() => setScale("auto")}
        className={`${btn} w-auto min-w-[52px] whitespace-nowrap border-x-0 px-2 font-mono text-xs text-base-content`}>{label}</button>
      <button title={t("carbon.zoomIn", "Zoom in")} onClick={() => change(0.1)} className={`${btn} w-7`}><Plus size={14} /></button>
    </div>
  );
}

const noticeTones: Record<Tone, { icon: string; border: string }> = {
  ok: { icon: "text-success", border: "border-l-success" },
  warn: { icon: "text-warning", border: "border-l-warning" },
  err: { icon: "text-error", border: "border-l-error" },
  info: { icon: "text-info", border: "border-l-info" },
  neutral: { icon: "text-helper", border: "border-l-helper" },
};

export function Notice({ tone = "info", title, children }: ChromeProps & {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
}) {
  const Icon = tone === "err" ? ShieldAlert : tone === "warn" ? AlertTriangle : Info;
  const colors = noticeTones[tone];
  return (
    <div role="status" className={`flex gap-2.5 border border-base-300 border-l-[3px] p-3 ${colors.border} ${tone === "neutral" ? "bg-layer1" : "bg-background"}`}>
      <Icon size={16} className={`mt-px shrink-0 ${colors.icon}`} />
      <div className="min-w-0 text-sm leading-5 text-secondary-content">
        {title && <div className="mb-0.5 font-semibold leading-[18px] tracking-[0.16px] text-base-content">{title}</div>}
        {children}
      </div>
    </div>
  );
}

export function InlineError({ t, message, onRetry }: ChromeProps & {
  t: Translate;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" className="flex items-start gap-2 border border-error bg-error-bg px-2.5 py-2">
      <AlertTriangle size={16} className="mt-px shrink-0 text-error" />
      <span className="min-w-0 flex-1 break-words text-sm leading-5 text-base-content">{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="shrink-0 border border-error bg-transparent px-2 py-0.5 font-sans text-xs text-error">
          {t("carbon.conn.retry", "Retry")}
        </button>
      )}
    </div>
  );
}

export interface Fact {
  label: string;
  value: ReactNode;
  mono?: boolean;
  title?: string;
  copy?: boolean;
}

export function Facts({ t, rows, bordered = true }: ChromeProps & {
  t?: Translate;
  rows: Fact[];
  bordered?: boolean;
}) {
  return (
    <div className={bordered ? "border border-base-300" : undefined}>
      {rows.map((row, i) => (
        <div key={row.label} className={`flex items-start gap-2 px-3 py-2 ${
          i < rows.length - 1 ? "border-b border-base-300" : ""
        } ${i % 2 === 0 ? "bg-layer1" : "bg-background"}`}>
          <span className="w-40 shrink-0 text-xs leading-4 tracking-[0.32px] text-helper">{row.label}</span>
          <span title={row.title} className={`min-w-0 flex-1 break-all text-sm leading-5 text-base-content ${row.mono ? "font-mono" : "font-sans"}`}>
            {row.value}
          </span>
          {row.copy && <FactCopy t={t} value={typeof row.value === "string" ? row.value : row.title ?? ""} />}
        </div>
      ))}
    </div>
  );
}

function FactCopy({ t, value }: { t?: Translate; value: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    if (!(await copyText(value))) return;
    setCopied(true);
    timer.current = setTimeout(() => setCopied(false), 1400);
  };

  return (
    <button onClick={copy} title={t ? t("carbon.conn.copy", "Copy") : "Copy"}
      className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center ${copied ? "text-success" : "text-helper"}`}>
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
}

const secondaryButton = "inline-flex items-center gap-1.5 whitespace-nowrap border px-3.5 py-2 font-sans text-sm";

export function ActionButton({ label, icon, onClick, disabled, primary }: ChromeProps & {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${secondaryButton} ${disabled
        ? "cursor-default border-disabled bg-transparent text-disabled"
        : primary
          ? "border-primary bg-primary text-primary-content"
          : "border-secondary-content bg-transparent text-secondary-content"}`}
    >
      {icon}
      {label}
    </button>
  );
}

export function ConfirmAction({ t, label, confirmLabel, hint, icon, tone = "primary", disabled, onConfirm, title }: ChromeProps & {
  t: Translate;
  label: string;
  confirmLabel: string;
  hint?: string;
  icon?: ReactNode;
  tone?: "primary" | "danger";
  disabled?: boolean;
  onConfirm: () => void | Promise<void>;
  title?: string;
}) {
  const [armed, setArmed] = useState(false);
  const [working, setWorking] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArmed(false), 8000);
    return () => clearTimeout(id);
  }, [armed]);

  const danger = tone === "danger";
  const accent = danger ? "border-error bg-error text-primary-content" : "border-primary bg-primary text-primary-content";
  const run = async () => {
    setArmed(false);
    setWorking(true);
    try {
      await onConfirm();
    } finally {
      if (mounted.current) setWorking(false);
    }
  };

  if (working) {
    return (
      <button disabled className={`${secondaryButton} cursor-default opacity-[0.85] ${accent}`}>
        <Loader size={13} className="animate-spin" />
        {label}
      </button>
    );
  }

  if (armed) {
    return (
      <div className="flex flex-col items-start gap-1.5">
        <div className="flex flex-wrap gap-2">
          <button onClick={run} autoFocus className={`${secondaryButton} ${accent}`}>
            {icon}
            {confirmLabel}
          </button>
          <button onClick={() => setArmed(false)} className="bg-transparent px-1.5 py-2 font-sans text-xs text-helper">
            {t("carbon.conn.cancel", "Cancel")}
          </button>
        </div>
        {hint && <span className="max-w-[560px] text-xs leading-4 text-helper">{hint}</span>}
      </div>
    );
  }

  return (
    <button
      onClick={() => setArmed(true)}
      disabled={disabled}
      title={title}
      className={`${secondaryButton} ${disabled
        ? "cursor-default border-disabled bg-transparent text-disabled"
        : danger
          ? "border-error bg-transparent text-error"
          : "border-secondary-content bg-transparent text-secondary-content"}`}
    >
      {icon}
      {label}
    </button>
  );
}

export function CopyBlock({ t, value, note }: ChromeProps & {
  t: Translate;
  value: string;
  note?: ReactNode;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    const ok = await copyText(value);
    setState(ok ? "copied" : "failed");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 1800);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-start gap-2.5 border border-base-300 bg-field px-2.5 py-2">
        <code className="min-w-0 flex-1 whitespace-pre-wrap break-all font-mono text-xs leading-4 text-base-content">
          {value}
        </code>
        <button onClick={copy} title={t("carbon.conn.copy", "Copy")}
          className={`flex shrink-0 items-center gap-1 border border-base-300 bg-transparent px-1.5 py-0.5 font-sans text-xs ${state === "copied" ? "text-success" : "text-helper"}`}>
          {state === "copied" ? <Check size={12} /> : <Copy size={12} />}
          {state === "copied"
            ? t("carbon.conn.copied", "Copied")
            : state === "failed"
              ? t("carbon.conn.copyFailed", "Copy failed")
              : t("carbon.conn.copy", "Copy")}
        </button>
      </div>
      {note && <div className="text-xs leading-4 text-helper">{note}</div>}
    </div>
  );
}
