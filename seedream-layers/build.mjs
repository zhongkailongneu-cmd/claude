// Seedream 5.0 Pro layer separation, explained as an optical bench of glass panes.
// Built with the Anatomy skill kit (github.com/wheresryan22/anatomy, MIT).
// Run: node build.mjs            (set ANATOMY=/path/to/anatomy if it is not in ~/.claude/skills)
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { homedir } from "node:os";
import { POSTER, PALETTES, NAMES, layers } from "./art.mjs";
import { pageDocument, pickerHtml } from "../anatomy-surfaces/surfaces.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ANATOMY = process.env.ANATOMY || join(homedir(), ".claude/skills/anatomy");
const load = (file) => import(pathToFileURL(join(ANATOMY, file)).href);
const k = await load("kit/iso-kit.mjs");
const G = await load("kit/lathe.mjs");
const { kitScript } = await load("scripts/inline-kit.mjs");

const WIDTH = 640;
const HEIGHT = 400;

// ── World: x along the bench (lamp at the back, camera at the front), y across, z up ──
const PLATE = { x: -58, y: -50, w: 344, d: 102, r: 8 };
const PLATE_H = 12;
const FOOT_H = 5;

const N = 6;                       // base (z 0) plus five transparent layers
const X0 = 22;                     // z 0 pane is fixed; the others spread from it
const PMIN = 6;                    // pitch when pressed together
const PMAX = 34;                   // pitch when fully apart
const XR = Array.from({ length: N }, (_, i) => X0 + i * PMAX);   // rest (build) positions
const GLASS = { y: 22.5, z0: 12, z1: 72 };   // 45 × 60, the poster's 3:4
const ART = 45 / POSTER.w;                    // poster px → world units on a pane

const RAIL = { x0: 18, x1: 197, y: 27, d: 5, h: 3 };
const BAR = 42;                    // lazy-tongs bar, pin to pin
const TONG_A = [0.5, 1.0];         // [z, h] lower bar layer
const TONG_B = [1.7, 1.0];         // upper bar layer

const SCREW = { y: 44, z: 12, r: 1.8, x0: 12, x1: 262 };
const LEAD = 6;                    // handwheel travel per turn
const WHEEL = { x: 272, r: 10, rIn: 8.4, crank: 7 };

const CAM = { x0: 228, x1: 258, y: 22, z0: 20, z1: 64 };
const XL = 212;                    // lens front: distances for parallax are measured from here
const CAM_RANGE = 14;              // cross-slide travel each way
const SHIFT_GAIN = 63;             // poster px of image shift per unit of camera move per 1/distance
const SCREEN = { u: 13.5, z0: 24, z1: 60 };

const P = k.fitProjection(
  [
    ...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0),
    [X0, -25.5, 75], [XR[5], 25.5, 75], [-50, -19, 73], [CAM.x1, 22, 70],
    [WHEEL.x + 13, SCREW.y + WHEEL.r, SCREW.z + WHEEL.r], [WHEEL.x + 13, SCREW.y + WHEEL.r, SCREW.z - WHEEL.r],
  ],
  WIDTH,
  HEIGHT,
  { pad: 24, azimuth: 50 },
);

const at = (point) => k.iso(point, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const byDepth = (points) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
const alongX = (y, z, x = 0) => G.frameAlong([x, y, z], [1, 0, 0]);
const alongY = (x, z, y = 0) => G.frameAlong([x, y, z], [0, 1, 0]);
const planeX = (x, y, z) => k.sideMatrix([x, y], z, P, "right");   // local (u, v) → world (x, y − u, z − v)
const planeY = (y, x = 0) => k.sideMatrix([x, y], 0, P, "left");   // local (u, v) → world (x + u, y, −v)
const rect = (u0, v0, u1, v1, r = 0) => k.pathOf(k.roundedPlan({ x: u0, y: v0, w: u1 - u0, d: v1 - v0, r }, 4), true);

// ── Base plate, ruler and label ──
function plate() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(PLATE, 22))) {
    out.push(S(k.cylinder(x, y, 7, -PLATE_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 5.4, -PLATE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
  }
  out.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.6), { tone: "mid", inner: L(k.sideSeam(PLATE, -5, P, 8), { tone: "faint" }) }));
  out.push(L(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: "lo" }));
  const screws = k.corners(PLATE, 10);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));

  const strip = { x: RAIL.x0, y: 33, w: RAIL.x1 - RAIL.x0, d: 5, r: 0.8 };
  out.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(strip.x + 2, strip.x + strip.w - 2, 4, 5, strip.y + 0.4, 0.6, [1.8, 3.4], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));

  const label = { x: -50, y: 34, w: 46, d: 12, r: 1.2 };
  out.push(S(k.slabOf(label, 0, 0.8, P, 3), { tone: "lo", crease: "none" }));
  out.push(L(k.planOutline(k.insetPlan(label, 1.4), 0.8, P, 3), { tone: "faint" }));
  out.push(k.faceTextSvg(k.topMatrix([label.x + 4, label.y + 5.4], 0.8, P, "x"), "SEEDREAM 5.0 PRO", { size: 2.6, tone: "mid" }));
  out.push(L([24, 16].map((w, i) => k.lineOnTop([label.x + 4, label.y + 7.6 + i * 2], [label.x + 4 + w, label.y + 7.6 + i * 2], 0.8, P)).join(""), { tone: "lo", free: true }));
  out.push(D([at([label.x + label.w - 3, label.y + 3, 0.8]), at([label.x + label.w - 3, label.y + label.d - 3, 0.8])], { size: 0.45 }));
  return out.join("");
}

