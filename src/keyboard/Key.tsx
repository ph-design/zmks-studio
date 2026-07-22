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
  onClick,
  children,
}: PropsWithChildren<KeyProps>) => {
  // 4px inter-key gutter (template style: square, bordered, airy spacing).
  const pixelWidth = width * oneU - 4;
  const pixelHeight = height * oneU - 4;

  return (
    <button
      className={`group relative flex justify-center items-center cursor-pointer transition-colors border-[1.5px] ${selected
        ? "bg-primary text-primary-content border-primary"
        : "bg-base-100 text-base-content border-base-300 hover:border-base-content/40"
        } ${pressed ? "z-10 ring-2 ring-inset ring-primary bg-primary/25" : "z-0"}`}
      style={{
        width: `${pixelWidth}px`,
        height: `${pixelHeight}px`,
      }}
      onClick={onClick}
    >
      <div className={`absolute text-[0.55rem] ${selected ? "text-primary-content" : "z1text-base-content"} opacity-80 top-1 text-nowrap left-1/2 font-light -translate-x-1/2 text-center transition-opacity duration-200`}>{shortenHeader(header)}</div>
      {children}
    </button>
  );
};
