import { Shape, hex, ramp, scale3 } from './util.js';

// Deep-sea anglerfish (female black seadevil): round body, huge gaping mouth
// with needle teeth, and a fishing-rod illicium ending in a glowing esca.
// Local frame: +x = mouth, +y = up, +z = right side.
// anim: x = part (0 body, 1 lower jaw + lower teeth, 2 upper teeth,
//       4 illicium, 5 esca, 6 fins), y = distance along (rod / fin ray).

const RX = 2.1;
const RY = 1.8;
const RZ = 1.45;
const UPPER = 0.3; // mouth opening, as angles in the x-y plane
const LOWER = -0.62;
const WIDTH = 0.78;

const BODY = ['#6f3dff', '#8f4dff', '#c13cff'].map(hex);
const SPECK = hex('#ff3d6e');
const LIP = hex('#ff4f8b');
const TOOTH = hex('#eafcff');
const INSIDE = hex('#5a2bd6');
const ROD = hex('#ffa6d9');
const ESCA = ['#fffbd8', '#f4ff7a', '#b8ff3a'].map(hex);
const FIN = hex('#ff3c7a');
const FIN_RAY = hex('#ff9cc0');
const NEURO = hex('#49e7ff');
const HALO = ['#8f4dff', '#ff3d6e', '#e9ff4a', '#49e7ff'].map(hex);

const P = [[0.55, 1.74, 0], [1.4, 3.15, 0], [2.85, 3.05, 0], [3.3, 1.9, 0]];
const bez = (t) => {
  const m = 1 - t;
  const w = [m * m * m, 3 * m * m * t, 3 * m * t * t, t * t * t];
  return [0, 1, 2].map((k) => w[0] * P[0][k] + w[1] * P[1][k] + w[2] * P[2][k] + w[3] * P[3][k]);
};

function dir(S) {
  const g = [S.gauss(), S.gauss(), S.gauss()];
  const l = Math.hypot(...g) || 1;
  return g.map((v) => v / l);
}

const inMouth = (u) => {
  if (u[0] < 0.15 || Math.abs(u[2]) > WIDTH) return false;
  const a = Math.atan2(u[1], u[0]);
  return a > LOWER && a < UPPER;
};

// Point on the jaw rim at lateral position uz; lower rim juts forward.
function rim(alpha, uz, jut) {
  const c = Math.sqrt(Math.max(0, 1 - uz * uz));
  return [Math.cos(alpha) * c * RX * jut, Math.sin(alpha) * c * RY * jut, uz * RZ];
}

