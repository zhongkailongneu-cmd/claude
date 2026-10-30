// Procedural neuron network.
//
// Every neuron is a soma with a branching dendritic arbor and one axon that runs to its
// targets, splits into terminal twigs and ends in boutons that touch a dendrite of the
// target cell (the synapse). Everything is generated once from a fixed seed, as flat typed
// arrays, and the GPU grows it: each vertex carries `aGrow`, the moment (0..1 of its
// neuron's growth) at which the branch front reaches it.
//
// Units are world units; the camera sees half a unit of height per unit of scale at z=0
// (see field.js), the hero neuron is roughly 1.6 units across.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const dist = (a, b) => len(sub(a, b));

function randUnit(rng) {
  const z = rng() * 2 - 1;
  const a = rng() * Math.PI * 2;
  const r = Math.sqrt(1 - z * z);
  return [r * Math.cos(a), r * Math.sin(a), z];
}
function perpTo(d, rng) {
  const r = randUnit(rng);
  return norm(sub(r, mul(d, dot(r, d))));
}
function rotateAround(v, axis, ang) {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const k = cross(axis, v);
  const d = dot(axis, v) * (1 - c);
  return [v[0] * c + k[0] * s + axis[0] * d, v[1] * c + k[1] * s + axis[1] * d, v[2] * c + k[2] * s + axis[2] * d];
}

// ---- dendrites ----------------------------------------------------------------------------
const STEP = 0.05;

function growDendrite(rng, nrn, origin, dir, length, depth, maxDepth, dist0, out) {
  const n = Math.max(3, Math.round(length / STEP));
  const seg = length / n;
  const pts = [origin];
  const dirs = [dir];
  let p = origin;
  let d = dir;
  for (let i = 1; i <= n; i++) {
    const wob = randUnit(rng);
    const outward = norm(sub(p, nrn.pos));
    d = norm(add(add(d, mul(wob, 0.34)), mul(outward, 0.09)));
    p = add(p, mul(d, seg));
    pts.push(p);
    dirs.push(d);
  }
  out.branches.push({ pts, dist0, kind: 0, depth });
  // a short side twig somewhere along the thicker branches
  if (depth <= 1 && n > 6 && rng() < 0.6) {
    const k = 2 + Math.floor(rng() * (n - 4));
    const axis = perpTo(dirs[k], rng);
    const sd = rotateAround(dirs[k], axis, 0.7 + rng() * 0.5);
    growDendrite(rng, nrn, pts[k], sd, length * (0.4 + rng() * 0.15), maxDepth, maxDepth, dist0 + k * seg, out);
  }
  if (depth < maxDepth) {
    const axis = perpTo(d, rng);
    const ang = 0.38 + rng() * 0.38;
    for (const sgn of [-1, 1]) {
      growDendrite(rng, nrn, p, norm(rotateAround(d, axis, sgn * ang)), length * (0.6 + rng() * 0.2), depth + 1, maxDepth, dist0 + length, out);
    }
  } else {
    out.leaves.push({ p, dist: dist0 + length, used: 0 });
    out.tips.push({ p, dist: dist0 + length, kind: 'dend' });
  }
}

// ---- axons -------------------------------------------------------------------------------------
function bezier(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1], a * p0[2] + b * p1[2] + c * p2[2] + d * p3[2]];
}

function arcLength(f, n = 24) {
  let l = 0;
  let prev = f(0);
  for (let i = 1; i <= n; i++) { const c = f(i / n); l += dist(prev, c); prev = c; }
  return l;
}

// Wavy path from a to b leaving along `dir0` and arriving from outside the target.
function axonPoints(rng, a, dir0, b, outward, wobble = 1) {
  const L = dist(a, b);
  const p1 = add(a, mul(dir0, L * 0.36));
  const p2 = add(b, mul(outward, L * 0.3));
  const f = (t) => bezier(a, p1, p2, b, t);
  const total = arcLength(f);
  const n = Math.max(8, Math.ceil(total / 0.042));
  const chord = norm(sub(b, a));
  const n1 = perpTo(chord, rng);
  const n2 = norm(cross(chord, n1));
  const f1 = 3 + rng() * 4;
  const f2 = 7 + rng() * 6;
  const ph1 = rng() * 6.28;
  const ph2 = rng() * 6.28;
  const amp = 0.026 * Math.sqrt(L) * wobble;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const env = Math.sin(Math.PI * t);
    const o = add(mul(n1, Math.sin(t * f1 * Math.PI + ph1) * amp * env), mul(n2, Math.sin(t * f2 * Math.PI + ph2) * amp * 0.55 * env));
    pts.push(add(f(t), o));
  }
  return pts;
}

