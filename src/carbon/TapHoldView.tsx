import { useContext, useMemo, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Zap } from "lucide-react";
import type { CarbonTheme } from "./theme";
import { ConnectionContext } from "../rpc/ConnectionContext";
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
import { NotSupportedHint } from "./CarbonChrome";

interface TapHoldViewProps {
  behaviors: GetBehaviorDetailsResponse[];
  th: CarbonTheme;
  getConfig: (id: number) => HoldTapConfig | null;
  applyConfig: (id: number, cfg: HoldTapConfig) => Promise<boolean>;
}

//tap-hold panel
export const TapHoldView = ({ behaviors, th, getConfig, applyConfig }: TapHoldViewProps) => {
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
    return (
      <NotSupportedHint th={th}
        icon={<Zap size={40} />}
        title={t("keyboard.errors.notConnected", "Not connected")}
        desc=""
      />
    );
  }

  if (holdTapBehaviors.length === 0) {
    return (
      <NotSupportedHint th={th}
        icon={<Zap size={40} />}
        title={t("holdTap.emptyTitle", "Tap-Hold 不可用")}
        desc={t("holdTap.emptyHint", "基于 ph-design/zmks 分支，添加 ht_* 节点，compatible = \"zmk,behavior-hold-tap\"")}
      />
    );
  }

  return (
    <div className="flex-1 min-w-0 overflow-y-auto custom-scrollbar">
      <div style={{ padding: 24, maxWidth: 560 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: th.textPrimary, marginBottom: 20 }}>
          {t("other.feature.tapHold", "Tap-Hold")}
        </h2>

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
            <p style={{ fontSize: 13, color: th.textHelper }}>
              {t("holdTap.empty.userPresetsHint", "Define hold-tap variants named like ht_* in your keymap.")}
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {userPresets.length > 1 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {userPresets.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setSelectedPresetId(p.id)}
                      style={{
                        padding: "6px 14px", fontSize: 13, cursor: "pointer",
                        background: activePresetId === p.id ? th.interactive : th.fieldBg,
                        color: activePresetId === p.id ? "#fff" : th.textSecondary,
                        border: `1px solid ${activePresetId === p.id ? th.interactive : th.borderStrong}`,
                        fontFamily: "var(--font-sans)",
                      }}
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
  );
};


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
  <div style={{ padding: "20px 0", borderBottom: last ? "none" : "1px solid var(--border-color, #393939)" }}>
    <div style={{ marginBottom: 12 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600 }}>{title}</h3>
      {desc ? <p style={{ fontSize: 12, color: "var(--text-helper, #8d8d8d)", marginTop: 4 }}>{desc}</p> : null}
    </div>
    {children}
  </div>
);

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <span style={{ fontSize: 13, fontWeight: 500, opacity: 0.6 }}>{children}</span>
);

// Self-contained editor for one hold-tap behavior
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

  useEffect(() => {
    setDraft(null);
    setError(null);
  }, [behavior.id]);

  const cfg = draft ?? saved;
  const dirty = !!draft && !!saved && !configsEqual(draft, saved);

  const builtinDefault = isBuiltin ? getBuiltinDefault(behavior.displayName) : null;
  const canReset = !!cfg && !!builtinDefault && !configsEqual(cfg, builtinDefault);

  const matchedPresetId = useMemo(() => {
    if (!draft) return null;
    for (const p of presets) {
      const c = getConfig(p.id);
      if (c && configsEqual(c, draft)) return p.id;
    }
    return null;
  }, [presets, getConfig, draft]);

  if (!cfg) {
    return <div style={{ fontSize: 13, opacity: 0.4, padding: "8px 0" }}>{t("holdTap.loading", "Loading…")}</div>;
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
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <HoldTapConfigFields cfg={cfg} onChange={update} />

      {isBuiltin && presets.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid var(--border-color, #393939)", paddingTop: 12 }}>
          <SectionLabel>{t("holdTap.applyTitle", "Apply a preset")}</SectionLabel>
          <p style={{ fontSize: 13, opacity: 0.6 }}>
            {t("holdTap.applyHint", "Copy a preset's settings onto {{name}}.", { name: behavior.displayName })}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {presets.map((p) => {
              const pc = getConfig(p.id);
              const active = matchedPresetId === p.id;
              return (
                <button
                  key={p.id}
                  disabled={!pc}
                  title={pc ? summarizeConfig(pc, t) : undefined}
                  onClick={() => pc && setDraft(pc)}
                  style={{
                    padding: "6px 14px", fontSize: 13, cursor: pc ? "pointer" : "default",
                    background: active ? "#0f62fe" : "#2d2d2d",
                    color: active ? "#fff" : "#c6c6c6",
                    border: `1px solid ${active ? "#0f62fe" : "#6f6f6f"}`,
                    fontFamily: "var(--font-sans)", opacity: pc ? 1 : 0.4,
                  }}
                >
                  {p.displayName}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 4 }}>
        {isBuiltin && (
          <button
            onClick={() => builtinDefault && setDraft(builtinDefault)}
            disabled={!canReset || saving}
            style={{
              padding: "6px 12px", fontSize: 13, cursor: (!canReset || saving) ? "default" : "pointer",
              background: "transparent", color: "#c6c6c6", border: "none",
              fontFamily: "var(--font-sans)", opacity: (!canReset || saving) ? 0.4 : 1,
            }}
          >
            {t("holdTap.resetDefault", "Restore default")}
          </button>
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button
            onClick={() => setDraft(null)}
            disabled={!dirty || saving}
            style={{
              padding: "6px 12px", fontSize: 13, cursor: (!dirty || saving) ? "default" : "pointer",
              background: "transparent", color: "#c6c6c6", border: "none",
              fontFamily: "var(--font-sans)", opacity: (!dirty || saving) ? 0.4 : 1,
            }}
          >
            {t("holdTap.cancel", "Cancel")}
          </button>
          <button
            onClick={save}
            disabled={!dirty || saving}
            style={{
              padding: "6px 16px", fontSize: 13, fontWeight: 500, cursor: (!dirty || saving) ? "default" : "pointer",
              background: "#0f62fe", color: "#fff", border: "none",
              fontFamily: "var(--font-sans)", opacity: (!dirty || saving) ? 0.4 : 1,
            }}
          >
            {saving ? t("holdTap.saving", "Saving…") : t("holdTap.save", "Save")}
          </button>
        </div>
      </div>
      {error ? <div style={{ fontSize: 13, color: "#fa4d56" }}>{error}</div> : null}
    </div>
  );
};
