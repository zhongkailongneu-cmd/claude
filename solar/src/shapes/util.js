// Shared helpers for building celestial point clouds.
// Every shape fills exactly N particles with: position, two colours (the
// "multi" true-colour palette and the "mono" blue / flame palette), size and a
// vec4 of animation parameters that the vertex shader interprets per page.
//
// anim.x is always the "part" id (see particles.js). Part 15 is reserved for
// ambient space dust, which every shape uses to fill its leftover budget.

export const HALO = 15;
export const DEG = Math.PI / 180;

export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Hex colours are authored in display space and passed straight to the shader.
export const hex = (h) => {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
// A colour pair: [multi (true colour), mono (blue fluorescence, or flame for the Sun)].
export const duo = (multi, mono) => [hex(multi), hex(mono)];

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const scale3 = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
export const mixDuo = (a, b, t) => [mix3(a[0], b[0], t), mix3(a[1], b[1], t)];
export const scaleDuo = (d, k) => [scale3(d[0], k), scale3(d[1], k)];

// Pick along a multi-stop gradient of duos, t in [0,1].
export function rampDuo(stops, t) {
  const n = stops.length - 1;
  const x = clamp(t, 0, 1) * n;
  const i = Math.min(n - 1, Math.floor(x));
  return mixDuo(stops[i], stops[i + 1], x - i);
}

// Piecewise-smooth profile from [[u, value], ...] keypoints.
export function profile(keys, u) {
  if (u <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (u <= keys[i][0]) {
      const [u0, v0] = keys[i - 1];
      const [u1, v1] = keys[i];
      const t = (u - u0) / (u1 - u0);
      return v0 + (v1 - v0) * t * t * (3 - 2 * t);
    }
  }
  return keys[keys.length - 1][1];
}

// ---------- noise (deterministic 3D value noise) ----------
function hash(ix, iy, iz, seed) {
  let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ Math.imul(iz, 0x9e3779b1) ^ Math.imul(seed, 0x632be5ab);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const fade = (t) => t * t * (3 - 2 * t);
export function noise3(x, y, z, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = fade(x - ix), fy = fade(y - iy), fz = fade(z - iz);
  const c = (dx, dy, dz) => hash(ix + dx, iy + dy, iz + dz, seed);
  const x00 = lerp(c(0, 0, 0), c(1, 0, 0), fx);
  const x10 = lerp(c(0, 1, 0), c(1, 1, 0), fx);
  const x01 = lerp(c(0, 0, 1), c(1, 0, 1), fx);
  const x11 = lerp(c(0, 1, 1), c(1, 1, 1), fx);
  return lerp(lerp(x00, x10, fy), lerp(x01, x11, fy), fz);
}
// Fractal sum, roughly 0..1 with mean 0.5.
export function fbm(x, y, z, oct = 4, seed = 0) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let o = 0; o < oct; o++) {
    s += a * noise3(x * f, y * f, z * f, seed + o * 17);
    n += a;
    a *= 0.5;
    f *= 2.03;
  }
  return s / n;
}

// ---------- sphere geometry ----------
// Longitude 0 faces the camera (+z); longitude grows eastward (+x, to the right).
export function vec(latDeg, lonDeg) {
  const la = latDeg * DEG, lo = lonDeg * DEG;
  return [Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)];
}
export const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
// Angular distance in degrees between two unit vectors.
export const angDeg = (a, b) => Math.acos(clamp(dot3(a, b), -1, 1)) / DEG;
// Signed longitude difference wrapped to [-180, 180).
export const dLon = (a, b) => ((((a - b) % 360) + 540) % 360) - 180;

export class Shape {
  constructor(N, seed) {
    this.N = N;
    this.i = 0;
    this.r = rng(seed);
    this.pos = new Float32Array(N * 3);
    this.col = new Float32Array(N * 3);
    this.mono = new Float32Array(N * 3);
    this.anim = new Float32Array(N * 4);
    this.size = new Float32Array(N);
  }

  budget(fraction) {
    return Math.floor(this.N * fraction);
  }

