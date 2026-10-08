import { C, Path, spline, fbm3, clamp, smoothstep, scale3, mix3 } from './util.js';

// Shared brain geometry. Frame: +x anterior, +y superior, +z right.
// Each hemisphere is a smooth union of ellipsoids (frontal, parietal,
// occipital, temporal) cut flat along the midline; points are found by
// bisecting rays from the hemisphere centre, then the surface is folded into
// gyri and sulci with banded noise.

const LOBES = [
  // centre (z mirrored per hemisphere), radii
  [[-0.1, 0.45, 1.55], [3.9, 2.55, 1.7]], // cerebrum
  [[2.35, 0.25, 1.45], [1.85, 1.95, 1.55]], // frontal
  [[-0.8, 1.15, 1.4], [2.4, 1.85, 1.5]], // parietal
  [[-3.0, 0.35, 1.3], [1.35, 1.75, 1.3]], // occipital
  [[0.55, -1.25, 2.0], [2.35, 1.05, 1.15]], // temporal
];

const ell = (p, c, r) => {
  const x = (p[0] - c[0]) / r[0];
  const y = (p[1] - c[1]) / r[1];
  const z = (p[2] - c[2]) / r[2];
  return (Math.sqrt(x * x + y * y + z * z) - 1) * Math.min(r[0], r[1], r[2]);
};
const smin = (a, b, k) => {
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return b + (a - b) * h - k * h * (1 - h);
};

export function brainField(p, h) {
  let d = 1e9;
  for (const [c, r] of LOBES) d = smin(d, ell(p, [c[0], c[1], c[2] * h], r), 0.55);
  // Flat medial wall with a narrow longitudinal fissure.
  d = Math.max(d, 0.07 - p[2] * h);
  // Flatter base under the frontal lobe.
  d = Math.max(d, -2.25 - p[1] + 0.25 * Math.max(0, p[0] - 1.0));
  return d;
}

function cast(dir, h) {
  const c = [0, 0.35, 1.45 * h];
  let lo = 0;
  let hi = 7;
  for (let i = 0; i < 22; i++) {
    const m = (lo + hi) / 2;
    const p = [c[0] + dir[0] * m, c[1] + dir[1] * m, c[2] + dir[2] * m];
    if (brainField(p, h) < 0) lo = m;
    else hi = m;
  }
  return [c[0] + dir[0] * lo, c[1] + dir[1] * lo, c[2] + dir[2] * lo];
}

function normalAt(p, h) {
  const e = 0.03;
  const f = (x, y, z) => brainField([x, y, z], h);
  const n = [
    f(p[0] + e, p[1], p[2]) - f(p[0] - e, p[1], p[2]),
    f(p[0], p[1] + e, p[2]) - f(p[0], p[1] - e, p[2]),
    f(p[0], p[1], p[2] + e) - f(p[0], p[1], p[2] - e),
  ];
  const l = Math.hypot(n[0], n[1], n[2]) || 1;
  return [n[0] / l, n[1] / l, n[2] / l];
}

// One cortical surface sample: { p, n, h, fold } with fold 0 (deep sulcus) … 1 (gyral crown).
export function cortexPoint(S, { folds = true, depth = 0.2 } = {}) {
  const h = S.r() < 0.5 ? -1 : 1;
  const d = S.dir();
  let p = cast(d, h);
  const n = normalAt(p, h);
  let fold = 1;
  if (folds) {
    const w = fbm3(p[0] * 0.55 + 3.1, p[1] * 0.55 - 1.7, p[2] * 0.55 + h * 5.3, 3);
    fold = Math.abs(Math.sin(w * 15.5 + p[1] * 0.6));
    // Lateral (Sylvian) fissure: a groove between frontal/parietal and temporal lobes.
    if (Math.abs(p[2]) > 1.6) {
      const along = (p[0] - 2.4) / -3.4;
      const lineY = -0.35 + along * 0.95;
      const dist = Math.abs(p[1] - lineY);
      if (along > -0.05 && along < 1.05 && dist < 0.22) fold = Math.min(fold, dist / 0.22 * 0.3);
    }
    const sink = (1 - smoothstep(0.0, 0.55, fold)) * depth;
    p = [p[0] - n[0] * sink, p[1] - n[1] * sink, p[2] - n[2] * sink];
  }
  return { p, n, h, fold };
}

