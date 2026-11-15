import { KeyboardPose } from "./KeyboardPose";
import { FlatCalibration, relativeAngle, type Point3 } from "./poseMath";
import { maintainImuLease } from "./imuLease";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { ConnectionContext } from "../rpc/ConnectionContext";
import {
  imuBackend,
  IMU_DEFAULTS,
  validImu,
  type ImuConfig,
} from "./imuProtocol";
import type { MotionLiveState } from "./motionRpc";
export function ImuPanel({
  live,
  onChanged,
  t,
}: {
  live: MotionLiveState;
  onChanged: () => void;
  t: (key: string, fallback: string) => string;
}) {
  const { conn } = useContext(ConnectionContext);
  const backend = useMemo(() => imuBackend(conn), [conn]);
  const [config, setConfig] = useState<ImuConfig | null>(null),
    [draft, setDraft] = useState(IMU_DEFAULTS),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [wanted, setWanted] = useState(false),
    [fresh, setFresh] = useState(false);
  const received = useRef(0),
    alive = useRef(true),
    epoch = useRef(0),
    zero = useRef<number[] | null>(null),
    left = useRef<{ axis: number; flip: boolean } | null>(null);
  const [step, setStep] = useState(0);
  const [calibrating, setCalibrating] = useState(false),
    [calProgress, setCalProgress] = useState(0),
    [calNote, setCalNote] = useState("");
  const calibration = useRef<{
    sampler: FlatCalibration;
    started: number;
    config: ImuConfig;
  } | null>(null);
  const l = (key: string) => t("motion.imu." + key, key);
  useEffect(() => {
    if (live.sampleTime !== undefined && live.sampleTime !== 0) {
      received.current = Date.now();
      setFresh(true);
    }
  }, [live.sampleTime]);
  useEffect(() => {
    alive.current = true;
    const current = ++epoch.current;
    setConfig(null);
    setBusy(false);
    setError("");
    setWanted(false);
    setStep(0);
    calibration.current = null;
    setCalibrating(false);
    setCalNote("");
    void backend
      ?.get()
      .then((c) => {
        if (alive.current && current === epoch.current && c) {
          setConfig(c);
          setDraft(c);
        }
      })
      .catch(() => {
        if (alive.current && current === epoch.current) setError(l("error"));
      });
    return () => {
      alive.current = false;
      calibration.current = null;
      epoch.current++;
      void backend?.mode(false).catch(() => {});
    };
  }, [backend]);
  useEffect(() => {
    const timer = setInterval(() => {
      const ok = Date.now() - received.current < 650;
      setFresh(ok);
      if (!ok) setWanted(false);
    }, 200);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!backend || !wanted) return;
    return maintainImuLease(backend.mode, () => {
      setWanted(false);
      setError(l("modeError"));
    });
  }, [backend, wanted]);
  const raw = [live.xMg ?? 0, live.yMg ?? 0, live.zMg ?? 0];
  const a = [raw[draft.swapXy ? 1 : 0], raw[draft.swapXy ? 0 : 1], raw[2]].map(
    (v, i) => (draft.flipMask & (1 << i) ? -v : v),
  );
  const roll = (Math.atan2(a[1], a[2]) * 180) / Math.PI,
    pitch = (Math.atan2(-a[0], Math.hypot(a[1], a[2])) * 180) / Math.PI;
  const valid = fresh && live.tiltValid === true;
  const angles = useRef([0, 0]);
  if (valid)
    angles.current =
      config &&
      config.swapXy === draft.swapXy &&
      config.flipMask === draft.flipMask &&
      live.rollCdeg !== undefined &&
      live.pitchCdeg !== undefined
        ? [live.rollCdeg / 100, live.pitchCdeg / 100]
        : [roll, pitch];
  const set = (patch: Partial<ImuConfig>) => {
    setDraft((c) => ({ ...c, ...patch }));
    setError("");
  };
  const apply = async () => {
    if (!backend || !validImu(draft)) return;
    setBusy(true);
    try {
      if (await backend.set(draft)) {
        setConfig({ ...draft });
        onChanged();
      } else setError(l("error"));
    } catch {
      setError(l("error"));
    } finally {
      setBusy(false);
    }
  };
  const mode = async () => {
    if (!backend) return;
    setBusy(true);
    const requestEpoch = epoch.current;
    try {
      const on = !wanted;
      if (await backend.mode(on)) {
        if (!alive.current || requestEpoch !== epoch.current) {
          if (on) await backend.mode(false);
          return;
        }
        setWanted(on);
        setError("");
      } else setError(l("modeError"));
    } catch {
      setError(l("modeError"));
    } finally {
      setBusy(false);
    }
  };
  const startFlat = () => {
    if (!backend || !valid || wanted || busy || !validImu(draft)) return;
    calibration.current = {
      sampler: new FlatCalibration(draft),
      started: performance.now(),
      config: { ...draft },
    };
    setCalibrating(true);
    setCalProgress(0);
    setCalNote("");
    setError("");
    setStep(0);
  };
  useEffect(() => {
    const job = calibration.current;
    if (!job || !backend || !live.sampleTime) return;
    if (!valid) {
      job.sampler.reset();
      setCalProgress(0);
      return;
    }
    const result = job.sampler.push(
      raw as Point3,
      live.sampleTime,
      performance.now(),
    );
    setCalProgress(result.progress);
    if (!result.center) return;
    calibration.current = null;
    setCalibrating(false);
    setBusy(true);
    const next = {
      ...job.config,
      centerRoll: result.center[0],
      centerPitch: result.center[1],
    };
    const current = epoch.current;
    void backend
      .set(next)
      .then((ok) => {
        if (!alive.current || current !== epoch.current) return;
        if (ok) {
          setConfig({ ...next });
          setDraft({ ...next });
          onChanged();
          setCalNote(l("flatDone"));
        } else setError(l("error"));
      })
      .catch(() => {
        if (alive.current && current === epoch.current) setError(l("error"));
      })
      .finally(() => {
        if (alive.current && current === epoch.current) setBusy(false);
      });
  }, [live.sampleTime]);
  useEffect(() => {
    if (!calibrating) return;
    const timer = setInterval(() => {
      const job = calibration.current;
      if (job && performance.now() - job.started > 8000) {
        calibration.current = null;
        setCalibrating(false);
        setCalNote(l("flatRetry"));
      }
    }, 200);
    return () => clearInterval(timer);
  }, [calibrating]);
  const calibrate = () => {
    if (!valid) return;
    if (step === 0) {
      if (Math.abs(raw[2]) < 850) {
        setError(l("flatError"));
        return;
      }
      zero.current = raw;
      left.current = null;
      setStep(1);
    } else if (step === 1) {
      const base = zero.current!;
      const d = [raw[0] - base[0], raw[1] - base[1]];
      const axis = Math.abs(d[0]) >= Math.abs(d[1]) ? 0 : 1;
      if (Math.abs(d[axis]) < 200) {
        setError(l("liftError"));
        return;
      }
      left.current = { axis, flip: d[axis] > 0 };
      setStep(2);
    } else {
      const base = zero.current!,
        x = left.current!;
      const other = 1 - x.axis;
      const d = raw[other] - base[other];
      if (
        Math.abs(d) < 200 ||
        Math.abs(d) < Math.abs(raw[x.axis] - base[x.axis])
      ) {
        setError(l("liftError"));
        return;
      }
      set({
        swapXy: x.axis === 1,
        flipMask: (x.flip ? 1 : 0) | (d < 0 ? 2 : 0) | (base[2] < 0 ? 4 : 0),
        centerRoll: 0,
        centerPitch: 0,
      });
      setStep(0);
      setCalNote(l("axisDone"));
    }
  };
  const changed = JSON.stringify(config) !== JSON.stringify(draft);
  return (
    <div className="space-y-6 overflow-y-auto p-6 text-sm custom-scrollbar">
      <div>
        <h2 className="text-lg font-semibold">{l("title")}</h2>
        <p className="mt-2 text-xs leading-relaxed text-helper">
          {l("limitations")}
        </p>
      </div>
      {!config ? (
        <p role="status">{l("loading")}</p>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="border border-base-300 p-4">
              <KeyboardPose
                roll={relativeAngle(angles.current[0], draft.centerRoll / 100)}
                pitch={relativeAngle(
                  angles.current[1],
                  draft.centerPitch / 100,
                )}
                label={l("model")}
                frontLabel={l("frontEdge")}
                guide={
                  step === 1
                    ? "left"
                    : step === 2
                      ? "rear"
                      : calibrating
                        ? "flat"
                        : undefined
                }
              />
              <p className="text-xs text-helper">
                {valid ? l("stable") : l("unstable")}
              </p>
            </div>
            <div className="space-y-4">
              <p>
                {l("roll")}{" "}
                {relativeAngle(
                  angles.current[0],
                  draft.centerRoll / 100,
                ).toFixed(1)}
                ° · {l("pitch")}{" "}
                {relativeAngle(
                  angles.current[1],
                  draft.centerPitch / 100,
                ).toFixed(1)}
                °
              </p>
              <h3 className="font-semibold">{l("flatTitle")}</h3>
              <p className="text-xs leading-relaxed text-helper">
                {l("flatGuide")}
              </p>
              <button
                className="border border-base-300 px-4 py-2 disabled:opacity-40"
                disabled={
                  !valid || busy || wanted || calibrating || !validImu(draft)
                }
                onClick={startFlat}
              >
                {l("flatButton")}
              </button>
              {calibrating && (
                <div role="status" className="space-y-2">
                  <p>{l("flatCollecting")}</p>
                  <progress
                    aria-label={l("flatTitle")}
                    className="w-full"
                    max={100}
                    value={calProgress}
                  />
                  <button
                    onClick={() => {
                      calibration.current = null;
                      setCalibrating(false);
                    }}
                  >
                    {l("cancel")}
                  </button>
                </div>
              )}
              {calNote && (
                <p role="status" className="text-xs leading-relaxed">
                  {calNote}
                </p>
              )}
              <p className="text-xs text-helper">{l("axisOptional")}</p>
            </div>
          </div>
          <fieldset
            disabled={busy || wanted || calibrating}
            className="grid gap-5 sm:grid-cols-2"
          >
            <label className="grid gap-2">
              {l("source")}
              <select
                aria-label={l("source")}
                className="border border-base-300 bg-base-200 p-2"
                value={draft.source}
                onChange={(e) => set({ source: Number(e.target.value) })}
              >
                <option value={0}>{l("roll")}</option>
                <option value={1}>{l("pitch")}</option>
              </select>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.invert}
                onChange={(e) => set({ invert: e.target.checked })}
              />
              {l("invert")}
            </label>
            {(["rangeDeg", "deadzoneDeg", "smoothingMs"] as const).map(
              (key, i) => (
                <label className="grid gap-2" key={key}>
                  {l(key)}
                  <input
                    aria-label={l(key)}
                    className="border border-base-300 bg-base-200 p-2"
                    type="number"
                    min={[5, 0, 0][i]}
                    max={[90, 10, 200][i]}
                    value={draft[key]}
                    onChange={(e) =>
                      set({
                        [key]:
                          e.target.value === "" ? NaN : Number(e.target.value),
                      })
                    }
                  />
                </label>
              ),
            )}
          </fieldset>
          <div className="flex flex-wrap items-center gap-3">
            <button
              className="border border-base-300 px-4 py-2 disabled:opacity-40"
              disabled={
                busy || wanted || calibrating || !changed || !validImu(draft)
              }
              onClick={() => void apply()}
            >
              {l("apply")}
            </button>
            <button
              className="border border-base-300 px-4 py-2 disabled:opacity-40"
              disabled={busy || wanted || calibrating}
              onClick={() =>
                setDraft({
                  ...IMU_DEFAULTS,
                  swapXy: config?.swapXy ?? false,
                  flipMask: config?.flipMask ?? 0,
                })
              }
            >
              {l("defaults")}
            </button>
            <span className="text-xs text-helper">{l("saveHint")}</span>
          </div>
          <div className="border-t border-base-300 pt-5">
            <h3 className="font-semibold">{l("gameTitle")}</h3>
            <p className="my-3 text-xs leading-relaxed text-helper">
              {l("gameHint")}
            </p>
            <button
              className="border border-base-300 px-4 py-2 disabled:opacity-40"
              disabled={
                busy ||
                calibrating ||
                (!wanted &&
                  (!valid ||
                    changed ||
                    !validImu(draft) ||
                    !live.gameSupported))
              }
              onClick={() => void mode()}
            >
              {l(wanted ? "stop" : "start")}
            </button>
            <span role="status" className="ml-3 text-xs">
              {l(wanted && live.gameActive ? "active" : "inactive")}
            </span>
            <p className="mt-3 font-mono">
              {l("output")} {live.gameAxis ?? 0} / 32767
            </p>
            <div
              role="meter"
              aria-label={l("output")}
              aria-valuemin={-32767}
              aria-valuemax={32767}
              aria-valuenow={live.gameAxis ?? 0}
              className="relative mt-2 h-3 bg-base-300"
            >
              <div
                className="absolute top-0 h-3 bg-primary"
                style={{
                  left: "50%",
                  width: (Math.abs(live.gameAxis ?? 0) / 32767) * 50 + "%",
                  transform:
                    (live.gameAxis ?? 0) < 0 ? "translateX(-100%)" : undefined,
                }}
              />
              <div className="absolute left-1/2 h-3 border-l border-current" />
            </div>
          </div>
          <details className="border-t border-base-300 pt-4">
            <summary className="cursor-pointer">{l("advanced")}</summary>
            <div className="mt-4 space-y-3">
              <h3 className="font-semibold">{l("axisTitle")}</h3>
              <p className="text-xs text-helper">{l("calibrationHint")}</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="max-w-[360px] border border-base-300 p-2">
                  <KeyboardPose
                    roll={step === 2 ? 20 : 0}
                    pitch={step === 1 ? 20 : 0}
                    label={l("guideModel")}
                    frontLabel={l("frontEdge")}
                    guide={step === 1 ? "left" : step === 2 ? "rear" : "flat"}
                  />
                </div>
                <div className="space-y-3 self-center">
                  <ol
                    className="grid gap-2 text-xs"
                    aria-label={l("axisTitle")}
                  >
                    {["guideFlat", "guideLeft", "guideRear"].map((key, i) => (
                      <li
                        key={key}
                        aria-current={step === i ? "step" : undefined}
                        className={
                          step === i
                            ? "font-semibold text-primary"
                            : "text-helper"
                        }
                      >
                        {i + 1}. {l(key)}
                      </li>
                    ))}
                  </ol>
                  <button
                    className="border border-base-300 px-3 py-2 disabled:opacity-40"
                    disabled={!valid || busy || wanted || calibrating}
                    onClick={calibrate}
                  >
                    {l(["calibrate", "leftLift", "rearLift"][step])}
                  </button>
                  {step > 0 && (
                    <button className="ml-3" onClick={() => setStep(0)}>
                      {l("cancel")}
                    </button>
                  )}
                  {step > 0 && (
                    <p role="status" className="text-xs text-primary">
                      {l(step === 1 ? "guideLeft" : "guideRear")}
                    </p>
                  )}
                </div>
              </div>
              <p className="font-mono text-xs">
                X {raw[0]} mg · Y {raw[1]} mg · Z {raw[2]} mg
              </p>
              <p className="text-xs text-helper">
                {l("centerValue")} {(draft.centerRoll / 100).toFixed(1)}° /{" "}
                {(draft.centerPitch / 100).toFixed(1)}°
              </p>
            </div>
            <div className="mt-4 flex flex-wrap gap-5">
              <label>
                <input
                  type="checkbox"
                  disabled={wanted || calibrating || busy}
                  checked={draft.swapXy}
                  onChange={(e) =>
                    set({
                      swapXy: e.target.checked,
                      centerRoll: 0,
                      centerPitch: 0,
                    })
                  }
                />{" "}
                {l("swap")}
              </label>
              {["X", "Y", "Z"].map((axis, i) => (
                <label key={axis}>
                  <input
                    type="checkbox"
                    disabled={wanted || calibrating || busy}
                    checked={!!(draft.flipMask & (1 << i))}
                    onChange={(e) =>
                      set({
                        flipMask: e.target.checked
                          ? draft.flipMask | (1 << i)
                          : draft.flipMask & ~(1 << i),
                        centerRoll: 0,
                        centerPitch: 0,
                      })
                    }
                  />{" "}
                  {l("flip")} {axis}
                </label>
              ))}
            </div>
          </details>
        </>
      )}
      {error && (
        <p role="alert" className="text-error">
          {error}
        </p>
      )}
    </div>
  );
}
