import { Shape, C, Path, spline, add, mul, scale3 } from './util.js';
import { cortex, cortexPoint, onCortex } from './brainshape.js';

// L7 · A cortico–striato–pallido–thalamo–cortical loop in one hemisphere,
// with the four ascending modulatory systems: dopamine (VTA/SNc), serotonin
// (raphe), noradrenaline (locus coeruleus) and acetylcholine (basal
// forebrain). The loop carries signal round and round; each modulator fires in
// turn and spreads by volume transmission. Modulators don't rewire the loop,
// they change how it runs.
// parts: 0 brain outline · 1 cortex patch · 2 striatum · 3 pallidum/thalamus/amygdala
//        5 loop fibres (anim.y = loop position) · 6 modulator nucleus (anim.z = system)
//        7 modulator projection (anim.y = along) · 8 volume-transmission cloud
// Structures carry their station on the loop in anim.y (or -1 for none).

const LOOP = [[1.5, 2.25, 1.55], [1.55, 1.2, 1.75], [1.0, 0.25, 1.85], [0.55, -0.05, 1.5], [0.15, 0.05, 1.05], [-0.35, 0.3, 0.7], [-0.2, 1.1, 0.95], [0.6, 2.0, 1.35], [1.5, 2.25, 1.55]];
const STATIONS = { cortex: [1.5, 2.25, 1.55], striatum: [1.0, 0.25, 1.85], pallidum: [0.4, -0.05, 1.45], thalamus: [-0.35, 0.3, 0.7] };
const loopPath = new Path(spline(LOOP, 12));
export const LOOP_STATIONS = Object.values(STATIONS).map((s) => {
  let best = 0;
  let bd = 1e9;
  for (let i = 0; i <= 400; i++) {
    const { p } = loopPath.at(i / 400);
    const d = Math.hypot(p[0] - s[0], p[1] - s[1], p[2] - s[2]);
    if (d < bd) { bd = d; best = i / 400; }
  }
  return best;
});

export const MODULATORS = [
  { key: 'DA', col: C.da, src: [-0.55, -1.45, 0.35], targets: [[1.0, 0.4, 1.6], [1.4, 0.9, 1.0], [1.6, -0.35, 0.8], [2.8, 1.2, 0.6], [3.2, 0.2, 0.9]] },
  { key: '5-HT', col: C.ht, src: [-1.2, -2.25, 0.05], targets: [[2.8, 1.8, 1.2], [0.6, 2.6, 1.6], [-1.8, 2.2, 1.5], [-3.0, 0.6, 1.4], [0.2, -1.3, 2.4], [-0.8, -1.1, 1.4]] },
  { key: 'NE', col: C.ne, src: [-1.45, -2.65, 0.3], targets: [[3.3, 0.9, 1.3], [1.4, 2.6, 1.7], [-1.0, 2.5, 1.8], [-3.3, 0.3, 1.2], [-2.8, -1.8, 1.0]] },
  { key: 'ACh', col: C.ach, src: [1.55, -0.75, 0.45], targets: [[3.0, 1.4, 1.5], [0.9, 2.5, 1.7], [-1.5, 2.1, 1.8], [-0.7, -1.1, 1.5]] },
];

