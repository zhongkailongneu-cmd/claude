import { Shape, C, Path, spline, growTree, fillTree, treeReach, mix3, scale3, add, mul, sub, perp } from './util.js';

// L3 · Cells: a neuron among its glia. An oligodendrocyte wraps myelin around
// two axons (one cell, many sheaths); an astrocyte's bushy processes reach a
// capillary with an endfoot; a microglia's ramified processes keep moving.
// The action potential jumps node to node (saltatory conduction) and an
// astrocyte Ca2+ wave spreads from its soma.
//
// parts: 0 neuron soma+dendrites · 1 astrocyte · 2 axon core · 3 myelin sheath
//        4 oligodendrocyte · 5 microglia · 6 capillary
// Axon/myelin: anim.y = position along axon (0..1), anim.z = axon id.

export const GLIA = { u0: 0.14, du: 0.105, gap: 0.016 };

export function glia(N, seed = 45) {
  const S = new Shape(N, seed);
  const r = S.r;

  // ---- neuron ----
  const soma = [-3.6, 0.7, 0];
  const nSoma = S.budget(0.025);
  for (let k = 0; k < nSoma; k++) {
    const d = S.dir();
    const s = Math.cbrt(r());
    S.add(soma[0] + d[0] * 0.5 * s, soma[1] + d[1] * 0.62 * s, soma[2] + d[2] * 0.5 * s, S.vary(C.ice, 0.15), 1.0, 0, 0, r());
  }
  const dend = [];
  for (let k = 0; k < 6; k++) {
    const a = Math.PI * (0.35 + k * 0.28);
    growTree(S, { origin: add(soma, [Math.cos(a) * 0.4, Math.sin(a) * 0.45, 0]), dir: [Math.cos(a), Math.sin(a), (r() - 0.5) * 0.8], length: 1.3 + r() * 0.4, radius: 0.07, depth: 3, spread: 0.75, steps: 5, wiggle: 0.25 }).forEach((b) => dend.push(b));
  }
  fillTree(S, dend, S.budget(0.12), { part: 0, size: 0.8, col: (d) => mix3(C.pale, C.steel, Math.min(1, d * 1.2)) });

  // ---- two myelinated axons ----
  const axons = [
    new Path(spline([[-3.2, 0.2, 0], [-2.0, -0.5, 0.2], [0, -0.9, 0.3], [2.0, -0.95, 0.1], [4.0, -0.6, -0.2], [5.8, -0.2, -0.3]], 14)),
    new Path(spline([[-5.6, -2.9, -0.9], [-3.0, -2.6, -0.4], [-0.5, -2.75, 0.2], [2.0, -2.5, 0.5], [4.4, -2.7, 0.3], [6.0, -2.4, 0.4]], 14)),
  ];
  const nAx = S.budget(0.05);
  const nMy = S.budget(0.17);
  axons.forEach((path, id) => {
    S.tube(path, Math.floor(nAx / 2), { r: 0.045, col: (u) => (u < GLIA.u0 && id === 0 ? C.ice : C.mist), part: 2, a2: id, size: 0.75 });
    for (let k = 0; k < nMy / 2; k++) {
      const seg = Math.floor(r() * 8);
      const a = GLIA.u0 + seg * GLIA.du + GLIA.gap / 2;
      const u = a + r() * (GLIA.du - GLIA.gap);
      const { p, t } = path.at(u);
      const ang = r() * Math.PI * 2;
      // Sheaths taper at the paranodes, so the nodes read as gaps.
      const e = (u - a) / (GLIA.du - GLIA.gap);
      const R = 0.2 * Math.min(1, Math.sin(Math.PI * e) * 2.2) * (0.86 + r() * 0.14);
      const [e1, e2] = perp(t);
      const q = add(p, add(mul(e1, Math.cos(ang) * R), mul(e2, Math.sin(ang) * R)));
      S.addP(q, S.vary(C.ice, 0.15), 0.8, 3, u, id, r());
    }
  });

  // ---- oligodendrocyte: one cell, processes to six sheaths ----
  const oligo = [0.9, -1.75, 1.3];
  const nOl = S.budget(0.05);
  for (let k = 0; k < nOl * 0.3; k++) {
    const d = S.dir();
    const s = Math.cbrt(r()) * 0.32;
    S.add(oligo[0] + d[0] * s, oligo[1] + d[1] * s, oligo[2] + d[2] * s, S.vary(C.pale, 0.15), 0.95, 4, 0, r());
  }
  const targets = [[0, 2], [0, 3], [0, 4], [1, 3], [1, 4], [1, 5]];
  targets.forEach(([id, seg]) => {
    const { p } = axons[id].at(GLIA.u0 + (seg + 0.5) * GLIA.du);
    const mid = add(mul(add(oligo, p), 0.5), [0, 0, 0.6]);
    S.tube(new Path(spline([oligo, mid, p], 8)), Math.floor((nOl * 0.7) / targets.length), { r: 0.035, col: C.mist, part: 4, a2: id, size: 0.7 });
  });

  // ---- capillary with the astrocyte endfoot ----
  const vessel = new Path(spline([[1.2, 4.6, -2.4], [3.2, 4.0, -1.6], [4.8, 3.2, -0.8], [6.2, 2.0, -0.2]], 12));
  S.tube(vessel, S.budget(0.05), { r: 0.42, shell: true, col: scale3(C.coral, 0.55), part: 6, size: 0.75 });

  // ---- astrocyte: a dense, bushy star ----
  const astro = [1.6, 2.1, -0.6];
  const nAs = S.budget(0.2);
  for (let k = 0; k < nAs * 0.06; k++) {
    const d = S.dir();
    const s = Math.cbrt(r()) * 0.38;
    S.add(astro[0] + d[0] * s, astro[1] + d[1] * s, astro[2] + d[2] * s, S.vary(C.ice, 0.15), 1.0, 1, 0, r());
  }
  const ast = [];
  for (let k = 0; k < 10; k++) {
    const d = S.dir();
    growTree(S, { origin: astro, dir: d, length: 0.75 + r() * 0.35, radius: 0.07, depth: 4, spread: 0.95, steps: 4, wiggle: 0.3, lenDecay: 0.7, children: 2 }).forEach((b) => ast.push(b));
  }
  // Endfoot process to the vessel, and one toward the neuron's dendrites.
  const foot = vessel.at(0.45).p;
  ast.push({ path: new Path(spline([astro, add(astro, [0.6, 0.9, -0.3]), sub(foot, [0, 0.35, 0])], 8)), r0: 0.08, r1: 0.12, d0: 0, len: 2.0, lvl: 0 });
  ast.push({ path: new Path(spline([astro, [0.2, 1.8, -0.3], [-1.6, 1.6, 0.1]], 8)), r0: 0.07, r1: 0.04, d0: 0, len: 3.4, lvl: 0 });
  const reach = treeReach(ast);
  fillTree(S, ast, Math.floor(nAs * 0.94), { part: 1, reach, size: 0.75, col: (d) => mix3(C.lav, C.steel, Math.min(1, d * 1.1)) });

  // ---- microglia: small soma, long thin ramified processes ----
  const mg = [-1.4, -4.0, 0.9];
  const nMg = S.budget(0.07);
  for (let k = 0; k < nMg * 0.1; k++) {
    const d = S.dir();
    const s = Math.cbrt(r()) * 0.26;
    S.add(mg[0] + d[0] * s * 1.3, mg[1] + d[1] * s * 0.8, mg[2] + d[2] * s, S.vary(C.amber, 0.15), 0.95, 5, 0, r());
  }
  const mgb = [];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    growTree(S, { origin: mg, dir: [Math.cos(a), Math.sin(a) * 0.6 + 0.25, (r() - 0.5)], length: 1.0 + r() * 0.4, radius: 0.035, depth: 3, spread: 0.8, steps: 5, wiggle: 0.25, lenDecay: 0.75 }).forEach((b) => mgb.push(b));
  }
  fillTree(S, mgb, Math.floor(nMg * 0.9), { part: 5, size: 0.7, col: (d) => mix3(C.amber, scale3(C.amber, 0.7), d) });

  S.halo(10, [C.steel, C.mist, C.deep, C.lav], { flat: 0.7, bright: 0.35 });
  return S.done();
}

