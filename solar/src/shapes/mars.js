import { Shape, duo, vec, dot3, mixDuo, rampDuo, fbm, dLon, smoothstep, clamp, L, DEG } from './util.js';

// Mars: iron-oxide dust with the classic dark albedo features (Syrtis Major,
// Acidalia, Mare Erythraeum…), the scar of Valles Marineris, the Tharsis
// volcanoes with Olympus Mons, bright dusty Hellas, both polar caps and a thin
// salmon-coloured haze at the limb.

export const MARS_R = 2.3;

const BRIGHT = duo('#E4905E', L[40]);
const BASE = duo('#CA673C', L[40]);
const RUST = duo('#AE4A28', L[50]);
const DARK = duo('#6C3524', L[60]);
const DARKER = duo('#522A1E', L[70]);
const HELLAS = duo('#F0BC92', L[30]);
const CAP = duo('#F5F0E8', L[10]);
const HAZE = duo('#F3A57E', L[50]);
const DUST = [duo('#E7A57E', L[50]), duo('#C9805A', L[60]), duo('#F2D2B8', L[40])];

// Dark regions: [lat, lon, radius°, strength].
const DARKS = [
  [9, 70, 13, 1], [45, -30, 15, 0.9], [-25, -40, 20, 0.85], [-4, 0, 9, 0.8], [-22, 140, 20, 0.8],
  [-14, 105, 15, 0.75], [46, 110, 15, 0.55], [-27, -88, 7, 0.7], [-50, 20, 14, 0.55], [20, 160, 12, 0.5],
].map(([la, lo, rad, k]) => ({ c: vec(la, lo), cos: Math.cos(rad * 1.6 * DEG), rad, k }));
const VOLCANOES = [[18.6, -134, 5.5], [-9, -121, 2.2], [1, -113, 2], [12, -104, 2]].map(([la, lo, rad]) => ({ c: vec(la, lo), rad }));
const HELLAS_C = vec(-42, 70);
const ARGYRE_C = vec(-50, -43);

export function mars(N, seed = 51) {
  const S = new Shape(N, seed);

  S.sphere(MARS_R, S.budget(0.8), (lat, lon, v) => {
    const n = fbm(v[0] * 3.5, v[1] * 3.5, v[2] * 3.5, 4, 3);
    const fine = fbm(v[0] * 11, v[1] * 11, v[2] * 11, 2, 9);
    let d = rampDuo([RUST, BASE, BRIGHT], clamp(n * 1.4 - 0.2 + (fine - 0.5) * 0.3, 0, 1));
    let dark = 0;
    for (const k of DARKS) {
      const cd = dot3(v, k.c);
      if (cd < k.cos) continue;
      const a = Math.acos(Math.min(1, cd)) / DEG / k.rad;
      dark = Math.max(dark, k.k * smoothstep(1.5, 0.5, a + (n - 0.5) * 0.9));
    }
    d = mixDuo(d, dark > 0.7 ? DARKER : DARK, clamp(dark, 0, 1));
    // Valles Marineris: a sinuous dark canyon east of Tharsis.
    const dl = dLon(lon, -72);
    if (Math.abs(dl) < 35) {
      const ctr = -8 + Math.sin(dl * 0.12) * 1.6;
      const w = 1.1 + (1 - Math.abs(dl) / 35) * 1.3;
      d = mixDuo(d, DARKER, smoothstep(w, w * 0.35, Math.abs(lat - ctr)) * 0.9);
    }
    for (const k of VOLCANOES) {
      const a = Math.acos(clamp(dot3(v, k.c), -1, 1)) / DEG / k.rad;
      if (a < 1.25) d = a < 0.25 ? mixDuo(d, BRIGHT, 0.6) : mixDuo(d, DARK, smoothstep(0.4, 0.95, a) * smoothstep(1.25, 1.0, a) * 0.8);
    }
    const h = Math.acos(clamp(dot3(v, HELLAS_C), -1, 1)) / DEG;
    d = mixDuo(d, HELLAS, smoothstep(17, 9, h) * 0.85);
    const ag = Math.acos(clamp(dot3(v, ARGYRE_C), -1, 1)) / DEG;
    d = mixDuo(d, HELLAS, smoothstep(9, 5, ag) * 0.6);
    // Polar caps with ragged edges.
    const capN = smoothstep(76, 80, lat + (n - 0.5) * 6);
    const capS = smoothstep(79, 83, -lat + (n - 0.5) * 5);
    d = mixDuo(d, CAP, Math.max(capN, capS));
    return d;
  }, { part: 0, size: 1.2 });

  S.shellDust(MARS_R * 1.01, MARS_R * 1.05, S.budget(0.03), HAZE, { part: 2, size: 0.65, pow: 2 });
  S.halo(MARS_R * 1.5, MARS_R * 4.4, DUST, { bright: 0.3 });
  return S.done();
}
