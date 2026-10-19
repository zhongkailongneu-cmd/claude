// Background, beat-driven flashes, camera shake, cut glitches and particles.
// Everything is a pure function of time, so frames can render in any order.
import { P, rgba } from "./palette.js";
import { clamp } from "./ui.js";

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- beat envelopes from build/beatmap.json --------------------------------
function lastBefore(arr, t) {
  let lo = 0, hi = arr.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid][0] <= t + 1e-6) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

// sum of exponentially decaying hits within `win` seconds before t
export function envelope(arr, t, tau, win = 1.2) {
  let i = lastBefore(arr, t), s = 0;
  while (i >= 0 && t - arr[i][0] < win) {
    s += (arr[i][1] ?? 1) * Math.exp(-(t - arr[i][0]) / tau);
    i--;
  }
  return s;
}

export function lastHit(arr, t) {
  const i = lastBefore(arr, t);
  return i < 0 ? null : arr[i];
}

// --- background -------------------------------------------------------------
const DUST = (() => {
  const r = rng(7);
  return Array.from({ length: 160 }, () => ({
    x: r() * 1920, y: r() * 1080, s: 0.8 + r() * 2.4, v: 6 + r() * 22, ph: r() * 6.28, c: r() < 0.3 ? P.c30 : P.c50,
  }));
})();

export function background(ctx, S) {
  ctx.fillStyle = P.c100;
  ctx.fillRect(0, 0, 1920, 1080);
  const g = ctx.createRadialGradient(700, 470, 60, 700, 470, 1100);
  g.addColorStop(0, rgba(P.c80, 0.95));
  g.addColorStop(0.55, rgba(P.c90, 0.6));
  g.addColorStop(1, rgba(P.c100, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1920, 1080);

  // drifting HUD grid
  ctx.save();
  ctx.strokeStyle = rgba(P.c80, 0.55);
  ctx.lineWidth = 1;
  const off = (S.t * 12) % 64;
  ctx.beginPath();
  for (let x = -64 + off; x < 1920; x += 64) { ctx.moveTo(x, 0); ctx.lineTo(x, 1080); }
  for (let y = -64 + off * 0.5; y < 1080; y += 64) { ctx.moveTo(0, y); ctx.lineTo(1920, y); }
  ctx.stroke();
  ctx.restore();

  // dust / plankton-like particles, brighter on kicks
  const kick = clamp(S.kick);
  ctx.save();
  for (const d of DUST) {
    const y = (d.y - S.t * d.v + 1080 * 10) % 1080;
    const x = d.x + Math.sin(S.t * 0.4 + d.ph) * 18;
    const tw = 0.35 + 0.35 * Math.sin(S.t * 1.7 + d.ph) + 0.3 * kick;
    ctx.fillStyle = rgba(d.c, clamp(tw) * 0.7);
    ctx.beginPath();
    ctx.arc(x, y, d.s * (1 + 0.6 * kick), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function vignette(ctx) {
  const g = ctx.createRadialGradient(960, 540, 420, 960, 540, 1250);
  g.addColorStop(0, rgba(P.c100, 0));
  g.addColorStop(1, rgba(P.c100, 0.85));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1920, 1080);
}

// --- impacts ----------------------------------------------------------------
export function flash(ctx, amount) {
  if (amount <= 0.004) return;
  ctx.fillStyle = rgba(P.c10, clamp(amount));
  ctx.fillRect(0, 0, 1920, 1080);
}

export function shakeOffset(S) {
  const a = S.shake;
  if (a < 0.05) return [0, 0];
  const f = S.t * 60;
  return [Math.sin(f * 1.7) * a + Math.sin(f * 3.1) * a * 0.5, Math.cos(f * 2.3) * a * 0.8];
}

export function ring(ctx, x, y, age, o = {}) {
  const dur = o.dur ?? 0.7;
  if (age < 0 || age > dur) return;
  const k = age / dur;
  const r = (o.r0 ?? 20) + (o.r1 ?? 520) * (1 - Math.pow(1 - k, 3));
  ctx.save();
  ctx.strokeStyle = rgba(o.color ?? P.c20, (1 - k) * (o.alpha ?? 0.9));
  ctx.lineWidth = (o.width ?? 6) * (1 - k) + 1;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// Streaks of light that burst outward from a point (used on the big drops).
export function burst(ctx, x, y, age, seed, o = {}) {
  const dur = o.dur ?? 0.6;
  if (age < 0 || age > dur) return;
  const r = rng(seed);
  const k = age / dur;
  ctx.save();
  ctx.lineCap = "round";
  for (let i = 0; i < (o.n ?? 26); i++) {
    const a = r() * Math.PI * 2;
    const sp = 400 + r() * 900;
    const d0 = sp * k * 0.6, d1 = sp * k;
    ctx.strokeStyle = rgba(r() < 0.5 ? P.c10 : P.c40, (1 - k) * 0.9);
    ctx.lineWidth = 2 + r() * 3;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * d0, y + Math.sin(a) * d0);
    ctx.lineTo(x + Math.cos(a) * d1, y + Math.sin(a) * d1);
    ctx.stroke();
  }
  ctx.restore();
}

// --- cut glitch: displaced horizontal slices for the first frames after a cut
let buf = null;
export function cutGlitch(ctx, age, seed, strength = 1) {
  const dur = 0.13;
  if (age < 0 || age > dur) return;
  if (!buf) {
    buf = document.createElement("canvas");
    buf.width = 1920;
    buf.height = 1080;
  }
  const b = buf.getContext("2d");
  b.clearRect(0, 0, 1920, 1080);
  b.drawImage(ctx.canvas, 0, 0);
  const r = rng(seed);
  const k = 1 - age / dur;
  let y = 0;
  while (y < 1080) {
    const h = 12 + r() * 70;
    const dx = (r() - 0.5) * 2 * 90 * k * strength * (r() < 0.45 ? 1 : 0.15);
    if (Math.abs(dx) > 1) {
      ctx.drawImage(buf, 0, y, 1920, h, dx, y, 1920, h);
      if (r() < 0.25) {
        ctx.fillStyle = rgba(P.c30, 0.18 * k);
        ctx.fillRect(0, y, 1920, h);
      }
    }
    y += h;
  }
}

export function darken(ctx, amount) {
  if (amount <= 0.002) return;
  ctx.fillStyle = rgba(P.c100, clamp(amount));
  ctx.fillRect(0, 0, 1920, 1080);
}

// Neural "network" of points used in the intro stat scenes.
export const NODES = (() => {
  const r = rng(42);
  return Array.from({ length: 90 }, () => ({ x: 120 + r() * 1680, y: 120 + r() * 760, ph: r() * 6.28, s: 1.5 + r() * 3 }));
})();
