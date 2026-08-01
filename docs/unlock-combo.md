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

**Not how shipping firmware behaves yet.** Today the factory unlock gesture is a
keymap binding (`Fn + \` via `&studio_unlock` on a layer) and no combo slot is
reserved, so Studio's usual job is *adding* an unlock combo next to that binding
rather than re-triggering an existing one. Both paths are implemented; see
step 3. What follows is the target design.

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

## 3. Adding or changing the gesture

Two shapes, sharing one flow:

- **Add** (today's normal case): no combo unlocks the keyboard yet, so a free
  slot is bound to `&studio_unlock`. Purely additive — the keymap gesture stays
  — so there is no way to strand anyone.
- **Change**: an unlock combo exists and only its `key_positions` are rewritten.

Either way the new gesture must be **performed once** first. Studio does this
without any firmware change and without ever locking the keyboard:

1. The user picks key positions on the layout (at least two). Studio blocks a
   chord that exactly duplicates another combo, and warns when one merely
   *overlaps* another or is made only of ordinary keys. Overlap matters: ZMK
   resolves competing combos against each other, and a hand-made combo sharing a
   key will quietly win and make the test below look like it failed.
2. The positions go to a free slot bound to a probe keystroke, reproducing the
   unlock combo's `timeout_ms`, `require_prior_idle_ms`, `layer_mask` and
   `slow_release` so the test is faithful. (Inheriting `layer_mask` from the
   borrowed slot instead was a bug: `0` means "all layers", so a slot restricted
   to other layers yields a combo that can never fire.)
3. Studio reads the slot back with `get_combo` and shows what firmware actually
   stored. A combo that swallows its keys but emits nothing is indistinguishable
   from a broken test otherwise, and the two have opposite causes — the trigger
   landing without the behavior points at firmware.
4. The user performs the gesture; Studio watches for that keystroke arriving at
   the host — the same channel the key tester uses. The probe key walks a ladder
   (F13 → ordinary letters) because no key is delivered on every platform.
5. Only then is the real write made: binding `&studio_unlock` to the slot (add),
   or rewriting `key_positions` on the existing one and releasing the borrowed
   slot (change). In change mode the behavior is echoed back exactly as firmware
   reported it, since a differing behavior would rightly be rejected on a
   reserved slot.
6. The borrowed slot is released if the user cancels or navigates away mid-test.

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

## 4. Field notes

Established on real hardware, none of it reproducible in the demo firmware —
worth keeping, because each cost a debugging round and all four look identical
from the UI ("the test does nothing").

- **A firing combo swallows its keys.** ZMK consumes the keypresses a combo
  claims and runs the behavior instead. So during the test, keys arriving when
  pressed *separately* but nothing arriving when pressed *together* means the
  chord is working — the missing piece is only the substitute keystroke. It reads
  as the exact opposite.
- **`&studio_unlock` emits nothing**, so any combo bound to it looks like a dead
  combo. A user's hand-made unlock combo silently winning the chord under test
  was the first false lead; the live unlock combo doing the same was the second.
  Overlapping key sets are the thing to suspect.
- **`layer_mask == 0` means "all layers"**, and an unused slot may carry a
  restricted mask. A probe inheriting the borrowed slot's mask can therefore
  never fire on the layer the user is on.
- **F13 never reached the browser on Windows.** The probe ladder starts on
  ordinary letters for that reason; the F-row above F12 is a fallback.
- **Combos persist through `keymap.saveChanges`.** Firmware marks the session
  unsaved on a combo write, so the header's Save button appears on its own and
  Studio doesn't need to track combo dirtiness itself.
