import { Shape, hex, ramp, scale3 } from './util.js';

// Closing scene: a luminous sea surface seen from just below the horizon.
// Heights are animated in the shader; colour shifts along the swell.

const SEA = ['#2fd6ff', '#46ffc8', '#8a6cff', '#ff5fd2', '#2fd6ff'].map(hex);
const HALO = ['#2fd6ff', '#8a6cff', '#ff5fd2', '#c0f6ff'].map(hex);

export function outro(N, seed = 91) {
  const S = new Shape(N, seed);
  const r = S.r;
  const W = 15;
  const D0 = -12;
  const D1 = 5;

  const nGrid = S.budget(0.7);
  for (let k = 0; k < nGrid; k++) {
    const alongX = r() < 0.5;
    let x = (r() * 2 - 1) * W;
    let z = D0 + r() * (D1 - D0);
    if (alongX) z = D0 + Math.round(((z - D0) / (D1 - D0)) * 26) * ((D1 - D0) / 26);
    else x = Math.round(x / 0.8) * 0.8;
    const t = (x / W + 1) / 2;
    S.add(x, 0, z, S.vary(ramp(SEA, t), 0.2), 0.8, 0, t, 0);
  }
  const nDust = S.budget(0.2);
  for (let k = 0; k < nDust; k++) {
    const x = (r() * 2 - 1) * W;
    const z = D0 + r() * (D1 - D0);
    S.add(x, (r() - 0.5) * 0.3, z, scale3(ramp(SEA, (x / W + 1) / 2), 0.7), 0.6 + r() * 0.5, 0, 0, 0);
  }

  S.halo(14, HALO, { y: 5, flat: 0.5, bright: 0.45 });
  return S.done();
}
