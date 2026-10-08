import { Shape, duo, vec, scaleDuo, mixDuo, fbm, L, F, DEG } from './util.js';

// Opening scene: the whole system seen from above the ecliptic. The Sun sits
// in the middle, nine planets circle it on faint dotted orbits (the Moon
// circles Earth), with the asteroid belt and the Kuiper belt as dust rings.
// Orbit radii are compressed so everything fits; orbital speeds follow the
// real periods, softened (ω ∝ P^-0.5) so the outer planets visibly move.
//
// Parts: 0 Sun · 1–9 planets (a.y orbit radius, a.z phase) · 10 Moon ·
// 11 orbit lines · 12 asteroid belt · 13 Kuiper belt · 15 dust.

export const ORBITS = [
  // radius, period (years), planet radius, multi colours, mono colours
  { a: 1.75, P: 0.241, r: 0.1, c: ['#9A948C', '#C9C2B6', '#6F6A64'] },
  { a: 2.35, P: 0.615, r: 0.16, c: ['#EBD9A8', '#D9B977', '#F5EBCC'] },
  { a: 3.0, P: 1.0, r: 0.17, c: ['#2E73C9', '#4FA6E8', '#4F8F45', '#F2F6FA'] },
  { a: 3.7, P: 1.881, r: 0.13, c: ['#D2643A', '#B5482A', '#E8996B'] },
  { a: 5.25, P: 11.86, r: 0.4, c: ['#EAD9B8', '#B9825A', '#D9B38C', '#C8553D'] },
  { a: 6.45, P: 29.46, r: 0.33, c: ['#EAD7A6', '#D7BC84', '#F2E4C2'] },
  { a: 7.55, P: 84.0, r: 0.25, c: ['#B5E3EA', '#9ED6E0', '#CFF0F2'] },
  { a: 8.55, P: 164.8, r: 0.24, c: ['#6C9FE0', '#4F7FCC', '#9CC4EE'] },
  { a: 9.6, P: 247.9, r: 0.09, c: ['#E2CBA8', '#B07A4E', '#F3E6CF'] },
];
export const PLUTO_E = 0.24;
export const PLUTO_I = 17.1 * DEG;
export const OMEGA0 = 0.24;

const MONO = [L[30], L[40], L[20], L[50]];
const SUN = [duo('#FFF2C4', F.light), duo('#FFC24A', F.amber), duo('#FF8A1F', F.orange), duo('#FF5A14', F.red)];
const DUST = [duo('#8FA6CC', L[50]), duo('#CBD6EE', L[40]), duo('#E8D9C0', L[40]), duo('#B8A3D9', L[60])];

