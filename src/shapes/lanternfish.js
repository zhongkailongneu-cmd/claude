import { Shape, hex, ramp, scale3, profile } from './util.js';

// Lanternfish (Myctophidae): one large fish in front of a small school.
// Local frame: +x = snout, +y = back, +z = right flank.
// anim: x = part + 0.1 * fishScale (part 0 body, 1 fins, 2 eye, 3 photophores),
//       y = u along the fish (0 snout → 1 tail tip), z = swim phase.

const BACK = hex('#22d6c6');
const FLANK = hex('#ffc94a');
const BELLY = hex('#ff9a66');
const FIN = hex('#ff7a59');
const RAY = hex('#ffd36b');
const PHOTO = hex('#40f8ff');
const PHOTO_CORE = hex('#e4ffff');
const EYE_RING = hex('#ffd76a');
const HALO = ['#40f8ff', '#ffc94a', '#ff9a66', '#22d6c6'].map(hex);

const H = [[0, 0.12], [0.04, 0.48], [0.12, 0.76], [0.25, 0.86], [0.42, 0.8], [0.6, 0.58], [0.74, 0.34], [0.82, 0.22]];
const U_PED = 0.82;

// Photophore rows: [phi (angle around the body), u start, u end, count].
const ROWS = [
  [-1.35, 0.16, 0.76, 15],
  [-0.95, 0.2, 0.6, 9],
  [-0.6, 0.55, 0.8, 6],
  [-0.15, 0.3, 0.45, 3],
];

