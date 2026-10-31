import { useEffect, useRef, useState } from "react";
import { Hand, Waves, Footprints, Moon, Smartphone, Sunrise, Info } from "lucide-react";

import type { BehaviorBinding, Layer } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";

import type { CarbonTheme } from "./theme";
import { Loading, NotSupportedHint } from "./CarbonChrome";
import { RealCarbonToggle } from "./RealCarbonToggle";
import { BehaviorBindingPicker } from "../behaviors/BehaviorBindingPicker";
import { summarizeBinding } from "../combos/comboUtils";
import {
  Orientation,
  TAP_SLOTS,
  ALL_LAYERS_MASK,
  decodeClickSrc,
  withSlotBinding,
  type CarryConfig,
  type MotionLiveState,
  type StillWakeConfig,
  type TapConfig,
  type TapEvent,
  type TapSlot,
} from "../motion/motionRpc";
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

  const allSections: { id: Section; label: string; icon: React.ReactNode; has: boolean }[] = [
    {
      id: "carry",
      label: t("motion.carry.title", "Carry sleep"),
      icon: <Footprints size={16} />,
      has: !!capabilities?.supportsCarry && !!carryConfig,
    },
    {
      id: "stillWake",
      label: t("motion.stillWake.title", "Settle wake"),
      icon: <Sunrise size={16} />,
      has: !!capabilities?.supportsStillWake && !!stillWakeConfig,
    },
    {
      id: "tap",
      label: t("motion.tap.title", "Case tap"),
      icon: <Hand size={16} />,
      has: !!capabilities?.supportsTap && !!tapConfig,
    },
  ];
  const sections = allSections.filter((s) => s.has);

  const [section, setSection] = useState<Section>("carry");
  const current = sections.some((s) => s.id === section) ? section : sections[0]?.id;

  const [editing, setEditing] = useState<{ slot: TapSlot; binding: BehaviorBinding } | null>(null);

  // Live push stays off unless this view is mounted — it's per-100ms traffic.
  const { setLiveWanted } = motion;
  useEffect(() => {
    setLiveWanted(true);
    return () => setLiveWanted(false);
  }, [setLiveWanted]);

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
      <aside className="carbon-feature-rail" style={{ background: th.railBg, borderRight: `1px solid ${th.border}` }}>
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
        <CarryStateCard th={th} t={t} live={motion.live} />
        <div style={{ padding: "10px 14px", borderTop: `1px solid ${th.border}`, fontSize: 11, color: th.textHelper, fontFamily: "var(--font-mono)" }}>
          {capabilities.sensor}
        </div>
      </aside>

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
            />
          )}
        </div>

        <div style={{ flex: 1, minHeight: 240, borderTop: `1px solid ${th.border}`, background: th.layer1, display: "flex", flexDirection: "column" }}>
          {editing && tapConfig ? (
            <div style={{ display: "flex", flexDirection: "column", minHeight: 0, height: "100%" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, height: 40, padding: "0 16px", borderBottom: `1px solid ${th.border}`, flexShrink: 0 }}>
                <span style={{ flex: 1, fontSize: 13, color: th.textPrimary, fontWeight: 500 }}>
                  {t("motion.tap.bindingTitle", "Action triggered by this tap slot")}
                </span>
                <button onClick={() => setEditing(null)}
                  style={{ padding: "5px 12px", fontSize: 12, background: "transparent", color: th.textSecondary, border: `1px solid ${th.border}`, cursor: "pointer", fontFamily: "var(--font-sans)" }}>
                  {t("common.cancel", "Cancel")}
                </button>
                <button onClick={() => { motion.applyTapConfig(withSlotBinding(tapConfig, editing.slot, undefined)); setEditing(null); }}
                  style={{ padding: "5px 12px", fontSize: 12, background: "transparent", color: th.textSecondary, border: `1px solid ${th.border}`, cursor: "pointer", fontFamily: "var(--font-sans)" }}>
                  {t("motion.tap.clearBinding", "Clear")}
                </button>
                <button onClick={() => { motion.applyTapConfig(withSlotBinding(tapConfig, editing.slot, editing.binding)); setEditing(null); }}
                  style={{ padding: "5px 12px", fontSize: 12, background: th.interactive, color: "#fff", border: "none", cursor: "pointer", fontFamily: "var(--font-sans)" }}>
                  {t("combos.confirm", "Confirm")}
                </button>
              </div>
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
              <TapTestPanel th={th} t={t} live={motion.live} tapConfig={tapConfig} />
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }} className="custom-scrollbar">
                <TapSettings
                  th={th} t={t}
                  config={tapConfig}
                  behaviors={behaviors}
                  layers={layers}
                  thresholdMax={capabilities.thresholdMax}
                  onEditSlot={(slot) =>
                    setEditing({
                      slot,
                      binding: tapConfig[slot] ?? { behaviorId: -1, param1: 0, param2: 0 },
                    })
                  }
                  onChange={(c) => motion.applyTapConfig(c)}
                />
              </div>
            </div>
          ) : current === "carry" && carryConfig ? (
            <CarrySettings
              th={th} t={t}
              config={carryConfig}
              thresholdMax={capabilities.thresholdMax}
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
            ? t("motion.carry.active", "Carrying — going to sleep")
            : t("motion.carry.idle", "Settled — awake")}
        </span>
      </div>
      <div style={{ fontSize: 12, color: th.textHelper, lineHeight: 1.45, marginTop: 4 }}>
        {live.carryActive
          ? t("motion.carry.activeHint", "Still moving — the keyboard will sleep now; set it down to wake it")
          : t("motion.carry.idleHint", "Resting — carry it around and it will sleep on its own")}
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

