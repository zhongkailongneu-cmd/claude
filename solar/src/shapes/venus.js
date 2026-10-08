import { Shape, duo, mixDuo, rampDuo, fbm, dLon, smoothstep, clamp, L } from './util.js';

// Venus: only the cloud deck is visible. Zonal streaks wrapped around the
// planet, the dark sideways "Y" seen in ultraviolet, bright polar collars and
// a thick golden haze at the limb. The whole deck super-rotates retrograde.

export const VENUS_R = 2.55;

const CREAM = duo('#F4E6C1', L[30]);
const GOLD = duo('#E4C68A', L[40]);
const OCHRE = duo('#CDA463', L[50]);
const DARK = duo('#A07B47', L[60]);
const POLAR = duo('#FCF3DC', L[20]);
const HAZE = duo('#FFE4AE', L[40]);
const DUST = [duo('#F2DDAF', L[40]), duo('#D9B77C', L[50]), duo('#FFF0CF', L[30])];

export function venus(N, seed = 31) {
  const S = new Shape(N, seed);

  S.sphere(VENUS_R, S.budget(0.78), (lat, lon, v) => {
    // Zonal streaks: noise stretched along longitude.
    const z = fbm(v[0] * 2.2, v[1] * 10, v[2] * 2.2, 4, 3);
    const w = fbm(v[0] * 5, v[1] * 5, v[2] * 5, 3, 6);
    let d = rampDuo([OCHRE, GOLD, CREAM], clamp(z * 1.35 - 0.2 + (w - 0.5) * 0.3, 0, 1));
    // The dark "Y": an equatorial band that splits toward both poles.
    const dl = dLon(lon, -40);
    const arm = dl > 0 ? Math.abs(Math.abs(lat) - dl * 0.42) : Math.abs(lat) + Math.abs(dl) * 0.1;
    const y = smoothstep(14, 4, arm) * smoothstep(150, 60, Math.abs(dl)) * (0.6 + w * 0.6);
    d = mixDuo(d, DARK, clamp(y, 0, 0.85));
    d = mixDuo(d, POLAR, smoothstep(58, 72, Math.abs(lat)) * 0.8);
    return d;
  }, { part: 0, size: 1.25, shell: 0.02 });

  S.shellDust(VENUS_R * 1.01, VENUS_R * 1.13, S.budget(0.08), HAZE, { part: 2, size: 0.8, pow: 2.2 });
  S.halo(VENUS_R * 1.5, VENUS_R * 4.2, DUST, { bright: 0.3 });
  return S.done();
}