// ── The lamp at the back: a backlight housing on a post, its lens facing the panes ──
function lamp() {
  const out = [];
  const foot = { x: -48, y: -14, w: 30, d: 28, r: 2 };
  out.push(S(k.slabOf(foot, 0, 7, P, 4, 0.6), { tone: "mid" }));
  out.push(D(k.corners(foot, 3.5).map(([x, y]) => at([x, y, 7])), { size: 0.45 }));
  out.push(S(k.cylinder(-33, 0, 5, 7, 3, P, 28), { tone: "mid" }));
  out.push(S(k.cylinder(-33, 0, 3.2, 10, 10, P, 24), { tone: "mid", crease: "none" }));
  out.push(L(k.sideArc(-33, 0, 3.2, 15, P, 16), { tone: "faint" }));
  const box = { x: -50, y: -19, w: 34, d: 38, r: 3 };
  out.push(S(k.slabOf(box, 20, 44, P, 6, 1.2), { tone: "mid", inner: L(k.sideSeam(box, 58, P, 6), { tone: "faint" }) }));
  // vents on the near side face: closed slots
  const slots = [];
  for (let i = 0; i < 7; i++) slots.push(rect(-44 + i * 3.4, -52, -42.6 + i * 3.4, -30, 0.7));
  out.push(`<g transform="${planeY(19)}">${L(slots.join(""), { tone: "faint" })}</g>`);
  out.push(`<g transform="${planeY(19)}">${L(rect(-26, -40, -20, -32, 1), { tone: "lo" })}</g>`);
  out.push(D([at([-23, 19, 36])], { size: 0.5, tone: "mid" }));
  // carry handle
  for (const y of [-10, 10]) out.push(S(k.cylinder(-40, y, 1.6, 64, 6, P, 16), { tone: "mid" }));
  out.push(S(k.slabOf({ x: -42, y: -12, w: 4, d: 24, r: 1.6 }, 70, 2.6, P, 3, 0.4), { tone: "mid" }));
  // lens barrel along +x
  const F = alongX(0, 42, -16);
  out.push(S(G.solidOf([[0, 12], [2, 12], [2, 10.4], [9, 10.4], [9, 11.6], [12, 11.6]], F, P), { tone: "mid" }));
  out.push(`<path class="sl-lens" d="${G.circleOf(F, 12, 9.2, P)}"/>`);
  out.push(L(G.circleOf(F, 12, 9.2, P), { tone: "lo" }));
  out.push(L(G.circleOf(F, 12, 6, P), { tone: "faint" }));
  out.push(D(G.dotsOf(F, 12, 10.4, 6, P, { all: true }), { size: 0.45 }));
  return out.join("");
}

// ── Rails, end stops ──
const railPlan = (sign) => ({ x: RAIL.x0, y: sign * RAIL.y - RAIL.d / 2, w: RAIL.x1 - RAIL.x0, d: RAIL.d, r: 1 });
function rail(sign) {
  const plan = railPlan(sign);
  return S(k.slabOf(plan, 0, RAIL.h, P, 3, 0.4), { tone: "mid" }) + D([RAIL.x0 + 8, (RAIL.x0 + RAIL.x1) / 2, RAIL.x1 - 8].map((x) => at([x, sign * RAIL.y, RAIL.h])), { size: 0.4 });
}
function stop(x) {
  const plan = { x, y: -31, w: 4, d: 62, r: 1.2 };
  return S(k.slabOf(plan, 0, 7, P, 3, 0.5), { tone: "mid" }) + D([at([x + 2, -RAIL.y, 7]), at([x + 2, RAIL.y, 7])], { size: 0.45 });
}

// ── One pane station: carriage on the rails, a shoe, a frame, glass with one layer on it ──
function station(i) {
  const x = XR[i];
  const lit = `sl-frame sl-pane-${i}`;
  const out = [];
  out.push(S(k.slabOf({ x: x - 2.6, y: -32, w: 5.2, d: 64, r: 1 }, RAIL.h, 3.5, P, 3, 0.4), { tone: "mid" }));
  out.push(D([at([x, -RAIL.y, 6.5]), at([x, RAIL.y, 6.5])], { size: 0.42 }));
  out.push(S(k.slabOf({ x: x - 0.5, y: 31.5, w: 1, d: 4, r: 0.3 }, 3, 0.6, P, 2), { tone: "lo", crease: "none" }));
  out.push(S(k.slabOf({ x: x - 2.2, y: -27, w: 4.4, d: 54, r: 0.8 }, 6.5, 3.5, P, 3, 0.4), { tone: "mid" }));
  out.push(S(k.slabOf({ x: x - 1.3, y: -25.5, w: 2.6, d: 3, r: 0.5 }, 10, 65, P, 2, 0.3), { tone: "mid", className: lit }));
  out.push(S(k.slabOf({ x: x - 1.3, y: -GLASS.y, w: 2.6, d: GLASS.y * 2, r: 0.3 }, 10, 2, P, 2), { tone: "mid", className: lit }));
  const plane = planeX(x + 0.6, GLASS.y, GLASS.z1);
  const W = GLASS.y * 2, Hh = GLASS.z1 - GLASS.z0;
  out.push(`<g transform="${plane}">`);
  out.push(`<path class="sl-glass" d="M0 0H${W}V${Hh}H0Z"/>`);
  out.push(`<g class="sl-art" transform="scale(${ART})" clip-path="url(#sl-poster)"><use href="#sl-L${i}"/></g>`);
  out.push(`<path class="iso-line" data-tone="faint" d="M${W - 16} 0L${W} 14"/>`);
  out.push(`<path class="iso-line sl-pane-edge sl-pane-${i}" data-tone="lo" d="M0 0H${W}V${Hh}H0Z"/>`);
  out.push(`</g>`);
  out.push(S(k.slabOf({ x: x - 1.3, y: -GLASS.y, w: 2.6, d: GLASS.y * 2, r: 0.3 }, GLASS.z1, 3, P, 2, 0.3), { tone: "mid", className: lit }));
  out.push(S(k.slabOf({ x: x - 1.3, y: GLASS.y, w: 2.6, d: 3, r: 0.5 }, 10, 65, P, 2, 0.3), { tone: "mid", className: lit }));
  out.push(D([at([x, 24, 75]), at([x, -24, 75])], { size: 0.4 }));
  const F = alongY(x, 8.3, 27);
  out.push(S(G.disc(0, 1.2, 1.1, F, P), { tone: "mid" }));
  out.push(S(G.disc(1.2, 3.2, 1.7, F, P), { tone: "mid" }));
  if (i === N - 1) {
    out.push(S(k.slabOf({ x: x - 2, y: 30, w: 4, d: 11, r: 0.6 }, 6.5, 2.5, P, 2, 0.3), { tone: "mid" }));
    out.push(D([at([x, 31.5, 9]), at([x, 38.5, 9])], { size: 0.4 }));
  }
  return `<g data-station="${i}">${out.join("")}</g>`;
}

