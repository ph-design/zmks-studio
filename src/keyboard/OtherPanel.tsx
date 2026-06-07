import { useContext, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Wrench } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ConnectionContext } from "../rpc/ConnectionContext";
import { useHoldTapConfigs } from "../behaviors/useHoldTapConfigs";
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
  isBuiltinHoldTap,
  isHoldTapShape,
  summarizeConfig,
} from "../behaviors/holdTapUtils";

interface OtherPanelProps {
  behaviors: GetBehaviorDetailsResponse[];
}

type TopFeature = "tapHold";
type SubTab = "modtap" | "layertap" | "user";

interface TopFeatureSpec {
  id: TopFeature;
  labelKey: string;
  labelFallback: string;
  icon: LucideIcon;
}

const TOP_FEATURES: TopFeatureSpec[] = [
  { id: "tapHold", labelKey: "other.feature.tapHold", labelFallback: "Tap-Hold", icon: Wrench },
];

export const OtherPanel = ({ behaviors }: OtherPanelProps) => {
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

  const [topFeature, setTopFeature] = useState<TopFeature>("tapHold");
  const [subTab, setSubTab] = useState<SubTab>("modtap");
  const [selectedPresetId, setSelectedPresetId] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Record<number, HoldTapConfig>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Fetch all upfront so preset apply doesn't stall.
  const allHoldTapIds = useMemo(() => holdTapBehaviors.map((b) => b.id), [holdTapBehaviors]);
  const { getConfig, applyConfig } = useHoldTapConfigs(allHoldTapIds);

  const activePresetId = selectedPresetId ?? userPresets[0]?.id ?? null;

  const selected = useMemo<GetBehaviorDetailsResponse | null>(() => {
    if (subTab === "modtap") return builtinModTap;
    if (subTab === "layertap") return builtinLayerTap;
    return userPresets.find((p) => p.id === activePresetId) ?? null;
  }, [subTab, builtinModTap, builtinLayerTap, userPresets, activePresetId]);

  useEffect(() => {
    setSaveError(null);
  }, [selected?.id]);

  // Clear drafts and errors on disconnect.
  useEffect(() => {
    setDrafts({});
    setSaveError(null);
  }, [conn]);

  if (!conn) {
    return <CenteredHint>{t("keyboard.errors.notConnected", "Not connected")}</CenteredHint>;
  }

  const savedCfg = selected ? getConfig(selected.id) : null;
  const draft = selected ? drafts[selected.id] ?? savedCfg : null;
  const dirty = !!draft && !!savedCfg && !configsEqual(draft, savedCfg);

  const setDraft = (next: HoldTapConfig) => {
    if (selected) setDrafts((prev) => ({ ...prev, [selected.id]: next }));
  };
  const clearDraft = () => {
    if (!selected) return;
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[selected.id];
      return next;
    });
  };
  const save = async () => {
    if (!selected || !draft) return false;
    const ok = await applyConfig(selected.id, draft);
    if (ok) clearDraft();
    return ok;
  };
  const handleSave = async () => {
    setSaveError(null);
    setSaving(true);
    try {
      const ok = await save();
      if (!ok) {
        setSaveError(t("holdTap.saveFailed", "Save failed or timed out. Please try again."));
      }
    } finally {
      setSaving(false);
    }
  };

  // Built-ins have independent firmware defaults; "Restore default" stages it as the draft.
  const builtinDefault =
    selected && isBuiltinHoldTap(selected) ? getBuiltinDefault(selected.displayName) : null;
  const canReset = !!draft && !!builtinDefault && !configsEqual(draft, builtinDefault);
  const resetToDefault = () => {
    if (builtinDefault) setDraft(builtinDefault);
  };

  const emptyHint =
    subTab === "user"
      ? t("holdTap.empty.userPresetsHint", "Define hold-tap variants named like ht_* in your keymap.")
      : t("holdTap.empty.builtinHint", "Your firmware does not register Mod-Tap or Layer-Tap.");

  return (
    // Cap height so BottomPanel's scrollHeight measurement drives the animation.
    <div className="flex min-h-0 max-h-[55vh]">
      <nav className="flex flex-col gap-0.5 w-36 flex-shrink-0 pr-2 border-r border-base-300 overflow-y-auto">
        {TOP_FEATURES.map((f) => (
          <FeatureButton
            key={f.id}
            feature={f}
            active={topFeature === f.id}
            onClick={() => setTopFeature(f.id)}
          />
        ))}
      </nav>

      <nav className="flex flex-col w-44 flex-shrink-0 px-2 border-r border-base-300 overflow-y-auto py-1 gap-0.5">
        {topFeature === "tapHold" && (
          <>
            <SubTabButton active={subTab === "modtap"} onClick={() => setSubTab("modtap")}>
              {BUILTIN_MOD_TAP}
            </SubTabButton>
            <SubTabButton active={subTab === "layertap"} onClick={() => setSubTab("layertap")}>
              {BUILTIN_LAYER_TAP}
            </SubTabButton>
            <SubTabButton active={subTab === "user"} onClick={() => setSubTab("user")}>
              {t("holdTap.section.userPresets", "User Presets")}
            </SubTabButton>
          </>
        )}
      </nav>

      {/* Action bar stays pinned at top. */}
      <div className="flex-1 pl-4 min-w-0 overflow-y-auto py-1 flex flex-col gap-3">
        {selected && (
          <ActionBar
            isBuiltin={isBuiltinHoldTap(selected)}
            dirty={dirty}
            saving={saving}
            saveError={saveError}
            canReset={canReset}
            onResetDefault={resetToDefault}
            onSave={handleSave}
            onCancel={clearDraft}
          />
        )}

        {subTab === "user" && userPresets.length > 0 && (
          <div className="flex gap-1.5 flex-wrap" role="tablist">
            {userPresets.map((p) => (
              <PresetTab
                key={p.id}
                active={activePresetId === p.id}
                onClick={() => setSelectedPresetId(p.id)}
              >
                {p.displayName}
              </PresetTab>
            ))}
          </div>
        )}

        {selected ? (
          // Keyed so mode switch replays fade-in animation.
          <div key={selected.id} className="animate-fade-in">
            <BehaviorBody
              behavior={selected}
              isBuiltin={isBuiltinHoldTap(selected)}
              draft={draft}
              presets={userPresets}
              getConfig={getConfig}
              onChange={setDraft}
            />
          </div>
        ) : (
          <CenteredHint>{emptyHint}</CenteredHint>
        )}
      </div>
    </div>
  );
};


