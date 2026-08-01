# Studio unlock, as a reserved combo

What Studio needs from firmware so the unlock gesture can be shown, protected,
and eventually changed by the user. Steps 1–2 below are implemented; step 3 is
blocked on the firmware items marked **needed**.

## The constraint everything follows from

`core` exposes `getDeviceInfo | getLockState | lock | resetSettings` — there is
**no unlock RPC**, deliberately, so a malicious web page can't unlock a keyboard
it has connected to. Two consequences shape the whole design:

1. **Studio cannot bootstrap the first unlock gesture.** Reading or writing
   combos requires being unlocked already, so the factory gesture has to be baked
   into firmware. Studio can only ever *change* it.
2. **`resetSettings` is not a recovery path** — it requires being unlocked too.
   If the only unlock binding is lost, the keyboard cannot be edited again
   without reflashing. That makes "never let the last unlock path disappear" a
   hard safety requirement, not a nicety.

Firmware should also default to locked. Studio assumes it.

## 1. Reserve one combo slot (no proto change needed)

The unlock combo is slot 0, reported with the existing per-slot flags:

```
editableKeyPositions: true    // the user may change which keys trigger it
editableBehavior:    false    // …but never what it does
```

That pair is the whole enforcement mechanism, and it lives in firmware where it
belongs: Studio's own guard can be bypassed by any other client, this can't.
Studio additionally counts every unlock path it can see (combos plus every
layer's keymap bindings) and refuses writes that would take the count to zero.

Default gesture: **Fn + `\`**, as a combo. `timeoutMs` can be generous (~200ms)
because Fn emits no keystroke of its own, so the chord is impossible to hit while
typing. A user-chosen gesture made of two ordinary letter keys is a different
story — those need `requirePriorIdleMs` (~200ms) or normal typing will unlock the
board.

## 2. What Studio shows today

- **Device page** lists every unlock path: reserved combos as key chips, plus any
  `&studio_unlock` still bound in the keymap, with a "Protected" marker driven by
  `editableBehavior: false`.
- **Combos page** hides the reserved slot — it isn't a shortcut the user authored.
  Slot numbering still uses the firmware index, so the visible list starts at 1.
- **Lock screens** (connect flow and re-lock notice) show the factory gesture.

Identification is by behavior `displayName === "Studio Unlock"`, because
`GetBehaviorDetailsResponse` carries only `{ id, displayName, metadata }` and `id`
varies per build.

> **Needed:** a stable `identifier` on the behaviors proto. Display-name matching
> breaks the moment a name is changed or localized, and Studio already relies on
> it in several places.

## 3. Changing the gesture

The requirement is that a new gesture must be **performed once** before the old
one is given up. Two firmware gaps stand in the way.

> **Needed: an unlock hint readable while locked.** Nothing about the keyboard is
> readable in the locked state, so the lock screen can only show the factory
> gesture — a user who changed it gets no reminder, which is the most likely way
> to end up locked out. Key positions alone aren't enough: rendering "Fn" needs
> the keymap and the physical legend, neither of which is readable while locked
> (and a layer key has no HID usage to fall back on). Return firmware-rendered
> labels:
>
> ```proto
> message UnlockHint {
>   repeated UnlockKey keys = 1;   // { uint32 position, string label }
>   uint32 timeout_ms = 2;         // so the UI can say "press together"
> }
> ```
>
> Exposing this while locked costs nothing: the security boundary is physical
> access, and the gesture is printed in the manual.

> **Needed: report which combo unlocked the keyboard.** Either a field on the
> `lockStateChanged` notification or a `getLastUnlockSource` request. Without it,
> a lock-and-retry verification is ambiguous — during the test both the old and
> new gestures work, so pressing the old one would falsely confirm the new one.

Until those land, Studio can still verify a gesture without any firmware change
and without ever locking the keyboard:

1. Write the candidate key positions into a **spare** combo slot bound to
   `&kp F13` (an otherwise unused key), with the same `timeoutMs` the real unlock
   combo will use.
2. Ask the user to perform the gesture, and watch for that keystroke arriving at
   the host — Studio already observes host keystrokes for the key tester.
3. On success, write the positions into the reserved unlock slot and clear the
   spare.

This verifies the only genuinely uncertain part — whether this user can press
these keys together within this timeout — and because the keyboard is never
locked during the test, a failed attempt strands nobody. It does depend on the
host delivering F13, so it needs a timeout and a manual override.

Note that Studio observes host **keystrokes**, never key positions: there is no
key-event RPC, so a gesture involving a layer key can't be captured by watching
the user press it. Positions have to be picked on the layout, then verified as
above.
