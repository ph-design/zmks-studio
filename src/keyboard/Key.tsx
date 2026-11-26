import { PropsWithChildren } from "react";
import BehaviorShortNames from "./behavior-short-names.json";

interface KeyProps {
  selected?: boolean;
  pressed?: boolean;
  width: number;
  height: number;
  oneU: number;
  hoverZoom?: boolean;
  header?: string;
  /** Non-matrix input (frame button, encoder) — outlined so it reads apart. */
  accent?: boolean;
  /** Short name for a non-matrix input, e.g. "Side". */
  cornerLabel?: string;
  /** Present but inert here — e.g. a key with no LED in the lighting canvas. */
  dimmed?: boolean;
  onClick?: () => void;
}

interface BehaviorShortName {
  short?: string;
}

const MAX_HEADER_LENGTH = 9;
const shortNames: Record<string, BehaviorShortName> = BehaviorShortNames;

const shortenHeader = (header: string | undefined) => {
  if(typeof header === "undefined"){
    return "";
  }
  // Empty string is a valid header for behaviors where we don't want to see a header, which is falsy
  // So we use an undefined check here
  if(typeof shortNames[header]?.short !== "undefined"){
    return shortNames[header].short;
  } else if(header.length > MAX_HEADER_LENGTH){
    const words = header.split(/[\s,-]+/);
    const lettersPerWord = Math.trunc(MAX_HEADER_LENGTH / words.length);
    return words.map((word) => (word.substring(0,lettersPerWord))).join("");
  } else {
    return header;
  }
}

export const Key = ({
  selected = false,
  pressed = false,
  width,
  height,
  oneU,
  header,
  accent = false,
  cornerLabel,
  dimmed = false,
  onClick,
  children,
}: PropsWithChildren<KeyProps>) => {
  // 4px inter-key gutter (template style: square, bordered, airy spacing).
  const pixelWidth = width * oneU - 4;
  const pixelHeight = height * oneU - 4;

  const idleBorder = dimmed
    ? "bg-base-100 text-base-content border-base-300"
    : accent
      ? "bg-base-100 text-base-content border-dashed border-primary/70 hover:border-primary"
      : "bg-base-100 text-base-content border-base-300 hover:border-base-content/40";

  return (
    <button
      className={`group relative flex justify-center items-center transition-colors border-[1.5px] ${dimmed ? "cursor-default" : "cursor-pointer"} ${selected
        ? "bg-primary text-primary-content border-primary"
        : idleBorder
        } ${pressed ? "z-10 ring-2 ring-inset ring-primary bg-primary/25" : "z-0"}`}
      style={{
        width: `${pixelWidth}px`,
        height: `${pixelHeight}px`,
        opacity: dimmed ? 0.4 : undefined,
      }}
      onClick={onClick}
    >
      <div className={`absolute max-w-[calc(100%-4px)] truncate px-0.5 text-[0.42rem] tracking-tight ${selected ? "text-primary-content" : "z1text-base-content"} opacity-60 top-1 text-nowrap left-1/2 font-normal -translate-x-1/2 text-center transition-opacity duration-200`}>{shortenHeader(header)}</div>
      {children}
      {cornerLabel && (
        <div className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[0.42rem] uppercase tracking-wide text-nowrap ${selected ? "text-primary-content opacity-80" : "text-primary opacity-90"}`}>
          {cornerLabel}
        </div>
      )}
    </button>
  );
};
