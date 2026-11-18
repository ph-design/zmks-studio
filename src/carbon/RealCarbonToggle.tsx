/*
 * "Real Carbon" toggle — the DIP-switch design: a rectangular slot with a
 * square handle, blue when on, state text supplied by the call site. Colors
 * come from the CSS variables (not `th`) so it works in both the inline-styled
 * Carbon shell and the Tailwind panels, and it follows accent changes.
 */
export function RealCarbonToggle({ checked, onChange, disabled, size = "md", ariaLabel }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  size?: "md" | "sm";
  ariaLabel?: string;
}) {
  const sm = size === "sm";
  const w = sm ? 36 : 48;
  const h = sm ? 18 : 24;
  const knob = sm ? 14 : 20;
  const travel = sm ? 18 : 24;

  const on = "hsl(var(--primary))";
  const onKnob = "hsl(var(--primary-content))";
  const offBorder = "hsl(var(--base-content) / 0.45)";
  const offKnob = "hsl(var(--base-content))";

  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        position: "relative",
        flexShrink: 0,
        width: w,
        height: h,
        borderRadius: 0,
        border: `1px solid ${checked ? on : offBorder}`,
        background: checked ? on : "transparent",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.45 : 1,
        padding: 0,
        transition: "background 110ms cubic-bezier(0.2, 0, 0.38, 0.9), border-color 110ms cubic-bezier(0.2, 0, 0.38, 0.9)",
      }}
    >
      {checked && (
        <svg
          width={sm ? 8 : 10}
          height={sm ? 7 : 9}
          viewBox="0 0 10 8"
          fill="none"
          style={{ position: "absolute", left: sm ? 3 : 5, top: sm ? 4 : 6, pointerEvents: "none" }}
        >
          <polyline points="1,4 3.5,7 9,1" stroke={onKnob} strokeWidth="1.6" />
        </svg>
      )}
      <span
        style={{
          position: "absolute",
          top: 1,
          left: 1,
          width: knob,
          height: knob,
          background: checked ? onKnob : offKnob,
          transform: checked ? `translateX(${travel}px)` : "none",
          transition: "transform 110ms cubic-bezier(0.2, 0, 0.38, 0.9), background 110ms cubic-bezier(0.2, 0, 0.38, 0.9)",
        }}
      />
    </button>
  );
}
