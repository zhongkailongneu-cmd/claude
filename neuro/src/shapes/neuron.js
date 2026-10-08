import { C, Path, spline, growTree, fillTree, spinesOnTree, treeReach, add, mul, norm, mix3 } from './util.js';

// A cortical pyramidal neuron: teardrop soma, one long apical dendrite with
// oblique branches and a tuft, a skirt of basal dendrites, and an axon with
// collaterals. Used large on the opening page and small elsewhere.
//
// parts: 0 soma · 1 dendrite · 2 axon · 3 spine heads
// anim.y is path distance from the soma (0..1); dendrites and axon are
// normalised separately so a pulse can run the length of each.

export function pyramidal(S, o) {
  const {
    at = [0, 0, 0], scale = 1, n, colors = {}, axonLen = 5.2, apicalLen = 4.6, basal = 6,
    spineFrac = 0.12, axonFrac = 0.16, somaFrac = 0.06, parts = {}, a2 = null, tilt = [0, 1, 0],
  } = o;
  const P = (v) => add(at, mul(v, scale));
  const up = norm(tilt);
  const soma = colors.soma || C.ice;
  const near = colors.near || C.pale;
  const far = colors.far || C.steel;
  const pr = { soma: 0, dend: 1, axon: 2, spine: 3, ...parts };

  // Apical trunk: a slow S-curve, then a tuft at the top.
  const trunkCtrl = [[0, 0.6, 0], [0.12, 1.8, 0.05], [-0.08, 3.0, -0.08], [0.05, apicalLen, 0.04]].map((v) => P(rot(v, up)));
  const trunk = { path: new Path(spline(trunkCtrl, 10)), r0: 0.13 * scale, r1: 0.06 * scale, d0: 0, len: apicalLen * scale, lvl: 0 };
  const branches = [trunk];
  const tuft = growTree(S, { origin: trunkCtrl[3], dir: up, length: 1.5 * scale, radius: 0.06 * scale, depth: 3, spread: 0.85, lenDecay: 0.78, steps: 6, wiggle: 0.25 });
  tuft.forEach((b) => { b.d0 += trunk.len; branches.push(b); });
  const obliques = 7;
  for (let k = 0; k < obliques; k++) {
    const u = 0.18 + (k / obliques) * 0.7;
    const { p } = trunk.path.at(u);
    const ang = S.r() * Math.PI * 2;
    const side = norm(add(rot([Math.cos(ang), 0.55, Math.sin(ang)], up), mul(up, 0.2)));
    const tr = growTree(S, { origin: p, dir: side, length: (0.9 + S.r() * 0.6) * scale, radius: 0.045 * scale, depth: 2, spread: 0.7, steps: 5, wiggle: 0.25 });
    tr.forEach((b) => { b.d0 += u * trunk.len; b.lvl += 1; branches.push(b); });
  }
  for (let k = 0; k < basal; k++) {
    const ang = (k / basal) * Math.PI * 2 + S.r() * 0.5;
    const dir = rot([Math.cos(ang), -0.25 - S.r() * 0.45, Math.sin(ang)], up);
    const tr = growTree(S, { origin: P(rot([Math.cos(ang) * 0.35, -0.35, Math.sin(ang) * 0.35], up)), dir, length: (1.0 + S.r() * 0.5) * scale, radius: 0.07 * scale, depth: 3, spread: 0.75, steps: 5, wiggle: 0.28, lenDecay: 0.7 });
    tr.forEach((b) => branches.push(b));
  }
  const reach = treeReach(branches);

  // Axon: down from the hillock, with three collaterals.
  const axCtrl = [[0, -0.75, 0], [0.05, -1.6, 0.02], [-0.18, -2.8, 0.1], [0.12, -4.0, -0.06], [-0.05, -axonLen, 0.05]].map((v) => P(rot(v, up)));
  const axon = [{ path: new Path(spline(axCtrl, 10)), r0: 0.06 * scale, r1: 0.035 * scale, d0: 0, len: axonLen * scale, lvl: 0 }];
  [0.42, 0.62, 0.8].forEach((u, k) => {
    const { p } = axon[0].path.at(u);
    const side = rot([k % 2 ? -1 : 1, -0.5, (S.r() - 0.5) * 0.8], up);
    growTree(S, { origin: p, dir: side, length: (1.2 + S.r() * 0.5) * scale, radius: 0.03 * scale, depth: 2, spread: 0.6, steps: 5, wiggle: 0.2 }).forEach((b) => {
      b.d0 += u * axon[0].len;
      axon.push(b);
    });
  });
  const axReach = treeReach(axon);

  const nSoma = Math.floor(n * somaFrac);
  const nAxon = Math.floor(n * axonFrac);
  const nSpine = Math.floor(n * spineFrac);
  const nDend = n - nSoma - nAxon - nSpine;

  for (let k = 0; k < nSoma; k++) {
    const d = S.dir();
    const s = Math.cbrt(S.r());
    const taper = d[1] > 0 ? 1 - d[1] * 0.45 : 1;
    const v = [d[0] * 0.55 * taper * s, d[1] * 0.8 * s, d[2] * 0.55 * taper * s];
    S.addP(P(rot(v, up)), S.vary(soma, 0.15), 1.0, pr.soma, 0, a2 ? a2(null, 0) : S.r(), S.r());
  }
  fillTree(S, branches, nDend, {
    part: pr.dend, reach, size: 0.85, a2,
    col: (d) => mix3(near, far, Math.min(1, d * 1.3)),
  });
  fillTree(S, axon, nAxon, {
    part: pr.axon, reach: axReach, size: 0.8, a2,
    col: (d) => (d < 0.06 ? soma : mix3(near, far, Math.min(1, d * 1.6))),
  });
  spinesOnTree(S, branches.filter((b) => b !== trunk), Math.floor(nSpine / 4), {
    part: pr.spine, reach, per: 4, len: 0.14 * scale, headR: 0.035 * scale, col: colors.spine || C.ice, minLvl: 0,
  });
  return { branches, axon, reach, axReach, P };
}

// Rotate a local vector so +y maps onto `up`.
function rot(v, up) {
  if (Math.abs(up[1] - 1) < 1e-6) return v;
  const y = up;
  const x = norm(Math.abs(y[2]) < 0.9 ? [y[1], -y[0], 0] : [1, 0, 0]);
  const z = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
  return [x[0] * v[0] + y[0] * v[1] + z[0] * v[2], x[1] * v[0] + y[1] * v[1] + z[1] * v[2], x[2] * v[0] + y[2] * v[1] + z[2] * v[2]];
}
