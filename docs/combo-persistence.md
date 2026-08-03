# Making runtime combos survive a power cycle

Studio can write combos and they take effect immediately, but they are gone after
the keyboard loses power. This is a firmware gap, not a Studio one, and this note
is the evidence plus what needs to change.

## Why Studio can't fix it

The whole `zmk.combos` surface is:

```
Request  : list_all_combos | get_combo | set_combo
Response : list_all_combos | get_combo | set_combo
Notification: combos_changed
```

There is **no save or commit request in the subsystem at all**. The only commit
Studio can issue is `keymap.save_changes`, which in ZMK persists the keymap
subtree and nothing else. So after `set_combo` returns `ok: true` there is no
further call available — Studio has already done everything the protocol allows.

Confirmed from the generated client (`@zmkfirmware/zmk-studio-ts-client/combos`),
and by behaviour: a `get_combo` read-back immediately after saving reports the new
combo, and it is absent after a power cycle. The write reaches the runtime array
and never reaches storage.

## What firmware needs to do

Upstream ZMK combos are devicetree-only — built once at compile time, never
written — so there is no settings handler to extend. It has to be added. ZMK's
keymap (`app/src/keymap.c`) is the model to copy; the four points below are where
copying it carelessly goes wrong.

### 1. Persist on the existing save, or add a save request

Cheapest and it needs no proto change and no Studio change: have the
`keymap.save_changes` RPC handler also call a new `zmk_combos_save_changes()`.
Studio's single Save button then covers combos, which is what it already assumes.

The tidier option is `combos.save_combos` in the proto plus its own dirty flag.
That needs a client regeneration before Studio can call it, so it is the
follow-up, not the fix.

### 2. Do not serialise the runtime binding

`struct zmk_behavior_binding` holds `const char *behavior_dev`. A pointer is
meaningless after reboot. Studio's `behavior_id` is no better — it is a per-build
local index, so a firmware rebuild silently repoints every saved combo at
whatever behavior now holds that slot.

ZMK already solved this for the keymap: `zmk_behavior_binding_setting` stores a
`zmk_behavior_local_id_t` (a stable hash of the behavior name), with
`zmk_behavior_get_local_id()` and
`zmk_behavior_find_behavior_name_from_local_id()` either side. Use the same type.

A versioned, packed record — never the protobuf message, whose wire layout is not
yours to depend on:

```c
struct combo_settings_v1 {
    uint8_t  version;                  /* 1 */
    uint8_t  key_position_count;
    uint16_t timeout_ms;
    int32_t  require_prior_idle_ms;    /* signed: -1 disables */
    uint32_t layer_mask;               /* 0 == all layers */
    uint8_t  slow_release;
    struct zmk_behavior_binding_setting binding;
    uint8_t  key_positions[CONFIG_ZMK_COMBO_MAX_KEYS_PER_COMBO];
} __packed;
```

Key `combo/<index>` — comfortably inside `SETTINGS_MAX_NAME_LEN` (32).

### 3. Resolve behaviors in `h_commit`, not `h_set`

`settings_load()` runs before behaviors are registered, so a local-id lookup in
`h_set` returns nothing. Stash the raw record in `h_set`, resolve and apply in
`h_commit`. This is exactly why ZMK's keymap handler is split that way.

Ordering also matters the other way: saved records must be applied *after* the
devicetree combos are initialised, so they override the defaults rather than being
overwritten by them.

Bounds-check the index on load. A record for a slot that no longer exists (fewer
combos in a later build) must be dropped, not written past the array.

### 4. Clearing a slot has to delete the record

`settings_delete("combo/<index>")` — or persist a record with
`key_position_count == 0` and honour it on load. Saving nothing is not enough: the
previous record is still in NVS and the old key positions come back at the next
boot. Studio has a "clear slot" action, so this path gets used.

### 5. Report unsaved state for `combos`

Studio's header shows unsaved changes from `keymap.check_unsaved_changes`. A
combo write is a `combos` call, so nothing raises that flag today — which is how a
confirmed unlock combo was lost: it was live, the Save button never appeared, and
it went away with the power. Studio now marks itself dirty on a combo write as a
workaround, but that is a client-side guess and a second client's writes defeat it.

Either raise `keymap.unsaved_changes_status_changed` on a combo write, or add
`combos.check_unsaved_changes` plus a notification of its own.

While there: `combos_changed` already exists in the proto. Emitting it on every
write would let clients stay in sync with each other.

### 6. Check that the write actually fits

`settings_save_one` returns `-ENOSPC` when the settings partition has no room, and
NVS needs free sectors to garbage-collect, not just free bytes. Eight combos is
only a few hundred bytes, but a partition sized for the keymap alone may not have
them. Propagate the failure into `SetComboResponse.err` —
`SET_COMBO_ERR_GENERIC` at minimum — so a combo that can never be persisted
doesn't report success.

## How to verify

1. `set_combo`, then `get_combo` — proves the runtime array took it (this already
   passes).
2. `keymap.save_changes`, power-cycle, reconnect, `list_all_combos` — the combo is
   still there. This is the one that currently fails.
3. Clear the slot, save, power-cycle — it stays cleared.
4. Rebuild the firmware with a behavior added or removed, power-cycle — saved
   combos still point at the behaviors they were bound to. This is what catches a
   `behavior_id` being stored where a local id belongs.

Until (2) passes, Studio's unlock flow tells the user the shortcut is written but
warns that it cannot see storage and asks them to power-cycle and check while
their existing unlock method still works — see [unlock-combo.md](unlock-combo.md).
