import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Download,
  LogOut,
  MinusCircle,
  RotateCcw,
  X,
  XCircle,
} from "lucide-react";

import { ConnectionContext } from "../rpc/ConnectionContext";
import type { CarbonTheme, useCarbonTheme } from "../carbon/theme";
import { Field } from "./FactoryChrome";
import { primaryBtn, secondaryBtn } from "./buttons";
import { useFactoryConfig } from "./factoryConfig";
import { FACTORY_STEPS, type StepId, type StepResult } from "./factoryTypes";
import { useFactoryRun } from "./useFactoryRun";
import {
  appendFactoryLog,
  downloadText,
  factoryLogToCsv,
  readFactoryLog,
} from "./factoryLog";
import { FlashStep } from "./steps/FlashStep";
import { DeviceStep } from "./steps/DeviceStep";
import { UnlockStep } from "./steps/UnlockStep";
import { KeyScanStep } from "./steps/KeyScanStep";
import { ImuStep } from "./steps/ImuStep";
import { RgbStep } from "./steps/RgbStep";
import { FinishStep } from "./steps/FinishStep";
import type { FactoryRecord, StepProps } from "./steps/stepProps";

/*
 * The bench application.
 *
 * It replaces the whole Studio shell rather than living in a section of it. That
 * is structural, not cosmetic:
 *
 *  - the normal shell is gated on an *unlocked* connection — the connect modal
 *    covers the screen otherwise — so a factory flow that has to walk the
 *    operator through unlocking cannot be hosted inside it;
 *  - the first step happens with no connection at all, while the board is still
 *    in its bootloader, which is a state the shell has no room for;
 *  - the connect modal asks a question ("which device?") that a bench always
 *    answers the same way, so this flow attaches to the only keyboard present.
 *
 * Leaving is always available: an operator who cannot abandon a half-finished run
 * pulls the USB cable instead, which is worse for the board and the log.
 */

export interface FactoryAppProps {
  carbon: ReturnType<typeof useCarbonTheme>;
  onAutoConnect: () => Promise<boolean>;
  onDisconnect: () => void;
  onExit: () => void;
}

