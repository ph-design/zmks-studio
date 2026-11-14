# `zmk.motion` — RPC contract for the IMU features

Covers the two PH60SCV2EVO (LIS2DH12) features and the one ES60 change. The
Studio frontend is already written against this contract; see
`src/motion/motionRpc.ts` for the TypeScript mirror and
`src/demo/motionBackend.ts` for a working reference implementation of the state
machine.

## Why one new subsystem, not two

ES60's frame button is **per-layer**, which makes it an ordinary key position:
per-layer bindings, undo/redo, unsaved-change tracking and the binding picker
all already exist in the `keymap` subsystem. A dedicated subsystem for it would
re-implement that machinery and force Studio to carry two different mental
models of "a key". So it needs no new proto at all — just two optional fields
(below) and a kscan entry.

The IMU features are genuinely device-level state with their own lifecycle, so
they get their own subsystem.

## 1. `keymap.proto` — two optional fields (ES60)

```proto
enum KeyKind {
  KEY_KIND_MATRIX      = 0;
  KEY_KIND_SIDE_BUTTON = 1;
  KEY_KIND_ENCODER     = 2;
}

message KeyPhysicalAttrs {
  // … existing width/height/x/y/r/rx/ry …
  optional KeyKind kind  = 8;  // omit for matrix keys
  optional string  label = 9;  // short name, e.g. "Side"
}
```

Firmware then reports the frame button as a normal key position in
`get_physical_layouts` / `get_keymap`, with `kind = KEY_KIND_SIDE_BUTTON`. Old
firmware omits both fields and Studio renders exactly as it does today, so this
is backward compatible in both directions.

Studio reads these in one place only — `src/keyboard/keyMeta.ts`. If you pick
different field names, that file is the only edit.

Place it at coordinates that reflect the physical frame position; note Studio's
auto-fit zoom derives its bounding box from `max(x + width)`, so a position far
from the matrix shrinks the whole canvas.

## 2. `motion.proto` — new subsystem

Register it as a new field on `zmk.studio.Request` / `RequestResponse` /
`Notification` alongside `lighting` and `combos`.

Parameters are deliberately the raw LIS2DH12 register semantics rather than an
invented 1–5 "sensitivity" scale — otherwise firmware and UI both have to carry
a mapping table, and they will drift.

```proto
syntax = "proto3";
package zmk.motion;
import "keymap.proto";

message Request {
    oneof request_type {
        bool        get_capabilities = 1;
        bool        get_tap_config   = 2;
        TapConfig   set_tap_config   = 3;
        bool        get_carry_config = 4;
        CarryConfig set_carry_config = 5;
        bool        save_state       = 6;
        bool        set_live_stream  = 7;
    }
}

message Response {
    oneof response_type {
        Capabilities capabilities     = 1;
        TapConfig    tap_config       = 2;
        bool         set_tap_config   = 3;
        CarryConfig  carry_config     = 4;
        bool         set_carry_config = 5;
        bool         save_state       = 6;
        bool         set_live_stream  = 7;
    }
}

message Capabilities {
    string sensor              = 1;  // "lis2dh12"
    bool   supports_tap        = 2;
    bool   supports_double_tap = 3;
    bool   supports_carry      = 4;
    uint32 threshold_max       = 5;  // slider bound; UI must not hard-code it
}

// Any binding may be omitted. When a single and its double are both set on
// the same side, the single fires one window late so the double can supersede.
message TapConfig {
    bool   enabled       = 1;
    uint32 threshold     = 2;  // CLICK_THS, shared by all taps
    uint32 time_limit_ms = 3;  // TIME_LIMIT
    uint32 latency_ms    = 4;  // TIME_LATENCY
    uint32 window_ms     = 5;  // TIME_WINDOW — second-tap / arbitration window
    zmk.keymap.BehaviorBinding left_single_binding  = 6;
    zmk.keymap.BehaviorBinding left_double_binding  = 7;
    zmk.keymap.BehaviorBinding right_single_binding = 8;
    zmk.keymap.BehaviorBinding right_double_binding = 9;
    uint32 layer_mask    = 10;  // 0 = all layers
}

message CarryConfig {
    bool   enabled            = 1;
    uint32 motion_threshold   = 2;  // INT_THS for the any-motion interrupt
    uint32 motion_duration_ms = 3;  // walking must persist this long before sleep
}

enum Orientation {
    ORIENTATION_UNKNOWN   = 0;
    ORIENTATION_FLAT_UP   = 1;
    ORIENTATION_FLAT_DOWN = 2;
    ORIENTATION_TILTED    = 3;
}

message LiveState {
    // Peak acceleration within the push period, in the same raw counts the
    // threshold fields use, so a threshold marker can be drawn on the meter.
    uint32      magnitude      = 1;
    Orientation orientation    = 2;
    bool        carry_active   = 3;  // walking detected, sleep imminent
    bool        tap_detected   = 4;
    uint32      last_click_src = 5;  // raw CLICK_SRC of the last tap
}

message Notification {
    oneof notification_type {
        LiveState live_state = 1;
    }
}
```

### Behaviour notes

- **Carry sleep semantics.** A one-way trip, not a toggle: any-motion events
  build a streak; a gap of ~2 s or a key press resets it. Sustained movement
  for `motion_duration_ms` sends the keyboard to System OFF (the normal ZMK
  sleep path, watchdog-fed). Waking is a key press, exactly like the idle
  timeout — there is no unlock message because nothing is locked, it was
  asleep.
- **Tap sides.** The LIS2DH12 click engine reports which direction the case
  was struck via CLICK_SRC's sign bit; the firmware maps that to left/right
  and dispatches the matching binding. `CONFIG_ZMK_MOTION_TAP_SIDE_INVERT`
  flips the mapping for upside-down builds.
- **`set_live_stream`** gates the `LiveState` notification. Studio turns it on
  only while the motion panel is open, because it's ~10 Hz traffic and BLE pays
  for it. Default off on connect.
- **`save_state`** persists both configs to flash; the setters take effect
  immediately but do not persist, matching how `lighting` behaves. Studio's
  header Save button calls it.
- **Unsupported.** Firmware without an IMU should leave the subsystem
  unregistered so the request fails with `RPC_NOT_FOUND`; Studio's probe treats
  that as "no motion features" and hides the section. Reporting
  `supports_* = false` instead also works.

## 3. Client generation

The frontend cannot put a `motion` request on the wire until
`@ph-design/zmk-studio-ts-client-fork` is regenerated from the updated
`zmk-studio-messages` submodule — ts-proto encoders silently drop unknown
fields. `clientSupportsMotion()` in `src/motion/motionRpc.ts` round-trips a
probe request through the codec and switches from the in-memory demo backend to
real RPC automatically once the regenerated client is installed. No frontend
change is needed at that point beyond the version bump.

## Motion Guard compatibility (2026-11-15)

Legacy carry thresholds and stationary-wake fields do not describe the new Motion Guard policy. The UI keeps their controls hidden by default and offers an explicit legacy opt-in when the strategy cannot be identified. Fresh READY/LOCKED telemetry for the selected online receiver peer confirms Motion Guard for that keyboard session; UNKNOWN or receiver firmware version alone does not.

Motion Guard defaults are presented as read-only documentation: a 180 ms stable window after sustained carrying, 60 ms after a brief lock, and at most 60 mg span per axis. Placement confirmation can defer buffered new presses. Normal input follows the direct path. Idle power management remains separate, and automatic System OFF is suspended while the healthy IMU guard is enabled. The basic carry enable switch remains mapped to the existing RPC; these policy constants are not written through legacy threshold fields.
