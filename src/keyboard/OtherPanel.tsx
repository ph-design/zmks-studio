import { useContext, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Zap } from "lucide-react";
import { ConnectionContext } from "../rpc/ConnectionContext";
import type { CarbonTheme } from "../carbon/theme";
import { HoldTapConfig } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import { HoldTapConfigFields } from "../behaviors/HoldTapFormFields";
import {
  BUILTIN_LAYER_TAP,
  BUILTIN_MOD_TAP,
  configsEqual,
  findBuiltinHoldTap,
  getBuiltinDefault,
  holdTapPresets,
  isHoldTapShape,
  summarizeConfig,
} from "../behaviors/holdTapUtils";

interface OtherPanelProps {
  behaviors: GetBehaviorDetailsResponse[];
  th: CarbonTheme;
  // Hoisted to the shell so the config cache survives tab switches (no reload flash).
  getConfig: (id: number) => HoldTapConfig | null;
  applyConfig: (id: number, cfg: HoldTapConfig) => Promise<boolean>;
}

/*
 * Behaviors panel — mirrors the Layers panel layout: a single "Tap-Hold" item
 * in a left secondary sidebar, and all content stacked as titled sections
 * (Mod-Tap / Layer-Tap / User Presets) on the right, like the Settings page.
 */
export const OtherPanel = ({ behaviors, th, getConfig, applyConfig }: OtherPanelProps) => {
  const { t } = useTranslation();
  const { conn } = useContext(ConnectionContext);

  const holdTapBehaviors = useMemo(() => behaviors.filter(isHoldTapShape), [behaviors]);
  const userPresets = useMemo(() => holdTapPresets(behaviors), [behaviors]);
  const builtinModTap = useMemo(
    () => findBuiltinHoldTap(holdTapBehaviors, BUILTIN_MOD_TAP) ?? null,
    [holdTapBehaviors]
  );
  const builtinLayerTap = useMemo(
    () => findBuiltinHoldTap(holdTapBehaviors, BUILTIN_LAYER_TAP) ?? null,
    [holdTapBehaviors]
  );

  const [selectedPresetId, setSelectedPresetId] = useState<number | null>(null);
  const activePresetId = selectedPresetId ?? userPresets[0]?.id ?? null;
  const activePreset = userPresets.find((p) => p.id === activePresetId) ?? null;

  if (!conn) {
    return <CenteredHint>{t("keyboard.errors.notConnected", "Not connected")}</CenteredHint>;
  }

  return (
    <div className="flex min-h-0 h-full w-full">
      {/* Left secondary sidebar — same style as the Lighting source rail. */}
      <aside style={{ width: 210, flexShrink: 0, display: "flex", flexDirection: "column", background: th.railBg, borderRight: `1px solid ${th.border}` }}>
        <div style={{ padding: "12px 16px", background: th.layer1, borderBottom: `1px solid ${th.border}`, display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <Zap size={16} style={{ color: th.interactive }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: th.textPrimary }}>{t("carbon.nav.behaviors", "Behaviors")}</span>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }} className="custom-scrollbar">
          <button aria-pressed
            style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", minHeight: 44, padding: "0 14px", cursor: "pointer", textAlign: "left", background: th.selectedLayer, border: "none", borderLeft: `3px solid ${th.interactive}`, fontFamily: "var(--font-sans)" }}>
            <span style={{ color: th.interactive, display: "flex", flexShrink: 0 }}><Zap size={16} /></span>
            <span style={{ fontSize: 14, fontWeight: 500, color: th.textPrimary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t("other.feature.tapHold", "Tap-Hold")}</span>
          </button>
        </div>
      </aside>

      {/* Right content — settings-style titled sections */}
      <div className="flex-1 min-w-0 overflow-y-auto custom-scrollbar">
        <div className="max-w-2xl px-6 py-4 flex flex-col">
          {builtinModTap && (
            <Section title={BUILTIN_MOD_TAP} desc={t("holdTap.scope.builtin", "Firmware-wide default")}>
              <TapHoldEditor
                behavior={builtinModTap}
                isBuiltin
                presets={userPresets}
                getConfig={getConfig}
                applyConfig={applyConfig}
              />
            </Section>
          )}

          {builtinLayerTap && (
            <Section title={BUILTIN_LAYER_TAP} desc={t("holdTap.scope.builtin", "Firmware-wide default")}>
              <TapHoldEditor
                behavior={builtinLayerTap}
                isBuiltin
                presets={userPresets}
                getConfig={getConfig}
                applyConfig={applyConfig}
              />
            </Section>
          )}

          <Section title={t("holdTap.section.userPresets", "User Presets")} last>
            {userPresets.length === 0 ? (
              <p className="text-sm text-base-content/50">
                {t("holdTap.empty.userPresetsHint", "Define hold-tap variants named like ht_* in your keymap.")}
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {userPresets.length > 1 && (
                  <div className="flex gap-1.5 flex-wrap" role="tablist">
                    {userPresets.map((p) => (
                      <button
                        key={p.id}
                        role="tab"
                        aria-selected={activePresetId === p.id}
                        onClick={() => setSelectedPresetId(p.id)}
                        className={`px-3 py-1.5 text-sm cursor-pointer transition-colors border ${
                          activePresetId === p.id
                            ? "bg-primary text-primary-content border-primary"
                            : "bg-base-100 text-base-content border-base-300 hover:border-base-content/40"
                        }`}
                      >
                        {p.displayName}
                      </button>
                    ))}
                  </div>
                )}
                {activePreset && (
                  <TapHoldEditor
                    key={activePreset.id}
                    behavior={activePreset}
                    isBuiltin={false}
                    presets={userPresets}
                    getConfig={getConfig}
                    applyConfig={applyConfig}
                  />
                )}
              </div>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
};

const CenteredHint = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-center justify-center h-full px-6 text-center text-sm text-base-content/40">
    {children}
  </div>
);

// Settings-page style titled block.
const Section = ({
  title,
  desc,
  last,
  children,
}: {
  title: string;
  desc?: string;
  last?: boolean;
  children: React.ReactNode;
}) => (
  <div className={`py-5 ${last ? "" : "border-b border-base-300"}`}>
    <div className="mb-3">
      <h3 className="text-[15px] font-semibold text-base-content">{title}</h3>
      {desc ? <p className="text-sm text-base-content/55 mt-0.5">{desc}</p> : null}
    </div>
    {children}
  </div>
);

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <span className="text-sm font-medium text-base-content/60">{children}</span>
);

/*
 * Self-contained editor for one hold-tap behavior: owns its own draft/save
 * state (keyed to the behavior) so several sections can be edited independently.
 */
const TapHoldEditor = ({
  behavior,
  isBuiltin,
  presets,
  getConfig,
  applyConfig,
}: {
  behavior: GetBehaviorDetailsResponse;
  isBuiltin: boolean;
  presets: GetBehaviorDetailsResponse[];
  getConfig: (id: number) => HoldTapConfig | null;
  applyConfig: (id: number, cfg: HoldTapConfig) => Promise<boolean>;
}) => {
  const { t } = useTranslation();
  const saved = getConfig(behavior.id);
  const [draft, setDraft] = useState<HoldTapConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Clear any pending draft if the behavior identity changes.
  useEffect(() => {
    setDraft(null);
    setError(null);
  }, [behavior.id]);

  const cfg = draft ?? saved;
  const dirty = !!draft && !!saved && !configsEqual(draft, saved);

  const builtinDefault = isBuiltin ? getBuiltinDefault(behavior.displayName) : null;
  const canReset = !!cfg && !!builtinDefault && !configsEqual(cfg, builtinDefault);

  if (!cfg) {
    return <div className="text-sm text-base-content/40 py-2">{t("holdTap.loading", "Loading…")}</div>;
  }

  const update = (patch: Partial<HoldTapConfig>) => setDraft({ ...cfg, ...patch });

  const save = async () => {
    if (!draft) return;
    setError(null);
    setSaving(true);
    try {
      const ok = await applyConfig(behavior.id, draft);
      if (ok) setDraft(null);
      else setError(t("holdTap.saveFailed", "Save failed or timed out. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 min-w-0">
      <HoldTapConfigFields cfg={cfg} onChange={update} />

      {isBuiltin && (
        <PresetOverlaySection
          builtin={behavior}
          draft={cfg}
          presets={presets}
          getConfig={getConfig}
          onApply={(c) => setDraft(c)}
        />
      )}

      <div className="flex items-center gap-2 pt-1">
        {isBuiltin && (
          <button
            onClick={() => builtinDefault && setDraft(builtinDefault)}
            disabled={!canReset || saving}
            className="px-3 py-1.5 text-sm text-base-content hover:bg-base-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            {t("holdTap.resetDefault", "Restore default")}
          </button>
        )}
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => setDraft(null)}
            disabled={!dirty || saving}
            className="px-3 py-1.5 text-sm text-base-content hover:bg-base-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            {t("holdTap.cancel", "Cancel")}
          </button>
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="px-4 py-1.5 text-sm font-medium bg-primary text-primary-content hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? t("holdTap.saving", "Saving…") : t("holdTap.save", "Save")}
          </button>
        </div>
      </div>
      {error ? <div className="text-sm text-error">{error}</div> : null}
    </div>
  );
};

const PresetOverlaySection = ({
  builtin,
  draft,
  presets,
  getConfig,
  onApply,
}: {
  builtin: GetBehaviorDetailsResponse;
  draft: HoldTapConfig;
  presets: GetBehaviorDetailsResponse[];
  getConfig: (id: number) => HoldTapConfig | null;
  onApply: (cfg: HoldTapConfig) => void;
}) => {
  const { t } = useTranslation();

  const matchedPresetId = useMemo(() => {
    for (const p of presets) {
      const c = getConfig(p.id);
      if (c && configsEqual(c, draft)) return p.id;
    }
    return null;
  }, [presets, getConfig, draft]);

  if (presets.length === 0) return null;

  return (
    <section className="flex flex-col gap-2 border-t border-base-300 pt-3">
      <SectionLabel>{t("holdTap.applyTitle", "Apply a preset")}</SectionLabel>
      <p className="text-sm text-base-content/60">
        {t("holdTap.applyHint", "Copy a preset's settings onto {{name}}.", {
          name: builtin.displayName,
        })}
      </p>
      <div className="flex gap-1.5 flex-wrap">
        {presets.map((p) => {
          const cfg = getConfig(p.id);
          const active = matchedPresetId === p.id;
          return (
            <button
              key={p.id}
              disabled={!cfg}
              aria-pressed={active}
              title={cfg ? summarizeConfig(cfg, t) : undefined}
              onClick={() => cfg && onApply(cfg)}
              className={`px-3 py-1.5 text-sm cursor-pointer transition-colors border disabled:opacity-40 disabled:cursor-not-allowed ${
                active
                  ? "bg-primary text-primary-content border-primary"
                  : "bg-base-100 text-base-content border-base-300 hover:border-base-content/40"
              }`}
            >
              {p.displayName}
            </button>
          );
        })}
      </div>
    </section>
  );
};
