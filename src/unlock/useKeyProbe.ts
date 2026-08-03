import { useEffect, useState } from "react";

/*
 * Counts arrivals of one specific key at the host, used to confirm a candidate
 * unlock gesture actually fires. Separate from `usePressedKeys` on purpose: this
 * has to catch the key even inside a text field and even with modifiers held,
 * and the probe key shouldn't start lighting up keycaps in the keymap view.
 */
export function useKeyProbe(code: string, enabled: boolean): number {
  const [hits, setHits] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setHits(0);
      return;
    }

    const onDown = (e: KeyboardEvent) => {
      if (e.code !== code || e.repeat) return;
      // Swallow it — the probe key is ours for the duration of the test.
      e.preventDefault();
      setHits((h) => h + 1);
    };

    window.addEventListener("keydown", onDown, { capture: true });
    return () => window.removeEventListener("keydown", onDown, { capture: true });
  }, [code, enabled]);

  return hits;
}
