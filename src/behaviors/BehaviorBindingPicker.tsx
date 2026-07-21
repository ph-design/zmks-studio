import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  GetBehaviorDetailsResponse,
  BehaviorBindingParametersSet,
  BehaviorParameterValueDescription,
} from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import { validateValue } from "./parameters";
import {
  BEHAVIOR_CATEGORIES,
  categorizeBehaviors,
  type BehaviorCategory,
} from "./BehaviorCategories";
import { HidUsageGrid } from "./HidUsageGrid";
import {
  hid_usage_page_and_id_from_usage,
  hid_usage_get_label,
} from "../hid-usages";
import {
  BUILTIN_LAYER_TAP,
  BUILTIN_MOD_TAP,
  builtinNameForShape,
  findBuiltinHoldTap,
  holdTapPresets,
  isHoldTapShape,
  isLayerTapShape,
  isUserPreset,
} from "./holdTapUtils";

interface HoldTapMode {
  id: number;
  label: string;
}

const DISPLAY_NAME_OVERRIDES: Record<string, string> = {
  z_so_off: "Soft Off",
};

export interface BehaviorBindingPickerProps {
  binding: BehaviorBinding;
  behaviors: GetBehaviorDetailsResponse[];
  layers: { id: number; name: string }[];
  onBindingChanged: (binding: BehaviorBinding) => void;
}

function validateBinding(
  metadata: BehaviorBindingParametersSet[],
  layerIds: number[],
  param1?: number,
  param2?: number
): boolean {
  if (
    (param1 === undefined || param1 === 0) &&
    metadata.every((s) => !s.param1 || s.param1.length === 0)
  ) {
    return true;
  }

  const matchingSet = metadata.find((s) =>
    validateValue(layerIds, param1, s.param1)
  );

  if (!matchingSet) {
    return false;
  }

  return validateValue(layerIds, param2, matchingSet.param2);
}

function hasHidUsage(values: BehaviorParameterValueDescription[]): boolean {
  return values.some((v) => v.hidUsage);
}

function hasLayerId(values: BehaviorParameterValueDescription[]): boolean {
  return values.some((v) => v.layerId);
}

function hasConstants(values: BehaviorParameterValueDescription[]): boolean {
  return values.every((v) => v.constant !== undefined);
}