function LiveMeter({ th, t, motion, section }: {
  th: CarbonTheme;
  t: (k: string, d: string) => string;
  motion: MotionModel;
  section: Section;
}) {
  const { live, capabilities, carryConfig } = motion;
  const max = capabilities?.thresholdMax ?? 127;
  const pct = (v: number) => `${Math.min(100, Math.max(0, (v / max) * 100))}%`;
  const peak = usePeakHold(live.magnitude, max, section);

  // Markers make raw counts legible: distance from the threshold that fires.
  const markers =
    section === "carry" && carryConfig
      ? [{ value: carryConfig.motionThreshold, label: t("motion.carry.motionThreshold", "Motion threshold"), color: th.warning }]
      : [];

  return (
    <div style={{ width: "100%" }}>
      <div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: th.textPrimary }}>
            {t("motion.live", "Live magnitude")}
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
            {section === "carry"
              ? t("motion.carry.calibrateHint", "Pick the keyboard up and walk a few steps to see the range the signal settles into, then set the motion threshold from the bottom of that range.")
              : t("motion.stillWake.meterHint", "The settle window only watches whether motion has fallen silent, so no threshold marker applies here.")}
          </div>
        </div>
      </div>
    </div>
  );
}

const TAP_TEST_HISTORY = 12;

