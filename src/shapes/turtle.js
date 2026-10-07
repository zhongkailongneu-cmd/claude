import { Shape, hex, ramp, scale3 } from './util.js';

// Hawksbill sea turtle. Local frame: +x = head, +y = up, +z = right side.
// Colours follow David Gruber's 2015 observation: the shell fluoresced red
// and green, laid over the amber tortoiseshell pattern.

const A = 2.2; // carapace half length
const B = 1.85; // carapace half width
const H = 0.95; // dome height

const SHELL = ['#0fc463', '#2bff7a', '#ffb020', '#ff6a2a', '#ff2f5a'].map(hex);
const SEAM = hex('#ffd84a');
const RIM = hex('#5dffb0');
const SKIN = hex('#1fe6a0');
const SCALE_EDGE = hex('#ffc54f');
const EYE = hex('#fff2b0');
const PLASTRON = hex('#e4ff8c');
const HALO = ['#3dff8e', '#ffbe3a', '#ff4a68', '#7ffcff'].map(hex);

const VERTEBRAL = [[0.62, 0], [0.3, 0], [0, 0], [-0.3, 0], [-0.6, 0]];
const COSTAL = [[0.42, 0.5], [0.12, 0.58], [-0.18, 0.56], [-0.46, 0.45]];
const CENTERS = [...VERTEBRAL, ...COSTAL, ...COSTAL.map(([x, z]) => [x, -z])];

function shellPoint(nx, nz) {
  const taper = nx < 0 ? 1 - 0.3 * Math.pow(-nx, 1.6) : 1 - 0.06 * nx * nx;
  const rho2 = Math.min(1, nx * nx + nz * nz);
  return [nx * A, H * Math.pow(1 - rho2, 0.55) + 0.02, nz * B * taper];
}

// Dominant tone per scute along the SHELL ramp: green, amber or red.
const scuteTone = (k) => [0.12, 0.62, 0.92, 0.3, 0.75, 0.05, 0.55, 0.85][((k * 5) % 8 + 8) % 8];

function nearestTwo(nx, nz) {
  let d1 = 9, d2 = 9, k1 = 0;
  for (let k = 0; k < CENTERS.length; k++) {
    const dx = nx - CENTERS[k][0];
    const dz = (nz - CENTERS[k][1]) * 1.15;
    const d = Math.hypot(dx, dz);
    if (d < d1) { d2 = d1; d1 = d; k1 = k; } else if (d < d2) d2 = d;
  }
  return { d1, d2, k: k1 };
}

