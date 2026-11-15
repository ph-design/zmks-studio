import { useEffect, useState } from "react";
import {
  POWER_DEFAULTS,
  validPowerConfig,
  type PowerConfig,
} from "./powerProtocol";

export function PowerSettingsPanel({
  config,
  lights,
  onChange,
  t,
}: {
  config: PowerConfig | null;
  lights: number;
  onChange: (config: PowerConfig) => Promise<boolean>;
  t: (key: string, fallback: string) => string;
}) {
  const [draft, setDraft] = useState<PowerConfig>(config ?? POWER_DEFAULTS);
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState<"applied" | "failed">();
  useEffect(() => {
    setDraft({ ...(config ?? POWER_DEFAULTS) });
  }, [config]);
  const l = (key: string, fallback = "") => t(`power.${key}`, fallback);
  const update = (patch: Partial<PowerConfig>) => {
    setDraft((old) => ({ ...old, ...patch }));
    setResult(undefined);
  };
  const apply = async () => {
    if (!validPowerConfig(draft)) return;
    setWorking(true);
    setResult(undefined);
    try {
      setResult((await onChange(draft)) ? "applied" : "failed");
    } catch {
      setResult("failed");
    } finally {
      setWorking(false);
    }
  };
  const timer = (
    key: "idleTimeoutMs" | "rgbOffMs" | "backlightOffMs" | "deepSleepMs",
  ) => (
    <label
      className="grid gap-2 text-xs sm:grid-cols-[minmax(0,1fr)_8rem]"
      key={key}
    >
      <span className="font-medium">
        {l(key)} · {l("seconds", "seconds")}
      </span>
      <input
        type="number"
        className="w-full border border-base-300 bg-base-200 px-2 py-2 text-base-content"
        aria-label={l(key)}
        min={key === "deepSleepMs" ? 60 : 0}
        max={86400}
        step={1}
        value={Number.isFinite(draft[key]) ? draft[key] / 1000 : ""}
        onChange={(e) =>
          update({
            [key]: e.target.value === "" ? NaN : Number(e.target.value) * 1000,
          })
        }
      />
      <span className="text-helper sm:col-span-2">{l(`${key}Hint`)}</span>
    </label>
  );
  return (
    <section className="my-6 border-t border-base-300 py-5">
      <h3 className="text-sm font-semibold">
        {l("title", "Automatic sleep and lighting")}
      </h3>
      {!config ? (
        <p className="mt-3 text-xs text-helper">
          {l(
            "upgrade",
            "Unlock Studio and use preview.6 or compatible keyboard firmware to edit these settings.",
          )}
        </p>
      ) : (
        <>
          <p className="mt-2 text-xs leading-relaxed text-helper">
            {l("hint")}
          </p>
          <fieldset disabled={working} className="mt-5 grid gap-5">
            {timer("idleTimeoutMs")}
            {!!(lights & 1) && timer("rgbOffMs")}
            {!!(lights & 2) && timer("backlightOffMs")}
            <label className="flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                checked={draft.offWhenLocked}
                onChange={(e) => update({ offWhenLocked: e.target.checked })}
              />
              {l("offWhenLocked")}
            </label>
            <label className="flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                checked={draft.onUsb}
                onChange={(e) => update({ onUsb: e.target.checked })}
              />
              {l("onUsb")}
            </label>
            <div className="border-t border-base-300 pt-4">
              <label className="flex items-start gap-2 text-xs font-medium">
                <input
                  type="checkbox"
                  checked={draft.deepSleepMs !== 0}
                  onChange={(e) =>
                    update({ deepSleepMs: e.target.checked ? 1800000 : 0 })
                  }
                />
                {l("deepEnabled")}
              </label>
              <p className="mt-2 text-xs leading-relaxed text-helper">
                {l("deepHint")}
              </p>
              {draft.deepSleepMs !== 0 && (
                <div className="mt-4">{timer("deepSleepMs")}</div>
              )}
            </div>
          </fieldset>
          {!validPowerConfig(draft) && (
            <p role="alert" className="mt-3 text-xs text-error">
              {l("invalid")}
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              className="border border-base-300 px-3 py-2 text-xs disabled:opacity-40"
              disabled={working}
              onClick={() => {
                setDraft({ ...POWER_DEFAULTS });
                setResult(undefined);
              }}
            >
              {l("defaults")}
            </button>
            <button
              className="bg-primary px-3 py-2 text-xs text-primary-content disabled:opacity-40"
              disabled={
                working ||
                !validPowerConfig(draft) ||
                JSON.stringify(draft) === JSON.stringify(config)
              }
              onClick={() => void apply()}
            >
              {l(working ? "applying" : "apply")}
            </button>
          </div>
          {result && (
            <p role="status" className="mt-3 text-xs text-helper">
              {l(result)}
            </p>
          )}
          <p className="mt-3 text-xs text-helper">{l("scope")}</p>
        </>
      )}
    </section>
  );
}
