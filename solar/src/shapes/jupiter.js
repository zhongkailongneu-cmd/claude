import { Shape, duo, mixDuo, fbm, noise3, profile, dLon, smoothstep, clamp, L, DEG } from './util.js';

// Jupiter: alternating cream zones and brown belts, turbulent at their edges,
// blue-grey festoons along the equator, white ovals in the south and the
// Great Red Spot. The shader shears the bands back and forth (zonal jets);
// Red Spot particles (part 6) keep a rigid rotation so the storm holds shape.

export const JUPITER_R = 3;
export const GRS_LAT = -22.5;
export const GRS_LON = 28;

const ZONE = duo('#F2E7CF', L[20]);
const ZONE2 = duo('#E9D9B6', L[30]);
const BELT = duo('#B47A52', L[50]);
const BELT2 = duo('#9C6242', L[60]);
const TAN = duo('#CFA57C', L[40]);
const POLE = duo('#9D978F', L[50]);
const FESTOON = duo('#6E88A3', L[60]);
const GRS = duo('#C64F33', L[10]);
const GRS_RIM = duo('#E08A5E', L[30]);
const COLLAR = duo('#F8F0E0', L[50]);
const OVAL = duo('#FBF7EE', L[10]);
const DUST = [duo('#E9D6B4', L[40]), duo('#C49A74', L[50]), duo('#F5EBD8', L[30])];

// Band colour (0 = zone … 1 = belt) by latitude, north to south.
const BANDS = [
  [-90, 1.5], [-55, 1.5], [-46, 0.55], [-40, 0.2], [-35, 0.75], [-29, 0.15], [-22, 0], [-18, 0.95], [-9, 0.85],
  [-6, 0.05], [5, 0.1], [8, 1], [17, 0.9], [20, 0.05], [24, 0.8], [29, 0.1], [35, 0.6], [41, 0.15], [47, 0.55], [55, 1.5], [90, 1.5],
];

export function jupiter(N, seed = 61) {
  const S = new Shape(N, seed);
  const r = S.r;
  const R = JUPITER_R;

  const count = S.budget(0.86);
  for (let k = 0; k < count; k++) {
    const y = r() * 2 - 1;
    const lat = Math.asin(y) / DEG;
    const lon = r() * 360 - 180;
    const la = lat * DEG, lo = lon * DEG;
    const v = [Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)];
    const turb = (fbm(v[0] * 4, v[1] * 9, v[2] * 4, 4, 5) - 0.5) * 7 + Math.sin(lon * 0.14 + lat * 0.3) * 0.8;
    const b = profile(BANDS, lat + turb);
    let d;
    if (b > 1.2) d = mixDuo(BELT, POLE, smoothstep(1.2, 1.5, b));
    else {
      const t = clamp(b, 0, 1);
      const fine = noise3(v[0] * 22, v[1] * 40, v[2] * 22, 8);
      d = t < 0.5 ? mixDuo(ZONE, ZONE2, t * 2 * 0.7 + fine * 0.3) : mixDuo(TAN, fine > 0.5 ? BELT2 : BELT, (t - 0.5) * 2);
    }
    // Festoons: dark blue-grey plumes trailing from the north equatorial belt.
    if (lat > 2 && lat < 9) {
      const f = smoothstep(0.62, 0.78, noise3(lon * 0.09, lat * 0.25, 1.3, 12));
      d = mixDuo(d, FESTOON, f * 0.85);
    }
    // White ovals.
    for (const [ola, olo, s] of [[-40, -70, 3.2], [-41, -30, 2.6], [-40, 120, 3], [-33, -150, 2.8]]) {
      const e = Math.hypot((dLon(lon, olo) * Math.cos(la)) / (s * 1.4), (lat - ola) / s);
      if (e < 1) d = mixDuo(d, OVAL, smoothstep(1, 0.5, e));
    }
    // Great Red Spot (rigid, part 6).
    const ex = (dLon(lon, GRS_LON) * Math.cos(la)) / 12;
    const ey = (lat - GRS_LAT) / 6;
    const e = Math.hypot(ex, ey);
    let part = 0;
    if (e < 1.45) {
      part = 6;
      if (e < 1) {
        const swirl = noise3(Math.atan2(ey, ex) * 1.5 + e * 4, e * 5, 2.7, 15);
        d = mixDuo(GRS, GRS_RIM, smoothstep(0.35, 0.95, e) * 0.8 + (swirl - 0.5) * 0.4);
      } else d = mixDuo(COLLAR, d, smoothstep(1.05, 1.45, e));
    }
    S.add(v[0] * R, v[1] * R, v[2] * R, S.vary(d, 0.07), 1.2 * (0.88 + r() * 0.24), part, part ? GRS_LAT * DEG : 0, 0);
  }

  S.halo(R * 1.5, R * 4, DUST, { bright: 0.3 });
  return S.done();
}
