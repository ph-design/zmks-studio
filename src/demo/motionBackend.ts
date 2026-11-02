import {
  Orientation,
  type CarryConfig,
  type MotionBackend,
  type MotionCapabilities,
  type MotionLiveState,
  type StillWakeConfig,
  type TapConfig,
} from "../motion/motionRpc";

// In-memory stand-in for the `zmk.motion` subsystem, used by demo connections
// only, so the panel can be reviewed without firmware.

export const DEMO_LABEL = "Demo";

const CAPABILITIES: MotionCapabilities = {
  sensor: "lis2dh12",
  supportsTap: true,
  supportsDoubleTap: true,
  supportsCarry: true,
  supportsStillWake: true,
  supportsSleepWake: true,
  thresholdMax: 127,
};

function defaultTapConfig(): TapConfig {
  return {
    enabled: true,
    threshold: 40,
    timeLimitMs: 60,
    latencyMs: 80,
    windowMs: 240,
    // &bt BT_SEL 0 in the demo behavior table — a plausible "pat the case" action.
    leftSingleBinding: { behaviorId: 10, param1: 0, param2: 0 },
    leftDoubleBinding: undefined,
    rightSingleBinding: undefined,
    rightDoubleBinding: undefined,
    layerMask: 0,
  };
}

function defaultCarryConfig(): CarryConfig {
  return {
    enabled: true,
    motionThreshold: 32,
    motionDurationMs: 2000,
  };
}

function defaultStillWakeConfig(): StillWakeConfig {
  return {
    enabled: true,
    settleDurationMs: 5000,
  };
}

// Self-driving signal: a ~5 s "carried in a bag" burst every ~14 s.
class DemoMotionFirmware implements MotionBackend {
  private tap = defaultTapConfig();
  private carry = defaultCarryConfig();
  private stillWake = defaultStillWakeConfig();
  private listeners = new Set<(s: MotionLiveState) => void>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private tick = 0;
  private now = 0;
  private carryActive = false;
  private aboveSince: number | undefined;

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
  async getCarryConfig() {
    return { ...this.carry };
  }
  async setCarryConfig(config: CarryConfig) {
    this.carry = { ...config };
    return true;
  }
  async getStillWakeConfig() {
    return { ...this.stillWake };
  }
  async setStillWakeConfig(config: StillWakeConfig) {
    this.stillWake = { ...config };
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

    const orientation = walking ? Orientation.ORIENTATION_TILTED : Orientation.ORIENTATION_FLAT_UP;
    // Monotonic so the streak survives the tick wrap.
    this.now += 100;
    const elapsed = this.now;

    // Same streak rule as the firmware: above the threshold, sustained for
    // motionDurationMs, resets when the signal drops back below it.
    if (this.carry.enabled && magnitude >= this.carry.motionThreshold) {
      if (this.aboveSince === undefined) this.aboveSince = elapsed;
      if (elapsed - this.aboveSince >= this.carry.motionDurationMs) this.carryActive = true;
    } else {
      this.aboveSince = undefined;
      this.carryActive = false;
    }

    // A tap lands only while still and only when the swing clears the click
    // threshold — same gate the firmware applies. Sign bit set = left side.
    const tapDetected =
      this.tap.enabled && !walking && magnitude >= this.tap.threshold;
    const lastClickSrc = tapDetected ? 0x35 : 0; // SCLICK | Sign | XA

    const state: MotionLiveState = {
      magnitude,
      orientation,
      carryActive: this.carryActive,
      tapDetected,
      lastClickSrc,
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
