import { Shape, C, Path, spline, scale3 } from './util.js';

// L1 · CaMKII holoenzyme under the postsynaptic membrane.
// Twelve subunits: a central hub of two stacked hexameric rings, each hub
// domain tethered by a flexible linker to a kinase domain. When Ca2+ pours
// in through an open NMDA receptor, calmodulin switches kinases on and
// neighbouring subunits phosphorylate each other at T286, so activity sweeps
// around the ring and outlasts the calcium.
//
// parts: 0 hub · 1 linker · 2 kinase domain · 3 T286 phospho-site
//        4 Ca2+ cloud · 5 calmodulin · 6 Ca2+ stream through the pore
//        7 membrane · 8 NMDA receptor
// anim.z = activation order / 12 for subunit parts.

export const MOL_PORE = [-3.6, 3.15, -0.6];
export const MOL_SINK = [0, 0.4, 0];

export function molecule(N, seed = 21) {
  const S = new Shape(N, seed);
  const r = S.r;
  const TAU = Math.PI * 2;

  const subunits = [];
  for (let ring = 0; ring < 2; ring++) {
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * TAU + ring * (TAU / 12);
      subunits.push({ ring, ang, order: (2 * i + ring) / 12 });
    }
  }

  const nHub = S.budget(0.15);
  const nLink = S.budget(0.05);
  const nKin = S.budget(0.25);
  const nP = S.budget(0.03);
  subunits.forEach((su) => {
    const ca = Math.cos(su.ang);
    const sa = Math.sin(su.ang);
    const y = su.ring ? -0.36 : 0.36;
    const hub = [ca * 1.1, y, sa * 1.1];
    for (let k = 0; k < nHub / 12; k++) {
      const d = S.dir();
      const s = Math.cbrt(r());
      S.add(hub[0] + d[0] * 0.42 * s, hub[1] + d[1] * 0.3 * s, hub[2] + d[2] * 0.42 * s, S.vary(C.pale, 0.2), 0.9, 0, su.ring, su.order);
    }
    const ky = su.ring ? -1.05 : 1.05;
    const kin = [ca * 3.0, ky, sa * 3.0];
    const link = new Path(spline([[ca * 1.45, y * 1.3, sa * 1.45], [ca * 2.0 - sa * 0.25, (y + ky) * 0.55, sa * 2.0 + ca * 0.25], [ca * 2.45, ky * 0.95, sa * 2.45]], 8));
    S.tube(link, Math.floor(nLink / 12), { r: 0.06, col: C.mist, part: 1, a2: su.order, size: 0.7 });
    // Kinase domain: an N-lobe and a larger C-lobe along the radial direction.
    for (let k = 0; k < nKin / 12; k++) {
      const lobe = r() < 0.42;
      const c = lobe ? [ca * 3.45, ky + (su.ring ? -0.1 : 0.1), sa * 3.45] : kin;
      const rad = lobe ? [0.42, 0.36, 0.42] : [0.56, 0.48, 0.56];
      const d = S.dir();
      const s = Math.cbrt(r());
      S.add(c[0] + d[0] * rad[0] * s, c[1] + d[1] * rad[1] * s, c[2] + d[2] * rad[2] * s, S.vary(lobe ? C.mist : C.steel, 0.2), 0.95, 2, s, su.order);
    }
    for (let k = 0; k < nP / 12; k++) {
      const d = S.dir();
      const s = Math.cbrt(r()) * 0.17;
      S.add(ca * 2.45 + d[0] * s, ky * 0.9 + d[1] * s, sa * 2.45 + d[2] * s, S.vary(C.glu, 0.15), 1.25, 3, 0, su.order);
    }
  });

  // Ca2+ cloud swirling around the holoenzyme.
  const nCa = S.budget(0.075);
  for (let k = 0; k < nCa; k++) {
    const rad = 1.6 + Math.pow(r(), 0.7) * 4.2;
    const a = r() * TAU;
    S.add(Math.cos(a) * rad, (r() - 0.5) * 3.4 + 0.4, Math.sin(a) * rad, S.vary(C.ca, 0.2), 0.7 + r() * 0.5, 4, rad, a);
  }

  // Ca2+ stream from the pore down to the kinase ring: stored position is a
  // small jitter; the shader moves it along the path by anim.w.
  const nStream = S.budget(0.035);
  for (let k = 0; k < nStream; k++) {
    const d = S.dir();
    S.add(d[0] * 0.18, d[1] * 0.18, d[2] * 0.18, S.vary(C.ca, 0.15), 0.8 + r() * 0.4, 6, r(), r());
  }

  // Calmodulin: dumbbells of two Ca2+-binding lobes on a central helix.
  const nCaM = S.budget(0.06);
  const cams = 9;
  for (let m = 0; m < cams; m++) {
    const a = (m / cams) * TAU + r() * 0.4;
    const rad = 4.4 + r() * 1.3;
    const c = [Math.cos(a) * rad, (r() - 0.5) * 2.6, Math.sin(a) * rad];
    const ax = S.dir();
    for (let k = 0; k < nCaM / cams; k++) {
      const w = r();
      let p;
      if (w < 0.25) {
        const t = (r() - 0.5) * 0.7;
        p = [c[0] + ax[0] * t, c[1] + ax[1] * t, c[2] + ax[2] * t];
      } else {
        const side = w < 0.62 ? 1 : -1;
        const d = S.dir();
        const s = Math.cbrt(r()) * 0.3;
        p = [c[0] + ax[0] * 0.5 * side + d[0] * s, c[1] + ax[1] * 0.5 * side + d[1] * s, c[2] + ax[2] * 0.5 * side + d[2] * s];
      }
      S.add(p[0], p[1], p[2], S.vary(C.ach, 0.2), 0.8, 5, rad, a, m / cams);
    }
  }

  // Lipid bilayer patch with the NMDA receptor sitting in it.
  const nMem = S.budget(0.08);
  for (let k = 0; k < nMem; k++) {
    const x = (r() - 0.5) * 11;
    const z = (r() - 0.5) * 7;
    const fade = Math.max(0, 1 - Math.hypot(x / 5.5, z / 3.5));
    const hole = Math.hypot(x - MOL_PORE[0], z - MOL_PORE[2]) < 0.75;
    if (hole || fade <= 0) { k--; continue; }
    const leaf = r() < 0.5 ? 0.16 : -0.16;
    S.add(x, MOL_PORE[1] + leaf + (r() - 0.5) * 0.06, z, scale3(S.vary(C.deep, 0.25), 0.5 + 0.5 * fade), 0.65, 7, fade, 0);
  }
  const nR = S.budget(0.045);
  for (let k = 0; k < nR; k++) {
    const sub = Math.floor(r() * 4);
    const a = (sub / 4) * TAU + Math.PI / 4;
    const h = (r() - 0.35) * 1.9;
    const bulge = 0.42 + 0.22 * Math.exp(-((h - 0.9) ** 2) * 2.5) + 0.12 * Math.exp(-((h + 0.5) ** 2) * 4);
    const d = S.dir();
    const s = Math.cbrt(r()) * 0.3;
    S.add(MOL_PORE[0] + Math.cos(a) * bulge + d[0] * s, MOL_PORE[1] + h + d[1] * s, MOL_PORE[2] + Math.sin(a) * bulge + d[2] * s, S.vary(sub % 2 ? C.mist : C.pale, 0.2), 0.85, 8, h, sub / 4);
  }

  S.halo(9, [C.steel, C.mist, C.ca, C.deep], { flat: 0.7, bright: 0.35 });
  return S.done();
}