const InlineParamPicker = ({
  values,
  value,
  layers,
  onValueChanged,
  label,
}: {
  values: BehaviorParameterValueDescription[];
  value?: number;
  layers: { id: number; name: string }[];
  onValueChanged: (value?: number) => void;
  label?: string;
}) => {
  if (values.length === 0) return null;

  if (hasConstants(values)) {
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <div className="text-sm text-base-content/60 mb-1">{label}</div>
        )}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(3.4rem,1fr))] gap-1.5">
          {values.map((v) => {
            const name = v.name || "";
            const colSpan = name.length > 7 ? 3 : name.length > 3 ? 2 : 1;
            const spanClass = colSpan === 3 ? "col-span-3" : colSpan === 2 ? "col-span-2" : "";
            return (
              <button
                key={v.constant}
                onClick={() => onValueChanged(v.constant)}
                className={`${spanClass} h-[3.4rem] rounded text-sm font-medium cursor-pointer transition-colors flex items-center justify-center ${value === v.constant
                  ? "bg-primary text-primary-content"
                  : "bg-base-100 text-base-content hover:bg-base-300"
                  }`}
              >
                <span className="truncate px-1">{name}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (values.length === 1 && values[0].layerId) {
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <div className="text-sm text-base-content/60 mb-1">{label}</div>
        )}
        <div className="flex gap-1.5 flex-wrap">
          {layers.map(({ name, id }) => (
            <button
              key={id}
              onClick={() => onValueChanged(id)}
              className={`px-4 py-1.5 rounded text-sm font-medium cursor-pointer transition-colors ${value === id
                ? "bg-primary text-primary-content"
                : "bg-base-100 text-base-content hover:bg-base-300"
                }`}
            >
              {name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (values.length === 1 && values[0].range) {
    const { min, max } = values[0].range;
    const buttons = [];
    for (let i = min; i <= max; i++) {
      buttons.push(i);
    }
    return (
      <div className="flex flex-col gap-1">
        <div className="text-sm text-base-content/60 mb-1">{values[0].name}</div>
        <div className="flex gap-1.5 flex-wrap">
          {buttons.map((n) => (
            <button
              key={n}
              onClick={() => onValueChanged(n)}
              className={`w-10 h-10 rounded text-sm font-medium cursor-pointer transition-colors flex items-center justify-center ${value === n
                ? "bg-primary text-primary-content"
                : "bg-base-100 text-base-content hover:bg-base-300"
                }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return null;
};

export const BehaviorBindingPicker = ({
  binding,
  layers,
  behaviors,
  onBindingChanged,
}: BehaviorBindingPickerProps) => {
  const { t } = useTranslation();
  const [behaviorId, setBehaviorId] = useState(binding.behaviorId);
  const [param1, setParam1] = useState<number | undefined>(binding.param1);
  const [param2, setParam2] = useState<number | undefined>(binding.param2);

  const [contextBuiltinId, setContextBuiltinId] = useState<number | undefined>(
    undefined
  );

  const selectedBehavior = useMemo(
    () => behaviors.find((b) => b.id == behaviorId),
    [behaviorId, behaviors]
  );

  const hasModBuiltin = useMemo(
    () => behaviors.some((b) => b.displayName === BUILTIN_MOD_TAP),
    [behaviors]
  );
  const hasLayerBuiltin = useMemo(
    () => behaviors.some((b) => b.displayName === BUILTIN_LAYER_TAP),
    [behaviors]
  );
  const isModePreset = useCallback(
    (b: GetBehaviorDetailsResponse) =>
      isUserPreset(b) && isHoldTapShape(b) && (hasModBuiltin || hasLayerBuiltin),
    [hasModBuiltin, hasLayerBuiltin]
  );

  const categorized = useMemo(
    () => categorizeBehaviors(behaviors.filter((b) => !isModePreset(b))),
    [behaviors, isModePreset]
  );

  const anchorId = useMemo(() => {
    if (selectedBehavior && isModePreset(selectedBehavior)) {
      if (contextBuiltinId !== undefined) return contextBuiltinId;
      const builtin = findBuiltinHoldTap(behaviors, builtinNameForShape(selectedBehavior));
      if (builtin) return builtin.id;
    }
    return behaviorId;
  }, [selectedBehavior, behaviors, behaviorId, isModePreset, contextBuiltinId]);

  const currentCategory = useMemo(() => {
    for (const cat of BEHAVIOR_CATEGORIES) {
      if (categorized[cat.id]?.some((b) => b.id === anchorId)) {
        return cat.id;
      }
    }
    return "other";
  }, [categorized, anchorId]);

  const [selectedCategoryId, setSelectedCategoryId] = useState(currentCategory);
  const [browsing, setBrowsing] = useState(false);

  useEffect(() => {
    if (!browsing) {
      setSelectedCategoryId(currentCategory);
    }
  }, [currentCategory, browsing]);

  const metadata = useMemo(
    () => behaviors.find((b) => b.id == behaviorId)?.metadata,
    [behaviorId, behaviors]
  );

  // All modes (Default + ht_* presets) independent of param shape.
  const holdTapModes = useMemo<HoldTapMode[]>(() => {
    if (!selectedBehavior || !isHoldTapShape(selectedBehavior)) return [];
    const contextName = behaviors.find((b) => b.id === contextBuiltinId)?.displayName;
    const builtinName = contextName ?? builtinNameForShape(selectedBehavior);
    const builtin = findBuiltinHoldTap(behaviors, builtinName);
    const list: HoldTapMode[] = [];
    if (builtin) list.push({ id: builtin.id, label: t("binding.modeDefault", "Default") });
    for (const p of holdTapPresets(behaviors)) list.push({ id: p.id, label: p.displayName });
    return list;
  }, [selectedBehavior, behaviors, contextBuiltinId, t]);

  useEffect(() => {
    if (
      binding.behaviorId === behaviorId &&
      binding.param1 === param1 &&
      binding.param2 === param2
    ) {
      return;
    }

    if (!metadata) {
      console.error(
        "Can't find metadata for the selected behaviorId",
        behaviorId
      );
      return;
    }

    if (
      validateBinding(
        metadata,
        layers.map(({ id }) => id),
        param1,
        param2
      )
    ) {
      onBindingChanged({
        behaviorId,
        param1: param1 || 0,
        param2: param2 || 0,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [behaviorId, param1, param2]);

  useEffect(() => {
    setBehaviorId(binding.behaviorId);
    setParam1(binding.param1);
    setParam2(binding.param2);

    const b = behaviors.find((x) => x.id === binding.behaviorId);
    if (!b || !isHoldTapShape(b)) {
      setContextBuiltinId(undefined);
    } else if (!isUserPreset(b)) {
      setContextBuiltinId(b.id);
    } else {
      setContextBuiltinId(findBuiltinHoldTap(behaviors, builtinNameForShape(b))?.id);
    }
  }, [binding, behaviors]);

  const handleBehaviorSelect = useCallback(
    (id: number) => {
      setBehaviorId(id);
      setParam1(0);
      setParam2(0);
      setBrowsing(false);
      const b = behaviors.find((x) => x.id === id);
      setContextBuiltinId(b && isHoldTapShape(b) ? id : undefined);
    },
    [behaviors]
  );

  // Reset params only on param-shape change; same-shape keeps them and commits via validateBinding.
  const handleModeSelect = useCallback(
    (id: number) => {
      const next = behaviors.find((b) => b.id === id);
      const prev = behaviors.find((b) => b.id === behaviorId);
      setBehaviorId(id);
      setBrowsing(false);
      if (!next || !prev || isLayerTapShape(next) !== isLayerTapShape(prev)) {
        setParam1(0);
        setParam2(0);
      }
    },
    [behaviors, behaviorId]
  );

  const handleCategorySelect = useCallback(
    (catId: string) => {
      setBrowsing(true);
      setSelectedCategoryId(catId);
    },
    []
  );

  const param1Values = useMemo(
    () => metadata?.flatMap((m) => m.param1) || [],
    [metadata]
  );

  const param2Values = useMemo(() => {
    if (!metadata) return [];
    const set = metadata.find((s) =>
      validateValue(
        layers.map((l) => l.id),
        param1,
        s.param1
      )
    );
    return set?.param2 || [];
  }, [metadata, param1, layers]);

  const param1IsHid = hasHidUsage(param1Values);
  const param2IsHid = hasHidUsage(param2Values);

  const allParam2Values = useMemo(
    () => metadata?.flatMap((m) => m.param2) || [],
    [metadata]
  );
  const anyParam2IsHid = hasHidUsage(allParam2Values);

  const hidUsagePages = useMemo(() => {
    const hidParam = [...param1Values, ...param2Values, ...allParam2Values].find(
      (v) => v.hidUsage
    );
    if (!hidParam?.hidUsage) return null;
    return [
      { id: 7, min: 4, max: hidParam.hidUsage.keyboardMax },
      { id: 12, max: hidParam.hidUsage.consumerMax },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [param1Values, param2Values]);

  // True when the value area shows a HID keycode grid (fills full height,
  // divider bleeds to edges) vs. inline constant/layer buttons (padded scroll).
  const isHidMode =
    !!hidUsagePages &&
    ((param1IsHid && anyParam2IsHid) ||
      ((param1IsHid !== anyParam2IsHid) && (param1IsHid || anyParam2IsHid)));

  const availableCategories = useMemo(
    () => BEHAVIOR_CATEGORIES.filter((c) => (categorized[c.id]?.length || 0) > 0),
    [categorized]
  );

  const categoryBehaviors = categorized[selectedCategoryId] || [];
  const isHoldTapBinding = !!selectedBehavior && isHoldTapShape(selectedBehavior);
  const isBehaviorInCategory =
    !browsing && (categoryBehaviors.some((b) => b.id === behaviorId) || isHoldTapBinding);

  const [hoveredBehaviorId, setHoveredBehaviorId] = useState<number | null>(null);
  const hoveredBehavior = categoryBehaviors.find((b) => b.id === hoveredBehaviorId);

  return (
    <div className="grid h-full w-full flex-1 min-h-0" style={{ gridTemplateColumns: "168px 200px minmax(0,1fr)" }}>
      {/* Category rail — mirrors the app's primary nav (left-accent + layer bg) */}
      <div className="flex flex-col min-h-0 overflow-y-auto border-r border-base-300 custom-scrollbar">
        <div className="px-3 pt-2 pb-1 text-2xs font-semibold uppercase tracking-wider text-base-content/50">
          {t("binding.category", "Category")}
        </div>
        {availableCategories.map((cat) => (
          <CategoryButton
            key={cat.id}
            category={cat}
            isActive={selectedCategoryId === cat.id}
            onClick={() => handleCategorySelect(cat.id)}
          />
        ))}
      </div>

      {/* Behavior list — Carbon list rows */}
      <div key={selectedCategoryId} className="flex flex-col min-h-0 overflow-y-auto border-r border-base-300 animate-fade-in custom-scrollbar"
        onMouseLeave={() => setHoveredBehaviorId(null)}
      >
        <div className="px-3 pt-2 pb-1 text-2xs font-semibold uppercase tracking-wider text-base-content/50">
          {t("binding.behavior", "Behavior")}
        </div>
        {categoryBehaviors.map((b) => (
          <button
            key={b.id}
            onClick={() => handleBehaviorSelect(b.id)}
            onMouseEnter={() => setHoveredBehaviorId(b.id)}
            className={`flex items-center h-10 px-3 text-[15px] text-left cursor-pointer transition-colors whitespace-nowrap border-l-2 ${anchorId === b.id
              ? "border-primary bg-base-100 text-base-content font-medium"
              : "border-transparent text-base-content/70 hover:bg-base-100/60"
              }`}
          >
            {DISPLAY_NAME_OVERRIDES[b.displayName] ?? b.displayName}
          </button>
        ))}
      </div>

      {/* Parameter / keycode picker. No cell padding so the HID picker fills
          edge-to-edge and its modifier divider reaches the drawer top/bottom;
          inline pickers get their own padded scroll area instead. */}
      <div className="min-h-0 min-w-0 flex flex-col overflow-hidden">
        {!isBehaviorInCategory ? (
          <div className="flex items-center justify-center h-full px-6">
            <div
              key={hoveredBehavior ? hoveredBehavior.id : '__hint'}
              className="flex flex-col items-center gap-2 text-center max-w-md animate-fade-in"
            >
              {hoveredBehavior ? (<>
                <span className="text-lg font-semibold text-base-content">{DISPLAY_NAME_OVERRIDES[hoveredBehavior.displayName] ?? hoveredBehavior.displayName}</span>
                <span className="text-sm text-base-content/60 leading-relaxed">{t(`behaviorDesc.${hoveredBehavior.displayName}`, '')}</span>
              </>) : (
                <span className="text-sm text-base-content/40">{t('selectBehaviorHint', 'Hover over a behavior on the left to see its description')}</span>
              )}
            </div>
          </div>
        ) : isHidMode ? (
          <div className="flex-1 min-h-0 flex flex-col">
            {param1IsHid && anyParam2IsHid && hidUsagePages && (
              <DualHidPicker
                param1={param1}
                param2={param2}
                usagePages={hidUsagePages}
                onParam1Changed={setParam1}
                onParam2Changed={setParam2}
                modes={holdTapModes}
                currentBehaviorId={behaviorId}
                onModeChange={handleModeSelect}
              />
            )}
            {(param1IsHid !== anyParam2IsHid) && (param1IsHid || anyParam2IsHid) && hidUsagePages && (
              <>
                {hasLayerId(param1Values) && (
                  <LayerHidDualPicker
                    layerParam={param1}
                    hidParam={param2}
                    layers={layers}
                    usagePages={hidUsagePages}
                    onLayerChanged={setParam1}
                    onHidChanged={setParam2}
                    modes={holdTapModes}
                    currentBehaviorId={behaviorId}
                    onModeChange={handleModeSelect}
                  />
                )}
                {!hasLayerId(param1Values) && (
                  <HidUsageGrid
                    value={param1IsHid ? param1 : param2}
                    usagePages={hidUsagePages}
                    onValueChanged={param1IsHid ? setParam1 : setParam2}
                  />
                )}
              </>
            )}
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-2 custom-scrollbar">
            {!param1IsHid && !param2IsHid && param1Values.length > 0 && (
              <InlineParamPicker
                values={param1Values}
                value={param1}
                layers={layers}
                onValueChanged={setParam1}
                label={hasLayerId(param1Values) ? t("binding.layer") : undefined}
              />
            )}

            {!param2IsHid && param2Values.length > 0 && (
              <div className="mt-2">
                <InlineParamPicker
                  values={param2Values}
                  value={param2}
                  layers={layers}
                  onValueChanged={setParam2}
                  label={hasLayerId(param2Values) ? t("binding.layer") : undefined}
                />
              </div>
            )}

            {param1Values.length === 0 &&
              param2Values.length === 0 &&
              selectedBehavior && (
                <div className="flex items-center justify-center h-full text-base-content/40 text-sm">
                  {DISPLAY_NAME_OVERRIDES[selectedBehavior.displayName] ?? selectedBehavior.displayName} — {t("binding.noParametersRequired")}
                </div>
              )}
          </div>
        )}
      </div>
    </div>
  );
};

const CategoryButton = ({
  category,
  isActive,
  onClick,
}: {
  category: BehaviorCategory;
  isActive: boolean;
  onClick: () => void;
}) => {
  const { t } = useTranslation();
  const Icon = category.icon;
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2.5 h-10 px-3 text-[15px] cursor-pointer transition-colors text-left border-l-2 ${isActive
        ? "border-primary bg-base-100 text-base-content font-medium"
        : "border-transparent text-base-content/70 hover:bg-base-100/60"
        }`}
    >
      <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? "text-primary" : ""}`} />
      <span className="truncate">{t(`behavior.category.${category.id}`)}</span>
    </button>
  );
};

function getHidLabel(value?: number): string {
  if (!value || value === 0) return "—";
  const masked = value & 0x00ffffff;
  const [page, id] = hid_usage_page_and_id_from_usage(masked);
  return hid_usage_get_label(page, id) || "?";
}

const SlotButton = ({
  caption,
  value,
  active,
  onClick,
  className = "flex-1",
}: {
  caption: string;
  value: string;
  active: boolean;
  onClick: () => void;
  className?: string;
}) => (
  <button
    onClick={onClick}
    className={`${className} flex flex-col items-center gap-0.5 px-3 py-2.5 rounded cursor-pointer transition-colors ${
      active ? "ring-2 ring-primary bg-base-100" : "bg-base-300 hover:bg-base-100"
    }`}
  >
    <span className="text-sm text-base-content/50">{caption}</span>
    <span className="text-base font-semibold text-base-content truncate max-w-full">
      {value}
    </span>
  </button>
);

const ModeButton = ({
  modes,
  value,
  active,
  onClick,
}: {
  modes: HoldTapMode[];
  value: number;
  active: boolean;
  onClick: () => void;
}) => {
  const { t } = useTranslation();
  const current = modes.find((m) => m.id === value);
  if (modes.length < 2 || !current) return null;
  return (
    <>
      <span className="text-base-content/30 text-lg">+</span>
      <SlotButton
        caption={t("binding.mode", "Mode")}
        value={current.label}
        active={active}
        onClick={onClick}
        className="shrink-0 w-40"
      />
    </>
  );
};

const ModeOptions = ({
  modes,
  value,
  onChange,
}: {
  modes: HoldTapMode[];
  value: number;
  onChange: (id: number) => void;
}) => (
  <div className="flex gap-1.5 flex-wrap animate-fade-in">
    {modes.map((m) => (
      <button
        key={m.id}
        onClick={() => onChange(m.id)}
        className={`px-4 py-1.5 rounded text-sm font-medium cursor-pointer transition-colors ${
          value === m.id
            ? "bg-primary text-primary-content"
            : "bg-base-100 text-base-content hover:bg-base-300"
        }`}
      >
        {m.label}
      </button>
    ))}
  </div>
);

const DualHidPicker = ({
  param1,
  param2,
  usagePages,
  onParam1Changed,
  onParam2Changed,
  modes,
  currentBehaviorId,
  onModeChange,
}: {
  param1?: number;
  param2?: number;
  usagePages: { id: number; min?: number; max?: number }[];
  onParam1Changed: (value?: number) => void;
  onParam2Changed: (value?: number) => void;
  modes: HoldTapMode[];
  currentBehaviorId: number;
  onModeChange: (id: number) => void;
}) => {
  const { t } = useTranslation();
  const [activeSlot, setActiveSlot] = useState<1 | 2 | "mode">(1);

  const slot1Label = getHidLabel(param1);
  const slot2Label = getHidLabel(param2);

  const handleValueChanged = useCallback(
    (value?: number) => {
      if (activeSlot === 1) {
        onParam1Changed(value);
      } else if (activeSlot === 2) {
        onParam2Changed(value);
      }
    },
    [activeSlot, onParam1Changed, onParam2Changed]
  );

  return (
    <div className="flex flex-col gap-2 h-full min-h-0">
      <div className="flex gap-2 items-center px-3 pt-3">
        <SlotButton
          caption={t("binding.hold")}
          value={slot1Label}
          active={activeSlot === 1}
          onClick={() => setActiveSlot(1)}
        />
        <span className="text-base-content/30 text-lg">+</span>
        <SlotButton
          caption={t("binding.tap")}
          value={slot2Label}
          active={activeSlot === 2}
          onClick={() => setActiveSlot(2)}
        />
        <ModeButton
          modes={modes}
          value={currentBehaviorId}
          active={activeSlot === "mode"}
          onClick={() => setActiveSlot("mode")}
        />
      </div>

      {activeSlot === "mode" ? (
        <ModeOptions modes={modes} value={currentBehaviorId} onChange={onModeChange} />
      ) : (
        <HidUsageGrid
          value={activeSlot === 1 ? param1 : param2}
          usagePages={usagePages}
          onValueChanged={handleValueChanged}
        />
      )}
    </div>
  );
};

const LayerHidDualPicker = ({
  layerParam,
  hidParam,
  layers,
  usagePages,
  onLayerChanged,
  onHidChanged,
  modes,
  currentBehaviorId,
  onModeChange,
}: {
  layerParam?: number;
  hidParam?: number;
  layers: { id: number; name: string }[];
  usagePages: { id: number; min?: number; max?: number }[];
  onLayerChanged: (value?: number) => void;
  onHidChanged: (value?: number) => void;
  modes: HoldTapMode[];
  currentBehaviorId: number;
  onModeChange: (id: number) => void;
}) => {
  const { t } = useTranslation();
  const [activeSlot, setActiveSlot] = useState<"hold" | "tap" | "mode">("tap");

  const holdLabel = layers.find((l) => l.id === layerParam)?.name || "—";
  const tapLabel = getHidLabel(hidParam);

  return (
    <div className="flex flex-col gap-2 h-full min-h-0">
      <div className="flex gap-2 items-center px-3 pt-3">
        <SlotButton
          caption={t("binding.hold")}
          value={holdLabel}
          active={activeSlot === "hold"}
          onClick={() => setActiveSlot("hold")}
        />
        <span className="text-base-content/30 text-lg">+</span>
        <SlotButton
          caption={t("binding.tap")}
          value={tapLabel}
          active={activeSlot === "tap"}
          onClick={() => setActiveSlot("tap")}
        />
        <ModeButton
          modes={modes}
          value={currentBehaviorId}
          active={activeSlot === "mode"}
          onClick={() => setActiveSlot("mode")}
        />
      </div>

      {activeSlot === "mode" ? (
        <ModeOptions modes={modes} value={currentBehaviorId} onChange={onModeChange} />
      ) : activeSlot === "hold" ? (
        <div className="flex gap-1.5 flex-wrap">
          {layers.map(({ name, id }) => (
            <button
              key={id}
              onClick={() => onLayerChanged(id)}
              className={`px-4 py-1.5 rounded text-sm font-medium cursor-pointer transition-colors ${layerParam === id
                ? "bg-primary text-primary-content"
                : "bg-base-100 text-base-content hover:bg-base-300"
                }`}
            >
              {name}
            </button>
          ))}
        </div>
      ) : (
        <HidUsageGrid
          value={hidParam}
          usagePages={usagePages}
          onValueChanged={onHidChanged}
        />
      )}
    </div>
  );
};
