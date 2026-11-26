import { FeatureRail } from "./FeatureRail";
import { useEffect, useRef, useState } from "react";
import { Hand, Waves, Footprints, Moon, Smartphone, Sunrise } from "lucide-react";

import type { BehaviorBinding, Layer } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";

import type { CarbonTheme } from "./theme";
import { ActionButton, InlineError, Loading, NotSupportedHint, SelectionButton, SettingsBlock } from "./CarbonChrome";
import { RealCarbonToggle } from "./RealCarbonToggle";
import { BehaviorBindingPicker } from "../behaviors/BehaviorBindingPicker";
import { summarizeBinding } from "../combos/comboUtils";
import {
  Orientation,
  TAP_SLOTS,
  ALL_LAYERS_MASK,
  withSlotBinding,
  type CarryConfig,
  type MotionLiveState,
  type StillWakeConfig,
  type TapConfig,
  type TapSlot,
} from "../motion/motionRpc";
import { TapDiagnosticsPanel } from "../motion/TapDiagnosticsPanel";
import type { MotionModel } from "../motion/useMotion";

type Section = "carry" | "stillWake" | "tap";

interface MotionViewProps {
  motion: MotionModel;
  behaviors: Record<number, GetBehaviorDetailsResponse>;
  behaviorList: GetBehaviorDetailsResponse[];
  layers: Layer[];
  th: CarbonTheme;
  t: (k: string, d: string) => string;
}