export function turtle(N, seed = 21) {
  const S = new Shape(N, seed);
  const r = S.r;

  // Carapace surface: scutes, seams between them and the marginal ring.
  const nShell = S.budget(0.4);
  let made = 0;
  while (made < nShell) {
    const nx = r() * 2 - 1;
    const nz = r() * 2 - 1;
    const rho = Math.hypot(nx, nz);
    if (rho > 1) continue;
    made++;
    const [x, y, z] = shellPoint(nx, nz);
    if (rho > 0.84) {
      const th = Math.atan2(nz, nx) / (Math.PI * 2) * 26;
      const seam = Math.abs(rho - 0.84) < 0.02 || (th - Math.floor(th)) < 0.08;
      const c = seam ? scale3(SEAM, 1.1) : S.vary(ramp(SHELL, scuteTone(Math.floor(th) + 40) + (r() - 0.5) * 0.2), 0.2);
      S.add(x, y, z, c, seam ? 0.9 : 0.75, 0);
      continue;
    }
    const { d1, d2, k } = nearestTwo(nx, nz);
    if (d2 - d1 < 0.045) {
      S.add(x, y + 0.02, z, scale3(SEAM, 1.1), 0.9, 0);
    } else {
      const c0 = CENTERS[k];
      const phi = Math.atan2(nz - c0[1], nx - c0[0]);
      const t = scuteTone(k) + 0.2 * Math.sin(phi * 4 + k * 2.1 + d1 * 11) * (0.4 + d1 * 2.2);
      S.add(x, y, z, S.vary(ramp(SHELL, t + (r() - 0.5) * 0.25), 0.22), 0.7 + r() * 0.3, 0);
    }
  }

  // Outline of the shell, serrated toward the rear as on a real hawksbill.
  const nRim = S.budget(0.05);
  for (let k = 0; k < nRim; k++) {
    const th = r() * Math.PI * 2;
    const nx0 = Math.cos(th);
    const serr = nx0 < 0 ? 1 + 0.035 * Math.abs(Math.sin(th * 13)) * -nx0 : 1;
    const [x, y, z] = shellPoint(nx0 * serr * 0.999, Math.sin(th) * serr * 0.999);
    S.add(x, y - r() * 0.05, z, scale3(RIM, 1.15), 1, 0);
  }

  // Side wall and plastron (underside), dimmer.
  const nSide = S.budget(0.03);
  for (let k = 0; k < nSide; k++) {
    const th = r() * Math.PI * 2;
    const [x, , z] = shellPoint(Math.cos(th) * 0.97, Math.sin(th) * 0.97);
    S.add(x, -0.3 + r() * 0.32, z, scale3(SKIN, 0.55), 0.7, 0);
  }
  const nPlas = S.budget(0.05);
  for (let k = 0; k < nPlas;) {
    const nx = r() * 2 - 1;
    const nz = r() * 2 - 1;
    if (nx * nx + nz * nz > 0.78) continue;
    k++;
    const [x, , z] = shellPoint(nx, nz);
    S.add(x, -0.32 + r() * 0.04, z, scale3(PLASTRON, 0.5), 0.7, 0);
  }

  // Head with hooked "hawk" beak, scale seams and eyes.
  const hc = [A + 0.62, 0.12, 0];
  const headCells = Array.from({ length: 16 }, () => {
    const v = [S.gauss(), S.gauss(), S.gauss()];
    const l = Math.hypot(...v);
    return v.map((q) => q / l);
  });
  const nHead = S.budget(0.065);
  for (let k = 0; k < nHead; k++) {
    let u = [S.gauss(), S.gauss(), S.gauss()];
    const l = Math.hypot(...u);
    u = u.map((q) => q / l);
    const f = 1 - 0.42 * Math.pow(Math.max(u[0], 0), 1.5);
    let y = hc[1] + u[1] * 0.38 * f;
    if (u[0] > 0.55) y -= (u[0] - 0.55) * 0.38;
    let d1 = 9, d2 = 9;
    for (const c of headCells) {
      const d = Math.hypot(u[0] - c[0], u[1] - c[1], u[2] - c[2]);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
    const seam = d2 - d1 < 0.11;
    S.add(hc[0] + u[0] * 0.62, y, hc[2] + u[2] * 0.4 * f, seam ? scale3(SCALE_EDGE, 1.15) : S.vary(SKIN, 0.2), seam ? 1 : 0.85, 3);
  }
  for (const side of [-1, 1]) {
    for (let k = 0; k < S.budget(0.003); k++) {
      const a = r() * Math.PI * 2;
      const rr = Math.sqrt(r()) * 0.09;
      S.add(hc[0] + 0.25 + Math.cos(a) * rr, hc[1] + 0.16 + Math.sin(a) * rr, side * 0.33, scale3(EYE, 1.6), 1.4, 3);
    }
  }

  // Neck.
  const nNeck = S.budget(0.02);
  for (let k = 0; k < nNeck; k++) {
    const t = r();
    const a = r() * Math.PI * 2;
    const rad = 0.36 - t * 0.04;
    const ring = Math.sin(t * 40) > 0.7;
    S.add(A - 0.35 + t * 0.6, 0.06 + Math.sin(a) * rad * 0.85, Math.cos(a) * rad, ring ? scale3(SCALE_EDGE, 0.8) : scale3(SKIN, 0.75), 0.8, 3);
  }

  // Flippers: long swept-back front pair, short rear pair.
  const flipper = (part, side, root, L, cx, cz, width, count) => {
    for (let k = 0; k < count; k++) {
      const d = Math.pow(r(), 0.85);
      const [tx, tz] = [cx(d, 1), cz(d, 1)];
      const tl = Math.hypot(tx, tz) || 1;
      const nx = side > 0 ? tz / tl : -tz / tl;
      const nz = side > 0 ? -tx / tl : tx / tl;
      const W = width(d);
      const edge = r() < 0.22;
      const v = edge ? 0.97 + r() * 0.03 : r();
      const off = -0.65 * W + v * W;
      const x = root[0] + cx(d, 0) + nx * off;
      const z = root[2] + cz(d, 0) + nz * off;
      const y = root[1] - 0.08 * d + (r() - 0.5) * 0.09 * Math.sin(Math.PI * v);
      const fd = d * 10 - Math.floor(d * 10);
      const fv = v * 3 + (Math.floor(d * 10) % 2) * 0.5;
      const seam = fd < 0.1 || fv - Math.floor(fv) < 0.1;
      let c;
      if (edge) c = scale3(RIM, 1.3);
      else if (seam) c = scale3(SCALE_EDGE, 1.05);
      else c = S.vary(ramp(SHELL, 0.1 + d * 0.35 + r() * 0.15), 0.2);
      S.add(x, y, z, c, edge ? 1.05 : 0.85, part, d, side);
    }
  };

  const Lf = 3.0;
  const nFront = S.budget(0.095);
  for (const side of [-1, 1]) {
    flipper(
      1, side, [0.95, -0.05, 1.45 * side], Lf,
      (d, der) => (der ? -Lf * (0.1 + 0.72 * d) : -Lf * (0.1 * d + 0.36 * d * d)),
      (d, der) => side * (der ? Lf * (0.96 - 0.2 * d) : Lf * (0.96 * d - 0.1 * d * d)),
      (d) => 0.62 * Math.sin(Math.PI * Math.pow(d, 0.62)) * (1 - 0.4 * d) + 0.04,
      nFront
    );
  }
  const Lr = 1.35;
  const nRear = S.budget(0.03);
  for (const side of [-1, 1]) {
    flipper(
      2, side, [-1.55, -0.08, 0.95 * side], Lr,
      (d, der) => (der ? -Lr * (0.55 + 0.2 * d) : -Lr * (0.55 * d + 0.1 * d * d)),
      (d, der) => side * (der ? Lr * 0.8 : Lr * 0.8 * d),
      (d) => 0.45 * Math.sin(Math.PI * Math.pow(d, 0.75)) * (1 - 0.3 * d) + 0.03,
      nRear
    );
  }

  // Tail.
  for (let k = 0; k < S.budget(0.004); k++) {
    const t = r();
    const a = r() * Math.PI * 2;
    const rad = 0.16 * (1 - t);
    S.add(-2.2 - t * 0.55, -0.06 + Math.sin(a) * rad, Math.cos(a) * rad, scale3(SKIN, 0.8), 0.8, 0);
  }

  S.halo(6.5, HALO, { flat: 0.6, bright: 0.5 });
  return S.done();
}
