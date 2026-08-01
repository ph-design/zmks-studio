import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link2 } from "lucide-react";
import type { ComboConfig } from "@zmkfirmware/zmk-studio-ts-client/combos";
import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import type { Layer, PhysicalLayout as PhysicalLayoutMsg } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import type { CarbonTheme } from "../carbon/theme";
import { PhysicalLayout } from "../keyboard/PhysicalLayout";
import { BehaviorBindingPicker } from "../behaviors/BehaviorBindingPicker";
import { NotSupportedHint, Badge } from "../carbon/CarbonChrome";
import { summarizeCombo, summarizeBinding } from "./comboUtils";
import { combosEqual } from "./useCombos";

interface ComboPanelProps {
  combos: ComboConfig[];
  /**
   * Slots the shell filtered out because firmware reserves them (the unlock
   * combo). Only used to tell "this firmware has no combos" apart from "every
   * slot here is reserved", which are very different messages.
   */
  reservedCount?: number;
  loaded: boolean;
  behaviors: Record<number, GetBehaviorDetailsResponse>;
  behaviorList: GetBehaviorDetailsResponse[];
  layers: Layer[];
  layout?: PhysicalLayoutMsg;
  th: CarbonTheme;
  applyConfig: (cfg: ComboConfig) => Promise<boolean>;
}

