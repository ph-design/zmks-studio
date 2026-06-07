import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";
import { HoldTapConfig, HoldTapFlavor_Flavor } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import { FLAVOR_I18N } from "./holdTapUtils";

const FLAVOR_OPTIONS: HoldTapFlavor_Flavor[] = [
  HoldTapFlavor_Flavor.BALANCED,
  HoldTapFlavor_Flavor.HOLD_PREFERRED,
  HoldTapFlavor_Flavor.TAP_PREFERRED,
  HoldTapFlavor_Flavor.TAP_UNLESS_INTERRUPTED,
];

const TERM_PRESETS: { labelKey: string; value: number }[] = [
  { labelKey: "holdTap.term.sensitive", value: 150 },
  { labelKey: "holdTap.term.standard", value: 200 },
  { labelKey: "holdTap.term.relaxed", value: 280 },
];

const FlavorPicker = ({
  value,
  onChange,
}: {
  value: HoldTapFlavor_Flavor;
  onChange: (v: HoldTapFlavor_Flavor) => void;
}) => {
  const { t } = useTranslation();
  const meta = FLAVOR_I18N[value];
  return (
    <div className="flex flex-col gap-1.5">
      <div
        className="flex flex-wrap gap-1"
        role="radiogroup"
        aria-label={t("holdTap.flavorLabel", "Flavor")}
      >
        {FLAVOR_OPTIONS.map((f) => {
          const selected = value === f;
          return (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(f)}
              className={`px-3 py-1.5 rounded text-sm cursor-pointer transition-colors ${
                selected
                  ? "bg-primary text-primary-content"
                  : "text-base-content hover:bg-base-300"
              }`}
            >
              {t(FLAVOR_I18N[f].title)}
            </button>
          );
        })}
      </div>
      {meta ? (
        <p className="text-sm text-base-content/55 leading-snug">{t(meta.desc)}</p>
      ) : null}
    </div>
  );
};

const MsField = ({
  label,
  desc,
  value,
  onChange,
  min = 0,
  max = 500,
  step = 1,
  presets,
}: {
  label: string;
  desc?: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  presets?: { labelKey: string; value: number }[];
}) => {
  const { t } = useTranslation();
  const clamped = value < min ? min : value > max ? max : value;

  // Buffer text to avoid clamping on each keystroke; commit on blur, push live only when in range.
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
        <span className="text-sm text-base-content/60 min-w-[7rem] shrink-0 whitespace-nowrap">
          {label}
        </span>
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
      {presets ? (
        <div className="flex gap-1.5 flex-wrap">
          {presets.map((p) => (
            <button
              key={p.value}
              type="button"
              aria-pressed={value === p.value}
              onClick={() => onChange(p.value)}
              className={`px-2.5 py-1 rounded text-sm cursor-pointer transition-colors ${
                value === p.value
                  ? "bg-primary text-primary-content"
                  : "text-base-content/70 hover:bg-base-300"
              }`}
            >
              {t(p.labelKey)} · {p.value}
            </button>
          ))}
        </div>
      ) : null}
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
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) => {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div className="flex flex-col min-w-0">
        <span className="text-sm text-base-content leading-tight">{label}</span>
        {desc ? <span className="text-sm text-base-content/55 leading-snug">{desc}</span> : null}
      </div>
      <div
        className="flex items-center gap-1 flex-shrink-0"
        role="radiogroup"
        aria-label={label}
      >
        <button
          type="button"
          role="radio"
          aria-checked={checked}
          onClick={() => onChange(true)}
          className={`px-3 py-1 rounded text-sm cursor-pointer transition-colors ${
            checked ? "bg-primary text-primary-content" : "text-base-content hover:bg-base-300"
          }`}
        >
          {t("holdTap.on", "On")}
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
          {t("holdTap.off", "Off")}
        </button>
      </div>
    </div>
  );
};

export const HoldTapConfigFields = ({
  cfg,
  onChange,
}: {
  cfg: HoldTapConfig;
  onChange: (patch: Partial<HoldTapConfig>) => void;
}) => {
  const { t } = useTranslation();
  const [advanced, setAdvanced] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2">
        <span className="text-sm font-medium text-base-content/60">
          {t("holdTap.flavorLabel", "Flavor")}
        </span>
        <FlavorPicker value={cfg.flavor} onChange={(v) => onChange({ flavor: v })} />
      </section>

      <section>
        <MsField
          label={t("holdTap.tappingTermMs", "Tapping Term (ms)")}
          value={cfg.tappingTermMs}
          onChange={(v) => onChange({ tappingTermMs: v })}
          min={50}
          max={500}
          presets={TERM_PRESETS}
        />
      </section>

      <section className="flex flex-col gap-3">
        <button
          type="button"
          aria-expanded={advanced}
          onClick={() => setAdvanced((v) => !v)}
          className="flex items-center gap-1 text-sm font-medium text-base-content/60 hover:text-base-content/80 transition-colors cursor-pointer w-fit"
        >
          <ChevronRight className={`w-3.5 h-3.5 transition-transform ${advanced ? "rotate-90" : ""}`} />
          {t("holdTap.advanced", "Advanced")}
        </button>

        {advanced && (
          <div className="flex flex-col gap-4 pl-1 animate-fade-in">
            <MsField
              label={t("holdTap.quickTapMs", "Quick Tap (ms)")}
              desc={t("holdTap.desc.quickTapMs", "")}
              value={cfg.quickTapMs}
              onChange={(v) => onChange({ quickTapMs: v })}
              min={0}
              max={500}
            />
            <MsField
              label={t("holdTap.requirePriorIdleMs", "Prior Idle (ms)")}
              desc={t("holdTap.desc.requirePriorIdleMs", "")}
              value={cfg.requirePriorIdleMs}
              onChange={(v) => onChange({ requirePriorIdleMs: v })}
              min={0}
              max={500}
            />

            <div className="flex flex-col">
              <ToggleRow
                label={t("holdTap.retroTap", "Retro Tap")}
                desc={t("holdTap.desc.retroTap", "")}
                checked={cfg.retroTap}
                onChange={(v) => onChange({ retroTap: v })}
              />
              <ToggleRow
                label={t("holdTap.holdWhileUndecided", "Immediate Hold")}
                desc={t("holdTap.desc.holdWhileUndecided", "")}
                checked={cfg.holdWhileUndecided}
                onChange={(v) => onChange({ holdWhileUndecided: v })}
              />
              <ToggleRow
                label={t("holdTap.holdWhileUndecidedLinger", "Keep Holding")}
                desc={t("holdTap.desc.holdWhileUndecidedLinger", "")}
                checked={cfg.holdWhileUndecidedLinger}
                onChange={(v) => onChange({ holdWhileUndecidedLinger: v })}
              />
              <ToggleRow
                label={t("holdTap.holdTriggerOnRelease", "Decide on Release")}
                desc={t("holdTap.desc.holdTriggerOnRelease", "")}
                checked={cfg.holdTriggerOnRelease}
                onChange={(v) => onChange({ holdTriggerOnRelease: v })}
              />
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
