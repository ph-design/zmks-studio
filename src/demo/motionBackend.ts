import {
  LockScope,
  Orientation,
  TapKind,
  type LockConfig,
  type MotionBackend,
  type MotionCapabilities,
  type MotionLiveState,
  type TapConfig,
} from "../motion/motionRpc";

/*
 * In-memory stand-in for the `zmk.motion` subsystem, used by demo connections
 * only.
 *
 * It does not live in `mockTransport` with the rest of the demo firmware
 * because the demo transport round-trips through the *generated* protobuf
 * codec, which drops fields it doesn't know — so a motion request can't reach
 * the mock firmware until the ts-client fork is regenerated. Serving it beside
 * the transport keeps the panel reviewable now; once the codec carries
 * `motion`, `getMotionBackend` routes to real RPC and this becomes the
 * reference implementation to port into `DemoFirmware.handle`.
 */

const DEMO_LABEL = "Demo";

const CAPABILITIES: MotionCapabilities = {
  sensor: "lis2dh12",
  supportsTap: true,
  supportsDoubleTap: true,
  supportsLock: true,
  thresholdMax: 127,
};

function defaultTapConfig(): TapConfig {
  return {
    enabled: true,
    kind: TapKind.DOUBLE,
    threshold: 40,
    timeLimitMs: 60,
    latencyMs: 80,
    windowMs: 240,
    // &bt BT_SEL 0 in the demo behavior table — a plausible "pat the case" action.
    binding: { behaviorId: 10, param1: 0, param2: 0 },
    layerMask: 0,
  };
}

function defaultLockConfig(): LockConfig {
  return {
    enabled: true,
    motionThreshold: 32,
    motionDurationMs: 1500,
    stillThreshold: 12,
    stillDurationMs: 3000,
    requireFlat: true,
    flatToleranceDeg: 15,
    scope: LockScope.KEYS,
  };
}

/*
 * Self-driving signal: mostly still, with a ~5 s "carried in a bag" burst every
 * ~14 s so the lock/unlock state machine plays out on its own. Nothing in the
 * view has to know it's fake.
 */
class DemoMotionFirmware implements MotionBackend {
  private tap = defaultTapConfig();
  private lock = defaultLockConfig();
  private listeners = new Set<(s: MotionLiveState) => void>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private tick = 0;
  private locked = false;
  private aboveSince: number | undefined;
  private stillSince: number | undefined;

  async getCapabilities() {
    return CAPABILITIES;
  }
  async getTapConfig() {
    return { ...this.tap };
  }
  async setTapConfig(config: TapConfig) {
    this.tap = { ...config };
    return true;
  }
  async getLockConfig() {
    return { ...this.lock };
  }
  async setLockConfig(config: LockConfig) {
    this.lock = { ...config };
    return true;
  }
  async saveState() {
    return true;
  }

  async setLiveStream(on: boolean) {
    if (on && !this.timer) {
      this.tick = 0;
      this.timer = setInterval(() => this.step(), 100);
    } else if (!on && this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    return true;
  }

  subscribeLive = (cb: (state: MotionLiveState) => void) => {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
      if (this.listeners.size === 0) this.setLiveStream(false);
    };
  };

  private step() {
    const PERIOD = 140; // ticks (14 s at 100 ms)
    const BURST = 50; // ticks of movement per period
    this.tick = (this.tick + 1) % PERIOD;
    const walking = this.tick < BURST;

    // Idle jitter vs. gait-like swing, both bounded by thresholdMax.
    const base = walking ? 46 : 4;
    const swing = walking ? 22 * Math.abs(Math.sin(this.tick / 2.2)) : 3 * Math.random();
    const magnitude = Math.min(CAPABILITIES.thresholdMax, Math.round(base + swing));

    const orientation = walking ? Orientation.TILTED : Orientation.FLAT_UP;
    const elapsed = this.tick * 100;

    if (this.lock.enabled) {
      if (magnitude >= this.lock.motionThreshold) {
        this.stillSince = undefined;
        if (this.aboveSince === undefined) this.aboveSince = elapsed;
        if (elapsed - this.aboveSince >= this.lock.motionDurationMs) this.locked = true;
      } else {
        this.aboveSince = undefined;
        const flatOk = !this.lock.requireFlat || orientation === Orientation.FLAT_UP;
        if (magnitude <= this.lock.stillThreshold && flatOk) {
          if (this.stillSince === undefined) this.stillSince = elapsed;
          if (elapsed - this.stillSince >= this.lock.stillDurationMs) this.locked = false;
        } else {
          this.stillSince = undefined;
        }
      }
    } else {
      this.locked = false;
    }

    // A tap lands only while unlocked and only when the swing clears the click
    // threshold — same gate the firmware applies.
    const tapDetected =
      this.tap.enabled &&
      !this.locked &&
      !walking &&
      magnitude >= this.tap.threshold;

    const state: MotionLiveState = {
      magnitude,
      orientation,
      locked: this.locked,
      tapDetected,
    };
    for (const cb of this.listeners) cb(state);
  }
}

let instance: DemoMotionFirmware | undefined;
let enabled = false;

/** Called by the demo transport so the backend matches the feature toggles. */
export function setDemoMotionEnabled(on: boolean) {
  enabled = on;
  instance = on ? new DemoMotionFirmware() : undefined;
}

export function getDemoMotionBackend(connectionLabel: string): MotionBackend | null {
  if (!enabled || connectionLabel !== DEMO_LABEL) return null;
  if (!instance) instance = new DemoMotionFirmware();
  return instance;
}