// Fill n particles on the cortex. col(fold, p) returns a colour.
export function cortex(S, n, o = {}) {
  for (let k = 0; k < n; k++) {
    const { p, fold, h } = cortexPoint(S, o);
    const c = o.col ? o.col(fold, p, h) : scale3(C.mist, 0.4 + 0.6 * fold);
    const jitter = o.jitter ?? 0.03;
    S.add(p[0] + (S.r() - 0.5) * jitter, p[1] + (S.r() - 0.5) * jitter, p[2] + (S.r() - 0.5) * jitter, S.vary(c, o.vary ?? 0.2),
      (o.size ?? 0.8) * (0.75 + S.r() * 0.5), o.part ?? 0, o.a1 ? o.a1(fold, p, h) : fold, o.a2 ? o.a2(fold, p, h) : h);
  }
}

// Cerebellum: two lobes under the occipital pole, striped with folia.
export function cerebellum(S, n, o = {}) {
  for (let k = 0; k < n; k++) {
    const h = S.r() < 0.5 ? -1 : 1;
    const d = S.dir();
    const c = [-2.85, -1.8, 1.0 * h];
    const r = [1.25, 0.85, 1.3];
    const vermis = Math.abs(d[2] * h + 0.9) < 0.15 ? 0.85 : 1;
    const p = [c[0] + d[0] * r[0], c[1] + d[1] * r[1] * vermis, c[2] + d[2] * r[2]];
    const folia = Math.abs(Math.sin(p[1] * 17 + p[0] * 2.5 + Math.abs(p[2]) * 0.8));
    const s = 1 - (1 - folia) * 0.06;
    const q = [c[0] + (p[0] - c[0]) * s, c[1] + (p[1] - c[1]) * s, c[2] + (p[2] - c[2]) * s];
    const col = o.col ? o.col(folia) : scale3(C.steel, 0.5 + 0.5 * folia);
    S.add(q[0], q[1], q[2], S.vary(col, 0.2), (o.size ?? 0.75) * (0.75 + S.r() * 0.5), o.part ?? 0, folia, h);
  }
}

export const STEM = new Path(spline([[-0.55, -0.9, 0], [-1.0, -2.1, 0], [-1.35, -3.3, 0], [-1.5, -4.6, 0]], 10));

export function brainstem(S, n, o = {}) {
  for (let k = 0; k < n; k++) {
    const u = S.r();
    const { p, t } = STEM.at(u);
    const a = S.r() * Math.PI * 2;
    const rad = (0.62 - u * 0.25) * (o.shell ? 0.9 + S.r() * 0.1 : Math.sqrt(S.r()));
    // perpendicular frame: stem runs mostly along -y
    const e1 = [1, -t[0] / (t[1] || -1e-3), 0];
    const l = Math.hypot(e1[0], e1[1]) || 1;
    const q = [p[0] + (e1[0] / l) * Math.cos(a) * rad, p[1] + (e1[1] / l) * Math.cos(a) * rad, p[2] + Math.sin(a) * rad];
    const col = o.col ? o.col(u) : mix3(C.steel, C.deep, u);
    S.add(q[0], q[1], q[2], S.vary(col, 0.2), (o.size ?? 0.75) * (0.75 + S.r() * 0.5), o.part ?? 0, u, 0);
  }
}

// Snap a point to the nearest spot on the cortex along the ray from the hemisphere centre.
export function onCortex(p) {
  const h = p[2] < 0 ? -1 : 1;
  const c = [0, 0.35, 1.45 * h];
  const d = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
  const l = Math.hypot(d[0], d[1], d[2]) || 1;
  return cast([d[0] / l, d[1] / l, d[2] / l], h);
}
