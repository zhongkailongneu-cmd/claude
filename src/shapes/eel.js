import { Shape, hex, ramp, scale3, profile, smoothstep } from './util.js';

// Electric eel (Electrophorus), drawn glowing: in life it does not
// bioluminesce, so the light here stands in for its electric discharge.
// Local frame: +x = head. The body follows a gentle S-shaped spine.
// anim: x = part (0 body, 1 anal fin, 2 head details, 3 electric arcs),
//       y = u along the body (0 snout → 1 tail tip), z = arc id.

const LEN = 13;
const RAD = [[0, 0.07], [0.015, 0.27], [0.05, 0.38], [0.15, 0.42], [0.4, 0.37], [0.7, 0.25], [0.9, 0.12], [1, 0.025]];

const BACK = hex('#c6ff3a');
const FLANK = hex('#2dffd0');
const BELLY = hex('#ffb43a');
const THROAT = hex('#ff7a3a');
const SPOT = hex('#eaffff');
const FIN = hex('#38f0ff');
const ARCS = ['#d9b3ff', '#a6fbff', '#f6ff8a', '#ffffff'].map(hex);
const HALO = ['#c6ff3a', '#2dffd0', '#a6fbff', '#d9b3ff'].map(hex);

function spine(u) {
  return [
    LEN / 2 - u * LEN,
    0.45 * Math.sin(u * Math.PI * 1.1),
    1.5 * Math.sin(u * Math.PI * 1.8 + 0.3) * (0.6 + 0.4 * u),
  ];
}

function frame(u) {
  const e = 1e-3;
  const a = spine(Math.max(0, u - e));
  const b = spine(Math.min(1, u + e));
  let t = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const tl = Math.hypot(...t);
  t = t.map((v) => v / tl);
  // n = t × up, then b = n × t
  let n = [-t[2], 0, t[0]];
  const nl = Math.hypot(...n) || 1;
  n = n.map((v) => v / nl);
  const bn = [n[1] * t[2] - n[2] * t[1], n[2] * t[0] - n[0] * t[2], n[0] * t[1] - n[1] * t[0]];
  return { p: spine(u), n, b: bn, t };
}

function surface(u, phi, grow = 1) {
  const { p, n, b } = frame(u);
  const R = profile(RAD, u) * grow;
  const vs = 0.72 + 0.28 * smoothstep(0.06, 0.2, u);
  const c = Math.cos(phi) * R;
  const s = Math.sin(phi) * R * vs;
  return [p[0] + n[0] * c + b[0] * s, p[1] + n[1] * c + b[1] * s, p[2] + n[2] * c + b[2] * s];
}

