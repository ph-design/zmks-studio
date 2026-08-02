import { useEffect, useMemo } from "react";
import { useLocalStorageState } from "../misc/useLocalStorageState";

/*
 * IBM Carbon token objects, copied verbatim from the Figma template so the
 * hand-built shell (header / sidebars / status bar / keycaps / drawer chrome)
 * renders pixel-close via inline styles. The same palette is mirrored as CSS
 * variables in src/index.css to re-skin the reused Tailwind feature panels.
 */
export const DARK = {
  bg: "#161616",
  layer1: "#262626",
  layer2: "#393939",
  layer3: "#525252",
  textPrimary: "#f4f4f4",
  textSecondary: "#c6c6c6",
  textHelper: "#8d8d8d",
  textDisabled: "#525252",
  border: "#393939",
  borderStrong: "#6f6f6f",
  interactive: "#0f62fe",
  selectedBg: "#353535",
  selectedBorder: "#78a9ff",
  selectedLayer: "#1f3560",
  hoverBg: "#2c2c2c",
  linkPrimary: "#78a9ff",
  iconPrimary: "#f4f4f4",
  iconSecondary: "#8d8d8d",
  success: "#42be65",
  successBg: "#071908",
  warning: "#f1c21b",
  error: "#fa4d56",
  errorBg: "#2d0709",
  info: "#4589ff",
  infoBg: "#001141",
  keyBg: "#2d2d2d",
  keyBorder: "#3d3d3d",
  keyBorderHover: "#6f6f6f",
  keyText: "#c6c6c6",
  keyTextSub: "#6f6f6f",
  keySelected: "#0f62fe",
  keySelectedBorder: "#78a9ff",
  fieldBg: "#2d2d2d",
  toggleOff: "#6f6f6f",
  toggleOn: "#42be65",
  // Distinct panel shades so regions read apart, matching the Figma template.
  headerBg: "#161616",
  railBg: "#1c1c1c",
  breadcrumbBg: "#1c1c1c",
  statusBg: "#0a0a0a",
};

export const LIGHT: typeof DARK = {
  bg: "#ffffff",
  layer1: "#f4f4f4",
  layer2: "#e0e0e0",
  layer3: "#c6c6c6",
  textPrimary: "#161616",
  textSecondary: "#525252",
  textHelper: "#6f6f6f",
  textDisabled: "#c6c6c6",
  border: "#e0e0e0",
  borderStrong: "#8d8d8d",
  interactive: "#0f62fe",
  selectedBg: "#e8e8e8",
  selectedBorder: "#0f62fe",
  selectedLayer: "#d0e2ff",
  hoverBg: "#f0f0f0",
  linkPrimary: "#0f62fe",
  iconPrimary: "#161616",
  iconSecondary: "#525252",
  success: "#198038",
  successBg: "#defbe6",
  warning: "#b28600",
  error: "#da1e28",
  errorBg: "#fff1f1",
  info: "#0043ce",
  infoBg: "#edf5ff",
  keyBg: "#e0e0e0",
  keyBorder: "#c6c6c6",
  keyBorderHover: "#8d8d8d",
  keyText: "#161616",
  keyTextSub: "#525252",
  keySelected: "#0f62fe",
  keySelectedBorder: "#0043ce",
  fieldBg: "#f4f4f4",
  toggleOff: "#8d8d8d",
  toggleOn: "#24a148",
  headerBg: "#f4f4f4",
  railBg: "#ffffff",
  breadcrumbBg: "#f4f4f4",
  statusBg: "#e0e0e0",
};

export type CarbonTheme = typeof DARK;
export type ThemeSetting = "dark" | "light" | "system";

/** Preset id — "blue", "purple", … (see ACCENT_PRESETS). */
export type AccentSetting = string;

const STORAGE_KEY = "zmk-studio-theme";
const ACCENT_KEY = "zmk-studio-accent";

export interface AccentPreset {
  id: string;
  hex: string;
}

/*
 * IBM Carbon "60" color tokens — the shades Carbon uses for interactive
 * elements. They're luminance-matched (≈0.16), so the white-on-accent text
 * baked into the shell stays legible whichever one is picked.
 */
export const ACCENT_PRESETS: AccentPreset[] = [
  { id: "blue", hex: "#0f62fe" },
  { id: "cyan", hex: "#0072c3" },
  { id: "teal", hex: "#007d79" },
  { id: "green", hex: "#198038" },
  { id: "purple", hex: "#8a3ffc" },
  { id: "magenta", hex: "#d02670" },
  { id: "red", hex: "#da1e28" },
  { id: "orange", hex: "#ba4e00" },
];

