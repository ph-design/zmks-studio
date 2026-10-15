import type { ReactNode } from "react";

import type { CarbonTheme } from "../carbon/theme";

/*
 * Bench-specific chrome: the panel shell a step renders inside. Button styles
 * live in `buttons.ts` (see the note there), and the shared keys/values grid here
 * is deliberately plainer than Carbon's `SettingsBlock` because a bench reads a
 * step as a checklist rather than as a settings page.
 */

export function StepPane({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, padding: 28, maxWidth: 900 }}>
      {children}
    </div>
  );
}

export function StepTitle({
  th,
  title,
  subtitle,
}: {
  th: CarbonTheme;
  title: string;
  subtitle: string;
}) {
  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 600, color: th.textPrimary }}>{title}</div>
      <div style={{ fontSize: 13, color: th.textHelper, marginTop: 6, lineHeight: 1.6 }}>{subtitle}</div>
    </div>
  );
}

export function Notice({
  th,
  kind,
  children,
}: {
  th: CarbonTheme;
  kind: "info" | "warning" | "error" | "success";
  children: ReactNode;
}) {
  const color =
    kind === "error" ? th.error : kind === "warning" ? th.warning : kind === "success" ? th.success : th.info;
  const bg =
    kind === "error" ? th.errorBg : kind === "warning" ? th.layer1 : kind === "success" ? th.successBg : th.infoBg;
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        padding: "12px 14px",
        background: bg,
        borderLeft: `3px solid ${color}`,
        fontSize: 13,
        lineHeight: 1.6,
        color: th.textPrimary,
      }}
    >
      {children}
    </div>
  );
}

export function Field({
  th,
  label,
  value,
  mono,
}: {
  th: CarbonTheme;
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 16, alignItems: "baseline", fontSize: 13, lineHeight: 1.8 }}>
      <span style={{ width: 116, flexShrink: 0, color: th.textHelper }}>{label}</span>
      <span
        style={{
          color: th.textPrimary,
          fontFamily: mono ? "var(--font-mono)" : "var(--font-sans)",
          wordBreak: "break-all",
        }}
      >
        {value}
      </span>
    </div>
  );
}

export function ProgressBar({ th, value, total }: { th: CarbonTheme; value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ flex: 1, height: 6, background: th.layer2 }}>
        <div style={{ width: `${pct}%`, height: "100%", background: th.interactive, transition: "width 160ms linear" }} />
      </div>
      <span style={{ fontSize: 13, color: th.textSecondary, fontFamily: "var(--font-mono)" }}>
        {value}/{total}
      </span>
    </div>
  );
}