function fish(S, { L, ox, oy, oz, sc, phase, share, detail }) {
  const r = S.r;
  const X0 = L / 2;
  const tag = (part) => part + sc * 0.1;
  const half = (u) => profile(H, u) * (L / 6.4);
  const at = (u, phi) => {
    const h = half(Math.min(u, U_PED));
    return [ox + X0 - u * L, oy + Math.sin(phi) * h, oz + Math.cos(phi) * h * 0.5];
  };
  const n = (f) => Math.floor(share * f);

  // Body with scale sparkle and a lateral line.
  for (let k = 0, nB = n(0.5); k < nB;) {
    const u = r() * U_PED;
    if (r() > half(u) / (0.9 * L / 6.4)) continue;
    k++;
    const phi = r() * Math.PI * 2;
    const [x, y, z] = at(u, phi);
    const up = Math.sin(phi);
    let c = up > 0.6 ? ramp([FLANK, BACK], (up - 0.6) / 0.4) : up < -0.4 ? BELLY : FLANK;
    const scaleEdge = detail && Math.abs(Math.sin(u * 90 + up * 6)) < 0.12;
    if (scaleEdge) c = scale3(c, 1.35);
    if (Math.abs(up) < 0.04) c = scale3(PHOTO, 0.8);
    S.add(x, y, z, S.vary(c, 0.18), 0.75, tag(0), u, phase);
  }

  // Gill cover arc and mouth line.
  if (detail) {
    for (let k = 0, nG = n(0.02); k < nG; k++) {
      const phi = -1.2 + r() * 2.4;
      const u = 0.165 + Math.cos(phi) * 0.025;
      const [x, y, z] = at(u, phi);
      const side = r() < 0.5 ? -1 : 1;
      S.add(x, y, oz + (z - oz) * side, scale3(RAY, 1.2), 0.9, tag(0), u, phase);
    }
    for (let k = 0, nM = n(0.012); k < nM; k++) {
      const t = r();
      const side = r() < 0.5 ? -1 : 1;
      const u = 0.01 + t * 0.12;
      const [x, , z] = at(u, -0.3);
      S.add(x, oy - 0.05 - t * 0.32, oz + (z - oz) * side, scale3(RAY, 1.3), 0.9, tag(0), u, phase);
    }
  }

  // Large eye: gold ring around a glowing pupil.
  for (const side of [-1, 1]) {
    const [ex, ey] = at(0.085, 0.35);
    const eR = 0.3 * (L / 6.4);
    const ez = oz + side * half(0.085) * 0.48;
    for (let k = 0, nE = n(0.012); k < nE; k++) {
      const a = r() * Math.PI * 2;
      const ring = r() < 0.6;
      const rr = ring ? eR * (0.85 + r() * 0.15) : Math.sqrt(r()) * eR * 0.5;
      S.add(ex + Math.cos(a) * rr, ey + Math.sin(a) * rr, ez, ring ? scale3(EYE_RING, 1.4) : scale3(PHOTO, 1.8), ring ? 0.95 : 1.2, tag(2), 0.085, phase);
    }
  }

  // Photophores: glowing beads along the lower flanks, plus the head "lantern".
  const spots = [];
  for (const [phi, u0, u1, count] of ROWS) {
    for (let i = 0; i < count; i++) spots.push([u0 + (u1 - u0) * (i / (count - 1 || 1)), phi]);
  }
  spots.push([0.04, 0.45], [0.06, -0.35]);
  const perSpot = Math.max(3, Math.floor(n(0.12) / (spots.length * 2)));
  for (const side of [-1, 1]) {
    for (const [u, phi] of spots) {
      const [x, y, z] = at(u, phi);
      const pr = 0.075 * (L / 6.4);
      const zz = oz + (z - oz) * side;
      for (let k = 0; k < perSpot; k++) {
        const a = r() * Math.PI * 2;
        const rr = Math.sqrt(r()) * pr;
        const core = rr < pr * 0.45;
        S.add(x + Math.cos(a) * rr, y + Math.sin(a) * rr, zz + side * 0.02, core ? scale3(PHOTO_CORE, 2) : scale3(PHOTO, 1.6), core ? 1.3 : 1.05, tag(3), u, phase);
      }
    }
  }

  // Fins: dorsal, adipose, anal, pelvic, pectoral and forked caudal.
  const fin = (count, u0, u1, height, dir, side = 0) => {
    for (let k = 0; k < count; k++) {
      const t = r();
      const u = u0 + (u1 - u0) * t;
      const [x, y, z] = at(u, dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      const rayLine = detail && Math.abs(Math.sin(t * 30)) < 0.2;
      const hgt = height * Math.sin(Math.PI * Math.pow(t, 0.7)) * r();
      S.add(x - hgt * 0.35, y + dir * hgt, z + side * 0.05, rayLine ? scale3(RAY, 1.2) : S.vary(FIN, 0.2), 0.8, tag(1), u, phase);
    }
  };
  const k = L / 6.4;
  fin(n(0.05), 0.36, 0.55, 0.6 * k, 1);
  fin(n(0.01), 0.7, 0.75, 0.2 * k, 1);
  fin(n(0.035), 0.55, 0.73, 0.42 * k, -1);
  fin(n(0.015), 0.36, 0.42, 0.3 * k, -1);
  for (const side of [-1, 1]) {
    const [px, py, pz] = at(0.2, -0.2);
    for (let i = 0, nP = n(0.012); i < nP; i++) {
      const t = r();
      const a = -0.3 + (r() - 0.5) * 0.8;
      S.add(px - t * 0.7 * k, py + Math.sin(a) * t * 0.5 * k, oz + (pz - oz) * side + side * t * 0.12, S.vary(FIN, 0.2), 0.75, tag(1), 0.2 + t * 0.1, phase);
    }
  }
  // Caudal fin: two lobes.
  const [cx, cy] = at(U_PED, 0);
  for (let i = 0, nC = n(0.1); i < nC; i++) {
    const lobe = r() < 0.5 ? -1 : 1;
    const t = Math.sqrt(r());
    const spread = r();
    const tipX = cx - 1.25 * k;
    const x = cx + (tipX - cx) * t;
    const outer = 0.16 + 0.68 * t;
    const inner = Math.max(0, (t - 0.45) * 0.62);
    const y = cy + lobe * (inner + (outer - inner) * spread) * k;
    const edge = spread > 0.93;
    S.add(x, y, oz + (r() - 0.5) * 0.03, edge ? scale3(RAY, 1.3) : S.vary(ramp([FIN, RAY], t), 0.2), 0.85, tag(1), U_PED + t * (1 - U_PED), phase);
  }
}

export function lanternfish(N, seed = 61) {
  const S = new Shape(N, seed);
  const r = S.r;

  fish(S, { L: 6.4, ox: 0, oy: 0, oz: 0, sc: 1, phase: 0, share: N * 0.68, detail: true });

  // A loose school behind and around the hero fish.
  const school = [
    [-3.4, 2.4, -2.6], [-1.2, 3.0, -3.4], [1.6, 2.6, -2.8], [-4.2, -1.8, -2.2], [3.6, -2.4, -3.5],
    [-2.0, -2.9, -1.6], [4.6, 1.6, -4.4], [0.4, -3.3, -3.8], [-5.0, 0.6, -4.2], [2.4, 3.7, -5.2],
  ];
  const each = (N * 0.22) / school.length;
  school.forEach(([x, y, z], i) => {
    const sc = 0.18 + r() * 0.12;
    fish(S, { L: 6.4 * sc, ox: x, oy: y, oz: z, sc, phase: i * 1.7 + 0.5, share: each / 0.93, detail: false });
  });

  S.halo(8, HALO, { flat: 0.6, bright: 0.5 });
  return S.done();
}
