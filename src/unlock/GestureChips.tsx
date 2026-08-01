/*
 * A key gesture rendered as keycap-ish chips ("Fn + \"). Tailwind-only on
 * purpose: the unlock gesture has to render both inside the Carbon shell and in
 * the connect modal, which style themselves differently, and the `base-*`
 * tokens follow the active theme in either place.
 */
export function GestureChips({ keys, size = "md" }: {
  keys: string[];
  size?: "sm" | "md";
}) {
  const chip =
    size === "sm"
      ? "min-w-6 px-1.5 py-0.5 text-[0.7rem]"
      : "min-w-7 px-2 py-1 text-xs";

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 align-middle">
      {keys.map((label, i) => (
        <span key={`${label}-${i}`} className="inline-flex items-center gap-1.5">
          {i > 0 && <span className="text-base-content/40">+</span>}
          <kbd className={`inline-flex items-center justify-center border border-base-300 bg-base-200 font-medium text-base-content ${chip}`}>
            {label}
          </kbd>
        </span>
      ))}
    </span>
  );
}
