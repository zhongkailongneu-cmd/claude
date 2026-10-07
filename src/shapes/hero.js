import { Shape, hex, scale3 } from './util.js';

// A bioluminescent whirlpool seen from slightly above: plankton spiral inward
// along four arms and fall into a dark throat, where the page title sits.
// Part 0 positions are generated in the shader from (radial phase, arm angle),
// so particles flow forever; the stored position is only a jitter offset.

const PALETTE = ['#7ffcff', '#2fd8ff', '#46ffc8', '#8a6cff', '#ff5fd2', '#c0f6ff', '#5a8cff'].map(hex);

export function hero(N, seed = 11) {
  const S = new Shape(N, seed);
  const r = S.r;

  const nFlow = S.budget(0.8);
  for (let k = 0; k < nFlow; k++) {
    const arm = k % 5;
    const spread = S.gauss() * (r() < 0.75 ? 0.11 : 0.4);
    const angle = (arm / 5) * Math.PI * 2 + spread;
    const c = S.vary(S.pick(PALETTE), 0.25);
    const star = r() < 0.04;
    S.add(
      S.gauss() * 0.16,
      S.gauss() * 0.1,
      S.gauss() * 0.16,
      star ? scale3(c, 1.25) : c,
      star ? 1.9 + r() : 0.65 + r() * 0.7,
      0,
      r(),
      angle,
      r()
    );
  }

  // Throat: a narrowing funnel of dim particles under the inner ring.
  const nThroat = S.budget(0.08);
  for (let k = 0; k < nThroat; k++) {
    const d = Math.pow(r(), 0.7);
    const rad = 1.5 * (1 - d * 0.75);
    const a = r() * Math.PI * 2;
    const c = scale3(S.pick(PALETTE), 0.55 * (1 - d * 0.7));
    S.add(Math.cos(a) * rad, -2.7 - d * 5.5, Math.sin(a) * rad, c, 0.6 + r() * 0.4, 1, d, a);
  }

  S.halo(10, PALETTE, { flat: 0.55, bright: 0.5 });
  return S.done();
}
