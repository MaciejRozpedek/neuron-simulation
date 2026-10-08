/** Izhikevich (2003): quadratic integrate-and-fire with recovery variable u. */

export const V_PEAK = 30;
export const V_REST = -65;

export type Params = { a: number; b: number; c: number; d: number };

export type PresetId = "RS" | "IB" | "CH" | "FS" | "LTS" | "TC" | "RZ";

export type Preset = {
  id: PresetId;
  group: "Pobudzające" | "Hamujące" | "Pozostałe";
  label: string;
  blurb: string;
  params: Params;
};

export const PRESETS: readonly Preset[] = [
  {
    id: "RS",
    group: "Pobudzające",
    label: "RS — regular spiking",
    blurb:
      "Regularne spajki, które zwalniają. Duże d podnosi u po każdym spajku, a małe a sprawia, że u wraca wolno — stąd adaptacja częstości.",
    params: { a: 0.02, b: 0.2, c: -65, d: 8 },
  },
  {
    id: "IB",
    group: "Pobudzające",
    label: "IB — intrinsically bursting",
    blurb:
      "Krótka seria na początku, potem pojedyncze spajki. Wyższe c (−55 mV) zostawia błonę bliżej progu tuż po pierwszym wyładowaniu.",
    params: { a: 0.02, b: 0.2, c: -55, d: 4 },
  },
  {
    id: "CH",
    group: "Pobudzające",
    label: "CH — chattering",
    blurb:
      "Powtarzane paczki spajków. c = −50 mV i małe d, więc seria nie urywa się po jednym wyładowaniu.",
    params: { a: 0.02, b: 0.2, c: -50, d: 2 },
  },
  {
    id: "FS",
    group: "Hamujące",
    label: "FS — fast spiking",
    blurb:
      "Szybkie, równe spajki prawie bez adaptacji. Duże a szybko ściąga u w dół, a małe d słabo hamuje neuron po spajku.",
    params: { a: 0.1, b: 0.2, c: -65, d: 2 },
  },
  {
    id: "LTS",
    group: "Hamujące",
    label: "LTS — low-threshold spiking",
    blurb:
      "Niski próg. Ujemny impuls przy małym prądzie stałym potrafi zrzucić błonę i wyzwolić spajk po powrocie.",
    params: { a: 0.02, b: 0.25, c: -65, d: 2 },
  },
  {
    id: "TC",
    group: "Pozostałe",
    label: "TC — thalamo-cortical",
    blurb:
      "Komórka wzgórzowo-korowa. Przy stałym prądzie strzela tonicznie. d jest bardzo małe, więc po spajku u prawie nie skacze.",
    params: { a: 0.02, b: 0.25, c: -65, d: 0.05 },
  },
  {
    id: "RZ",
    group: "Pozostałe",
    label: "RZ — resonator",
    blurb:
      "Rezonator: v i u kołyszą się pod progiem. Widać to przy I bliskim 0 i krótkich impulsach, nie przy silnym prądzie stałym.",
    params: { a: 0.1, b: 0.26, c: -65, d: 2 },
  },
];

export const PRESET_GROUPS = ["Pobudzające", "Hamujące", "Pozostałe"] as const;

export function presetById(id: string): Preset {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[0];
}

export function matchPreset(p: Params): PresetId | "custom" {
  for (const preset of PRESETS) {
    const q = preset.params;
    if (
      Math.abs(q.a - p.a) < 1e-9 &&
      Math.abs(q.b - p.b) < 1e-9 &&
      Math.abs(q.c - p.c) < 1e-9 &&
      Math.abs(q.d - p.d) < 1e-9
    ) {
      return preset.id;
    }
  }
  return "custom";
}

export type Sample = {
  t: number;
  v: number;
  u: number;
  pulsed: boolean;
  spike: boolean;
};

type Pulse = { amp: number; left: number };

const MAX_SUBSTEP = 0.5;
const HISTORY_MS = 3200;
const MAX_POINTS = 40000;

export class NeuronSim {
  v = V_REST;
  u = 0;
  t = 0;
  spikes = 0;
  pulses: Pulse[] = [];
  samples: Sample[] = [];
  private carry = 0;

  constructor(params: Params) {
    this.reset(params);
  }

  reset(params: Params) {
    this.v = V_REST;
    this.u = params.b * V_REST;
    this.t = 0;
    this.spikes = 0;
    this.pulses = [];
    this.carry = 0;
    this.samples = [{ t: 0, v: this.v, u: this.u, pulsed: false, spike: false }];
  }