// ── Lead screw, bearings, nut and handwheel ──
function bearing(x) {
  const plan = { x, y: SCREW.y - 4.5, w: 6, d: 9, r: 1 };
  return S(k.slabOf(plan, 0, 17, P, 3, 0.5), { tone: "mid", inner: L(k.sideSeam(plan, 4, P, 3), { tone: "faint" }) }) + D([at([x + 3, SCREW.y - 2.6, 17]), at([x + 3, SCREW.y + 2.6, 17])], { size: 0.42 });
}
function screw() {
  const F = alongX(SCREW.y, SCREW.z);
  const threads = [];
  for (let s = SCREW.x0 + 1.5; s < SCREW.x1 - 1; s += 1.6) threads.push(G.arcOf(F, s, SCREW.r, P, { trim: 0.4 }));
  return S(G.disc(SCREW.x0, SCREW.x1, SCREW.r, F, P), { tone: "mid", crease: "none", inner: L(threads.join(""), { tone: "faint" }) });
}
function nut() {
  const x = XR[N - 1];
  const plan = { x: x - 3.5, y: SCREW.y - 4, w: 7, d: 8, r: 1.2 };
  return S(k.slabOf(plan, 7.5, 9, P, 3, 0.5), { tone: "mid", inner: L(k.sideSeam(plan, 12, P, 3), { tone: "faint" }) }) + D([at([x - 1.8, SCREW.y, 16.5]), at([x + 1.8, SCREW.y, 16.5])], { size: 0.42 });
}
function wheel() {
  const F = alongX(SCREW.y, SCREW.z);
  const out = [];
  out.push(S(G.disc(268, WHEEL.x, 1.6, F, P), { tone: "mid" }));
  out.push(S(G.ringBand(WHEEL.x, WHEEL.x + 3, WHEEL.rIn, WHEEL.r, F, P), { tone: "hi", className: "sl-wheel", inner: L(G.arcOf(F, WHEEL.x + 1.5, WHEEL.r, P), { tone: "faint" }) }));
  out.push(L(G.circleOf(F, WHEEL.x + 3, WHEEL.rIn, P), { tone: "lo" }));
  out.push(`<path data-part="spokes" class="iso-line" data-tone="mid" d=""/>`);
  out.push(S(G.disc(WHEEL.x, WHEEL.x + 4, 3, F, P), { tone: "mid" }));
  out.push(L(G.circleOf(F, WHEEL.x + 4, 1.2, P), { tone: "lo" }));
  const C = alongX(SCREW.y + WHEEL.crank, SCREW.z);
  out.push(`<g data-part="crank">${S(G.disc(WHEEL.x + 3, WHEEL.x + 6, 0.9, C, P), { tone: "mid" })}${S(G.disc(WHEEL.x + 6, WHEEL.x + 12, 1.8, C, P), { tone: "hi" })}</g>`);
  return out.join("");
}

// ── The camera at the front, on a cross-slide; its screen shows the stack head-on ──
let clips = 0;
function recessX(X, { u0, u1, z0, z1, r, depth }, back, backClass) {
  const id = `sl-clip-${clips++}`;
  const ring = k.roundedPlan({ x: u0, y: z0, w: u1 - u0, d: z1 - z0, r }, 5);
  const world = (u, z, d) => [X - d, -u, z];
  const { sinA, cosA, sinE, cosE } = k.cameraOf(P);
  const cu = (u0 + u1) / 2, cz = (z0 + z1) / 2;
  const tops = [], sides = [[], [], [], []];
  ring.forEach(([au, az], index) => {
    const [bu, bz] = ring[(index + 1) % ring.length];
    const len = Math.hypot(bu - au, bz - az) || 1;
    let [nu, nz] = [(bz - az) / len, -(bu - au) / len];
    if (nu * (cu - (au + bu) / 2) + nz * (cz - (az + bz) / 2) < 0) [nu, nz] = [-nu, -nz];
    const ny = -nu;
    if (ny * sinA * cosE + nz * sinE <= 1e-6) return;
    const quad = k.pathOf([at(world(au, az, 0)), at(world(bu, bz, 0)), at(world(bu, bz, depth)), at(world(au, az, depth))], true);
    if (nz >= Math.abs(ny)) tops.push(quad);
    else sides[Math.min(3, Math.max(0, Math.floor(((ny * cosA + 1) / 2) * 4)))].push(quad);
  });
  const shape = rect(u0, -z1, u1, -z0, r);
  const plane = (x) => k.sideMatrix([x, 0], 0, P, "right");
  return [
    `<clipPath id="${id}"><path transform="${plane(X)}" d="${shape}"/></clipPath>`,
    `<g clip-path="url(#${id})">`,
    `<g transform="${plane(X - depth)}"><path class="${backClass}" d="${shape}"/>${back}<path class="iso-line" data-tone="faint" d="${shape}"/></g>`,
    `<path class="iso-top" d="${tops.join("")}"/>`,
    ...sides.map((d, shade) => (d ? `<path class="iso-shade" data-shade="${shade}" d="${d.join("")}"/>` : "")),
    `</g>`,
    `<g transform="${plane(X)}"><path class="iso-line" data-tone="lo" d="${shape}"/></g>`,
  ].join("");
}
function screenArt() {
  const layersOn = Array.from({ length: N }, (_, i) => `<g data-shift="${i}"><use href="#sl-L${i}"/></g>`).join("");
  const scale = (SCREEN.u * 2) / POSTER.w;
  return `<g class="sl-art" transform="translate(${-SCREEN.u} ${-SCREEN.z1}) scale(${scale})"><g clip-path="url(#sl-poster)">${layersOn}</g></g>` +
    `<path class="iso-line" data-tone="faint" d="M${SCREEN.u - 9} ${-SCREEN.z1 - 1}L${SCREEN.u + 1} ${-SCREEN.z1 + 9}"/>`;
}
function cameraBase() {
  const out = [];
  const base = { x: 220, y: -36, w: 44, d: 72, r: 3 };
  out.push(`<path class="iso-halo" d="${k.haloOf(k.insetPlan(base, 4), 0, 4, P)}" style="filter:blur(5px)"/>`);
  out.push(S(k.slabOf(base, 0, 4, P, 5, 0.8), { tone: "mid" }));
  out.push(D(k.corners(base, 3.4).map(([x, y]) => at([x, y, 4])), { size: 0.45 }));
  for (const x of [225, 255]) {
    out.push(S(k.slabOf({ x, y: -34, w: 4, d: 68, r: 1 }, 4, 2, P, 3, 0.4), { tone: "mid" }));
    out.push(D([at([x + 2, -31, 6]), at([x + 2, 31, 6])], { size: 0.4 }));
  }
  const F = alongY(242, 2.8, 36);
  out.push(S(G.disc(0, 1.2, 1.1, F, P), { tone: "mid" }));
  out.push(S(G.disc(1.2, 4.2, 2.4, F, P), { tone: "mid" }));
  out.push(k.fadedSvg(G.ribsOf(F, 1.2, 4.2, 2.4, 22, P, { fade: [0.1, 0.55] }), { tone: "lo" }));
  return out.join("");
}
function camera() {
  const out = [];
  out.push(S(k.slabOf({ x: 222, y: -15, w: 40, d: 30, r: 2 }, 6, 3.5, P, 3, 0.5), { tone: "mid" }));
  out.push(D([at([226, -12, 9.5]), at([226, 12, 9.5]), at([258, -12, 9.5]), at([258, 12, 9.5])], { size: 0.42 }));
  out.push(S(k.cylinder(242, 0, 5.5, 9.5, 2.5, P, 28), { tone: "mid" }));
  out.push(S(k.cylinder(242, 0, 4, 12, 8, P, 24), { tone: "mid", crease: "none" }));
  const F = G.frameAlong([CAM.x0, 0, 42], [-1, 0, 0]);
  out.push(S(G.solidOf([[0, 9.6], [3, 9.6], [3, 8.6], [11, 8.6], [11, 10], [16, 10]], F, P), { tone: "mid" }));
  const body = { x: CAM.x0, y: -CAM.y, w: CAM.x1 - CAM.x0, d: CAM.y * 2, r: 3 };
  out.push(S(k.slabOf(body, CAM.z0, CAM.z1 - CAM.z0, P, 6, 1.2), { tone: "hi", className: "sl-cam", inner: L(k.sideSeam(body, 26, P, 6), { tone: "faint" }) }));
  // near side: grip slots, a lug and a knurled knob
  const slots = [];
  for (let i = 0; i < 5; i++) slots.push(rect(232 + i * 3.4, -40, 233.4 + i * 3.4, -30, 0.7));
  out.push(`<g transform="${planeY(CAM.y)}">${L(slots.join(""), { tone: "faint" })}</g>`);
  out.push(S(k.slabOf({ x: 250, y: CAM.y, w: 4, d: 1.6, r: 0.5 }, 56, 4, P, 2), { tone: "mid" }));
  const K = alongY(236, 52, CAM.y);
  out.push(S(G.disc(0, 3, 3.4, K, P), { tone: "mid" }));
  out.push(k.fadedSvg(G.ribsOf(K, 0, 3, 3.4, 26, P, { fade: [0.1, 0.55] }), { tone: "lo" }));
  // top: viewfinder hump and a record button
  const hump = { x: 232, y: -9, w: 16, d: 18, r: 2 };
  out.push(S(k.slabOf(hump, CAM.z1, 5, P, 3, 0.6), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(hump, 2.2), CAM.z1 + 5, P, 3), { tone: "faint" }));
  out.push(S(k.cylinder(252, 14, 2.4, CAM.z1, 1.6, P, 20), { tone: "mid" }));
  out.push(L(k.ring(252, 14, 1.2, CAM.z1 + 1.6, P, 16), { tone: "lo" }));
  // the screen, recessed into the back face
  out.push(recessX(CAM.x1, { u0: -SCREEN.u - 1, u1: SCREEN.u + 1, z0: SCREEN.z0 - 1, z1: SCREEN.z1 + 1, r: 1.6, depth: 1.4 }, screenArt(), "sl-screen"));
  out.push(D([at([CAM.x1, -18, 22.5]), at([CAM.x1, 18, 22.5]), at([CAM.x1, -18, 61.5]), at([CAM.x1, 18, 61.5])], { size: 0.42 }));
  return out.join("");
}

