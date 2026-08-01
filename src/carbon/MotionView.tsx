import { useEffect, useState } from "react";
import { Hand, Waves, ShieldCheck, Lock, Unlock, Smartphone } from "lucide-react";

import type { BehaviorBinding, Layer } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";

import type { CarbonTheme } from "./theme";
import { Loading, NotSupportedHint, SegmentedControl, Toggle } from "./CarbonChrome";
import { BehaviorBindingPicker } from "../behaviors/BehaviorBindingPicker";
import { summarizeBinding } from "../combos/comboUtils";
import {
  LockScope,
  Orientation,
  TapKind,
  type LockConfig,
  type TapConfig,
} from "../motion/motionRpc";
import type { MotionModel } from "../motion/useMotion";

type Section = "tap" | "lock";

interface MotionViewProps {
  motion: MotionModel;
  behaviors: Record<number, GetBehaviorDetailsResponse>;
  behaviorList: GetBehaviorDetailsResponse[];
  layers: Layer[];
  th: CarbonTheme;
  t: (k: string, d: string) => string;
}

/*
 * IMU panel (PH60SCV2EVO / LIS2DH12): case-tap actions and the walk-detect key
 * lock. Same three-part shape as the lighting panel — capability rail, live
 * canvas, config drawer — because both are "pick a feature, watch it, tune it".
 *
 * The live meter is the point of the middle pane: thresholds are in raw sensor
 * counts, so the only honest way to pick one is to watch the signal while
 * moving the keyboard.
 */
