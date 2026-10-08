import { Shape, duo, mixDuo, fbm, noise3, dLon, smoothstep, clamp, L, DEG } from './util.js';

// Neptune: Irwin et al. (2024) showed its true colour is a pale greenish blue,
// only slightly bluer than Uranus, so the multi palette is a soft azure rather
// than Voyager's contrast-boosted cobalt. Darker bands, the Great Dark Spot
// with its bright companion clouds (rigid, part 6), "Scooter" and streaks of
// high methane-ice cirrus.

export const NEPTUNE_R = 2.35;
export const GDS_LAT = -22;

const BASE = duo('#6E9FDF', L[40]);
const LIGHT = duo('#9CC3EE', L[30]);
const BAND = duo('#5181CC', L[50]);
const DEEP = duo('#3D66B9', L[60]);
const SPOT = duo('#1F387E', L[70]);
const CLOUD = duo('#F2F8FF', L[10]);
const DUST = [duo('#8DB4EA', L[40]), duo('#5C86D0', L[50]), duo('#D2E4F8', L[30])];

export function neptune(N, seed = 91) {
  const S = new Shape(N, seed);
  const r = S.r;
  const R = NEPTUNE_R;

  const count = S.budget(0.82);
  for (let k = 0; k < count; k++) {
    const lat = Math.asin(r() * 2 - 1) / DEG;
    const lon = r() * 360 - 180;
    const la = lat * DEG, lo = lon * DEG;
    const v = [Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)];
    const turb = (fbm(v[0] * 2.5, v[1] * 7, v[2] * 2.5, 3, 4) - 0.5) * 8;
    const b = Math.sin((lat + turb) * 0.11);
    let d = mixDuo(BAND, LIGHT, 0.5 + b * 0.4);
    d = mixDuo(d, BASE, 0.35);
    d = mixDuo(d, DEEP, smoothstep(-50, -75, lat) * 0.6 + smoothstep(55, 80, lat) * 0.4);
    // Cirrus streaks, stretched along longitude.
    const cir = noise3(v[0] * 3, lat * 0.45, v[2] * 3, 17);
    const streakBand = Math.exp(-((lat - 27) ** 2) / 40) + Math.exp(-((lat + 26) ** 2) / 30) * 0.8 + Math.exp(-((lat + 42) ** 2) / 12) * 0.6;
    d = mixDuo(d, CLOUD, clamp(smoothstep(0.6, 0.76, cir) * streakBand, 0, 0.95));
    let part = 0;
    // Great Dark Spot with companion clouds on its southern edge.
    const ex = (dLon(lon, 15) * Math.cos(la)) / 14;
    const ey = (lat - GDS_LAT) / 7;
    const e = Math.hypot(ex, ey);
    if (e < 1.6) {
      part = 6;
      if (e < 1) d = mixDuo(SPOT, BAND, smoothstep(0.55, 1, e));
      else if (ey < -0.6 && e < 1.5) d = mixDuo(d, CLOUD, smoothstep(1.5, 1.05, e) * 0.9);
    }
    // Dark Spot 2 with its bright core.
    const e2 = Math.hypot((dLon(lon, -55) * Math.cos(la)) / 5, (lat + 55) / 3.5);
    if (e2 < 1) d = e2 < 0.35 ? CLOUD : mixDuo(SPOT, d, e2);
    S.add(v[0] * R, v[1] * R, v[2] * R, S.vary(d, 0.07), 1.2 * (0.88 + r() * 0.24), part, part ? GDS_LAT * DEG : 0, 0);
  }

  S.halo(R * 1.6, R * 4.4, DUST, { bright: 0.3 });
  return S.done();
}