// ── Poster defs: six layers, masks for the subject swap ──
const ART_LAYERS = layers();
const BLOCKS = { cols: 10, rows: 12 };
let seed = 7;
const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const THRESH = Array.from({ length: BLOCKS.cols * BLOCKS.rows }, () => random());
function blockRects(on) {
  const w = POSTER.w / BLOCKS.cols, h = POSTER.h / BLOCKS.rows;
  return THRESH.map((_, i) => `<rect x="${((i % BLOCKS.cols) * w).toFixed(1)}" y="${(Math.floor(i / BLOCKS.cols) * h).toFixed(1)}" width="${(w + 0.6).toFixed(1)}" height="${(h + 0.6).toFixed(1)}" fill="${on ? "#fff" : "#000"}"/>`).join("");
}
const defs = [
  `<defs>`,
  `<linearGradient id="sl-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--sl-sky0)"/><stop offset=".55" style="stop-color:var(--sl-sky1)"/><stop offset="1" style="stop-color:var(--sl-sky2)"/></linearGradient>`,
  `<clipPath id="sl-poster"><rect width="${POSTER.w}" height="${POSTER.h}"/></clipPath>`,
  `<mask id="sl-m0" maskUnits="userSpaceOnUse" x="0" y="0" width="${POSTER.w}" height="${POSTER.h}"><g data-blocks="0">${blockRects(true)}</g></mask>`,
  `<mask id="sl-m1" maskUnits="userSpaceOnUse" x="0" y="0" width="${POSTER.w}" height="${POSTER.h}"><g data-blocks="1">${blockRects(false)}</g></mask>`,
  `<g id="sl-L0">${ART_LAYERS.base}</g>`,
  `<g id="sl-L1">${ART_LAYERS.fronds}</g>`,
  `<g id="sl-L2">${ART_LAYERS.branch}</g>`,
  `<g id="sl-L3"><g mask="url(#sl-m0)">${ART_LAYERS.parrot}</g><g mask="url(#sl-m1)">${ART_LAYERS.toucan}</g></g>`,
  `<g id="sl-L4"><g id="sl-title">${ART_LAYERS.title}</g></g>`,
  `<g id="sl-L5">${ART_LAYERS.front}</g>`,
  `</defs>`,
].join("");