export function MotionView({ motion, behaviors, behaviorList, layers, th, t }: MotionViewProps) {
  const { capabilities, tapConfig, lockConfig } = motion;

  const allSections: { id: Section; label: string; icon: React.ReactNode; has: boolean }[] = [
    {
      id: "tap",
      label: t("motion.tap.title", "Case tap"),
      icon: <Hand size={16} />,
      has: !!capabilities?.supportsTap && !!tapConfig,
    },
    {
      id: "lock",
      label: t("motion.lock.title", "Motion lock"),
      icon: <ShieldCheck size={16} />,
      has: !!capabilities?.supportsLock && !!lockConfig,
    },
  ];
  const sections = allSections.filter((s) => s.has);

  const [section, setSection] = useState<Section>("tap");
  const current = sections.some((s) => s.id === section) ? section : sections[0]?.id;

  const [editingBinding, setEditingBinding] = useState<BehaviorBinding | null>(null);

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
    <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
      {/* Capability rail */}
      <aside style={{ width: 210, flexShrink: 0, display: "flex", flexDirection: "column", background: th.railBg, borderRight: `1px solid ${th.border}` }}>
        <div style={{ padding: "12px 16px", background: th.layer1, borderBottom: `1px solid ${th.border}`, display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <Waves size={16} style={{ color: th.interactive }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: th.textPrimary }}>{t("carbon.nav.motion", "Motion")}</span>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }} className="custom-scrollbar">
          {sections.map((s) => {
            const active = s.id === current;
            return (
              <button key={s.id} onClick={() => { setSection(s.id); setEditingBinding(null); }}
                style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", minHeight: 44, padding: "0 14px", cursor: "pointer", textAlign: "left", background: active ? th.selectedLayer : "transparent", border: "none", borderLeft: `3px solid ${active ? th.interactive : "transparent"}`, fontFamily: "var(--font-sans)" }}>
                <span style={{ color: active ? th.interactive : th.iconSecondary, display: "flex", flexShrink: 0 }}>{s.icon}</span>
                <span style={{ fontSize: 14, fontWeight: active ? 500 : 400, color: active ? th.textPrimary : th.textSecondary }}>{s.label}</span>
              </button>
            );
          })}
        </div>
        <div style={{ padding: "10px 14px", borderTop: `1px solid ${th.border}`, fontSize: 11, color: th.textHelper, fontFamily: "var(--font-mono)" }}>
          {capabilities.sensor}
        </div>
      </aside>

      {/* Live canvas + config drawer */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0 }}>
        {/* The meter is a fixed-height readout; the freed vertical space goes to
            the settings drawer so it rarely has to scroll. */}
        <div style={{ flexShrink: 0, display: "flex", justifyContent: "center", padding: "12px 24px 14px" }}>
          <LiveMeter
            th={th}
            t={t}
            motion={motion}
            section={current ?? "tap"}
          />
        </div>

        <div style={{ flex: 1, minHeight: 240, borderTop: `1px solid ${th.border}`, background: th.layer1, display: "flex", flexDirection: "column" }}>
          {editingBinding && tapConfig ? (
            <div style={{ display: "flex", flexDirection: "column", minHeight: 0, height: "100%" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, height: 40, padding: "0 16px", borderBottom: `1px solid ${th.border}`, flexShrink: 0 }}>
                <span style={{ flex: 1, fontSize: 13, color: th.textPrimary, fontWeight: 500 }}>
                  {t("motion.tap.bindingTitle", "Action triggered by a case tap")}
                </span>
                <button onClick={() => setEditingBinding(null)}
                  style={{ padding: "5px 12px", fontSize: 12, background: "transparent", color: th.textSecondary, border: `1px solid ${th.border}`, cursor: "pointer", fontFamily: "var(--font-sans)" }}>
                  {t("common.cancel", "Cancel")}
                </button>
                <button onClick={() => { motion.applyTapConfig({ ...tapConfig, binding: editingBinding }); setEditingBinding(null); }}
                  style={{ padding: "5px 12px", fontSize: 12, background: th.interactive, color: "#fff", border: "none", cursor: "pointer", fontFamily: "var(--font-sans)" }}>
                  {t("combos.confirm", "Confirm")}
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 py-3">
                <BehaviorBindingPicker
                  binding={editingBinding}
                  behaviors={behaviorList}
                  layers={layers}
                  onBindingChanged={setEditingBinding}
                />
              </div>
            </div>
          ) : current === "tap" && tapConfig ? (
            <TapSettings
              th={th} t={t}
              config={tapConfig}
              thresholdMax={capabilities.thresholdMax}
              supportsDoubleTap={capabilities.supportsDoubleTap}
              bindingLabel={summarizeBinding(tapConfig.binding, behaviors)}
              onEditBinding={() => setEditingBinding(tapConfig.binding ?? { behaviorId: -1, param1: 0, param2: 0 })}
              onChange={(c) => motion.applyTapConfig(c)}
            />
          ) : current === "lock" && lockConfig ? (
            <LockSettings
              th={th} t={t}
              config={lockConfig}
              thresholdMax={capabilities.thresholdMax}
              onChange={(c) => motion.applyLockConfig(c)}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ─── Live meter ────────────────────────────────────────────────────────────────

function LiveMeter({ th, t, motion, section }: {
  th: CarbonTheme;
  t: (k: string, d: string) => string;
  motion: MotionModel;
  section: Section;
}) {
  const { live, capabilities, tapConfig, lockConfig } = motion;
  const max = capabilities?.thresholdMax ?? 127;
  const pct = (v: number) => `${Math.min(100, Math.max(0, (v / max) * 100))}%`;

  // Markers make the raw counts legible: you can see how far the current signal
  // sits from the threshold that would actually fire.
  const markers =
    section === "tap"
      ? tapConfig
        ? [{ value: tapConfig.threshold, label: t("motion.tap.threshold", "Trigger threshold"), color: th.interactive }]
        : []
      : lockConfig
        ? [
            { value: lockConfig.motionThreshold, label: t("motion.lock.motionThreshold", "Lock threshold"), color: th.warning },
            { value: lockConfig.stillThreshold, label: t("motion.lock.stillThreshold", "Still threshold"), color: th.success },
          ]
        : [];

  const orientationLabel: Record<Orientation, string> = {
    [Orientation.UNKNOWN]: t("motion.orientation.unknown", "Unknown"),
    [Orientation.FLAT_UP]: t("motion.orientation.flatUp", "Flat, face up"),
    [Orientation.FLAT_DOWN]: t("motion.orientation.flatDown", "Upside down"),
    [Orientation.TILTED]: t("motion.orientation.tilted", "Tilted / moving"),
  };

  // State card and meter sit side by side so the readout costs one block of
  // height instead of two, leaving the settings drawer room not to scroll.
  return (
    <div style={{ width: "100%", maxWidth: 920, display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 14 }}>
      {/* Lock state — the thing users actually want to confirm */}
      <div style={{ flex: "1 1 300px", minWidth: 260, display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: th.layer1, border: `1px solid ${th.border}`, borderLeft: `3px solid ${live.locked ? th.warning : th.success}` }}>
        <span style={{ color: live.locked ? th.warning : th.success, display: "flex" }}>
          {live.locked ? <Lock size={22} /> : <Unlock size={22} />}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: th.textPrimary }}>
            {live.locked
              ? t("motion.state.locked", "Keys locked")
              : t("motion.state.unlocked", "Keys active")}
          </div>
          <div style={{ fontSize: 12, color: th.textHelper, marginTop: 2 }}>
            {live.locked
              ? t("motion.state.lockedHint", "Sustained movement detected — unlocks once set down on a flat surface")
              : t("motion.state.unlockedHint", "Still, orientation normal")}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: th.textSecondary, flexShrink: 0 }}>
          <Smartphone size={14} style={{ color: th.iconSecondary }} />
          {orientationLabel[live.orientation]}
        </div>
      </div>

      {/* Live magnitude with threshold markers, and how to read them */}
      <div style={{ flex: "1 1 320px", minWidth: 260 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 5 }}>
          <span style={{ fontSize: 12, color: th.textSecondary }}>
            {t("motion.live", "Live magnitude")}
          </span>
          <span style={{ fontSize: 12, color: th.textPrimary, fontFamily: "var(--font-mono)" }}>
            {live.magnitude} / {max}
          </span>
        </div>
        <div style={{ position: "relative", height: 20, background: th.fieldBg, border: `1px solid ${th.border}` }}>
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: pct(live.magnitude), background: th.interactive, opacity: 0.75, transition: "width 100ms linear" }} />
          {markers.map((m) => (
            <div key={m.label} style={{ position: "absolute", left: pct(m.value), top: -3, bottom: -3, width: 2, background: m.color }} />
          ))}
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 5, flexWrap: "wrap" }}>
          {markers.map((m) => (
            <span key={m.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: th.textHelper }}>
              <span style={{ width: 10, height: 2, background: m.color }} />
              {m.label} · <span style={{ fontFamily: "var(--font-mono)" }}>{m.value}</span>
            </span>
          ))}
        </div>
        <div style={{ fontSize: 11, color: th.textHelper, lineHeight: 1.5, marginTop: 6 }}>
          {section === "tap"
            ? t("motion.tap.calibrateHint", "Tap the case and watch where the peak lands, then set the threshold just below it — too low and typing vibration will trigger it.")
            : t("motion.lock.calibrateHint", "Pick the keyboard up and walk a few steps to see the range it settles into; take the lock threshold from the bottom of that range and the still threshold from the noise floor on a desk.")}
        </div>
      </div>
    </div>
  );
}

