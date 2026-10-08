import { Shape, C, Path, spline, scale3 } from './util.js';

// L2 · A stretch of dendrite studded with spines, as two-photon imaging shows
// it. Potentiated spines swell (structural LTP), filopodia probe outward and
// retract, mitochondria drift along the shaft, presynaptic axons pass by.
//
// Spines leave the shaft at one of 12 angles around its axis, so the shader can
// recover each head's centre from a particle's own position and grow it.
// parts: 0 shaft · 1 spine neck · 2 spine head · 3 filopodium · 4 mitochondrion
//        5 Ca2+ in a head · 6 passing axon · 7 glutamate puff
// For parts 1,2,3,5,7: anim.z = spine base x; anim.y = head-centre radius
// (heads) or position along the spine (necks, filopodia).

export const SPINE = { r0: 0.5, len: 5.6, angles: 12 };
const axisY = (x) => 0.25 * Math.sin(x * 0.35);

export function spine(N, seed = 33) {
  const S = new Shape(N, seed);
  const r = S.r;
  const R0 = SPINE.r0;
  const L = SPINE.len;
  const TAU = Math.PI * 2;

  const nShaft = S.budget(0.28);
  for (let k = 0; k < nShaft; k++) {
    const x = (r() * 2 - 1) * L;
    const a = r() * TAU;
    const rad = R0 * Math.pow(r(), 0.35);
    const fade = 1 - Math.pow(Math.abs(x) / L, 6);
    const c = scale3(S.vary(rad > R0 * 0.8 ? C.mist : C.steel, 0.2), 0.55 + 0.45 * fade);
    S.add(x, axisY(x) + Math.cos(a) * rad, Math.sin(a) * rad, c, 0.85, 0, rad / R0, 0);
  }

  // Lay out spines along the shaft without crowding.
  const spines = [];
  let x = -L + 0.35;
  while (x < L - 0.35) {
    const kind = r();
    const type = kind < 0.42 ? 'mushroom' : kind < 0.72 ? 'thin' : kind < 0.86 ? 'stubby' : 'filo';
    const angIdx = Math.floor(r() * SPINE.angles);
    spines.push({ x: x + (r() - 0.5) * 0.12, ang: (angIdx / SPINE.angles) * TAU, type });
    x += 0.2 + r() * 0.22;
  }

  const nSpine = S.budget(0.3);
  const per = nSpine / spines.length;
  const nCa = S.budget(0.025);
  const nGlu = S.budget(0.015);
  const heads = [];
  spines.forEach((sp) => {
    const dir = [Math.cos(sp.ang), Math.sin(sp.ang)];
    const at = (rad, dx = 0) => [sp.x + dx, axisY(sp.x) + dir[0] * rad, dir[1] * rad];
    if (sp.type === 'filo') {
      const len = 1.1 + r() * 0.6;
      const bend = (r() - 0.5) * 0.25;
      for (let k = 0; k < per * 0.7; k++) {
        const u = r();
        const p = at(R0 + u * len, bend * u * u);
        S.add(p[0] + (r() - 0.5) * 0.05, p[1] + (r() - 0.5) * 0.05, p[2] + (r() - 0.5) * 0.05, S.vary(C.mist, 0.2), 0.7, 3, u, sp.x);
      }
      return;
    }
    const neckLen = sp.type === 'stubby' ? 0.12 : sp.type === 'thin' ? 0.55 + r() * 0.35 : 0.35 + r() * 0.3;
    const headR = sp.type === 'thin' ? 0.12 + r() * 0.05 : sp.type === 'stubby' ? 0.22 : 0.2 + r() * 0.12;
    const rc = R0 + neckLen + headR * 0.85;
    heads.push({ sp, rc, headR, dir, at });
    const nNeck = Math.floor(per * (sp.type === 'stubby' ? 0.15 : 0.3));
    for (let k = 0; k < nNeck; k++) {
      const u = r();
      const p = at(R0 - 0.05 + u * (neckLen + 0.08));
      const d = S.dir();
      const nr = 0.06 * Math.sqrt(r());
      S.add(p[0] + d[0] * nr, p[1] + d[1] * nr, p[2] + d[2] * nr, S.vary(C.mist, 0.2), 0.75, 1, u, sp.x);
    }
    const c = at(rc);
    for (let k = 0; k < per - nNeck; k++) {
      const d = S.dir();
      const s = Math.cbrt(r()) * headR;
      S.add(c[0] + d[0] * s, c[1] + d[1] * s, c[2] + d[2] * s, S.vary(s > headR * 0.7 ? C.pale : C.ice, 0.18), 0.85, 2, rc, sp.x);
    }
  });

  // Ca2+ and glutamate ride along with their head (shader applies the same growth).
  for (let k = 0; k < nCa; k++) {
    const h = heads[k % heads.length];
    const c = h.at(h.rc);
    const d = S.dir();
    const s = Math.cbrt(r()) * h.headR * 0.8;
    S.add(c[0] + d[0] * s, c[1] + d[1] * s, c[2] + d[2] * s, S.vary(C.ca, 0.15), 0.95, 5, h.rc, h.sp.x);
  }
  for (let k = 0; k < nGlu; k++) {
    const h = heads[k % heads.length];
    const out = h.rc + h.headR + 0.08 + r() * 0.12;
    const c = h.at(out);
    const d = S.dir();
    S.add(c[0] + d[0] * 0.1, c[1] + d[1] * 0.1, c[2] + d[2] * 0.1, S.vary(C.glu, 0.15), 0.9, 7, h.rc, h.sp.x);
  }

  // Mitochondria: short capsules inside the shaft.
  const nMito = S.budget(0.035);
  const mitos = Array.from({ length: 9 }, () => ({ x: (r() * 2 - 1) * (L - 0.6), a: r() * TAU, off: r() * 0.25, len: 0.5 + r() * 0.5 }));
  for (let k = 0; k < nMito; k++) {
    const m = mitos[k % mitos.length];
    const u = r() - 0.5;
    const d = S.dir();
    const s = Math.cbrt(r()) * 0.09;
    const xx = m.x + u * m.len;
    S.add(xx + d[0] * s, axisY(xx) + Math.cos(m.a) * m.off + d[1] * s, Math.sin(m.a) * m.off + d[2] * s, S.vary(C.ach, 0.2), 0.8, 4, Math.cos(m.a) * m.off, 0);
  }

  // Presynaptic axons crossing the dendrite, with boutons.
  const nAx = S.budget(0.06);
  const axons = [
    [[-4.2, 3.2, -1.2], [-3.5, 1.5, -0.6], [-2.6, 0.2, 1.4], [-2.0, -1.6, 2.6]],
    [[1.2, 3.4, 1.8], [0.8, 1.2, 1.2], [0.2, -0.8, -1.5], [-0.4, -3.0, -2.2]],
    [[4.6, -3.2, 1.6], [3.9, -1.2, 1.0], [3.2, 1.0, -1.3], [2.8, 3.0, -2.0]],
  ].map((c) => new Path(spline(c, 12)));
  axons.forEach((path, i) => {
    S.tube(path, Math.floor(nAx / axons.length * 0.75), { r: 0.045, col: C.steel, part: 6, a2: i / 3, size: 0.7 });
    for (let b = 0; b < 4; b++) {
      const { p } = path.at(0.2 + b * 0.2);
      for (let k = 0; k < (nAx / axons.length) * 0.0625; k++) {
        const d = S.dir();
        const s = Math.cbrt(r()) * 0.13;
        S.add(p[0] + d[0] * s, p[1] + d[1] * s, p[2] + d[2] * s, S.vary(C.mist, 0.2), 0.8, 6, 0.2 + b * 0.2, i / 3);
      }
    }
  });

  S.halo(9, [C.steel, C.mist, C.deep, C.ca], { flat: 0.65, bright: 0.35 });
  return S.done();
}