// ── Camera framings for scenes 1–5: a world box per scene, fitted to the card's aspect ──
function frame(points, pad = 14, most = 2.3) {
  const flat = points.map(at);
  let x0 = Math.min(...flat.map((p) => p[0])) - pad, x1 = Math.max(...flat.map((p) => p[0])) + pad;
  let y0 = Math.min(...flat.map((p) => p[1])) - pad, y1 = Math.max(...flat.map((p) => p[1])) + pad;
  let w = Math.max(x1 - x0, WIDTH / most), h = Math.max(y1 - y0, HEIGHT / most);
  if (w / h > WIDTH / HEIGHT) h = (w * HEIGHT) / WIDTH; else w = (h * WIDTH) / HEIGHT;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return [cx - w / 2, cy - h / 2, w, h].map((n) => Math.round(n * 10) / 10);
}
const box = (xa, xb, ya, yb, za, zb) => [xa, xb].flatMap((x) => [ya, yb].flatMap((y) => [za, zb].map((z) => [x, y, z])));
const FRAMES = [
  [0, 0, WIDTH, HEIGHT],
  frame([...box(XR[5] - 3, XR[5] + 3, -10, 26, 30, 75), ...box(XL, CAM.x1, -CAM.y - CAM_RANGE, CAM.y + CAM_RANGE, 6, 70)], 10, 2.8),
  frame(box(XR[2] - 3, XR[4] + 3, -32, 32, 3, 75)),
  frame([...box(-50, XR[1] + 3, -32, 32, 0, 75)]),
  frame([...box(XR[3] - 3, XR[5] + 3, -26, 26, 3, 75), ...box(CAM.x1, CAM.x1, -16, 16, 22, 62)]),
];

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "一台光具座：后端是背光灯箱，滑轨上立着六片玻璃，每片装着同一张海报的一个图层（底图、棕榈叶、树枝、鹦鹉、标题、前景叶），由剪叉伸缩架按 z 顺序等距拉开；前端的相机屏幕显示这叠玻璃正对着看的合成画面。",
  body: [
    defs,
    plate(),
    lamp(),
    stop(RAIL.x0 - 4),
    rail(-1),
    `<g data-part="tongs"></g>`,
    rail(1),
    ...XR.map((_, i) => station(i)),
    stop(RAIL.x1),
    cameraBase(),
    `<g data-part="camera">${camera()}</g>`,
    bearing(SCREW.x0 - 6),
    screw(),
    `<g data-part="nut">${nut()}</g>`,
    bearing(SCREW.x1),
    wheel(),
  ],
});

const CONFIG = {
  P, N, X0, PMIN, PMAX, XR, BAR, TONG_A, TONG_B, SCREW, LEAD, WHEEL, XL, CAM_RANGE, SHIFT_GAIN,
  FRAMES, PALETTES, NAMES, THRESH, BLOCKS, POSTER,
  TITLE_MOVE: [-48, 244],
  RAIL_Y: RAIL.y,
};