// ─── Settings forms ────────────────────────────────────────────────────────────

function Row({ th, label, hint, children }: {
  th: CarbonTheme;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "7px 0", borderBottom: `1px solid ${th.border}` }}>
      <div style={{ width: 168, flexShrink: 0 }}>
        <div style={{ fontSize: 13, color: th.textPrimary }}>{label}</div>
        {hint && <div style={{ fontSize: 11, color: th.textHelper, marginTop: 2 }}>{hint}</div>}
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>{children}</div>
    </div>
  );
}

/*
 * Fixed enable bar at the top of the drawer, matching the lighting panel's top
 * bar. Keeping it out of the scroll area means the rows below get the full
 * remaining height.
 */
function EnableBar({ th, title, desc, enabled, onChange }: {
  th: CarbonTheme;
  title: string;
  desc: string;
  enabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, height: 44, padding: "0 16px", borderBottom: `1px solid ${th.border}`, flexShrink: 0 }}>
      <Toggle th={th} checked={enabled} onChange={onChange} />
      <span style={{ fontSize: 13, fontWeight: 500, color: th.textPrimary, flexShrink: 0 }}>{title}</span>
      <span style={{ fontSize: 12, color: th.textHelper, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {desc}
      </span>
    </div>
  );
}

function Slider({ th, value, min, max, step, onChange, unit }: {
  th: CarbonTheme;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  unit?: string;
}) {
  return (
    <>
      <input type="range" min={min} max={max} step={step ?? 1} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-primary" />
      <span style={{ width: 62, textAlign: "right", fontSize: 12, color: th.textSecondary, fontFamily: "var(--font-mono)", flexShrink: 0 }}>
        {value}{unit ?? ""}
      </span>
    </>
  );
}

