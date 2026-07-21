import { useEffect } from "react";
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

const STORAGE_KEY = "zmk-studio-theme";

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
  const [setting, setSetting] = useLocalStorageState<ThemeSetting>(
    STORAGE_KEY,
    "dark",
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

  return {
    setting,
    setSetting,
    isDark: dark,
    theme: dark ? DARK : LIGHT,
    toggle: () => setSetting(dark ? "light" : "dark"),
  };
}
