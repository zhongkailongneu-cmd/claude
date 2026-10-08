import { Shape, duo, vec, dot3, mixDuo, scaleDuo, fbm, noise3, smoothstep, clamp, L, DEG } from './util.js';
import { LAND_B64, LAND_W, LAND_H } from './landmask.js';

// Earth and its Moon. Continents come from a real 1° land mask; vegetation,
// deserts and ice are painted by region; clouds sit on their own slightly
// faster layer; a blue atmosphere glows at the limb; city lights appear only
// on the night side. The Moon orbits Earth, tidally locked, with its maria
// and the bright rays of Tycho and Copernicus on the side facing Earth.
//
// Parts: 0 surface · 1 clouds · 2 atmosphere · 3 city lights · 5 Moon (a.y
// orbit radius, a.z inclination) · 15 dust.

export const EARTH_R = 2.5;
export const MOON_R = EARTH_R * 0.273;
export const MOON_D = 4.3;
const MOON_INC = 5.1 * DEG;

let landBits = null;
function land(lat, lon) {
  if (!landBits) {
    const bin = atob(LAND_B64);
    landBits = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) landBits[i] = bin.charCodeAt(i);
  }
  const row = clamp(Math.floor(90 - lat), 0, LAND_H - 1);
  const col = ((Math.floor(lon + 180) % LAND_W) + LAND_W) % LAND_W;
  const i = row * LAND_W + col;
  return (landBits[i >> 3] >> (7 - (i & 7))) & 1;
}

const inBox = (lat, lon, la0, la1, lo0, lo1) => lat >= la0 && lat <= la1 && lon >= lo0 && lon <= lo1;

const OCEAN_DEEP = duo('#0E3474', L[80]);
const OCEAN = duo('#164C9A', L[70]);
const SHALLOW = duo('#2A86C8', L[60]);
const FOREST = duo('#2F7433', L[30]);
const GREEN = duo('#5E9440', L[30]);
const SAVANNA = duo('#A89C5C', L[20]);
const DESERT = duo('#D9B57C', L[20]);
const RED_DESERT = duo('#C98E5A', L[20]);
const TUNDRA = duo('#A3AE8C', L[30]);
const ICE = duo('#F1F5F9', L[10]);
const CLOUD = duo('#FFFFFF', L[10]);
const AIR = duo('#5EB8FF', L[40]);
const CITY = duo('#FFC66E', '#F4F7FB');

const HIGHLAND = duo('#C4C0B7', L[30]);
const MARE = duo('#6E6C67', L[60]);
const MOON_RAY = duo('#F1EFEA', L[10]);
const DUST = [duo('#9FC4F0', L[40]), duo('#D8E6F7', L[30]), duo('#7A9CD6', L[50])];

function desertness(lat, lon) {
  if (inBox(lat, lon, 15, 33, -17, 35)) return 1; // Sahara
  if (inBox(lat, lon, 13, 32, 35, 60)) return 1; // Arabia
  if (inBox(lat, lon, 25, 38, 55, 72)) return 0.8; // Iran, Thar edge
  if (inBox(lat, lon, 36, 47, 75, 112)) return 0.85; // Taklamakan, Gobi
  if (inBox(lat, lon, -31, -18, 117, 142)) return 1; // Australian interior
  if (inBox(lat, lon, -28, -18, 14, 25)) return 0.8; // Kalahari, Namib
  if (inBox(lat, lon, 25, 38, -118, -103)) return 0.7; // US Southwest, Mexico
  if (inBox(lat, lon, -30, -15, -72, -66)) return 0.8; // Atacama
  if (inBox(lat, lon, -50, -38, -72, -64)) return 0.5; // Patagonia
  return 0;
}

function isIce(lat, lon) {
  if (lat < -62) return true;
  if (lat > 59 && lon > -74 && lon < -12) return true; // Greenland
  return lat > 75;
}

function cityWeight(lat, lon) {
  if (inBox(lat, lon, 20, 42, 100, 123)) return 1; // eastern China
  if (inBox(lat, lon, 31, 44, 126, 142)) return 1; // Korea, Japan
  if (inBox(lat, lon, 8, 32, 68, 90)) return 0.9; // India
  if (inBox(lat, lon, 36, 59, -10, 30)) return 0.9; // Europe
  if (inBox(lat, lon, 25, 47, -98, -70)) return 0.85; // eastern US
  if (inBox(lat, lon, 32, 48, -124, -115)) return 0.7; // US west coast
  if (inBox(lat, lon, 24, 38, 30, 56)) return 0.55; // Nile, Gulf
  if (inBox(lat, lon, -30, -5, -50, -34)) return 0.6; // Brazil coast
  if (inBox(lat, lon, 4, 13, 2, 9)) return 0.5; // Nigeria
  if (inBox(lat, lon, 14, 30, -105, -89)) return 0.6; // Mexico
  if (inBox(lat, lon, -8, 2, 104, 116)) return 0.6; // Java
  if (inBox(lat, lon, 44, 60, 30, 90)) return 0.35; // Russia
  return isIce(lat, lon) ? 0 : 0.06;
}

// Maria on the Moon's near side: [lat, lon, radius°].
const MARIA = [
  [33, -16, 11], [28, 17, 8], [8, 31, 9], [17, 59, 5.5], [-8, 51, 6.5], [-15, 34, 4], [-21, -17, 8],
  [-24, -39, 4], [18, -57, 17], [2, -42, 12], [-5, -25, 6], [56, -15, 4.5], [56, 8, 4.5], [57, 32, 3.5], [13, 4, 3.5],
].map(([la, lo, rad]) => ({ c: vec(la, lo), cos: Math.cos(rad * 1.25 * DEG), rad }));
const RAYED = [[-43, -11, 2.2, 32], [10, -20, 2, 12], [8, -38, 1.3, 8]].map(([la, lo, rad, reach]) => ({ c: vec(la, lo), rad, reach }));