const live = `
const C = ${JSON.stringify(CONFIG)};
const P = C.P;
const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const readout = document.querySelector("[data-readout]");
const status = document.querySelector("[data-status]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const stations = [...svg.querySelectorAll("[data-station]")];
const tongs = svg.querySelector('[data-part="tongs"]');
const nutEl = svg.querySelector('[data-part="nut"]');
const spokes = svg.querySelector('[data-part="spokes"]');
const crank = svg.querySelector('[data-part="crank"]');
const cam = svg.querySelector('[data-part="camera"]');
const shiftEls = [...svg.querySelectorAll("[data-shift]")];
const blocks = [0, 1].map((n) => [...svg.querySelectorAll('[data-blocks="' + n + '"] rect')]);
const titleEl = svg.querySelector("#sl-title");
const buttons = [...document.querySelectorAll("[data-scene]")];
// Boxes on the 0–1000 grid Seedream uses for regions, measured from the drawn art itself.
const toGrid = (b) => [b.x / C.POSTER.w, b.y / C.POSTER.h, (b.x + b.width) / C.POSTER.w, (b.y + b.height) / C.POSTER.h].map((v) => Math.round(v * 1000));
const subjects = [...svg.querySelectorAll("#sl-L3 > g")];
const BBOX = { parrot: toGrid(subjects[0].getBBox()), toucan: toGrid(subjects[1].getBBox()) };
const tb = titleEl.getBBox();
const TITLE_AT = [tb.x + tb.width / 2, tb.y + tb.height / 2];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const follow = (v, t, dt, tau, calm) => { if (calm) return t; const n = v + (t - v) * (1 - Math.exp(-dt / tau)); return Math.abs(t - n) < 1e-3 ? t : n; };
const fmt = (n) => (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(1);
const grid = ([x0, y0, x1, y1]) => [x0, y0, x1, y1].join(" ");
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => { const A = hex(a), B = hex(b); return "rgb(" + A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(",") + ")"; };

const SCENES = [
  { name: "拆分", lit: "sl-wheel", span: 7.5 },
  { name: "视差", lit: "sl-cam", span: 8 },
  { name: "换主体", lit: "sl-pane-3", span: 5.5 },
  { name: "换配色", lit: "sl-pane-0", span: 5.5 },
  { name: "移标题", lit: "sl-pane-4", span: 5.5 },
];
const s = {
  pitch: C.PMAX, pitchTo: C.PMAX,
  dy: 0, dyTo: 0,
  vb: C.FRAMES[0].slice(), vbTo: C.FRAMES[0].slice(),
  swap: 0, swapTo: 0, night: 0, nightTo: 0, title: 0, titleTo: 0,
  scene: 0, sceneClock: 0, fired: false,
};
let touring = !still.matches, tourClock = 0, frame = 0, last = 0, visible = false, idle = 0;
let drawnSwap = -1;

function xs(p) { return Array.from({ length: C.N }, (_, i) => C.X0 + i * p); }

function stadium(ax, ay, bx, by, r) {
  const ang = Math.atan2(by - ay, bx - ax), out = [];
  for (let i = 0; i <= 8; i++) { const a = ang + Math.PI / 2 + (i / 8) * Math.PI; out.push([ax + Math.cos(a) * r, ay + Math.sin(a) * r]); }
  for (let i = 0; i <= 8; i++) { const a = ang - Math.PI / 2 + (i / 8) * Math.PI; out.push([bx + Math.cos(a) * r, by + Math.sin(a) * r]); }
  return out;
}
function drawTongs(X, p) {
  const h = Math.sqrt(Math.max(0, C.BAR * C.BAR - p * p)) / 2;
  const A = [], B = [], pins = [];
  for (let i = 0; i < C.N - 1; i++) {
    A.push([X[i], -h, X[i + 1], h]);
    B.push([X[i], h, X[i + 1], -h]);
    pins.push([(X[i] + X[i + 1]) / 2, 0]);
  }
  X.forEach((x) => { pins.push([x, -h]); pins.push([x, h]); });
  const bars = (list, [z, hh]) => list.map(([ax, ay, bx, by]) => solidSvg(extrude(stadium(ax, ay, bx, by, 1.2), z, hh, P), { tone: "lo" })).join("");
  pins.sort((a, b) => depthOf([a[0], a[1], 0], P) - depthOf([b[0], b[1], 0], P));
  const pinSvg = pins.map(([x, y]) => solidSvg(cylinder(x, y, 1.15, 0.3, 2.7, P, 14), { tone: "mid" })).join("");
  tongs.innerHTML = bars(A, C.TONG_A) + bars(B, C.TONG_B) + pinSvg;
}

function setLit(cls) {
  svg.querySelectorAll("[data-lit]").forEach((el) => el.removeAttribute("data-lit"));
  svg.querySelectorAll(".sl-pane-edge").forEach((el) => el.setAttribute("data-tone", "lo"));
  svg.querySelectorAll("." + cls).forEach((el) => { if (el.classList.contains("iso-solid")) el.setAttribute("data-lit", ""); if (el.classList.contains("sl-pane-edge")) el.setAttribute("data-tone", "lit"); });
}

let lastPitch = null, lastDy = null;
function draw() {
  const X = xs(s.pitch);
  if (s.pitch !== lastPitch) {
    stations.forEach((el, i) => el.setAttribute("transform", translateAlong(P, [X[i] - C.XR[i], 0, 0])));
    nutEl.setAttribute("transform", translateAlong(P, [X[C.N - 1] - C.XR[C.N - 1], 0, 0]));
    drawTongs(X, s.pitch);
    const turn = ((X[C.N - 1] - (C.X0 + (C.N - 1) * C.PMIN)) / C.LEAD) * Math.PI * 2;
    const W = C.WHEEL, cy = C.SCREW.y, cz = C.SCREW.z;
    let d = "";
    for (let q = 0; q < 4; q++) {
      const a = turn + (q * Math.PI) / 2 + Math.PI / 4;
      d += segment([W.x + 3, cy + Math.cos(a) * 3, cz + Math.sin(a) * 3], [W.x + 3, cy + Math.cos(a) * W.rIn, cz + Math.sin(a) * W.rIn], P);
    }
    spokes.setAttribute("d", d);
    crank.setAttribute("transform", translateAlong(P, [0, W.crank * Math.cos(turn) - W.crank, W.crank * Math.sin(turn)]));
    lastPitch = s.pitch;
    lastDy = null;
  }
  if (s.dy !== lastDy) {
    cam.setAttribute("transform", translateAlong(P, [0, s.dy, 0]));
    shiftEls.forEach((el, i) => { const sh = (C.SHIFT_GAIN * s.dy) / (C.XL - X[i]); el.setAttribute("transform", sh ? "translate(" + sh.toFixed(2) + " 0)" : ""); });
    lastDy = s.dy;
  }
  if (s.swap !== drawnSwap) {
    blocks[0].forEach((el, i) => el.setAttribute("fill", C.THRESH[i] < s.swap ? "#000" : "#fff"));
    blocks[1].forEach((el, i) => el.setAttribute("fill", C.THRESH[i] < s.swap ? "#fff" : "#000"));
    drawnSwap = s.swap;
  }
  const pal = C.PALETTES;
  for (const key in pal.sunset) svg.style.setProperty("--sl-" + key, mix(pal.sunset[key], pal.night[key], s.night));
  titleEl.setAttribute("transform", s.title ? "translate(" + (C.TITLE_MOVE[0] * s.title).toFixed(1) + " " + (C.TITLE_MOVE[1] * s.title).toFixed(1) + ")" : "");
  svg.setAttribute("viewBox", s.vb.map((n) => n.toFixed(2)).join(" "));
  say();
}

function say() {
  const X = xs(s.pitch);
  let text = "";
  if (s.scene === 0) {
    const moving = Math.abs(s.pitch - s.pitchTo) > 0.05;
    if (moving) text = (s.pitchTo < s.pitch ? "合拢中" : "展开中") + " · 6 片 · 间距 " + s.pitch.toFixed(1);
    else if (s.pitch <= C.PMIN + 0.05) text = "合拢 · 6 层叠成一张平面图";
    else text = "6 层 · z 0–5 · 间距 " + s.pitch.toFixed(1);
  } else if (s.scene === 1) {
    const ratio = (C.XL - X[0]) / (C.XL - X[C.N - 1]);
    text = "相机 " + fmt(s.dy) + " · 前景层位移是底图的 " + ratio.toFixed(1) + "×";
  } else if (s.scene === 2) {
    // Before the scene fires its change, name the change it is about to make.
    const toToucan = s.fired ? s.swapTo > 0.5 : s.swapTo < 0.5;
    text = "z 3 · " + (toToucan ? "鹦鹉 → 巨嘴鸟 · " + grid(BBOX.toucan) : "巨嘴鸟 → 鹦鹉 · " + grid(BBOX.parrot));
  } else if (s.scene === 3) {
    const toNight = s.fired ? s.nightTo > 0.5 : s.nightTo < 0.5;
    text = "z 0 · " + (toNight ? "日落 → 月夜" : "月夜 → 日落") + " · 其余 5 层不动";
  } else {
    const cx = TITLE_AT[0] + C.TITLE_MOVE[0] * s.title, cy = TITLE_AT[1] + C.TITLE_MOVE[1] * s.title;
    text = "z 4 · 标题中心 " + Math.round((cx / C.POSTER.w) * 1000) + " " + Math.round((cy / C.POSTER.h) * 1000);
  }
  if (readout.textContent !== text) readout.textContent = text;
}

function enter(index, byUser) {
  s.scene = index;
  s.sceneClock = 0;
  s.fired = false;
  s.vbTo = C.FRAMES[index].slice();
  if (index !== 1) s.dyTo = 0;
  if (index > 0) s.pitchTo = C.PMAX;
  setLit(SCENES[index].lit);
  buttons.forEach((b, i) => b.setAttribute("aria-pressed", String(i === index)));
  status.textContent = "场景 " + (index + 1) + "：" + SCENES[index].name;
  if (byUser) { touring = false; clearTimeout(idle); idle = setTimeout(() => { if (!still.matches) { touring = true; tourClock = startOf((s.scene + 1) % SCENES.length); run(); } }, 12000); }
  run();
}
function startOf(index) { let t = 0; for (let i = 0; i < index; i++) t += SCENES[i].span; return t; }
const LOOP = SCENES.reduce((a, b) => a + b.span, 0);
function sceneAt(t) { t %= LOOP; for (let i = 0; i < SCENES.length; i++) { if (t < SCENES[i].span) return i; t -= SCENES[i].span; } return 0; }

function script(dt) {
  const t = (s.sceneClock += dt);
  if (s.scene === 0) s.pitchTo = t < 3.2 ? C.PMIN : C.PMAX;
  if (s.scene === 1) s.dyTo = t < 7 ? C.CAM_RANGE * Math.sin((t / 3.4) * Math.PI * 2) : 0;
  if (!s.fired && t > 0.7) {
    if (s.scene === 2) s.swapTo = s.swapTo > 0.5 ? 0 : 1;
    if (s.scene === 3) s.nightTo = s.nightTo > 0.5 ? 0 : 1;
    if (s.scene === 4) s.titleTo = s.titleTo > 0.5 ? 0 : 1;
    if (s.scene >= 2) s.fired = true;
  }
}

function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  const calm = still.matches;
  if (touring) {
    tourClock += dt;
    const index = sceneAt(tourClock);
    if (index !== s.scene) enter(index, false);
  }
  script(dt);
  s.pitch = follow(s.pitch, s.pitchTo, dt, 0.55, calm);
  s.dy = calm ? s.dyTo : follow(s.dy, s.dyTo, dt, 0.12, false);
  s.vb = s.vb.map((v, i) => follow(v, s.vbTo[i], dt, 0.5, calm));
  const step = (v, to, rate) => (calm ? to : v < to ? Math.min(to, v + dt * rate) : Math.max(to, v - dt * rate));
  s.swap = step(s.swap, s.swapTo, 0.9);
  s.night = follow(s.night, s.nightTo, dt, 0.45, calm);
  s.title = follow(s.title, s.titleTo, dt, 0.4, calm);
  draw();
  const settled = !touring && s.sceneClock > SCENES[s.scene].span && s.pitch === s.pitchTo && s.dy === s.dyTo && s.vb.every((v, i) => v === s.vbTo[i]) && s.swap === s.swapTo && s.night === s.nightTo && s.title === s.titleTo;
  frame = visible && !settled ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);

buttons.forEach((b, i) => b.addEventListener("click", () => enter(i, true)));
document.addEventListener("keydown", (event) => {
  if (event.target.closest && event.target.closest("input, textarea")) return;
  const n = Number(event.key);
  if (n >= 1 && n <= 5) { event.preventDefault(); enter(n - 1, true); }
});
stage.addEventListener("keydown", (event) => {
  let d = 0;
  if (event.key === "ArrowRight" || event.key === "ArrowUp") d = event.shiftKey ? 10 : 4;
  if (event.key === "ArrowLeft" || event.key === "ArrowDown") d = event.shiftKey ? -10 : -4;
  if (event.key === "Home") d = -99;
  if (event.key === "End") d = 99;
  if (!d) return;
  event.preventDefault();
  if (s.scene !== 0) enter(0, true); else enter(0, true);
  s.sceneClock = 99;
  s.pitchTo = clamp(s.pitchTo + d, C.PMIN, C.PMAX);
  run();
});
let drag = null;
stage.addEventListener("pointerdown", (event) => {
  drag = { x: event.clientX, from: s.pitchTo, moved: false };
  stage.setPointerCapture(event.pointerId);
});
stage.addEventListener("pointermove", (event) => {
  if (!drag) return;
  const dx = event.clientX - drag.x;
  if (!drag.moved && Math.abs(dx) < 4) return;
  if (!drag.moved) { drag.moved = true; if (s.scene !== 0) enter(0, true); else enter(0, true); }
  s.sceneClock = 99;
  const width = stage.getBoundingClientRect().width;
  s.pitchTo = clamp(drag.from + (dx / width) * (C.PMAX - C.PMIN) * 1.8, C.PMIN, C.PMAX);
  run();
});
const release = (event) => { if (drag) { try { stage.releasePointerCapture(event.pointerId); } catch (e) {} drag = null; } };
stage.addEventListener("pointerup", release);
stage.addEventListener("pointercancel", release);

if (still.matches) touring = false;
enter(0, false);
s.pitch = C.PMAX;
draw();
`;

