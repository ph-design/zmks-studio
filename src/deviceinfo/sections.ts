import type { GroupStatus, SysInfoState } from "./useSysInfo";

// Shared device-info presentation model.
export type Translate = (key: string, fallback: string) => string;

export interface DeviceFallback {
  deviceName: string;
  serial?: string;
  keyCount?: number;
  layerCount?: number;
  layoutCount?: number;
}

export interface InfoRow {
  label: string;
  value: string;
  copyable?: boolean;
}

export interface CapabilityBadge {
  label: string;
  on: boolean;
}

export interface InfoSection {
  id: string;
  title: string;
  status: GroupStatus;
  rows: InfoRow[];
  capabilities?: CapabilityBadge[];
  capabilitiesLabel?: string;
}

const DASH = "—";
export const EMPTY_VALUE = DASH;

const pad2 = (n: number) => String(n).padStart(2, "0");

export function formatUptime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return DASH;

  let rest = Math.floor(totalSeconds);
  const days = Math.floor(rest / 86400);
  rest -= days * 86400;
  const hours = Math.floor(rest / 3600);
  rest -= hours * 3600;
  const minutes = Math.floor(rest / 60);
  const seconds = rest - minutes * 60;

  const clock =
    days > 0 || hours > 0
      ? `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`
      : `${pad2(minutes)}:${pad2(seconds)}`;

  return days > 0 ? `${days}d ${clock}` : clock;
}

