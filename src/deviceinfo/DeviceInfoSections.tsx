import type { CarbonTheme } from "../carbon/theme";
import { Badge, Facts, type Fact } from "../carbon/CarbonChrome";
import type { InfoRow, InfoSection, Translate } from "./sections";
import { EMPTY_VALUE } from "./sections";

interface DeviceInfoSectionsProps {
  th: CarbonTheme;
  t: Translate;
  sections: InfoSection[];
}

export function DeviceInfoSections({ th, t, sections }: DeviceInfoSectionsProps) {
  return (
    <div className="mb-1 flex flex-col gap-3">
      {sections.map((section) => (
        <SectionCard key={section.id} th={th} t={t} section={section} />
      ))}
    </div>
  );
}

function toFact(row: InfoRow): Fact {
  const empty = row.value === EMPTY_VALUE;
  return {
    label: row.label,
    value: empty ? <span className="text-helper">{row.value}</span> : row.value,
    mono: true,
    copy: row.copyable && !empty,
  };
}

function SectionCard({ th, t, section }: {
  th: CarbonTheme;
  t: Translate;
  section: InfoSection;
}) {
  const showCaps = !!section.capabilities && section.capabilities.length > 0;
  const hasValue = section.rows.some((row) => row.value !== EMPTY_VALUE);

  // Show fallback data when a group is unavailable.
  const showBody = section.status === "ok" || (section.status === "unavailable" && hasValue);

  return (
    <section className="border border-base-300">
      <header className={`flex items-center justify-between gap-3 bg-layer1 px-4 py-2 ${showBody ? "border-b border-base-300" : ""}`}>
        <span className="text-sm font-semibold leading-[18px] tracking-[0.16px] text-base-content">
          {section.title}
        </span>
        {section.status !== "ok" && (
          <span className="text-right text-xs leading-4 text-helper">
            {statusNote(section, t)}
          </span>
        )}
      </header>

      {showBody && (
        <div>
          <Facts th={th} t={t} bordered={false} rows={section.rows.map(toFact)} />

          {showCaps && (
            <div className={`flex items-start gap-2 px-3 py-2 ${
              section.rows.length > 0 ? "border-t border-base-300" : ""
            } ${section.rows.length % 2 === 0 ? "bg-layer1" : "bg-background"}`}>
              <span className="w-40 shrink-0 text-xs leading-4 tracking-[0.32px] text-helper">
                {section.capabilitiesLabel}
              </span>
              <span className="flex min-w-0 flex-wrap gap-1">
                {section.capabilities!.map((c) => (
                  <Badge key={c.label} th={th} tone={c.on ? "ok" : "neutral"}>{c.label}</Badge>
                ))}
              </span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function statusNote(section: InfoSection, t: Translate): string {
  if (section.status === "loading") return t("carbon.device.reading", "Reading…");
  if (section.status === "unavailable") {
    return t("carbon.device.unsupported", "Unable to read. Check the firmware version.");
  }
  // "idle": connected but locked, so nothing has been requested yet.
  return t("carbon.device.waitingUnlock", "Unlock the keyboard to read this");
}