export function earth(N, seed = 41) {
  const S = new Shape(N, seed);
  const r = S.r;
  const R = EARTH_R;

  // Surface.
  S.sphere(R, S.budget(0.6), (lat, lon, v) => {
    if (!land(lat, lon)) {
      const near = land(lat + 1, lon) | land(lat - 1, lon) | land(lat, lon + 1.2) | land(lat, lon - 1.2);
      const deep = fbm(v[0] * 2, v[1] * 2, v[2] * 2, 3, 7);
      return near ? SHALLOW : mixDuo(OCEAN_DEEP, OCEAN, smoothstep(0.3, 0.7, deep));
    }
    if (isIce(lat, lon)) return ICE;
    const n = fbm(v[0] * 6, v[1] * 6, v[2] * 6, 3, 11);
    const des = desertness(lat, lon) * smoothstep(0.25, 0.55, n + 0.2);
    if (des > 0.4) return mixDuo(DESERT, RED_DESERT, n);
    const a = Math.abs(lat);
    if (a > 58) return mixDuo(TUNDRA, ICE, smoothstep(66, 74, a) * 0.6);
    const tropic = smoothstep(28, 8, a);
    let d = mixDuo(GREEN, FOREST, tropic * 0.8 + (n - 0.5) * 0.6);
    if (a > 10 && a < 30) d = mixDuo(d, SAVANNA, smoothstep(0.5, 0.75, n) * 0.7);
    return d;
  }, { part: 0, size: 1.15 });

  // City lights (night side only).
  const nCity = S.budget(0.04);
  for (let k = 0, guard = 0; k < nCity && guard < nCity * 60; guard++) {
    const lat = Math.asin(r() * 2 - 1) / DEG;
    const lon = r() * 360 - 180;
    if (!land(lat, lon)) continue;
    const v = vec(lat, lon);
    const w = cityWeight(lat, lon) * smoothstep(0.35, 0.7, noise3(v[0] * 14, v[1] * 14, v[2] * 14, 5));
    if (r() > w) continue;
    const rr = R * 1.004;
    S.add(v[0] * rr, v[1] * rr, v[2] * rr, scaleDuo(CITY, 0.8 + r() * 0.6), 0.5 + r() * 0.35, 3);
    k++;
  }

  // Clouds: storm tracks and the tropical convergence zone, thinner in the subtropics.
  const nCloud = S.budget(0.09);
  for (let k = 0, guard = 0; k < nCloud && guard < nCloud * 40; guard++) {
    const lat = Math.asin(r() * 2 - 1) / DEG;
    const lon = r() * 360 - 180;
    const v = vec(lat, lon);
    const a = Math.abs(lat);
    const belt = 0.45 + 0.35 * Math.exp(-((lat - 5) ** 2) / 60) + 0.35 * Math.exp(-((a - 52) ** 2) / 200) - 0.2 * Math.exp(-((a - 24) ** 2) / 60);
    const swirl = fbm(v[0] * 3.2 + Math.sin(lat * 0.09) * 0.8, v[1] * 3.2, v[2] * 3.2, 5, 19);
    const cov = smoothstep(0.56, 0.7, swirl * belt * 1.25);
    if (r() > cov) continue;
    const rr = R * (1.014 + r() * 0.01);
    S.add(v[0] * rr, v[1] * rr, v[2] * rr, scaleDuo(CLOUD, 0.3 + cov * 0.3), 0.9 + r() * 0.4, 1);
    k++;
  }

  // Atmosphere.
  S.shellDust(R * 1.02, R * 1.09, S.budget(0.05), AIR, { part: 2, size: 0.75, pow: 1.6 });

  // The Moon (local coordinates around its own centre; the shader moves it).
  S.sphere(MOON_R, S.budget(0.085), (lat, lon, v) => {
    const n = fbm(v[0] * 5, v[1] * 5, v[2] * 5, 4, 23);
    let d = scaleDuo(HIGHLAND, 0.85 + n * 0.3);
    for (const m of MARIA) {
      const cd = dot3(v, m.c);
      if (cd > m.cos) {
        const a = Math.acos(Math.min(1, cd)) / DEG / m.rad;
        d = mixDuo(d, MARE, smoothstep(1.25, 0.85, a + (n - 0.5) * 0.5));
      }
    }
    for (const k of RAYED) {
      const a = Math.acos(clamp(dot3(v, k.c), -1, 1)) / DEG;
      if (a > k.reach) continue;
      const cd = dot3(v, k.c);
      const t = [v[0] - k.c[0] * cd, v[1] - k.c[1] * cd, v[2] - k.c[2] * cd];
      const tl = Math.hypot(t[0], t[1], t[2]) || 1;
      const ray = noise3((t[0] / tl) * 6, (t[1] / tl) * 6, (t[2] / tl) * 6, 44);
      const f = a < k.rad ? 0.9 : smoothstep(0.62, 0.8, ray) * (1 - a / k.reach);
      d = mixDuo(d, MOON_RAY, f);
    }
    if (r() < 0.01) d = scaleDuo(d, 0.7); // small craters
    return d;
  }, { part: 5, size: 0.72, a1: MOON_D, a2: MOON_INC });

  S.halo(R * 1.6, R * 4, DUST, { bright: 0.3, flat: 0.7 });
  return S.done();
}
