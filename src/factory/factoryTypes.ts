/*
 * The bench pipeline, as data.
 *
 * Order matters and is deliberate: the board arrives from the PCBA house running
 * only its UF2 bootloader, so flashing comes first and everything else is tested
 * on the build that will actually ship. Locking is last, so the keyboard leaves
 * the bench in the state a customer receives.
 */
export type StepId =
  | "flash"
  | "device"
  | "unlock"
  | "keys"
  | "imu"
  | "rgb"
  | "finish";

export type StepStatus = "pass" | "fail" | "skip";

export interface StepResult {
  status: StepStatus;
  /** One line for the log and the summary; the step pane shows the detail itself. */
  detail: string;
  data?: Record<string, unknown>;
}

export interface StepDef {
  id: StepId;
  titleKey: string;
  title: string;
  hintKey: string;
  hint: string;
  /** False when the step cannot complete without a human doing something physical. */
  automatic: boolean;
}

export const FACTORY_STEPS: StepDef[] = [
  {
    id: "flash",
    titleKey: "factory.step.flash",
    title: "烧录固件",
    hintKey: "factory.step.flashHint",
    hint: "板子停在 UF2 bootloader，插线即被识别，无需按键",
    automatic: true,
  },
  {
    id: "device",
    titleKey: "factory.step.device",
    title: "读取设备信息",
    hintKey: "factory.step.deviceHint",
    hint: "记录型号与序列号，并等待重新枚举完成",
    automatic: true,
  },
  {
    id: "unlock",
    titleKey: "factory.step.unlock",
    title: "解锁键盘",
    hintKey: "factory.step.unlockHint",
    hint: "出厂固件是锁定状态，需要按一次解锁组合键",
    automatic: false,
  },
  {
    id: "keys",
    titleKey: "factory.step.keys",
    title: "全键扫描",
    hintKey: "factory.step.keysHint",
    hint: "用刮板刮过整个键盘，全部变绿即通过",
    automatic: false,
  },
  {
    id: "imu",
    titleKey: "factory.step.imu",
    title: "IMU 动作检测",
    hintKey: "factory.step.imuHint",
    hint: "拿起键盘倾斜并轻敲，工具自动判定",
    automatic: false,
  },
  {
    id: "rgb",
    titleKey: "factory.step.rgb",
    title: "RGB 灯光检查",
    hintKey: "factory.step.rgbHint",
    hint: "自动跑一遍色序，人眼确认",
    automatic: false,
  },
  {
    id: "finish",
    titleKey: "factory.step.finish",
    title: "收尾与汇总",
    hintKey: "factory.step.finishHint",
    hint: "丢弃测试改动、恢复锁定、写入日志",
    automatic: true,
  },
];