export function FactoryApp({ carbon, onAutoConnect, onDisconnect, onExit }: FactoryAppProps) {
  const { t } = useTranslation();
  const th = carbon.theme;
  const { conn } = useContext(ConnectionContext);
  const [config] = useFactoryConfig();
  const run = useFactoryRun();
  const [record, setRecord] = useState<FactoryRecord>({});
  /*
   * Remount counter for the key scan. The scan is a run-to-completion job — it
   * writes a keymap, waits on a sweep and puts the keymap back — so a retry after
   * "nothing arrived" starts from a clean component rather than trying to resume
   * halfway through one. Unmounting also tells the old run to stop.
   */
  const [scanAttempt, setScanAttempt] = useState(0);

  const updateRecord = useCallback((patch: Partial<FactoryRecord>) => {
    setRecord((prev) => ({ ...prev, ...patch }));
  }, []);

  const { stepId, index, finished, results } = run;

  const handleDone = useCallback(
    (result: StepResult) => {
      if (!stepId) return;
      run.complete(stepId, result);
    },
    [run, stepId]
  );

  const stepProps: StepProps = useMemo(
    () => ({
      th,
      t,
      config,
      onAutoConnect,
      onDisconnect,
      record,
      updateRecord,
      onDone: handleDone,
    }),
    [th, t, config, onAutoConnect, onDisconnect, record, updateRecord, handleDone]
  );

  // Written once, when the run reaches the summary.
  const logged = useRef(false);
  useEffect(() => {
    if (!finished || logged.current) return;
    logged.current = true;
    appendFactoryLog({
      at: Date.now(),
      verdict: run.verdict === "pass" ? "pass" : "fail",
      device: record.device,
      serial: record.serial,
      firmware: record.firmware,
      steps: FACTORY_STEPS.map((s) => ({
        id: s.id,
        status: results[s.id]?.status ?? "skip",
        detail: results[s.id]?.detail ?? "",
      })),
    });
  }, [finished, record, results, run.verdict]);

  const restart = useCallback(() => {
    logged.current = false;
    setRecord({});
    run.restart();
  }, [run]);

  /*
   * Re-running a step is how the bench recovers: a board that got power-cycled
   * back into its locked state needs step 3 again, and a unit that failed the
   * scan gets one more try before it is tagged. `goTo` clears that step and
   * everything after it, so a retest can never leave a stale `skip` behind and
   * let the unit out with a test it never ran.
   */
  const repeatStep = useCallback(
    (id: StepId) => {
      logged.current = false;
      run.goTo(id);
    },
    [run]
  );

  return (
    <div
      style={{
        height: "100vh",
        width: "100vw",
        display: "flex",
        flexDirection: "column",
        background: th.bg,
        color: th.textPrimary,
        fontFamily: "var(--font-sans)",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 52,
          padding: "0 20px",
          background: th.headerBg,
          borderBottom: `1px solid ${th.border}`,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
          <span style={{ fontSize: 15, fontWeight: 600 }}>
            {t("factory.title", "工厂测试")}
          </span>
          <span style={{ fontSize: 12, color: th.textHelper }}>
            {record.device || t("factory.noDevice", "尚未连接设备")}
          </span>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: 20,
              padding: "0 8px",
              fontSize: 11,
              fontWeight: 500,
              background: conn ? th.successBg : th.layer2,
              color: conn ? th.success : th.textHelper,
            }}
          >
            {conn ? "USB" : t("factory.idle", "空闲")}
          </span>
        </div>
        <button style={secondaryBtn(th)} onClick={onExit}>
          <LogOut size={14} /> {t("factory.exit", "退出工厂模式")}
        </button>
      </header>

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <nav
          style={{
            width: 244,
            flexShrink: 0,
            background: th.railBg,
            borderRight: `1px solid ${th.border}`,
            overflowY: "auto",
          }}
        >
          {FACTORY_STEPS.map((step, i) => {
            const result = results[step.id];
            const active = !finished && i === index;
            const revisit = !finished && i <= index;
            return (
              <button
                key={step.id}
                disabled={!revisit}
                onClick={() => revisit && repeatStep(step.id)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: "12px 14px",
                  textAlign: "left",
                  border: "none",
                  borderLeft: `3px solid ${active ? th.selectedBorder : "transparent"}`,
                  background: active ? th.selectedBg : "transparent",
                  cursor: revisit ? "pointer" : "default",
                  fontFamily: "var(--font-sans)",
                }}
              >
                <StatusIcon th={th} status={result?.status} active={active} />
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: active ? 600 : 400,
                      color: active ? th.textPrimary : th.textSecondary,
                    }}
                  >
                    {t(step.titleKey, step.title)}
                  </span>
                  <span style={{ fontSize: 11, color: th.textHelper, lineHeight: 1.5 }}>
                    {t(step.hintKey, step.hint)}
                  </span>
                  {result && (
                    <span
                      style={{
                        fontSize: 11,
                        color:
                          result.status === "fail"
                            ? th.error
                            : result.status === "skip"
                            ? th.warning
                            : th.success,
                        lineHeight: 1.5,
                        wordBreak: "break-word",
                      }}
                    >
                      {result.detail}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </nav>

        <main style={{ flex: 1, overflow: "auto", minWidth: 0 }} className="custom-scrollbar">
          {finished ? (
            <FactorySummary
              th={th}
              t={t}
              verdict={run.verdict}
              results={results}
              record={record}
              onRestart={restart}
              onExit={onExit}
              onRepeatStep={repeatStep}
            />
          ) : stepId === "flash" ? (
            <FlashStep {...stepProps} />
          ) : stepId === "device" ? (
            <DeviceStep {...stepProps} />
          ) : stepId === "unlock" ? (
            <UnlockStep {...stepProps} />
          ) : stepId === "keys" ? (
            <KeyScanStep
              key={`keys-${scanAttempt}`}
              {...stepProps}
              onRetry={() => setScanAttempt((n) => n + 1)}
            />
          ) : stepId === "imu" ? (
            <ImuStep {...stepProps} />
          ) : stepId === "rgb" ? (
            <RgbStep {...stepProps} />
          ) : stepId === "finish" ? (
            <FinishStep {...stepProps} results={results} />
          ) : null}
        </main>
      </div>
    </div>
  );
}

function StatusIcon({
  th,
  status,
  active,
}: {
  th: CarbonTheme;
  status?: string;
  active: boolean;
}) {
  if (status === "pass") return <Check size={15} style={{ color: th.success, marginTop: 1 }} />;
  if (status === "fail") return <X size={15} style={{ color: th.error, marginTop: 1 }} />;
  if (status === "skip") return <MinusCircle size={15} style={{ color: th.warning, marginTop: 1 }} />;
  return (
    <span
      style={{
        width: 15,
        height: 15,
        marginTop: 1,
        flexShrink: 0,
        border: `1.5px solid ${active ? th.interactive : th.borderStrong}`,
        display: "inline-block",
      }}
    />
  );
}

function FactorySummary({
  th,
  t,
  verdict,
  results,
  record,
  onRestart,
  onExit,
  onRepeatStep,
}: {
  th: CarbonTheme;
  t: (key: string, fallback: string) => string;
  verdict: "pass" | "fail" | "running";
  results: Partial<Record<StepId, StepResult>>;
  record: FactoryRecord;
  onRestart: () => void;
  onExit: () => void;
  onRepeatStep: (id: StepId) => void;
}) {
  const pass = verdict === "pass";
  const failed = FACTORY_STEPS.filter((s) => results[s.id]?.status === "fail");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, padding: 28, maxWidth: 900 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {pass ? (
          <CheckCircle2 size={38} style={{ color: th.success }} />
        ) : (
          <XCircle size={38} style={{ color: th.error }} />
        )}
        <div>
          <div style={{ fontSize: 24, fontWeight: 600, color: pass ? th.success : th.error }}>
            {pass ? t("factory.summary.pass", "PASS — 可以装箱") : t("factory.summary.fail", "FAIL — 请隔离")}
          </div>
          <div style={{ fontSize: 13, color: th.textHelper, marginTop: 4 }}>
            {new Date().toLocaleString()}
          </div>
        </div>
      </div>

      <div>
        <Field th={th} label="Device" value={record.device || "—"} />
        <Field th={th} label="Serial" value={record.serial || "—"} mono />
        <Field th={th} label={t("factory.summary.firmware", "固件")} value={record.firmware?.name || "—"} mono />
        {record.firmware && (
          <Field
            th={th}
            label={t("factory.summary.buildTime", "构建时间")}
            value={new Date(record.firmware.modifiedMs).toLocaleString()}
          />
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        {FACTORY_STEPS.map((step) => {
          const result = results[step.id];
          const status = result?.status;
          return (
            <div
              key={step.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 0",
                borderBottom: `1px solid ${th.border}`,
                fontSize: 13,
              }}
            >
              <StatusIcon th={th} status={status} active={false} />
              <span style={{ width: 140, flexShrink: 0, color: th.textPrimary }}>
                {t(step.titleKey, step.title)}
              </span>
              <span
                style={{
                  width: 56,
                  flexShrink: 0,
                  fontWeight: 600,
                  color:
                    status === "fail" ? th.error : status === "skip" ? th.warning : status === "pass" ? th.success : th.textHelper,
                }}
              >
                {status ? status.toUpperCase() : "—"}
              </span>
              <span style={{ flex: 1, color: th.textSecondary, wordBreak: "break-word" }}>
                {result?.detail || ""}
              </span>
              {status === "fail" && (
                <button style={secondaryBtn(th)} onClick={() => onRepeatStep(step.id)}>
                  <RotateCcw size={13} /> {t("factory.summary.retest", "重测")}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {failed.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 10,
            padding: "12px 14px",
            background: th.errorBg,
            borderLeft: `3px solid ${th.error}`,
            fontSize: 13,
            color: th.textPrimary,
          }}
        >
          <AlertTriangle size={16} style={{ color: th.error, flexShrink: 0, marginTop: 2 }} />
          <span>
            {t("factory.summary.failedSteps", "失败项")}:{" "}
            {failed.map((s) => t(s.titleKey, s.title)).join("、")}
          </span>
        </div>
      )}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button style={primaryBtn(th)} onClick={onRestart}>
          <RotateCcw size={15} /> {t("factory.summary.next", "下一台")}
        </button>
        <button
          style={secondaryBtn(th)}
          onClick={() =>
            downloadText(
              `factory-log-${Date.now()}.csv`,
              factoryLogToCsv(readFactoryLog(), FACTORY_STEPS.map((s) => s.id)),
              "text/csv"
            )
          }
        >
          <Download size={15} /> {t("factory.summary.exportCsv", "导出日志 (CSV)")}
        </button>
        <button style={secondaryBtn(th)} onClick={onExit}>
          <LogOut size={15} /> {t("factory.summary.exit", "退出工厂模式")}
        </button>
      </div>

      <div style={{ fontSize: 12, color: th.textHelper }}>
        {t("factory.summary.logCount", "本机已记录")} {readFactoryLog().length}{" "}
        {t("factory.summary.logCountSuffix", "台")}
      </div>
    </div>
  );
}