function TapSettings({ th, t, config, thresholdMax, supportsDoubleTap, bindingLabel, onEditBinding, onChange }: {
  th: CarbonTheme;
  t: (k: string, d: string) => string;
  config: TapConfig;
  thresholdMax: number;
  supportsDoubleTap: boolean;
  bindingLabel: string;
  onEditBinding: () => void;
  onChange: (c: TapConfig) => void;
}) {
  const set = (patch: Partial<TapConfig>) => onChange({ ...config, ...patch });
  const dim = config.enabled ? 1 : 0.45;

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <EnableBar th={th}
        title={t("motion.tap.title", "Case tap")}
        desc={t("motion.tap.desc", "Tap the case to trigger an action, recognised by the sensor's click interrupt")}
        enabled={config.enabled}
        onChange={(v) => set({ enabled: v })} />

      <div className="custom-scrollbar"
        style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "2px 16px 12px", opacity: dim, pointerEvents: config.enabled ? "auto" : "none" }}>
        <Row th={th} label={t("motion.tap.action", "Action")}>
          <span style={{ fontSize: 13, color: th.textPrimary, fontFamily: "var(--font-mono)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
            {bindingLabel}
          </span>
          <button onClick={onEditBinding}
            style={{ padding: "5px 12px", fontSize: 12, background: th.layer2, color: th.textPrimary, border: "none", cursor: "pointer", fontFamily: "var(--font-sans)", flexShrink: 0 }}>
            {t("common.change", "Change")}
          </button>
        </Row>

        {supportsDoubleTap && (
          <Row th={th} label={t("motion.tap.kind", "Tap style")}>
            <SegmentedControl th={th}
              value={String(config.kind)}
              opts={[
                { id: String(TapKind.SINGLE), label: t("motion.tap.single", "Single") },
                { id: String(TapKind.DOUBLE), label: t("motion.tap.double", "Double") },
              ]}
              onChange={(v) => set({ kind: Number(v) as TapKind })} />
          </Row>
        )}

        <Row th={th} label={t("motion.tap.threshold", "Trigger threshold")} hint="CLICK_THS">
          <Slider th={th} value={config.threshold} min={1} max={thresholdMax} onChange={(v) => set({ threshold: v })} />
        </Row>
        <Row th={th} label={t("motion.tap.timeLimit", "Max tap length")} hint="TIME_LIMIT">
          <Slider th={th} value={config.timeLimitMs} min={10} max={200} step={5} unit=" ms" onChange={(v) => set({ timeLimitMs: v })} />
        </Row>
        <Row th={th} label={t("motion.tap.latency", "Dead time after trigger")} hint="TIME_LATENCY">
          <Slider th={th} value={config.latencyMs} min={10} max={400} step={10} unit=" ms" onChange={(v) => set({ latencyMs: v })} />
        </Row>
        {config.kind === TapKind.DOUBLE && (
          <Row th={th} label={t("motion.tap.window", "Second-tap window")} hint="TIME_WINDOW">
            <Slider th={th} value={config.windowMs} min={50} max={800} step={10} unit=" ms" onChange={(v) => set({ windowMs: v })} />
          </Row>
        )}
      </div>
    </div>
  );
}

