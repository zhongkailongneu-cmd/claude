// Drawing for the parts that move. The build calls these for the first frame; the page inlines the same source
// and calls them every frame. K is the kit (iso, depthOf, extrude, cylinder, solidSvg, lineSvg, …).

const DEG = Math.PI / 180;

// A band of a ring, from angle a0 to a1 (degrees), as a floor outline.
function sectorRing(cx, cy, r0, r1, a0, a1, steps) {
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const a = (a0 + ((a1 - a0) * i) / steps) * DEG;
    out.push([cx + r1 * Math.cos(a), cy + r1 * Math.sin(a)]);
  }
  for (let i = steps; i >= 0; i--) {
    const a = (a0 + ((a1 - a0) * i) / steps) * DEG;
    out.push([cx + r0 * Math.cos(a), cy + r0 * Math.sin(a)]);
  }
  return out;
}

// A thin vane from radius r0 to r1 at angle a (degrees).
function vaneRing(cx, cy, r0, r1, a, half) {
  const c = Math.cos(a * DEG), s = Math.sin(a * DEG);
  const nx = -s * half, ny = c * half;
  return [
    [cx + c * r0 + nx, cy + s * r0 + ny],
    [cx + c * r1 + nx, cy + s * r1 + ny],
    [cx + c * r1 - nx, cy + s * r1 - ny],
    [cx + c * r0 - nx, cy + s * r0 - ny],
  ];
}

// Where a symbol drawn at the world origin has to move to sit at `point`.
function placeAt(K, P, point) {
  const [x, y] = K.iso(point, P);
  return `translate(${(x - P.origin[0]).toFixed(2)} ${(y - P.origin[1]).toFixed(2)})`;
}

export function ballUse(K, P, point, alpha = 1) {
  return `<use href="#mm-ball" transform="${placeAt(K, P, point)}"${alpha < 1 ? ` opacity="${Math.max(0, alpha).toFixed(2)}"` : ""}/>`;
}

export function wedgeUse(K, P, point, alpha = 1) {
  return `<use href="#mm-wedge" transform="${placeAt(K, P, point)}"${alpha < 1 ? ` opacity="${Math.max(0, alpha).toFixed(2)}"` : ""}/>`;
}

// One transporter: a revolving door on a pad, two side shells, a hub with four vanes, and a bearing bridge
// to the wall rail. The compartment facing the tray (90°) is outward-open, the one facing the wall (270°)
// inward-open; the side compartments are occluded by the shells.
export function rotorSvg(K, P, G, rotor, { cargo = null, wedge = null, sodium = null } = {}) {
  const { cx, cy } = rotor;
  const { R, padTop, top, wingTop, floor, wallY } = G;
  const items = [];
  const put = (depth, svg) => items.push([depth, svg]);
  const at = (r, a, z) => [cx + r * Math.cos(a * DEG), cy + r * Math.sin(a * DEG), z];
  for (const [a0, a1] of [[135, 225], [-45, 45]]) {
    for (let i = 0; i < 4; i++) {
      const b0 = a0 + ((a1 - a0) * i) / 4, b1 = a0 + ((a1 - a0) * (i + 1)) / 4;
      const paths = K.extrude(sectorRing(cx, cy, R - 1.1, R, b0, b1, 4), padTop, top - padTop, P, { convex: false });
      put(K.depthOf(at(R - 0.55, (b0 + b1) / 2, (padTop + top) / 2), P), K.solidSvg(paths, { tone: "mid" }));
    }
  }
  for (let k = 0; k < 4; k++) {
    const a = 45 + 90 * k + rotor.angle;
    const paths = K.extrude(vaneRing(cx, cy, 1.25, R - 1.5, a, 0.35), padTop, wingTop - padTop, P);
    put(K.depthOf(at((R - 0.25) / 2, a, (padTop + wingTop) / 2), P), K.solidSvg(paths, { tone: "hi", crease: "lo" }));
  }
  put(K.depthOf([cx, cy, (padTop + top) / 2], P), K.solidSvg(K.cylinder(cx, cy, 1.25, padTop, top - padTop, P, 16), { tone: "hi", crease: "lo" }));
  if (cargo) {
    put(K.depthOf(cargo, P), ballUse(K, P, cargo));
    if (sodium) put(K.depthOf(sodium, P) + 0.01, `<circle class="mm-na" cx="${K.iso(sodium, P)[0].toFixed(1)}" cy="${K.iso(sodium, P)[1].toFixed(1)}" r="0.9"/>`);
  }
  if (wedge) put(K.depthOf([wedge[0], wedge[1], wedge[2] + 2], P), wedgeUse(K, P, wedge));
  items.sort((a, b) => a[0] - b[0]);
  const pad = K.solidSvg(K.cylinder(cx, cy, R + 1.2, floor, padTop - floor, P, 40, 0.4), { tone: "mid" });
  const bridge = K.solidSvg(K.slabOf({ x: cx - 1.5, y: wallY + 2, w: 3, d: cy - wallY - 2 + 1.5, r: 0.8 }, top, 1.6, P, 3, 0.3), { tone: "mid" });
  const cap = K.solidSvg(K.cylinder(cx, cy, 2.3, top + 1.6, 1.4, P, 20), { tone: "mid" }) + K.dotsSvg([K.iso([cx, cy, top + 3], P)], { size: 0.5, tone: "hi" });
  return pad + items.map((item) => item[1]).join("") + bridge + cap;
}

// The release port's gate: a plate that slides down over the mouth as the autoreceptor throttles release.
export function gateSvg(K, P, G, x, throttle) {
  const { wallY, mouth } = G;
  const bottom = mouth.z0 + (mouth.z1 - mouth.z0) * (0.25 + 0.75 * throttle);
  const plan = { x: x - mouth.half - 0.6, y: wallY + 7, w: (mouth.half + 0.6) * 2, d: 0.8, r: 0.2 };
  return K.solidSvg(K.slabOf(plan, bottom, mouth.z1 + 1.6 - bottom, P, 2), { tone: "hi", crease: "lo" });
}

// A dial needle (face up), swept over 270° from −135°.
export function needleD(K, P, [x, y], r, z, share) {
  const a = (-135 + 270 * Math.max(0, Math.min(1, share))) * DEG;
  return K.lineOnTop([x - Math.sin(a) * 1.8, y + Math.cos(a) * 1.8], [x + Math.sin(a) * r, y - Math.cos(a) * r], z, P);
}

// The drug level in the reservoir: a lit column.
export function liquidSvg(K, P, [x, y], r, z0, h) {
  if (h < 0.3) return "";
  return K.solidSvg(K.cylinder(x, y, r, z0, h, P, 48), { tone: "hi", lit: true, crease: "none", className: "mm-drug" });
}