function polyLength(pts) {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += dist(pts[i - 1], pts[i]);
  return l;
}

function takeLeaf(dst, from) {
  let best = null;
  let bd = 1e9;
  for (const lf of dst.leaves) {
    const d = dist(lf.p, from) + lf.used * 0.35;
    if (d < bd) { bd = d; best = lf; }
  }
  best.used++;
  return best;
}

// Builds one axon edge (main axon or collateral) with terminal twigs; returns its branches/boutons.
function buildAxonEdge(rng, src, dst, startPt, startDist, dir0, twigs, out) {
  const leaf = takeLeaf(dst, startPt);
  const outward = norm(sub(leaf.p, dst.pos));
  const pts = axonPoints(rng, startPt, dir0, leaf.p, outward);
  out.branches.push({ pts, dist0: startDist, kind: 1, depth: 0 });
  const total = polyLength(pts);
  const endDist = startDist + total;
  out.boutons.push({ p: leaf.p, dist: endDist, src: src.id, dst: dst.id, leafDist: leaf.dist });
  out.tips.push({ p: leaf.p, dist: endDist, kind: 'axon' });
  // terminal twigs: short branches that reach for neighbouring dendrite tips
  const k = Math.floor(pts.length * (0.82 + rng() * 0.06));
  const kDist = startDist + polyLength(pts.slice(0, k + 1));
  for (let t = 0; t < twigs; t++) {
    let target;
    const near = dst.leaves.filter((l) => dist(l.p, pts[k]) < 0.55 && l !== leaf);
    if (near.length) {
      const lf = near[Math.floor(rng() * near.length)];
      lf.used++;
      target = lf.p;
    } else {
      target = add(leaf.p, mul(randUnit(rng), 0.07 + rng() * 0.08));
    }
    const mid = add(lerp3(pts[k], target, 0.5), mul(randUnit(rng), dist(pts[k], target) * 0.28));
    const m = Math.max(5, Math.round(dist(pts[k], target) / 0.032));
    const tw = [];
    for (let i = 0; i <= m; i++) {
      const u = i / m;
      const a2 = lerp3(pts[k], mid, u);
      const b2 = lerp3(mid, target, u);
      tw.push(lerp3(a2, b2, u));
    }
    out.branches.push({ pts: tw, dist0: kDist, kind: 2, depth: 1 });
    const twDist = kDist + polyLength(tw);
    out.boutons.push({ p: target, dist: twDist, src: src.id, dst: dst.id, leafDist: leaf.dist });
    out.tips.push({ p: target, dist: twDist, kind: 'axon' });
  }
  return { pts, startDist, total };
}

