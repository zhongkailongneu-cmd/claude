import { Shape, C, scale3 } from './util.js';
import { pyramidal } from './neuron.js';

// Opening page: one giant pyramidal neuron, the way it glows under a
// two-photon microscope, with a few dimmer neurons further back.
// parts: 0 soma · 1 dendrite · 2 axon · 3 spines · 4 synaptic input sparks
//        5 background neurons (anim.z = their own rhythm)

export function hero(N, seed = 7) {
  const S = new Shape(N, seed);
  const main = pyramidal(S, { n: S.budget(0.6), scale: 1, apicalLen: 4.4, axonLen: 5.4, basal: 7 });

  // Synaptic inputs arriving on the dendrites: glutamate (gold) and Ca2+ (teal).
  const nIn = S.budget(0.025);
  const pool = main.branches.filter((b) => b.lvl >= 1);
  for (let k = 0; k < nIn; k++) {
    const b = pool[Math.floor(S.r() * pool.length)];
    const u = S.r();
    const { p } = b.path.at(u);
    const d = S.dir();
    const q = [p[0] + d[0] * 0.08, p[1] + d[1] * 0.08, p[2] + d[2] * 0.08];
    const c = S.r() < 0.6 ? C.glu : C.ca;
    S.addP(q, S.vary(c, 0.2), 1.25, 4, (b.d0 + u * b.len) / main.reach, S.r(), S.r());
  }

  // A few neurons deeper in the tissue, dimmer and smaller.
  const spots = [[-5.2, 1.4, -6.5, 0.55], [5.4, -0.6, -7.5, 0.6], [-3.6, -3.2, -9, 0.5], [3.8, 3.4, -10, 0.45], [0.6, -5.8, -11, 0.4]];
  const nBg = S.budget(0.2);
  spots.forEach(([x, y, z, sc], k) => {
    const phase = (k * 0.37) % 1;
    pyramidal(S, {
      n: Math.floor(nBg / spots.length), at: [x, y, z], scale: sc, apicalLen: 4, axonLen: 4, basal: 5, spineFrac: 0.04,
      tilt: [Math.sin(k * 1.7) * 0.35, 1, Math.cos(k * 2.3) * 0.2],
      parts: { soma: 5, dend: 5, axon: 5, spine: 5 },
      colors: { soma: C.pale, near: scale3(C.mist, 0.8), far: scale3(C.deep, 0.75), spine: C.pale },
      a2: () => phase,
    });
  });

  S.halo(13, [C.mist, C.steel, C.pale, C.deep, C.ach], { flat: 0.8, bright: 0.4 });
  return S.done();
}