export function circuit(N, seed = 129) {
  const S = new Shape(N, seed);
  const r = S.r;
  const [uCtx, uStr, uPal, uTha] = LOOP_STATIONS;

  cortex(S, S.budget(0.13), { part: 0, folds: true, depth: 0.16, size: 0.6, col: (f) => scale3(C.steel, 0.3 + 0.25 * f), a1: () => -1 });

  // Frontal cortex patch on the right hemisphere: the loop's start and end.
  const nCtx = S.budget(0.08);
  for (let k = 0; k < nCtx;) {
    const { p, fold } = cortexPoint(S, { depth: 0.16 });
    if (p[2] < 0.3 || p[0] < 0.2 || p[1] < 0.6) continue;
    S.addP(p, S.vary(scale3(C.pale, 0.55 + 0.45 * fold), 0.2), 0.8, 1, uCtx, 0);
    k++;
  }

  // Striatum: caudate (a C-shaped tube) and putamen.
  const caudate = new Path(spline([[2.0, 0.6, 0.95], [1.0, 1.0, 1.05], [-0.4, 1.0, 1.15], [-1.4, 0.4, 1.35], [-1.6, -0.4, 1.6], [-0.8, -0.95, 1.9]], 10));
  S.tube(caudate, S.budget(0.045), { r: (u) => 0.45 * (1 - u) + 0.1, col: C.mist, part: 2, a1: uStr, size: 0.8 });
  S.blob([0.85, 0.05, 1.9], [1.05, 0.62, 0.36], S.budget(0.04), { col: C.mist, part: 2, a1: uStr, size: 0.8 });
  S.blob([0.42, -0.08, 1.45], [0.58, 0.38, 0.22], S.budget(0.02), { col: C.steel, part: 3, a1: uPal, size: 0.8 });
  S.blob([-0.4, 0.3, 0.62], [0.85, 0.55, 0.45], S.budget(0.035), { col: C.pale, part: 3, a1: uTha, size: 0.8 });
  S.blob([0.9, -1.3, 1.85], [0.32, 0.3, 0.3], S.budget(0.01), { col: C.mist, part: 3, a1: -1, size: 0.8 });

  // Loop fibres: a bundle following the loop.
  const nLoop = S.budget(0.12);
  for (let k = 0; k < nLoop; k++) {
    const u = r();
    const { p } = loopPath.at(u);
    const d = S.dir();
    const s = Math.sqrt(r()) * 0.16;
    S.add(p[0] + d[0] * s, p[1] + d[1] * s, p[2] + d[2] * s, S.vary(C.ice, 0.15), 0.75, 5, u, 0);
  }
  // vmPFC → amygdala: the pathway that lets fear be extinguished.
  const vmpfc = new Path(spline([[3.1, -0.3, 0.5], [2.4, -0.9, 1.2], [1.5, -1.25, 1.7], [0.9, -1.3, 1.85]], 10));
  S.tube(vmpfc, S.budget(0.02), { r: 0.08, col: C.pale, part: 5, a1: (u) => u, size: 0.7 });

  // Modulatory systems.
  const nSrc = S.budget(0.04);
  const nProj = S.budget(0.14);
  const nCloud = S.budget(0.08);
  MODULATORS.forEach((m, mi) => {
    for (let k = 0; k < nSrc / 4; k++) {
      const d = S.dir();
      const s = Math.cbrt(r()) * 0.22;
      S.add(m.src[0] + d[0] * s, m.src[1] + d[1] * s, m.src[2] + d[2] * s, S.vary(m.col, 0.12), 1.05, 6, 0, mi);
    }
    const paths = m.targets.map((t) => {
      const tgt = Math.hypot(t[0], t[1] - 0.35, t[2] - 1.45) > 2.6 ? onCortex(t) : t;
      const mid = add(mul(add(m.src, tgt), 0.5), [0.2, 0.5, 0.3]);
      return { path: new Path(spline([m.src, add(m.src, [0.15, 0.5, 0.15]), mid, tgt], 10)), tgt };
    });
    paths.forEach(({ path, tgt }) => {
      S.tube(path, Math.floor(nProj / 4 / paths.length), { r: 0.045, col: m.col, part: 7, a2: mi, size: 0.7 });
      for (let k = 0; k < nCloud / 4 / paths.length; k++) {
        const d = S.dir();
        const s = Math.pow(r(), 0.5) * 0.65;
        S.add(tgt[0] + d[0] * s, tgt[1] + d[1] * s, tgt[2] + d[2] * s, S.vary(m.col, 0.2), 0.7 + r() * 0.4, 8, s, mi);
      }
    });
  });

  S.halo(10, [C.steel, C.mist, C.deep, C.da, C.ach], { flat: 0.8, bright: 0.28 });
  return S.done();
}
