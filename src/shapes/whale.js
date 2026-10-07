import { Shape, hex, ramp, scale3, smoothstep } from './util.js';

// Blue whale. Local frame: +x = snout, +y = back, +z = right flank.
// anim.y = u, the fraction of body length from snout (0) to fluke tips (1);
// the shader bends the body vertically with a wave that grows toward the tail.

const LEN = 12;
const X0 = 6; // snout
const xAt = (u) => X0 - u * LEN;

const BACK = hex('#4f5dff');
const FLANK = hex('#8a8dff');
const BELLY = hex('#a6f2ff');
const MOTTLE = hex('#c9d0ff');
const GROOVE = hex('#bffaff');
const LINE = hex('#e9ecff');
const VIOLET = hex('#a46bff');
const HALO = ['#4f5dff', '#8a8dff', '#a6f2ff', '#a46bff', '#e9ecff'].map(hex);

const U_TAIL = 0.9; // where the tail stock meets the flukes

function radius(u) {
  const head = 1 - Math.exp(-u * 13);
  const taper = u < 0.36 ? 1 : Math.pow(1 - smoothstep(0.36, U_TAIL, u), 0.75) * 0.88 + 0.12 * (1 - smoothstep(0.86, 0.95, u));
  return 0.92 * head * taper + 0.04;
}
// Vertical and horizontal scale of the cross-section: flat broad head,
// tall narrow tail stock.
const vScale = (u) => 0.62 + 0.24 * smoothstep(0, 0.3, u) + 0.35 * smoothstep(0.7, 0.9, u);
const hScale = (u) => 1 - 0.45 * smoothstep(0.65, 0.9, u);
const yCenter = (u) => -0.12 * Math.sin(Math.PI * Math.min(1, u / 0.5));

function surfacePoint(u, phi) {
  const R = radius(u);
  return [xAt(u), yCenter(u) + Math.sin(phi) * R * vScale(u), Math.cos(phi) * R * hScale(u)];
}

export function whale(N, seed = 41) {
  const S = new Shape(N, seed);
  const r = S.r;

  // Body skin: mottled indigo back, periwinkle flanks, pale belly.
  const nBody = S.budget(0.56);
  for (let k = 0; k < nBody;) {
    const u = r() * U_TAIL;
    if (r() > radius(u) / 1.1) continue;
    k++;
    const phi = r() * Math.PI * 2;
    const [x, y, z] = surfacePoint(u, phi);
    const up = Math.sin(phi);
    let c = up > 0 ? ramp([FLANK, BACK, BACK], up) : ramp([FLANK, BELLY], -up);
    const mottle = Math.sin(u * 61 + phi * 7) * Math.sin(u * 37 - phi * 5) > 0.55;
    if (mottle && up > -0.2) c = MOTTLE;
    S.add(x, y, z, S.vary(c, 0.2), 0.85, 0, u, 0);
  }

  // Throat pleats: parallel grooves from chin to navel, the blue whale's signature.
  const nGroove = S.budget(0.1);
  const GROOVES = 34;
  for (let k = 0; k < nGroove; k++) {
    const g = Math.floor(r() * GROOVES);
    const phi = Math.PI * (1.12 + 0.76 * (g / (GROOVES - 1)));
    const u = 0.025 + r() * 0.42;
    const [x, y, z] = surfacePoint(u, phi);
    S.add(x, y - 0.01, z, scale3(GROOVE, 1.2), 0.85, 0, u, 0);
  }

  // Mouth line, splash-guard ridge, blowholes and eye.
  for (let k = 0; k < S.budget(0.022); k++) {
    const t = r();
    const u = 0.004 + t * 0.2;
    const side = r() < 0.5 ? -1 : 1;
    const phi = -0.35 + 0.25 * t * t;
    const [x, y, z] = surfacePoint(u, phi);
    S.add(x, y, z * side, scale3(LINE, 1.35), 1, 0, u, 0);
  }
  for (let k = 0; k < S.budget(0.01); k++) {
    const u = 0.01 + r() * 0.16;
    const [x, y, z] = surfacePoint(u, Math.PI / 2);
    S.add(x, y + 0.02, z, scale3(LINE, 1.1), 0.95, 0, u, 0);
  }
  for (const side of [-1, 1]) {
    for (let k = 0; k < S.budget(0.002); k++) {
      const [x, y, z] = surfacePoint(0.165 + r() * 0.01, Math.PI / 2 + side * 0.08);
      S.add(x, y + 0.03, z, scale3(LINE, 1.6), 1.2, 0, 0.165, 0);
    }
    for (let k = 0; k < S.budget(0.003); k++) {
      const a = r() * Math.PI * 2;
      const rr = Math.sqrt(r()) * 0.07;
      const [x, y, z] = surfacePoint(0.215, -0.12);
      S.add(x + Math.cos(a) * rr, y + Math.sin(a) * rr, z * side, scale3(LINE, 1.8), 1.3, 0, 0.215, 0);
    }
  }

  // Small dorsal fin far back on the body.
  for (let k = 0; k < S.budget(0.012); k++) {
    const t = r();
    const h = r() * 0.38 * (1 - t);
    const u = 0.74 + t * 0.06 + h * 0.08;
    const [x, y] = surfacePoint(u, Math.PI / 2);
    S.add(x, y + h, (r() - 0.5) * 0.05, scale3(FLANK, 0.8), 0.8, 0, u, 0);
  }

  // Long slender pectoral fins.
  const nPec = S.budget(0.035);
  for (const side of [-1, 1]) {
    const root = surfacePoint(0.28, -0.55);
    for (let k = 0; k < nPec; k++) {
      const d = r();
      const w = 0.32 * Math.sin(Math.PI * Math.pow(d, 0.55)) * (1 - 0.5 * d) + 0.03;
      const v = r() - 0.5;
      const x = root[0] - d * 1.6 + v * w * 0.6;
      const y = root[1] - d * 0.55 + v * w * 0.3;
      const z = side * (Math.abs(root[2]) + d * 0.65 + v * w * 0.4);
      const edge = Math.abs(v) > 0.45;
      S.add(x, y, z, edge ? scale3(LINE, 1.15) : S.vary(FLANK, 0.2), 0.85, 1, 0.28, side * d);
    }
  }

  // Flukes: wide, swept, with a central notch.
  const xe = xAt(U_TAIL) + 0.15;
  const fLead = (s) => xe - 0.1 - 0.62 * Math.pow(s, 1.3);
  const fTrail = (s) => xe - 1.05 + 0.33 * s + 0.3 * Math.exp(-s * 20);
  const SPAN = 2.0;
  const nFluke = S.budget(0.1);
  for (let k = 0; k < nFluke; k++) {
    const s = Math.pow(r(), 0.9);
    const le = fLead(s);
    const te = fTrail(s);
    const edge = r() < 0.3;
    const x = edge ? (r() < 0.6 ? le : te) : te + r() * (le - te);
    const side = r() < 0.5 ? -1 : 1;
    const u = (X0 - x) / LEN;
    S.add(x, (r() - 0.5) * 0.06, side * s * SPAN, edge ? scale3(LINE, 1.2) : S.vary(ramp([BACK, VIOLET], s), 0.2), 0.9, 2, Math.min(u, 1), side);
  }

  S.halo(8.5, HALO, { flat: 0.4, bright: 0.45 });
  return S.done();
}
