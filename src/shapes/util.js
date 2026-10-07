// Shared helpers for building creature point clouds.
// Every shape fills exactly N particles with: position, colour, size and a
// vec4 of animation parameters that the vertex shader interprets per creature.
//
// anim.x is always the "part" id. Part 9 is reserved for ambient halo
// plankton, which every creature uses to fill its leftover budget.

export const HALO = 9;

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

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const scale3 = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

// Pick along a multi-stop gradient, t in [0,1].
export function ramp(stops, t) {
  const n = stops.length - 1;
  const x = clamp(t, 0, 1) * n;
  const i = Math.min(n - 1, Math.floor(x));
  return mix3(stops[i], stops[i + 1], x - i);
}

// Piecewise-linear profile from [[u, value], ...] keypoints.
export function profile(keys, u) {
  if (u <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (u <= keys[i][0]) {
      const [u0, v0] = keys[i - 1];
      const [u1, v1] = keys[i];
      const t = (u - u0) / (u1 - u0);
      const s = t * t * (3 - 2 * t);
      return v0 + (v1 - v0) * s;
    }
  }
  return keys[keys.length - 1][1];
}

export class Shape {
  constructor(N, seed) {
    this.N = N;
    this.i = 0;
    this.r = rng(seed);
    this.pos = new Float32Array(N * 3);
    this.col = new Float32Array(N * 3);
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

  // Slight brightness/hue variation so surfaces sparkle instead of looking flat.
  vary(c, amt = 0.18) {
    const k = 1 + (this.r() - 0.5) * 2 * amt;
    return [c[0] * k, c[1] * k, c[2] * k];
  }

  add(x, y, z, c, size = 1, a0 = 0, a1 = 0, a2 = 0, a3 = this.r()) {
    if (this.i >= this.N) return false;
    const i = this.i++;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.col[i * 3] = c[0];
    this.col[i * 3 + 1] = c[1];
    this.col[i * 3 + 2] = c[2];
    this.anim[i * 4] = a0;
    this.anim[i * 4 + 1] = a1;
    this.anim[i * 4 + 2] = a2;
    this.anim[i * 4 + 3] = a3;
    this.size[i] = size;
    return true;
  }

  // Fill the remaining budget with drifting plankton around the creature.
  halo(radius, palette, { y = 0, flat = 1, bright = 0.55 } = {}) {
    while (this.i < this.N) {
      const g = [this.gauss(), this.gauss(), this.gauss()];
      const len = Math.hypot(g[0], g[1], g[2]) || 1;
      const rr = radius * Math.pow(this.r(), 0.45);
      const c = scale3(this.pick(palette), bright * (0.4 + this.r() * 0.6));
      this.add((g[0] / len) * rr, y + (g[1] / len) * rr * flat, (g[2] / len) * rr, c, 0.45 + this.r() * 0.6, HALO);
    }
    return this;
  }

  // Shuffle so morphs between creatures scatter organically instead of
  // sliding whole body parts across the screen.
  done() {
    const { N, pos, col, anim, size, r } = this;
    for (let i = N - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      for (let k = 0; k < 3; k++) {
        let t = pos[i * 3 + k]; pos[i * 3 + k] = pos[j * 3 + k]; pos[j * 3 + k] = t;
        t = col[i * 3 + k]; col[i * 3 + k] = col[j * 3 + k]; col[j * 3 + k] = t;
      }
      for (let k = 0; k < 4; k++) {
        const t = anim[i * 4 + k]; anim[i * 4 + k] = anim[j * 4 + k]; anim[j * 4 + k] = t;
      }
      const t = size[i]; size[i] = size[j]; size[j] = t;
    }
    return this;
  }
}