  clearCarry() {
    this.carry = 0;
  }

  sendPulse(amp: number) {
    if (!Number.isFinite(amp) || amp === 0) return;
    if (this.pulses.length >= 24) return;
    this.pulses.push({ amp, left: 1 });
  }

  currentI(iConst: number) {
    let i = iConst;
    for (const p of this.pulses) {
      if (p.left > 1e-6) i += p.amp;
    }
    return i;
  }

  /** One user step of exactly `dt` ms. */
  step(dt: number, params: Params, iConst: number) {
    if (!(dt > 0) || !Number.isFinite(dt)) return;
    this.integrate(dt, params, iConst);
    this.trim();
  }

  /** Advance `ms` of model time in chunks of `dt`. Leftover waits for the next call. */
  run(ms: number, dt: number, params: Params, iConst: number) {
    if (!(ms > 0) || !(dt > 0) || !Number.isFinite(ms) || !Number.isFinite(dt)) return;
    this.carry += ms;
    let n = 0;
    while (this.carry + 1e-9 >= dt && n < 20000) {
      this.integrate(dt, params, iConst);
      this.carry -= dt;
      n += 1;
    }
    this.trim();
  }

  /** Mean rate inside the trailing window. Null until a little time has passed. */
  rateHz(windowMs: number): number | null {
    if (this.t < 30 || !(windowMs > 0)) return null;
    const t0 = Math.max(0, this.t - windowMs);
    const span = this.t - t0;
    if (span <= 0) return null;
    let n = 0;
    for (let i = this.samples.length - 1; i >= 0; i--) {
      const s = this.samples[i];
      if (s.t < t0) break;
      if (s.spike) n += 1;
    }
    return n / (span / 1000);
  }

  private integrate(dt: number, params: Params, iConst: number) {
    let left = dt;
    while (left > 1e-8) {
      let pulseI = 0;
      let horizon = left;
      for (const p of this.pulses) {
        if (p.left > 1e-8) {
          pulseI += p.amp;
          if (p.left < horizon) horizon = p.left;
        }
      }
      const chunk = Math.min(left, horizon);
      this.eulerChunk(chunk, params, iConst + pulseI, pulseI !== 0);
      for (const p of this.pulses) {
        if (p.left > 0) p.left -= chunk;
      }
      left -= chunk;
    }
    if (this.pulses.length > 0) {
      this.pulses = this.pulses.filter((p) => p.left > 1e-6);
    }
  }

  /**
   * Forward Euler, substeps ≤ 0.5 ms.
   * u is updated from the new v, matching the usual one-step form of the model.
   * A spike is a discontinuity: v → c, u → u + d, drawn as a peak at 30 mV.
   */
  private eulerChunk(duration: number, params: Params, I: number, pulsed: boolean) {
    const n = Math.max(1, Math.ceil(duration / MAX_SUBSTEP - 1e-9));
    const h = duration / n;
    const { a, b, c, d } = params;
    for (let k = 0; k < n; k++) {
      const v0 = this.v;
      const u0 = this.u;
      const dv = 0.04 * v0 * v0 + 5 * v0 + 140 - u0 + I;
      let v = v0 + h * dv;
      let u = u0 + h * a * (b * v - u0);
      this.t += h;
      if (!Number.isFinite(v) || !Number.isFinite(u) || v >= V_PEAK) {
        const uAtPeak = Number.isFinite(u) ? u : u0;
        this.samples.push({
          t: this.t,
          v: V_PEAK,
          u: uAtPeak,
          pulsed,
          spike: true,
        });
        v = Number.isFinite(c) ? c : V_REST;
        u = uAtPeak + d;
        this.spikes += 1;
        if (!Number.isFinite(v) || !Number.isFinite(u)) {
          v = V_REST;
          u = b * V_REST;
        }
      }
      this.v = v;
      this.u = u;
      this.samples.push({ t: this.t, v: this.v, u: this.u, pulsed, spike: false });
    }
  }

  private trim() {
    const minT = this.t - HISTORY_MS;
    if (this.samples.length < 2000 && (this.samples.length === 0 || this.samples[0].t >= minT)) {
      return;
    }
    let idx = 0;
    while (idx < this.samples.length && this.samples[idx].t < minT) idx += 1;
    if (idx > 0) this.samples.splice(0, idx);
    if (this.samples.length > MAX_POINTS) {
      this.samples.splice(0, this.samples.length - MAX_POINTS);
    }
  }
}