  gauss() {
    let u = 0;
    while (u === 0) u = this.r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * this.r());
  }

  pick(list) {
    return list[Math.floor(this.r() * list.length)];
  }

  // Slight brightness variation so surfaces sparkle instead of looking flat.
  vary(d, amt = 0.16) {
    return scaleDuo(d, 1 + (this.r() - 0.5) * 2 * amt);
  }

  add(x, y, z, d, size = 1, a0 = 0, a1 = 0, a2 = 0, a3 = this.r()) {
    if (this.i >= this.N) return false;
    const i = this.i++;
    const [c, m] = d;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.col[i * 3] = c[0];
    this.col[i * 3 + 1] = c[1];
    this.col[i * 3 + 2] = c[2];
    this.mono[i * 3] = m[0];
    this.mono[i * 3 + 1] = m[1];
    this.mono[i * 3 + 2] = m[2];
    this.anim[i * 4] = a0;
    this.anim[i * 4 + 1] = a1;
    this.anim[i * 4 + 2] = a2;
    this.anim[i * 4 + 3] = a3;
    this.size[i] = size;
    return true;
  }

  // Random point on a sphere of radius R; `paint(lat, lon, v)` returns a duo,
  // or [duo, sizeScale]. `shell` is the relative thickness of the surface.
  sphere(R, count, paint, { part = 0, shell = 0.012, size = 1.2, a1 = 0, a2 = 0, cx = 0, cy = 0, cz = 0 } = {}) {
    const r = this.r;
    for (let k = 0; k < count; k++) {
      const y = r() * 2 - 1;
      const lon = r() * 360 - 180;
      const lat = Math.asin(y) / DEG;
      const v = vec(lat, lon);
      const out = paint(lat, lon, v);
      const d = Array.isArray(out[0][0]) ? out[0] : out;
      const sk = Array.isArray(out[0][0]) ? out[1] : 1;
      const rr = R * (1 + (r() - 0.5) * shell);
      this.add(cx + v[0] * rr, cy + v[1] * rr, cz + v[2] * rr, this.vary(d, 0.07), size * sk * (0.88 + r() * 0.24), part, a1, a2);
    }
    return this;
  }

  // A soft shell (atmosphere / haze) between R0 and R1, denser near R0.
  shellDust(R0, R1, count, d, { part = 2, size = 0.7, pow = 2 } = {}) {
    const r = this.r;
    for (let k = 0; k < count; k++) {
      const y = r() * 2 - 1;
      const lon = r() * 360 - 180;
      const lat = Math.asin(y) / DEG;
      const v = vec(lat, lon);
      const f = Math.pow(r(), pow);
      const rr = R0 + (R1 - R0) * f;
      this.add(v[0] * rr, v[1] * rr, v[2] * rr, scaleDuo(d, (1 - f * 0.7) * (0.6 + r() * 0.5)), size * (0.7 + r() * 0.5), part, f, 0);
    }
    return this;
  }

  // Fill the remaining budget with faint space dust around the body.
  halo(rMin, rMax, palette, { flat = 1, bright = 0.45, y = 0 } = {}) {
    const r = this.r;
    while (this.i < this.N) {
      const g = [this.gauss(), this.gauss(), this.gauss()];
      const len = Math.hypot(g[0], g[1], g[2]) || 1;
      const rr = rMin + (rMax - rMin) * Math.pow(r(), 0.7);
      const d = scaleDuo(this.pick(palette), bright * (0.35 + r() * 0.65));
      this.add((g[0] / len) * rr, y + (g[1] / len) * rr * flat, (g[2] / len) * rr, d, 0.4 + r() * 0.6, HALO);
    }
    return this;
  }

  // Shuffle so morphs between bodies scatter organically instead of sliding
  // whole surfaces across the screen.
  done() {
    const { N, pos, col, mono, anim, size, r } = this;
    for (let i = N - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      for (let k = 0; k < 3; k++) {
        let t = pos[i * 3 + k]; pos[i * 3 + k] = pos[j * 3 + k]; pos[j * 3 + k] = t;
        t = col[i * 3 + k]; col[i * 3 + k] = col[j * 3 + k]; col[j * 3 + k] = t;
        t = mono[i * 3 + k]; mono[i * 3 + k] = mono[j * 3 + k]; mono[j * 3 + k] = t;
      }
      for (let k = 0; k < 4; k++) {
        const t = anim[i * 4 + k]; anim[i * 4 + k] = anim[j * 4 + k]; anim[j * 4 + k] = t;
      }
      const t = size[i]; size[i] = size[j]; size[j] = t;
    }
    return this;
  }
}

// Loyel gradient-blue scale (mono palette for every planet).
export const L = {
  10: '#F4F7FB', 20: '#E8EEF6', 30: '#CCDBEB', 40: '#9FBDDA', 50: '#6C9AC4',
  60: '#497DAE', 70: '#376392', 80: '#2E5076', 90: '#2B4868', 100: '#263B54',
};
// Flame scale (mono palette for the Sun).
export const F = {
  white: '#FFE2B0', light: '#FFC46E', amber: '#FFA23A', orange: '#FF7A1A', red: '#EE5210', deep: '#B8360A', ember: '#6E1C05',
};
