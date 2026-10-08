import { Shape, C, scale3 } from './util.js';

// Closing page: the cortex unfolded into a sheet of columns, rolling with
// slow waves. A few columns carry the colours of the signals met on the way.
// parts: 0 sheet · 1 column node · 2 link between neighbouring columns

export function outro(N, seed = 153) {
  const S = new Shape(N, seed);
  const r = S.r;
  const W = 11;
  const D = 6;
  const step = 0.72;
  const nodes = [];
  for (let z = -D; z <= D * 0.6; z += step * 0.87) {
    const row = Math.round((z + D) / (step * 0.87));
    for (let x = -W + (row % 2) * step * 0.5; x <= W; x += step) {
      nodes.push([x + (r() - 0.5) * 0.18, 0, z + (r() - 0.5) * 0.18]);
    }
  }
  const accents = [C.glu, C.ca, C.da, C.ht, C.ne, C.ach];
  const nNode = S.budget(0.3);
  const per = Math.max(1, Math.floor(nNode / nodes.length));
  nodes.forEach((p) => {
    const acc = r() < 0.08 ? S.pick(accents) : null;
    for (let k = 0; k < per; k++) {
      const d = S.dir();
      S.add(p[0] + d[0] * 0.08, p[1] + d[1] * 0.08, p[2] + d[2] * 0.08, S.vary(acc || (k === 0 ? C.ice : C.pale), 0.15), acc ? 1.1 : 0.95, 1, acc ? 1 : 0, r());
    }
  });
  const nLink = S.budget(0.22);
  for (let k = 0; k < nLink; k++) {
    const a = nodes[Math.floor(r() * nodes.length)];
    const b = nodes.find((o) => o !== a && Math.abs(o[0] - a[0]) < step * 1.1 && Math.abs(o[2] - a[2]) < step * 1.1 && r() < 0.5) || a;
    const u = r();
    S.add(a[0] + (b[0] - a[0]) * u, 0, a[2] + (b[2] - a[2]) * u, S.vary(C.steel, 0.2), 0.65, 2, u, r());
  }
  const nSheet = S.budget(0.3);
  for (let k = 0; k < nSheet; k++) {
    S.add((r() * 2 - 1) * W, (r() - 0.5) * 0.12, -D + r() * D * 1.6, scale3(S.vary(C.deep, 0.3), 0.7), 0.6, 0, 0, r());
  }
  S.halo(12, [C.steel, C.mist, C.deep], { y: 3, flat: 0.6, bright: 0.3 });
  return S.done();
}
