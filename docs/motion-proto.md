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
    bool       get_capabilities = 1;
    bool       get_tap_config   = 2;
    TapConfig  set_tap_config   = 3;
    bool       get_lock_config  = 4;
    LockConfig set_lock_config  = 5;
    bool       save_state       = 6;
    bool       set_live_stream  = 7;
  }
}

message Response {
  oneof response_type {
    Capabilities capabilities     = 1;  // get_capabilities
    TapConfig    tap_config       = 2;
    bool         set_tap_config   = 3;
    LockConfig   lock_config      = 4;
    bool         set_lock_config  = 5;
    bool         save_state       = 6;
    bool         set_live_stream  = 7;
  }
}

message Capabilities {
  string sensor            = 1;  // "lis2dh12"
  bool   supports_tap      = 2;
  bool   supports_double_tap = 3;
  bool   supports_lock     = 4;
  uint32 threshold_max     = 5;  // slider bound; UI must not hard-code it
}

enum TapKind {
  TAP_KIND_SINGLE = 0;
  TAP_KIND_DOUBLE = 1;
}

message TapConfig {
  bool    enabled       = 1;
  TapKind kind          = 2;
  uint32  threshold     = 3;  // CLICK_THS
  uint32  time_limit_ms = 4;  // TIME_LIMIT
  uint32  latency_ms    = 5;  // TIME_LATENCY
  uint32  window_ms     = 6;  // TIME_WINDOW, DOUBLE only
  zmk.keymap.BehaviorBinding binding = 7;
  uint32  layer_mask    = 8;  // 0 = all layers
}

enum LockScope {
  LOCK_SCOPE_KEYS           = 0;
  LOCK_SCOPE_KEYS_AND_LEDS  = 1;
  LOCK_SCOPE_SOFT_OFF       = 2;
}

message LockConfig {
  bool      enabled             = 1;
  uint32    motion_threshold    = 2;  // ACT_THS — engages the lock
  uint32    motion_duration_ms  = 3;  // sustained, so one jolt doesn't lock
  uint32    still_threshold     = 4;
  uint32    still_duration_ms   = 5;
  bool      require_flat        = 6;  // 6D position, not just stillness
  uint32    flat_tolerance_deg  = 7;
  LockScope scope               = 8;
}

enum Orientation {
  ORIENTATION_UNKNOWN   = 0;
  ORIENTATION_FLAT_UP   = 1;
  ORIENTATION_FLAT_DOWN = 2;
  ORIENTATION_TILTED    = 3;
}

message LiveState {
  uint32      magnitude    = 1;
  Orientation orientation  = 2;
  bool        locked       = 3;
  bool        tap_detected = 4;
}

message Notification {
  LiveState live_state = 1;
}
```

### Behaviour notes

- **Lock semantics.** Two-sided state machine, not an idle timeout: sustained
  movement above `motion_threshold` for `motion_duration_ms` engages the lock;
  it disengages only after `still_duration_ms` below `still_threshold`, and — if
  `require_flat` — with the case flat and face up. "Locked" here means *input is
  suppressed* (anti-pocket-press), not Studio's own lock state.
- **Studio keeps working while locked.** RPC is independent of key input, so a
  locked keyboard must still answer requests. Studio shows the live lock state
  so a user doesn't mistake a suppressed keyboard for a broken one.
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