export function anglerfish(N, seed = 71) {
  const S = new Shape(N, seed);
  const r = S.r;

  // Body: violet skin with crimson speckles, mouth region cut away.
  const nBody = S.budget(0.44);
  for (let k = 0; k < nBody;) {
    const u = dir(S);
    if (inMouth(u)) continue;
    k++;
    const speck = Math.sin(u[0] * 23 + u[2] * 17) * Math.sin(u[1] * 19 - u[2] * 11) > 0.72;
    const c = speck ? scale3(SPECK, 1.2) : S.vary(ramp(BODY, 0.5 + u[1] * 0.4 + (r() - 0.5) * 0.3), 0.2);
    S.add(u[0] * RX, u[1] * RY, u[2] * RZ, c, 0.85, 0, 0, 0);
  }

  // Lateral-line sense organs: rows of tiny lights along the flanks.
  for (let k = 0; k < S.budget(0.007); k++) {
    const row = Math.floor(r() * 3);
    const side = r() < 0.5 ? -1 : 1;
    const t = r();
    const a = 2.4 - t * 2.0;
    const el = -0.15 + row * 0.35;
    const u = [Math.cos(a) * Math.cos(el) * 0.55, Math.sin(el) * 0.8, side * 0.82];
    const l = Math.hypot(...u);
    const jx = (r() - 0.5) * 0.04;
    S.add((u[0] / l) * RX + jx, (u[1] / l) * RY + jx, (u[2] / l) * RZ, scale3(NEURO, 1.1), 0.8, 0, 0, 0);
  }

  // Jaw rims (lips).
  const nRim = S.budget(0.03);
  for (let k = 0; k < nRim; k++) {
    const uz = (r() * 2 - 1) * WIDTH;
    const upper = r() < 0.5;
    const [x, y, z] = upper ? rim(UPPER, uz, 1.0) : rim(LOWER, uz, 1.1);
    S.add(x, y, z, scale3(LIP, 1.1), 0.9, upper ? 0 : 1, 0, 0);
  }

  // Inside of the mouth: a dim recessed wall.
  for (let k = 0; k < S.budget(0.04);) {
    const u = dir(S);
    if (!inMouth(u)) continue;
    k++;
    S.add(u[0] * RX * 0.58, u[1] * RY * 0.62, u[2] * RZ * 0.8, scale3(INSIDE, 0.6), 0.8, 0, 0, 0);
  }

  // Needle teeth, longest at the front of each jaw.
  const teeth = (count, upper) => {
    const n = 15;
    for (let k = 0; k < count; k++) {
      const i = Math.floor(r() * n);
      const uz = (i / (n - 1) * 2 - 1) * WIDTH * 0.95;
      const root = upper ? rim(UPPER, uz, 1.0) : rim(LOWER, uz, 1.1);
      const len = (0.32 + 0.5 * (1 - Math.abs(uz) / WIDTH)) * (0.75 + ((i * 7) % 5) * 0.08);
      const t = r();
      const dy = upper ? -1 : 1;
      const x = root[0] - t * len * 0.35 - t * t * 0.12;
      const y = root[1] + dy * t * len;
      const z = root[2] - uz * t * 0.25;
      S.add(x, y, z, scale3(TOOTH, 1.2 - t * 0.3), 0.75 + (1 - t) * 0.2, upper ? 2 : 1, 0, 0);
    }
  };
  teeth(S.budget(0.045), true);
  teeth(S.budget(0.04), false);

  // Small eye.
  for (const side of [-1, 1]) {
    for (let k = 0; k < S.budget(0.003); k++) {
      const a = r() * Math.PI * 2;
      const rr = Math.sqrt(r()) * 0.09;
      S.add(1.2 + Math.cos(a) * rr, 1.05 + Math.sin(a) * rr, side * 1.02, scale3(TOOTH, 1.7), 1.2, 0, 0, 0);
    }
  }

  // Illicium (the "fishing rod") and the esca packed with glowing bacteria.
  for (let k = 0; k < S.budget(0.035); k++) {
    const t = r();
    const [x, y, z] = bez(t);
    S.add(x + (r() - 0.5) * 0.04, y + (r() - 0.5) * 0.04, z + (r() - 0.5) * 0.04, scale3(ROD, 1.1), 0.8, 4, t, 0);
  }
  const nEsca = S.budget(0.06);
  for (let k = 0; k < nEsca; k++) {
    const u = dir(S);
    const filament = r() < 0.15;
    const rr = filament ? 0.32 + r() * 0.45 : 0.32 * Math.cbrt(r());
    const [cx, cy, cz] = P[3];
    const c = filament ? scale3(ESCA[2], 1.0) : scale3(ramp(ESCA, rr / 0.32), 1.45 - rr);
    S.add(cx + u[0] * rr, cy + u[1] * rr - (filament ? 0.2 : 0), cz + u[2] * rr, c, filament ? 0.75 : 1.15, 5, 1, 0);
  }

  // Fins: fans of rays with a faint membrane between them.
  const fan = (count, base, a0, a1, len, side, phase) => {
    for (let k = 0; k < count; k++) {
      const ray = r() < 0.45;
      const a = ray ? a0 + (a1 - a0) * (Math.floor(r() * 9) / 8) : a0 + (a1 - a0) * r();
      const t = Math.sqrt(r());
      const x = base[0] + Math.cos(a) * len * t;
      const y = base[1] + Math.sin(a) * len * t;
      const z = base[2] + side * t * 0.18;
      S.add(x, y, z, ray ? scale3(FIN_RAY, 1.2) : S.vary(FIN, 0.25), ray ? 0.9 : 0.75, 6, t, phase);
    }
  };
  for (const side of [-1, 1]) fan(S.budget(0.035), [-0.25, -0.3, side * 1.38], Math.PI * 0.8, Math.PI * 1.15, 1.0, side, side);
  fan(S.budget(0.02), [-1.45, 1.15, 0], Math.PI * 0.55, Math.PI * 0.85, 0.8, 0, 2);
  fan(S.budget(0.02), [-1.4, -1.15, 0], Math.PI * 1.15, Math.PI * 1.45, 0.75, 0, 3);
  fan(S.budget(0.055), [-2.05, 0, 0], Math.PI * 0.8, Math.PI * 1.2, 1.35, 0, 4);

  S.halo(7, HALO, { flat: 0.6, bright: 0.5 });
  return S.done();
}