function TapTestPanel({ th, t, live, tapConfig }: {
  th: CarbonTheme;
  t: (k: string, d: string) => string;
  live: MotionLiveState;
  tapConfig: TapConfig;
}) {
  const [events, setEvents] = useState<TapEvent[]>([]);
  const [missed, setMissed] = useState(0);
  const prevTap = useRef(false);
  const lastEventAt = useRef(0);
  const lastMissAt = useRef(0);

  useEffect(() => {
    const now = Date.now();
    if (live.tapDetected && !prevTap.current && live.lastClickSrc !== 0) {
      const ev = decodeClickSrc(live.lastClickSrc);
      lastEventAt.current = ev.at;
      setEvents((prev) => [ev, ...prev].slice(0, TAP_TEST_HISTORY));
    } else if (tapConfig.enabled && !live.tapDetected &&
               live.magnitude >= tapConfig.threshold &&
               now - lastEventAt.current > 250 && now - lastMissAt.current > 400) {
      lastMissAt.current = now;
      setMissed((m) => m + 1);
    }
    prevTap.current = live.tapDetected;
  }, [live, tapConfig.threshold, tapConfig.enabled]);

  const clear = () => { setEvents([]); setMissed(0); };
  const last = events[0];
  const leftCount = events.filter((e) => e.side === "left").length;
  const singleCount = events.filter((e) => e.taps === 1).length;

  const sideLabel = (side: TapEvent["side"]) =>
    side === "left" ? t("motion.tap.side.left", "Left") : t("motion.tap.side.right", "Right");

  return (
    <div style={{ flexShrink: 0, borderBottom: `1px solid ${th.border}`, padding: "12px 24px 14px" }}>
      {!tapConfig.enabled && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", marginBottom: 10, background: th.fieldBg, border: `1px solid ${th.warning}` }}>
          <Info size={16} style={{ color: th.warning, flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: th.textPrimary }}>
            {t("motion.tap.test.disabled", "Tap recognition is off — enable Case tap below, then the chip events will show up here")}
          </span>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <Hand size={16} style={{ color: th.interactive }} />
        <span style={{ fontSize: 14, fontWeight: 600, color: th.textPrimary }}>
          {t("motion.tap.test.title", "Tap test")}
        </span>
        <span style={{ fontSize: 12, color: th.textHelper }}>
          {t("motion.tap.test.hint", "Tap the case; each recognition shows up here while you tune")}
        </span>
        {events.length > 0 && (
          <button
            onClick={clear}
            style={{ marginLeft: "auto", padding: "3px 10px", fontSize: 11, background: "transparent", color: th.textSecondary, border: `1px solid ${th.border}`, cursor: "pointer", fontFamily: "var(--font-sans)" }}
          >
            {t("motion.tap.test.clear", "Clear")}
          </button>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "stretch", gap: 16 }}>
        {/* Latest recognition, big and immediate */}
        <div
          key={last?.at}
          style={{
            minWidth: 170, padding: "10px 16px", display: "flex", flexDirection: "column", justifyContent: "center",
            background: last ? th.selectedLayer : th.fieldBg, border: `1px solid ${last ? th.interactive : th.border}`,
          }}
        >
          {last ? (
            <>
              <span style={{ fontSize: 20, fontWeight: 600, color: th.textPrimary, fontFamily: "var(--font-sans)" }}>
                {sideLabel(last.side)} ·{" "}
                {last.taps === 2 ? t("motion.tap.test.double", "double tap") : t("motion.tap.test.single", "single tap")}
              </span>
              <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: th.textHelper, marginTop: 2 }}>
                CLICK_SRC 0x{last.src.toString(16).padStart(2, "0")} · {last.axes}
              </span>
            </>
          ) : (
            <span style={{ fontSize: 13, color: th.textHelper }}>
              {t("motion.tap.test.waiting", "Waiting for a tap…")}
            </span>
          )}
        </div>

        {/* Session counters for quick accuracy checks */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4, justifyContent: "center", minWidth: 150 }}>
          <span style={{ fontSize: 12, color: th.textHelper }}>
            {t("motion.tap.test.count", "Recognized")}: <span style={{ fontFamily: "var(--font-mono)", color: th.textPrimary }}>{events.length}</span>
          </span>
          <span style={{ fontSize: 12, color: th.textHelper }}>
            {t("motion.tap.side.left", "Left")}/{t("motion.tap.side.right", "Right")}:{" "}
            <span style={{ fontFamily: "var(--font-mono)", color: th.textPrimary }}>{leftCount}/{events.length - leftCount}</span>
          </span>
          <span style={{ fontSize: 12, color: th.textHelper }}>
            {t("motion.tap.test.single", "single tap")}/{t("motion.tap.test.double", "double tap")}:{" "}
            <span style={{ fontFamily: "var(--font-mono)", color: th.textPrimary }}>{singleCount}/{events.length - singleCount}</span>
            <span style={{ color: th.textHelper }}> ({t("motion.tap.test.eventCount", "chip events — one double-tap gesture logs both")})</span>
          </span>
          <span style={{ fontSize: 12, color: missed > 0 ? th.warning : th.textHelper }}>
            {t("motion.tap.test.missed", "Above threshold, not recognized")}:{" "}
            <span style={{ fontFamily: "var(--font-mono)" }}>{missed}</span>
          </span>
        </div>

        {/* History: newest first */}
        <div style={{ flex: 1, minWidth: 0, fontFamily: "var(--font-mono)", fontSize: 11, color: th.textSecondary, overflow: "hidden" }}>
          {events.slice(0, 6).map((e) => (
            <div key={e.at} style={{ display: "flex", gap: 12, whiteSpace: "nowrap" }}>
              <span style={{ color: th.textHelper }}>
                {new Date(e.at).toLocaleTimeString([], { minute: "2-digit", second: "2-digit" })}
              </span>
              <span style={{ width: 52 }}>{sideLabel(e.side)}</span>
              <span style={{ width: 64 }}>{e.taps === 2 ? "x2" : "x1"}</span>
              <span style={{ width: 44 }}>{e.axes}</span>
              <span>0x{e.src.toString(16).padStart(2, "0")}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ fontSize: 11, color: th.textHelper, marginTop: 8 }}>
        {t(
          "motion.tap.test.sideNote",
          "Side follows the sensor Sign bit as the firmware reads it; if left/right are swapped on your board, build with CONFIG_ZMK_MOTION_TAP_SIDE_INVERT."
        )}
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
  height?: number;
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
function EnableBar({ th, title, desc, enabled, onChange }: {
  th: CarbonTheme;
  title: string;
  desc: string;
  enabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, height: 48, padding: "0 20px", borderBottom: `1px solid ${th.border}`, flexShrink: 0 }}>
      <RealCarbonToggle checked={enabled} onChange={onChange} />
      <span style={{ fontSize: 14, fontWeight: 600, color: th.textPrimary, flexShrink: 0 }}>{title}</span>
      <span style={{ fontSize: 12, color: th.textHelper, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {desc}
      </span>
    </div>
  );
}

// Full-width track with Carbon's end labels. Dragging previews locally; the
// value commits on release so a drag isn't one RPC per pixel.
function Slider({ th, value, min, max, step, onCommit, unit }: {
  th: CarbonTheme;
  value: number;
  min: number;
  max: number;
  step?: number;
  onCommit: (v: number) => void;
  unit?: string;
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
        min={min}
        max={max}
        step={step ?? 1}
        value={draft}
        onChange={(e) => setDraft(Number(e.target.value))}
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

// No chip selected = layerMask 0, which the firmware treats as "every layer".
function LayerChips({ th, t, layers, mask, onChange }: {
  th: CarbonTheme;
  t: (k: string, d: string) => string;
  layers: Layer[];
  mask: number;
  onChange: (m: number) => void;
}) {
  const chip = (on: boolean): React.CSSProperties => ({
    padding: "4px 12px", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap",
    background: on ? th.selectedLayer : "transparent",
    color: on ? th.textPrimary : th.textSecondary,
    border: `1px solid ${on ? th.interactive : th.border}`,
  });
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", minHeight: 32 }}>
      {layers.map((layer, i) => {
        const on = mask === ALL_LAYERS_MASK || (mask & (1 << i)) !== 0;
        return (
          <button key={i} style={chip(mask !== ALL_LAYERS_MASK && on)}
            onClick={() => {
              if (mask === ALL_LAYERS_MASK) {
                onChange(1 << i);
              } else {
                onChange(on ? mask & ~(1 << i) : mask | (1 << i));
              }
            }}>
            {layer.name ?? `Layer ${i}`}
          </button>
        );
      })}
      <span style={{ fontSize: 11, color: th.textHelper }}>
        {mask === ALL_LAYERS_MASK
          ? t("motion.tap.allLayers", "All layers")
          : t("motion.tap.allLayersOff", "Leave all off for every layer")}
      </span>
    </div>
  );
}

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
  const set = (patch: Partial<TapConfig>) => onChange({ ...config, ...patch });
  const dim = config.enabled ? 1 : 0.45;

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <EnableBar th={th}
        title={t("motion.tap.title", "Case tap")}
        desc={t("motion.tap.desc", "Tap the case to trigger actions, one binding per side and tap style")}
        enabled={config.enabled}
        onChange={(v) => set({ enabled: v })} />

      <div className="custom-scrollbar"
        style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 24px 24px", opacity: dim, pointerEvents: config.enabled ? "auto" : "none" }}>
        <SettingsList>
          <GroupHeading th={th}>{t("motion.tap.bindingsGroup", "Bindings")}</GroupHeading>
          {TAP_SLOTS.map(({ slot, side, taps }) => (
            <Field key={slot} th={th}
              label={t(`motion.tap.${side}${taps === 1 ? "Single" : "Double"}`,
                `${side === "left" ? "Left" : "Right"} ${taps === 1 ? "single" : "double"} tap`)}
              tag={taps === 1 ? "SCLICK" : "DCLICK"}>
              <ValueField th={th}
                value={config[slot]
                  ? summarizeBinding(config[slot] as BehaviorBinding, behaviors)
                  : t("motion.tap.unbound", "Not set")}
                actionLabel={t("common.change", "Change")}
                onAction={() => onEditSlot(slot)} />
            </Field>
          ))}

          <GroupHeading th={th}>{t("motion.tap.timingGroup", "Detection")}</GroupHeading>
          <Field th={th} label={t("motion.tap.threshold", "Trigger threshold")} tag="CLICK_THS"
            value={String(config.threshold)} height={24}>
            <Slider th={th} value={config.threshold} min={1} max={thresholdMax} onCommit={(v) => set({ threshold: v })} />
          </Field>
          <Field th={th} label={t("motion.tap.timeLimit", "Max tap length")} tag="TIME_LIMIT"
            value={`${config.timeLimitMs} ms`} height={24}>
            <Slider th={th} value={config.timeLimitMs} min={20} max={200} step={5} onCommit={(v) => set({ timeLimitMs: v })} />
          </Field>
          <Field th={th} label={t("motion.tap.latency", "Dead time after trigger")} tag="TIME_LATENCY"
            value={`${config.latencyMs} ms`} height={24}>
            <Slider th={th} value={config.latencyMs} min={10} max={400} step={10} onCommit={(v) => set({ latencyMs: v })} />
          </Field>
          <Field th={th} label={t("motion.tap.window", "Second-tap window")} tag="TIME_WINDOW"
            value={`${config.windowMs} ms`} height={24}
            hint={t("motion.tap.windowHint", "When a single and a double share a side, the single fires this long late so the double can win")}>
            <Slider th={th} value={config.windowMs} min={50} max={800} step={10} onCommit={(v) => set({ windowMs: v })} />
          </Field>

          <GroupHeading th={th}>{t("motion.tap.layersGroup", "Active layers")}</GroupHeading>
          <Field th={th} label={t("motion.tap.layers", "Layers")}
            hint={t("motion.tap.layersHint", "Taps only fire while one of these layers is active; leave all off for every layer")}>
            <LayerChips th={th} t={t} layers={layers} mask={config.layerMask}
              onChange={(m) => set({ layerMask: m })} />
          </Field>
        </SettingsList>
      </div>
    </div>
  );
}

