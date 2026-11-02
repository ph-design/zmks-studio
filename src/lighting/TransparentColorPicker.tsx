import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";

import HsbColorPicker, { type HsbColor } from "./HsbColorPicker";

interface TransparentColorPickerProps {
  hsb: HsbColor;
  transparent: boolean;
  disabled?: boolean;
  onHsbChanged: (hsb: HsbColor) => void;
  onTransparentChange: (transparent: boolean) => void;
}

function ModeButton({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`h-8 px-3 inline-flex items-center gap-1.5 text-sm border-r border-base-300 last:border-r-0 transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-inset disabled:cursor-default ${
        active
          ? "bg-primary/10 text-primary"
          : "bg-base-100 text-base-content/70 hover:bg-base-200"
      }`}
    >
      <Check aria-hidden="true" className={`h-3.5 w-3.5 ${active ? "visible" : "invisible"}`} />
      {children}
    </button>
  );
}

export default function TransparentColorPicker({
  hsb,
  transparent,
  disabled,
  onHsbChanged,
  onTransparentChange,
}: TransparentColorPickerProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label={t("lighting.color")} className="inline-flex self-start border border-base-300">
        <ModeButton active={!transparent} disabled={disabled} onClick={() => onTransparentChange(false)}>
          {t("lighting.color")}
        </ModeButton>
        <ModeButton active={transparent} disabled={disabled} onClick={() => onTransparentChange(true)}>
          <span
            aria-hidden="true"
            className="inline-block h-3.5 w-3.5 border border-base-300"
            style={{ background: "repeating-conic-gradient(#d1d5db 0% 25%, #fff 0% 50%) 0 0 / 8px 8px" }}
          />
          {t("lighting.transparent", "Transparent")}
        </ModeButton>
      </div>
      <HsbColorPicker hsb={hsb} onHsbChanged={onHsbChanged} disabled={disabled || transparent} />
      {transparent && (
        <p className="text-xs text-base-content/50">
          {t("lighting.transparentHint", "Show the underlying RGB effect")}
        </p>
      )}
    </div>
  );
}
