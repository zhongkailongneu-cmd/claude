import { Shape, C, Path, spline, mul, sub, scale3, mix3 } from './util.js';

// L6 · The hippocampus in cross-section (Cajal's view), extruded along its
// curved long axis. Ammon's horn (CA1–CA3) and the dentate gyrus interlock
// like two Cs. Pulses run the trisynaptic loop EC → DG → CA3 → CA1 →
// subiculum; newborn granule cells glimmer in the subgranular zone; now and
// then a sharp-wave ripple sweeps from CA3 to CA1.
//
// parts: 0 CA pyramidal layer + dendrites (anim.y = 0 subiculum … 1 CA3c)
//        1 dentate granule layer · 2 trisynaptic path (anim.y = loop position)
//        3 newborn neurons · 4 entorhinal cortex · 5 alveus

const CA = [[3.4, -1.7], [3.35, 0.0], [2.6, 1.6], [1.1, 2.55], [-0.6, 2.5], [-2.0, 1.75], [-2.7, 0.4], [-2.3, -0.9], [-1.2, -1.35], [-0.25, -0.8]];
const DG = [[-0.75, 0.3], [0.4, 0.45], [1.35, -0.25], [1.25, -1.45], [0.2, -2.05], [-0.9, -1.95]];
const EC = [[3.4, -1.7], [3.15, -2.8], [2.1, -3.45], [0.6, -3.6], [-0.6, -3.4]];
const LOOP = [[1.6, -3.25], [2.65, -2.1], [2.3, -0.9], [1.0, -0.15], [0.45, -0.85], [-0.4, -0.95], [-1.7, -1.05], [-2.45, 0.3], [-1.7, 1.55], [0.2, 2.1], [2.15, 1.5], [3.05, 0.0], [3.1, -1.5], [2.5, -2.85], [1.6, -3.25]];
const STATION_PTS = { EC: [2.65, -2.1], DG: [1.0, -0.15], CA3: [-2.45, 0.3], CA1: [2.15, 1.5], SUB: [3.1, -1.5] };

const flat = (pts) => spline(pts.map(([x, y]) => [x, y, 0]), 10);
// Extrude a 2D section point to z along the gently bent long axis.
const place = (x, y, z) => [x + 0.07 * z * z, y + 0.12 * z, z];
const Z = 3.0;

// Loop positions (0..1) where the travelling pulse reaches each station;
// the sound events use the same numbers.
const loopPath = new Path(flat(LOOP));
export const HIPPO_STATIONS = Object.values(STATION_PTS).map(([x, y]) => {
  let best = 0;
  let bd = 1e9;
  for (let i = 0; i <= 400; i++) {
    const { p } = loopPath.at(i / 400);
    const d = Math.hypot(p[0] - x, p[1] - y);
    if (d < bd) { bd = d; best = i / 400; }
  }
  return best;
});

