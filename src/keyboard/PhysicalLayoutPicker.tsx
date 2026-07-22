import {
  Button,
  Key,
  ListBox,
  ListBoxItem,
  Popover,
  Select,
  SelectValue,
  Text,
} from "react-aria-components";
import { ChevronDown } from "lucide-react";
import { PhysicalLayout, type KeyPosition } from "./PhysicalLayout";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

export interface PhysicalLayoutItem {
  name: string;
  keys: Array<Omit<KeyPosition, "id">>;
}

export type PhysicalLayoutClickCallback = (index: number) => void;

export interface PhysicalLayoutPickerProps {
  layouts: Array<PhysicalLayoutItem>;

  selectedPhysicalLayoutIndex: number;

  onPhysicalLayoutClicked?: PhysicalLayoutClickCallback;
}

export const PhysicalLayoutPicker = ({
  layouts,
  selectedPhysicalLayoutIndex,
  onPhysicalLayoutClicked,
}: PhysicalLayoutPickerProps) => {
  const { t } = useTranslation();
  const selectionChanged = useCallback(
    (e: Key | null) => {
      if (e == null) return;
      onPhysicalLayoutClicked?.(layouts.findIndex((l) => l.name === e));
    },
    [layouts, onPhysicalLayoutClicked],
  );

  return (
    <Select
      onSelectionChange={selectionChanged}
      className="flex flex-col"
      aria-label={t("keyboard.layout")}
      selectedKey={layouts[selectedPhysicalLayoutIndex].name}
    >
      <Button className="flex items-center justify-between gap-2 h-9 px-3 min-w-[14rem] border border-base-300 bg-base-100 text-base-content text-sm text-left cursor-pointer hover:border-base-content/40 focus:outline-none">
        <SelectValue<PhysicalLayoutItem> className="truncate">
          {(v) => {
            return <span className="truncate">{v.selectedItem?.name}</span>;
          }}
        </SelectValue>
        <ChevronDown className="w-4 h-4 flex-shrink-0 opacity-60" />
      </Button>
      <Popover className="min-w-[var(--trigger-width)] max-h-80 shadow-lg text-base-content border border-base-300 bg-base-100 overflow-auto">
        <ListBox items={layouts}>
          {(l) => (
            <ListBoxItem
              id={l.name}
              textValue={l.name}
              className="px-3 py-2 aria-selected:bg-primary aria-selected:text-primary-content data-[focused]:bg-base-300 cursor-pointer flex flex-col gap-1"
            >
              <Text slot="label" className="text-sm">{l.name}</Text>
              <div className="flex justify-center opacity-90">
                <PhysicalLayout
                  oneU={15}
                  hoverZoom={false}
                  positions={l.keys.map(
                    ({ x, y, width, height, r, rx, ry }, i) => ({
                      id: `${layouts[selectedPhysicalLayoutIndex].name}-${i}`,
                      x: x / 100.0,
                      y: y / 100.0,
                      width: width / 100.0,
                      height: height / 100.0,
                      r: (r || 0) / 100.0,
                      rx: (rx || 0) / 100.0,
                      ry: (ry || 0) / 100.0,
                    }),
                  )}
                />
              </div>
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </Select>
  );
};