function LockSettings({ th, t, config, thresholdMax, onChange }: {
  th: CarbonTheme;
  t: (k: string, d: string) => string;
  config: LockConfig;
  thresholdMax: number;
  onChange: (c: LockConfig) => void;
}) {
  const set = (patch: Partial<LockConfig>) => onChange({ ...config, ...patch });
  const dim = config.enabled ? 1 : 0.45;

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <EnableBar th={th}
        title={t("motion.lock.title", "Motion lock")}
        desc={t("motion.lock.desc", "Locks the keys automatically while it's moving in a bag, and unlocks once set down flat")}
        enabled={config.enabled}
        onChange={(v) => set({ enabled: v })} />

      <div className="custom-scrollbar"
        style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "2px 16px 12px", opacity: dim, pointerEvents: config.enabled ? "auto" : "none" }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: th.textHelper, padding: "9px 0 2px" }}>
          {t("motion.lock.lockGroup", "WHEN TO LOCK")}
        </div>
        <Row th={th} label={t("motion.lock.motionThreshold", "Lock threshold")} hint="ACT_THS">
          <Slider th={th} value={config.motionThreshold} min={1} max={thresholdMax} onChange={(v) => set({ motionThreshold: v })} />
        </Row>
        <Row th={th} label={t("motion.lock.motionDuration", "Sustained movement")} hint={t("motion.lock.motionDurationHint", "Stops a single jolt from locking")}>
          <Slider th={th} value={config.motionDurationMs} min={200} max={10000} step={100} unit=" ms" onChange={(v) => set({ motionDurationMs: v })} />
        </Row>

        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: th.textHelper, padding: "9px 0 2px" }}>
          {t("motion.lock.unlockGroup", "WHEN TO UNLOCK")}
        </div>
        <Row th={th} label={t("motion.lock.stillThreshold", "Still threshold")}>
          <Slider th={th} value={config.stillThreshold} min={1} max={thresholdMax} onChange={(v) => set({ stillThreshold: v })} />
        </Row>
        <Row th={th} label={t("motion.lock.stillDuration", "Time held still")}>
          <Slider th={th} value={config.stillDurationMs} min={200} max={10000} step={100} unit=" ms" onChange={(v) => set({ stillDurationMs: v })} />
        </Row>
        <Row th={th} label={t("motion.lock.requireFlat", "Require flat")} hint={t("motion.lock.requireFlatHint", "Still isn't enough — must also be face up")}>
          <Toggle th={th} checked={config.requireFlat} onChange={(v) => set({ requireFlat: v })} />
        </Row>
        {config.requireFlat && (
          <Row th={th} label={t("motion.lock.flatTolerance", "Tilt tolerance")}>
            <Slider th={th} value={config.flatToleranceDeg} min={2} max={45} unit="°" onChange={(v) => set({ flatToleranceDeg: v })} />
          </Row>
        )}

        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: th.textHelper, padding: "9px 0 2px" }}>
          {t("motion.lock.scopeGroup", "LOCK SCOPE")}
        </div>
        <Row th={th} label={t("motion.lock.scope", "While locked")}>
          <SegmentedControl th={th}
            value={String(config.scope)}
            opts={[
              { id: String(LockScope.KEYS), label: t("motion.lock.scopeKeys", "Keys only") },
              { id: String(LockScope.KEYS_AND_LEDS), label: t("motion.lock.scopeKeysLeds", "Keys + lighting") },
              { id: String(LockScope.SOFT_OFF), label: t("motion.lock.scopeSoftOff", "Soft off") },
            ]}
            onChange={(v) => set({ scope: Number(v) as LockScope })} />
        </Row>
      </div>
    </div>
  );
}
