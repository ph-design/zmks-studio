import { useContext, useEffect, useRef, useState } from "react";
import { Lightbulb } from "lucide-react";

import type { RgbUnderglowState } from "@zmkfirmware/zmk-studio-ts-client/lighting";

import { call_rpc } from "../../rpc/logging";
import { ConnectionContext } from "../../rpc/ConnectionContext";
import { Notice, StepPane, StepTitle } from "../FactoryChrome";
import { secondaryBtn } from "../buttons";
import type { StepProps } from "./stepProps";

/*
 * Step 6 — the LEDs.
 *
 * This is the one item that cannot be judged from the protocol, and it is worth
 * being explicit about why: `lighting` writes are fire-and-forget from the
 * firmware's side, so `setRgbUnderglowState` returning true proves the request
 * arrived, not that a single LED lit. A dead colour channel, an unsoldered data
 * line, or a reversed strip all report success.
 *
 * So the tool does everything it can mechanically — walk red, green, blue and
 * white so a broken channel is visible as a colour that never appears — and hands
 * the last millimetre to the operator: one look, one click. Anything cheaper
 * (a light sensor, a camera) costs more than the defect it would catch here.
 *
 * The original state is written back at the end, unsaved, so the shipped config
 * is untouched.
 */

const SWEEP: { label: string; color: { h: number; s: number; b: number } }[] = [
  { label: "红", color: { h: 0, s: 100, b: 100 } },
  { label: "绿", color: { h: 120, s: 100, b: 100 } },
  { label: "蓝", color: { h: 240, s: 100, b: 100 } },
  { label: "白", color: { h: 0, s: 0, b: 100 } },
];

export function RgbStep(props: StepProps) {
  const { th, t, config } = props;
  const { conn } = useContext(ConnectionContext);

  const [phase, setPhase] = useState<"probing" | "unsupported" | "sweeping" | "confirm">("probing");
  const [step, setStep] = useState(0);
  const [swatch, setSwatch] = useState<{ label: string; color: string }>();

  const original = useRef<RgbUnderglowState | undefined>(undefined);
  const onDoneRef = useRef(props.onDone);
  const settled = useRef(false);
  useEffect(() => {
    onDoneRef.current = props.onDone;
  }, [props.onDone]);

  useEffect(() => {
    if (!conn || settled.current) return;
    let stop = false;
    settled.current = true;

    (async () => {
      const probe = await call_rpc(conn, { lighting: { getRgbUnderglowState: true } });
      const state = probe.lighting?.getRgbUnderglowState;
      if (stop) return;
      if (!state) {
        setPhase("unsupported");
        return;
      }
      original.current = state;

      setPhase("sweeping");
      // Prefer a solid effect when the firmware names its effects, so the sweep
      // is a colour and not whatever animation index 0 happens to be.
      const solid = state.effectNames?.findIndex((n) => /solid/i.test(n));
      const effect = solid !== undefined && solid >= 0 ? solid : state.effect;

      for (let i = 0; i < SWEEP.length; i++) {
        if (stop) return;
        setStep(i);
        const { label, color } = SWEEP[i];
        setSwatch({ label, color: hsbToCss(color) });
        await call_rpc(conn, {
          lighting: { setRgbUnderglowState: { on: true, color, effect, speed: 0 } },
        });
        await sleep(config.rgbDwellMs);
      }
      if (stop) return;
      setPhase("confirm");
    })();

    return () => {
      stop = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conn]);

  const finish = async (ok: boolean) => {
    // Put the shipped state back. Not saved — the flash copy is still the one
    // from the factory, so a power cycle would land here anyway.
    const restore = original.current;
    if (conn && restore) {
      await call_rpc(conn, {
        lighting: {
          setRgbUnderglowState: {
            on: restore.on,
            color: {
              h: restore.color?.h ?? 0,
              s: restore.color?.s ?? 0,
              b: restore.color?.b ?? 0,
            },
            effect: restore.effect,
            speed: restore.speed,
          },
        },
      });
    }
    onDoneRef.current(
      ok
        ? {
            status: "pass",
            detail: t("factory.rgb.pass", "色序红→绿→蓝→白依次点亮，目视确认"),
          }
        : {
            status: "fail",
            detail: t("factory.rgb.fail", "目视确认灯光异常"),
          }
    );
  };

  return (
    <StepPane>
      <StepTitle
        th={th}
        title={t("factory.rgb.title", "RGB 灯光检查")}
        subtitle={t(
          "factory.rgb.subtitle",
          "工具会自动依次点亮相序，请目视确认每一段都亮、颜色正确。"
        )}
      />

      {phase === "probing" && (
        <Notice th={th} kind="info">
          {t("factory.rgb.probing", "正在读取灯光状态…")}
        </Notice>
      )}

      {phase === "unsupported" && (
        <>
          <Notice th={th} kind="warning">
            {t(
              "factory.rgb.unsupported",
              "这台固件没有报告 RGB 底灯，本项记为「跳过」，不计为通过。"
            )}
          </Notice>
          <div style={{ display: "flex", gap: 12 }}>
            <button
              style={secondaryBtn(th)}
              onClick={() =>
                onDoneRef.current({
                  status: "skip",
                  detail: t("factory.rgb.unsupportedDetail", "固件未报告 RGB 底灯"),
                })
              }
            >
              {t("factory.rgb.continue", "记为跳过并继续")}
            </button>
          </div>
        </>
      )}

      {phase === "sweeping" && swatch && (
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 84,
              height: 84,
              background: swatch.color,
              border: `1px solid ${th.border}`,
            }}
          />
          <div>
            <div style={{ fontSize: 22, fontWeight: 600, color: th.textPrimary }}>
              {swatch.label} {step + 1}/{SWEEP.length}
            </div>
            <div style={{ fontSize: 13, color: th.textHelper, marginTop: 6 }}>
              {t("factory.rgb.watch", "请看键盘灯，记住哪一段不亮。")}
            </div>
          </div>
        </div>
      )}

      {phase === "confirm" && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Lightbulb size={20} style={{ color: th.warning }} />
            <span style={{ fontSize: 16, color: th.textPrimary }}>
              {t("factory.rgb.question", "刚才红、绿、蓝、白四段是否都正常点亮？")}
            </span>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <button style={secondaryBtn(th)} onClick={() => finish(true)}>
              {t("factory.rgb.yes", "全部正常")}
            </button>
            <button style={secondaryBtn(th)} onClick={() => finish(false)}>
              {t("factory.rgb.no", "有异常")}
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

/** Only for the on-screen swatch; the keyboard gets the HSB numbers. */
function hsbToCss({ h, s, b }: { h: number; s: number; b: number }): string {
  const sat = s / 100;
  const val = b / 100;
  const c = val * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = val - c;
  const [r, g, bl] =
    h < 60
      ? [c, x, 0]
      : h < 120
      ? [x, c, 0]
      : h < 180
      ? [0, c, x]
      : h < 240
      ? [0, x, c]
      : h < 300
      ? [x, 0, c]
      : [c, 0, x];
  const to255 = (v: number) => Math.round((v + m) * 255);
  return `rgb(${to255(r)}, ${to255(g)}, ${to255(bl)})`;
}
