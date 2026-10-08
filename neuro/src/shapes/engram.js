import { Shape, C, Path, spline, add, mul, sub, len, scale3, mix3 } from './util.js';

// L5 · A cortical column of ~140 neurons. Most fire sparsely and out of step;
// a small engram ensemble (about one cell in eight) lights up together on
// every recall, its links flare, and interneurons answer with a beat of
// feedback inhibition.
//
// parts: 0 pyramidal cell · 1 engram cell · 2 link between engram cells
//        3 interneuron · 4 background link · 5 layer boundary ring
// Cells: anim.y = distance from soma (0..1), anim.z = the cell's own phase.

export function engram(N, seed = 69) {
  const S = new Shape(N, seed);
  const r = S.r;
  const R = 3.1;
  const H = 4.2;

  const cells = [];
  while (cells.length < 140) {
    const a = r() * Math.PI * 2;
    const rad = R * Math.sqrt(r());
    const y = (r() * 2 - 1) * (H - 0.6);
    const c = [Math.cos(a) * rad, y, Math.sin(a) * rad];
    if (cells.some((o) => len(sub(o.c, c)) < 0.55)) continue;
    cells.push({ c, inter: r() < 0.18, eng: false, phase: r() });
  }
  // Engram: a sparse, spatially loose subset of pyramidal cells.
  const pyr = cells.filter((c) => !c.inter);
  for (let k = 0; k < 18; k++) pyr[Math.floor(r() * pyr.length)].eng = true;
  const eng = cells.filter((c) => c.eng);

  const nPyr = S.budget(0.46);
  const nEng = S.budget(0.13);
  const nInt = S.budget(0.08);
  const perPyr = nPyr / (pyr.length - eng.length);
  const perEng = nEng / eng.length;
  const perInt = nInt / cells.filter((c) => c.inter).length;

  cells.forEach((cell) => {
    const part = cell.eng ? 1 : cell.inter ? 3 : 0;
    const n = Math.floor(cell.eng ? perEng : cell.inter ? perInt : perPyr);
    const base = cell.eng ? C.ice : cell.inter ? C.ach : C.mist;
    const tip = cell.eng ? C.pale : cell.inter ? scale3(C.ach, 0.7) : C.steel;
    const paths = [];
    if (cell.inter) {
      for (let k = 0; k < 5; k++) {
        const d = S.dir();
        paths.push(new Path(spline([cell.c, add(cell.c, mul(d, 0.25)), add(cell.c, add(mul(d, 0.55), mul(S.dir(), 0.1)))], 5)));
      }
    } else {
      const ap = 0.9 + r() * 0.9;
      paths.push(new Path(spline([cell.c, add(cell.c, [0.03, ap * 0.5, 0]), add(cell.c, [(r() - 0.5) * 0.2, ap, (r() - 0.5) * 0.2])], 6)));
      for (let k = 0; k < 2; k++) {
        const d = S.dir();
        paths.push(new Path(spline([add(cell.c, [0, ap, 0]), add(cell.c, [d[0] * 0.35, ap + 0.25, d[2] * 0.35])], 4)));
      }
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + r();
        paths.push(new Path(spline([cell.c, add(cell.c, [Math.cos(a) * 0.3, -0.18, Math.sin(a) * 0.3]), add(cell.c, [Math.cos(a) * 0.5, -0.4, Math.sin(a) * 0.5])], 4)));
      }
    }
    const nSoma = Math.floor(n * 0.35);
    for (let k = 0; k < nSoma; k++) {
      const d = S.dir();
      const s = Math.cbrt(r()) * (cell.inter ? 0.1 : 0.14);
      S.add(cell.c[0] + d[0] * s, cell.c[1] + d[1] * s * 1.2, cell.c[2] + d[2] * s, S.vary(base, 0.12), 1.0, part, 0, cell.phase);
    }
    for (let k = 0; k < n - nSoma; k++) {
      const pi = Math.floor(r() * paths.length);
      const u = r();
      const { p } = paths[pi].at(u);
      const span = pi === 0 && !cell.inter ? 1 : 0.5;
      const c = mix3(base, tip, u);
      S.addP(add(p, mul(S.dir(), 0.02)), S.vary(c, 0.2), 0.75, part, u * span, cell.phase);
    }
  });

  // Links: engram-engram (bright when recalled) and local background wiring.
  const nEL = S.budget(0.07);
  const links = [];
  eng.forEach((a, i) => {
    const near = eng.filter((b) => b !== a).sort((x, y) => len(sub(x.c, a.c)) - len(sub(y.c, a.c))).slice(0, 2);
    near.forEach((b) => {
      if (links.some(([p, q]) => (p === b && q === a))) return;
      links.push([a, b, i]);
    });
  });
  links.forEach(([a, b], i) => {
    const mid = add(mul(add(a.c, b.c), 0.5), mul(S.dir(), 0.4));
    S.tube(new Path(spline([a.c, mid, b.c], 10)), Math.floor(nEL / links.length), { r: 0.025, col: C.pale, part: 2, a2: (i * 0.37) % 1, size: 0.7 });
  });
  const nBL = S.budget(0.07);
  const bl = [];
  cells.forEach((a) => {
    const b = cells.filter((o) => o !== a).sort((x, y) => len(sub(x.c, a.c)) - len(sub(y.c, a.c)))[Math.floor(r() * 3)];
    bl.push([a, b]);
  });
  bl.forEach(([a, b], i) => {
    const mid = add(mul(add(a.c, b.c), 0.5), mul(S.dir(), 0.25));
    S.tube(new Path(spline([a.c, mid, b.c], 6)), Math.floor(nBL / bl.length), { r: 0.02, col: scale3(C.steel, 0.8), part: 4, a2: (i * 0.13) % 1, size: 0.65 });
  });

  // Faint rings marking the layer boundaries of the column.
  const nRing = S.budget(0.03);
  const ys = [3.6, 2.2, 0.9, -0.2, -1.8, -3.6];
  for (let k = 0; k < nRing; k++) {
    const y = ys[k % ys.length];
    const a = r() * Math.PI * 2;
    const rr = R + 0.35 + (r() - 0.5) * 0.08;
    S.add(Math.cos(a) * rr, y + (r() - 0.5) * 0.05, Math.sin(a) * rr, S.vary(C.deep, 0.2), 0.7, 5, 0, a);
  }

  S.halo(9, [C.steel, C.mist, C.deep, C.ach], { flat: 0.9, bright: 0.33 });
  return S.done();
}