export const DEFAULT_ACCENT = "blue";
const DEFAULT_ACCENT_HEX = ACCENT_PRESETS[0].hex;

// ─── Color math (accent tokens are all derived from one base hex) ─────────────

type Rgb = [number, number, number];

function parseHex(hex: string): Rgb {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function toHex([r, g, b]: Rgb): string {
  const c = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Blend `amount` (0–1) of `to` into `from`. */
function mix(from: string, to: string, amount: number): string {
  const a = parseHex(from);
  const b = parseHex(to);
  return toHex([
    a[0] + (b[0] - a[0]) * amount,
    a[1] + (b[1] - a[1]) * amount,
    a[2] + (b[2] - a[2]) * amount,
  ]);
}

const lighten = (hex: string, amount: number) => mix(hex, "#ffffff", amount);
const darken = (hex: string, amount: number) => mix(hex, "#000000", amount);

/** HSL triplet ("219 99% 53%") for the Tailwind CSS variables in index.css. */
function hexToHslTriplet(hex: string): string {
  const [r, g, b] = parseHex(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;

  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (l > 0.5 ? 2 - max - min : max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }

  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/** Re-derive every accent-tinted token in a base palette from one hex. */
function withAccent(base: CarbonTheme, accent: string, dark: boolean): CarbonTheme {
  const soft = lighten(accent, 0.44); // ≈ Carbon "40" step
  return {
    ...base,
    interactive: accent,
    keySelected: accent,
    linkPrimary: dark ? soft : accent,
    selectedBorder: dark ? soft : accent,
    keySelectedBorder: dark ? soft : darken(accent, 0.2),
    selectedLayer: dark ? mix(base.bg, accent, 0.32) : lighten(accent, 0.8),
  };
}

/*
 * There is deliberately no "follow the browser accent" option.
 *
 * The only web API for it is the CSS `AccentColor` system keyword, which
 * Chromium does not implement — `CSS.supports("color", "AccentColor")` is false
 * as of Chrome 148. Since Studio needs Web Serial / WebHID, every browser that
 * can talk to a keyboard at all is Chromium, so the option could never do
 * anything for a real user. `Highlight` is the near miss worth knowing about: it
 * parses, but Chromium answers with a hard-coded #0078D7 rather than the OS
 * accent (measured against a Windows accent of #0078D4), so it would have
 * produced a fixed blue dressed up as a preference.
 */

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function isDarkFor(setting: ThemeSetting): boolean {
  return setting === "dark" || (setting === "system" && systemPrefersDark());
}

/*
 * Owns the light/dark decision: toggles `.dark` on <html> (drives the CSS-var
 * palette for Tailwind panels) and returns the matching Carbon token object for
 * the inline-styled shell.
 */
export function useCarbonTheme() {
  // Default to "system" so a first-time visitor follows the browser/OS theme
  // (an explicit user choice from Settings is still persisted and wins).
  const [setting, setSetting] = useLocalStorageState<ThemeSetting>(
    STORAGE_KEY,
    "system",
  );
  const [accent, setAccent] = useLocalStorageState<AccentSetting>(
    ACCENT_KEY,
    DEFAULT_ACCENT,
  );

  const dark = isDarkFor(setting);

  useEffect(() => {
    const apply = () => {
      document.documentElement.classList.toggle("dark", isDarkFor(setting));
    };
    apply();

    if (setting === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
  }, [setting]);

  // Retire the old "system" accent for anyone who has it stored, so the
  // preference pane doesn't show an empty selection.
  useEffect(() => {
    if (!ACCENT_PRESETS.some((p) => p.id === accent)) setAccent(DEFAULT_ACCENT);
  }, [accent, setAccent]);

  const accentHex = useMemo(
    () => ACCENT_PRESETS.find((p) => p.id === accent)?.hex ?? DEFAULT_ACCENT_HEX,
    [accent]
  );

  const theme = useMemo(
    () => withAccent(dark ? DARK : LIGHT, accentHex, dark),
    [dark, accentHex],
  );

  // Mirror the accent onto the CSS variables the reused Tailwind panels read.
  useEffect(() => {
    const hsl = hexToHslTriplet(accentHex);
    const root = document.documentElement.style;
    root.setProperty("--primary", hsl);
    root.setProperty("--accent", hsl);
  }, [accentHex]);

  return {
    setting,
    setSetting,
    isDark: dark,
    theme,
    toggle: () => setSetting(dark ? "light" : "dark"),
    accent,
    setAccent,
    accentHex,
  };
}