const keys = [
  { mark: "lit", label: "正在处理的那一片（或正在动的部件）" },
  { mark: "raised", label: "玻璃片：每片一层，没有内容的地方是透明的" },
  { mark: "dim", label: "剪叉伸缩架：按 z 顺序把每片等距推开" },
];
const caption =
  "光具座上的六片玻璃，对应 Seedream 5.0 Pro 返回的一叠图层：底图（z 0）和五个透明层。合拢时它们就是那张平面海报；转动手轮拉开后，每个元素各在自己的玻璃上，底图里原本被鹦鹉和树枝挡住的地方已经补画完整。前端相机的屏幕显示整叠玻璃正对着看的合成画面。";

const scenes = [
  ["拆分", "Split"],
  ["视差", "Parallax"],
  ["换主体", "Swap subject"],
  ["换配色", "Recolour"],
  ["移标题", "Move title"],
];
const buttonsHtml = `<div class="sl-scenes" role="group" aria-label="场景">${scenes.map(([zh, en], i) => `<button type="button" class="sl-scene" data-scene="${i}" aria-pressed="${i === 0}"><span class="sl-num">${i + 1}</span>${zh}<span class="sl-en">${en}</span></button>`).join("")}</div><p class="sl-status" data-status aria-live="polite"></p>`;

const figure = k
  .plateHtml({
    fig: "Fig 1",
    title: "一张图 · 六个图层",
    hint: "拖动展开 · 按键 1–5",
    readout: "6 层 · z 0–5 · 间距 34.0",
    keys,
    caption,
    body: `<div class="iso-stage" tabindex="0" role="group" aria-label="光具座：拖动或用左右方向键展开、合拢玻璃片；按 1 到 5 切换场景">${svg}</div>`,
  })
  .replace("<figcaption", `${buttonsHtml}<figcaption`);

const intro = `
<header class="sl-head">
  <p class="sl-kicker">Seedream 5.0 Pro · 图层分离（Layer separation）</p>
  <h1>一张平面图进去，一叠可编辑图层出来</h1>
  <p>字节跳动的 Seedream 5.0 Pro（2026 年 7 月 8 日发布）有一个图层分离模式：给它一张做好的图，它返回一张底图，外加若干张透明 PNG 图层，每个元素一层，并且已经按从前到后的顺序排好（Atlas Cloud 的 API 页写的上限是 16 层，各平台不完全一致）。下面这台光具座把这件事做成了实物：每片玻璃装一层。</p>
  ${pickerHtml({ corner: true })}
</header>`;

