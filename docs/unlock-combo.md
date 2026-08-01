# Studio unlock, as a reserved combo

What Studio needs from firmware so the unlock gesture can be shown, protected,
and changed by the user. All three steps below are implemented; the items marked
**needed** would each remove a compromise, but none of them blocks the feature.

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

A new gesture must be **performed once** before the old one is given up. Studio
does this today without any firmware change and without ever locking the
keyboard:

1. The user picks key positions on the layout (at least two). Studio warns if the
   chord duplicates another combo, or if it's made only of ordinary keys.
2. The positions are written to a **spare** slot bound to `&kp F13`, using the
   real unlock combo's timings so the test is faithful.
3. The user performs the gesture; Studio watches for that keystroke arriving at
   the host — the same channel the key tester uses.
4. Only then is the reserved slot rewritten, and only its `key_positions`. The
   behavior is echoed back exactly as firmware reported it, since a differing
   behavior would (rightly) be rejected on a reserved slot.
5. The borrowed slot is released — including if the user cancels or navigates
   away mid-test.

`require_prior_idle_ms` is raised to 200ms when the chord contains no layer or
modifier key, so an all-letters gesture can't fire mid-typing. Firmware may
refuse that field on a reserved slot; Studio then retries with positions only, so
the change still lands.

Because the keyboard is never locked during the test, a gesture the user turns
out not to be able to perform strands nobody. The one soft spot is a host that
swallows F13: after 30s Studio offers to apply without confirmation, stating the
consequence, and says whether another unlock path still exists.

Two firmware additions would each remove a compromise.

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
> `lockStateChanged` notification or a `getLastUnlockSource` request. That would
> let the test confirm the real `&studio_unlock` binding rather than a stand-in
> keystroke, removing the dependency on the host delivering F13.
>
> Note it can't be done by locking the keyboard and retrying *without* this:
> during such a test both the old and new gestures work, so pressing the old one
> would falsely confirm the new one — and a wrong conclusion there is exactly the
> failure that strands a user.

Also worth knowing: Studio observes host **keystrokes**, never key positions.
There is no key-event RPC, and a layer key emits nothing to the host, so a gesture
can't be captured by watching the user press it — positions are picked on the
layout and confirmed afterwards.
