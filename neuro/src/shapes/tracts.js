import { Shape, C, Path, spline, add, mul, scale3, mix3 } from './util.js';
import { cortex, onCortex } from './brainshape.js';

// L7–L8 structural substrate · White-matter tractography inside a faint brain
// outline. Streamlines are tinted by direction the way diffusion MRI colours
// them, kept within the blue family: left–right pale, front–back cyan-blue,
// up–down lavender. Packets of activity travel along each fibre.
// parts: 0 streamline (anim.y = along, anim.z = fibre seed) · 1 brain outline

const LR = C.pale;
const AP = mix3(C.mist, C.ca, 0.45);
const SI = C.lav;

export function tracts(N, seed = 105) {
  const S = new Shape(N, seed);
  const r = S.r;
  const fibres = [];
  const mirror = (pts) => pts.map(([x, y, z]) => [x, y, -z]);
  const bundle = (ctrl, count, spread, weight = 1, both = false) => {
    const sides = both ? [ctrl, mirror(ctrl)] : [ctrl];
    sides.forEach((c) => {
      for (let i = 0; i < count; i++) {
        const off = [S.gauss() * spread, S.gauss() * spread, S.gauss() * spread];
        const pts = c.map((p, j) => {
          const end = j === 0 || j === c.length - 1 ? 1.8 : 1;
          return add(p, add(mul(off, end), mul(S.dir(), spread * 0.08)));
        });
        fibres.push({ path: new Path(spline(pts, 8)), weight, seed: r() });
      }
    });
  };

  // Corpus callosum: arcs from hemisphere to hemisphere; forceps at both ends.
  for (let i = 0; i < 70; i++) {
    const x = -3.1 + (i / 69) * 6.0;
    const fwd = x > 2.4 ? (x - 2.4) * 1.4 : x < -2.5 ? (x + 2.5) * 1.5 : 0;
    const y0 = 0.95 + 0.25 * Math.cos((x / 3.1) * 1.2);
    const lat = 2.2 + 0.2 * r();
    const pts = [[x + fwd, 2.0 + r() * 0.4, -lat], [x + fwd * 0.4, 1.35, -1.1], [x, y0, 0], [x + fwd * 0.4, 1.35, 1.1], [x + fwd, 2.0 + r() * 0.4, lat]];
    fibres.push({ path: new Path(spline(pts.map((p) => add(p, mul(S.dir(), 0.12))), 8)), weight: 1, seed: r() });
  }
  // Corticospinal tract: motor cortex → internal capsule → brainstem.
  bundle([[0.2, 2.45, 1.6], [0.0, 1.1, 1.25], [-0.3, -0.2, 0.8], [-0.7, -1.3, 0.45], [-1.1, -2.5, 0.28], [-1.45, -3.9, 0.14]], 26, 0.18, 1.2, true);
  // Arcuate fasciculus: Broca ↔ Wernicke, arching over the Sylvian fissure.
  bundle([[2.2, 0.4, 2.3], [0.9, 1.05, 2.45], [-0.8, 1.0, 2.5], [-1.7, 0.0, 2.5], [-0.7, -1.05, 2.6], [0.6, -1.3, 2.6]], 22, 0.13, 1, true);
  // Cingulum: along the medial wall above the callosum.
  bundle([[3.0, -0.2, 0.45], [2.6, 1.2, 0.45], [0.5, 1.7, 0.45], [-1.8, 1.55, 0.45], [-2.65, 0.6, 0.5], [-2.0, -0.6, 0.7], [-0.9, -1.1, 0.95]], 16, 0.1, 1, true);
  // Inferior fronto-occipital fasciculus.
  bundle([[-3.6, 0.2, 1.6], [-1.8, -0.4, 2.0], [0.0, -0.6, 1.9], [1.6, -0.3, 1.7], [3.2, 0.3, 1.4]], 18, 0.16, 1, true);
  // Uncinate fasciculus: a hook from the temporal pole to orbitofrontal cortex.
  bundle([[1.5, -1.6, 2.2], [1.15, -0.9, 2.0], [1.5, -0.4, 1.8], [2.8, -0.7, 1.3]], 12, 0.1, 1, true);
  // Inferior longitudinal fasciculus.
  bundle([[-3.7, -0.3, 1.9], [-2.0, -0.9, 2.2], [-0.2, -1.3, 2.3], [1.2, -1.4, 2.3]], 14, 0.14, 1, true);
  // Cerebellar peduncles.
  bundle([[-1.1, -2.4, 0.35], [-2.0, -2.2, 0.9], [-2.85, -1.9, 1.2]], 10, 0.12, 0.8, true);
  // Thalamocortical radiation: a fan from each thalamus to the cortex.
  [-1, 1].forEach((h) => {
    const th = [-0.3, 0.15, 0.6 * h];
    for (let i = 0; i < 40; i++) {
      const d = S.dir();
      const tgt = onCortex([d[0] * 4, Math.abs(d[1]) * 2.5 + 0.3, h * (1.2 + Math.abs(d[2]) * 1.6)]);
      const mid = add(mul(add(th, tgt), 0.5), [0, 0.25, 0.25 * h]);
      fibres.push({ path: new Path(spline([th, mid, tgt], 8)), weight: 0.7, seed: r() });
    }
  });

  const w = fibres.map((f) => f.path.total * f.weight);
  const tot = w.reduce((a, b) => a + b, 0);
  const nF = S.budget(0.66);
  fibres.forEach((f, i) => {
    const n = Math.round((w[i] / tot) * nF);
    for (let k = 0; k < n; k++) {
      const u = r();
      const { p, t } = f.path.at(u);
      const ax = Math.abs(t[0]);
      const ay = Math.abs(t[1]);
      const az = Math.abs(t[2]);
      const s = ax + ay + az || 1;
      const c = [0, 1, 2].map((j) => (LR[j] * az + AP[j] * ax + SI[j] * ay) / s);
      S.add(p[0] + (r() - 0.5) * 0.025, p[1] + (r() - 0.5) * 0.025, p[2] + (r() - 0.5) * 0.025, S.vary(c, 0.2), 0.7, 0, u, f.seed);
    }
  });

  cortex(S, S.budget(0.11), { part: 1, folds: true, depth: 0.12, size: 0.6, col: (f) => scale3(C.steel, 0.32 + 0.2 * f) });
  S.halo(10, [C.steel, C.mist, C.deep], { flat: 0.8, bright: 0.3 });
  return S.done();
}
