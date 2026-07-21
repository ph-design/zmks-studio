import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Checkbox, CheckboxGroup } from "react-aria-components";
import { useTranslation } from "react-i18next";
import {
  Play,
  SkipForward,
  SkipBack,
  Square,
  VolumeX,
  Volume2,
  Volume1,
  Sun,
  SunDim,
  ChevronRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  hid_usage_from_page_and_id,
  hid_usage_page_get_ids,
  hid_usage_get_labels,
} from "../hid-usages";
import type { HidUsagePage } from "./HidUsagePicker";

function dePrefix(s: string): string {
  return s.replace(/^(Keyboard|Keypad|AC|AL) /, "");
}

interface KeyTab {
  id: string;
  label: string;
  filter: (pageId: number, usageId: number) => boolean;
}

const P12_MEDIA = new Set([
  0xb0, 0xb1, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xcd, 0xe2, 0xe9, 0xea, 0x6f, 0x70,
]);
const P12_SHORTCUTS = new Set([
  0x21a, 0x21b, 0x21c, 0x21d, 0x21e, 0x21f, 0x279,
  0x201, 0x202, 0x203, 0x207, 0x208,
  0x22d, 0x22e,
  0x223, 0x224, 0x225, 0x226, 0x227, 0x22a, 0x221,
  0x192, 0x196, 0x18a, 0x1b4, 0x18e, 0x19e, 0x19f,
]);

const P12_SHOWN_OTHER = new Set([0x30, 0x32]);

const KEY_TABS: KeyTab[] = [
  {
    id: "input",
    label: "Input",

    filter: (page, id) =>
      page === 7 &&
      ((id >= 0x04 && id <= 0x45) ||
        id === 0x64 ||
        (id >= 0x68 && id <= 0x73) ||
        (id >= 0xe0 && id <= 0xe7)),
  },
  {
    id: "navigation",
    label: "Navigation",
    filter: (page, id) => page === 7 && id >= 0x46 && id <= 0x52,
  },
  {
    id: "media",
    label: "Media",
    filter: (page, id) =>
      (page === 7 && id >= 0x7f && id <= 0x81) || (page === 12 && P12_MEDIA.has(id)),
  },
  {
    id: "shortcuts",
    label: "Shortcuts",
    filter: (page, id) =>
      (page === 7 && ((id >= 0x74 && id <= 0x7e) || id === 0x65)) ||
      (page === 12 && P12_SHORTCUTS.has(id)),
  },
  {
    id: "keypad",
    label: "Keypad",
    filter: (page, id) =>
      page === 7 &&
      (id === 0x53 ||
        (id >= 0x54 && id <= 0x63) ||
        id === 0x67 ||
        id === 0x85 ||
        id === 0x86 ||
        id === 0xb0 ||
        id === 0xb1),
  },
  {
    id: "other",
    label: "Other",
    filter: () => false,
  },
];


function isRareUsage(page: number, id: number): boolean {
  if (page === 7) {
    return (
      id <= 0x03 ||
      (id >= 0x82 && id <= 0x84) ||
      (id >= 0x87 && id <= 0xa4) ||
      (id >= 0xb2 && id <= 0xdd)
    );
  }
  return page === 12 && !P12_SHOWN_OTHER.has(id);
}

enum Mods {
  LeftControl = 0x01,
  LeftShift = 0x02,
  LeftAlt = 0x04,
  LeftGUI = 0x08,
  RightControl = 0x10,
  RightShift = 0x20,
  RightAlt = 0x40,
  RightGUI = 0x80,
}

const mod_labels: Record<Mods, string> = {
  [Mods.LeftControl]: "L-Ctrl",
  [Mods.LeftShift]: "L-Shift",
  [Mods.LeftAlt]: "L-Alt",
  [Mods.LeftGUI]: "L-GUI",
  [Mods.RightControl]: "R-Ctrl",
  [Mods.RightShift]: "R-Shift",
  [Mods.RightAlt]: "R-Alt",
  [Mods.RightGUI]: "R-GUI",
};

