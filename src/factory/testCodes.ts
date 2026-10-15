/*
 * The keystrokes the key scan binds to, and why this particular set.
 *
 * The protocol cannot tell Studio which *position* was pressed — `keymap`'s only
 * notification is `unsavedChangesStatusChanged` — so the scan infers it: it
 * writes a temporary layer in which each position under test emits its own
 * keystroke, then watches what arrives at the host. Attribution comes from the
 * binding we wrote, so a keystroke that never arrives is a key that never fired,
 * and no false "pass" is possible from a neighbouring key.
 *
 * The bench drives this with a squeegee dragged across the whole board, which is
 * what shapes the pool:
 *
 *  1. **Several keys are down at once, all the time.** A code that is only part
 *     of an OS chord cannot be in the pool, because the board will hold it while
 *     the hand is still moving: an Alt in the pool turns a sweep into Alt+Tab and
 *     switches the app out from under the test, a Meta opens the Start menu and
 *     takes focus with it. So the pool stops at Shift. Ctrl+anything, Alt+Tab and
 *     the Windows keys are all excluded on purpose, and there is no tail of
 *     "last resort" codes to reach for.
 *  2. The host has to actually deliver the code. `unlockPaths.ts` records the
 *     hard-won half of this: F13 never reached the browser on Windows, which
 *     turned a probe into a dead end. Nothing in the F-row is used here.
 *  3. It has to be `KeyboardEvent.code`, i.e. layout-independent — derived from
 *     the HID usage rather than the host's layout, so a bench PC on a non-US
 *     layout still maps usage 0x04 to "KeyA".
 *
 * Fifty-five codes is therefore the ceiling for one pass, and a bigger board
 * simply takes more passes: positions rotate through the same pool, so the
 * unused half of a two-pass board is not tested until the second sweep. The
 * worker is told which pass they are on, and the board fills in green as it goes.
 */

export interface TestCode {
  /** DOM `KeyboardEvent.code` the usage is expected to arrive as. */
  code: string;
  /** HID keyboard-page usage id. */
  hidId: number;
  label: string;
}

function letters(): TestCode[] {
  return Array.from({ length: 26 }, (_, i) => ({
    code: `Key${String.fromCharCode(65 + i)}`,
    hidId: 0x04 + i,
    label: String.fromCharCode(65 + i),
  }));
}

function digits(): TestCode[] {
  const oneToNine = Array.from({ length: 9 }, (_, i) => ({
    code: `Digit${i + 1}`,
    hidId: 0x1e + i,
    label: String(i + 1),
  }));
  return [...oneToNine, { code: "Digit0", hidId: 0x27, label: "0" }];
}

/*
 * Ordered by how confident we are that the host delivers it and that a *held*
 * code cannot disturb the host. A pass takes a prefix of this list.
 */
export const TEST_CODES: TestCode[] = [
  // Typing keys: delivered everywhere, and harmless to hold down.
  ...letters(),
  ...digits(),
  { code: "Comma", hidId: 0x36, label: "," },
  { code: "Period", hidId: 0x37, label: "." },
  { code: "Slash", hidId: 0x38, label: "/" },
  { code: "Semicolon", hidId: 0x33, label: ";" },
  { code: "Quote", hidId: 0x34, label: "'" },
  { code: "Minus", hidId: 0x2d, label: "-" },
  { code: "Equal", hidId: 0x2e, label: "=" },
  { code: "BracketLeft", hidId: 0x2f, label: "[" },
  { code: "BracketRight", hidId: 0x30, label: "]" },
  { code: "Backslash", hidId: 0x31, label: "\\" },
  { code: "Backquote", hidId: 0x35, label: "`" },

  // Keys the window swallows anyway, plus Shift — which is the most aggressive
  // modifier a sweep can safely hold, since Shift+anything is still just typing.
  { code: "Escape", hidId: 0x29, label: "Esc" },
  { code: "Enter", hidId: 0x28, label: "Enter" },
  { code: "Space", hidId: 0x2c, label: "Space" },
  { code: "Tab", hidId: 0x2b, label: "Tab" },
  { code: "Backspace", hidId: 0x2a, label: "Bksp" },
  { code: "CapsLock", hidId: 0x39, label: "Caps" },
  { code: "ShiftLeft", hidId: 0xe1, label: "LShift" },
  { code: "ShiftRight", hidId: 0xe5, label: "RShift" },
];

/** How many positions one sweep can cover. Passes rotate through the pool. */
export const KEY_TEST_CODE_COUNT = TEST_CODES.length;

export const byCode: Map<string, TestCode> = new Map(
  TEST_CODES.map((c) => [c.code, c])
);

/** `&kp` parameters are HID usages: page 7 in the high half, id in the low. */
export function testUsage(code: TestCode): number {
  return (7 << 16) + code.hidId;
}

/**
 * Split positions into groups small enough that every position in one group can
 * hold a distinct code. A board with more keys than the pool is covered by
 * running more groups rather than by reusing codes, since a repeat would make a
 * press ambiguous.
 */
export function planGroups(count: number, maxPerGroup: number): number[][] {
  const perGroup = Math.max(1, Math.min(maxPerGroup, TEST_CODES.length));
  const groups: number[][] = [];
  for (let start = 0; start < count; start += perGroup) {
    groups.push(
      Array.from({ length: Math.min(perGroup, count - start) }, (_, i) => start + i)
    );
  }
  return groups;
}
