import { useContext, useEffect, useRef, useState } from "react";
import { Lock, LockOpen } from "lucide-react";

import { LockState } from "@zmkfirmware/zmk-studio-ts-client/core";
import { call_rpc } from "../../rpc/logging";
import { ConnectionContext } from "../../rpc/ConnectionContext";
import { Field, Notice, StepPane, StepTitle } from "../FactoryChrome";
import type { StepId, StepResult } from "../factoryTypes";
import type { StepProps } from "./stepProps";

/*
 * Step 7 — put the bench back the way the customer will receive it.
 *
 * Two things a unit must not leave with: the scan's temporary layer, and an
 * unlocked Studio. `discardChanges` covers the first (and a power cycle would
 * have reverted it anyway, since nothing was ever saved); `core.lock` covers the
 * second. The lock is then read back rather than assumed — a lock request that
 * was accepted but never applied is exactly the sort of thing a bench should
 * catch instead of trusting.
 */

export interface FinishStepProps extends StepProps {
  results: Partial<Record<StepId, StepResult>>;
}

export function FinishStep(props: FinishStepProps) {
  const { th, t, results, record } = props;
  const { conn } = useContext(ConnectionContext);

  const [lines, setLines] = useState<string[]>([]);
  const [locked, setLocked] = useState<boolean>();
  const started = useRef(false);
  const onDoneRef = useRef(props.onDone);

  useEffect(() => {
    onDoneRef.current = props.onDone;
  }, [props.onDone]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    (async () => {
      const log: string[] = [];
      let lockOk: boolean | undefined;

      if (!conn) {
        log.push(t("factory.finish.noConn", "没有连接，跳过收尾动作"));
      } else {
        const discarded = await call_rpc(conn, { keymap: { discardChanges: true } });
        log.push(
          discarded.keymap?.discardChanges
            ? t("factory.finish.discarded", "已丢弃测试键表改动")
            : t("factory.finish.discardFailed", "丢弃改动失败（设备可能已断开）")
        );

        /*
         * Lock, then read it back — and report *what the firmware said* rather
         * than only that it failed. A bare "锁定未生效" gives whoever picks this
         * up nothing to work with, and the two candidates (the request was
         * refused, or the state never changed) are entirely different bugs.
         */
        // `core.lock` is fire-and-forget: the request has no response field in the
        // proto, so the only feedback is the state that follows it.
        await call_rpc(conn, { core: { lock: true } });
        let observed = (await call_rpc(conn, { core: { getLockState: true } })).core?.getLockState;
        if (observed !== LockState.ZMK_STUDIO_CORE_LOCK_STATE_LOCKED) {
          // Give it a moment: the unlock gesture path is asynchronous firmware-side,
          // so a lock that reports stale state is worth one more look.
          await new Promise((resolve) => window.setTimeout(resolve, 600));
          observed = (await call_rpc(conn, { core: { getLockState: true } })).core?.getLockState;
        }
        lockOk = observed === LockState.ZMK_STUDIO_CORE_LOCK_STATE_LOCKED;
        log.push(
          lockOk
            ? t("factory.finish.locked", "已恢复锁定状态")
            : `${t("factory.finish.lockFailed", "锁定未生效")} (getLockState=${observed ?? "无响应"})`
        );
      }

      setLines(log);
      setLocked(lockOk);
      onDoneRef.current({
        status: lockOk === false ? "fail" : "pass",
        detail: log.join("；"),
        data: { device: record.device, serial: record.serial },
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conn]);

  return (
    <StepPane>
      <StepTitle
        th={th}
        title={t("factory.finish.title", "收尾与汇总")}
        subtitle={t(
          "factory.finish.subtitle",
          "测试改动从不写入 flash，这里只做丢弃与重新锁定，确保出厂状态与用户收到的一致。"
        )}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {locked === false ? (
          <LockOpen size={22} style={{ color: th.error }} />
        ) : (
          <Lock size={22} style={{ color: locked ? th.success : th.textHelper }} />
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {lines.length === 0 && (
            <span style={{ fontSize: 14, color: th.textHelper }}>
              {t("factory.finish.running", "正在收尾…")}
            </span>
          )}
          {lines.map((line) => (
            <span key={line} style={{ fontSize: 14, color: th.textPrimary }}>
              {line}
            </span>
          ))}
        </div>
      </div>

      <div>
        <Field th={th} label="Device" value={record.device || "—"} />
        <Field th={th} label="Serial" value={record.serial || "—"} mono />
        <Field
          th={th}
          label={t("factory.finish.firmware", "固件")}
          value={record.firmware?.name || "—"}
          mono
        />
      </div>

      <Notice
        th={th}
        kind={Object.values(results).some((r) => r?.status === "fail") ? "error" : "info"}
      >
        {t(
          "factory.finish.note",
          "日志已写入本机记录。拔线装箱即可；若本台判定失败，请贴不良标签并交给维修。"
        )}
      </Notice>
    </StepPane>
  );
}