// ---- network ---------------------------------------------------------------------------------------
export function generateNetwork({ count = 130, seed = 20250, mobile = false } = {}) {
  const rng = mulberry32(seed);
  const neurons = [];

  const place = (pos, scale, birth, span, opts = {}) => {
    neurons.push({ id: neurons.length, pos, scale, birth, span, leaves: [], dendMax: 1, axonMax: 1, branches: [], boutons: [], tips: [], spines: [], targets: [], hero: !!opts.hero, rnd: rng() });
  };
  // 0: the hero, 1: its first partner, 2-5: faint neighbours behind the hero (born during the intro)
  place([-0.95, 0.0, 0.0], 1.0, -1.0, 2.4, { hero: true });
  place([2.55, 0.18, -0.15], 0.9, 0.5, 1.15);
  const backdrop = [[-2.0, 0.85, -2.3], [-0.1, -1.1, -2.7], [0.9, 1.15, -2.1], [1.7, -0.95, -2.9]];
  backdrop.forEach((p, i) => place(p, 0.62, -0.85 + i * 0.16, 1.3));

  // the rest: Poisson-ish scatter through the network volume
  const X = [-2.5, 5.0];
  const Y = [-2.2, 2.2];
  const Z = [-3.4, 0.5];
  let guard = 0;
  while (neurons.length < count && guard++ < 20000) {
    const p = [X[0] + rng() * (X[1] - X[0]), Y[0] + rng() * (Y[1] - Y[0]), Z[0] + Math.pow(rng(), 0.75) * (Z[1] - Z[0])];
    if (neurons.some((n) => dist(n.pos, p) < 0.62)) continue;
    const d = dist(p, neurons[0].pos);
    place(p, 0.55 + rng() * 0.32, 0, 1);
  }
  // growth waves ripple outwards from the hero
  const dmax = Math.max(...neurons.slice(6).map((n) => dist(n.pos, neurons[0].pos)));
  for (const n of neurons.slice(6)) {
    const d = dist(n.pos, neurons[0].pos) / dmax;
    n.birth = 0.85 + 1.95 * Math.pow(d, 0.9) + rng() * 0.28;
    n.span = 0.95 + rng() * 0.4;
  }

  // dendrites
  for (const n of neurons) {
    const out = { branches: [], leaves: n.leaves, tips: n.tips };
    const primaries = n.hero ? 8 : 4 + Math.floor(rng() * 3);
    const baseLen = n.hero ? 0.44 : 0.42 * n.scale + 0.12;
    const maxDepth = n.hero ? 3 : n.scale > 0.7 ? 3 : 2;
    const offset = rng() * Math.PI * 2;
    for (let i = 0; i < primaries; i++) {
      let d;
      if (n.hero) {
        // the hero spreads mostly in the picture plane, leaving the right-hand side for the axon
        const a = offset + (i / primaries) * Math.PI * 2;
        d = norm([Math.cos(a), Math.sin(a), (rng() - 0.5) * 0.7]);
        if (d[0] > 0.55) d = norm([d[0] * 0.4 - 0.1, d[1], d[2]]);
      } else d = randUnit(rng);
      const start = add(n.pos, mul(d, 0.02 * n.scale));
      growDendrite(rng, n, start, d, baseLen * (0.8 + rng() * 0.45), 0, maxDepth, 0, out);
    }
    n.branches.push(...out.branches);
    n.dendMax = Math.max(...out.branches.map((b) => b.dist0 + polyLength(b.pts)));
    // dendritic spines: tiny dots on the outer branches
    for (const b of out.branches) {
      if (b.depth < 1) continue;
      const m = Math.floor(b.pts.length * 0.5);
      for (let i = 0; i < m; i++) {
        if (rng() < 0.45) {
          const k = 1 + Math.floor(rng() * (b.pts.length - 1));
          const sp = add(b.pts[k], mul(randUnit(rng), 0.012 + rng() * 0.012));
          n.spines.push({ p: sp, dist: b.dist0 + k * (polyLength(b.pts) / (b.pts.length - 1)) });
        }
      }
    }
  }

  // targets
  const sorted = (n) => neurons.filter((m) => m.id !== n.id).map((m) => ({ m, d: dist(m.pos, n.pos) })).sort((a, b) => a.d - b.d);
  const incoming = new Array(neurons.length).fill(0);
  for (const n of neurons) {
    const cand = sorted(n).filter((c) => c.d > 0.45 && c.d < 3.0);
    if (n.id === 0) n.targets = [neurons[1], ...cand.filter((c) => c.m.id > 5 && c.d < 2.3).slice(0, 2).map((c) => c.m)];
    else if (n.id === 1) n.targets = cand.slice(0, 3).map((c) => c.m);
    else {
      const pool = cand.slice(0, 8);
      const want = 2 + (rng() < 0.5 ? 1 : 0);
      n.targets = [];
      while (n.targets.length < want && pool.length) {
        const k = Math.floor(Math.pow(rng(), 1.6) * pool.length);
        n.targets.push(pool.splice(k, 1)[0].m);
      }
    }
    n.targets.forEach((t) => incoming[t.id]++);
  }
  // make sure every cell is somebody's target
  for (const n of neurons) {
    if (incoming[n.id] === 0) {
      const from = sorted(n).find((c) => c.d < 2.4 && c.m.id > 1);
      if (from) { from.m.targets.push(n); incoming[n.id]++; }
    }
  }

  // axons
  for (const n of neurons) {
    const out = { branches: [], boutons: [], tips: [] };
    let mainPts = null;
    n.targets.forEach((t, i) => {
      if (i === 0) {
        const toward = norm(sub(t.pos, n.pos));
        const dir0 = norm(add(toward, mul(randUnit(rng), 0.7)));
        const startPt = add(n.pos, mul(dir0, 0.03 * n.scale));
        const r = buildAxonEdge(rng, n, t, startPt, 0.03 * n.scale, dir0, 2, out);
        mainPts = r;
      } else {
        // collateral leaves the main axon part-way
        const m = mainPts.pts;
        const k = Math.floor(m.length * (0.3 + rng() * 0.32));
        const startDist = mainPts.startDist + polyLength(m.slice(0, k + 1));
        const tang = norm(sub(m[Math.min(k + 1, m.length - 1)], m[k]));
        const toward = norm(sub(t.pos, m[k]));
        const dir0 = norm(add(add(toward, mul(tang, 0.4)), mul(randUnit(rng), 0.35)));
        buildAxonEdge(rng, n, t, m[k], startDist, dir0, 1, out);
      }
    });
    n.branches.push(...out.branches);
    n.boutons = out.boutons;
    n.tips.push(...out.tips);
    n.axonMax = Math.max(0.2, ...out.branches.map((b) => b.dist0 + polyLength(b.pts)));
  }

  // ---- flatten to typed arrays ---------------------------------------------------------------------
  const DEND_FRAC = 0.3;
  const AXON_START = 0.2;
  const growOf = (n, kind, d) => (kind === 0 ? DEND_FRAC * Math.min(1, d / n.dendMax) : AXON_START + (1 - AXON_START) * Math.min(1, d / n.axonMax));

  let nPts = 0;
  for (const n of neurons) for (const b of n.branches) nPts += b.pts.length;
  const position = new Float32Array(nPts * 2 * 3);
  const aNext = new Float32Array(nPts * 2 * 3);
  const aInfo = new Float32Array(nPts * 2 * 4);
  const aDist = new Float32Array(nPts * 2);
  const aSide = new Float32Array(nPts * 2);
  const index = new Uint32Array(Math.max(0, nPts - neurons.reduce((s, n) => s + n.branches.length, 0)) * 6);

  let v = 0;
  let ix = 0;
  for (const n of neurons) {
    for (const b of n.branches) {
      const base = v;
      const cum = [0];
      for (let i = 1; i < b.pts.length; i++) cum.push(cum[i - 1] + dist(b.pts[i - 1], b.pts[i]));
      const w0 = b.kind === 0 ? 1.45 * Math.pow(0.66, b.depth) + 0.38 : b.kind === 1 ? 1.15 : 0.62;
      const w1 = b.kind === 0 ? w0 * 0.62 : b.kind === 1 ? 0.8 : 0.45;
      for (let i = 0; i < b.pts.length; i++) {
        const p = b.pts[i];
        const nx = i < b.pts.length - 1 ? b.pts[i + 1] : add(p, sub(p, b.pts[Math.max(0, i - 1)]));
        const d = b.dist0 + cum[i];
        const g = growOf(n, b.kind, d);
        const w = w0 + (w1 - w0) * (i / (b.pts.length - 1));
        for (const s of [-1, 1]) {
          position.set(p, v * 3);
          aNext.set(nx, v * 3);
          aInfo.set([g, n.id, w, b.kind], v * 4);
          aDist[v] = d;
          aSide[v] = s;
          v++;
        }
      }
      for (let i = 0; i < b.pts.length - 1; i++) {
        const a = base + i * 2;
        index.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], ix);
        ix += 6;
      }
    }
  }

  // point sprites: somas, growth cones, boutons, spines
  const pts = [];
  const pushPt = (p, nid, g, size, kind, dist_, tSyn, rnd) => pts.push({ p, a: [nid, g, size, kind], b: [dist_, tSyn, rnd, 0] });
  const edges = [];
  for (const n of neurons) {
    pushPt(n.pos, n.id, 0, (n.hero ? 0.2 : 0.11 + 0.07 * n.scale), 0, 0, 0, n.rnd);
    for (const t of n.tips) {
      const kind = t.kind === 'axon' ? 1 : 1;
      pushPt(t.p, n.id, growOf(n, t.kind === 'axon' ? 1 : 0, t.dist), t.kind === 'axon' ? 0.05 : 0.036, kind, t.dist, 0, rng());
    }
    for (const s of n.spines) pushPt(s.p, n.id, growOf(n, 0, s.dist), 0.016, 3, s.dist, 0, rng());
    for (const bt of n.boutons) {
      const dst = neurons[bt.dst];
      const tAxon = n.birth + n.span * growOf(n, 1, bt.dist);
      const tLeaf = dst.birth + dst.span * growOf(dst, 0, bt.leafDist);
      const tSyn = Math.max(tAxon, tLeaf) + 0.02;
      bt.tSyn = tSyn;
      pushPt(bt.p, n.id, 0, 0.042, 2, bt.dist, tSyn, rng());
      edges.push({ src: n.id, dst: bt.dst, len: bt.dist, tSyn });
    }
  }
  const nodeCount = pts.length;
  const nPosition = new Float32Array(nodeCount * 3);
  const nA = new Float32Array(nodeCount * 4);
  const nB = new Float32Array(nodeCount * 4);
  pts.forEach((q, i) => { nPosition.set(q.p, i * 3); nA.set(q.a, i * 4); nB.set(q.b, i * 4); });

  // graph for the activity cascades: shortest axon length per (src,dst)
  const best = new Map();
  for (const e of edges) {
    const key = e.src * 4096 + e.dst;
    const cur = best.get(key);
    if (!cur || e.len < cur.len) best.set(key, { ...e });
    else cur.tSyn = Math.min(cur.tSyn, e.tSyn);
  }
  const graph = neurons.map(() => []);
  for (const e of best.values()) graph[e.src].push(e);

  // data texture: rows 0-1 = soma/birth/span/scale, rows 2-3 = fire events
  const N = neurons.length;
  const tex = new Float32Array(N * 4 * 4);
  for (let i = 0; i < N; i++) {
    const n = neurons[i];
    tex.set([n.pos[0], n.pos[1], n.pos[2], n.birth], i * 4);
    tex.set([n.span, n.scale, n.rnd, 0], (N + i) * 4);
    tex.set([-1e9, -1e9, -1e9, -1e9], (2 * N + i) * 4);
    tex.set([-1e9, -1e9, -1e9, -1e9], (3 * N + i) * 4);
  }

  // camera story: the front of the hero's main axon, and a synapse that forms around p = 3
  const hero0 = neurons[0];
  const main = hero0.branches.find((b) => b.kind === 1);
  const cum = [0];
  for (let i = 1; i < main.pts.length; i++) cum.push(cum[i - 1] + dist(main.pts[i - 1], main.pts[i]));
  const heroTip = (S) => {
    const f = Math.min(1, Math.max(0, (S - hero0.birth) / hero0.span));
    const g = (f - AXON_START) / (1 - AXON_START);
    const d = Math.min(Math.max(g * hero0.axonMax - main.dist0, 0), cum[cum.length - 1]);
    let i = 1;
    while (i < cum.length - 1 && cum[i] < d) i++;
    const t = (d - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
    return lerp3(main.pts[i - 1], main.pts[i], Math.min(1, Math.max(0, t)));
  };
  let focus3 = [1.9, 0, -0.4];
  let bestK = 1e9;
  for (const n of neurons) {
    for (const bt of n.boutons) {
      const q = bt.p;
      if (q[0] < 0.6 || q[0] > 3.4 || Math.abs(q[1]) > 0.9 || q[2] < -1.4 || q[2] > 0.3) continue;
      const k = Math.abs(bt.tSyn - 3.0);
      if (k < bestK) { bestK = k; focus3 = q; }
    }
  }

  return {
    neurons, N, graph, tex, heroTip, focus3,
    ribbon: { position, aNext, aInfo, aDist, aSide, index, count: nPts },
    nodes: { position: nPosition, aA: nA, aB: nB, count: nodeCount },
    stats: { neurons: N, points: nPts, nodes: nodeCount, synapses: edges.length },
  };
}
