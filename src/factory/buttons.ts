import type { CSSProperties } from "react";

import type { CarbonTheme } from "../carbon/theme";
import { secBtn } from "../carbon/CarbonChrome";

/*
 * Bench button styles, kept out of `FactoryChrome.tsx` so that file exports
 * components only — the react-refresh rule in this repo treats a module mixing
 * components and plain functions as a hot-reload hazard, and it is right to.
 *
 * A factory pane is read standing up and at arm's length, so these run larger
 * than the Carbon defaults and the primary action is one filled button rather
 * than a row of equals.
 */

export function primaryBtn(th: CarbonTheme, disabled = false): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    height: 40,
    padding: "0 20px",
    fontSize: 14,
    fontWeight: 500,
    fontFamily: "var(--font-sans)",
    background: disabled ? th.layer2 : th.interactive,
    color: disabled ? th.textDisabled : "#ffffff",
    border: "none",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
  };
}

export function secondaryBtn(th: CarbonTheme, disabled = false): CSSProperties {
  return { ...secBtn(th), height: 40, fontSize: 14, opacity: disabled ? 0.6 : 1 };
}
