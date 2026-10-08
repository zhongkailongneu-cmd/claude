import { Shape, C, mix3 } from './util.js';
import { cortex, cerebellum, brainstem, cortexPoint } from './brainshape.js';

// L9 · The whole brain: folded cortex, cerebellum, brainstem and the top of
// the spinal cord. A slow wave sweeps front to back; scattered sparks fire.
// parts: 0 cortex (anim.y = fold, anim.z = hemisphere) · 1 cerebellum
//        2 brainstem / cord (anim.y = along) · 3 sparks

export function brain(N, seed = 93) {
  const S = new Shape(N, seed);
  cortex(S, S.budget(0.58), {
    part: 0, depth: 0.24, size: 0.8,
    col: (f) => mix3([0.12, 0.22, 0.36], f > 0.6 ? C.pale : C.mist, Math.pow(f, 1.3)),
  });
  cerebellum(S, S.budget(0.09), { part: 1, col: (f) => mix3(C.navy, C.mist, f) });
  brainstem(S, S.budget(0.045), { part: 2 });
  const nSpark = S.budget(0.03);
  for (let k = 0; k < nSpark; k++) {
    const { p, n } = cortexPoint(S, { depth: 0.24 });
    const q = [p[0] + n[0] * 0.05, p[1] + n[1] * 0.05, p[2] + n[2] * 0.05];
    S.addP(q, S.r() < 0.18 ? C.glu : C.ice, 1.2, 3, 0, S.r());
  }
  S.halo(10, [C.steel, C.mist, C.deep], { flat: 0.8, bright: 0.32 });
  return S.done();
}
