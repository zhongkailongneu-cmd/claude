import { Shape, C, Path, spline, growTree, fillTree, add, mul, scale3, mix3 } from './util.js';
import { cortex } from './brainshape.js';

// L10 · Brain–body–environment. A standing figure drawn by its nervous
// system: brain, spinal cord, peripheral nerves into the limbs, the vagus
// nerve to heart and gut, and the HPA axis (hypothalamus → pituitary →
// adrenal glands → cortisol back to the brain). Around it, rings of the
// world it lives in and a few other people.
// parts: 0 brain · 1 spinal cord (anim.y = along) · 2 peripheral nerve (anim.y = out from cord)
//        3 vagus (anim.y = along) · 4 heart · 5 gut · 6 body outline · 7 environment
//        8 HPA / cortisol path (anim.y = along)

export function body(N, seed = 141) {
  const S = new Shape(N, seed);
  const r = S.r;

  // Brain: a small copy of the whole-brain model, seen from the front.
  const nBrain = S.budget(0.15);
  const bs = 0.27;
  const before = S.i;
  cortex(S, nBrain, { part: 0, depth: 0.2, size: 0.75, col: (f) => mix3(C.steel, C.pale, f) });
  for (let i = before; i < S.i; i++) {
    const x = S.pos[i * 3];
    const y = S.pos[i * 3 + 1];
    const z = S.pos[i * 3 + 2];
    // brain frame (x anterior) → figure frame (z toward viewer)
    S.pos[i * 3] = z * bs;
    S.pos[i * 3 + 1] = 4.6 + y * bs;
    S.pos[i * 3 + 2] = x * bs;
  }

  const cord = new Path(spline([[0, 4.0, -0.2], [0, 3.3, -0.3], [0, 2.0, -0.38], [0, 0.6, -0.3], [0, -0.4, -0.25]], 10));
  S.tube(cord, S.budget(0.05), { r: 0.07, col: C.ice, part: 1, size: 0.8 });

  // Peripheral nerves: trees leaving the cord, out to arms, trunk and legs.
  const nerves = [];
  const addTree = (origin, dir, length, depth, d0, spread = 0.45) => {
    growTree(S, { origin, dir, length, radius: 0.04, depth, spread, steps: 7, wiggle: 0.12, lenDecay: 0.62, children: 2 }).forEach((b) => {
      b.d0 += d0;
      nerves.push(b);
    });
  };
  [-1, 1].forEach((s) => {
    // brachial plexus → arm
    const shoulder = [s * 1.05, 3.2, -0.2];
    nerves.push({ path: new Path(spline([[0, 3.25, -0.3], [s * 0.5, 3.3, -0.25], shoulder], 6)), r0: 0.05, r1: 0.04, d0: 0, len: 1.1, lvl: 0 });
    nerves.push({ path: new Path(spline([shoulder, [s * 1.35, 2.2, -0.1], [s * 1.55, 1.0, 0.05], [s * 1.7, -0.1, 0.15]], 10)), r0: 0.045, r1: 0.035, d0: 1.1, len: 3.4, lvl: 0 });
    addTree([s * 1.7, -0.1, 0.15], [s * 0.15, -1, 0.1], 0.7, 2, 4.5, 0.35);
    // intercostal nerves around the ribs
    for (let k = 0; k < 6; k++) {
      const y = 2.7 - k * 0.32;
      nerves.push({ path: new Path(spline([[0, y, -0.36], [s * 0.55, y - 0.05, -0.25], [s * 0.85, y - 0.12, 0.1], [s * 0.6, y - 0.2, 0.42]], 8)), r0: 0.02, r1: 0.015, d0: 0, len: 1.6, lvl: 2 });
    }
    // lumbosacral plexus → sciatic nerve → leg
    const hip = [s * 0.45, -0.55, -0.1];
    nerves.push({ path: new Path(spline([[0, -0.4, -0.25], hip, [s * 0.55, -1.9, -0.05], [s * 0.58, -3.4, 0.0], [s * 0.6, -4.6, 0.05]], 10)), r0: 0.06, r1: 0.04, d0: 0, len: 4.4, lvl: 0 });
    addTree([s * 0.6, -4.6, 0.05], [s * 0.1, -1, 0.15], 0.75, 2, 4.4, 0.35);
    addTree([s * 0.56, -2.4, 0.0], [s * 0.6, -0.9, 0.3], 0.9, 1, 2.2, 0.35);
    addTree([s * 1.5, 1.2, 0.05], [s * 0.6, -0.6, 0.4], 0.7, 1, 3.0, 0.35);
  });
  fillTree(S, nerves, S.budget(0.17), { part: 2, reach: 5.5, size: 0.7, col: (d) => mix3(C.pale, C.steel, Math.min(1, d * 1.2)) });

  // Vagus nerve: brainstem → heart → gut.
  const vagus = new Path(spline([[0.12, 4.05, 0.0], [0.22, 3.2, 0.12], [0.3, 2.1, 0.32], [0.32, 1.5, 0.42], [0.25, 0.6, 0.45], [0.1, -0.2, 0.45]], 10));
  S.tube(vagus, S.budget(0.04), { r: 0.04, col: C.pale, part: 3, size: 0.75 });

  // Heart.
  const heart = [0.32, 1.65, 0.45];
  const nHeart = S.budget(0.05);
  for (let k = 0; k < nHeart; k++) {
    const d = S.dir();
    const s = Math.cbrt(r());
    const lobe = d[1] > 0 ? 1 + 0.25 * Math.abs(d[0]) : 1 - 0.35 * (-d[1]);
    const q = [heart[0] + d[0] * 0.38 * s * lobe, heart[1] + d[1] * 0.42 * s - (d[1] < 0 ? 0.12 * s : 0), heart[2] + d[2] * 0.3 * s];
    S.addP(q, S.vary(s > 0.75 ? C.coral : scale3(C.coral, 0.8), 0.15), 0.9, 4, s, 0);
  }

  // Gut: the enteric nervous system along a coiled tube.
  const gutCtrl = [];
  for (let k = 0; k <= 26; k++) {
    const a = k * 0.95;
    gutCtrl.push([Math.sin(a) * 0.55 * (1 - k / 40), 0.35 - k * 0.04 + Math.cos(a * 0.5) * 0.08, 0.35 + Math.cos(a) * 0.2]);
  }
  S.tube(new Path(spline(gutCtrl, 6)), S.budget(0.06), { r: 0.1, shell: true, col: mix3(C.amber, C.mist, 0.45), part: 5, size: 0.7 });

  // HPA axis: hypothalamus → pituitary → adrenals; cortisol rides the blood back up.
  const hpa = new Path(spline([[0.0, 4.35, 0.25], [0.0, 4.1, 0.32], [0.35, 3.0, 0.5], [0.5, 1.2, 0.55], [0.48, 0.15, 0.1], [0.42, -0.05, -0.2], [-0.05, 0.6, 0.6], [-0.4, 2.2, 0.62], [-0.15, 3.8, 0.4], [0.0, 4.35, 0.25]], 8));
  S.tube(hpa, S.budget(0.035), { r: 0.05, col: C.amber, part: 8, size: 0.75 });
  [-1, 1].forEach((s) => S.blob([s * 0.42, 0.0, -0.2], [0.14, 0.09, 0.12], S.budget(0.004), { col: C.amber, part: 8, a1: 0.5, size: 0.9 }));

  // Body outline: capsules for head, neck, torso, arms and legs, sampled thinly.
  const nOut = S.budget(0.11);
  const caps = [
    [[0, 4.6, 0], [0, 4.6, 0], 1.0, 1.6],
    [[0, 3.75, 0], [0, 3.4, 0], 0.25, 0.4],
    [[0, 3.0, 0], [0, -0.6, 0], 0.95, 4.0],
    [[-1.15, 3.05, 0], [-1.75, -0.2, 0.15], 0.24, 2.0],
    [[1.15, 3.05, 0], [1.75, -0.2, 0.15], 0.24, 2.0],
    [[-0.5, -0.6, 0], [-0.62, -5.1, 0.05], 0.3, 2.6],
    [[0.5, -0.6, 0], [0.62, -5.1, 0.05], 0.3, 2.6],
  ];
  const wsum = caps.reduce((s, c) => s + c[3], 0);
  caps.forEach(([a, b, rad, w]) => {
    const n = Math.floor((w / wsum) * nOut);
    for (let k = 0; k < n; k++) {
      const u = r();
      const p = add(a, mul(add(b, mul(a, -1)), u));
      const d = S.dir();
      const torso = rad > 0.9 ? [1, 1, 0.55] : [1, 1, 1];
      S.add(p[0] + d[0] * rad * torso[0], p[1] + d[1] * rad * (a === b ? 1.1 : 0.3), p[2] + d[2] * rad * torso[2], S.vary(scale3(C.deep, 0.6), 0.25), 0.65, 6, u, 0);
    }
  });

  // Environment: ground rings and other people in the distance.
  const nEnv = S.budget(0.08);
  for (let k = 0; k < nEnv * 0.6; k++) {
    const ring = Math.floor(r() * 4);
    const a = r() * Math.PI * 2;
    const rad = 2.4 + ring * 1.4 + (r() - 0.5) * 0.06;
    S.add(Math.cos(a) * rad, -5.25, Math.sin(a) * rad, S.vary(scale3(C.steel, 0.8 - ring * 0.12), 0.2), 0.7, 7, ring / 4, a);
  }
  const others = [[-5.2, -1.8, -3.2], [5.0, -1.9, -3.8], [-3.6, -2.1, -6.0], [3.4, -2.0, -6.5], [0.4, -2.2, -8]];
  others.forEach((o, i) => {
    for (let k = 0; k < (nEnv * 0.4) / others.length; k++) {
      const head = r() < 0.25;
      const d = S.dir();
      const p = head ? [o[0] + d[0] * 0.28, o[1] + 2.6 + d[1] * 0.28, o[2] + d[2] * 0.28] : [o[0] + d[0] * 0.38, o[1] + 1.15 + d[1] * 1.3, o[2] + d[2] * 0.25];
      S.addP(p, S.vary(scale3(C.mist, 0.7), 0.2), 0.75, 7, 1, i / others.length);
    }
  });

  S.halo(11, [C.steel, C.mist, C.deep], { flat: 0.9, bright: 0.3 });
  return S.done();
}