function CarrySettings({ th, t, config, thresholdMax, onChange }: {
  th: CarbonTheme;
  t: (k: string, d: string) => string;
  config: CarryConfig;
  thresholdMax: number;
  onChange: (c: CarryConfig) => void;
}) {
  const set = (patch: Partial<CarryConfig>) => onChange({ ...config, ...patch });
  const dim = config.enabled ? 1 : 0.45;

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <EnableBar th={th}
        title={t("motion.carry.title", "Carry sleep")}
        desc={t("motion.carry.desc", "Sleeps the keyboard after sustained walking, so it isn't awake and firing in a bag")}
        enabled={config.enabled}
        onChange={(v) => set({ enabled: v })} />
      <div className="custom-scrollbar"
        style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 24px 24px", opacity: dim, pointerEvents: config.enabled ? "auto" : "none" }}>
        <SettingsList>
          <Field th={th} label={t("motion.carry.motionThreshold", "Motion threshold")} tag="INT_THS"
            value={String(config.motionThreshold)} height={24}>
            <Slider th={th} value={config.motionThreshold} min={1} max={thresholdMax} onCommit={(v) => set({ motionThreshold: v })} />
          </Field>
          <Field th={th} label={t("motion.carry.motionDuration", "Sustained movement")} tag="STREAK"
            value={`${Math.round(config.motionDurationMs / 1000)} s`} height={24}
            hint={t("motion.carry.motionDurationHint", "Movement must be this sustained before sleeping — a single jolt won't do it; a key press always cancels")}>
            <Slider th={th} value={config.motionDurationMs} min={5000} max={600000} step={5000}
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
        title={t("motion.stillWake.title", "Settle wake")}
        desc={t("motion.stillWake.desc", "Stays awake once the keyboard has been set down still")}
        enabled={config.enabled}
        onChange={(v) => set({ enabled: v })} />

      <div className="custom-scrollbar"
        style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 24px 24px", opacity: dim, pointerEvents: config.enabled ? "auto" : "none" }}>
        <SettingsList>
          <Field th={th} label={t("motion.stillWake.settleDuration", "Settle time")} tag="SETTLE"
            value={`${Math.round(config.settleDurationMs / 1000)} s`} height={24}
            hint={t("motion.stillWake.settleDurationHint", "After a motion wake-up the keyboard must stay this still, or it goes straight back to sleep — a bag keeps moving, a desk doesn't")}>
            <Slider th={th} value={config.settleDurationMs} min={2000} max={30000} step={1000}
              onCommit={(v) => set({ settleDurationMs: v })} />
          </Field>
        </SettingsList>
      </div>
    </div>
  );
}
