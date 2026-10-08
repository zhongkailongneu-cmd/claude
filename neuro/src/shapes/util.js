// Shared helpers for building the point clouds.
// Every shape fills exactly N particles with: position, colour, size and a
// vec4 of animation parameters that the vertex shader interprets per page.
//
// anim.x is always the "part" id. Part 9 is reserved for ambient drifting
// dust, which every shape uses to fill its leftover budget.

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

export const hex = (h) => {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

// Particle palette. Every neural structure is drawn in the low-saturation
// Loyel blues; the warmer accents only mark signals (ions, transmitters,
// neuromodulators, hormones), so the colour always means something.
export const C = {
  ice: hex('#E8EEF6'),
  pale: hex('#CCDBEB'),
  mist: hex('#9FBDDA'),
  steel: hex('#6C9AC4'),
  deep: hex('#497DAE'),
  navy: hex('#376392'),
  lav: hex('#AEBDE6'), // astrocytes: a lavender-leaning Loyel blue
  glu: hex('#E3C27E'), // glutamate, phosphorylation, salience
  ca: hex('#8FD3D6'), // Ca2+
  da: hex('#F0B27A'), // dopamine
  ht: hex('#E7A1C1'), // serotonin
  ne: hex('#9FE0C0'), // noradrenaline, newborn neurons
  ach: hex('#B9A6F0'), // acetylcholine, calmodulin, interneurons
  coral: hex('#E89A9A'), // heart, blood
  amber: hex('#E2B77D'), // microglia, cortisol
};

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const scale3 = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

// ---------- vectors ----------
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a) => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const lerp3 = mix3;

// Two unit vectors perpendicular to d (and to each other).
export function perp(d) {
  const a = Math.abs(d[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = norm(cross(d, a));
  return [u, cross(d, u)];
}

// Catmull-Rom through control points, `per` samples per span.
export function spline(ctrl, per = 12) {
  const out = [];
  const n = ctrl.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)];
    const p1 = ctrl[i];
    const p2 = ctrl[i + 1];
    const p3 = ctrl[Math.min(n - 1, i + 2)];
    for (let k = 0; k < per; k++) {
      const t = k / per;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push([0, 1, 2].map((j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)));
    }
  }
  out.push(ctrl[n - 1].slice());
  return out;
}

// Polyline with arc-length lookup.
export class Path {
  constructor(pts) {
    this.pts = pts;
    this.cum = [0];
    for (let i = 1; i < pts.length; i++) this.cum.push(this.cum[i - 1] + len(sub(pts[i], pts[i - 1])));
    this.total = this.cum[this.cum.length - 1] || 1e-6;
  }

  at(u) {
    const s = clamp(u, 0, 1) * this.total;
    let lo = 0;
    let hi = this.cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.cum[mid] <= s) lo = mid;
      else hi = mid;
    }
    const a = this.pts[lo];
    const b = this.pts[hi];
    const seg = this.cum[hi] - this.cum[lo] || 1e-6;
    const t = (s - this.cum[lo]) / seg;
    return { p: mix3(a, b, t), t: norm(sub(b, a)) };
  }
}

// ---------- noise (for cortical folds) ----------
function hash3(x, y, z) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function noise3(x, y, z) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = zf * zf * (3 - 2 * zf);
  const c = (i, j, k) => hash3(xi + i, yi + j, zi + k);
  const x00 = lerp(c(0, 0, 0), c(1, 0, 0), u);
  const x10 = lerp(c(0, 1, 0), c(1, 1, 0), u);
  const x01 = lerp(c(0, 0, 1), c(1, 0, 1), u);
  const x11 = lerp(c(0, 1, 1), c(1, 1, 1), u);
  return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w);
}
export function fbm3(x, y, z, oct = 3) {
  let s = 0;
  let a = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    s += a * noise3(x * f, y * f, z * f);
    f *= 2.03;
    a *= 0.5;
  }
  return s / (1 - Math.pow(0.5, oct));
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

  dir() {
    return norm([this.gauss(), this.gauss(), this.gauss()]);
  }

  // Slight brightness variation so surfaces sparkle instead of looking flat.
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

  addP(p, c, size, a0, a1, a2, a3) {
    return this.add(p[0], p[1], p[2], c, size, a0, a1, a2, a3);
  }

  // Particles along a path. Options may be values or functions of u (0..1).
  tube(path, n, o = {}) {
    const r = this.r;
    const val = (v, u, d) => (typeof v === 'function' ? v(u) : v === undefined ? d : v);
    for (let k = 0; k < n; k++) {
      const u = o.u ? o.u(r()) : r();
      const { p, t } = path.at(u);
      const [e1, e2] = perp(t);
      const ang = r() * Math.PI * 2;
      const R = val(o.r, u, 0.04) * (o.shell ? 0.85 + r() * 0.15 : Math.sqrt(r()));
      const q = add(p, add(mul(e1, Math.cos(ang) * R), mul(e2, Math.sin(ang) * R)));
      const c = this.vary(val(o.col, u, C.mist), o.vary ?? 0.2);
      const sz = val(o.size, u, 0.8) * (0.75 + r() * 0.5);
      this.addP(q, c, sz, val(o.part, u, 0), val(o.a1, u, u), val(o.a2, u, 0), o.a3 !== undefined ? val(o.a3, u) : r());
    }
  }

  // Filled or shell ellipsoid.
  blob(center, radii, n, o = {}) {
    for (let k = 0; k < n; k++) {
      const d = this.dir();
      const s = o.shell ? 0.9 + this.r() * 0.1 : Math.cbrt(this.r());
      const p = [center[0] + d[0] * radii[0] * s, center[1] + d[1] * radii[1] * s, center[2] + d[2] * radii[2] * s];
      const c = typeof o.col === 'function' ? o.col(d, s) : this.vary(o.col || C.mist, o.vary ?? 0.2);
      const sz = (o.size ?? 0.8) * (0.75 + this.r() * 0.5);
      this.addP(p, c, sz, o.part ?? 0, typeof o.a1 === 'function' ? o.a1(d, s) : o.a1 ?? s, o.a2 ?? 0, o.a3 ?? this.r());
    }
  }

  // Fill the remaining budget with faint drifting dust around the subject.
  halo(radius, palette, { y = 0, flat = 1, bright = 0.45 } = {}) {
    while (this.i < this.N) {
      const g = [this.gauss(), this.gauss(), this.gauss()];
      const l = Math.hypot(g[0], g[1], g[2]) || 1;
      const rr = radius * Math.pow(this.r(), 0.45);
      const c = scale3(this.pick(palette), bright * (0.4 + this.r() * 0.6));
      this.add((g[0] / l) * rr, y + (g[1] / l) * rr * flat, (g[2] / l) * rr, c, 0.45 + this.r() * 0.6, HALO);
    }
    return this;
  }

  // Shuffle so morphs between pages scatter organically instead of sliding
  // whole structures across the screen.
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

