import { Shape, hex, ramp, scale3 } from './util.js';

// Deep-sea jellyfish in blue bioluminescence. Local frame: +y = top of bell.
// anim: x = part (0 bell, 1 inner bell / radial canals, 2 rim lights,
//       3 oral arms, 4 tentacles, 5 gonads), y = s (bell: 0 apex → 1 margin;
//       arms and tentacles: 0 root → 1 tip), z = angle or phase.
// Rim lights carry their angle so the shader can spin the "burglar alarm"
// pinwheel of light around the bell, as Atolla does when attacked.

const R = 2.6;
const H = 2.0;
const BLUE = ['#1b6bff', '#1f9dff', '#2fd6ff', '#8af3ff'].map(hex);
const ICE = hex('#d9fbff');
const INDIGO = hex('#4a4dff');
const VIOLET = hex('#8f7cff');
const HALO = ['#2fd6ff', '#1f9dff', '#8af3ff', '#8f7cff'].map(hex);

const bellRadius = (s) => R * Math.pow(Math.sin((s * Math.PI) / 2), 0.85);
const bellY = (s) => H * (1 - Math.pow(s, 1.7)) - 0.15;
const scallop = (a) => 1 + 0.045 * Math.cos(a * 16);

export function jellyfish(N, seed = 51) {
  const S = new Shape(N, seed);
  const r = S.r;

  // Outer bell with brighter radial canals.
  const nBell = S.budget(0.3);
  for (let k = 0; k < nBell;) {
    const s = Math.sqrt(r());
    if (r() > 0.25 + bellRadius(s) / R) continue;
    k++;
    const a = r() * Math.PI * 2;
    const rad = bellRadius(s) * scallop(a);
    const canal = Math.abs(Math.sin(a * 8)) < 0.07;
    const c = canal ? scale3(ICE, 1.15) : S.vary(ramp(BLUE, 0.25 + s * 0.6), 0.2);
    S.add(Math.cos(a) * rad, bellY(s) + (r() - 0.5) * 0.04, Math.sin(a) * rad, c, canal ? 1 : 0.85, canal ? 1 : 0, s, a);
  }
  // Inner (subumbrella) surface, dimmer, gives the bell thickness.
  const nInner = S.budget(0.08);
  for (let k = 0; k < nInner; k++) {
    const s = 0.15 + r() * 0.85;
    const a = r() * Math.PI * 2;
    const rad = bellRadius(s) * 0.88;
    S.add(Math.cos(a) * rad, bellY(s) - 0.28, Math.sin(a) * rad, scale3(BLUE[1], 0.6), 0.75, 1, s, a);
  }

  // Margin ring with marginal light organs.
  const nRim = S.budget(0.07);
  for (let k = 0; k < nRim; k++) {
    const a = r() * Math.PI * 2;
    const organ = Math.cos(a * 22) > 0.86;
    const rad = bellRadius(1) * scallop(a) + (r() - 0.5) * 0.05;
    const c = organ ? scale3(ICE, 1.8) : scale3(BLUE[2], 1.25);
    S.add(Math.cos(a) * rad, bellY(1) + (r() - 0.5) * 0.06, Math.sin(a) * rad, c, organ ? 1.6 : 1.05, 2, 1, a);
  }

  // Four gonads: rings near the apex seen through the clear bell.
  const nGon = S.budget(0.045);
  for (let k = 0; k < nGon; k++) {
    const g = Math.floor(r() * 4);
    const ca = (g / 4) * Math.PI * 2 + Math.PI / 4;
    const cr = 0.72;
    const a = r() * Math.PI * 2;
    const rr = 0.36 + (r() - 0.5) * 0.08;
    const x = Math.cos(ca) * cr + Math.cos(a) * rr;
    const z = Math.sin(ca) * cr + Math.sin(a) * rr;
    const rad = Math.hypot(x, z);
    const s = Math.min(0.99, (2 / Math.PI) * Math.asin(Math.min(1, Math.pow(rad / R, 1 / 0.85))));
    S.add(x, bellY(s) - 0.12, z, scale3(VIOLET, 1.3), 0.95, 5, s, a);
  }

  // Oral arms: four frilled ribbons hanging from the centre.
  const nArms = S.budget(0.14);
  for (let k = 0; k < nArms; k++) {
    const arm = Math.floor(r() * 4);
    const base = (arm / 4) * Math.PI * 2;
    const d = Math.pow(r(), 0.9);
    const len = 4.6;
    const spiral = base + d * 1.4;
    const cx = Math.cos(spiral) * (0.25 + d * 0.35);
    const cz = Math.sin(spiral) * (0.25 + d * 0.35);
    const width = 0.42 * (1 - d * 0.6);
    const v = r() * 2 - 1;
    const frill = Math.sin(d * 34 + v * 3) * 0.12 * (0.4 + d);
    const nx = -Math.sin(spiral);
    const nz = Math.cos(spiral);
    const x = cx + nx * v * width + Math.cos(spiral) * frill;
    const z = cz + nz * v * width + Math.sin(spiral) * frill;
    const y = -0.2 - d * len;
    const edge = Math.abs(v) > 0.85;
    const c = edge ? scale3(ICE, 1.2) : S.vary(ramp([BLUE[2], BLUE[1], VIOLET], d), 0.2);
    S.add(x, y, z, c, edge ? 0.95 : 0.8, 3, d, base);
  }

  // Marginal tentacles, plus one very long trailing tentacle.
  const nTent = S.budget(0.2);
  const T = 28;
  for (let k = 0; k < nTent; k++) {
    const long = r() < 0.08;
    const t = long ? 0 : Math.floor(r() * T);
    const a = long ? 0.6 : (t / T) * Math.PI * 2 + 0.11;
    const d = r();
    const len = long ? 9.5 : 5.2 + Math.sin(t * 2.7) * 1.1;
    const rad = bellRadius(1) * 0.97 * (1 - d * 0.18);
    const x = Math.cos(a) * rad + (r() - 0.5) * 0.03;
    const z = Math.sin(a) * rad + (r() - 0.5) * 0.03;
    const y = bellY(1) - d * len;
    const c = scale3(ramp([BLUE[3], BLUE[2], BLUE[0], INDIGO], d), 1.05 - d * 0.35);
    S.add(x, y, z, c, 0.7 - d * 0.2, 4, d, a * 3.1 + t);
  }

  S.halo(7.5, HALO, { y: -1.5, flat: 0.9, bright: 0.55 });
  return S.done();
}
