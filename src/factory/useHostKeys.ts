import { useEffect, useRef } from "react";

/*
 * Host keystrokes, for the key scan.
 *
 * The scan reads what the keyboard sends to the *host*, which is the only
 * position-independent channel the protocol offers (see `testCodes.ts`). Two
 * things have to happen on every event:
 *
 *  - `preventDefault`, so the test does not type into the app, activate a
 *    focused button, or let a stray F5 reload the page mid-run;
 *  - `stopPropagation` in the capture phase, so nothing else in the app reacts
 *    to a keystroke that was meant as test data.
 *
 * Devtools keys are left alone on purpose. A bench tool that swallows F12 and
 * Ctrl+Shift+I is a bench tool nobody can debug when it misbehaves.
 */

const DEVTOOLS_KEYS = new Set(["i", "j", "c"]);

function isDevtoolsCombo(e: KeyboardEvent): boolean {
  if (e.key === "F12") return true;
  return (e.ctrlKey || e.metaKey) && e.shiftKey && DEVTOOLS_KEYS.has(e.key.toLowerCase());
}

function isEditable(target: EventTarget | null): boolean {
  const node = target as HTMLElement | null;
  if (!node) return false;
  return (
    node.tagName === "INPUT" ||
    node.tagName === "TEXTAREA" ||
    node.isContentEditable === true
  );
}

/**
 * Calls `onDown` for every host keydown while `enabled`. `onUp` exists so a step
 * can require a release before re-arming a position — without it, a key held
 * down would satisfy the next group the instant it was written.
 */
export function useHostKeys(
  enabled: boolean,
  onDown: (code: string) => void,
  onUp?: (code: string) => void
): void {
  const downRef = useRef(onDown);
  const upRef = useRef(onUp);

  useEffect(() => {
    downRef.current = onDown;
    upRef.current = onUp;
  }, [onDown, onUp]);

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditable(e.target) || isDevtoolsCombo(e)) return;
      e.preventDefault();
      e.stopPropagation();
      downRef.current(e.code);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (isEditable(e.target) || isDevtoolsCombo(e)) return;
      e.preventDefault();
      e.stopPropagation();
      upRef.current?.(e.code);
    };

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
    };
  }, [enabled]);
}