export function hero(N, seed = 7) {
  const S = new Shape(N, seed);
  const r = S.r;

  // Sun: a granular ball with a soft corona.
  const nSun = S.budget(0.09);
  const Rs = 0.85;
  S.sphere(Rs, Math.floor(nSun * 0.75), (lat, lon, v) => {
    const g = fbm(v[0] * 6, v[1] * 6, v[2] * 6, 3, 5);
    return mixDuo(SUN[2], SUN[0], g * 1.3 - 0.15);
  }, { part: 0, size: 0.95 });
  for (let k = Math.floor(nSun * 0.75); k < nSun; k++) {
    const v = vec(Math.asin(r() * 2 - 1) / DEG, r() * 360);
    const rr = Rs * (1.05 + Math.pow(r(), 2.2) * 0.9);
    S.add(v[0] * rr, v[1] * rr, v[2] * rr, scaleDuo(S.pick(SUN), 0.55 * (1.5 - rr / Rs * 0.5)), 0.8 + r() * 0.5, 0, 0, 0);
  }

  // Planets.
  const nPlanets = S.budget(0.24);
  const areas = ORBITS.map((o) => Math.max(o.r * o.r, 0.02));
  const areaSum = areas.reduce((a, b) => a + b, 0);
  ORBITS.forEach((o, i) => {
    const count = Math.floor((nPlanets * areas[i]) / areaSum);
    const multi = o.c;
    const phase = r() * Math.PI * 2;
    const ringed = i === 5;
    const nRing = ringed ? Math.floor(count * 0.45) : 0;
    for (let k = 0; k < count - nRing; k++) {
      const lat = Math.asin(r() * 2 - 1) / DEG;
      const v = vec(lat, r() * 360);
      let ci;
      if (i === 4 || i === 5) ci = Math.floor((Math.sin(lat * 0.16 + fbm(v[0] * 3, v[1] * 3, v[2] * 3, 2, i) * 2) * 0.5 + 0.5) * (multi.length - (i === 4 ? 1.01 : 0)));
      else if (i === 2) ci = fbm(v[0] * 2.2, v[1] * 2.2, v[2] * 2.2, 3, 21) > 0.55 ? 2 : (Math.abs(lat) > 68 ? 3 : (r() < 0.5 ? 0 : 1));
      else ci = Math.floor(r() * multi.length);
      if (i === 4 && Math.abs(lat + 22) < 7 && Math.abs(v[0]) < 0.35 && v[2] > 0) ci = 3;
      const d = duo(multi[Math.min(ci, multi.length - 1)], MONO[(i + ci) % MONO.length]);
      S.add(v[0] * o.r, v[1] * o.r, v[2] * o.r, S.vary(d, 0.15), 0.7 + r() * 0.4, i + 1, o.a, phase);
    }
    for (let k = 0; k < nRing; k++) {
      const rr = o.r * (1.35 + r() * 0.85);
      const a = r() * Math.PI * 2;
      const tilt = 0.47; // Saturn's 26.7° obliquity
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      S.add(x, -z * Math.sin(tilt), z * Math.cos(tilt), S.vary(duo('#D8C9A6', L[40]), 0.2), 0.55 + r() * 0.3, i + 1, o.a, phase);
    }
    if (i === 2) {
      // The Moon, circling Earth.
      const nMoon = Math.max(60, Math.floor(count * 0.18));
      for (let k = 0; k < nMoon; k++) {
        const v = vec(Math.asin(r() * 2 - 1) / DEG, r() * 360);
        const mr = 0.055;
        S.add(v[0] * mr, v[1] * mr, v[2] * mr, S.vary(duo('#CFCBC2', L[30]), 0.2), 0.6 + r() * 0.3, 10, o.a, phase);
      }
    }
  });

  // Orbit lines: dotted rings in each planet's colour.
  const nOrbit = S.budget(0.17);
  for (let k = 0; k < nOrbit; k++) {
    const i = Math.floor(r() * ORBITS.length);
    const o = ORBITS[i];
    const ang = r() * Math.PI * 2;
    const d = scaleDuo(duo(o.c[0], L[40]), 0.75);
    // a.y = radius (negative marks Pluto's eccentric, inclined orbit).
    S.add(0, (r() - 0.5) * 0.02, 0, d, 0.6 + r() * 0.25, 11, i === 8 ? -o.a : o.a, ang);
  }

  // Asteroid belt between Mars and Jupiter.
  const nBelt = S.budget(0.13);
  const ROCK = [duo('#A89C8C', L[50]), duo('#8C7F70', L[60]), duo('#C9BBA6', L[40])];
  for (let k = 0; k < nBelt; k++) {
    const rad = 4.2 + (r() + r()) * 0.3;
    S.add(0, S.gauss() * 0.06, 0, scaleDuo(S.pick(ROCK), 0.5 + r() * 0.4), 0.45 + r() * 0.45, 12, rad, r() * Math.PI * 2);
  }

  // Kuiper belt beyond Neptune.
  const nKuiper = S.budget(0.1);
  const ICE = [duo('#A9C4E8', L[50]), duo('#D9C6E8', L[60]), duo('#C8E0F0', L[40])];
  for (let k = 0; k < nKuiper; k++) {
    const rad = 9.1 + Math.pow(r(), 0.8) * 2.6;
    S.add(0, S.gauss() * 0.22, 0, scaleDuo(S.pick(ICE), 0.35 + r() * 0.35), 0.4 + r() * 0.4, 13, rad, r() * Math.PI * 2);
  }

  S.halo(4, 16, DUST, { flat: 0.45, bright: 0.38 });
  return S.done();
}
