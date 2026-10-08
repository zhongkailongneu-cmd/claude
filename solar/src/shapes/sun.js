import { Shape, duo, vec, scaleDuo, mixDuo, rampDuo, fbm, noise3, angDeg, clamp, smoothstep, F } from './util.js';

// The Sun: a granulated photosphere with sunspot groups and bright faculae,
// a thin red chromosphere at the limb, looping prominences, a streaming
// corona and the occasional eruption. Multi colours follow a white-light /
// H-alpha view (white-gold disc, pink-red prominences, pearly corona); mono
// keeps everything in amber and flame.
//
// Parts: 0 photosphere · 1 chromosphere · 2 prominences (a.y arc u, a.z arc id)
// 3 corona (a.y radial phase) · 4 eruptions (a.y speed, a.z burst id) · 15 dust.

export const SUN_R = 3;

const GRANULE = duo('#FFE6A8', F.light);
const BRIGHT = duo('#FFC35C', F.amber);
const LANE = duo('#E8751E', F.red);
const LIMB = duo('#FF7A1C', F.orange);
const PENUMBRA = duo('#B4561C', F.deep);
const UMBRA = duo('#4A1A08', F.ember);
const FACULA = duo('#FFFBEA', F.white);
const CHROMO = duo('#FF4D5E', F.red);
const PROM = [duo('#FF5C7A', F.orange), duo('#FF8A8F', F.amber), duo('#FF3D55', F.red)];
const CORONA = [duo('#FFF4DE', F.light), duo('#FFE2B0', F.amber), duo('#F7D7FF', F.light), duo('#FFD08A', F.orange)];
const DUST = [duo('#FFD9A0', F.amber), duo('#FFB870', F.orange), duo('#FFF0D0', F.light)];

// Sunspot groups: [lat, lon, size°]. They sit in the two activity belts.
const SPOTS = [[14, -28, 5.2], [17, -18, 3.2], [11, -36, 2.6], [-18, 12, 4.6], [-15, 21, 2.8], [22, 40, 3.8], [-10, -62, 3.6], [-13, -54, 2.2], [8, 75, 3.2], [-24, 110, 4.2], [20, 160, 4], [-16, -130, 3.6]].map(([la, lo, s]) => ({ v: vec(la, lo), s }));

export function sun(N, seed = 3) {
  const S = new Shape(N, seed);
  const r = S.r;
  const R = SUN_R;

  // Photosphere.
  S.sphere(R, S.budget(0.56), (lat, lon, v) => {
    // Granulation: cell-like noise (bright centres, darker lanes).
    const g = noise3(v[0] * 26, v[1] * 26, v[2] * 26, 9);
    const g2 = fbm(v[0] * 7, v[1] * 7, v[2] * 7, 3, 4);
    let d = rampDuo([LANE, BRIGHT, GRANULE], clamp(g * 1.1 + g2 * 0.6 - 0.35, 0, 1));
    // Faculae: bright patches around the spot belts.
    const fac = smoothstep(0.62, 0.78, fbm(v[0] * 4, v[1] * 4, v[2] * 4, 3, 13)) * smoothstep(40, 10, Math.abs(Math.abs(lat) - 16));
    d = mixDuo(d, FACULA, fac * 0.8);
    let size = 1;
    for (const sp of SPOTS) {
      const a = angDeg(v, sp.v);
      if (a < sp.s * 2.4) {
        const u = a / sp.s;
        d = u < 1 ? UMBRA : mixDuo(PENUMBRA, d, smoothstep(1.4, 2.4, u));
        size = u < 1 ? 0.8 : 0.95;
      }
    }
    return [d, size];
  }, { part: 0, size: 1.2, shell: 0.01 });

  // Chromosphere: a thin pink-red rim, visible only at the limb.
  S.sphere(R * 1.015, S.budget(0.07), () => S.vary(CHROMO, 0.25), { part: 1, size: 0.75, shell: 0.03 });

  // Prominences: arcs that stand off the limb, with plasma flowing along them.
  const nProm = S.budget(0.08);
  const ARCS = [
    { lat: 32, lon: -92, span: 18, h: 0.42, tw: 0.3 },
    { lat: -20, lon: -88, span: 26, h: 0.62, tw: -0.4 },
    { lat: 58, lon: 95, span: 14, h: 0.35, tw: 0.2 },
    { lat: -46, lon: 92, span: 22, h: 0.5, tw: 0.5 },
    { lat: 6, lon: 90, span: 12, h: 0.3, tw: 0.1 },
  ];
  for (let k = 0; k < nProm; k++) {
    const id = Math.floor(r() * ARCS.length);
    const A = ARCS[id];
    const u = r();
    // Foot points A and B along a great circle around the limb.
    const lo0 = A.lon + (u - 0.5) * A.span * Math.sin(A.tw) * 0.6;
    const la0 = A.lat + (u - 0.5) * A.span;
    const v = vec(la0, lo0);
    const hgt = Math.sin(Math.PI * u) * A.h * R;
    const spread = 0.04 + Math.sin(Math.PI * u) * 0.07;
    const rr = R * 1.01 + hgt;
    const d = S.vary(S.pick(PROM), 0.3);
    S.add(v[0] * rr + S.gauss() * spread, v[1] * rr + S.gauss() * spread, v[2] * rr + S.gauss() * spread, d, 0.7 + r() * 0.5, 2, u, id);
  }

  // Corona: streamers concentrated toward the equator, thin plumes at the poles.
  const nCorona = S.budget(0.2);
  for (let k = 0; k < nCorona; k++) {
    let lat;
    if (r() < 0.7) lat = S.gauss() * 18 + (r() < 0.5 ? 12 : -12);
    else lat = (r() * 2 - 1) * 90;
    const lon = r() * 360;
    const v = vec(clamp(lat, -89, 89), lon);
    // Stream lines: clumped longitudes make visible rays.
    const ray = noise3(v[0] * 5, v[1] * 2, v[2] * 5, 31);
    const d = scaleDuo(S.pick(CORONA), 0.35 + ray * 0.5);
    S.add(v[0], v[1], v[2], d, 0.6 + r() * 0.6, 3, r(), ray);
  }

  // Eruptions: bursts of plasma that leave the surface every few seconds.
  const nErupt = S.budget(0.04);
  for (let k = 0; k < nErupt; k++) {
    const id = Math.floor(r() * 4);
    const d = S.vary(id % 2 ? PROM[0] : CORONA[1], 0.3);
    S.add(S.gauss() * 0.18, S.gauss() * 0.18, S.gauss() * 0.18, d, 0.7 + r() * 0.6, 4, 0.5 + r(), id);
  }

  S.halo(R * 1.6, R * 4.2, DUST, { bright: 0.35 });
  return S.done();
}

