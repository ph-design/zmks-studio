import { useEffect, useMemo, useState } from "react";
import { HardDrive, Usb } from "lucide-react";

import {
  factoryBackendAvailable,
  flashUf2,
  listFirmware,
  listUf2Drives,
  type FirmwareCandidate,
  type Uf2Drive,
} from "../../tauri/factory";
import { Field, Notice, StepPane, StepTitle } from "../FactoryChrome";
import { primaryBtn, secondaryBtn } from "../buttons";
import type { StepProps } from "./stepProps";

/*
 * Step 1 — put the shipping build on a board that is still in its bootloader.
 *
 * The board arrives from the PCBA house with nothing but the UF2 bootloader on
 * it, so it is already in mass-storage mode the moment USB is attached: no
 * chord, no button, no timing. That is what makes this step automatic, and it is
 * also why the flow starts here — every later step then tests the build that
 * actually ships rather than a test image.
 *
 * The drive is identified by its INFO_UF2.TXT marker, and its reported Model is
 * checked against the configured one. A bench that flashes whatever UF2 volume
 * happens to be mounted is a bench that can brick a box of boards.
 */
export function FlashStep(props: StepProps) {
  const { th, t, config, onDone, updateRecord } = props;
  const desktop = factoryBackendAvailable();

  const [drives, setDrives] = useState<Uf2Drive[]>([]);
  const [firmware, setFirmware] = useState<FirmwareCandidate[]>([]);
  const [firmwareError, setFirmwareError] = useState<string>();
  const [selected, setSelected] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  // Keyboards come and go on the bench, so the drive list is polled rather than
  // read once: the operator plugs in and the pane lights up on its own.
  useEffect(() => {
    if (!desktop) return;
    let stop = false;
    const tick = async () => {
      try {
        const found = await listUf2Drives();
        if (!stop) setDrives(found);
      } catch {
        if (!stop) setDrives([]);
      }
    };
    tick();
    const timer = window.setInterval(tick, 2000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [desktop]);

  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        const found = await listFirmware(config.firmwareDir);
        if (stop) return;
        setFirmware(found);
        setFirmwareError(undefined);
        setSelected((prev) => prev ?? found[0]?.path);
      } catch (e) {
        if (stop) return;
        setFirmware([]);
        setSelected(undefined);
        setFirmwareError(String(e));
      }
    })();
    return () => {
      stop = true;
    };
  }, [config.firmwareDir]);

  const drive = drives[0];

  const modelMismatch = useMemo(() => {
    if (!drive || !config.expectedModel.trim()) return false;
    return !drive.model.toLowerCase().includes(config.expectedModel.trim().toLowerCase());
  }, [drive, config.expectedModel]);

  const canFlash = !!desktop && !!drive && !!selected && !modelMismatch && !busy;

  const onFlash = async () => {
    if (!drive || !selected) return;
    setBusy(true);
    setError(undefined);
    const build = firmware.find((f) => f.path === selected);
    try {
      const detail = await flashUf2(selected, drive.path);
      if (build) {
        updateRecord({
          firmware: { name: build.name, modifiedMs: build.modified_ms, size: build.size },
        });
      }
      onDone({ status: "pass", detail, data: { drive: drive.path, model: drive.model } });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <StepPane>
      <StepTitle
        th={th}
        title={t("factory.flash.title", "烧录固件")}
        subtitle={t(
          "factory.flash.subtitle",
          "把键盘插上 USB。裸板会自动停在 UF2 bootloader，插线即可，不需要任何按键。"
        )}
      />

      {!desktop && (
        <Notice th={th} kind="warning">
          {t(
            "factory.flash.desktopOnly",
            "当前不是桌面客户端，无法写 U 盘。请用桌面客户端打开工厂模式。"
          )}
        </Notice>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Usb size={18} style={{ color: drive ? th.success : th.textHelper }} />
        <span style={{ fontSize: 15, fontWeight: 500, color: th.textPrimary }}>
          {drive
            ? t("factory.flash.driveFound", "已识别 bootloader")
            : t("factory.flash.driveWaiting", "等待插入…")}
        </span>
      </div>

      {drive && (
        <div>
          <Field th={th} label="UF2 盘" value={drive.path} mono />
          <Field th={th} label="Model" value={drive.model || "—"} mono />
          <Field th={th} label="Board-ID" value={drive.board_id || "—"} mono />
        </div>
      )}

      {modelMismatch && (
        <Notice th={th} kind="error">
          {t(
            "factory.flash.modelMismatch",
            "识别到的板型与配置不一致，已禁止写入：识别到"
          )}{" "}
          <code>{drive?.model}</code>
          {t("factory.flash.modelMismatch2", "，配置期望包含")}{" "}
          <code>{config.expectedModel}</code>
        </Notice>
      )}
      {drive && !config.expectedModel.trim() && (
        <Notice th={th} kind="warning">
          {t(
            "factory.flash.noModelCheck",
            "尚未配置期望板型，本次不做板型校验。建议在工厂设置里填写 Model 关键字。"
          )}
        </Notice>
      )}

      <div>
        <div style={{ fontSize: 13, color: th.textHelper, marginBottom: 8 }}>
          {t("factory.flash.firmwareFrom", "固件目录")}: {config.firmwareDir || "—"}
        </div>
        {firmwareError && (
          <Notice th={th} kind="error">
            {firmwareError}
          </Notice>
        )}
        {!firmwareError && firmware.length === 0 && config.firmwareDir && (
          <Notice th={th} kind="warning">
            {t("factory.flash.noFirmware", "该目录下没有 .uf2 文件。")}
          </Notice>
        )}
        {firmware.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {firmware.slice(0, 5).map((f) => (
              <label
                key={f.path}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 10px",
                  fontSize: 13,
                  cursor: "pointer",
                  background: selected === f.path ? th.selectedBg : "transparent",
                  border: `1px solid ${selected === f.path ? th.selectedBorder : th.border}`,
                }}
              >
                <input
                  type="radio"
                  name="factory-firmware"
                  checked={selected === f.path}
                  onChange={() => setSelected(f.path)}
                />
                <HardDrive size={14} style={{ color: th.iconSecondary }} />
                <span style={{ flex: 1, color: th.textPrimary, fontFamily: "var(--font-mono)" }}>{f.name}</span>
                <span style={{ color: th.textHelper, fontFamily: "var(--font-mono)" }}>
                  {new Date(f.modified_ms).toLocaleString()} · {(f.size / 1024).toFixed(0)} KB
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      {error && (
        <Notice th={th} kind="error">
          {t("factory.flash.failed", "烧录失败")}: {error}
        </Notice>
      )}

      <div style={{ display: "flex", gap: 12 }}>
        <button style={primaryBtn(th, !canFlash)} disabled={!canFlash} onClick={onFlash}>
          {busy ? t("factory.flash.writing", "写入中…") : t("factory.flash.start", "开始烧录")}
        </button>
        <button
          style={secondaryBtn(th, busy)}
          disabled={busy}
          onClick={() =>
            onDone({
              status: "skip",
              detail: t("factory.flash.skipped", "已跳过（板子已有固件）"),
            })
          }
        >
          {t("factory.flash.skip", "跳过刷写")}
        </button>
      </div>
    </StepPane>
  );
}
