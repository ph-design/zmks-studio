/** @type {import('tailwindcss').Config} */
import trac from "tailwindcss-react-aria-components";

// IBM Carbon Design tokens are driven by CSS variables (see src/index.css),
// switched between light/dark by toggling the `.dark` class on <html>. Token
// NAMES are kept identical to the previous theme so existing feature panels
// (LightingControl, BehaviorBindingPicker, HidUsageGrid, …) re-skin as-is.
export default {
  darkMode: "class",
  content: ["./index.html", "./download.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    fontSize: {
      "2xs": "0.625rem",
      xs: "0.75rem",
      sm: "0.875rem",
      base: "1rem",
      lg: "1.125rem",
      xl: "1.25rem",
      "2xl": "1.5rem",
    },
    extend: {
      fontFamily: {
        sans: ["IBM Plex Sans", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "monospace"],
        keycap: ["IBM Plex Mono", "monospace"],
      },
      colors: {
        background: "hsl(var(--background) / <alpha-value>)",
        primary: "hsl(var(--primary) / <alpha-value>)",
        "primary-content": "hsl(var(--primary-content) / <alpha-value>)",
        secondary: "hsl(var(--secondary) / <alpha-value>)",
        accent: "hsl(var(--accent) / <alpha-value>)",
        "base-content": "hsl(var(--base-content) / <alpha-value>)",
        "base-100": "hsl(var(--base-100) / <alpha-value>)",
        "base-200": "hsl(var(--base-200) / <alpha-value>)",
        "base-300": "hsl(var(--base-300) / <alpha-value>)",
        // Carbon status colors (also available to feature panels)
        success: "hsl(var(--success) / <alpha-value>)",
        warning: "hsl(var(--warning) / <alpha-value>)",
        error: "hsl(var(--error) / <alpha-value>)",
        layer1: "var(--carbon-layer1)",
        layer2: "var(--carbon-layer2)",
        "secondary-content": "var(--carbon-secondary-content)",
        helper: "var(--carbon-text-helper)",
        disabled: "var(--carbon-text-disabled)",
        strong: "var(--carbon-border-strong)",
        selected: "var(--carbon-selected-bg)",
        "selected-border": "var(--carbon-selected-border)",
        "selected-layer": "var(--carbon-selected-layer)",
        field: "var(--carbon-field)",
        icon: "var(--carbon-icon)",
        link: "var(--carbon-link)",
        header: "var(--carbon-header)",
        rail: "var(--carbon-rail)",
        breadcrumb: "var(--carbon-breadcrumb)",
        status: "var(--carbon-status)",
        "success-bg": "var(--carbon-success-bg)",
        "error-bg": "var(--carbon-error-bg)",
        info: "var(--carbon-info)",
        "info-bg": "var(--carbon-info-bg)",
      },
      borderRadius: {
        // Carbon uses square corners for surfaces/controls; only pills/circles round.
        none: "0px",
        sm: "0px",
        DEFAULT: "0px",
        md: "0px",
        lg: "0px",
        xl: "0px",
        "2xl": "0px",
        "3xl": "0px",
        full: "9999px",
      },
    },
    fontFamily: {
      keycap: ["IBM Plex Mono", "monospace"],
    },
  },
  plugins: [trac({ prefix: "rac" })],
};
