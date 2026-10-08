import { Shape, duo, mixDuo, scaleDuo, fbm, smoothstep, L } from './util.js';

// Uranus: a pale cyan ice giant (methane absorbs red light), almost featureless
// with faint banding and a brighter polar hood. It is tipped over by 97.8°,
// so its 13 thin dark rings stand nearly upright around it.

export const URANUS_R = 2.4;

const BASE = duo('#AEDFE7', L[40]);
const LIGHT = duo('#C8EEF2', L[30]);
const DEEP = duo('#8DCBD8', L[50]);
const HOOD = duo('#E2F7F8', L[20]);
const RING = duo('#9BA9B0', L[50]);
const DUST = [duo('#BFE6EC', L[40]), duo('#93C9D6', L[50]), duo('#E6F6F8', L[30])];

// Ring radii in planet radii (6, 5, 4, α, β, η, γ, δ, λ, ε, ν) and relative brightness.
const RINGS = [[1.637, 0.25], [1.652, 0.25], [1.666, 0.3], [1.75, 0.35], [1.786, 0.35], [1.847, 0.2], [1.864, 0.35], [1.9, 0.4], [1.958, 0.18], [2.005, 1.0], [2.6, 0.12]];

export function uranus(N, seed = 81) {
  const S = new Shape(N, seed);
  const r = S.r;
  const R = URANUS_R;

  S.sphere(R, S.budget(0.75), (lat, lon, v) => {
    const band = Math.sin(lat * 0.21 + (fbm(v[0] * 2, v[1] * 6, v[2] * 2, 3, 2) - 0.5) * 1.4);
    let d = mixDuo(DEEP, LIGHT, 0.5 + band * 0.35);
    d = mixDuo(d, BASE, 0.4);
    d = mixDuo(d, HOOD, smoothstep(-40, -70, lat) * 0.85);
    return d;
  }, { part: 0, size: 1.2 });

  const nRing = S.budget(0.09);
  const total = RINGS.reduce((s, [, w]) => s + w, 0);
  for (let k = 0; k < nRing; k++) {
    let x = r() * total, i = 0;
    while (x > RINGS[i][1] && i < RINGS.length - 1) x -= RINGS[i++][1];
    const [a] = RINGS[i];
    const width = i === 9 ? 0.03 : i === 10 ? 0.15 : 0.008;
    const rr = (a + (r() - 0.5) * width) * R;
    const ang = r() * Math.PI * 2;
    const bright = i === 9 ? 0.75 : 0.5;
    const d = scaleDuo(RING, bright);
    S.add(Math.cos(ang) * rr, S.gauss() * 0.004, Math.sin(ang) * rr, d, 0.5 + r() * 0.25, 4, rr, ang);
  }

  S.halo(R * 1.6, R * 4.4, DUST, { bright: 0.28 });
  return S.done();
}