export function formatHex(bytes?: Uint8Array): string {
  if (!bytes || bytes.length === 0) return "";
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function formatBlank(value: string | undefined): string {
  return value && value.trim() !== "" ? value : DASH;
}

export function formatKb(kb: number | undefined): string {
  return kb && kb > 0 ? `${kb} KB` : DASH;
}

export function formatUsageKb(used: number | undefined, total: number | undefined): string {
  if (!total || total <= 0) return DASH;
  if (!used || used <= 0) return formatKb(total);
  return `${used} / ${total} KB (${Math.round((used / total) * 100)}%)`;
}

/** Firmware count when it reports one, keymap-derived count otherwise. */
export function formatCount(value: number | undefined, fallback?: number): string {
  if (value && value > 0) return String(value);
  if (fallback && fallback > 0) return String(fallback);
  return DASH;
}

export function formatMv(mv: number | undefined): string {
  return mv && mv > 0 ? `${(mv / 1000).toFixed(2)} V` : DASH;
}

export function formatPercent(pct: number | undefined): string {
  return typeof pct === "number" ? `${pct}%` : DASH;
}

export function formatEndpoint(raw: string | undefined): string {
  const v = (raw ?? "").trim();
  if (!v) return DASH;
  if (/^2\.?4g$|^2g4$/i.test(v)) return "2.4G";
  return v.replace(":", " ");
}

export function buildDeviceSections(
  info: SysInfoState,
  fallback: DeviceFallback,
  t: Translate
): InfoSection[] {
  const identity = info.identity.data;
  const firmware = info.firmware.data;
  const hardware = info.hardware.data;
  const runtime = info.runtime.data;
  const diagnostics = info.diagnostics.data;

  const serial = formatHex(identity?.serialNumber) || fallback.serial || "";
  const keyboardName = identity?.name || fallback.deviceName;
  const buildVersion = [firmware?.buildDate, firmware?.buildTime, firmware?.gitHash]
    .filter((value): value is string => !!value && value.trim() !== "")
    .join(" · ");

  const onOff = (on: boolean) =>
    on ? t("carbon.device.on", "On") : t("carbon.device.off", "Off");

  const idleLabel = (state: number | undefined) => {
    if (state === 0) return t("carbon.device.idle.active", "Active");
    if (state === 1) return t("carbon.device.idle.idle", "Idle");
    if (state === 2) return t("carbon.device.idle.sleep", "Sleeping");
    return DASH;
  };

  return [
    {
      id: "identity",
      title: t("carbon.device.identity.title", "Identity"),
      status: info.identity.status,
      rows: [
        {
          label: t("carbon.device.identity.name", "Keyboard name"),
          value: formatBlank(keyboardName),
        },
        ...(identity?.model && identity.model !== keyboardName
          ? [{
              label: t("carbon.device.identity.model", "Model"),
              value: formatBlank(identity.model),
            }]
          : []),
        {
          label: t("carbon.device.identity.manufacturer", "Manufacturer"),
          value: formatBlank(identity?.manufacturer),
        },
        {
          label: t("carbon.device.identity.family", "Family"),
          value: formatBlank(identity?.family),
        },
        {
          label: t("carbon.device.identity.serial", "Serial number"),
          value: formatBlank(serial),
          copyable: serial.length > 0,
        },
      ],
    },
    {
      id: "firmware",
      title: t("carbon.device.firmware.title", "Firmware"),
      status: info.firmware.status,
      rows: [
        {
          label: t("carbon.device.firmware.zmk", "ZMK version"),
          value: formatBlank(firmware?.zmkVersion),
        },
        {
          label: t("carbon.device.firmware.zephyr", "Zephyr version"),
          value: formatBlank(firmware?.zephyrVersion),
        },
        {
          label: t("carbon.device.firmware.board", "Board target"),
          value: formatBlank(firmware?.board),
        },
        {
          label: t("carbon.device.firmware.version", "Version"),
          value: formatBlank(buildVersion),
        },
      ],
    },
    {
      id: "hardware",
      title: t("carbon.device.hardware.title", "Hardware"),
      status: info.hardware.status,
      capabilitiesLabel: t("carbon.device.hardware.caps", "Capabilities"),
      rows: [
        {
          label: t("carbon.device.hardware.mcu", "MCU"),
          value: formatBlank(hardware?.mcu),
        },
        {
          label: t("carbon.device.hardware.flash", "Flash"),
          value: formatUsageKb(firmware?.imageSizeKb, hardware?.flashKb),
        },
        {
          label: t("carbon.device.hardware.ram", "RAM"),
          value: formatUsageKb(firmware?.ramUsedKb, hardware?.ramKb),
        },
        {
          label: t("carbon.device.hardware.keys", "Keys"),
          value: formatCount(hardware?.keyCount, fallback.keyCount),
        },
        {
          label: t("carbon.device.hardware.layers", "Layers"),
          value: formatCount(hardware?.layerCount, fallback.layerCount),
        },
        {
          label: t("carbon.device.hardware.layouts", "Physical layouts"),
          value: formatCount(hardware?.layoutCount, fallback.layoutCount),
        },
        {
          label: t("carbon.device.hardware.leds", "LEDs"),
          value: formatCount(hardware?.ledCount),
        },
        {
          label: t("carbon.device.hardware.resetCause", "Reset cause"),
          value: formatBlank(hardware?.resetCause),
        },
      ],
      // Avoid showing unknown capabilities as "off".
      capabilities: info.hardware.status === "ok" ? [
        { label: t("carbon.device.caps.rgb", "RGB"), on: !!hardware?.hasRgb },
        { label: t("carbon.device.caps.backlight", "Backlight"), on: !!hardware?.hasBacklight },
        { label: t("carbon.device.caps.imu", "IMU"), on: !!hardware?.hasImu },
        { label: t("carbon.device.caps.display", "Display"), on: !!hardware?.hasDisplay },
        { label: t("carbon.device.caps.split", "Split"), on: !!hardware?.hasSplit },
        { label: t("carbon.device.caps.pointing", "Mouse emulation"), on: !!hardware?.hasPointing },
        { label: t("carbon.device.caps.ble", "BLE"), on: !!hardware?.hasBle },
        { label: t("carbon.device.caps.usb", "USB"), on: !!hardware?.hasUsb },
        { label: t("carbon.device.caps.twoG4", "2.4G"), on: !!hardware?.has2g4 },
      ] : undefined,
    },
    {
      id: "runtime",
      title: t("carbon.device.runtime.title", "Runtime"),
      status: info.runtime.status,
      rows: [
        {
          label: t("carbon.device.runtime.uptime", "Uptime"),
          value: runtime ? formatUptime(runtime.uptimeS) : DASH,
        },
        {
          label: t("carbon.device.runtime.battery", "Battery"),
          value: runtime
            ? runtime.batteryPercent < 0
              ? t("carbon.device.runtime.batteryUnknown", "Unknown")
              : `${runtime.batteryPercent}%`
            : DASH,
        },
        {
          label: t("carbon.device.runtime.voltage", "Battery voltage"),
          value: formatMv(runtime?.batteryMv),
        },
        {
          label: t("carbon.device.runtime.vddh", "VDDH"),
          value: formatMv(runtime?.vddhMv),
        },
        {
          label: t("carbon.device.runtime.charging", "Charging"),
          value: runtime
            ? runtime.charging
              ? t("carbon.device.runtime.charging", "Charging")
              : t("carbon.device.runtime.notCharging", "Not charging")
            : DASH,
        },
        {
          label: t("carbon.device.runtime.layers", "Layer / highest"),
          value: runtime ? `${runtime.activeLayer} / ${runtime.highestLayer}` : DASH,
        },
        {
          label: t("carbon.device.runtime.endpoint", "Endpoint"),
          value: formatEndpoint(runtime?.endpoint),
        },
        {
          label: t("carbon.device.runtime.ble", "BLE profile"),
          value: runtime
            ? `${t("carbon.device.runtime.profile", "Profile")} ${runtime.bleProfile} · ${
                runtime.bleConnected
                  ? t("carbon.device.runtime.connected", "connected")
                  : t("carbon.device.runtime.disconnected", "not connected")
              }`
            : DASH,
        },
        ...(hardware?.has2g4
          ? [{
              label: t("carbon.device.runtime.twoG4", "2.4G pairing"),
              value: runtime
                ? runtime.twoG4Paired
                  ? t("carbon.device.runtime.paired", "Paired")
                  : t("carbon.device.runtime.unpaired", "Not paired")
                : DASH,
            }]
          : []),
        {
          label: t("carbon.device.runtime.idle", "Idle state"),
          value: idleLabel(runtime?.idleState),
        },
        {
          label: t("carbon.device.runtime.rgb", "RGB underglow"),
          value: runtime ? onOff(runtime.rgbEnabled) : DASH,
        },
      ],
    },
    {
      id: "diagnostics",
      title: t("carbon.device.diagnostics.title", "Diagnostics"),
      status: info.diagnostics.status,
      rows: [
        {
          label: t("carbon.device.diagnostics.workqStack", "Workqueue stack used"),
          value: formatPercent(diagnostics?.workqStackUsedPct),
        },
      ],
    },
  ];
}

// Copy only fields answered by the device.
export function sectionsToClipboardText(sections: InfoSection[]): string {
  return sections
    .map((section) => {
      const rows = section.rows.filter((row) => row.value !== EMPTY_VALUE);
      const caps = section.capabilities ?? [];
      if (rows.length === 0 && caps.length === 0) return "";

      const lines = rows.map((row) => `${row.label}: ${row.value}`);
      if (caps.length > 0) {
        lines.push(
          `${section.capabilitiesLabel ?? "Capabilities"}: ${caps
            .map((c) => `${c.label} ${c.on ? "on" : "off"}`)
            .join("  ")}`
        );
      }
      return [`# ${section.title}`, ...lines].join("\n");
    })
    .filter((block) => block !== "")
    .join("\n\n");
}
