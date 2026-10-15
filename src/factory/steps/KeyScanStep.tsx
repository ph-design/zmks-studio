import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";

import {
  SetLayerBindingResponse,
  type BehaviorBinding,
  type KeyPhysicalAttrs,
} from "@zmkfirmware/zmk-studio-ts-client/keymap";
import type { RpcConnection } from "@zmkfirmware/zmk-studio-ts-client";

import { call_rpc } from "../../rpc/logging";
import { ConnectionContext } from "../../rpc/ConnectionContext";
import { PhysicalLayout, type KeyPosition } from "../../keyboard/PhysicalLayout";
import { Notice, ProgressBar, StepPane, StepTitle } from "../FactoryChrome";
import { primaryBtn, secondaryBtn } from "../buttons";
import { TEST_CODES, planGroups, testUsage } from "../testCodes";
import { useHostKeys } from "../useHostKeys";
import type { StepProps } from "./stepProps";

/*
 * Step 4 — prove every key position actually fires.
 *
 * The bench runs a squeegee across the board, which decides how this works:
 *
 *  - **Positions are covered in sweeps, not one at a time.** A sweep lights every
 *    key in one motion, so a pass holds as many positions live as the code pool
 *    allows (55 — see `testCodes.ts` for why the pool stops at Shift), and the
 *    board fills in green as the squeegee crosses it. A bigger board takes another
 *    sweep, reusing the same pool.
 *  - **Progress is the pass/fail display.** Nobody reads instructions mid-sweep,
 *    so the goal has to be visible from a metre away: green means seen, and the
 *    run passes by itself when the last position turns green.
 *  - **Silence has to be diagnosed, not waited on.** "Nothing arrived" has three
 *    completely different causes: the window lost focus, the keyboard's output is
 *    on Bluetooth, or the temporary keymap never took effect. A tool that merely
 *    waits cannot tell them apart — the first version hung for two and a half
 *    minutes and then blamed all 62 keys. So:
 *
 *      1. the scan opens with a *pre-check* that needs no rewrite at all — press
 *         a few keys, see characters appear — which proves the host path before
 *         anything is written;
 *      2. the first pass is read back and compared against what was written, so a
 *         refused write is caught in two seconds instead of being blamed on the
 *         operator;
 *      3. a sweep that produces nothing for `noInputMs` stops the scan and says
 *         which of the two it is, with the checklist to fix it.
 *
 * There is no position-level press notification anywhere in the protocol, so the
 * attribution is manufactured: each position under test is bound to a keystroke
 * of its own and the scan watches which keystrokes arrive at the host. A key that
 * is not soldered, not seated, or not scanned never sends its code, and because
 * each position in a sweep owns a distinct code, a neighbouring key cannot pass
 * for it.
 *
 * The test layer is never saved: `discardChanges` puts the device back on the
 * keymap in its flash, and a power cut mid-scan reverts on its own.
 */

type Phase = "loading" | "clearing" | "scanning" | "restoring" | "stopped" | "error";
type Precheck = "waiting" | "ok" | "skipped" | "timeout";