const CenteredHint = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-center justify-center h-full px-6 text-center text-sm text-base-content/40">
    {children}
  </div>
);

const SubTabButton = ({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    onClick={onClick}
    aria-pressed={active}
    className={`px-3 py-1.5 rounded text-sm text-left cursor-pointer transition-colors ${
      active ? "bg-primary text-primary-content" : "text-base-content hover:bg-base-300"
    }`}
  >
    {children}
  </button>
);

const PresetTab = ({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    onClick={onClick}
    role="tab"
    aria-selected={active}
    className={`px-4 py-1.5 rounded text-sm font-medium cursor-pointer transition-colors ${
      active ? "bg-primary text-primary-content" : "bg-base-100 text-base-content hover:bg-base-300"
    }`}
  >
    {children}
  </button>
);

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <span className="text-sm font-medium text-base-content/60">{children}</span>
);


const FeatureButton = ({
  feature,
  active,
  onClick,
}: {
  feature: TopFeatureSpec;
  active: boolean;
  onClick: () => void;
}) => {
  const { t } = useTranslation();
  const Icon = feature.icon;
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-2 px-3 py-2 rounded text-sm text-left cursor-pointer transition-colors ${
        active ? "bg-primary text-primary-content" : "text-base-content hover:bg-base-300"
      }`}
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      <span>{t(feature.labelKey, feature.labelFallback)}</span>
    </button>
  );
};


const ActionBar = ({
  isBuiltin,
  dirty,
  saving,
  saveError,
  canReset,
  onResetDefault,
  onSave,
  onCancel,
}: {
  isBuiltin: boolean;
  dirty: boolean;
  saving: boolean;
  saveError: string | null;
  canReset: boolean;
  onResetDefault: () => void;
  onSave: () => void;
  onCancel: () => void;
}) => {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2 min-h-[1.75rem]">
        <span className="text-sm text-base-content/60 truncate">
          {isBuiltin ? t("holdTap.scope.builtin", "Firmware-wide default") : ""}
        </span>
        <div className="flex gap-2 flex-shrink-0">
          {isBuiltin && (
            <button
              onClick={onResetDefault}
              disabled={!canReset || saving}
              className="px-3 py-1.5 rounded text-sm text-base-content hover:bg-base-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              {t("holdTap.resetDefault", "Restore default")}
            </button>
          )}
          <button
            onClick={onCancel}
            disabled={!dirty || saving}
            className="px-3 py-1.5 rounded text-sm text-base-content hover:bg-base-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            {t("holdTap.cancel", "Cancel")}
          </button>
          <button
            onClick={onSave}
            disabled={!dirty || saving}
            className="px-3 py-1.5 rounded text-sm font-medium bg-primary text-primary-content hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? t("holdTap.saving", "Saving…") : t("holdTap.save", "Save")}
          </button>
        </div>
      </div>
      {saveError ? <div className="text-sm text-red-500">{saveError}</div> : null}
    </div>
  );
};


const BehaviorBody = ({
  behavior,
  isBuiltin,
  draft,
  presets,
  getConfig,
  onChange,
}: {
  behavior: GetBehaviorDetailsResponse;
  isBuiltin: boolean;
  draft: HoldTapConfig | null;
  presets: GetBehaviorDetailsResponse[];
  getConfig: (id: number) => HoldTapConfig | null;
  onChange: (next: HoldTapConfig) => void;
}) => {
  const { t } = useTranslation();

  if (!draft) {
    return <CenteredHint>{t("holdTap.loading", "Loading…")}</CenteredHint>;
  }

  return isBuiltin ? (
    <BuiltinEditor
      builtin={behavior}
      draft={draft}
      presets={presets}
      getConfig={getConfig}
      onChange={onChange}
    />
  ) : (
    <HoldTapConfigFields cfg={draft} onChange={(patch) => onChange({ ...draft, ...patch })} />
  );
};


const BuiltinEditor = ({
  builtin,
  draft,
  presets,
  getConfig,
  onChange,
}: {
  builtin: GetBehaviorDetailsResponse;
  draft: HoldTapConfig;
  presets: GetBehaviorDetailsResponse[];
  getConfig: (id: number) => HoldTapConfig | null;
  onChange: (next: HoldTapConfig) => void;
}) => (
  <div className="flex flex-col gap-4">
    <HoldTapConfigFields cfg={draft} onChange={(patch) => onChange({ ...draft, ...patch })} />
    <PresetOverlaySection
      builtin={builtin}
      draft={draft}
      presets={presets}
      getConfig={getConfig}
      onApply={onChange}
    />
  </div>
);

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

  return (
    <section className="flex flex-col gap-2">
      <SectionLabel>{t("holdTap.applyTitle", "Apply a preset")}</SectionLabel>
      <p className="text-sm text-base-content/60">
        {t("holdTap.applyHint", "Copy a preset's settings onto {{name}}.", {
          name: builtin.displayName,
        })}
      </p>

      {presets.length === 0 ? (
        <p className="text-sm text-base-content/40">
          {t("holdTap.empty.userPresets", "No user presets defined")}
        </p>
      ) : (
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
                className={`px-4 py-1.5 rounded text-sm font-medium cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                  active
                    ? "bg-primary text-primary-content"
                    : "bg-base-100 text-base-content hover:bg-base-300"
                }`}
              >
                {p.displayName}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
};
