import { useContext, useEffect, useRef, useState } from "react";

import { call_rpc } from "../../rpc/logging";
import { ConnectionContext } from "../../rpc/ConnectionContext";
import { Field, Notice, StepPane, StepTitle } from "../FactoryChrome";
import { secondaryBtn } from "../buttons";
import { serialHex, type StepProps } from "./stepProps";

/*
 * Step 2 — wait for the freshly flashed board to come back and read its identity.
 *
 * A reboot after flashing is not instant, and the USB CDC interface only appears
 * once application firmware is running, so this step is mostly patience: it keeps
 * asking App to attach until one sticks, then records the name and serial number
 * the log needs. It gives up rather than spinning forever, because a board that
 * never enumerates is something the operator needs told about.
 */
const GIVE_UP_MS = 90000;
const RETRY_MS = 2000;

export function DeviceStep(props: StepProps) {
  const { th, t, record } = props;
  const { conn } = useContext(ConnectionContext);

  const [elapsed, setElapsed] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [generation, setGeneration] = useState(0);

  const startedAt = useRef(Date.now());
  const settled = useRef(false);

  // Callbacks change identity on every parent render, so they are read through
  // refs — otherwise the retry loop would restart continuously.
  const onDoneRef = useRef(props.onDone);
  const onAutoConnectRef = useRef(props.onAutoConnect);
  const updateRecordRef = useRef(props.updateRecord);
  useEffect(() => {
    onDoneRef.current = props.onDone;
    onAutoConnectRef.current = props.onAutoConnect;
    updateRecordRef.current = props.updateRecord;
  }, [props.onDone, props.onAutoConnect, props.updateRecord]);

  useEffect(() => {
    const timer = window.setInterval(() => setElapsed(Date.now() - startedAt.current), 500);
    return () => window.clearInterval(timer);
  }, [generation]);

  useEffect(() => {
    if (conn) return;
    let stop = false;
    let timer: number | undefined;
    settled.current = false;
    startedAt.current = Date.now();
    setElapsed(0);

    const attempt = async () => {
      if (stop) return;
      if (Date.now() - startedAt.current > GIVE_UP_MS) {
        if (!settled.current) {
          settled.current = true;
          onDoneRef.current({
            status: "fail",
            detail: t("factory.device.timeout", "90 秒内没有检测到设备"),
          });
        }
        return;
      }
      try {
        await onAutoConnectRef.current();
      } catch {
        // The retry loop is the report; nothing useful to surface per attempt.
      }
      if (stop) return;
      setAttempts((n) => n + 1);
      timer = window.setTimeout(attempt, RETRY_MS);
    };
    attempt();

    return () => {
      stop = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
    // Deliberately keyed on the connection and manual retries only: `t` is stable
    // per language and the callbacks are read through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conn, generation]);

  useEffect(() => {
    if (!conn || settled.current) return;
    settled.current = true;
    (async () => {
      const resp = await call_rpc(conn, { core: { getDeviceInfo: true } });
      const info = resp.core?.getDeviceInfo;
      if (!info) {
        onDoneRef.current({
          status: "fail",
          detail: t("factory.device.noInfo", "读取设备信息失败"),
        });
        return;
      }
      const serial = serialHex(info.serialNumber);
      updateRecordRef.current({ device: info.name, serial });
      onDoneRef.current({
        status: "pass",
        detail: `${info.name || "?"}${serial ? ` / SN ${serial}` : ""}`,
        data: { name: info.name, serial },
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conn]);

  return (
    <StepPane>
      <StepTitle
        th={th}
        title={t("factory.device.title", "读取设备信息")}
        subtitle={t(
          "factory.device.subtitle",
          "固件烧录后板子会重启，工具会自动连接并读取型号与序列号。"
        )}
      />

      <Field
        th={th}
        label={t("factory.device.state", "连接状态")}
        value={
          conn
            ? t("factory.device.connected", "已连接")
            : t("factory.device.connecting", "自动连接中…")
        }
      />
      {!conn && (
        <>
          <Field
            th={th}
            label={t("factory.device.waiting", "已等待")}
            value={`${(elapsed / 1000).toFixed(0)} s`}
            mono
          />
          <Field th={th} label={t("factory.device.attempts", "尝试次数")} value={String(attempts)} mono />
          <Notice th={th} kind="info">
            {t(
              "factory.device.hint",
              "如果板子已经插好却一直连不上：换一个 USB 口，或确认固件确实烧进去了 —— 没有 app 固件的板子不会出现串口。"
            )}
          </Notice>
        </>
      )}
      {record.device && <Field th={th} label="Device" value={record.device} />}
      {record.serial && <Field th={th} label="Serial" value={record.serial} mono />}

      <div style={{ display: "flex", gap: 12 }}>
        <button style={secondaryBtn(th)} onClick={() => setGeneration((n) => n + 1)}>
          {t("factory.device.retry", "重新计时")}
        </button>
        <button
          style={secondaryBtn(th)}
          onClick={() =>
            props.onDone({ status: "fail", detail: t("factory.device.manualFail", "人工判定失败") })
          }
        >
          {t("factory.device.manualFail", "标记失败")}
        </button>
      </div>
    </StepPane>
  );
}
