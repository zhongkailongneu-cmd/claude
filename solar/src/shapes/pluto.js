import { Shape, duo, mixDuo, fbm, noise3, dLon, smoothstep, clamp, L, DEG } from './util.js';

// Pluto as New Horizons saw it in 2015: the bright "heart" (Tombaugh Regio),
// whose western lobe is the nitrogen-ice plain Sputnik Planitia with its
// convection cells; the dark red Cthulhu Macula along the equator to the west;
// tan and orange-brown mid-latitudes; a greyer north polar region; and a thin
// blue haze at the limb.

export const PLUTO_R = 2.25;

const SPUTNIK = duo('#FFF6E6', L[10]);
const CELL = duo('#E9DCC4', L[20]);
const TOMBAUGH = duo('#EEDDC0', L[20]);
const TAN = duo('#B98A5C', L[50]);
const ORANGE = duo('#94562F', L[60]);
const CTHULHU = duo('#5E2B1C', L[70]);
const CTHULHU2 = duo('#7A3A23', L[60]);
const POLAR = duo('#B8AFA3', L[30]);
const HAZE = duo('#7DB8F2', L[40]);
const DUST = [duo('#D9C2A0', L[40]), duo('#A9C9EE', L[50]), duo('#C08A62', L[50])];

const HEART_LAT = 18;
const HEART_LON = 180;
const HEART_S = 33;

export function pluto(N, seed = 101) {
  const S = new Shape(N, seed);
  const R = PLUTO_R;

  S.sphere(R, S.budget(0.8), (lat, lon, v) => {
    const n = fbm(v[0] * 4, v[1] * 4, v[2] * 4, 4, 5);
    let d = mixDuo(ORANGE, TAN, smoothstep(0.3, 0.65, n));
    // Mid-latitude orange-brown band and the grey north.
    d = mixDuo(d, ORANGE, Math.exp(-((lat - 42) ** 2) / 90) * 0.6);
    d = mixDuo(d, POLAR, smoothstep(55, 75, lat + (n - 0.5) * 10));
    // Cthulhu Macula: a long dark whale shape along the equator, west of the heart.
    const dl = dLon(lon, 85);
    const taper = clamp(1 - Math.abs(dl) / 70, 0, 1);
    const top = 6 + 10 * taper + (n - 0.5) * 10;
    const bot = -18 - 6 * taper + (n - 0.5) * 8;
    if (taper > 0 && lat < top && lat > bot) {
      const inner = Math.min(top - lat, lat - bot);
      d = mixDuo(d, n > 0.5 ? CTHULHU : CTHULHU2, smoothstep(0, 5, inner) * smoothstep(0, 0.15, taper));
    }
    // The heart: a classic heart curve laid on the surface.
    const x = (dLon(lon, HEART_LON) * Math.cos(lat * DEG)) / HEART_S;
    const y = (lat - HEART_LAT) / HEART_S + 0.15;
    const q = x * x + y * y - 1;
    const h = q * q * q - x * x * y * y * y;
    const wob = (noise3(v[0] * 9, v[1] * 9, v[2] * 9, 7) - 0.5) * 0.12;
    if (h < wob) {
      if (x < 0.05) {
        // Sputnik Planitia: convection cells outlined by faint troughs.
        const c = noise3(v[0] * 30, v[1] * 30, v[2] * 30, 21);
        d = Math.abs(c - 0.5) < 0.05 ? CELL : SPUTNIK;
      } else d = mixDuo(TOMBAUGH, SPUTNIK, smoothstep(0.6, 0.1, x) * 0.4);
    }
    return d;
  }, { part: 0, size: 1.2 });

  S.shellDust(R * 1.01, R * 1.08, S.budget(0.05), HAZE, { part: 2, size: 0.7, pow: 1.8 });
  S.halo(R * 1.6, R * 4.6, DUST, { bright: 0.28 });
  return S.done();
}
