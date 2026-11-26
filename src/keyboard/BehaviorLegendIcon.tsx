import type { BehaviorLegend } from "./behaviorLegend";

// Category glyph plus the generated short label. Sized so a 1u keycap at the
// default 42px pitch reads the icon first and the label second.
export function BehaviorLegendIcon({ legend }: { legend: BehaviorLegend }) {
  const Icon = legend.icon;
  const iconSize = legend.text ? 15 : 18;

  return (
    <div className="flex flex-col items-center justify-center gap-[2px] leading-none">
      <Icon size={iconSize} strokeWidth={1.9} aria-hidden className="opacity-80" />
      {legend.text && (
        <span className="max-w-full truncate px-0.5 text-[0.55rem] font-medium leading-none tracking-tight tabular-nums opacity-95">
          {legend.text}
        </span>
      )}
    </div>
  );
}
