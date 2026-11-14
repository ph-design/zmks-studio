import { useId, useState, type CSSProperties, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export function FeatureRail({ title, style, children }: {
  title: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <aside className="carbon-feature-rail" style={style} data-open={open}>
      <button type="button" className="feature-rail-toggle" aria-expanded={open}
        aria-controls={id} onClick={() => setOpen(value => !value)}>
        <span>{title}</span><ChevronDown size={16} className={open ? "rotate-180" : ""} />
      </button>
      <div id={id} className="feature-rail-body">{children}</div>
    </aside>
  );
}
