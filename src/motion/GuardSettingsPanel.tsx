import { useEffect, useState } from "react";
import type { CarryConfig } from "./motionRpc";
import {
  GUARD_DEFAULTS,
  GUARD_FIELDS,
  GUARD_LIMITS,
  validGuardSettings,
  type GuardSettings,
} from "./guardProtocol";

export function GuardSettingsPanel({
  config,
  onChange,
  t,
}: {
  config: CarryConfig & GuardSettings;
  onChange: (config: CarryConfig) => Promise<boolean>;
  t: (key: string, fallback: string) => string;
}) {
  const [draft, setDraft] = useState<GuardSettings>(config);
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState<"applied" | "failed">();
  useEffect(() => {
    setDraft({ ...config });
  }, [config]);
  const changed = GUARD_FIELDS.some((key) => draft[key] !== config[key]);
  const label = (key: string, fallback: string) =>
    t(`motion.guard.settings.${key}`, fallback);
  const names = [
    "After extended movement",
    "After a brief lift",
    "Stable placement tolerance",
    "Lift detection threshold",
    "Lift confirmation time",
  ];
  const apply = async () => {
    if (!validGuardSettings(draft)) return;
    setWorking(true);
    setResult(undefined);
    try {
      setResult(
        (await onChange({ ...config, ...draft })) ? "applied" : "failed",
      );
    } catch {
      setResult("failed");
    } finally {
      setWorking(false);
    }
  };
  return (
    <section className="mt-5 border-t border-base-300 pt-5">
      <h3 className="font-semibold">{label("title", "Detection settings")}</h3>
      <p className="mt-2 text-xs text-helper">
        {label(
          "hint",
          "Changes apply after confirmation. Use the header Save action to retain them after restart.",
        )}
      </p>
      <fieldset disabled={working} className="mt-4 grid gap-4">
        {GUARD_FIELDS.map((key, i) => (
          <label
            key={key}
            className="grid gap-1 text-xs sm:grid-cols-[minmax(0,1fr)_7rem] sm:gap-x-4"
          >
            <span className="font-medium">
              {label(key, names[i])} · {i === 2 || i === 3 ? "mg" : "ms"}
            </span>
            <input
              type="number"
              className="w-full border border-base-300 bg-base-200 px-2 py-1 text-base-content"
              aria-label={label(key, names[i])}
              min={GUARD_LIMITS[i][0]}
              max={GUARD_LIMITS[i][1]}
              step="1"
              value={Number.isFinite(draft[key]) ? draft[key] : ""}
              onChange={(e) => {
                setDraft((old) => ({
                  ...old,
                  [key]: e.target.value === "" ? NaN : Number(e.target.value),
                }));
                setResult(undefined);
              }}
            />
            <span className="text-helper sm:col-span-2">
              {label(`${key}Hint`, "")} ({GUARD_LIMITS[i][0]}–
              {GUARD_LIMITS[i][1]})
            </span>
          </label>
        ))}
      </fieldset>
      {!validGuardSettings(draft) && (
        <p role="alert" className="mt-3 text-xs text-error">
          {label(
            "invalid",
            "Enter values within the listed ranges. Extended-movement confirmation must be at least as long as brief-lift confirmation.",
          )}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          className="border border-base-300 px-3 py-2 text-xs disabled:opacity-40"
          disabled={working}
          onClick={() => {
            setDraft({ ...GUARD_DEFAULTS });
            setResult(undefined);
          }}
        >
          {label("defaults", "Restore recommended values")}
        </button>
        <button
          className="bg-primary px-3 py-2 text-xs text-primary-content disabled:opacity-40"
          disabled={working || !changed || !validGuardSettings(draft)}
          onClick={() => void apply()}
        >
          {label(
            working ? "applying" : "apply",
            working ? "Applying…" : "Apply settings",
          )}
        </button>
      </div>
      {result && (
        <p role="status" className="mt-3 text-xs text-helper">
          {label(
            result,
            result === "applied"
              ? "Applied. Save to the keyboard to retain these settings after restart."
              : "The keyboard rejected the settings. Previous values were restored.",
          )}
        </p>
      )}
    </section>
  );
}
