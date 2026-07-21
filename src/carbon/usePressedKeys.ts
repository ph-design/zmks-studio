import { useEffect, useState } from "react";
import { hid_usage_from_page_and_id } from "../hid-usages";

/*
 * Live input feedback for the on-screen keyboard. We listen to the browser's
 * own keydown/keyup (the OS still delivers keystrokes while a keyboard is in
 * studio mode) and map each event.code → HID usage (page 7). Callers compare
 * the returned usage set against each binding's keycode to light matching keys.
 *
 * Frontend-only: no firmware/RPC involvement, so it respects "don't touch the
 * backend" while still giving a responsive key tester.
 */

// event.code → HID Keyboard/Keypad (page 7) usage id.
const CODE_TO_ID: Record<string, number> = (() => {
  const map: Record<string, number> = {};
  // Letters A–Z → 0x04..0x1d
  for (let i = 0; i < 26; i++) {
    map[`Key${String.fromCharCode(65 + i)}`] = 0x04 + i;
  }
  // Digits 1–9 → 0x1e..0x26, 0 → 0x27
  for (let i = 1; i <= 9; i++) map[`Digit${i}`] = 0x1e + (i - 1);
  map["Digit0"] = 0x27;
  // Function keys F1–F12 → 0x3a..0x45
  for (let i = 1; i <= 12; i++) map[`F${i}`] = 0x3a + (i - 1);
  // Numpad 1–9 → 0x59..0x61, 0 → 0x62
  for (let i = 1; i <= 9; i++) map[`Numpad${i}`] = 0x59 + (i - 1);
  map["Numpad0"] = 0x62;

  Object.assign(map, {
    Enter: 0x28,
    Escape: 0x29,
    Backspace: 0x2a,
    Tab: 0x2b,
    Space: 0x2c,
    Minus: 0x2d,
    Equal: 0x2e,
    BracketLeft: 0x2f,
    BracketRight: 0x30,
    Backslash: 0x31,
    Semicolon: 0x33,
    Quote: 0x34,
    Backquote: 0x35,
    Comma: 0x36,
    Period: 0x37,
    Slash: 0x38,
    CapsLock: 0x39,
    PrintScreen: 0x46,
    ScrollLock: 0x47,
    Pause: 0x48,
    Insert: 0x49,
    Home: 0x4a,
    PageUp: 0x4b,
    Delete: 0x4c,
    End: 0x4d,
    PageDown: 0x4e,
    ArrowRight: 0x4f,
    ArrowLeft: 0x50,
    ArrowDown: 0x51,
    ArrowUp: 0x52,
    NumLock: 0x53,
    NumpadDivide: 0x54,
    NumpadMultiply: 0x55,
    NumpadSubtract: 0x56,
    NumpadAdd: 0x57,
    NumpadEnter: 0x58,
    NumpadDecimal: 0x63,
    ContextMenu: 0x65,
    ControlLeft: 0xe0,
    ShiftLeft: 0xe1,
    AltLeft: 0xe2,
    MetaLeft: 0xe3,
    ControlRight: 0xe4,
    ShiftRight: 0xe5,
    AltRight: 0xe6,
    MetaRight: 0xe7,
  });
  return map;
})();

// Keys we swallow so the page doesn't scroll/navigate while testing.
const SWALLOW = new Set([
  "Tab", "Space", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown",
  "PageUp", "PageDown", "Home", "End", "Backspace",
]);

function isEditable(el: EventTarget | null): boolean {
  const node = el as HTMLElement | null;
  if (!node) return false;
  const tag = node.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || node.isContentEditable === true;
}

export function usePressedKeys(enabled: boolean): Set<number> {
  const [pressed, setPressed] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!enabled) {
      setPressed((prev) => (prev.size ? new Set() : prev));
      return;
    }

    const add = (usage: number) =>
      setPressed((prev) => {
        if (prev.has(usage)) return prev;
        const next = new Set(prev);
        next.add(usage);
        return next;
      });
    const remove = (usage: number) =>
      setPressed((prev) => {
        if (!prev.has(usage)) return prev;
        const next = new Set(prev);
        next.delete(usage);
        return next;
      });

    const onDown = (e: KeyboardEvent) => {
      if (isEditable(e.target)) return;
      // Let Ctrl/Cmd shortcuts (undo/redo/save) pass through without lighting keys.
      if (e.ctrlKey || e.metaKey) return;
      const id = CODE_TO_ID[e.code];
      if (id === undefined) return;
      if (SWALLOW.has(e.code)) e.preventDefault();
      add(hid_usage_from_page_and_id(7, id));
    };
    const onUp = (e: KeyboardEvent) => {
      const id = CODE_TO_ID[e.code];
      if (id === undefined) return;
      remove(hid_usage_from_page_and_id(7, id));
    };
    // A blur can drop a keyup (e.g. Alt-Tab); clear everything to avoid stuck keys.
    const onBlur = () => setPressed((prev) => (prev.size ? new Set() : prev));

    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [enabled]);

  return pressed;
}
