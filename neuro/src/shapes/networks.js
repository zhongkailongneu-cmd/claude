import { Shape, C, Path, spline, add, mul, sub, len, scale3 } from './util.js';
import { cortex, onCortex } from './brainshape.js';

// L8 · Three large-scale networks inside a translucent brain: the default
// mode network (rest, self-referential thought), the central executive
// network (goal-directed tasks) and the salience network, which flashes as it
// hands control from one to the other (the triple-network model).
// parts: 0 brain outline · 1 node (anim.z = network) · 2 edge (anim.y = along, anim.z = network)
// networks: 0 DMN · 1 SN · 2 CEN

const NODES = {
  mPFC: [[3.0, 0.6, 0], 0], PCC: [[-2.0, 1.2, 0], 0], angL: [[-2.3, 0.8, -2.5], 0], angR: [[-2.3, 0.8, 2.5], 0],
  ltL: [[0.4, -1.4, -2.7], 0], ltR: [[0.4, -1.4, 2.7], 0], hfL: [[-0.7, -1.15, -1.35], 0], hfR: [[-0.7, -1.15, 1.35], 0],
  dACC: [[1.7, 1.45, 0], 1], aiL: [[1.3, -0.25, -2.3], 1], aiR: [[1.3, -0.25, 2.3], 1],
  dlL: [[2.4, 1.4, -2.0], 2], dlR: [[2.4, 1.4, 2.0], 2], ppcL: [[-1.3, 2.1, -2.0], 2], ppcR: [[-1.3, 2.1, 2.0], 2],
};
const EDGES = [
  ['mPFC', 'PCC'], ['PCC', 'angL'], ['PCC', 'angR'], ['mPFC', 'angL'], ['mPFC', 'angR'], ['PCC', 'hfL'], ['PCC', 'hfR'], ['mPFC', 'ltL'], ['mPFC', 'ltR'], ['angL', 'ltL'], ['angR', 'ltR'],
  ['dACC', 'aiL'], ['dACC', 'aiR'], ['aiL', 'aiR'],
  ['dlL', 'ppcL'], ['dlR', 'ppcR'], ['dlL', 'dlR'], ['ppcL', 'ppcR'],
];
const COL = [C.pale, C.glu, C.steel];
const DEEP = new Set(['hfL', 'hfR']);

export function networks(N, seed = 117) {
  const S = new Shape(N, seed);
  const r = S.r;
  const pos = {};
  for (const [k, [p]] of Object.entries(NODES)) {
    if (Math.abs(p[2]) < 0.1 || DEEP.has(k)) pos[k] = p;
    else {
      const q = onCortex(p);
      const c = [0, 0.35, 1.45 * Math.sign(p[2])];
      const d = sub(q, c);
      pos[k] = add(c, mul(d, (len(d) - 0.25) / len(d)));
    }
  }

  cortex(S, S.budget(0.24), { part: 0, folds: true, depth: 0.18, size: 0.65, col: (f) => scale3(C.steel, 0.3 + 0.28 * f) });

  const nNode = S.budget(0.26);
  const keys = Object.keys(NODES);
  for (let k = 0; k < nNode; k++) {
    const key = keys[k % keys.length];
    const net = NODES[key][1];
    const c = pos[key];
    const s = Math.pow(r(), 0.6) * (net === 1 ? 0.42 : 0.5);
    const d = S.dir();
    const col = S.vary(s < 0.18 ? C.ice : COL[net], 0.15);
    S.add(c[0] + d[0] * s, c[1] + d[1] * s, c[2] + d[2] * s, col, s < 0.18 ? 1.15 : 0.9, 1, s, net);
  }

  const nEdge = S.budget(0.3);
  const paths = EDGES.map(([a, b]) => {
    const pa = pos[a];
    const pb = pos[b];
    const L = len(sub(pa, pb));
    const mid = add(mul(add(pa, pb), 0.5), [0, 0.18 * L, 0]);
    return { path: new Path(spline([pa, mid, pb], 12)), net: NODES[a][1] };
  });
  const tot = paths.reduce((s, p) => s + p.path.total, 0);
  paths.forEach(({ path, net }) => {
    S.tube(path, Math.round((path.total / tot) * nEdge), { r: 0.07, col: COL[net], part: 2, a2: net, size: 0.75 });
  });

  S.halo(10, [C.steel, C.mist, C.deep], { flat: 0.8, bright: 0.3 });
  return S.done();
}
