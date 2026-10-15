import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Activity } from "lucide-react";

import { ConnectionContext } from "../../rpc/ConnectionContext";
import { useSub } from "../../usePubSub";
import {
  Orientation,
  getMotionBackend,
  type MotionCapabilities,
  type MotionLiveState,
} from "../../motion/motionRpc";
import { Field, Notice, StepPane, StepTitle } from "../FactoryChrome";
import { secondaryBtn } from "../buttons";
import type { StepProps } from "./stepProps";

/*
 * Step 5 — is the accelerometer alive and wired into the keymap?
 *
 * `motion.setLiveStream` gives roughly 10 Hz of decoded state (peak magnitude,
 * orientation, tap and carry flags), which is enough to judge the sensor without
 * anyone reading a register: a build with no IMU never registers the subsystem,
 * a sensor that is present but unpowered reports nothing at all, and a working
 * one responds to being picked up.
 *
 * The judgement is automatic; the pickup is not. Three separate signals can each
 * carry the pass (a shake, a change of orientation, a detected tap) so a board
 * that is merely moved off its feet still passes, and an operator does not have
 * to learn a specific gesture.
 *
 * Firmware without the subsystem reports `skip`, never `pass` — "this build has
 * no IMU" and "the IMU works" must not look the same in the log.
 */
const BASELINE_MS = 1500;
const INTERACT_MS = 60000;

interface Stats {
  samples: number;
  maxMagnitude: number;
  orientations: Set<number>;
  taps: number;
  lastClickSrc: number;
}

function emptyStats(): Stats {
  return { samples: 0, maxMagnitude: 0, orientations: new Set(), taps: 0, lastClickSrc: 0 };
}