// ---------- branching trees (dendrites, axons, glial processes) ----------
// Returns a list of branches { path, r0, r1, d0, len, lvl }. d0 is the path
// distance from the root, so the shader can send pulses outward.
export function growTree(S, o) {
  const {
    origin, dir, length, radius = 0.06, depth = 3, spread = 0.7, lenDecay = 0.72, radDecay = 0.7,
    steps = 7, wiggle = 0.22, children = 2, bias = null, biasK = 0, childProb = 1,
  } = o;
  const out = [];
  const grow = (p0, d0v, L, r, dist, lvl) => {
    const pts = [p0];
    let p = p0;
    let d = d0v;
    for (let s = 0; s < steps; s++) {
      d = norm(add(d, mul(S.dir(), wiggle)));
      if (bias) d = norm(add(d, mul(bias, biasK)));
      p = add(p, mul(d, L / steps));
      pts.push(p);
    }
    out.push({ path: new Path(pts), r0: r, r1: r * radDecay, d0: dist, len: L, lvl });
    if (lvl >= depth) return;
    const nc = typeof children === 'function' ? children(lvl) : children;
    for (let c = 0; c < nc; c++) {
      if (S.r() > childProb) continue;
      const nd = norm(add(d, mul(S.dir(), spread * (0.6 + 0.8 * S.r()))));
      grow(p, nd, L * lenDecay * (0.8 + 0.4 * S.r()), r * radDecay, dist + L, lvl + 1);
    }
  };
  grow(origin, norm(dir), length, radius, 0, 0);
  return out;
}

export const treeReach = (branches) => Math.max(...branches.map((b) => b.d0 + b.len));

// Spread n particles over a set of branches, weighted by length × thickness.
export function fillTree(S, branches, n, o = {}) {
  const w = branches.map((b) => b.len * (0.4 + (b.r0 + b.r1) * 4));
  const cum = [];
  let tot = 0;
  for (const x of w) cum.push((tot += x));
  const reach = o.reach || treeReach(branches);
  for (let k = 0; k < n; k++) {
    const x = S.r() * tot;
    let i = 0;
    while (cum[i] < x) i++;
    const b = branches[i];
    const u = S.r();
    const { p, t } = b.path.at(u);
    const [e1, e2] = perp(t);
    const ang = S.r() * Math.PI * 2;
    const R = lerp(b.r0, b.r1, u) * Math.sqrt(S.r());
    const q = add(p, add(mul(e1, Math.cos(ang) * R), mul(e2, Math.sin(ang) * R)));
    const dist = (b.d0 + u * b.len) / reach;
    const c = o.col ? o.col(dist, b) : C.mist;
    const sz = (o.size ?? 0.8) * (0.75 + S.r() * 0.5) * (o.sizeFn ? o.sizeFn(dist, b) : 1);
    S.addP(q, S.vary(c, o.vary ?? 0.22), sz, o.part ?? 1, dist, o.a2 ? o.a2(b, i) : b.lvl / 8 + (i % 13) / 13, S.r());
  }
}

// Little bumps along dendrites: a dense head on a short neck.
export function spinesOnTree(S, branches, count, o = {}) {
  const pool = branches.filter((b) => b.lvl >= (o.minLvl ?? 1));
  const reach = o.reach || treeReach(branches);
  for (let k = 0; k < count; k++) {
    const b = pool[Math.floor(S.r() * pool.length)];
    const u = S.r();
    const { p, t } = b.path.at(u);
    const [e1, e2] = perp(t);
    const ang = S.r() * Math.PI * 2;
    const out = add(mul(e1, Math.cos(ang)), mul(e2, Math.sin(ang)));
    const L = (o.len ?? 0.14) * (0.6 + S.r() * 0.8);
    const head = add(p, mul(out, L));
    const dist = (b.d0 + u * b.len) / reach;
    const phase = S.r();
    const per = o.per ?? 4;
    for (let j = 0; j < per; j++) {
      const q = add(head, mul(S.dir(), (o.headR ?? 0.03) * S.r()));
      S.addP(q, S.vary(o.col || C.pale, 0.25), (o.size ?? 0.85) * (0.8 + S.r() * 0.5), o.part ?? 3, dist, phase, S.r());
    }
  }
}
