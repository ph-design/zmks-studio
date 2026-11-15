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

## Adjustable lift lock / Motion Guard v1 (preview.5)

This is an additive wire extension, implemented in the app-owned `guardProtocol.ts` adapter until the generated client includes it. `Capabilities.guard_version` is uint32 field 8. Version 1 plus a complete, valid config is required to enable the editor. Ordinary requests and all existing field meanings are unchanged. Unknown versions and old firmware keep read-only defaults; telemetry alone never enables parameter writes.

`CarryConfig` adds uint32 fields 4–8: `carried_settle_ms` (100–600, default 180), `brief_settle_ms` (40–200, default 60), `stable_span_mg` (20–100, default 60), `departure_mg` (120–350, default 200), and `verify_ms` (20–60, default 30). Long confirmation must be at least brief confirmation. Firmware and UI reject the entire extended update if invalid or partial. An old client sending no extension retains the current guard parameters while the existing enable switch still works.

The UI stages edits locally, applies the whole set once, and uses the standard Save action for persistence. Firmware snapshots requested values under a short spinlock; only the existing policy workqueue changes the state machine. No sensor I/O or flash write is added to normal key processing. `motion_guard/v1` stores a validated, versioned record independently of legacy motion blobs; missing/corrupt/unsupported records use defaults, and motion reset resets the new record too. Saving or reboot readback on physical hardware remains to be tested.

## Power settings v1 (preview.6)

Capabilities fields 9/10 advertise powerVersion=1 and the built light mask (RGB=1, backlight=2). Motion Request adds getPowerConfig=12 (bool), setPowerConfig=13 (PowerConfig); Response adds powerConfig=12 and setPowerConfig=13 (bool). Config fields 1–4 are idleTimeoutMs, rgbOffMs, backlightOffMs, deepSleepMs; fields 5/6 are onUsb/offWhenLocked. No legacy or guard fields are reinterpreted. The application-owned powerProtocol adapter handles these fields until the generated client includes them.

Timers are zero (disabled) or whole-second milliseconds from 1000 to 86400000; enabled deep sleep is at least 60000 and no earlier than other timers. Defaults: idle 120000, lights 30000 each, deep 0, USB bypass, immediate off while lift-locked. UI edits are local until Apply, and standard motion save persists power/v1 independently. Deep sleep may consume its wake key; standby retains the sensor and connection. The Device page exposes only the built light channels. Firmware reads do not reset timers; held positions protect activity, and lighting suppression never changes saved user light settings.

## Tap detection and driver corrections (preview.7)

LIS2DH normal 10-bit samples previously used an approximate full-scale conversion: nominal 1 g decoded to approximately 0.976 g. Conversion now uses the datasheet nominal sensitivity for each range and 8/10/12-bit mode, explicit signed little-endian decoding and 64-bit intermediate arithmetic. BDU prevents mixed high/low bytes. Tests execute the actual patched fetch/conversion/channel getters. Register order is X/Y/Z; physical PCB-to-case axis orientation has not been measured, so no speculative X/Y swap is applied. Studio shows sensor-axis values in mg for this measurement. Real sensor tolerances still apply.

Enabled tapping selects 400 Hz hardware ODR; disabling restores 100 Hz. The guard consumes frames at its existing approximately 100 Hz cadence. I2C remains on the sampler thread. The hardware click engine selects single OR double detection, rather than arming both bits on the same axis. Default mode is one case-wide gesture, all sensor axes, 120 ms typing quiet interval. Left/right-by-polarity remains an explicit experimental option and is not reliable physical localization. Existing right-side bindings are preserved while hidden in unified mode.

Double-only bindings use hardware double-click. When both single and double actions are assigned, hardware single events feed bounded software arbitration; single actions wait for the second-tap interval. Physical key processing gains no new delay. Tap dispatch waits 12 ms to allow a coincident physical key to veto it, and rejects held/recent keys, lift-lock transitions, stale configurations and queue overflow. Carry transitions clear pending gestures.

Studio provides a 60-second no-action test, GPIO/recognition/gesture/action/suppression counters, actual register snapshot and a bounded 32-frame waveform with actual timestamps. Test events remain non-executing even if processed after test expiry. Snapshot reads do not reread the self-clearing CLICK_SRC register. Test sampling is best-effort and is not an oscilloscope or guaranteed 400 Hz host recording.

Wire extension: Capabilities uint32 tap_version=11 is 1. TapConfig fields 11/12/13 are axes_mask (1..7), split_sides (bool), typing_quiet_ms (0..1000). Complete extensions are validated transactionally; old clients preserve current extra options. Requests 14/15/16 get diagnostics, set test (bool), get capture; responses 14/15/16 return diagnostics, acceptance, capture. Capture bytes are at most 256 bytes: 32 little-endian frames of uint16 milliseconds and int16 X/Y/Z mg. Options persist independently as tap/v1 only on explicit Save; reset includes this record. Existing binding fields remain unchanged. The messages module must provide nanopb.proto, as the pinned module does.

Validation: host policy and real-controller tests, actual driver functions across modes/ranges and fresh EVO compilation pass. Physical axis orientation, click recognition rate, false triggers, power use and real reboot persistence need user testing. No preview.7 keyboard flash was performed. The nominal scale correction slightly changes motion thresholds in physical units; repeat carrying/placement and typing checks after flashing.

References: [LIS2DH12 datasheet](https://www.st.com/resource/en/datasheet/lis2dh12.pdf), [ST AN5005](https://www.st.com/resource/en/application_note/an5005-lis2dh12-ultralowpower-highperformance-3axis-nano-accelerometer-with-digital-output-stmicroelectronics.pdf).

## Double-only gestures and progressive disclosure (preview.8)

Capabilities.tapVersion=2 advertises hardware double-click-only behavior, including no-action test mode. All stored single actions are inert; old wire/storage fields are retained for compatibility. There is no software single/double arbitration or triple-tap feature. Version 1 keeps its decoder and diagnostic compatibility; the UI warns that old firmware must apply a tap setting to clear saved singles, then explicitly save.

The page shows double bindings, relative threshold (not mg), double window and layers first, plus a battery-life notice. The final Advanced parameters and hardware test disclosure defaults closed. Its diagnostic component mounts only when expanded, so closing it stops polling and any test started there. Axes, direction split, typing quiet window and lower-level timings remain adjustable inside. The threshold conversion/defaults and carry classifier are unchanged in this revision; the reported hard-spacebar false lock remains unresolved.

Validation: double-only actual-controller regression, unchanged driver/guard/power/telemetry tests and fresh EVO build pass. Physical recognition and current consumption remain user tests.