export interface KeyScanStepProps extends StepProps {
  /** Remounts the step; the scan is a run-to-completion job, not a resumable one. */
  onRetry: () => void;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function setBinding(
  conn: RpcConnection,
  layerId: number,
  keyPosition: number,
  binding: BehaviorBinding
): Promise<void> {
  const resp = await call_rpc(conn, { keymap: { setLayerBinding: { layerId, keyPosition, binding } } });
  if (resp.keymap?.setLayerBinding !== SetLayerBindingResponse.SET_LAYER_BINDING_RESP_OK) {
    throw new Error("写入键位失败（键盘可能又被锁上了）");
  }
}

/** Behavior ids are per-build locals, so they are looked up by display name. */
async function resolveBehaviorIds(
  conn: RpcConnection
): Promise<{ none?: number; keyPress?: number }> {
  const list = await call_rpc(conn, { behaviors: { listAllBehaviors: true } });
  const ids = list.behaviors?.listAllBehaviors?.behaviors ?? [];
  let none: number | undefined;
  let keyPress: number | undefined;
  for (const id of ids) {
    const resp = await call_rpc(conn, { behaviors: { getBehaviorDetails: { behaviorId: id } } });
    const details = resp.behaviors?.getBehaviorDetails;
    if (!details) continue;
    if (details.displayName === "None") none = details.id;
    if (details.displayName === "Key Press") keyPress = details.id;
    if (none !== undefined && keyPress !== undefined) break;
  }
  return { none, keyPress };
}

export function KeyScanStep(props: KeyScanStepProps) {
  const { th, t, config, onRetry } = props;
  const { conn } = useContext(ConnectionContext);

  const [precheck, setPrecheck] = useState<Precheck>("waiting");
  const [typed, setTyped] = useState("");
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string>();
  const [keys, setKeys] = useState<KeyPhysicalAttrs[]>([]);
  const [groups, setGroups] = useState<number[][]>([]);
  const [groupIndex, setGroupIndex] = useState(0);
  const [seen, setSeen] = useState<number[]>([]);
  const [armed, setArmed] = useState(false);
  const [lastCode, setLastCode] = useState<string>();
  const [received, setReceived] = useState(0);
  const [stallLeft, setStallLeft] = useState(0);
  const [unmatched, setUnmatched] = useState<string>();
  const [stopped, setStopped] = useState<"noInput" | "stall">();

  const seenRef = useRef<Set<number>>(new Set());
  const armedRef = useRef(false);
  const doneRef = useRef(false);
  const skipRef = useRef(false);
  const codeMapRef = useRef<Map<string, number>>(new Map());
  const heldRef = useRef<Set<string>>(new Set());
  const startedRef = useRef(false);
  // The scan runs once, so anything it needs at the end has to come from a ref
  // rather than from state captured when the effect started.
  const noInputRef = useRef(false);
  const stalledRef = useRef(false);
  const judgedManuallyRef = useRef(false);
  const lastProgressRef = useRef(Date.now());
  const receivedRef = useRef(0);

  const onDoneRef = useRef(props.onDone);
  useEffect(() => {
    onDoneRef.current = props.onDone;
  }, [props.onDone]);

  useEffect(() => {
    return () => {
      doneRef.current = true;
    };
  }, []);

  const onHostDown = useCallback((code: string) => {
    receivedRef.current += 1;
    setReceived(receivedRef.current);
    setLastCode(code);
    // A held key reports keydown over and over; only the first one is a press.
    if (heldRef.current.has(code)) return;
    heldRef.current.add(code);
    if (!armedRef.current) return;
    const position = codeMapRef.current.get(code);
    /*
     * A keystroke that belongs to no position in this sweep is worth saying out
     * loud. The usual cause is the bench PC's own keyboard — the operator typing
     * or clicking Enter — and "nothing turned green" with no explanation is how a
     * working board gets blamed for it.
     */
    if (position === undefined) {
      setUnmatched(code);
      return;
    }
    if (seenRef.current.has(position)) return;
    seenRef.current.add(position);
    lastProgressRef.current = Date.now();
    setUnmatched(undefined);
    setSeen(Array.from(seenRef.current));
  }, []);

  const onHostUp = useCallback((code: string) => {
    heldRef.current.delete(code);
  }, []);

  // The pre-check deliberately does not swallow anything: the keystrokes have to
  // reach the textarea, because reaching it is the whole test.
  const listening = phase === "clearing" || phase === "scanning" || phase === "restoring";
  useHostKeys(listening, onHostDown, onHostUp);

  const currentGroup = useMemo(() => groups[groupIndex] ?? [], [groups, groupIndex]);

  // Pre-check: a plain textarea, focused on entry. Autofocus does double duty —
  // it also settles the focus question, since a window that is not focused is the
  // most common reason nothing arrives.
  useEffect(() => {
    if (precheck !== "waiting") return;
    const timer = window.setTimeout(() => setPrecheck("timeout"), config.precheckMs);
    return () => window.clearTimeout(timer);
  }, [precheck, config.precheckMs]);

  const proofOfInput = useCallback(() => {
    setPrecheck((prev) => (prev === "waiting" ? "ok" : prev));
  }, []);

  const waitForGroup = useCallback(
    (group: number[], noInputWatchdogMs: number) => {
      return new Promise<void>((resolve) => {
        const armedAt = Date.now();
        const check = () => {
          if (doneRef.current) return resolve();
          if (skipRef.current) {
            skipRef.current = false;
            return resolve();
          }
          if (group.every((p) => seenRef.current.has(p))) return resolve();
          if (
            noInputWatchdogMs > 0 &&
            receivedRef.current === 0 &&
            Date.now() - armedAt > noInputWatchdogMs
          ) {
            noInputRef.current = true;
            return resolve();
          }
          window.setTimeout(check, 120);
        };
        check();
      });
    },
    []
  );

  useEffect(() => {
    if (precheck !== "ok" && precheck !== "skipped") return;
    if (!conn || startedRef.current) return;
    startedRef.current = true;

    (async () => {
      try {
        setPhase("loading");
        const [layoutsResp, keymapResp] = await Promise.all([
          call_rpc(conn, { keymap: { getPhysicalLayouts: true } }),
          call_rpc(conn, { keymap: { getKeymap: true } }),
        ]);

        const layouts = layoutsResp.keymap?.getPhysicalLayouts;
        const keymap = keymapResp.keymap?.getKeymap;
        if (!layouts || !keymap) {
          throw new Error(t("factory.keys.noKeymap", "读不到键位表（键盘可能已经重新锁上）"));
        }

        const attrs = layouts.layouts[layouts.activeLayoutIndex ?? 0]?.keys ?? [];
        const layer = keymap.layers[0];
        if (!layer || attrs.length === 0) {
          throw new Error(t("factory.keys.noLayout", "固件没有报告物理布局"));
        }

        // A position with no binding in layer 0 cannot be written to, so the
        // shorter of the two lists is what actually gets tested.
        const count = Math.min(attrs.length, layer.bindings.length);
        setKeys(attrs.slice(0, count));

        const ids = await resolveBehaviorIds(conn);
        if (ids.none === undefined || ids.keyPress === undefined) {
          throw new Error(t("factory.keys.noBehaviors", "固件缺少 Key Press / None 行为"));
        }

        setPhase("clearing");
        for (let p = 0; p < count; p++) {
          await setBinding(conn, 0, p, { behaviorId: ids.none, param1: 0, param2: 0 });
        }

        const planned = planGroups(count, config.groupSize);
        setGroups(planned);
        setPhase("scanning");

        for (let g = 0; g < planned.length; g++) {
          if (doneRef.current) break;
          setGroupIndex(g);
          const group = planned[g];
          const map = new Map<string, number>();
          for (let i = 0; i < group.length; i++) {
            const code = TEST_CODES[i];
            map.set(code.code, group[i]);
            await setBinding(conn, 0, group[i], {
              behaviorId: ids.keyPress,
              param1: testUsage(code),
              param2: 0,
            });
          }
          codeMapRef.current = map;

          // Read the first pass back before trusting it. Without this, a firmware
          // that accepts the write and drops it looks identical to every key being
          // dead — which is exactly the wrong thing to report to a bench.
          if (g === 0) {
            const check = await call_rpc(conn, { keymap: { getKeymap: true } });
            const stored = check.keymap?.getKeymap?.layers[0]?.bindings[group[0]];
            const expected = { behaviorId: ids.keyPress, param1: testUsage(TEST_CODES[0]), param2: 0 };
            if (
              !stored ||
              stored.behaviorId !== expected.behaviorId ||
              stored.param1 !== expected.param1
            ) {
              throw new Error(
                t(
                  "factory.keys.readbackMismatch",
                  "固件回读的键位和写入的不一致，测试键表没有生效 —— 这一项需要固件侧确认。"
                )
              );
            }
          }

          // Ignore whatever the squeegee is still holding from the previous
          // sweep: a key left down must not be allowed to satisfy this one.
          await sleep(config.settleMs);
          armedRef.current = true;
          setArmed(true);
          await waitForGroup(group, g === 0 ? config.noInputMs : 0);
          armedRef.current = false;
          setArmed(false);

          if (noInputRef.current) break;

          for (const p of group) {
            await setBinding(conn, 0, p, { behaviorId: ids.none, param1: 0, param2: 0 });
          }
        }

        setPhase("restoring");
        await call_rpc(conn, { keymap: { discardChanges: true } });

        if (noInputRef.current) {
          // Not a verdict: nothing was measured. The board may be perfectly fine,
          // so the run stops here and the operator gets the checklist instead of a
          // FAIL they would have to argue with.
          setPhase("stopped");
          setStopped("noInput");
          return;
        }

        const missing: number[] = [];
        for (let p = 0; p < count; p++) {
          if (!seenRef.current.has(p)) missing.push(p);
        }

        /*
         * A sweep that timed out without a single position answering is not a
         * verdict either — it is the same "we could not measure this" situation
         * as no input at all, and it is the one an operator hits while working
         * out how the tool behaves. A *partial* sweep does judge, because
         * positions that answered and positions that did not, on one board, is
         * exactly what a real fault looks like.
         */
        if (stalledRef.current && seenRef.current.size === 0 && !judgedManuallyRef.current) {
          setPhase("stopped");
          setStopped("stall");
          return;
        }

        if (missing.length === 0) {
          // Hold the all-green board on screen for a beat: the operator is looking
          // at the keyboard, not at the pane, and the pass is supposed to be
          // something they see rather than something they are told.
          await sleep(900);
          onDoneRef.current({
            status: "pass",
            detail: `${count} ${t("factory.keys.allPass", "个键位全部有响应")}`,
            data: { count },
          });
        } else if (seenRef.current.size === 0) {
          onDoneRef.current({
            status: "fail",
            detail: t("factory.keys.noneSeen", "一个键位都没有响应，无法判定"),
            data: { count, missing: missing.length },
          });
        } else {
          onDoneRef.current({
            status: "fail",
            detail: `${missing.length} ${t("factory.keys.missing", "个键位无响应")}: ${missing.join(", ")}`,
            data: { count, missing, stalled: stalledRef.current },
          });
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setPhase("error");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [precheck, conn]);

  /*
   * Stall watchdog: idle time since the last *new* position, not total elapsed
   * time. Two things depend on that distinction — a bench hand who pauses to look
   * at the screen must not be cut off, and a genuinely dead key must still end the
   * sweep instead of holding the line up forever.
   */
  useEffect(() => {
    if (phase !== "scanning") return;
    lastProgressRef.current = Date.now();
    setStallLeft(Math.round(config.stallTimeoutMs / 1000));
    const ticker = window.setInterval(() => {
      const idle = Date.now() - lastProgressRef.current;
      setStallLeft(Math.max(0, Math.round((config.stallTimeoutMs - idle) / 1000)));
      if (idle >= config.stallTimeoutMs) {
        stalledRef.current = true;
        doneRef.current = true;
        skipRef.current = true;
      }
    }, 500);
    return () => window.clearInterval(ticker);
  }, [phase, config.stallTimeoutMs]);

  const seenSet = useMemo(() => new Set(seen), [seen]);
  const currentSet = useMemo(() => new Set(currentGroup), [currentGroup]);

  const positions: KeyPosition[] = useMemo(
    () =>
      keys.map((attrs, i) => {
        const isSeen = seenSet.has(i);
        const isCurrent = currentSet.has(i);
        return {
          id: String(i),
          width: attrs.width,
          height: attrs.height,
          x: attrs.x,
          y: attrs.y,
          r: attrs.r,
          rx: attrs.rx,
          ry: attrs.ry,
          // Green persists once a position has been seen — the sweep moves on, and
          // the board has to read as "all green" at a glance. Only positions no
          // sweep has reached yet stay grey.
          dimmed: !isCurrent && !isSeen,
          pressed: armed && isCurrent && !isSeen,
          children: isSeen ? (
            <span
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: `${th.success}55`,
                pointerEvents: "none",
              }}
            >
              <Check size={16} strokeWidth={3} style={{ color: th.success }} />
            </span>
          ) : undefined,
        };
      }),
    [keys, currentSet, armed, seenSet, th.success]
  );

  const fitRef = useRef<HTMLDivElement>(null);
  const remaining = keys.length - seen.length;

  if (precheck === "waiting" || precheck === "timeout") {
    return (
      <StepPane>
        <StepTitle
          th={th}
          title={t("factory.keys.title", "全键扫描")}
          subtitle={t(
            "factory.keys.precheckSubtitle",
            "先确认这台电脑能收到键盘的按键。用刮板在键盘上刮一小段，或随便按几个键。"
          )}
        />

        <textarea
          autoFocus
          value={typed}
          onChange={(e) => {
            setTyped(e.target.value);
            proofOfInput();
          }}
          onKeyDown={proofOfInput}
          placeholder={t("factory.keys.precheckPlaceholder", "在这里会看到键盘打出的字…")}
          style={{
            height: 90,
            padding: 12,
            fontSize: 15,
            fontFamily: "var(--font-mono)",
            background: th.fieldBg,
            color: th.textPrimary,
            border: `1px solid ${precheck === "timeout" ? th.error : th.border}`,
            outline: "none",
            resize: "none",
          }}
        />

        {precheck === "timeout" && <Checklist th={th} t={t} />}

        {precheck === "timeout" && (
          <div style={{ display: "flex", gap: 12 }}>
            <button
              style={primaryBtn(th)}
              onClick={() => {
                setTyped("");
                setPrecheck("waiting");
              }}
            >
              {t("factory.keys.retryPrecheck", "重新自检")}
            </button>
            <button style={secondaryBtn(th)} onClick={() => setPrecheck("skipped")}>
              {t("factory.keys.skipPrecheck", "跳过自检，直接扫描")}
            </button>
          </div>
        )}
      </StepPane>
    );
  }

  return (
    <StepPane>
      <StepTitle
        th={th}
        title={t("factory.keys.title", "全键扫描")}
        subtitle={t(
          "factory.keys.subtitle",
          "用刮板从左到右刮过整个键盘，把每个键都压到。压到的键会变绿，全部变绿即通过 —— 不需要点任何按钮。"
        )}
      />

      {phase === "loading" && (
        <Notice th={th} kind="info">
          {t("factory.keys.loading", "正在读取物理布局与键位表…")}
        </Notice>
      )}
      {phase === "clearing" && (
        <Notice th={th} kind="info">
          {t("factory.keys.clearing", "正在写入测试键表…")}
        </Notice>
      )}
      {phase === "restoring" && (
        <Notice th={th} kind="info">
          {t("factory.keys.restoring", "正在丢弃测试键表，恢复出厂键位…")}
        </Notice>
      )}

      {error && (
        <Notice th={th} kind="error">
          {error}
        </Notice>
      )}

      {stopped === "noInput" && (
        <>
          <Notice th={th} kind="warning">
            {precheck === "skipped"
              ? t(
                  "factory.keys.noInputSkipped",
                  "扫描期间一个按键都没收到。刚才跳过了自检，所以先确认这台电脑能收到键盘输入。"
                )
              : t(
                  "factory.keys.noInputAfterOk",
                  "自检能收到按键，但换成测试键表之后一个都没收到 —— 说明测试键表没有真正生效，而不是键盘坏了。请把这一条反馈给固件侧。"
                )}
          </Notice>
          <Checklist th={th} t={t} />
          <div style={{ display: "flex", gap: 12 }}>
            <button style={primaryBtn(th)} onClick={onRetry}>
              {t("factory.keys.retryScan", "重新扫描")}
            </button>
            <button
              style={secondaryBtn(th)}
              onClick={() =>
                onDoneRef.current({
                  status: "fail",
                  detail: t("factory.keys.noInputFail", "一个按键都没收到，无法判定"),
                })
              }
            >
              {t("factory.keys.markFail", "记录为失败并继续")}
            </button>
          </div>
        </>
      )}

      {stopped === "stall" && (
        <>
          <Notice th={th} kind="warning">
            {`${Math.round(config.stallTimeoutMs / 1000)} ${t(
              "factory.keys.stallDetail",
              "秒内没有新的键位响应，而且一个键都没压到。先确认刮板确实压到了键面，再重试一次。"
            )}`}
          </Notice>
          <Checklist th={th} t={t} />
          <div style={{ display: "flex", gap: 12 }}>
            <button style={primaryBtn(th)} onClick={onRetry}>
              {t("factory.keys.retryScan", "重新扫描")}
            </button>
            <button
              style={secondaryBtn(th)}
              onClick={() =>
                onDoneRef.current({
                  status: "fail",
                  detail: t("factory.keys.noneSeen", "一个键位都没有响应，无法判定"),
                })
              }
            >
              {t("factory.keys.markFail", "记录为失败并继续")}
            </button>
          </div>
        </>
      )}

      {phase === "scanning" && groups.length > 0 && (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
            <span style={{ fontSize: 20, fontWeight: 600, color: remaining === 0 ? th.success : th.textPrimary }}>
              {remaining === 0
                ? t("factory.keys.allGreen", "全绿 — 通过")
                : `${remaining} ${t("factory.keys.remaining", "个键还没压到")}`}
            </span>
            <span style={{ fontSize: 13, color: th.textHelper }}>
              {t("factory.keys.sweep", "第")} {groupIndex + 1}/{groups.length}{" "}
              {t("factory.keys.sweepOf", "遍")}
            </span>
          </div>

          <ProgressBar th={th} value={seen.length} total={keys.length} />

          <div
            ref={fitRef}
            style={{
              height: 300,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            <PhysicalLayout positions={positions} oneU={48} zoom="auto" fitContainerRef={fitRef} />
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            <button style={secondaryBtn(th)} onClick={() => (skipRef.current = true)}>
              {t("factory.keys.skipGroup", "跳过本遍")}
            </button>
            <button
              style={secondaryBtn(th)}
              onClick={() => {
                judgedManuallyRef.current = true;
                doneRef.current = true;
                skipRef.current = true;
              }}
            >
              {t("factory.keys.stop", "结束扫描并判定")}
            </button>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 20, fontSize: 12, color: th.textHelper, fontFamily: "var(--font-mono)" }}>
            <span>
              {t("factory.keys.stallLeft", "无新键位")} {stallLeft}s{" "}
              {t("factory.keys.stallLeftSuffix", "后结束")}
            </span>
            <span>
              {t("factory.keys.received", "共收到")} {received} {t("factory.keys.times", "次按键")}
            </span>
            <span>
              {t("factory.keys.pass", "本遍覆盖")} {currentGroup.length}{" "}
              {t("factory.keys.keys", "个键位")}
            </span>
            {lastCode && (
              <span>
                {t("factory.keys.lastCode", "最近收到")}: {lastCode}
              </span>
            )}
          </div>

          {unmatched && (
            <Notice th={th} kind="info">
              {t("factory.keys.unmatched", "收到的按键不属于本遍的任何键位")}（
              <code>{unmatched}</code>
              ）——
              {t(
                "factory.keys.unmatchedHint",
                "本遍只覆盖标出的这些键位；如果是用电脑自带的键盘按的，它不会计入，请用刮板压键盘本体。"
              )}
            </Notice>
          )}
        </>
      )}

      {phase === "error" && (
        <div style={{ display: "flex", gap: 12 }}>
          <button style={primaryBtn(th)} onClick={onRetry}>
            {t("factory.keys.retryScan", "重新扫描")}
          </button>
          <button
            style={secondaryBtn(th)}
            onClick={() => onDoneRef.current({ status: "fail", detail: error ?? "扫描失败" })}
          >
            {t("factory.keys.markFail", "记录为失败并继续")}
          </button>
        </div>
      )}
    </StepPane>
  );
}

/*
 * The three ways "nothing arrived" happens, in the order they actually happen on
 * a bench. Borrowed from the unlock flow's probe, which learned the first of them
 * the hard way.
 */
function Checklist({ th, t }: { th: StepProps["th"]; t: StepProps["t"] }) {
  const items = [
    t(
      "factory.keys.checkFocus",
      "点一下本窗口，确认它是当前活动窗口 —— 窗口失去焦点时按键不会送到这里。"
    ),
    t(
      "factory.keys.checkOutput",
      "键盘的 USB 输出可能被切到了蓝牙：按一下输出切换键切回 USB，再试一次。"
    ),
    t(
      "factory.keys.checkNotepad",
      "打开记事本敲几下：如果那里也打不出字，问题在键盘或线材，不在这个工具。"
    ),
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: th.textPrimary }}>
        {t("factory.keys.checklistTitle", "请依次检查")}
      </span>
      {items.map((item) => (
        <span key={item} style={{ fontSize: 13, color: th.textSecondary, lineHeight: 1.6 }}>
          · {item}
        </span>
      ))}
    </div>
  );
}
