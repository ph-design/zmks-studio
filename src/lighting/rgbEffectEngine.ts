export interface HsvColor {
  h: number; // 0-359
  s: number; // 0-100
  b: number; // 0-100
}

export interface LedPosition {
  x: number; // normalized 0-1
  y: number; // normalized 0-1
}

// Non-linear speed curve
const SPEED_CURVE = [0, 1.0, 1.24, 1.54, 1.91, 2.38, 2.95, 3.66, 4.54, 5.64, 7.0];

const ANIMATION_FPS = 60;
const FRAME_MS = 1000 / ANIMATION_FPS;
const MAX_STEPS_PER_FRAME = 8;

export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const sf = s / 100;
  const vf = v / 100;
  const c = vf * sf;
  const a = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((a % 2) - 1));
  const m = vf - c;

  let r = 0, g = 0, b = 0;
  switch (Math.floor(a) % 6) {
    case 0: r = c; g = x; break;
    case 1: r = x; g = c; break;
    case 2: g = c; b = x; break;
    case 3: g = x; b = c; break;
    case 4: r = x; b = c; break;
    default: r = c; b = x; break;
  }
  return [r + m, g + m, b + m];
}

function hueWrap(h: number): number {
  h %= 360;
  return h < 0 ? h + 360 : h;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function breathPulse(phase01: number): number {
  let x = phase01 * 2;
  if (x > 1) x = 2 - x;
  return 4 * x * (1 - x);
}

function randInt(n: number): number {
  return Math.floor(Math.random() * n);
}

// Firmware effect IDs
export const enum EffectId {
  Solid = 0,
  Breathing = 1,
  Spectrum = 2,
  Rainbow = 3,
  Gradient = 4,
  Wave = 5,
  Knight = 6,
  Twinkle = 7,
  Sparkle = 8,
  Raindrops = 9,
  AlphasMods = 10,
  Reactive = 11,
  Ripple = 12,
  ReactiveWide = 13,
  ReactiveNexus = 14,
  TypingHeatmap = 15,
}

interface TimedEvent {
  srcX: number;
  srcY: number;
  age: number;      // frames
  distance: number; // ring radius
  counter: number;  // frames alive
}

const RIPPLE_WIDTH = 40; // in 0-255 distance space, like firmware
const REACTIVE_WIDE_RADIUS = 0.35;
const NEXUS_ARM_TOLERANCE = 0.08;
const HEATMAP_SPREAD = 0.28;
const HEATMAP_AREA_LIMIT = 24;
const HEATMAP_INCREASE_STEP = 32;

export class RgbEffectEngine {
  private numLeds = 0;
  private posX: Float32Array = new Float32Array(0);
  private posY: Float32Array = new Float32Array(0);

  // fixed-timestep accumulator
  private accMs = 0;

  // per-effect animation state (advances only in step())
  private phase = 0;
  private phase2 = 0;
  private knightPos = 0;
  private knightDir = 1;
  private knightAcc = 0;
  private hueStore: Uint16Array = new Uint16Array(0);   // raindrops
  private raindropsInit = false;
  private pixelVal: Uint8Array = new Uint8Array(0);     // twinkle / reactive
  private pixelDir: Int8Array = new Int8Array(0);       // twinkle
  private sparkleCounter: Uint16Array = new Uint16Array(0);
  private sparkleTotal: Uint16Array = new Uint16Array(0);
  private events: TimedEvent[] = [];
  private heatmapTemp: Uint8Array = new Uint8Array(0);
  private heatmapTimerMs = 0;

  setPositions(positions: LedPosition[]): void {
    if (positions.length !== this.numLeds) {
      this.numLeds = positions.length;
      this.hueStore = new Uint16Array(this.numLeds);
      this.pixelVal = new Uint8Array(this.numLeds);
      this.pixelDir = new Int8Array(this.numLeds);
      this.sparkleCounter = new Uint16Array(this.numLeds);
      this.sparkleTotal = new Uint16Array(this.numLeds);
      this.heatmapTemp = new Uint8Array(this.numLeds);
    }
    this.posX = new Float32Array(positions.map((p) => p.x));
    this.posY = new Float32Array(positions.map((p) => p.y));
  }

  // Clear all animation state
  reset(effect: number): void {
    this.accMs = 0;
    this.phase = 0;
    this.phase2 = 0;
    this.knightPos = 0;
    this.knightDir = 1;
    this.knightAcc = 0;
    this.hueStore.fill(0);
    this.raindropsInit = false;
    this.pixelVal.fill(0);
    this.pixelDir.fill(0);
    this.sparkleCounter.fill(0);
    this.sparkleTotal.fill(0);
    this.events = [];
    this.heatmapTemp.fill(0);
    this.heatmapTimerMs = 0;
    if (effect === EffectId.Sparkle) {
      for (let i = 0; i < this.numLeds; i++) this.sparkleRegen(i, true);
    }
  }

  // Simulate a key press at a normalized position
  triggerKey(x: number, y: number): void {
    if (this.events.length >= 16) this.events.shift();
    this.events.push({ srcX: x, srcY: y, age: 0, distance: 0, counter: 0 });

    let best = -1, bestDist = Infinity;
    for (let i = 0; i < this.numLeds; i++) {
      const dx = this.posX[i] - x, dy = this.posY[i] - y;
      const d = dx * dx + dy * dy;
      if (d < bestDist) { bestDist = d; best = i; }
    }
    if (best < 0) return;
    this.pixelVal[best] = 255;
    this.heatmapTemp[best] = Math.min(255, this.heatmapTemp[best] + HEATMAP_INCREASE_STEP);
    for (let i = 0; i < this.numLeds; i++) {
      if (i === best) continue;
      const dx = this.posX[i] - x, dy = this.posY[i] - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= HEATMAP_SPREAD) {
        const amount = Math.floor((1 - dist / HEATMAP_SPREAD) * HEATMAP_AREA_LIMIT);
        this.heatmapTemp[i] = Math.min(255, this.heatmapTemp[i] + amount);
      }
    }
  }

  advance(effect: number, speed: number, dtMs: number): void {
    this.accMs += dtMs;
    let steps = 0;
    while (this.accMs >= FRAME_MS && steps < MAX_STEPS_PER_FRAME) {
      this.step(effect, speed);
      this.accMs -= FRAME_MS;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) this.accMs = 0;
  }

  // One firmware frame of state advancement
  private step(effect: number, speed: number): void {
    const spd = SPEED_CURVE[Math.min(Math.max(speed, 0), 10)];
    const n = this.numLeds;

    switch (effect) {
      case EffectId.Breathing:
        this.phase += spd * 0.001;
        if (this.phase >= 1) this.phase -= 1;
        break;

      case EffectId.Spectrum:
        this.phase += spd * 1.8;
        if (this.phase >= 360) this.phase -= 360;
        this.phase2 += spd * 0.001;
        if (this.phase2 >= 1) this.phase2 -= 1;
        break;

      case EffectId.Rainbow:
        this.phase += spd * 1.4;
        if (this.phase >= 360) this.phase -= 360;
        break;

      case EffectId.Gradient:
        this.phase += spd * 0.002;
        if (this.phase >= 1) this.phase -= 1;
        break;

      case EffectId.Wave:
        this.phase += spd * 0.025;
        if (this.phase > 2 * Math.PI) this.phase -= 2 * Math.PI;
        break;

      case EffectId.Knight: {
        this.knightAcc += Math.floor(spd);
        if (this.knightAcc >= 2) {
          const steps = Math.floor(this.knightAcc / 2);
          this.knightAcc %= 2;
          this.knightPos += this.knightDir * steps * 0.01;
          if (this.knightPos >= 1) { this.knightPos = 1; this.knightDir = -1; }
          else if (this.knightPos <= 0) { this.knightPos = 0; this.knightDir = 1; }
        }
        break;
      }

      case EffectId.Twinkle: {
        let threshold = 200 - Math.floor(spd) * 30;
        if (threshold < 20) threshold = 20;
        let stepSize = 3 + Math.floor(spd) * 2;
        if (stepSize > 25) stepSize = 25;
        for (let i = 0; i < n; i++) {
          if (this.pixelDir[i] === 0 && this.pixelVal[i] === 0 && randInt(threshold) === 0) {
            this.pixelDir[i] = 1;
            this.pixelVal[i] = 1;
          }
          if (this.pixelDir[i] > 0) {
            const v = this.pixelVal[i] + stepSize;
            if (v >= 255) { this.pixelVal[i] = 255; this.pixelDir[i] = -1; }
            else this.pixelVal[i] = v;
          } else if (this.pixelDir[i] < 0) {
            const v = this.pixelVal[i] - stepSize;
            if (v <= 0) { this.pixelVal[i] = 0; this.pixelDir[i] = 0; }
            else this.pixelVal[i] = v;
          }
        }
        break;
      }

      case EffectId.Sparkle: {
        const dec = Math.max(1, Math.floor(spd));
        for (let i = 0; i < n; i++) {
          if (this.sparkleCounter[i] === 0) this.sparkleRegen(i, false);
          this.sparkleCounter[i] = Math.max(0, this.sparkleCounter[i] - dec);
        }
        break;
      }

      case EffectId.Raindrops: {
        const changes = Math.max(1, Math.floor(spd));
        for (let c = 0; c < changes; c++) {
          this.hueStore[randInt(n)] = randInt(360);
        }
        break;
      }

      case EffectId.Reactive: {
        const decay = 2 + Math.floor(spd);
        for (let i = 0; i < n; i++) {
          if (this.pixelVal[i] > decay) this.pixelVal[i] -= decay;
          else this.pixelVal[i] = 0;
        }
        break;
      }

      case EffectId.Ripple: {
        const distPerFrame = 3 + Math.floor(spd) * 2;
        const eventFrames = Math.max(1, Math.floor(255 / distPerFrame));
        for (const ev of this.events) {
          if (ev.counter < eventFrames) {
            ev.distance += distPerFrame;
            ev.counter++;
          }
        }
        // drop expired events from the front
        while (this.events.length > 0 && this.events[0].counter >= eventFrames) {
          this.events.shift();
        }
        break;
      }

      case EffectId.ReactiveWide:
      case EffectId.ReactiveNexus:
        for (const ev of this.events) ev.age++;
        break;

      case EffectId.TypingHeatmap: {
        const delayMs = Math.max(5, 50 / spd);
        this.heatmapTimerMs += FRAME_MS;
        if (this.heatmapTimerMs >= delayMs) {
          this.heatmapTimerMs = 0;
          for (let i = 0; i < n; i++) {
            if (this.heatmapTemp[i] > 0) this.heatmapTemp[i]--;
          }
        }
        break;
      }

      default:
        // Solid / AlphasMods
        break;
    }
  }

  // Draw current state into out
  draw(effect: number, color: HsvColor, speed: number, out: Float32Array): void {
    const spd = SPEED_CURVE[Math.min(Math.max(speed, 0), 10)];
    const brt = color.b / 100;
    const n = this.numLeds;

    switch (effect) {
      case EffectId.Solid: {
        const [r, g, b] = hsvToRgb(color.h, color.s, 100);
        for (let i = 0; i < n; i++) this.setPx(out, i, r * brt, g * brt, b * brt);
        break;
      }

      case EffectId.Breathing: {
        const val = breathPulse(this.phase);
        const f = brt * (0.15 + 0.85 * val);
        const [r, g, b] = hsvToRgb(color.h, color.s, 100);
        for (let i = 0; i < n; i++) this.setPx(out, i, r * f, g * f, b * f);
        break;
      }

      case EffectId.Spectrum: {
        let x = this.phase2 * 2;
        if (x > 1) x = 2 - x;
        const breath = 0.15 + 0.85 * 4 * x * (1 - x);
        const [r, g, b] = hsvToRgb(Math.floor(this.phase), color.s, 100);
        const f = brt * breath;
        for (let i = 0; i < n; i++) this.setPx(out, i, r * f, g * f, b * f);
        break;
      }

      case EffectId.Rainbow: {
        for (let i = 0; i < n; i++) {
          const hue = hueWrap(color.h + this.phase + this.posX[i] * 360);
          const [r, g, b] = hsvToRgb(hue, color.s, 100);
          this.setPx(out, i, r * brt, g * brt, b * brt);
        }
        break;
      }

      case EffectId.Gradient: {
        const c1 = hsvToRgb(color.h, color.s, 100);
        const c2 = hsvToRgb((color.h + 120) % 360, color.s, 100);
        const c3 = hsvToRgb((color.h + 240) % 360, color.s, 100);
        const colors = [c1, c2, c3];
        const seg = 1 / 3;
        for (let i = 0; i < n; i++) {
          const dist = (1 + this.posX[i] - this.phase) % 1;
          let from = Math.floor(dist / seg);
          if (from > 2) from = 2;
          const step = Math.min(1, (dist - from * seg) / seg);
          const a = colors[from], bc = colors[(from + 1) % 3];
          this.setPx(
            out, i,
            (a[0] + (bc[0] - a[0]) * step) * brt,
            (a[1] + (bc[1] - a[1]) * step) * brt,
            (a[2] + (bc[2] - a[2]) * step) * brt,
          );
        }
        break;
      }

      case EffectId.Wave: {
        const [r, g, b] = hsvToRgb(color.h, color.s, 100);
        for (let i = 0; i < n; i++) {
          let x = this.posX[i] + this.phase * (1 / (2 * Math.PI));
          x -= Math.floor(x);
          let v: number;
          if (x < 0.5) {
            const t = x * 2;
            v = 4 * t * (1 - t);
          } else {
            const t = (x - 0.5) * 2;
            v = -4 * t * (1 - t);
          }
          v = (v + 1) * 0.5;
          const f = brt * (0.15 + 0.85 * v);
          this.setPx(out, i, r * f, g * f, b * f);
        }
        break;
      }

      case EffectId.Knight: {
        const [r, g, b] = hsvToRgb(color.h, color.s, 100);
        const len = 1 / 6;
        for (let i = 0; i < n; i++) {
          const rel = Math.abs(this.posX[i] - this.knightPos);
          if (rel < len) {
            let f = 1 - rel / len;
            f *= f;
            this.setPx(out, i, r * brt * f, g * brt * f, b * brt * f);
          } else {
            this.setPx(out, i, 0, 0, 0);
          }
        }
        break;
      }

      case EffectId.Twinkle: {
        const [r, g, b] = hsvToRgb(color.h, color.s, 100);
        for (let i = 0; i < n; i++) {
          const f = brt * (this.pixelVal[i] / 255);
          this.setPx(out, i, r * f, g * f, b * f);
        }
        break;
      }

      case EffectId.Sparkle: {
        const [r, g, b] = hsvToRgb(color.h, color.s, 100);
        for (let i = 0; i < n; i++) {
          const total = this.sparkleTotal[i] || 1;
          const counter = this.sparkleCounter[i];
          const stepSize = 1 / total;
          let intensity: number;
          if (total <= counter) intensity = 2 - stepSize * counter;
          else intensity = stepSize * counter;
          intensity = clamp01(intensity) * brt;
          this.setPx(out, i, r * intensity, g * intensity, b * intensity);
        }
        break;
      }

      case EffectId.Raindrops: {
        if (!this.raindropsInit) {
          this.hueStore.fill(color.h);
          this.raindropsInit = true;
        }
        for (let i = 0; i < n; i++) {
          const [r, g, b] = hsvToRgb(this.hueStore[i], color.s, 100);
          this.setPx(out, i, r * brt, g * brt, b * brt);
        }
        break;
      }

      case EffectId.AlphasMods: {
        const ca = hsvToRgb(color.h, color.s, 100);
        const cm = hsvToRgb((color.h + Math.floor(spd) * 30) % 360, color.s, 100);
        for (let i = 0; i < n; i++) {
          const isMod = this.posX[i] < 0.12 || this.posX[i] > 0.88;
          const c = isMod ? cm : ca;
          this.setPx(out, i, c[0] * brt, c[1] * brt, c[2] * brt);
        }
        break;
      }

      case EffectId.Reactive: {
        const [r, g, b] = hsvToRgb(color.h, color.s, 100);
        for (let i = 0; i < n; i++) {
          const v = this.pixelVal[i];
          if (v === 0) { this.setPx(out, i, 0, 0, 0); continue; }
          let f = v / 255;
          f *= f;
          this.setPx(out, i, r * brt * f, g * brt * f, b * brt * f);
        }
        break;
      }

      case EffectId.Ripple: {
        const [r, g, b] = hsvToRgb(color.h, color.s, 100);
        out.fill(0);
        for (const ev of this.events) {
          for (let i = 0; i < n; i++) {
            const dx = this.posX[i] - ev.srcX, dy = this.posY[i] - ev.srcY;
            const pd = Math.sqrt(dx * dx + dy * dy) * 255;
            const diff = Math.abs(pd - ev.distance);
            if (diff >= RIPPLE_WIDTH) continue;
            const intensity = (1 - diff / RIPPLE_WIDTH) * brt;
            const o = i * 3;
            // lighten blend in linear space, gamma applied below
            const pr = r * intensity, pg = g * intensity, pb = b * intensity;
            if (pr > out[o]) out[o] = pr;
            if (pg > out[o + 1]) out[o + 1] = pg;
            if (pb > out[o + 2]) out[o + 2] = pb;
          }
        }
        this.applyGamma(out);
        break;
      }

      case EffectId.ReactiveWide: {
        out.fill(0);
        const maxAge = Math.max(10, Math.floor(120 / spd));
        for (const ev of this.events) {
          let ageFactor = 1 - ev.age / maxAge;
          if (ageFactor <= 0) continue;
          ageFactor *= ageFactor;
          const hue = (color.h + Math.floor((1 - ageFactor) * 60)) % 360;
          const [r, g, b] = hsvToRgb(hue, color.s, 100);
          for (let i = 0; i < n; i++) {
            const dx = this.posX[i] - ev.srcX, dy = this.posY[i] - ev.srcY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > REACTIVE_WIDE_RADIUS) continue;
            const spatial = 1 - dist / REACTIVE_WIDE_RADIUS;
            const intensity = ageFactor * spatial * brt;
            const o = i * 3;
            const pr = r * intensity, pg = g * intensity, pb = b * intensity;
            if (pr > out[o]) out[o] = pr;
            if (pg > out[o + 1]) out[o + 1] = pg;
            if (pb > out[o + 2]) out[o + 2] = pb;
          }
        }
        this.applyGamma(out);
        break;
      }

      case EffectId.ReactiveNexus: {
        out.fill(0);
        const maxAge = Math.max(8, Math.floor(100 / spd));
        for (const ev of this.events) {
          let ageFactor = 1 - ev.age / maxAge;
          if (ageFactor <= 0) continue;
          ageFactor *= ageFactor;
          const hue = (color.h + Math.floor((1 - ageFactor) * 40)) % 360;
          const [r, g, b] = hsvToRgb(hue, color.s, 100);
          const reach = 1 - ageFactor;
          for (let i = 0; i < n; i++) {
            const dx = Math.abs(this.posX[i] - ev.srcX);
            const dy = Math.abs(this.posY[i] - ev.srcY);
            let spatial = 0;
            if (dy < NEXUS_ARM_TOLERANCE && dx <= reach + 0.01) {
              spatial = Math.max(spatial, (1 - dx / (reach + 0.01)) * (1 - dy / NEXUS_ARM_TOLERANCE));
            }
            if (dx < NEXUS_ARM_TOLERANCE && dy <= reach + 0.01) {
              spatial = Math.max(spatial, (1 - dy / (reach + 0.01)) * (1 - dx / NEXUS_ARM_TOLERANCE));
            }
            if (spatial <= 0) continue;
            const intensity = ageFactor * spatial * brt;
            const o = i * 3;
            const pr = r * intensity, pg = g * intensity, pb = b * intensity;
            if (pr > out[o]) out[o] = pr;
            if (pg > out[o + 1]) out[o + 1] = pg;
            if (pb > out[o + 2]) out[o + 2] = pb;
          }
        }
        this.applyGamma(out);
        break;
      }

      case EffectId.TypingHeatmap: {
        for (let i = 0; i < n; i++) {
          const val = this.heatmapTemp[i];
          if (val === 0) { this.setPx(out, i, 0, 0, 0); continue; }
          const t = val / 255;
          let r = 0, g = 0, b = 0;
          if (t < 0.25) { g = t / 0.25; b = 1; }
          else if (t < 0.5) { g = 1; b = 1 - (t - 0.25) / 0.25; }
          else if (t < 0.75) { r = (t - 0.5) / 0.25; g = 1; }
          else { r = 1; g = 1 - (t - 0.75) / 0.25; }
          const intensity = (val >= 85 ? 1 : val / 85) * brt;
          this.setPx(out, i, r * intensity, g * intensity, b * intensity);
        }
        break;
      }

      default: {
        const [r, g, b] = hsvToRgb(color.h, color.s, 100);
        for (let i = 0; i < n; i++) this.setPx(out, i, r * brt, g * brt, b * brt);
      }
    }
  }

  private sparkleRegen(idx: number, offset: boolean): void {
    const total = Math.max(2, Math.floor((3 * ANIMATION_FPS) / (randInt(16) + 1)));
    this.sparkleTotal[idx] = total;
    this.sparkleCounter[idx] = offset
      ? Math.max(1, randInt(2 * total))
      : 2 * total;
  }

  // Write pixel with gamma-2.2 encoding
  private setPx(out: Float32Array, i: number, r: number, g: number, b: number): void {
    const o = i * 3;
    out[o] = Math.pow(clamp01(r), 2.2);
    out[o + 1] = Math.pow(clamp01(g), 2.2);
    out[o + 2] = Math.pow(clamp01(b), 2.2);
  }

  // Gamma-encode a buffer that was blended in linear space.
  private applyGamma(out: Float32Array): void {
    for (let i = 0; i < out.length; i++) {
      out[i] = Math.pow(clamp01(out[i]), 2.2);
    }
  }
}