// Left rail of combo slots; settings-style editor on the right. Editing a
// behavior swaps the pane for a full-width binding picker.
export const ComboPanel = ({ combos, reservedCount = 0, loaded, behaviors, behaviorList, layers, layout, th, applyConfig }: ComboPanelProps) => {
  const { t } = useTranslation();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<ComboConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingBehavior, setEditingBehavior] = useState(false);

  const active = combos.find((c) => c.index === selectedIndex) ?? combos[0] ?? null;

  useEffect(() => {
    setDraft(null);
    setError(null);
    setEditingBehavior(false);
  }, [active?.index]);

  if (!loaded) {
    return <CenteredHint th={th}>{t("combos.loading", "Loading…")}</CenteredHint>;
  }
  if (combos.length === 0) {
    return reservedCount > 0 ? (
      <NotSupportedHint th={th}
        icon={<Link2 size={40} />}
        title={t("combos.allReservedTitle", "No editable combos")}
        desc={t("combos.allReservedHint", "Every combo slot on this keyboard is reserved by firmware. The unlock shortcut is managed from the Device page.")}
      />
    ) : (
      <NotSupportedHint th={th}
        icon={<Link2 size={40} />}
        title={t("combos.emptyTitle", "组合键不可用")}
        desc={t("combos.emptyHint", "基于 ph-design/zmks 分支，添加 /combos 节点，compatible = \"zmk,combos\"")}
      />
    );
  }

  const cfg = active ? draft ?? active : null;
  const dirty = !!active && !!draft && !combosEqual(draft, active);
  const update = (patch: Partial<ComboConfig>) => cfg && setDraft({ ...cfg, ...patch });

  const save = async () => {
    if (!draft) return;
    setError(null);
    setSaving(true);
    try {
      const ok = await applyConfig(draft);
      if (ok) setDraft(null);
      else setError(t("combos.saveFailed", "Save failed or timed out. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  // Behavior editing: swap the whole right pane for a full-width binding picker.
  if (editingBehavior && cfg && active) {
    return (
      <div className="flex min-h-0 h-full w-full flex-col">
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 20px", height: 48, background: th.infoBg, borderBottom: `1px solid ${th.border}`, flexShrink: 0 }}>
          <Link2 size={15} style={{ color: th.info, flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: th.textPrimary, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {t("combos.editingBanner", "Editing combo behavior — pick a binding, then confirm.")}
          </span>
          <button
            onClick={() => setEditingBehavior(false)}
            style={{ padding: "6px 12px", fontSize: 13, background: "none", border: `1px solid ${th.borderStrong}`, color: th.textSecondary, cursor: "pointer", fontFamily: "var(--font-sans)", borderRadius: 2 }}
          >
            {t("combos.cancel", "Cancel")}
          </button>
          <button
            onClick={() => setEditingBehavior(false)}
            disabled={(cfg.behavior?.behaviorId ?? -1) < 0}
            style={{ padding: "6px 16px", fontSize: 13, fontWeight: 500, background: th.interactive, border: "none", color: "#fff", cursor: (cfg.behavior?.behaviorId ?? -1) < 0 ? "not-allowed" : "pointer", opacity: (cfg.behavior?.behaviorId ?? -1) < 0 ? 0.5 : 1, fontFamily: "var(--font-sans)", borderRadius: 2 }}
          >
            {t("combos.confirm", "Confirm")}
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 py-3">
          <BehaviorBindingPicker
            binding={cfg.behavior ?? { behaviorId: -1, param1: 0, param2: 0 }}
            behaviors={behaviorList}
            layers={layers}
            onBindingChanged={(b) => update({ behavior: b })}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 h-full w-full">
      {/* Left rail — combo slots */}
      <aside style={{ width: 240, flexShrink: 0, display: "flex", flexDirection: "column", background: th.railBg, borderRight: `1px solid ${th.border}` }}>
        <div style={{ padding: "12px 16px", background: th.layer1, borderBottom: `1px solid ${th.border}`, display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <Link2 size={16} style={{ color: th.interactive }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: th.textPrimary }}>{t("carbon.nav.combos", "Combos")}</span>
          <span style={{ marginLeft: "auto", fontSize: 12, color: th.textHelper }}>{combos.length}</span>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }} className="custom-scrollbar">
          {combos.map((c) => {
            const isActive = active?.index === c.index;
            const unused = c.keyPositions.length === 0;
            return (
              <button
                key={c.index}
                aria-pressed={isActive}
                onClick={() => setSelectedIndex(c.index)}
                style={{
                  display: "flex", alignItems: "center", gap: 10, width: "100%", minHeight: 44,
                  padding: "0 14px", cursor: "pointer", textAlign: "left", border: "none",
                  background: isActive ? th.selectedLayer : "transparent",
                  borderLeft: `3px solid ${isActive ? th.interactive : "transparent"}`,
                  fontFamily: "var(--font-sans)",
                }}
              >
                <Badge active={isActive} th={th}>
                  {c.index}
                </Badge>
                <span style={{
                  fontSize: 13, fontWeight: isActive ? 500 : 400, flex: 1, minWidth: 0,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  color: unused ? th.textHelper : th.textPrimary, fontStyle: unused ? "italic" : "normal",
                }}>
                  {summarizeCombo(c, behaviors, t)}
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Right content — editor */}
      <div className="flex-1 min-w-0 overflow-y-auto custom-scrollbar">
        <div className="max-w-2xl px-6 py-4 flex flex-col">
          {cfg && active && (
            <ComboEditor
              key={active.index}
              cfg={cfg}
              behaviors={behaviors}
              layers={layers}
              layout={layout}
              dirty={dirty}
              saving={saving}
              error={error}
              onUpdate={update}
              onSave={save}
              onCancel={() => setDraft(null)}
              onEditBehavior={() => setEditingBehavior(true)}
            />
          )}
        </div>
      </div>
    </div>
  );
};

const CenteredHint = ({ children, th }: { children: React.ReactNode; th: CarbonTheme }) => (
  <NotSupportedHint th={th}
    icon={<Link2 size={40} />}
    title=""
    desc={typeof children === "string" ? children : ""}
  />
);

const Section = ({ title, desc, last, children }: { title: string; desc?: string; last?: boolean; children: React.ReactNode }) => (
  <div className={`py-5 ${last ? "" : "border-b border-base-300"}`}>
    <div className="mb-3">
      <h3 className="text-[15px] font-semibold text-base-content">{title}</h3>
      {desc ? <p className="text-sm text-base-content/55 mt-0.5">{desc}</p> : null}
    </div>
    {children}
  </div>
);

const ComboEditor = ({
  cfg,
  behaviors,
  layers,
  layout,
  dirty,
  saving,
  error,
  onUpdate,
  onSave,
  onCancel,
  onEditBehavior,
}: {
  cfg: ComboConfig;
  behaviors: Record<number, GetBehaviorDetailsResponse>;
  layers: Layer[];
  layout?: PhysicalLayoutMsg;
  dirty: boolean;
  saving: boolean;
  error: string | null;
  onUpdate: (patch: Partial<ComboConfig>) => void;
  onSave: () => void;
  onCancel: () => void;
  onEditBehavior: () => void;
}) => {
  const { t } = useTranslation();

  const editablePositions = cfg.editableKeyPositions && !!layout;
  const editableBehavior = cfg.editableBehavior;
  // Valid to save when positions are chosen and (if any) a behavior is bound.
  const savable =
    cfg.keyPositions.length === 0 ||
    (cfg.behavior !== undefined && cfg.behavior.behaviorId >= 0);

  const togglePosition = (position: number) => {
    const cur = cfg.keyPositions;
    const next = cur.includes(position)
      ? cur.filter((p) => p !== position)
      : [...cur, position].sort((a, b) => a - b);
    onUpdate({ keyPositions: next });
  };

  return (
    <div className="flex flex-col min-w-0">
      <Section
        title={t("combos.section.trigger", "Trigger")}
        desc={editablePositions ? t("combos.triggerHint", "Click keys on the layout to add or remove them from this combo.") : undefined}
      >
        <div className="flex flex-col gap-3">
          {editablePositions && layout ? (
            <div className="relative w-full" style={{ maxWidth: 560 }}>
              <PhysicalLayout
                positions={layout.keys.map((k, i) => ({
                  id: `key-${i}`,
                  header: `${i}`,
                  x: k.x / 100.0,
                  y: k.y / 100.0,
                  width: k.width / 100,
                  height: k.height / 100.0,
                  r: (k.r || 0) / 100.0,
                  rx: (k.rx || 0) / 100.0,
                  ry: (k.ry || 0) / 100.0,
                }))}
                oneU={34}
                selectedPositions={new Set(cfg.keyPositions)}
                onPositionClicked={(pos) => togglePosition(pos)}
              />
            </div>
          ) : (
            <ReadOnlyField label={t("combos.positions", "Key positions")}>
              {cfg.keyPositions.length > 0 ? cfg.keyPositions.map((p) => `#${p}`).join(" + ") : "—"}
            </ReadOnlyField>
          )}

          <div className="flex items-center gap-3">
            <span className="text-sm text-base-content/60 min-w-[7rem] shrink-0 whitespace-nowrap">
              {t("combos.positions", "Key positions")}
            </span>
            <span className="text-sm text-base-content font-medium flex-1 min-w-0 truncate">
              {cfg.keyPositions.length > 0 ? cfg.keyPositions.map((p) => `#${p}`).join(" + ") : t("combos.none", "None")}
            </span>
            {editablePositions && cfg.keyPositions.length > 0 && (
              <button
                onClick={() => onUpdate({ keyPositions: [] })}
                className="px-2.5 py-1.5 text-sm text-base-content/70 hover:bg-base-300 rounded cursor-pointer shrink-0"
              >
                {t("combos.clearSlot", "Clear slot")}
              </button>
            )}
          </div>

          {editableBehavior ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-base-content/60 min-w-[7rem] shrink-0 whitespace-nowrap">
                {t("combos.behavior", "Behavior")}
              </span>
              <span className="text-sm text-base-content font-medium flex-1 min-w-0 truncate">
                {summarizeBinding(cfg.behavior, behaviors)}
              </span>
              {(cfg.behavior?.behaviorId ?? -1) >= 0 && (
                <button
                  onClick={() => onUpdate({ behavior: { behaviorId: -1, param1: 0, param2: 0 } })}
                  className="px-2.5 py-1.5 text-sm text-base-content/70 hover:bg-base-300 rounded cursor-pointer shrink-0"
                >
                  {t("combos.clearBehavior", "Clear")}
                </button>
              )}
              <button
                onClick={onEditBehavior}
                className="px-3 py-1.5 text-sm bg-primary text-primary-content hover:opacity-90 transition-opacity cursor-pointer rounded shrink-0"
              >
                {t("combos.editBehavior", "Edit")}
              </button>
            </div>
          ) : (
            <ReadOnlyField label={t("combos.behavior", "Behavior")}>
              {summarizeBinding(cfg.behavior, behaviors)}
            </ReadOnlyField>
          )}

          {!editablePositions && !editableBehavior && (
            <p className="text-sm text-base-content/50 leading-snug">
              {t("combos.readOnlyHint", "This firmware can't edit key positions or the behavior at runtime — change them in your keymap / devicetree.")}
            </p>
          )}
        </div>
      </Section>

      <Section title={t("combos.section.timing", "Timing & Behavior")}>
        <div className="flex flex-col gap-4">
          <MsField
            label={t("combos.timeout", "Timeout")}
            desc={t("combos.timeoutDesc", "How long all keys must be pressed within, in milliseconds.")}
            value={cfg.timeoutMs}
            min={0}
            max={500}
            onChange={(v) => onUpdate({ timeoutMs: v })}
          />
          <PriorIdleField
            value={cfg.requirePriorIdleMs}
            onChange={(v) => onUpdate({ requirePriorIdleMs: v })}
          />
          <ToggleRow
            label={t("combos.slowRelease", "Slow release")}
            desc={t("combos.slowReleaseDesc", "Release the combo when the last key is released, instead of the first.")}
            checked={cfg.slowRelease}
            onChange={(v) => onUpdate({ slowRelease: v })}
          />
        </div>
      </Section>

      <Section title={t("combos.section.layers", "Layers")} last>
        <LayersField layers={layers} mask={cfg.layerMask} onChange={(m) => onUpdate({ layerMask: m })} />
      </Section>

      <div className="flex items-center gap-2 pt-3">
        <div className="ml-auto flex gap-2">
          <button
            onClick={onCancel}
            disabled={!dirty || saving}
            className="px-3 py-1.5 text-sm text-base-content hover:bg-base-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            {t("combos.cancel", "Cancel")}
          </button>
          <button
            onClick={onSave}
            disabled={!dirty || !savable || saving}
            className="px-4 py-1.5 text-sm font-medium bg-primary text-primary-content hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? t("combos.saving", "Saving…") : t("combos.save", "Save")}
          </button>
        </div>
      </div>
      {error ? <div className="text-sm text-error pt-2">{error}</div> : null}
    </div>
  );
};

const ReadOnlyField = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-center gap-3">
    <span className="text-sm text-base-content/60 min-w-[7rem] shrink-0 whitespace-nowrap">{label}</span>
    <span className="text-sm text-base-content font-medium">{children}</span>
  </div>
);

const MsField = ({
  label,
  desc,
  value,
  onChange,
  min = 0,
  max = 500,
  step = 1,
}: {
  label: string;
  desc?: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) => {
  const clamped = value < min ? min : value > max ? max : value;
  const [text, setText] = useState(String(clamped));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(String(clamped));
  }, [clamped, focused]);

  const commit = () => {
    const v = Number(text);
    const next = text.trim() === "" || Number.isNaN(v) ? min : Math.min(max, Math.max(min, v));
    onChange(next);
    setText(String(next));
    setFocused(false);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-3">
        <span className="text-sm text-base-content/60 min-w-[7rem] shrink-0 whitespace-nowrap">{label}</span>
        <input
          type="range"
          aria-label={label}
          min={min}
          max={max}
          step={step}
          value={clamped}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 accent-primary"
        />
        <input
          type="number"
          aria-label={label}
          value={text}
          min={min}
          max={max}
          onFocus={() => setFocused(true)}
          onChange={(e) => {
            const raw = e.target.value;
            setText(raw);
            const v = Number(raw);
            if (raw !== "" && Number.isFinite(v) && v >= min && v <= max) onChange(v);
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          className="h-7 w-16 shrink-0 rounded bg-base-100 border border-base-300 text-sm px-2 text-right tabular-nums focus:outline-none focus:border-primary"
        />
      </div>
      {desc ? <p className="text-sm text-base-content/55 leading-snug">{desc}</p> : null}
    </div>
  );
};

// require-prior-idle is signed: -1 disables it, so it needs a toggle + ms field
// rather than a plain ms field (clamping to 0 would lose the -1 sentinel).
const PriorIdleField = ({ value, onChange }: { value: number; onChange: (v: number) => void }) => {
  const { t } = useTranslation();
  const enabled = value >= 0;
  return (
    <div className="flex flex-col gap-2">
      <ToggleRow
        label={t("combos.priorIdle", "Require prior idle")}
        desc={t("combos.priorIdleDesc", "Only trigger if no other key was tapped shortly before the combo's first key.")}
        checked={enabled}
        onChange={(v) => onChange(v ? 50 : -1)}
      />
      {enabled && (
        <MsField
          label={t("combos.priorIdleMs", "Prior idle")}
          value={value}
          min={0}
          max={500}
          onChange={onChange}
        />
      )}
    </div>
  );
};

const ToggleRow = ({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) => {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <div className="flex flex-col min-w-0">
        <span className="text-sm text-base-content leading-tight">{label}</span>
        {desc ? <span className="text-sm text-base-content/55 leading-snug">{desc}</span> : null}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0" role="radiogroup" aria-label={label}>
        <button
          type="button"
          role="radio"
          aria-checked={checked}
          onClick={() => onChange(true)}
          className={`px-3 py-1 rounded text-sm cursor-pointer transition-colors ${
            checked ? "bg-primary text-primary-content" : "text-base-content hover:bg-base-300"
          }`}
        >
          {t("combos.on", "On")}
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={!checked}
          onClick={() => onChange(false)}
          className={`px-3 py-1 rounded text-sm cursor-pointer transition-colors ${
            !checked ? "bg-primary text-primary-content" : "text-base-content hover:bg-base-300"
          }`}
        >
          {t("combos.off", "Off")}
        </button>
      </div>
    </div>
  );
};

// layer_mask bit i = layer at array index i (firmware BIT(highest_active_layer)).
// mask 0 = active on all layers.
const LayersField = ({
  layers,
  mask,
  onChange,
}: {
  layers: Layer[];
  mask: number;
  onChange: (m: number) => void;
}) => {
  const { t } = useTranslation();
  const allLayers = mask === 0;

  const toggle = (index: number) => {
    const bit = 1 << index;
    onChange(mask & bit ? mask & ~bit : mask | bit);
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-base-content/55 leading-snug">
        {t("combos.layersDesc", "Layers this combo is active on. With none selected, it works on every layer.")}
      </p>
      <div className="flex gap-1.5 flex-wrap">
        <button
          type="button"
          aria-pressed={allLayers}
          onClick={() => onChange(0)}
          className={`px-3 py-1.5 text-sm cursor-pointer transition-colors border ${
            allLayers
              ? "bg-primary text-primary-content border-primary"
              : "bg-base-100 text-base-content border-base-300 hover:border-base-content/40"
          }`}
        >
          {t("combos.allLayers", "All layers")}
        </button>
        {layers.map((layer, index) => {
          const active = !allLayers && !!(mask & (1 << index));
          return (
            <button
              key={layer.id}
              type="button"
              aria-pressed={active}
              onClick={() => toggle(index)}
              className={`px-3 py-1.5 text-sm cursor-pointer transition-colors border ${
                active
                  ? "bg-primary text-primary-content border-primary"
                  : "bg-base-100 text-base-content border-base-300 hover:border-base-content/40"
              }`}
            >
              {layer.name || `${t("carbon.layer", "Layer")} ${index}`}
            </button>
          );
        })}
      </div>
    </div>
  );
};
