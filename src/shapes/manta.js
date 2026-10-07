import { Shape, hex, ramp, scale3, clamp } from './util.js';

// Reef manta ray, coloured after "Inspector Clouseau", the pink manta of
// Lady Elliot Island. Local frame: +x = forward, +z = right wing, +y = up.
// anim: x = part (0 wing surface, 1 cephalic fin, 2 tail, 3 head details),
//       y = span fraction |z|/S (drives the flap), z = side.

const S_SPAN = 4.4;
const PINK = ['#ff2f9a', '#ff4fb4', '#ff7ccb', '#ffa8de'].map(hex);
const MAGENTA = hex('#d63dff');
const BELLY = hex('#ff3d95');
const EDGE = hex('#ffd2ee');
const PATCH = hex('#ffc4e6');
const HALO = ['#ff4fb4', '#ff9ad8', '#d63dff', '#ffd2ee', '#7ffcff'].map(hex);

const sweep = (s) => 0.9 * s * s * s;
const lead = (s) => 1.05 - 1.75 * Math.pow(s, 1.35) - sweep(s);
const trail = (s) => -1.75 + 1.05 * Math.pow(s, 0.9) - sweep(s);

function thickness(x, s) {
  const le = lead(s);
  const te = trail(s);
  const mid = (le + te) / 2;
  const half = Math.max(1e-3, (le - te) / 2);
  const q = clamp(1 - Math.pow((x - mid) / half, 2), 0, 1);
  return 0.4 * Math.pow(1 - s, 2.2) * Math.sqrt(q) + 0.02;
}

export function manta(N, seed = 31) {
  const S = new Shape(N, seed);
  const r = S.r;

  const wingColor = (x, s, side, top) => {
    if (!top) return S.vary(BELLY, 0.2);
    // Pale shoulder patches on the upper surface, like the reef manta's markings.
    const patch = x > -0.3 && x < 0.75 && s > 0.12 && s < 0.5 && Math.sin(s * 9 + x * 3) > 0.15;
    if (patch) return S.vary(PATCH, 0.12);
    const vein = Math.abs(Math.sin(s * 22 - x * 2)) < 0.08;
    if (vein) return scale3(MAGENTA, 1.1);
    return S.vary(ramp(PINK, 0.15 + s * 0.75 + (r() - 0.5) * 0.2), 0.15);
  };

  const surface = (count, top) => {
    for (let k = 0; k < count;) {
      const s = Math.pow(r(), 0.85);
      const le = lead(s);
      const te = trail(s);
      // Area-weighted: wider chords near the body get more points.
      if (r() > (le - te) / 2.8) continue;
      k++;
      const x = te + r() * (le - te);
      const side = r() < 0.5 ? -1 : 1;
      const T = thickness(x, s);
      const y = top ? T * 0.9 : -T * 0.6;
      S.add(x, y, side * s * S_SPAN, wingColor(x, s, side, top), top ? 0.9 : 0.75, 0, s, side);
    }
  };
  surface(S.budget(0.44), true);
  surface(S.budget(0.14), false);

  // Bright leading edge and finer trailing edge make the diamond readable.
  const edges = (count, fn, col, size) => {
    for (let k = 0; k < count; k++) {
      const s = r();
      const side = r() < 0.5 ? -1 : 1;
      S.add(fn(s), (r() - 0.5) * 0.04, side * s * S_SPAN, col, size, 0, s, side);
    }
  };
  edges(S.budget(0.08), lead, scale3(EDGE, 1.3), 1.05);
  edges(S.budget(0.04), trail, scale3(PINK[2], 1.1), 0.9);

  // Cephalic fins: the two horn-like lobes either side of the mouth.
  const nCeph = S.budget(0.065);
  for (let k = 0; k < nCeph; k++) {
    const side = r() < 0.5 ? -1 : 1;
    const d = r();
    const a = r() * Math.PI * 2;
    const w = 0.13 * (1 - d * 0.35);
    const x = 1.0 + d * 0.85;
    const y = -0.05 - 0.28 * d * d + Math.sin(a) * w * 0.55;
    const z = side * (0.56 - 0.14 * d * d + Math.cos(a) * w);
    S.add(x, y, z, d > 0.85 ? scale3(EDGE, 1.2) : S.vary(PINK[1], 0.15), 0.95, 1, d, side);
  }

  // Wide mouth between the cephalic fins, and eyes on the sides of the head.
  for (let k = 0; k < S.budget(0.02); k++) {
    S.add(1.06 + r() * 0.03, -0.06 + (r() - 0.5) * 0.04, (r() - 0.5) * 0.92, scale3(EDGE, 1.35), 1, 3, 0, 0);
  }
  for (const side of [-1, 1]) {
    for (let k = 0; k < S.budget(0.004); k++) {
      const a = r() * Math.PI * 2;
      const rr = Math.sqrt(r()) * 0.07;
      S.add(0.85 + Math.cos(a) * rr, 0.06 + Math.sin(a) * rr, side * 0.66, scale3(hex('#fff0fa'), 1.7), 1.3, 3, 0.15, side);
    }
  }

  // Gill slits on the underside.
  for (let k = 0; k < S.budget(0.02); k++) {
    const side = r() < 0.5 ? -1 : 1;
    const g = Math.floor(r() * 5);
    const t = r();
    S.add(0.55 - g * 0.13, -0.3, side * (0.32 + t * 0.26), scale3(MAGENTA, 1.2), 0.8, 0, 0.08, side);
  }

  // Whip-like tail with a small dorsal fin at its base.
  const nTail = S.budget(0.035);
  for (let k = 0; k < nTail; k++) {
    const t = r();
    const rad = 0.07 * (1 - t) + 0.01;
    const a = r() * Math.PI * 2;
    const x = -1.6 - t * 3.2;
    S.add(x, 0.04 + t * 0.25 + Math.sin(a) * rad, Math.cos(a) * rad, S.vary(ramp(PINK, 0.4 + t * 0.5), 0.15), 0.8, 2, 0, 0);
  }
  for (let k = 0; k < S.budget(0.006); k++) {
    const t = r();
    const h = (1 - t) * 0.32 * r();
    S.add(-1.45 - t * 0.45, 0.1 + h, 0, scale3(PINK[2], 1.05), 0.85, 2, 0, 0);
  }

  S.halo(7, HALO, { flat: 0.45, bright: 0.5 });
  return S.done();
}