const all_mods = [
  Mods.LeftControl,
  Mods.LeftShift,
  Mods.LeftAlt,
  Mods.LeftGUI,
  Mods.RightControl,
  Mods.RightShift,
  Mods.RightAlt,
  Mods.RightGUI,
];

const mod_pairs: [Mods, Mods][] = [
  [Mods.LeftControl, Mods.RightControl],
  [Mods.LeftShift, Mods.RightShift],
  [Mods.LeftAlt, Mods.RightAlt],
  [Mods.LeftGUI, Mods.RightGUI],
];

function mods_to_flags(mods: Mods[]): number {
  return mods.reduce((a, v) => a + v, 0);
}

function mask_mods(value: number) {
  return value & ~(mods_to_flags(all_mods) << 24);
}

interface KeyGridItem {
  usageValue: number;
  label: string;
  rawName: string;
  shortLabel: string;
  displayLabel: string;
  pageId: number;
  usageId: number;
  colSpan: 1 | 2 | 3;
}

// Consumer page (12) usage ID → icon
const MEDIA_ICONS: Record<number, LucideIcon> = {
  0xcd: Play,
  0xb5: SkipForward,
  0xb6: SkipBack,
  0xb7: Square,
  0xe2: VolumeX,
  0xe9: Volume2,
  0xea: Volume1,
  0x6f: Sun,
  0x70: SunDim,
};

// One key cell in the grid.
const KeyButton = ({
  k,
  selected,
  onClick,
}: {
  k: KeyGridItem;
  selected: boolean;
  onClick: () => void;
}) => {
  const spanClass = k.colSpan === 3 ? "col-span-3" : k.colSpan === 2 ? "col-span-2" : "";
  const MediaIcon = k.pageId === 12 ? MEDIA_ICONS[k.usageId] : undefined;
  return (
    <button
      data-selected={selected ? "true" : undefined}
      onClick={onClick}
      title={k.rawName}
      className={`${spanClass} h-[3.4rem] rounded text-sm font-medium cursor-pointer transition-colors flex items-center justify-center ${
        selected ? "bg-primary text-primary-content" : "bg-base-100 text-base-content hover:bg-base-300"
      }`}
    >
      {MediaIcon ? (
        <MediaIcon size={18} />
      ) : (
        <span className="truncate px-1 leading-tight text-center">{k.displayLabel}</span>
      )}
    </button>
  );
};

export interface HidUsageGridProps {
  value?: number;
  usagePages: HidUsagePage[];
  onValueChanged: (value?: number) => void;
}