export function eel(N, seed = 81) {
  const S = new Shape(N, seed);
  const r = S.r;

  // Body: lime back, turquoise flanks, orange belly and throat, light spots.
  const nBody = S.budget(0.56);
  for (let k = 0; k < nBody;) {
    const u = r();
    if (r() > profile(RAD, u) / 0.42 + 0.08) continue;
    k++;
    const phi = r() * Math.PI * 2;
    const [x, y, z] = surface(u, phi);
    const up = Math.sin(phi);
    let c = up > 0.3 ? ramp([FLANK, BACK], (up - 0.3) / 0.7) : up < -0.5 ? (u < 0.2 ? THROAT : BELLY) : FLANK;
    const spot = Math.sin(u * 140) * Math.sin(phi * 9) > 0.86;
    if (spot) c = scale3(SPOT, 1.2);
    S.add(x, y, z, S.vary(c, 0.18), spot ? 1 : 0.85, 0, u, 0);
  }

  // Long ribbon anal fin along the underside, used for swimming.
  const nFin = S.budget(0.12);
  for (let k = 0; k < nFin; k++) {
    const u = 0.2 + r() * 0.77;
    const { p, b } = frame(u);
    const R = profile(RAD, u);
    const fh = 0.3 * Math.pow(Math.sin((Math.PI * (u - 0.2)) / 0.77), 0.5);
    const t = r();
    const edge = t > 0.93;
    const d = R * 0.9 + t * fh;
    S.add(p[0] - b[0] * d, p[1] - b[1] * d, p[2] - b[2] * d, edge ? scale3(SPOT, 1.2) : S.vary(FIN, 0.2), edge ? 0.9 : 0.75, 1, u, 0);
  }

  // Mouth and small eyes.
  for (let k = 0; k < S.budget(0.012); k++) {
    const u = r() * 0.05;
    const side = r() < 0.5 ? -1 : 1;
    const [x, y, z] = surface(u, side > 0 ? -0.45 : Math.PI + 0.45, 1.02);
    S.add(x, y, z, scale3(THROAT, 1.5), 1, 2, u, 0);
  }
  for (const side of [-1, 1]) {
    for (let k = 0; k < S.budget(0.002); k++) {
      const [x, y, z] = surface(0.035, side > 0 ? 0.55 : Math.PI - 0.55, 1.03);
      S.add(x + (r() - 0.5) * 0.06, y + (r() - 0.5) * 0.06, z, scale3(SPOT, 1.8), 1.25, 2, 0.035, 0);
    }
  }

  // Electric arcs: thin jagged bolts that leap off the body, and arcs that
  // loop from one point on the body to another. The shader flickers them.
  const nArc = S.budget(0.14);
  const BOLTS = 44;
  const per = Math.floor(nArc / BOLTS);
  const jag = (a, b, bulge, steps, rough) => {
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const arch = 4 * t * (1 - t);
      const j = i === 0 || i === steps ? 0 : rough;
      pts.push([
        a[0] + (b[0] - a[0]) * t + bulge[0] * arch + S.gauss() * j,
        a[1] + (b[1] - a[1]) * t + bulge[1] * arch + S.gauss() * j,
        a[2] + (b[2] - a[2]) * t + bulge[2] * arch + S.gauss() * j,
      ]);
    }
    return pts;
  };
  for (let bolt = 0; bolt < BOLTS; bolt++) {
    const u = 0.06 + r() * 0.88;
    const phi = r() * Math.PI * 2;
    const root = surface(u, phi);
    const { p, t } = frame(u);
    const out = [root[0] - p[0], root[1] - p[1], root[2] - p[2]];
    const ol = Math.hypot(...out) || 1;
    const o = out.map((v) => v / ol);
    let pts;
    if (r() < 0.5) {
      const end = surface(Math.min(0.99, u + 0.05 + r() * 0.1), phi + (r() - 0.5) * 0.8);
      const lift = 0.7 + r() * 1.1;
      pts = jag(root, end, o.map((v) => v * lift), 12, 0.07);
    } else {
      const len = 1.4 + r() * 1.8;
      const sideways = (r() - 0.5) * 1.2;
      const tip = [root[0] + (o[0] + t[0] * sideways) * len, root[1] + (o[1] + t[1] * sideways) * len, root[2] + (o[2] + t[2] * sideways) * len];
      pts = jag(root, tip, [0, 0, 0], 10, 0.11);
      const k = 4 + Math.floor(r() * 3);
      const bt = [pts[k][0] + (o[0] + S.gauss() * 0.6) * 0.7, pts[k][1] + (o[1] + S.gauss() * 0.6) * 0.7, pts[k][2] + (o[2] + S.gauss() * 0.6) * 0.7];
      pts = pts.concat(jag(pts[k], bt, [0, 0, 0], 4, 0.06));
    }
    const col = S.pick(ARCS);
    for (let k = 0; k < per; k++) {
      const i = Math.floor(r() * (pts.length - 1));
      const a = pts[i];
      const b = pts[i + 1];
      const f = r();
      S.add(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, scale3(col, 1.4), 0.55 + r() * 0.3, 3, u, bolt);
    }
  }

  S.halo(8, HALO, { flat: 0.55, bright: 0.5 });
  return S.done();
}
