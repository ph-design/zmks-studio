import { useContext, useEffect, useRef, useState } from "react";
import { Lock, LockOpen } from "lucide-react";

import { LockState } from "@zmkfirmware/zmk-studio-ts-client/core";
import { call_rpc } from "../../rpc/logging";
import { ConnectionContext } from "../../rpc/ConnectionContext";
import { GestureChips } from "../../unlock/GestureChips";
import { FACTORY_UNLOCK_KEYS } from "../../unlock/unlockPaths";
import { Notice, StepPane, StepTitle } from "../FactoryChrome";
import type { StepProps } from "./stepProps";

/*
 * Step 3 — unlock the keyboard.
 *
 * The shipping firmware is locked, and there is deliberately no unlock RPC:
 * unlocking has to be a physical action so a hostile host cannot do it. Studio
 * therefore cannot pass this step for the operator, it can only watch for it.
 *
 * That is still enough to automate the *detection*: `core.getLockState` is
 * readable while locked, so polling it turns "did the operator unlock it?" into
 * a boolean. Nothing here needs to know the operator's chord — the shipped
 * default is shown as a hint, and a bench with a custom gesture just works.
 */
const POLL_MS = 700;

export function UnlockStep(props: StepProps) {
  const { th, t } = props;
  const { conn } = useContext(ConnectionContext);
  const [state, setState] = useState<LockState | undefined>();
  const settled = useRef(false);

  const onDoneRef = useRef(props.onDone);
  useEffect(() => {
    onDoneRef.current = props.onDone;
  }, [props.onDone]);

  useEffect(() => {
    if (!conn) return;
    let stop = false;
    let timer: number | undefined;
    settled.current = false;

    const poll = async () => {
      if (stop) return;
      const resp = await call_rpc(conn, { core: { getLockState: true } });
      const next = resp.core?.getLockState;
      if (stop) return;
      setState(next);
      if (next === LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED) {
        if (!settled.current) {
          settled.current = true;
          onDoneRef.current({ status: "pass", detail: t("factory.unlock.unlocked", "已解锁") });
        }
        return;
      }
      timer = window.setTimeout(poll, POLL_MS);
    };
    poll();

    return () => {
      stop = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conn]);

  const unlocked = state === LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED;

  return (
    <StepPane>
      <StepTitle
        th={th}
        title={t("factory.unlock.title", "解锁键盘")}
        subtitle={t(
          "factory.unlock.subtitle",
          "出厂固件是锁定状态，Studio 读不到键位表。请按下解锁组合键，工具会自动检测到。"
        )}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "18px 0" }}>
        {unlocked ? (
          <LockOpen size={26} style={{ color: th.success }} />
        ) : (
          <Lock size={26} style={{ color: th.warning }} />
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 16, color: th.textPrimary }}>
          <span>{t("factory.unlock.press", "请按下")}</span>
          <GestureChips keys={FACTORY_UNLOCK_KEYS} />
        </div>
      </div>

      <Notice th={th} kind={conn ? "info" : "warning"}>
        {conn
          ? t(
              "factory.unlock.hint",
              "上面是固件出厂默认手势。如果这台机器改过解锁组合，按你们自己的即可 —— 工具只关心锁状态。"
            )
          : t("factory.unlock.noConn", "还没有连接上键盘，请回到上一步。")}
      </Notice>
    </StepPane>
  );
}