export const HidUsageGrid = ({
  value,
  usagePages,
  onValueChanged,
}: HidUsageGridProps) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("input");
  const [filter, setFilter] = useState("");
  const [showRare, setShowRare] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  const mods = useMemo(() => {
    const flags = value ? value >> 24 : 0;
    return all_mods.filter((m) => m & flags).map((m) => m.toLocaleString());
  }, [value]);

  const allKeys = useMemo(() => {
    const keys: KeyGridItem[] = [];
    for (const page of usagePages) {
      const info = hid_usage_page_get_ids(page.id);
      if (!info) continue;
      for (const usage of info.UsageIds) {
        if (
          (page.min !== undefined && usage.Id < page.min) ||
          (page.max !== undefined && usage.Id > page.max)
        ) {
          if (!(page.id === 7 && usage.Id >= 0xe0 && usage.Id <= 0xe7)) {
            continue;
          }
        }
        // The grid has room (cells span 1–3 cols), so show the most readable
        // name available: full `long` when curated, else the de-prefixed name.
        const labels = hid_usage_get_labels(page.id, usage.Id);
        const display = dePrefix(labels.long || labels.short || usage.Name);
        const colSpan: 1 | 2 | 3 = display.length > 7 ? 3 : display.length > 3 ? 2 : 1;
        keys.push({
          usageValue: hid_usage_from_page_and_id(page.id, usage.Id),
          label: display,
          rawName: usage.Name,
          shortLabel: dePrefix(labels.short || usage.Name),
          displayLabel: display,
          pageId: page.id,
          usageId: usage.Id,
          colSpan,
        });
      }
    }
    return keys;
  }, [usagePages]);

  const tabKeys = useMemo(() => {
    const result: Record<string, KeyGridItem[]> = {};
    const classified = new Set<number>();

    for (const tab of KEY_TABS) {
      if (tab.id === "other") continue;
      result[tab.id] = [];
      for (const key of allKeys) {
        if (tab.filter(key.pageId, key.usageId)) {
          result[tab.id].push(key);
          classified.add(key.usageValue);
        }
      }
    }

    result["other"] = allKeys.filter((k) => !classified.has(k.usageValue));

    return result;
  }, [allKeys]);

  useEffect(() => {
    if (value === undefined) return;
    const masked = mask_mods(value);
    if (masked === 0) return;
    for (const tab of KEY_TABS) {
      if (tab.id === "other") continue;
      const keys = tabKeys[tab.id];
      if (keys?.some((k) => k.usageValue === masked)) {
        setActiveTab(tab.id);
        return;
      }
    }
    if (tabKeys["other"]?.some((k) => k.usageValue === masked)) {
      setActiveTab("other");
    }
  }, [value, tabKeys]);

  useEffect(() => {
    if (value === undefined) return;
    const masked = mask_mods(value);
    if (masked === 0) return;
    requestAnimationFrame(() => {
      const container = gridRef.current;
      if (!container) return;
      const selected = container.querySelector('[data-selected="true"]') as HTMLElement | null;
      if (selected) {
        selected.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    });
  }, [value, activeTab]);

  const isSearching = filter.length > 0;

  const filteredKeys = useMemo(() => {
    if (!isSearching) return tabKeys[activeTab] || [];
    const lowerFilter = filter.toLowerCase();
    return allKeys.filter((k) => {
      const hay = `${k.label}\0${k.rawName}\0${k.shortLabel}\0${k.displayLabel}`.toLowerCase();
      return hay.includes(lowerFilter);
    });
  }, [tabKeys, activeTab, filter, isSearching, allKeys]);

  const selectedUsageValue = value !== undefined ? mask_mods(value) : undefined;

  // Auto-expand the rare section if the currently-bound key lives in it.
  const forceShowRare = useMemo(() => {
    if (selectedUsageValue === undefined) return false;
    const k = (tabKeys["other"] || []).find((x) => x.usageValue === selectedUsageValue);
    return !!k && isRareUsage(k.pageId, k.usageId);
  }, [selectedUsageValue, tabKeys]);
  const rareOpen = showRare || forceShowRare;

  const handleKeyClick = useCallback(
    (usageValue: number) => {
      const modFlags = mods_to_flags(mods.map((m) => parseInt(m)));
      const newValue = usageValue | (modFlags << 24);
      onValueChanged(newValue);
    },
    [onValueChanged, mods]
  );

  const modifiersChanged = useCallback(
    (m: string[]) => {
      if (!value) return;
      const modFlags = mods_to_flags(m.map((m) => parseInt(m)));
      const newValue = mask_mods(value) | (modFlags << 24);
      onValueChanged(newValue);
    },
    [value, onValueChanged]
  );

  const availableTabs = useMemo(
    () => KEY_TABS.filter((t) => (tabKeys[t.id]?.length || 0) > 0),
    [tabKeys]
  );

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex-1 flex flex-col min-w-0 p-3">
        <div className="flex items-center gap-2 mb-2 flex-wrap flex-shrink-0">
          {!isSearching && (
            <div className="flex gap-1 flex-wrap">
              {availableTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 h-8 text-sm transition-colors cursor-pointer border-b-2 ${activeTab === tab.id
                      ? "border-primary text-base-content font-medium"
                      : "border-transparent text-base-content/60 hover:text-base-content hover:border-base-content/30"
                    }`}
                >
                  {t(`hid.tabs.${tab.id}`)}
                </button>
              ))}
            </div>
          )}
          {isSearching && (
            <span className="text-sm text-base-content/50">
              {filteredKeys.length} {t("hid.general.resultsFound")}
            </span>
          )}
          <div className="relative ml-auto">
            <input
              type="text"
              placeholder={t("hid.general.filter")}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="pl-7 pr-2 py-1 bg-base-100 border border-base-300 text-base-content text-sm w-40 focus:outline-none focus:border-primary"
            />
            <svg
              className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-base-content/50"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
        </div>

        {(() => {
          const isOther = activeTab === "other" && !isSearching;
          const shown = isOther
            ? filteredKeys.filter((k) => !isRareUsage(k.pageId, k.usageId))
            : filteredKeys;
          const rare = isOther
            ? filteredKeys.filter((k) => isRareUsage(k.pageId, k.usageId))
            : [];
          return (
            <div className="flex-1 min-h-0 overflow-y-auto pr-1 custom-scrollbar">
              <div
                key={isSearching ? "search" : activeTab}
                ref={gridRef}
                className="grid grid-cols-[repeat(auto-fill,minmax(3.4rem,1fr))] gap-1.5 animate-fade-in"
              >
                {shown.map((key) => (
                  <KeyButton
                    key={key.usageValue}
                    k={key}
                    selected={selectedUsageValue === key.usageValue}
                    onClick={() => handleKeyClick(key.usageValue)}
                  />
                ))}
                {shown.length === 0 && rare.length === 0 && (
                  <div className="col-span-full text-center text-base-content/50 py-4 text-sm">
                    {t("hid.general.noKeys")}
                  </div>
                )}
              </div>

              {rare.length > 0 && (
                <div className="mt-2">
                  <button
                    type="button"
                    aria-expanded={rareOpen}
                    onClick={() => setShowRare((v) => !v)}
                    className="flex items-center gap-1 text-sm text-base-content/50 hover:text-base-content/80 transition-colors cursor-pointer"
                  >
                    <ChevronRight
                      className={`w-3.5 h-3.5 transition-transform ${rareOpen ? "rotate-90" : ""}`}
                    />
                    {t("hid.general.rarelyUsed", "Rarely used")} ({rare.length})
                  </button>
                  {rareOpen && (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(3.4rem,1fr))] gap-1.5 overflow-y-auto max-h-52 pr-1 mt-2 animate-fade-in">
                      {rare.map((key) => (
                        <KeyButton
                          key={key.usageValue}
                          k={key}
                          selected={selectedUsageValue === key.usageValue}
                          onClick={() => handleKeyClick(key.usageValue)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}
      </div>

      <div className="flex-shrink-0 w-44 border-l border-base-300 p-3 overflow-y-auto custom-scrollbar">
        <div className="text-sm text-base-content/60 mb-2 font-medium">
          {t("hid.general.modifiersTitle")}
        </div>
        <CheckboxGroup
          aria-label={t("hid.general.implicitModifiers")}
          className="grid grid-cols-2 gap-1.5"
          value={mods}
          onChange={modifiersChanged}
        >
          {mod_pairs.map(([left, right]) => (
            <div key={left} className="contents">
              <Checkbox
                value={left.toLocaleString()}
                className="text-nowrap cursor-pointer grid px-2 py-2 content-center justify-center text-sm rounded rac-selected:bg-primary bg-base-100 hover:bg-base-300 rac-selected:text-primary-content text-base-content"
              >
                {mod_labels[left]}
              </Checkbox>
              <Checkbox
                value={right.toLocaleString()}
                className="text-nowrap cursor-pointer grid px-2 py-2 content-center justify-center text-sm rounded rac-selected:bg-primary bg-base-100 hover:bg-base-300 rac-selected:text-primary-content text-base-content"
              >
                {mod_labels[right]}
              </Checkbox>
            </div>
          ))}
        </CheckboxGroup>
      </div>
    </div>
  );
};