const sections = `
<section class="sl-section">
  <h2>它是怎么拆图的</h2>
  <ol class="sl-steps">
    <li><b>找出元素。</b>不写提示词时，模型自己挑出每个主要元素；也可以点名（「鹦鹉」「标题文字」），或者框出一块区域来指定。</li>
    <li><b>补画底图。</b>元素被拿走以后，底图上它原来遮住的地方由模型补画出来，所以底图本身是一张完整的画。补出来的内容是模型推测的，不是原图里本来就有的像素。</li>
    <li><b>排好顺序输出。</b>每个元素是一张带透明通道的 PNG，按从前到后排好；按顺序叠回去，就得到原来那张图。</li>
  </ol>
</section>
<section class="sl-section">
  <h2>拆开以后能做什么</h2>
  <ol class="sl-uses">
    <li><b>拆分：</b>一张已经定稿的图，变回可以逐层修改的分层源文件。</li>
    <li><b>视差：</b>每层按离镜头的远近错开移动，就是 2.5D 视差动画和带景深的动态壁纸的做法。离镜头越近的层移动越多，倍数等于两层到镜头的距离之比。</li>
    <li><b>换主体：</b>只重画一层（鹦鹉换成巨嘴鸟），其他层的像素一点不变。</li>
    <li><b>换配色：</b>只改底图的配色（日落换成月夜），前景元素保持原样。</li>
    <li><b>移标题：</b>标题是单独的一层，可以随意移动或改字；它背后不用再补画，因为底图已经是完整的。</li>
  </ol>
  <p class="sl-note">局限：毛发、半透明物体和互相交缠的元素，边缘可能拆得不干净；补画出来的背景是猜的，画面里本来看不到的信息无法真正还原。</p>
  <p class="sl-note">资料：<a href="https://www.atlascloud.ai/models/seedream-5.0-pro">Atlas Cloud · Seedream 5.0 Pro</a> · <a href="https://creatorsecrets.co/p/seedream-5-0-splits-a-finished-image-into-editable-layers-plus-hi3d-and-gpt-5-6">Creator Secrets：Layerize 模式</a>。图中的海报和六个图层是为了说明手工画的，不是模型的真实输出。插图由 <a href="https://github.com/wheresryan22/anatomy">Anatomy</a> skill 生成。</p>
</section>`;

// Figure and page styles; the surface tokens come from ../anatomy-surfaces.
const STYLE = `
.iso-svg{--sl-sky0:${PALETTES.sunset.sky0};--sl-sky1:${PALETTES.sunset.sky1};--sl-sky2:${PALETTES.sunset.sky2};--sl-sun:${PALETTES.sunset.sun};--sl-far:${PALETTES.sunset.far};--sl-mid:${PALETTES.sunset.mid};--sl-near:${PALETTES.sunset.near};--sl-ground:${PALETTES.sunset.ground}}
.sl-art path,.sl-art circle,.sl-art ellipse,.sl-art rect{vector-effect:none}
.sl-glass{fill:var(--fig-glass);fill-opacity:var(--fig-glass-o);stroke:none}
.sl-screen{fill:var(--fig-screen)}
.sl-lens{fill:var(--fig-lens);fill-opacity:.35}
.iso-stage{touch-action:pan-y;cursor:ew-resize;outline:none}
.iso-stage .iso-svg{overflow:hidden}
.iso-stage:focus-visible{outline:1px solid var(--anatomy-muted);outline-offset:6px}
.sl-head{position:relative;margin-bottom:8px}
.sl-head p{margin:0 0 12px;max-width:62ch}
.sl-kicker{padding-right:104px;font-family:var(--anatomy-mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--anatomy-muted)}
.sl-head h1{margin:0 0 12px;color:var(--anatomy-strong);font-size:24px;line-height:1.3;font-weight:650;letter-spacing:-.01em;padding-right:44px;text-wrap:balance;word-break:keep-all}
.sl-scenes{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.sl-scene{font:12px/1 var(--anatomy-mono);color:var(--anatomy-text);background:transparent;border:1px solid var(--anatomy-lo);border-radius:999px;padding:8px 12px;display:inline-flex;align-items:center;gap:6px;cursor:pointer;min-height:34px}
.sl-scene:hover{border-color:var(--anatomy-mid)}
.sl-scene[aria-pressed="true"]{border-color:var(--anatomy-strong);color:var(--anatomy-strong)}
.sl-num{color:var(--anatomy-muted)}
.sl-en{color:var(--anatomy-muted);font-size:10.5px}
.sl-status{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.iso-caption{display:block}
.sl-section{margin-top:40px}
.sl-section h2{color:var(--anatomy-strong);font-size:17px;margin:0 0 12px;font-weight:650}
.sl-steps,.sl-uses{margin:0;padding-left:22px;display:grid;gap:10px}
.sl-steps b,.sl-uses b{color:var(--anatomy-strong);font-weight:600}
.sl-note{color:var(--anatomy-muted);font-size:13px;margin:14px 0 0}
.sl-note a{color:var(--anatomy-text)}
@media (max-width:560px){.sl-en{display:none}.sl-head h1{font-size:20px}.iso-plate-corner[data-corner="title"]{display:none}.iso-stage{overflow:hidden;margin:0 -12px}.iso-stage .iso-svg{width:118%;margin-left:-9%}}
`;

const forced = ["light", "dark", "black"].find((name) => process.argv.includes("--" + name)) || null;
const { html, fragment } = pageDocument({
  isoCss: k.ISO_CSS,
  title: "Seedream 图层光具座",
  body: intro + figure + sections,
  script: kitScript() + live,
  css: STYLE,
  force: forced === "dark" ? "navy" : forced,
  key: "sl-surface",
});
const out = forced ? `seedream-layers-${forced}.html` : "seedream-layers.html";
writeFileSync(join(HERE, out), html);
console.log("wrote", out, (html.length / 1024).toFixed(0) + " KB");
// Artifact build: the viewer wraps the page in its own document skeleton.
const artifactAt = process.env.ARTIFACT_OUT;
if (artifactAt && !forced) { writeFileSync(artifactAt, fragment); console.log("wrote", artifactAt); }
