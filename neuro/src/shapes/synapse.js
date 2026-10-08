import { Shape, C, Path, spline, scale3 } from './util.js';

// L4 · A glutamatergic synapse in one LTP cycle: baseline release, a burst of
// high-frequency stimulation, Ca2+ influx, AMPA receptors inserted into the
// postsynaptic density, slow decay. An astrocyte process wraps the cleft
// (the tripartite synapse).
//
// parts: 0 presynaptic membrane + axon · 1 vesicle (anim.y = home y, anim.z = phase)
//        2 glutamate in the cleft · 3 postsynaptic membrane, neck, dendrite
//        4 PSD · 5 resident AMPA receptors · 6 inserted receptors (anim.y = depth)
//        7 Ca2+ in the spine · 8 astrocyte process

export function synapse(N, seed = 57) {
  const S = new Shape(N, seed);
  const r = S.r;
  const TAU = Math.PI * 2;

  // ---- presynaptic bouton ----
  const nPre = S.budget(0.15);
  for (let k = 0; k < nPre * 0.78; k++) {
    const d = S.dir();
    let y = 2.15 + d[1] * 1.65;
    const flat = y < 0.5;
    if (flat) y = 0.45 + (r() - 0.5) * 0.04;
    const shrink = flat ? Math.sqrt(r()) : 0.94 + r() * 0.06;
    const x = d[0] * 2.1 * shrink;
    const z = d[2] * 1.75 * shrink;
    S.add(x, y, z, S.vary(flat ? C.pale : C.mist, 0.2), 0.8, 0, 0, 0);
  }
  const axon = new Path(spline([[0.3, 3.6, 0], [0.6, 4.6, -0.2], [1.2, 5.6, -0.5], [1.4, 6.6, -0.6]], 10));
  S.tube(axon, Math.floor(nPre * 0.14), { r: 0.42, shell: true, col: C.mist, part: 0, size: 0.75 });
  // mitochondrion inside the bouton
  for (let k = 0; k < nPre * 0.08; k++) {
    const u = r() - 0.5;
    const d = S.dir();
    const s = Math.cbrt(r()) * 0.22;
    S.add(-0.9 + u * 1.2 + d[0] * s, 3.0 + u * 0.35 + d[1] * s, 0.4 + d[2] * s, S.vary(C.ach, 0.2), 0.75, 0, 0, 0);
  }

  // ---- vesicles: docked at the active zone, plus a reserve pool ----
  const nVes = S.budget(0.16);
  const ves = [];
  for (let i = 0; i < 9; i++) ves.push([(i - 4) * 0.36 + (r() - 0.5) * 0.08, 0.72, (r() - 0.5) * 1.0]);
  while (ves.length < 40) {
    const c = [(r() * 2 - 1) * 1.55, 0.95 + r() * 2.2, (r() * 2 - 1) * 1.2];
    if ((c[0] / 1.7) ** 2 + ((c[1] - 2.15) / 1.4) ** 2 + (c[2] / 1.4) ** 2 > 1) continue;
    if (ves.some((v) => Math.hypot(v[0] - c[0], v[1] - c[1], v[2] - c[2]) < 0.44)) continue;
    ves.push(c);
  }
  ves.forEach((c, i) => {
    const ph = (i * 0.618) % 1;
    for (let k = 0; k < nVes / ves.length; k++) {
      const inner = r() < 0.35;
      const d = S.dir();
      const s = inner ? Math.cbrt(r()) * 0.12 : 0.19 + r() * 0.03;
      S.add(c[0] + d[0] * s, c[1] + d[1] * s, c[2] + d[2] * s, S.vary(inner ? C.glu : C.pale, 0.15), inner ? 0.75 : 0.8, 1, c[1], ph);
    }
  });

  // ---- glutamate crossing the cleft ----
  const nGlu = S.budget(0.06);
  for (let k = 0; k < nGlu; k++) {
    const a = r() * TAU;
    const rad = Math.sqrt(r()) * 1.2;
    S.add(Math.cos(a) * rad, 0.4, Math.sin(a) * rad * 0.8, S.vary(C.glu, 0.15), 0.85 + r() * 0.3, 2, 0, 0);
  }

  // ---- postsynaptic spine head, neck and parent dendrite ----
  const nPost = S.budget(0.15);
  for (let k = 0; k < nPost * 0.66; k++) {
    const d = S.dir();
    let y = -1.95 + d[1] * 1.7;
    const flat = y > -0.12;
    if (flat) y = -0.1 + (r() - 0.5) * 0.04;
    const shrink = flat ? Math.sqrt(r()) * 0.98 : 0.94 + r() * 0.06;
    S.add(d[0] * 1.95 * shrink, y, d[2] * 1.65 * shrink, S.vary(flat ? C.pale : C.mist, 0.2), 0.8, 3, 0, 0);
  }
  const neck = new Path(spline([[0, -3.5, 0], [-0.15, -4.3, 0.1], [-0.3, -5.1, 0.15]], 8));
  S.tube(neck, Math.floor(nPost * 0.08), { r: 0.38, shell: true, col: C.mist, part: 3, size: 0.75 });
  const shaft = new Path([[-4.6, -5.75, 0.6], [-2, -5.65, 0.3], [0, -5.6, 0.15], [2.2, -5.7, -0.1], [4.6, -5.85, -0.4]]);
  S.tube(shaft, Math.floor(nPost * 0.26), { r: 0.62, shell: true, col: (u) => scale3(C.steel, 0.6 + 0.4 * Math.sin(Math.PI * u)), part: 3, size: 0.8 });

  // ---- PSD and receptors ----
  const nPsd = S.budget(0.06);
  for (let k = 0; k < nPsd; k++) {
    const a = r() * TAU;
    const rad = Math.sqrt(r()) * 1.25;
    S.add(Math.cos(a) * rad, -0.24 - r() * 0.14, Math.sin(a) * rad * 0.85, S.vary(C.ice, 0.15), 0.85, 4, 0, 0);
  }
  const nRec = S.budget(0.04);
  const recs = Array.from({ length: 28 }, () => {
    const a = r() * TAU;
    const rad = Math.sqrt(r()) * 1.15;
    return [Math.cos(a) * rad, -0.05, Math.sin(a) * rad * 0.85];
  });
  for (let k = 0; k < nRec; k++) {
    const c = recs[k % recs.length];
    const d = S.dir();
    S.add(c[0] + d[0] * 0.07, c[1] + Math.abs(d[1]) * 0.12, c[2] + d[2] * 0.07, S.vary(C.ice, 0.1), 0.95, 5, 0, k % recs.length / recs.length);
  }
  const nIns = S.budget(0.03);
  const ins = Array.from({ length: 18 }, () => {
    const a = r() * TAU;
    const rad = 0.3 + Math.sqrt(r()) * 0.95;
    return { c: [Math.cos(a) * rad, -0.05, Math.sin(a) * rad * 0.85], depth: 0.7 + r() * 0.9 };
  });
  for (let k = 0; k < nIns; k++) {
    const { c, depth } = ins[k % ins.length];
    const d = S.dir();
    S.add(c[0] + d[0] * 0.07, c[1] + Math.abs(d[1]) * 0.12, c[2] + d[2] * 0.07, S.vary(C.ice, 0.1), 0.95, 6, depth, 0);
  }

  // ---- Ca2+ in the spine head ----
  const nCa = S.budget(0.035);
  for (let k = 0; k < nCa; k++) {
    const d = S.dir();
    const s = Math.cbrt(r());
    S.add(d[0] * 1.5 * s, -1.0 - Math.abs(d[1]) * 1.3 * s, d[2] * 1.3 * s, S.vary(C.ca, 0.15), 0.85, 7, 0, 0);
  }

  // ---- astrocyte process wrapping the cleft from behind ----
  const nAs = S.budget(0.09);
  for (let k = 0; k < nAs; k++) {
    const a = Math.PI * 0.05 + r() * Math.PI * 1.25;
    const y = -1.0 + r() * 2.4;
    const bulge = 2.45 + 0.35 * Math.sin(y * 2.2 + a * 3) + (r() - 0.5) * 0.2;
    const edge = Math.min(1, Math.min(a - Math.PI * 0.05, Math.PI * 1.3 - a) * 2.5);
    S.add(Math.cos(a) * bulge, y, -Math.abs(Math.sin(a)) * bulge * 0.9 - 0.2, scale3(S.vary(C.lav, 0.25), 0.5 + 0.5 * edge), 0.8, 8, y, a);
  }

  S.halo(10, [C.steel, C.mist, C.deep, C.glu], { flat: 0.9, bright: 0.33 });
  return S.done();
}