export function ImuStep(props: StepProps) {
  const { th, t, config } = props;
  const { conn } = useContext(ConnectionContext);
  const backend = useMemo(() => getMotionBackend(conn), [conn]);

  const [caps, setCaps] = useState<MotionCapabilities | null>(null);
  const [phase, setPhase] = useState<"probing" | "unsupported" | "baseline" | "interact">("probing");
  const [live, setLive] = useState<MotionLiveState | undefined>();
  const [stats, setStats] = useState<Stats>(emptyStats);
  const [generation, setGeneration] = useState(0);

  const settled = useRef(false);
  const statsRef = useRef<Stats>(emptyStats());
  const phaseRef = useRef(phase);
  const onDoneRef = useRef(props.onDone);

  useEffect(() => {
    onDoneRef.current = props.onDone;
  }, [props.onDone]);

  useSub("rpc_notification.motion.liveState", (state: MotionLiveState) => setLive(state));

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    if (!backend || settled.current) return;
    let stop = false;
    let unsubscribe: (() => void) | undefined;
    settled.current = true;

    (async () => {
      const found = await backend.getCapabilities().catch(() => null);
      if (stop) return;
      if (!found) {
        setPhase("unsupported");
        return;
      }
      setCaps(found);

      // Demo backends hand live state over a callback; the RPC one pushes
      // notifications. Subscribing to both is what the Motion view does too.
      if (backend.subscribeLive) unsubscribe = backend.subscribeLive(setLive);
      await backend.setLiveStream(true).catch(() => {});
      if (stop) return;

      statsRef.current = emptyStats();
      setStats(statsRef.current);
      setPhase("baseline");
      await sleep(BASELINE_MS);
      if (stop) return;
      if (statsRef.current.samples === 0) {
        onDoneRef.current({
          status: "fail",
          detail: t("factory.imu.noData", "开启实时流后没有收到任何数据"),
        });
        return;
      }
      setPhase("interact");
    })();

    return () => {
      stop = true;
      unsubscribe?.();
      backend.setLiveStream(false).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend, generation]);

  // Fold each sample into the running stats and decide as soon as any of the
  // three signals is strong enough.
  useEffect(() => {
    if (!live) return;
    const next = statsRef.current;
    next.samples += 1;
    next.maxMagnitude = Math.max(next.maxMagnitude, live.magnitude ?? 0);
    // `ORIENTATION_UNKNOWN` is proto3's zero and so is absent from the generated
    // union, but it is still what a sleeping sensor decodes to.
    if (live.orientation !== undefined && Number(live.orientation) !== Orientation.ORIENTATION_UNKNOWN) {
      next.orientations.add(live.orientation);
    }
    if (live.tapDetected) next.taps += 1;
    if (live.lastClickSrc) next.lastClickSrc = live.lastClickSrc;
    setStats({ ...next, orientations: new Set(next.orientations) });

    if (phaseRef.current !== "interact") return;
    const shaken = next.maxMagnitude >= config.imuMagnitude;
    const reoriented = next.orientations.size >= 2;
    const tapped = next.taps > 0;
    if (!shaken && !reoriented && !tapped) return;

    onDoneRef.current({
      status: "pass",
      detail: shakeDetail(next, config.imuMagnitude),
      data: {
        maxMagnitude: next.maxMagnitude,
        orientations: Array.from(next.orientations),
        taps: next.taps,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  // Nothing moved for a minute is a failure, not a hung tool.
  useEffect(() => {
    if (phase !== "interact") return;
    const timer = window.setTimeout(() => {
      onDoneRef.current({
        status: "fail",
        detail: t("factory.imu.timeout", "60 秒内没有检测到任何动作"),
      });
    }, INTERACT_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, generation]);

  return (
    <StepPane>
      <StepTitle
        th={th}
        title={t("factory.imu.title", "IMU 动作检测")}
        subtitle={t(
          "factory.imu.subtitle",
          "把键盘拿起来倾斜一下，再轻敲两下桌面。检测到动作即通过，不需要固定手法。"
        )}
      />

      {phase === "probing" && (
        <Notice th={th} kind="info">
          {t("factory.imu.probing", "正在探测 IMU 子系统…")}
        </Notice>
      )}

      {phase === "unsupported" && (
        <>
          <Notice th={th} kind="warning">
            {t(
              "factory.imu.unsupported",
              "这台固件没有提供 motion 子系统，无法检测 IMU。本项记为「跳过」，不计为通过。"
            )}
          </Notice>
          <div style={{ display: "flex", gap: 12 }}>
            <button
              style={secondaryBtn(th)}
              onClick={() =>
                onDoneRef.current({
                  status: "skip",
                  detail: t("factory.imu.unsupportedDetail", "固件未提供 motion 子系统"),
                })
              }
            >
              {t("factory.imu.continue", "记为跳过并继续")}
            </button>
          </div>
        </>
      )}

      {(phase === "baseline" || phase === "interact") && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Activity size={18} style={{ color: phase === "interact" ? th.success : th.textHelper }} />
            <span style={{ fontSize: 15, color: th.textPrimary }}>
              {phase === "interact"
                ? t("factory.imu.go", "请拿起键盘并倾斜 / 轻敲")
                : t("factory.imu.baselining", "读取基线中…")}
            </span>
          </div>

          <div>
            <Field th={th} label={t("factory.imu.sensor", "传感器")} value={caps?.sensor || "—"} mono />
            <Field th={th} label={t("factory.imu.samples", "采样数")} value={String(stats.samples)} mono />
            <Field
              th={th}
              label={t("factory.imu.peak", "峰值")}
              value={`${stats.maxMagnitude} / ${config.imuMagnitude}`}
              mono
            />
            <Field
              th={th}
              label={t("factory.imu.orientation", "朝向")}
              value={orientationLabel(stats.orientations)}
            />
            <Field th={th} label={t("factory.imu.taps", "敲击")} value={String(stats.taps)} mono />
          </div>

          <Notice th={th} kind="info">
            {t(
              "factory.imu.criteria",
              "三个条件满足任意一个即通过：峰值超过阈值、朝向发生变化、检测到敲击。"
            )}
          </Notice>

          <div style={{ display: "flex", gap: 12 }}>
            <button
              style={secondaryBtn(th)}
              onClick={() => {
                settled.current = false;
                statsRef.current = emptyStats();
                setPhase("probing");
                setGeneration((n) => n + 1);
              }}
            >
              {t("factory.imu.restart", "重新检测")}
            </button>
            <button
              style={secondaryBtn(th)}
              onClick={() =>
                onDoneRef.current({
                  status: "fail",
                  detail: t("factory.imu.manualFail", "人工判定 IMU 异常"),
                })
              }
            >
              {t("factory.imu.manualFail", "标记失败")}
            </button>
          </div>
        </>
      )}
    </StepPane>
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function orientationLabel(seen: Set<number>): string {
  if (seen.size === 0) return "—";
  const names: Record<number, string> = {
    [Orientation.ORIENTATION_FLAT_UP]: "平放",
    [Orientation.ORIENTATION_FLAT_DOWN]: "翻转",
    [Orientation.ORIENTATION_TILTED]: "倾斜",
  };
  return Array.from(seen)
    .map((o) => names[o] ?? String(o))
    .join(" / ");
}

function shakeDetail(stats: Stats, threshold: number): string {
  const parts: string[] = [];
  if (stats.maxMagnitude >= threshold) parts.push(`峰值 ${stats.maxMagnitude}`);
  if (stats.orientations.size >= 2) parts.push(`朝向变化 ${stats.orientations.size} 种`);
  if (stats.taps > 0) parts.push(`敲击 ${stats.taps} 次`);
  return parts.length ? `检测到动作（${parts.join("，")}）` : "检测到动作";
}
