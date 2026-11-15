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
  const l = (key: string) => t("motion.imu." + key, key);
  useEffect(() => {
    received.current = Date.now();
    setFresh(true);
  }, [live.sampleTime]);
  useEffect(() => {
    alive.current = true;
    const current = ++epoch.current;
    setConfig(null);
    setWanted(false);
    setStep(0);
    void backend
      ?.get()
      .then((c) => {
        if (alive.current && current === epoch.current && c) {
          setConfig(c);
          setDraft(c);
        }
      })
      .catch(() => setError(l("error")));
    return () => {
      alive.current = false;
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
                roll={angles.current[0]}
                pitch={angles.current[1]}
                label={l("model")}
              />
              <p className="text-xs text-helper">
                {valid ? l("stable") : l("unstable")}
              </p>
            </div>
            <div className="space-y-4">
              <p className="font-mono">
                X {raw[0]} mg · Y {raw[1]} mg · Z {raw[2]} mg
              </p>
              <p>
                {l("roll")} {angles.current[0].toFixed(1)}° · {l("pitch")}{" "}
                {angles.current[1].toFixed(1)}°
              </p>
              <p className="text-xs text-helper">{l("calibrationHint")}</p>
              <div className="flex flex-wrap gap-3">
                <button
                  className="border border-base-300 px-3 py-2 disabled:opacity-40"
                  disabled={!valid || busy || wanted}
                  onClick={calibrate}
                >
                  {l(["calibrate", "leftLift", "rearLift"][step])}
                </button>
                {step > 0 && (
                  <button onClick={() => setStep(0)}>{l("cancel")}</button>
                )}
                <button
                  className="border border-base-300 px-3 py-2 disabled:opacity-40"
                  disabled={!valid || wanted}
                  onClick={() =>
                    set({
                      centerRoll: Math.round(roll * 100),
                      centerPitch: Math.round(pitch * 100),
                    })
                  }
                >
                  {l("center")}
                </button>
              </div>
              <p className="text-xs text-helper">
                {l("centerValue")} {(draft.centerRoll / 100).toFixed(1)}° /{" "}
                {(draft.centerPitch / 100).toFixed(1)}°
              </p>
            </div>
          </div>
          <fieldset
            disabled={busy || wanted}
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
              disabled={busy || wanted || !changed || !validImu(draft)}
              onClick={() => void apply()}
            >
              {l("apply")}
            </button>
            <button
              className="border border-base-300 px-4 py-2 disabled:opacity-40"
              disabled={busy || wanted}
              onClick={() => setDraft({ ...IMU_DEFAULTS })}
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
            <div className="mt-4 flex flex-wrap gap-5">
              <label>
                <input
                  type="checkbox"
                  disabled={wanted}
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
                    disabled={wanted}
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
function KeyboardPose({
  roll,
  pitch,
  label,
}: {
  roll: number;
  pitch: number;
  label: string;
}) {
  const points = [
    [-140, -48, -8],
    [140, -48, -8],
    [140, 48, -8],
    [-140, 48, -8],
    [-140, -48, 8],
    [140, -48, 8],
    [140, 48, 8],
    [-140, 48, 8],
  ];
  const r = (roll * Math.PI) / 180,
    p = (pitch * Math.PI) / 180;
  const projected = points.map(([x, y, z]) => {
    const xx = x * Math.cos(p) + z * Math.sin(p),
      zz = -x * Math.sin(p) + z * Math.cos(p);
    const yy = y * Math.cos(r) - zz * Math.sin(r),
      z2 = y * Math.sin(r) + zz * Math.cos(r);
    const u = xx * Math.cos(-0.25) - yy * Math.sin(-0.25),
      v = xx * Math.sin(-0.25) + yy * Math.cos(-0.25);
    return [200 + u, 125 - v * 0.65 - z2 * 0.65, z2 - v * 0.3];
  });
  const faces = [
    [0, 1, 2, 3],
    [0, 1, 5, 4],
    [1, 2, 6, 5],
    [2, 3, 7, 6],
    [3, 0, 4, 7],
    [4, 5, 6, 7],
  ]
    .map((ids, i) => ({
      ids,
      i,
      depth: ids.reduce((sum, j) => sum + projected[j][2], 0) / 4,
    }))
    .sort((a, b) => a.depth - b.depth);
  return (
    <svg viewBox="0 0 400 250" role="img" aria-label={label} className="w-full">
      <path d="M25 220H375M200 10V235" stroke="currentColor" opacity=".12" />
      {faces.map(({ ids, i }) => (
        <polygon
          key={i}
          points={ids.map((j) => projected[j].slice(0, 2).join(",")).join(" ")}
          fill={i === 5 ? "#c4d6ee" : i === 1 ? "#ea9659" : "#8195ad"}
          stroke="#37485c"
          strokeWidth="1.5"
        />
      ))}
      <text
        x="200"
        y="235"
        textAnchor="middle"
        fontSize="12"
        fill="currentColor"
      >
        {label}
      </text>
    </svg>
  );
}
