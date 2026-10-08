import { Shape, duo, vec, dot3, mixDuo, scaleDuo, fbm, noise3, smoothstep, L, DEG } from './util.js';

// Mercury: grey, airless and cratered. Multi colours lean on MESSENGER's
// colour views (blue-grey low-reflectance material, tan smooth plains, bright
// young ray craters); mono maps the same albedo onto the blue scale.

export const MERCURY_R = 2.3;

const BASE = duo('#9C958B', L[50]);
const DARK = duo('#6A6F7B', L[60]);
const PLAINS = duo('#B2A187', L[40]);
const RIM = duo('#CEC7BB', L[30]);
const RAY = duo('#F0EADF', L[20]);
const DUST = [duo('#B8B0A4', L[50]), duo('#8E96A8', L[60]), duo('#D9CFBF', L[40])];

export function mercury(N, seed = 21) {
  const S = new Shape(N, seed);
  const r = S.r;

  // Crater list: size follows a steep power law, a few young ones throw rays.
  const craters = [];
  for (let k = 0; k < 150; k++) {
    const lat = (Math.asin(r() * 2 - 1)) / DEG;
    const rad = 1.6 + 15 * Math.pow(r(), 3.2);
    craters.push({ c: vec(lat, r() * 360 - 180), rad, ray: false });
  }
  for (const [lat, lon, rad] of [[-48, -20, 2.4], [22, 35, 1.8], [58, 160, 2], [-10, 95, 1.6], [12, -60, 2.2], [-30, -140, 1.7]]) {
    craters.push({ c: vec(lat, lon), rad, ray: true });
  }
  craters.push({ c: vec(31, 162), rad: 22, ray: false, basin: true }); // Caloris
  for (const k of craters) {
    k.cosIn = Math.cos(k.rad * (k.ray ? 7 : 1.9) * DEG);
  }

  S.sphere(MERCURY_R, S.budget(0.82), (lat, lon, v) => {
    const n = fbm(v[0] * 3, v[1] * 3, v[2] * 3, 4, 2);
    const m = fbm(v[0] * 1.6 + 5, v[1] * 1.6, v[2] * 1.6, 3, 8);
    let d = mixDuo(DARK, BASE, smoothstep(0.32, 0.6, n));
    d = mixDuo(d, PLAINS, smoothstep(0.55, 0.7, m) * 0.7);
    let size = 1;
    for (const k of craters) {
      const cd = dot3(v, k.c);
      if (cd < k.cosIn) continue;
      const a = Math.acos(Math.min(1, cd)) / DEG;
      const u = a / k.rad;
      if (k.basin) {
        if (u < 1) d = mixDuo(d, PLAINS, 0.7 * smoothstep(1, 0.6, u));
        else if (u < 1.12) d = mixDuo(d, RIM, 0.5);
        continue;
      }
      if (u < 0.82) d = scaleDuo(mixDuo(d, DARK, 0.5), 0.62);
      else if (u < 1.15) { d = RIM; size = 1.1; }
      else if (k.ray) {
        // Rays: streaks that depend only on direction from the crater.
        const t = [v[0] - k.c[0] * cd, v[1] - k.c[1] * cd, v[2] - k.c[2] * cd];
        const tl = Math.hypot(t[0], t[1], t[2]) || 1;
        const ray = noise3((t[0] / tl) * 7, (t[1] / tl) * 7, (t[2] / tl) * 7, 40);
        const f = smoothstep(0.6, 0.78, ray) * (1 - u / 7) + smoothstep(1.9, 1.15, u) * 0.6;
        d = mixDuo(d, RAY, Math.min(1, f));
      }
    }
    if (r() < 0.003) d = RAY; // scattered fresh impacts
    return [d, size];
  }, { part: 0, size: 1.2 });

  S.halo(MERCURY_R * 1.5, MERCURY_R * 4.5, DUST, { bright: 0.32 });
  return S.done();
}