export function hippocampus(N, seed = 81) {
  const S = new Shape(N, seed);
  const r = S.r;
  const ca = new Path(flat(CA));
  const dg = new Path(flat(DG));
  const ec = new Path(flat(EC));

  // In-plane normal of a 2D path, flipped to point toward `toward`.
  const normal2 = (path, u, toward) => {
    const { p, t } = path.at(u);
    let n = [-t[1], t[0], 0];
    if (toward) {
      const tw = sub(toward, p);
      if (n[0] * tw[0] + n[1] * tw[1] < 0) n = mul(n, -1);
    }
    return { p, n };
  };
  // Five serial sections along the long axis, like slices on a slide.
  const SLICES = [-2.4, -1.2, 0, 1.2, 2.4];
  const z = () => SLICES[Math.floor(r() * SLICES.length)] + (r() - 0.5) * 0.12;
  const zfade = (zz) => 1 - 0.45 * Math.pow(Math.abs(zz) / Z, 2);

  // CA pyramidal layer: dense band; stratum radiatum dendrites point inward.
  const nCA = S.budget(0.26);
  for (let k = 0; k < nCA; k++) {
    const u = r();
    const zz = z();
    const { p, n } = normal2(ca, u, [0.3, 0.6, 0]);
    const dend = r() < 0.38;
    const off = dend ? 0.1 + r() * 0.65 : (r() - 0.5) * 0.2;
    const q = place(p[0] + n[0] * off, p[1] + n[1] * off, zz);
    const c = scale3(S.vary(dend ? C.steel : u > 0.55 ? C.pale : C.mist, 0.2), (dend ? 0.7 : 1) * (0.5 + 0.5 * zfade(zz)));
    S.addP(q, c, dend ? 0.7 : 0.9, 0, u, 0);
  }
  // Dentate granule layer: the brightest, most tightly packed band.
  const nDG = S.budget(0.17);
  for (let k = 0; k < nDG; k++) {
    const u = r();
    const zz = z();
    const { p, n } = normal2(dg, u, [0.3, -0.9, 0]);
    const mol = r() < 0.3;
    const off = mol ? -(0.12 + r() * 0.5) : (r() - 0.5) * 0.22;
    const q = place(p[0] + n[0] * off, p[1] + n[1] * off, zz);
    S.addP(q, scale3(S.vary(mol ? C.steel : C.ice, 0.18), (mol ? 0.65 : 1) * (0.5 + 0.5 * zfade(zz))), mol ? 0.7 : 0.85, 1, u, 0);
  }
  // Newborn granule cells in the subgranular zone (rodent DG; contested in adult humans).
  const nNew = S.budget(0.025);
  const babies = Array.from({ length: 34 }, () => ({ u: 0.05 + r() * 0.9, z: z(), ph: r() }));
  for (let k = 0; k < nNew; k++) {
    const b = babies[k % babies.length];
    const { p, n } = normal2(dg, b.u, [0.3, -0.9, 0]);
    const tail = r() < 0.4;
    const off = tail ? -r() * 0.35 : 0.2;
    const d = S.dir();
    const q = place(p[0] + n[0] * off + d[0] * 0.05, p[1] + n[1] * off + d[1] * 0.05, b.z + d[2] * 0.05);
    S.addP(q, S.vary(C.ne, 0.15), tail ? 0.7 : 1.05, 3, b.u, b.ph);
  }
  // Entorhinal cortex: a thicker cortical sheet below.
  const nEC = S.budget(0.1);
  for (let k = 0; k < nEC; k++) {
    const u = r();
    const zz = z();
    const { p, n } = normal2(ec, u, [1.5, -1.5, 0]);
    const off = (r() - 0.2) * 0.55;
    S.addP(place(p[0] + n[0] * off, p[1] + n[1] * off, zz), scale3(S.vary(C.mist, 0.2), 0.75 * (0.5 + 0.5 * zfade(zz))), 0.8, 4, u, 0);
  }
  // Alveus: thin fibre layer on the outside of Ammon's horn.
  const nAlv = S.budget(0.05);
  for (let k = 0; k < nAlv; k++) {
    const u = r() * 0.85;
    const zz = z();
    const { p, n } = normal2(ca, u, [0.3, 0.6, 0]);
    const off = -(0.35 + r() * 0.12);
    S.addP(place(p[0] + n[0] * off, p[1] + n[1] * off, zz), scale3(S.vary(C.deep, 0.2), 0.7), 0.7, 5, u, 0);
  }
  // Trisynaptic loop, drawn in several slices along the long axis.
  const nLoop = S.budget(0.1);
  const slices = SLICES.length;
  for (let k = 0; k < nLoop; k++) {
    const sl = k % slices;
    const zz = SLICES[sl];
    const u = r();
    const { p } = loopPath.at(u);
    const d = S.dir();
    const q = place(p[0] + d[0] * 0.05, p[1] + d[1] * 0.05, zz + d[2] * 0.05);
    S.addP(q, S.vary(mix3(C.pale, C.ice, 0.5), 0.12), 0.75, 2, u, sl / slices);
  }

  S.halo(9, [C.steel, C.mist, C.deep, C.ne], { flat: 0.8, bright: 0.33 });
  return S.done();
}
