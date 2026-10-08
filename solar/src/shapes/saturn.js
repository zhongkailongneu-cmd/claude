import { Shape, duo, mixDuo, scaleDuo, fbm, noise3, profile, smoothstep, clamp, L, DEG } from './util.js';

// Saturn: soft butterscotch bands, the blue-grey north polar hexagon (rigid,
// part 6) and the main rings — dim C ring, bright B ring, the dark Cassini
// Division, the A ring with the Encke Gap, and the thin F ring. Ring
// particles (part 4) orbit at Keplerian speed in the shader (ω ∝ r^-1.5).

export const SATURN_R = 2.5;

const ZONE = duo('#F1E2BB', L[20]);
const LIGHT = duo('#E6D1A0', L[30]);
const MID = duo('#D6BA84', L[40]);
const BELT = duo('#C29E68', L[50]);
const POLE = duo('#8EA3B5', L[50]);
const HEX = duo('#6F90B2', L[40]);
const HEX_EDGE = duo('#4F6684', L[60]);
const DUST = [duo('#E8D7B0', L[40]), duo('#CDB58A', L[50]), duo('#F4E9D0', L[30])];

// Rings in planet radii: [inner, outer, density, multi, mono].
const RINGS = [
  [1.24, 1.53, 0.32, '#9A8B73', L[60]], // C ring
  [1.53, 1.72, 0.85, '#D9C7A0', L[40]], // B ring, inner
  [1.72, 1.95, 1.0, '#ECDDB8', L[30]], // B ring, outer (brightest)
  [1.95, 2.025, 0.06, '#6B6050', L[70]], // Cassini Division
  [2.025, 2.205, 0.62, '#CDBC98', L[40]], // A ring
  [2.222, 2.27, 0.5, '#C2B190', L[40]], // A ring outside the Encke Gap
  [2.318, 2.328, 0.9, '#E2D6BC', L[30]], // F ring
];

const BANDS = [[-90, 1.4], [-60, 1.1], [-45, 0.7], [-35, 0.35], [-25, 0.6], [-15, 0.25], [-5, 0], [5, 0.05], [15, 0.3], [24, 0.65], [32, 0.3], [42, 0.75], [55, 0.55], [68, 1.1], [90, 1.4]];

export function saturn(N, seed = 71) {
  const S = new Shape(N, seed);
  const r = S.r;
  const R = SATURN_R;

  const count = S.budget(0.54);
  for (let k = 0; k < count; k++) {
    const lat = Math.asin(r() * 2 - 1) / DEG;
    const lon = r() * 360 - 180;
    const la = lat * DEG, lo = lon * DEG;
    const v = [Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)];
    const turb = (fbm(v[0] * 3, v[1] * 8, v[2] * 3, 3, 4) - 0.5) * 4;
    const b = profile(BANDS, lat + turb);
    const fine = noise3(v[0] * 20, v[1] * 36, v[2] * 20, 6);
    let d = b < 0.5 ? mixDuo(ZONE, LIGHT, b * 2) : b < 1 ? mixDuo(MID, BELT, (b - 0.5) * 2 * 0.8 + fine * 0.2) : mixDuo(BELT, POLE, clamp(b - 1, 0, 0.4) * 2.5);
    let part = 0;
    // North polar hexagon: a six-sided jet stream around the pole.
    const pd = 90 - lat;
    if (pd < 17) {
      const seg = ((((lon + 30) % 60) + 60) % 60) - 30;
      const edge = 13.2 / Math.cos(seg * DEG);
      if (pd < edge - 1.2) d = mixDuo(HEX, POLE, smoothstep(edge * 0.5, 0, pd) * 0.5);
      else if (pd < edge + 1.2) d = HEX_EDGE;
      part = 6;
    }
    S.add(v[0] * R, v[1] * R, v[2] * R, S.vary(d, 0.07), 1.2 * (0.88 + r() * 0.24), part, part ? 78 * DEG : 0, 0);
  }

  // Rings: radius sampled by area × optical depth.
  const nRing = S.budget(0.33);
  const weights = RINGS.map(([a, b, dens]) => (b * b - a * a) * dens);
  const total = weights.reduce((s, w) => s + w, 0);
  for (let k = 0; k < nRing; k++) {
    let x = r() * total, i = 0;
    while (x > weights[i] && i < RINGS.length - 1) x -= weights[i++];
    const [a, b, , multi, mono] = RINGS[i];
    const rr = Math.sqrt(a * a + r() * (b * b - a * a)) * R;
    const ang = r() * Math.PI * 2;
    const ringlet = 0.75 + 0.5 * noise3(rr * 9, 0.5, 0.5, 3); // fine ringlet structure
    const d = scaleDuo(duo(multi, mono), ringlet);
    S.add(Math.cos(ang) * rr, S.gauss() * 0.006, Math.sin(ang) * rr, d, 0.55 + r() * 0.35, 4, rr, ang);
  }

  S.halo(R * 2.5, R * 4.6, DUST, { bright: 0.28, flat: 0.5 });
  return S.done();
}
