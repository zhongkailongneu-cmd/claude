import { Shape, duo, mixDuo, scaleDuo, L, F } from './util.js';

// Closing scene: the Milky Way, a barred spiral seen from above its disc.
// Warm old stars in the bulge and bar, blue-white young stars and pink
// star-forming regions along four logarithmic arms (pitch ≈ 12°), and a
// pulsing marker on the Orion Spur where the Sun sits, ~26,000 light-years out.
//
// Parts: 0 bulge + bar · 1 disc and arms · 2 "you are here" ring · 3 the Sun · 15 dust.

const BULGE = [duo('#FFE6B4', L[20]), duo('#FFD38E', L[30]), duo('#FFF2DA', L[20])];
const ARM = [duo('#AFCBFF', L[40]), duo('#D8E5FF', L[30]), duo('#8FB1F6', L[50]), duo('#C9D2FF', L[40])];
const OLD = duo('#F2E3CC', L[50]);
const HII = duo('#FF7DB4', L[20]);
const SUN = duo('#FFB347', F.amber);
const DUST = [duo('#9FB4E0', L[50]), duo('#E0D0F0', L[60]), duo('#F5E6D0', L[50])];

export const GALAXY_SUN = { r: 5.3, a: 2.25 };

export function galaxy(N, seed = 111) {
  const S = new Shape(N, seed);
  const r = S.r;
  const BAR = 0.45; // bar angle (rad)

  // Bulge: a flattened spheroid, plus the bar.
  const nBulge = S.budget(0.14);
  for (let k = 0; k < nBulge; k++) {
    const rr = Math.pow(r(), 1.8) * 1.6;
    const g = [S.gauss(), S.gauss(), S.gauss()];
    const len = Math.hypot(...g) || 1;
    const d = S.vary(S.pick(BULGE), 0.25);
    S.add((g[0] / len) * rr, (g[1] / len) * rr * 0.55, (g[2] / len) * rr, scaleDuo(d, 1.1 - rr * 0.25), 0.7 + r() * 0.6, 0);
  }
  const nBar = S.budget(0.07);
  for (let k = 0; k < nBar; k++) {
    const t = (r() * 2 - 1) * 2.6;
    const w = 0.35 * (1 - Math.abs(t) / 3.2);
    const x = t + S.gauss() * 0.15, z = S.gauss() * w;
    S.add(x * Math.cos(BAR) - z * Math.sin(BAR), S.gauss() * 0.12, x * Math.sin(BAR) + z * Math.cos(BAR), S.vary(BULGE[1], 0.25), 0.7 + r() * 0.5, 0);
  }

  // Arms: Scutum–Centaurus and Perseus (major), Norma and Sagittarius (minor).
  const nArm = S.budget(0.52);
  const pitch = Math.tan((12.5 * Math.PI) / 180);
  for (let k = 0; k < nArm; k++) {
    const arm = r() < 0.66 ? (r() < 0.5 ? 0 : 2) : r() < 0.5 ? 1 : 3;
    const th = r() * Math.PI * 2.4;
    const rad = 2.6 * Math.exp(pitch * th);
    if (rad > 9.8) continue;
    const phi = BAR + (arm * Math.PI) / 2 + th;
    const spread = 0.22 + rad * 0.045;
    const off = S.gauss() * spread;
    const x = Math.cos(phi) * (rad + off), z = Math.sin(phi) * (rad + off);
    const young = off > -spread * 0.3; // trailing edge younger and bluer
    let d = young ? S.pick(ARM) : OLD;
    d = mixDuo(d, BULGE[1], Math.max(0, 1 - rad / 4) * 0.6);
    if (young && r() < 0.05) d = HII;
    S.add(x, S.gauss() * 0.07, z, S.vary(d, 0.3), (d === HII ? 1.2 : 0.75) + r() * 0.5, 1);
  }

  // Diffuse disc: exponential profile.
  while (S.i < S.budget(0.84)) {
    const rad = -Math.log(1 - r() * 0.95) * 2.8 + 0.8;
    if (rad > 10.5) continue;
    const a = r() * Math.PI * 2;
    S.add(Math.cos(a) * rad, S.gauss() * 0.1, Math.sin(a) * rad, scaleDuo(OLD, 0.5 + r() * 0.3), 0.5 + r() * 0.4, 1);
  }

  // The Sun, and a ring marking it.
  const sx = Math.cos(GALAXY_SUN.a) * GALAXY_SUN.r, sz = Math.sin(GALAXY_SUN.a) * GALAXY_SUN.r;
  const nRing = S.budget(0.012);
  for (let k = 0; k < nRing; k++) {
    const a = r() * Math.PI * 2;
    S.add(sx + Math.cos(a) * 0.42, 0, sz + Math.sin(a) * 0.42, scaleDuo(SUN, 0.8), 0.55 + r() * 0.3, 2, a);
  }
  for (let k = 0; k < 40; k++) {
    S.add(sx + S.gauss() * 0.03, S.gauss() * 0.03, sz + S.gauss() * 0.03, SUN, 1.6 + r(), 3);
  }

  S.halo(6, 18, DUST, { bright: 0.35, flat: 0.6 });
  return S.done();
}
