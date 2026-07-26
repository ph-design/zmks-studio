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
  isBuiltinHoldTap,
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

  const allBehaviors = useMemo(() => {
    const list: GetBehaviorDetailsResponse[] = [];
    if (builtinModTap) list.push(builtinModTap);
    if (builtinLayerTap) list.push(builtinLayerTap);
    list.push(...userPresets);
    return list;
  }, [builtinModTap, builtinLayerTap, userPresets]);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const active = selectedId !== null
    ? allBehaviors.find((b) => b.id === selectedId) ?? allBehaviors[0] ?? null
    : allBehaviors[0] ?? null;

  useEffect(() => {
    if (active && !allBehaviors.find((b) => b.id === active.id)) {
      setSelectedId(null);
    }
  }, [allBehaviors, active]);

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
    <div className="flex min-h-0 h-full w-full">
      <aside style={{
        width: 240, flexShrink: 0, display: "flex", flexDirection: "column",
        background: th.railBg, borderRight: `1px solid ${th.border}`,
      }}>
        <div style={{
          padding: "12px 16px", background: th.layer1, borderBottom: `1px solid ${th.border}`,
          display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
        }}>
          <Zap size={16} style={{ color: th.interactive }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: th.textPrimary }}>
            {t("other.feature.tapHold", "Tap-Hold")}
          </span>
          <span style={{ marginLeft: "auto", fontSize: 12, color: th.textHelper }}>
            {allBehaviors.length}
          </span>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }} className="custom-scrollbar">
          {allBehaviors.map((b) => {
            const isActive = active?.id === b.id;
            const isBuiltin = isBuiltinHoldTap(b);
            const cfgSummary = getConfig(b.id);
            const sub = cfgSummary ? summarizeConfig(cfgSummary, t) : undefined;
            return (
              <button
                key={b.id}
                aria-pressed={isActive}
                onClick={() => setSelectedId(b.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 10, width: "100%",
                  minHeight: 44, padding: "0 14px", cursor: "pointer",
                  textAlign: "left", border: "none",
                  background: isActive ? th.selectedLayer : "transparent",
                  borderLeft: `3px solid ${isActive ? th.interactive : "transparent"}`,
                  fontFamily: "var(--font-sans)",
                }}
              >
                <span style={{
                  fontSize: 10, fontFamily: "var(--font-sans)", flexShrink: 0,
                  fontWeight: 500, letterSpacing: "0.02em",
                  padding: "1px 6px", borderRadius: 3,
                  background: isActive ? th.interactive : th.fieldBg,
                  color: isActive ? "#fff" : th.textHelper,
                  border: `1px solid ${isActive ? th.interactive : th.borderStrong}`,
                }}>
                  {isBuiltin ? t("holdTap.scope.builtinShort", "内置") : t("holdTap.scope.user", "自定义")}
                </span>
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
                  <span style={{
                    fontSize: 13, fontWeight: isActive ? 500 : 400,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    color: th.textPrimary,
                  }}>
                    {b.displayName}
                  </span>
                  {sub && (
                    <span style={{
                      fontSize: 11, color: th.textHelper,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}>
                      {sub}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* ── Right content — editor ── */}
      <div className="flex-1 min-w-0 overflow-y-auto custom-scrollbar">
        <div className="max-w-2xl px-6 py-4 flex flex-col">
          {active && (
            <TapHoldEditor
              key={active.id}
              behavior={active}
              isBuiltin={isBuiltinHoldTap(active)}
              presets={userPresets}
              getConfig={getConfig}
              applyConfig={applyConfig}
            />
          )}
        </div>
      </div>
    </div>
  );
};


// ── Section ──
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
    <div className="flex flex-col gap-1">
      <Section title={behavior.displayName} desc={isBuiltin ? t("holdTap.scope.builtin", "Firmware-wide default") : t("holdTap.scope.userPreset", "User-defined preset")}>
        <HoldTapConfigFields cfg={cfg} onChange={update} />
      </Section>

      {isBuiltin && presets.length > 0 && (
        <Section title={t("holdTap.applyTitle", "Apply a preset")}
          desc={t("holdTap.applyHint", "Copy a preset's settings onto {{name}}.", { name: behavior.displayName })}
        >
          <div className="flex flex-wrap gap-1.5">
            {presets.map((p) => {
              const pc = getConfig(p.id);
              const active = matchedPresetId === p.id;
              return (
                <button
                  key={p.id}
                  disabled={!pc}
                  title={pc ? summarizeConfig(pc, t) : undefined}
                  onClick={() => pc && setDraft(pc)}
                  className={`px-3 py-1.5 rounded text-sm transition-colors cursor-pointer ${
                    active
                      ? "bg-primary text-primary-content"
                      : "text-base-content/70 hover:bg-base-300"
                  } disabled:opacity-40 disabled:cursor-default`}
                >
                  {p.displayName}
                </button>
              );
            })}
          </div>
        </Section>
      )}

      <div className="flex items-center gap-2 pt-3">
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
      {error ? <div className="text-sm text-error pt-2">{error}</div> : null}
    </div>
  );
};