// IMU panel
export function MotionView({ motion, behaviors, behaviorList, layers, th, t }: MotionViewProps) {
  const { capabilities, tapConfig, carryConfig, stillWakeConfig } = motion;

  const liftLock = capabilities?.guardVersion === 1;
  const allSections: { id: Section; label: string; icon: React.ReactNode; has: boolean }[] = [
    {
      id: "carry",
      label: liftLock ? t("motion.carry.guardGroup", "Lift lock") : t("motion.carry.title", "Carry sleep"),
      icon: <Footprints size={16} />,
      has: !!capabilities?.supportsCarry && !!carryConfig,
    },
    {
      id: "stillWake",
      label: t("motion.stillWake.title", "Stationary wake"),
      icon: <Sunrise size={16} />,
      has: !liftLock && !!capabilities?.supportsStillWake && !!stillWakeConfig,
    },
    {
      id: "tap",
      label: t("motion.tap.title", "Tap detection"),
      icon: <Hand size={16} />,
      has: capabilities?.tapVersion === 2 && capabilities.supportsTap && !!tapConfig,
    },
  ];
  const sections = allSections.filter((s) => s.has);

  const [section, setSection] = useState<Section>("carry");
  const current = sections.some((s) => s.id === section) ? section : sections[0]?.id;

  const [editing, setEditing] = useState<{ slot: TapSlot; binding: BehaviorBinding } | null>(null);
  const [bindingError, setBindingError] = useState(false);

  const applyTapBinding = async (binding: BehaviorBinding | undefined) => {
    if (!editing || !tapConfig || motion.applying) return;
    setBindingError(false);
    const applied = await motion.applyTapConfig(withSlotBinding(tapConfig, editing.slot, binding));
    if (applied) setEditing(null);
    else setBindingError(true);
  };
  // While the carry threshold slider is being dragged the meter's marker
  // follows the knob; the value is still only sent to firmware on release.
  const [carryThresholdDraft, setCarryThresholdDraft] = useState<number | null>(null);

  const { setLiveWanted } = motion;
  useEffect(() => {
    if (!current || current === "tap") return;
    setLiveWanted(true);
    return () => setLiveWanted(false);
  }, [current, setLiveWanted]);

  // A draft belongs to the section that produced it, so navigating away can't
  // leave a marker behind that no slider owns any more.
  useEffect(() => setCarryThresholdDraft(null), [current]);

  if (!motion.loaded) return <Loading th={th} t={t} />;

  if (!capabilities || sections.length === 0) {
    return (
      <NotSupportedHint
        th={th}
        icon={<Waves size={40} />}
        title={t("motion.emptyTitle", "Motion features unavailable")}
        desc={t("motion.emptyHint", "No motion sensor was detected on this device, or the firmware has the motion subsystem disabled.")}
      />
    );
  }

  return (
    <div className="carbon-feature-page">
      {/* Capability rail */}
      <FeatureRail title={t("carbon.nav.motion", "Motion")} style={{ background: th.railBg, borderRight: `1px solid ${th.border}` }}>
        <div style={{ padding: "12px 16px", background: th.layer1, borderBottom: `1px solid ${th.border}`, display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <Waves size={16} style={{ color: th.interactive }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: th.textPrimary }}>{t("carbon.nav.motion", "Motion")}</span>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }} className="custom-scrollbar">
          {sections.map((s) => {
            const active = s.id === current;
            return (
              <button key={s.id} onClick={() => { setSection(s.id); setEditing(null); }}
                style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", minHeight: 44, padding: "0 14px", cursor: "pointer", textAlign: "left", background: active ? th.selectedLayer : "transparent", border: "none", borderLeft: `3px solid ${active ? th.interactive : "transparent"}`, fontFamily: "var(--font-sans)" }}>
                <span style={{ color: active ? th.interactive : th.iconSecondary, display: "flex", flexShrink: 0 }}>{s.icon}</span>
                <span style={{ fontSize: 14, fontWeight: active ? 500 : 400, color: active ? th.textPrimary : th.textSecondary }}>{s.label}</span>
              </button>
            );
          })}
        </div>
        {/* Carry status is shared by both sections, so it lives in the rail. */}
        {!liftLock && <CarryStateCard th={th} t={t} live={motion.live} />}
      </FeatureRail>

      {/* Live canvas + config drawer */}
      <div className="carbon-feature-content">
        {/* The meter gets full width and stays pinned while settings scroll. */}
        <div style={{ flexShrink: 0, padding: "14px 24px 14px" }}>
          {current !== "tap" && (
            <LiveMeter
              th={th}
              t={t}
              motion={motion}
              section={current ?? "carry"}
              thresholdDraft={carryThresholdDraft}
            />
          )}
        </div>

        <div style={{ flex: 1, minHeight: 240, borderTop: `1px solid ${th.border}`, background: th.layer1, display: "flex", flexDirection: "column" }}>
          {editing && tapConfig ? (
            <div style={{ display: "flex", flexDirection: "column", minHeight: 0, height: "100%" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, height: 40, padding: "0 16px", borderBottom: `1px solid ${th.border}`, flexShrink: 0 }}>
                <span style={{ flex: 1, fontSize: 13, color: th.textPrimary, fontWeight: 500 }}>
                  {t("motion.tap.bindingTitle", "Tap action binding")}
                </span>
                <button disabled={motion.applying} onClick={() => setEditing(null)}
                  style={{ padding: "5px 12px", fontSize: 12, background: "transparent", color: th.textSecondary, border: `1px solid ${th.border}`, cursor: "pointer", fontFamily: "var(--font-sans)" }}>
                  {t("common.cancel", "Cancel")}
                </button>
                <button disabled={motion.applying} onClick={() => void applyTapBinding(undefined)}
                  style={{ padding: "5px 12px", fontSize: 12, background: "transparent", color: th.textSecondary, border: `1px solid ${th.border}`, cursor: "pointer", fontFamily: "var(--font-sans)" }}>
                  {t("motion.tap.clearBinding", "Clear")}
                </button>
                <button disabled={motion.applying} onClick={() => void applyTapBinding(editing.binding)}
                  style={{ padding: "5px 12px", fontSize: 12, background: th.interactive, color: "#fff", border: "none", cursor: "pointer", fontFamily: "var(--font-sans)" }}>
                  {t("combos.confirm", "Confirm")}
                </button>
              </div>
              {bindingError && <InlineError th={th} t={t}
                message={t("motion.tap.bindingApplyFailed", "The keyboard could not apply the double-tap action.")} />}
              <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 py-3">
                <BehaviorBindingPicker
                  binding={editing.binding}
                  behaviors={behaviorList}
                  layers={layers}
                  onBindingChanged={(b) => setEditing({ ...editing, binding: b })}
                />
              </div>
            </div>
          ) : current === "tap" && tapConfig ? (
            <div style={{ display: "flex", flexDirection: "column", minHeight: 0, height: "100%" }}>
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }} className="custom-scrollbar">
                <TapSettings
                  th={th} t={t}
                  config={tapConfig}
                  behaviors={behaviors}
                  layers={layers}
                  thresholdMax={capabilities.thresholdMax}
                  onEditSlot={(slot) => {
                    setBindingError(false);
                    setEditing({
                      slot,
                      binding: tapConfig[slot] ?? { behaviorId: -1, param1: 0, param2: 0 },
                    });
                  }}
                  onChange={(c) => motion.applyTapConfig(c)}
                />
              </div>
            </div>
          ) : current === "carry" && carryConfig ? (
            liftLock ? <LiftLockSettings th={th} t={t} config={carryConfig} onChange={motion.applyCarryConfig} /> :
            <CarrySettings
              th={th} t={t}
              config={carryConfig}
              thresholdMax={capabilities.thresholdMax}
              thresholdDraft={carryThresholdDraft}
              onThresholdDraft={setCarryThresholdDraft}
              onChange={(c) => motion.applyCarryConfig(c)}
            />
          ) : current === "stillWake" && stillWakeConfig ? (
            <StillWakeSettings
              th={th} t={t}
              config={stillWakeConfig}
              onChange={(c) => motion.applyStillWakeConfig(c)}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ─── Live state ────────────────────────────────────────────────────────────────

/** Carry status + orientation, visible from either section. */
function CarryStateCard({ th, t, live }: {
  th: CarbonTheme;
  t: (k: string, d: string) => string;
  live: MotionLiveState;
}) {
  const orientationLabel: Record<Orientation, string> = {
    [Orientation.ORIENTATION_UNKNOWN]: t("motion.orientation.unknown", "Unknown"),
    [Orientation.ORIENTATION_FLAT_UP]: t("motion.orientation.flatUp", "Flat, face up"),
    [Orientation.ORIENTATION_FLAT_DOWN]: t("motion.orientation.flatDown", "Upside down"),
    [Orientation.ORIENTATION_TILTED]: t("motion.orientation.tilted", "Tilted / moving"),
    [Orientation.UNRECOGNIZED]: t("motion.orientation.unknown", "Unknown"),
  };
  const tone = live.carryActive ? th.warning : th.success;

  return (
    <div style={{ flexShrink: 0, padding: "12px 14px", borderTop: `1px solid ${th.border}`, borderLeft: `3px solid ${tone}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ color: tone, display: "flex", flexShrink: 0 }}>
          {live.carryActive ? <Moon size={16} /> : <Footprints size={16} />}
        </span>
        <span style={{ fontSize: 14, fontWeight: 600, color: th.textPrimary }}>
          {live.carryActive
            ? t("motion.carry.active", "Sustained motion — sleep pending")
            : t("motion.carry.idle", "Stationary — awake")}
        </span>
      </div>
      <div style={{ fontSize: 12, color: th.textHelper, lineHeight: 1.45, marginTop: 4 }}>
        {live.carryActive
          ? t("motion.carry.activeHint", "The keyboard enters sleep when sustained motion meets the configured conditions.")
          : t("motion.carry.idleHint", "Sustained motion is evaluated against the configured threshold and duration.")}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: th.textSecondary, marginTop: 8 }}>
        <Smartphone size={14} style={{ color: th.iconSecondary, flexShrink: 0 }} />
        {orientationLabel[live.orientation]}
      </div>
    </div>
  );
}

// ─── Live meter ────────────────────────────────────────────────────────────────

const TICK_MS = 100; // matches the firmware's live-state push rate
const PEAK_HOLD_MS = 900;
/** Full-scale fall time once the hold expires. */
const PEAK_FALL_MS = 4000;

// The peak is pushed up the instant the signal exceeds it, held long enough to
// read, then bled away — never below the live value.
function usePeakHold(value: number, max: number, resetKey: unknown): number {
  const latest = useRef(value);
  latest.current = value;
  const peak = useRef(value);
  const heldFor = useRef(0);
  const [, render] = useState(0);

  useEffect(() => {
    peak.current = latest.current;
    heldFor.current = 0;
  }, [resetKey]);

  useEffect(() => {
    const step = Math.max(1, (max * TICK_MS) / PEAK_FALL_MS);
    const id = setInterval(() => {
      if (latest.current >= peak.current) {
        peak.current = latest.current;
        heldFor.current = 0;
      } else {
        heldFor.current += TICK_MS;
        if (heldFor.current >= PEAK_HOLD_MS) {
          peak.current = Math.max(latest.current, peak.current - step);
        }
      }
      render((n) => n + 1);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [max]);

  return Math.round(peak.current);
}

function LiveMeter({ th, t, motion, section, thresholdDraft }: {
  th: CarbonTheme;
  t: (k: string, d: string) => string;
  motion: MotionModel;
  section: Section;
  /** Uncommitted slider value, so the marker tracks the knob during a drag. */
  thresholdDraft?: number | null;
}) {
  const { live, capabilities, carryConfig } = motion;
  const max = capabilities?.thresholdMax ?? 127;
  const pct = (v: number) => `${Math.min(100, Math.max(0, (v / max) * 100))}%`;
  const peak = usePeakHold(live.magnitude, max, section);

  // Markers make raw counts legible: distance from the threshold that fires.
  const liftLock = section === "carry" && capabilities?.guardVersion === 1;
  const markers =
    section === "carry" && carryConfig && !liftLock
      ? [{
          value: thresholdDraft ?? carryConfig.motionThreshold,
          label: t("motion.carry.motionThreshold", "Motion threshold"),
          color: th.warning,
        }]
      : [];

  return (
    <div style={{ width: "100%" }}>
      <div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: th.textPrimary }}>
            {liftLock ? t("motion.lift.magnitude", "Motion magnitude (relative)") : t("motion.live", "Live magnitude")}
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: th.textHelper }}>
            <span style={{ fontSize: 22, color: th.textPrimary }}>{live.magnitude}</span> / {max}
          </span>
        </div>
        <div style={{ position: "relative", height: 32, background: th.fieldBg, border: `1px solid ${th.border}` }}>
          {/* Trail up to the peak marker. */}
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: pct(peak), background: th.interactive, opacity: 0.22, transition: "width 100ms linear" }} />
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: pct(live.magnitude), background: th.interactive, opacity: 0.75, transition: "width 100ms linear" }} />
          <div style={{ position: "absolute", left: pct(peak), top: -3, bottom: -3, width: 2, marginLeft: -2, background: th.textPrimary, transition: "left 100ms linear" }} />
          {markers.map((m) => (
            <div key={m.label} style={{ position: "absolute", left: pct(m.value), top: -4, bottom: -4, width: 2, background: m.color }} />
          ))}
        </div>
        {/* Legend and how-to-read side by side: the saved height goes to the
            settings list below. */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 24, marginTop: 8 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: th.textHelper }}>
              <span style={{ width: 12, height: 2, background: th.textPrimary }} />
              {t("motion.peak", "Peak")} · <span style={{ fontFamily: "var(--font-mono)", color: th.textPrimary }}>{peak}</span>
            </span>
            {markers.map((m) => (
              <span key={m.label} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: th.textHelper }}>
                <span style={{ width: 12, height: 2, background: m.color }} />
                {m.label} · <span style={{ fontFamily: "var(--font-mono)" }}>{m.value}</span>
              </span>
            ))}
          </div>
          <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: th.textHelper, lineHeight: 1.5 }}>
            {liftLock
              ? t("motion.lift.meterHint", "Use this value to observe motion. Placement uses the parameters below.")
              : section === "carry"
              ? t("motion.carry.calibrateHint", "Move the keyboard and observe the stable motion range. Use the lower end of that range as a starting threshold.")
              : t("motion.stillWake.meterHint", "Stationary confirmation uses motion state rather than a threshold marker.")}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Settings forms ────────────────────────────────────────────────────────────

// One column: label → helper → control. Values sit on the label line so every
// number right-aligns to one edge.
const FIELD_H = 40; // Carbon field height, size md

function SettingsList({ children }: { children: React.ReactNode }) {
  return <div className="carbon-settings-list">{children}</div>;
}

function Field({ th, label, tag, value, hint, height = FIELD_H, children }: {
  th: CarbonTheme;
  label: string;
  /** Sensor register the setting maps to. */
  tag?: string;
  /** Current value, right-aligned on the label line. */
  value?: string;
  hint?: string;
  height?: number | "auto";
  children: React.ReactNode;
}) {
  return (
    <div style={{ padding: "12px 0", borderBottom: `1px solid ${th.border}` }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: th.textPrimary }}>{label}</span>
        {tag && (
          <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: th.textHelper }}>{tag}</span>
        )}
        {value && (
          <span style={{ marginLeft: "auto", fontSize: 14, fontFamily: "var(--font-mono)", color: th.textPrimary, flexShrink: 0 }}>
            {value}
          </span>
        )}
      </div>
      {hint && (
        <div style={{ fontSize: 12, color: th.textHelper, lineHeight: 1.5, marginTop: 3 }}>{hint}</div>
      )}
      <div style={{ height, display: "flex", alignItems: "center", gap: 12, minWidth: 0, marginTop: 4 }}>
        {children}
      </div>
    </div>
  );
}

// Carbon section heading; the entries' rules carry the structure.
function GroupHeading({ th, children }: { th: CarbonTheme; children: React.ReactNode }) {
  return (
    <div className="carbon-settings-group" style={{ paddingTop: 20, paddingBottom: 2 }}>
      <span style={{ fontSize: 14, fontWeight: 600, color: th.textPrimary }}>{children}</span>
    </div>
  );
}

// Fixed above the scroll area, matching the lighting panel's top bar.
function EnableBar({ th, title, desc, enabled, disabled, onChange }: {
  th: CarbonTheme;
  title: string;
  desc: string;
  enabled: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, height: 48, padding: "0 20px", borderBottom: `1px solid ${th.border}`, flexShrink: 0 }}>
      <RealCarbonToggle checked={enabled} disabled={disabled} ariaLabel={title} onChange={onChange} />
      <span style={{ fontSize: 14, fontWeight: 600, color: th.textPrimary, flexShrink: 0 }}>{title}</span>
      <span style={{ fontSize: 12, color: th.textHelper, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {desc}
      </span>
    </div>
  );
}

// Full-width track with Carbon's end labels. Dragging previews locally; the
// value commits on release so a drag isn't one RPC per pixel. Callers that
// draw the value elsewhere (the live meter's marker) listen to onDraftChange
// to follow the knob while it moves.
function Slider({ th, value, min, max, step, onCommit, onDraftChange, unit, ariaLabel }: {
  th: CarbonTheme;
  value: number;
  min: number;
  max: number;
  step?: number;
  onCommit: (v: number) => void;
  /** Fires on every drag step, before anything is sent to firmware. */
  onDraftChange?: (v: number) => void;
  unit?: string;
  ariaLabel?: string;
}) {
  const end: React.CSSProperties = { fontSize: 12, fontFamily: "var(--font-mono)", color: th.textHelper, flexShrink: 0 };
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => onCommit(draft);
  return (
    <>
      <span style={end}>{min}{unit ?? ""}</span>
      <input
        type="range"
        aria-label={ariaLabel}
        min={min}
        max={max}
        step={step ?? 1}
        value={draft}
        onChange={(e) => {
          const next = Number(e.target.value);
          setDraft(next);
          onDraftChange?.(next);
        }}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
        className="carbon-slider"
        style={{ flex: 1, minWidth: 0 }}
      />
      <span style={end}>{max}{unit ?? ""}</span>
    </>
  );
}

// Read-only value with a trailing action, sized like every other control.
function ValueField({ th, value, actionLabel, onAction }: {
  th: CarbonTheme;
  value: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div style={{ flex: 1, minWidth: 0, height: FIELD_H, display: "flex", alignItems: "center", gap: 8, paddingLeft: 12, background: th.fieldBg, borderBottom: `1px solid ${th.borderStrong}` }}>
      <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: th.textPrimary, fontFamily: "var(--font-mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {value}
      </span>
      <button onClick={onAction}
        style={{ flexShrink: 0, alignSelf: "stretch", padding: "0 14px", fontSize: 14, background: "transparent", color: th.linkPrimary, border: "none", cursor: "pointer", fontFamily: "var(--font-sans)" }}>
        {actionLabel}
      </button>
    </div>
  );
}

function LayerChips({ t, layers, mask, onChange }: {
  t: (key: string, fallback: string) => string;
  layers: Layer[];
  mask: number;
  onChange: (mask: number) => void;
}) {
  const all = mask === ALL_LAYERS_MASK;
  return (
    <div className="flex flex-wrap gap-1.5">
      <SelectionButton selected={all} onClick={() => { if (!all) onChange(ALL_LAYERS_MASK); }}>
        {t("motion.tap.allLayers", "All layers")}
      </SelectionButton>
      {layers.slice(0, 32).map((layer, index) => {
        const bit = 1 << index;
        const selected = (mask & bit) !== 0;
        return (
          <SelectionButton key={layer.id} selected={selected}
            onClick={() => onChange((mask ^ bit) >>> 0)}>
            {layer.name || t("carbon.layer", "Layer") + " " + index}
          </SelectionButton>
        );
      })}
    </div>
  );
}

const SHOW_ADVANCED_TAP_SETTINGS = false;

function TapSettings({ th, t, config, behaviors, layers, thresholdMax, onEditSlot, onChange }: {
  th: CarbonTheme;
  t: (k: string, d: string) => string;
  config: TapConfig;
  behaviors: Record<number, GetBehaviorDetailsResponse>;
  layers: Layer[];
  thresholdMax: number;
  onEditSlot: (slot: TapSlot) => void;
  onChange: (c: TapConfig) => void;
}) {
  const [advanced, setAdvanced] = useState(false);
  const slots = config.splitSides ? TAP_SLOTS : TAP_SLOTS.slice(0, 1);
  const thresholdLabel = t("motion.tap.threshold", "Trigger threshold");
  const windowLabel = t("motion.tap.window", "Double-tap window");
  const set = (patch: Partial<TapConfig>) => onChange({ ...config, ...patch });

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <EnableBar th={th}
        title={t("motion.tap.title", "Tap detection")}
        desc={t("motion.tap.desc", "Trigger an action by double-tapping the case.")}
        enabled={config.enabled}
        onChange={(v) => set({ enabled: v })} />

      <div className="custom-scrollbar"
        style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 24px 24px" }}>
        <fieldset disabled={!config.enabled} className="min-w-0 max-w-[52rem] disabled:opacity-50">
          <SettingsList>
            {slots.map(({ slot, side }) => {
              const binding = config[slot];
              return (
                <div key={slot} className={config.splitSides ? "min-w-0" : "col-span-full min-w-0"}>
                  <Field th={th}
                    label={!config.splitSides ? t("motion.tap.double", "Double tap") :
                      side === "left" ? t("motion.tap.leftDouble", "Left double tap") : t("motion.tap.rightDouble", "Right double tap")}>
                    <ValueField th={th}
                      value={binding ? summarizeBinding(binding, behaviors) : t("motion.tap.unbound", "Not set")}
                      actionLabel={t("common.change", "Change")}
                      onAction={() => onEditSlot(slot)} />
                  </Field>
                </div>
              );
            })}

            <GroupHeading th={th}>{t("motion.tap.timingGroup", "Detection")}</GroupHeading>
            <Field th={th} label={thresholdLabel}
              value={String(config.threshold)} height={24}
              hint={t("motion.tap.thresholdHint", "Lower values are more sensitive.")}>
              <Slider th={th} ariaLabel={thresholdLabel} value={config.threshold} min={1} max={thresholdMax} onCommit={(v) => set({ threshold: v })} />
            </Field>
            <Field th={th} label={windowLabel}
              value={`${config.windowMs} ms`} height={24}
              hint={t("motion.tap.windowHint", "Time allowed for the second tap after the minimum gap.")}>
              <Slider th={th} ariaLabel={windowLabel} value={config.windowMs} min={80} max={600} step={10} onCommit={(v) => set({ windowMs: v })} />
            </Field>

            <div className="col-span-full">
              <Field th={th} label={t("motion.tap.layersGroup", "Active layers")} height="auto">
                <LayerChips t={t} layers={layers} mask={config.layerMask}
                  onChange={(mask) => set({ layerMask: mask })} />
              </Field>
            </div>
          </SettingsList>
        </fieldset>
        {SHOW_ADVANCED_TAP_SETTINGS && <details className="mt-5 max-w-[52rem] border-t border-base-300"
          onToggle={(e) => setAdvanced(e.currentTarget.open)}>
          <summary className="cursor-pointer py-3 text-sm font-semibold">{t("motion.tap.advanced", "Advanced settings and hardware test")}</summary>
          <fieldset disabled={!config.enabled} className="min-w-0 disabled:opacity-50">
            <SettingsList>
              <GroupHeading th={th}>{t("motion.tap.optionsGroup", "Double-tap options")}</GroupHeading>
              <Field th={th} label={t("motion.tap.axes", "Sensor axes")}
                hint={t("motion.tap.axesHint", "At least one axis must stay enabled.")}>
                <div style={{ display: "flex", gap: 18 }}>
                  {[{ bit: 1, label: "X" }, { bit: 2, label: "Y" }, { bit: 4, label: "Z" }].map(({ bit, label }) => (
                    <label key={bit} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: th.textPrimary }}>
                      <input
                        type="checkbox"
                        checked={((config.axesMask || 7) & bit) !== 0}
                        onChange={(e) => {
                          const current = config.axesMask || 7;
                          const mask = e.target.checked ? current | bit : current & ~bit;
                          if (mask) set({ axesMask: mask });
                        }}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </Field>
              <Field th={th} label={t("motion.tap.splitSides", "Separate side bindings")}
                hint={t("motion.tap.splitSidesHint", "Impact direction does not reliably identify the struck side; unified mode uses the first double-tap binding.")}>
                <RealCarbonToggle checked={config.splitSides} onChange={(v) => set({ splitSides: v })}
                  ariaLabel={t("motion.tap.splitSides", "Separate side bindings")} />
              </Field>
              <Field th={th} label={t("motion.tap.typingQuiet", "Typing quiet window")}
                value={`${config.typingQuietMs} ms`} height={24}
                hint={t("motion.tap.typingQuietHint", "Held keys always block tap actions; ordinary keys are never delayed.")}>
                <Slider th={th} value={config.typingQuietMs} min={0} max={1000} step={10}
                  onCommit={(v) => set({ typingQuietMs: v })} />
              </Field>

              <Field th={th} label={t("motion.tap.timeLimit", "Max tap length")} tag="TIME_LIMIT"
                value={`${config.timeLimitMs} ms`} height={24}>
                <Slider th={th} value={config.timeLimitMs} min={5} max={200} step={5} onCommit={(v) => set({ timeLimitMs: v })} />
              </Field>
              <Field th={th} label={t("motion.tap.latency", "Minimum gap before the second tap")} tag="TIME_LATENCY"
                value={`${config.latencyMs} ms`} height={24}>
                <Slider th={th} value={config.latencyMs} min={10} max={400} step={10} onCommit={(v) => set({ latencyMs: v })} />
              </Field>
            </SettingsList>
          </fieldset>
          {advanced && <TapDiagnosticsPanel th={th} t={t} enabled={config.enabled} />}
        </details>}
      </div>
    </div>
  );
}

const LIFT_FIELDS = [
  { key: "carriedSettleMs", label: "carriedSettle", unit: "ms", min: 100, max: 600, recommended: 180 },
  { key: "briefSettleMs", label: "briefSettle", unit: "ms", min: 40, max: 200, recommended: 60 },
  { key: "stableSpanMg", label: "stableSpan", unit: "mg", min: 20, max: 100, recommended: 60 },
  { key: "departureMg", label: "departure", unit: "mg", min: 120, max: 350, recommended: 200 },
  { key: "verifyMs", label: "verify", unit: "ms", min: 20, max: 60, recommended: 30 },
] as const;

type LiftField = (typeof LIFT_FIELDS)[number]["key"];

function LiftLockSettings({ th, t, config, onChange }: {
  th: CarbonTheme;
  t: MotionViewProps["t"];
  config: CarryConfig;
  onChange: (config: CarryConfig) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<Partial<Record<LiftField, string>>>({});
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const updated = { ...config };
  const valid = LIFT_FIELDS.every(({ key, min, max }) => {
    const value = Number(draft[key] ?? config[key]);
    updated[key] = value;
    return Number.isInteger(value) && value >= min && value <= max;
  }) && updated.carriedSettleMs >= updated.briefSettleMs;
  const changed = LIFT_FIELDS.some(({ key }) => Number(draft[key] ?? config[key]) !== config[key]);

  const apply = async (next: CarryConfig, clearDraft = false) => {
    setBusy(true);
    setFailed(false);
    try {
      const ok = await onChange(next);
      setFailed(!ok);
      if (ok && clearDraft) setDraft({});
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <EnableBar th={th} title={t("motion.carry.guardGroup", "Lift lock")}
        desc={t("motion.lift.description", "Locks input when lifted and restores it after stable placement.")}
        enabled={config.enabled} disabled={busy} onChange={(enabled) => void apply({ ...config, enabled })} />
      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-4 sm:px-6">
        <SettingsBlock th={th} title={t("motion.lift.parameters", "Detection parameters")}
          hint={t("motion.lift.applyHint", "Apply updates the keyboard immediately. Use Save to keyboard to keep the changes after restart.")}>
          <div className="divide-y divide-base-300">
            {LIFT_FIELDS.map(({ key, label, unit, min, max }) => (
              <label key={key} className="grid grid-cols-[minmax(0,1fr)_6rem] items-start gap-x-4 gap-y-1 py-3">
                <span className="self-center text-sm font-medium text-base-content">
                  {t("motion.carry.guard." + label, label)} · {unit}
                </span>
                <input type="number" min={min} max={max} step={1} disabled={busy}
                  className="h-8 w-full border border-base-300 bg-layer2 px-2 font-mono text-sm text-base-content"
                  value={draft[key] ?? config[key]}
                  onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} />
                <span className="col-span-2 text-xs leading-relaxed text-helper">
                  {t("motion.carry.guard." + label + "Hint", "")} ({min}–{max})
                </span>
              </label>
            ))}
          </div>
          {!valid && <InlineError th={th} t={t} message={t("motion.lift.invalid", "Check the ranges. The brief lift time must be at most the extended movement time.")} />}
          {failed && <InlineError th={th} t={t} message={t("motion.lift.failed", "The keyboard did not apply the lift lock settings.")} />}
          <div className="flex flex-wrap gap-2 pt-3">
            <ActionButton th={th} label={t("motion.lift.recommended", "Restore recommended")} disabled={busy}
              onClick={() => setDraft(Object.fromEntries(LIFT_FIELDS.map(({ key, recommended }) => [key, String(recommended)])))} />
            <ActionButton th={th} label={t("motion.lift.apply", "Apply parameters")} primary
              disabled={busy || !valid || !changed} onClick={() => void apply(updated, true)} />
          </div>
        </SettingsBlock>
        <p className="mt-3 text-xs leading-relaxed text-helper">
          {t("motion.lift.bufferedHint", "Keys pressed while placement is being confirmed are buffered and sent in order once the keyboard is stable.")}
        </p>
      </div>
    </div>
  );
}

function CarrySettings({ th, t, config, thresholdMax, thresholdDraft, onThresholdDraft, onChange }: {
  th: CarbonTheme;
  t: (k: string, d: string) => string;
  config: CarryConfig;
  thresholdMax: number;
  /** Uncommitted slider value, shared with the live meter's marker. */
  thresholdDraft: number | null;
  onThresholdDraft: (v: number | null) => void;
  onChange: (c: CarryConfig) => void;
}) {
  const set = (patch: Partial<CarryConfig>) => onChange({ ...config, ...patch });
  const dim = config.enabled ? 1 : 0.45;
  const shownThreshold = thresholdDraft ?? config.motionThreshold;

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <EnableBar th={th}
        title={t("motion.carry.title", "Carry sleep")}
        desc={t("motion.carry.desc", "Enters sleep after sustained motion to reduce unintended input during transport.")}
        enabled={config.enabled}
        onChange={(v) => set({ enabled: v })} />
      <div className="custom-scrollbar"
        style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 24px 24px", opacity: dim, pointerEvents: config.enabled ? "auto" : "none" }}>
        <SettingsList>
          <Field th={th} label={t("motion.carry.motionThreshold", "Motion threshold")} tag="INT_THS"
            value={String(shownThreshold)} height={24}>
            <Slider th={th} value={config.motionThreshold} min={1} max={thresholdMax}
              onDraftChange={onThresholdDraft}
              onCommit={(v) => { set({ motionThreshold: v }); onThresholdDraft(null); }} />
          </Field>
          <Field th={th} label={t("motion.carry.motionDuration", "Sustained movement")} tag="STREAK"
            value={`${Math.round(config.motionDurationMs / 1000)} s`} height={24}
            hint={t("motion.carry.motionDurationHint", "Motion must persist for the configured duration before sleep. Brief vibration does not trigger sleep; key input cancels the pending transition.")}>
            <Slider th={th} value={config.motionDurationMs} min={1000} max={30000} step={1000}
              onCommit={(v) => set({ motionDurationMs: v })} />
          </Field>

        </SettingsList>
      </div>
    </div>
  );
}

function StillWakeSettings({ th, t, config, onChange }: {
  th: CarbonTheme;
  t: (k: string, d: string) => string;
  config: StillWakeConfig;
  onChange: (c: StillWakeConfig) => void;
}) {
  const set = (patch: Partial<StillWakeConfig>) => onChange({ ...config, ...patch });
  const dim = config.enabled ? 1 : 0.45;

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <EnableBar th={th}
        title={t("motion.stillWake.title", "Stationary wake")}
        desc={t("motion.stillWake.desc", "After a motion wake event, confirm that the device is stationary before keeping it awake.")}
        enabled={config.enabled}
        onChange={(v) => set({ enabled: v })} />

      <div className="custom-scrollbar"
        style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 24px 24px", opacity: dim, pointerEvents: config.enabled ? "auto" : "none" }}>
        <SettingsList>
          <Field th={th} label={t("motion.stillWake.settleDuration", "Settle time")} tag="SETTLE"
            value={`${Math.round(config.settleDurationMs / 1000)} s`} height={24}
            hint={t("motion.stillWake.settleDurationHint", "After a motion wake event, the keyboard must remain stationary for this duration; otherwise it returns to sleep.")}>
            <Slider th={th} value={config.settleDurationMs} min={1000} max={30000} step={1000}
              onCommit={(v) => set({ settleDurationMs: v })} />
          </Field>
        </SettingsList>
      </div>
    </div>
  );
}
