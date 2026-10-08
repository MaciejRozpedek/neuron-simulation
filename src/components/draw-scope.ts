import type { NeuronSim } from "@/lib/izhikevich";

const FALLBACK = {
  surface: "#f7f4ee",
  muted: "#5e564e",
  line: "#ddd4c8",
  trace: "#9d1c28",
  recovery: "#1d4e89",
};

function cssColor(name: string, fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function niceStep(span: number, target: number) {
  const rough = span / Math.max(1, target);
  if (!(rough > 0) || !Number.isFinite(rough)) return 1;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const err = rough / pow;
  const mult = err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1;
  return mult * pow;
}

function ticks(min: number, max: number, target: number) {
  const step = niceStep(max - min, target);
  const start = Math.ceil((min + step * 1e-6) / step) * step;
  const out: number[] = [];
  for (let v = start; v <= max + step * 1e-6; v += step) {
    out.push(Number(v.toFixed(6)));
    if (out.length > 8) break;
  }
  return out;
}

function lowerBound(times: { t: number }[], t: number) {
  let lo = 0;
  let hi = times.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function tickLabel(n: number) {
  const abs = Math.abs(n);
  const digits = abs >= 100 || Number.isInteger(n) ? 0 : abs >= 10 ? 1 : 2;
  const rounded = Number(n.toFixed(digits));
  return String(rounded).replace(".", ",");
}

export function drawScope(canvas: HTMLCanvasElement, sim: NeuronSim, windowMs: number) {
  const rect = canvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  if (width < 8 || height < 8) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const pxW = Math.round(width * dpr);
  const pxH = Math.round(height * dpr);
  if (canvas.width !== pxW || canvas.height !== pxH) {
    canvas.width = pxW;
    canvas.height = pxH;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const surface = cssColor("--color-surface", FALLBACK.surface);
  const muted = cssColor("--color-muted", FALLBACK.muted);
  const line = cssColor("--color-line", FALLBACK.line);
  const trace = cssColor("--color-trace", FALLBACK.trace);
  const recovery = cssColor("--color-recovery", FALLBACK.recovery);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = surface;
  ctx.fillRect(0, 0, width, height);

  const padL = 46;
  const padR = 10;
  const padT = 8;
  const padB = 22;
  const gap = 18;
  const plotW = Math.max(1, width - padL - padR);
  const innerH = Math.max(2, height - padT - padB - gap);
  const hV = Math.round(innerH * 0.62);
  const hU = innerH - hV;
  const yV = padT;
  const yU = padT + hV + gap;

  const t1 = sim.t;
  const axis0 = t1 < windowMs ? 0 : t1 - windowMs;
  const axis1 = t1 < windowMs ? windowMs : t1;
  const spanT = Math.max(1e-6, axis1 - axis0);
  const xOf = (t: number) => padL + ((t - axis0) / spanT) * plotW;

  const samples = sim.samples;
  let i0 = lowerBound(samples, axis0);
  if (i0 > 0) i0 -= 1;

  let vMin = -80;
  let vMax = 40;
  let uMin = Infinity;
  let uMax = -Infinity;
  for (let i = i0; i < samples.length; i++) {
    const s = samples[i];
    if (s.t < axis0 - spanT) continue;
    if (s.v < vMin) vMin = s.v - 4;
    if (s.v > vMax) vMax = Math.max(40, s.v + 4);
    if (s.u < uMin) uMin = s.u;
    if (s.u > uMax) uMax = s.u;
  }
  if (!Number.isFinite(uMin) || !Number.isFinite(uMax)) {
    uMin = -16;
    uMax = 4;
  }
  const uPad = Math.max(1, (uMax - uMin) * 0.14);
  uMin -= uPad;
  uMax += uPad;
  if (uMax - uMin < 8) {
    const mid = (uMax + uMin) / 2;
    uMin = mid - 4;
    uMax = mid + 4;
  }

  const yMap = (value: number, min: number, max: number, top: number, h: number) =>
    top + ((max - value) / (max - min)) * h;

  const font = "11px 'IBM Plex Mono', ui-monospace, monospace";
  ctx.font = font;
  ctx.lineWidth = 1;

  const drawGrid = (
    top: number,
    h: number,
    min: number,
    max: number,
    targetTicks: number,
  ) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(padL, top, plotW, h);
    ctx.clip();
    ctx.strokeStyle = line;
    ctx.beginPath();
    for (const tick of ticks(min, max, targetTicks)) {
      const y = yMap(tick, min, max, top, h);
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
    }
    for (const tick of ticks(axis0, axis1, 4)) {
      const x = xOf(tick);
      ctx.moveTo(x, top);
      ctx.lineTo(x, top + h);
    }
    ctx.stroke();

    ctx.fillStyle = trace;
    ctx.globalAlpha = 0.14;
    for (let i = Math.max(1, i0); i < samples.length; i++) {
      const s = samples[i];
      if (!s.pulsed) continue;
      const x0 = xOf(samples[i - 1].t);
      const x1 = xOf(s.t);
      if (x1 - x0 < 0.4) continue;
      ctx.fillRect(x0, top, x1 - x0, h);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    ctx.strokeStyle = line;
    ctx.strokeRect(padL + 0.5, top + 0.5, plotW - 1, h - 1);

    ctx.fillStyle = muted;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (const tick of ticks(min, max, targetTicks)) {
      const y = yMap(tick, min, max, top, h);
      if (y < top + 6 || y > top + h - 6) continue;
      ctx.fillText(tickLabel(tick), padL - 6, y);
    }
  };

  drawGrid(yV, hV, vMin, vMax, 4);
  drawGrid(yU, hU, uMin, uMax, 3);

  const strokeSeries = (
    color: string,
    top: number,
    h: number,
    min: number,
    max: number,
    pick: (s: (typeof samples)[number]) => number,
  ) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(padL, top, plotW, h);
    ctx.clip();
    ctx.beginPath();
    let started = false;
    for (let i = i0; i < samples.length; i++) {
      const s = samples[i];
      const x = xOf(s.t);
      const y = yMap(pick(s), min, max, top, h);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();
    if (!started && samples.length > 0) {
      const s = samples[samples.length - 1];
      const x = xOf(s.t);
      const y = yMap(pick(s), min, max, top, h);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };

  strokeSeries(trace, yV, hV, vMin, vMax, (s) => s.v);
  strokeSeries(recovery, yU, hU, uMin, uMax, (s) => s.u);

  ctx.font = font;
  ctx.fillStyle = muted;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (const tick of ticks(axis0, axis1, 4)) {
    const x = xOf(tick);
    if (x < padL + 18 || x > padL + plotW - 18) continue;
    ctx.fillText(tickLabel(tick), x, yU + hU + 6);
  }
  ctx.textAlign = "right";
  ctx.fillText("ms", padL + plotW, yU + hU + 6);
}
