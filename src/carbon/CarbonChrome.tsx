import { Plus, Minus, Link2 } from "lucide-react";
import type { CarbonTheme } from "./theme";
import type { ReactNode } from "react";

// ─── Shared style helpers ──────────────────────────────────────────────────────

export function iconBtn(th: CarbonTheme, disabled?: boolean): React.CSSProperties {
  return { width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: disabled ? "default" : "pointer", color: disabled ? th.textDisabled : th.textSecondary };
}

export function rowIcon(th: CarbonTheme, color?: string): React.CSSProperties {
  return { width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", color: color || th.iconSecondary };
}

export function secBtn(th: CarbonTheme): React.CSSProperties {
  return { display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", fontSize: 13, background: th.layer2, color: th.textPrimary, border: "none", cursor: "pointer", fontFamily: "var(--font-sans)" };
}

// ─── Shared form widgets ───────────────────────────────────────────────────────

export function Toggle({ th, checked, onChange, disabled }: {
  th: CarbonTheme;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        position: "relative",
        width: 40,
        height: 22,
        borderRadius: 11,
        border: "none",
        cursor: disabled ? "default" : "pointer",
        background: checked ? th.toggleOn : th.toggleOff,
        opacity: disabled ? 0.5 : 1,
        transition: "background 0.15s",
        padding: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: checked ? 20 : 2,
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
          transition: "left 0.15s",
        }}
      />
    </button>
  );
}

/** Carbon-style segmented button group. */
export function SegmentedControl({ th, opts, value, onChange }: {
  th: CarbonTheme;
  opts: { id: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: "inline-flex", border: `1px solid ${th.borderStrong}` }}>
      {opts.map((o, i) => (
        <button key={o.id} onClick={() => onChange(o.id)}
          style={{ padding: "8px 16px", fontSize: 13, cursor: "pointer", border: "none", borderLeft: i ? `1px solid ${th.border}` : "none", background: value === o.id ? th.interactive : th.fieldBg, color: value === o.id ? "#fff" : th.textSecondary, fontFamily: "var(--font-sans)" }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Carbon-style settings block with label + content + border. */
export function SettingsBlock({ th, label, children }: {
  th: CarbonTheme;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ padding: "16px 0", borderBottom: `1px solid ${th.border}` }}>
      <div style={{ fontSize: 14, color: th.textPrimary, fontWeight: 500, marginBottom: 8 }}>{label}</div>
      {children}
    </div>
  );
}

// ─── Language helper ───────────────────────────────────────────────────────────

/** Map i18n language code to a supported locale key. */
export function normalizeLang(lang: string): string {
  if (lang.startsWith("zh")) return "zh";
  if (lang.startsWith("ja")) return "ja";
  if (lang.startsWith("fr")) return "fr";
  if (lang.startsWith("es")) return "es";
  return "en";
}

// ─── Small presentational components ───────────────────────────────────────────

export function Badge({ active, children, th }: { active: boolean; children: React.ReactNode; th: CarbonTheme }) {
  return (
    <span style={{
      width: 20, height: 20,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 11, fontWeight: 700,
      fontFamily: "var(--font-mono)", flexShrink: 0,
      background: active ? th.interactive : th.layer2,
      color: active ? "#fff" : th.textHelper,
    }}>
      {children}
    </span>
  );
}

export function Loading({ th, t }: { th: CarbonTheme; t: (k: string, d: string) => string }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
      <div style={{ width: 32, height: 32, borderRadius: "50%", border: `3px solid ${th.border}`, borderTopColor: th.interactive, animation: "circular-rotate 0.8s linear infinite" }} />
      <span style={{ fontSize: 13, color: th.textHelper }}>{t("carbon.loading", "Loading…")}</span>
    </div>
  );
}

export function CombosPlaceholder({ th, t }: { th: CarbonTheme; t: (k: string, d: string) => string }) {
  return (
    <NotSupportedHint th={th} icon={<Link2 size={40} />}
      title={t("carbon.combosTitle", "Combos")}
      desc={t("carbon.combosDesc", "Combo editing is coming soon.")} />
  );
}

// Unified "not supported / empty" placeholder used across Lighting, Tap-Hold, and Combos.
export function NotSupportedHint({ th, icon, title, desc }: {
  th: CarbonTheme;
  icon: ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, textAlign: "center", padding: 48 }}>
      <div style={{ color: th.iconSecondary, opacity: 0.5, display: "flex" }}>{icon}</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: th.textPrimary }}>{title}</div>
      <div style={{ fontSize: 13, color: th.textHelper, maxWidth: 380 }}>{desc}</div>
    </div>
  );
}

export function ZoomControl({ th, t, scale, setScale }: {
  th: CarbonTheme;
  t: (k: string, d: string) => string;
  scale: number | "auto";
  setScale: (v: number | "auto") => void;
}) {
  const numeric = typeof scale === "number" ? scale : 1;
  const change = (delta: number) => setScale(Math.min(2, Math.max(0.4, Math.round((numeric + delta) * 10) / 10)));
  const label = scale === "auto" ? t("carbon.zoomFit", "Fit") : `${Math.round(numeric * 100)}%`;
  const btn: React.CSSProperties = { width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", background: th.layer1, border: `1px solid ${th.border}`, color: th.textSecondary, cursor: "pointer" };
  return (
    <div style={{ position: "absolute", right: 16, bottom: 16, display: "flex", alignItems: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }}>
      <button title={t("carbon.zoomOut", "Zoom out")} onClick={() => change(-0.1)} style={btn}><Minus size={14} /></button>
      <button title={t("carbon.zoomFit", "Fit")} onClick={() => setScale("auto")}
        style={{ ...btn, width: "auto", minWidth: 52, padding: "0 8px", borderLeft: "none", borderRight: "none", fontSize: 12, fontFamily: "var(--font-mono)", color: th.textPrimary }}>{label}</button>
      <button title={t("carbon.zoomIn", "Zoom in")} onClick={() => change(0.1)} style={btn}><Plus size={14} /></button>
    </div>
  );
}
