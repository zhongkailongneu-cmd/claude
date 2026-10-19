// Draws the schematic brain views from geometry.js in the Loyel palette.
import { LATERAL, MEDIAL, polyPath, taper, catmull } from "./geometry.js";
import { P, rgba } from "./palette.js";

function buildView(g) {
  const v = { g, paths: {}, masks: {}, sulci: [], anchors: g.anchors };
  for (const [k, pts] of Object.entries(g)) {
    if (["masks", "anchors", "sulci", "fissures", "conventional", "cerebellumFolia", "brainstemLines", "arbor", "lobes", "stalk", "ventricle4"].includes(k)) continue;
    if (Array.isArray(pts) && Array.isArray(pts[0])) v.paths[k] = polyPath(pts);
  }
  if (g.lobes) for (const [k, pts] of Object.entries(g.lobes)) v.paths[k] = polyPath(pts);
  for (const [k, m] of Object.entries(g.masks)) v.masks[k] = { clip: m.clip, path: polyPath(m.pts) };
  v.sulci = g.sulci.map((s) => polyPath(taper(s, 6.5)));
  if (g.fissures) v.fissures = g.fissures.map((s) => polyPath(s, false));
  if (g.conventional) v.conventional = g.conventional.map((s) => polyPath(s, false));
  if (g.cerebellumFolia) v.folia = g.cerebellumFolia.map((s) => polyPath(taper(s, 4.5)));
  if (g.brainstemLines) v.bsLines = g.brainstemLines.map((s) => polyPath(taper(s, 4)));
  if (g.arbor) v.arbor = g.arbor.map((s) => polyPath(taper(s, 9)));
  if (g.ventricle4) v.paths.ventricle4 = polyPath(g.ventricle4);
  if (g.stalk) v.stalk = polyPath(g.stalk, false);
  return v;
}

export const VIEWS = { lateral: buildView(LATERAL), medial: buildView(MEDIAL) };

// Every highlightable thing, and which view/path draws it.
const LOBES = ["frontal", "parietal", "temporal", "occipital"];
const LOBE_TINT = { frontal: P.c70, parietal: P.c60, temporal: P.c80, occipital: P.c50 };

function hatch(ctx, t, alpha) {
  ctx.save();
  ctx.strokeStyle = rgba(P.c20, alpha);
  ctx.lineWidth = 1.5;
  const off = (t * 40) % 16;
  ctx.beginPath();
  for (let x = -900 + off; x < 1100; x += 16) {
    ctx.moveTo(x, 900);
    ctx.lineTo(x + 900, 0);
  }
  ctx.stroke();
  ctx.restore();
}

function litFill(ctx, path, lit, t, clipPath) {
  if (lit <= 0.001) return;
  ctx.save();
  if (clipPath) ctx.clip(clipPath);
  ctx.clip(path);
  const g = ctx.createLinearGradient(0, 80, 0, 720);
  g.addColorStop(0, rgba(P.c40, 0.92 * lit));
  g.addColorStop(0.55, rgba(P.c50, 0.92 * lit));
  g.addColorStop(1, rgba(P.c60, 0.92 * lit));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1000, 820);
  hatch(ctx, t, 0.22 * lit);
  ctx.restore();
}

function litEdge(ctx, path, lit, clipPath, width = 3.5) {
  if (lit <= 0.001) return;
  ctx.save();
  if (clipPath) ctx.clip(clipPath);
  ctx.shadowColor = rgba(P.c40, 0.95);
  ctx.shadowBlur = 26 * lit;
  ctx.strokeStyle = rgba(P.c10, Math.min(1, lit * 1.2));
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.stroke(path);
  ctx.restore();
}

function drawSulci(ctx, v, alpha, clipPath) {
  ctx.save();
  if (clipPath) ctx.clip(clipPath);
  ctx.fillStyle = rgba(P.c50, alpha);
  for (const s of v.sulci) ctx.fill(s);
  ctx.restore();
}

/**
 * state = {
 *   lit: { key: 0..1 }   highlighted lobes / masks / deep structures
 *   dim: 0..1           darken everything that is not lit
 *   tint: 0..1          per-lobe colour tint (overview)
 *   reveal: 0..1|null   line-drawing build-up
 *   ghost: 0..1         show deep-structure projections (lateral) / hippocampus+amygdala (medial)
 *   t: seconds          animates hatching
 *   glow: 0..1          global outline glow boost (beats)
 * }
 */
export function drawBrain(ctx, viewName, st) {
  const v = VIEWS[viewName];
  const lit = st.lit || {};
  const L = (k) => lit[k] || 0;
  const t = st.t || 0;
  const dim = st.dim || 0;
  const glow = st.glow || 0;
  if (st.reveal != null && st.reveal < 1) return drawReveal(ctx, v, viewName, st.reveal);

  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (viewName === "lateral") drawLateral(ctx, v, L, st, t, dim, glow);
  else drawMedial(ctx, v, L, st, t, dim, glow);
  ctx.restore();
}

function baseFill(ctx, path, top = P.c80, bottom = P.c90) {
  const g = ctx.createLinearGradient(0, 80, 0, 640);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fill(path);
}

function softShade(ctx, path, cx, cy, r, alpha) {
  ctx.save();
  ctx.clip(path);
  const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, r);
  g.addColorStop(0, rgba(P.c60, alpha));
  g.addColorStop(1, rgba(P.c60, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1000, 820);
  ctx.restore();
}

function dimOver(ctx, path, amount) {
  if (amount <= 0.001) return;
  ctx.fillStyle = rgba(P.c100, 0.62 * amount);
  ctx.fill(path);
}

function outline(ctx, path, glow, alpha = 1) {
  ctx.save();
  ctx.shadowColor = rgba(P.c50, 0.9);
  ctx.shadowBlur = 14 + 22 * glow;
  ctx.strokeStyle = rgba(P.c30, alpha);
  ctx.lineWidth = 3;
  ctx.stroke(path);
  ctx.restore();
}

function drawLateral(ctx, v, L, st, t, dim, glow) {
  const p = v.paths;
  // brainstem and cerebellum sit under the cerebrum
  baseFill(ctx, p.brainstem, P.c80, P.c90);
  ctx.fillStyle = rgba(P.c50, 0.5);
  v.bsLines.forEach((s) => ctx.fill(s));
  litFill(ctx, p.brainstem, L("brainstem"), t);
  dimOver(ctx, p.brainstem, dim * (1 - L("brainstem")));
  outline(ctx, p.brainstem, glow, 0.75);
  litEdge(ctx, p.brainstem, L("brainstem"));

  baseFill(ctx, p.cerebellum, P.c80, P.c90);
  ctx.fillStyle = rgba(P.c50, 0.6);
  v.folia.forEach((s) => ctx.fill(s));
  litFill(ctx, p.cerebellum, L("cerebellum"), t);
  if (L("cerebellum") > 0) {
    ctx.save();
    ctx.fillStyle = rgba(P.c10, 0.55 * L("cerebellum"));
    v.folia.forEach((s) => ctx.fill(s));
    ctx.restore();
  }
  dimOver(ctx, p.cerebellum, dim * (1 - L("cerebellum")));
  outline(ctx, p.cerebellum, glow, 0.8);
  litEdge(ctx, p.cerebellum, L("cerebellum"));

  // cerebrum
  ctx.save();
  ctx.shadowColor = rgba(P.c100, 0.9);
  ctx.shadowBlur = 30;
  baseFill(ctx, p.outline);
  ctx.restore();
  softShade(ctx, p.outline, 420, 230, 520, 0.55);
  const tint = st.tint || 0;
  for (const k of LOBES) {
    if (tint > 0) {
      ctx.save();
      ctx.globalAlpha = 0.7 * tint;
      ctx.fillStyle = LOBE_TINT[k];
      ctx.fill(p[k]);
      ctx.restore();
    }
    litFill(ctx, p[k], L(k), t);
  }
  for (const [k, m] of Object.entries(v.masks)) litFill(ctx, m.path, L(k), t, p[m.clip]);

  // dim everything that is not lit (lobes; masks lift their own area back)
  if (dim > 0) {
    for (const k of LOBES) {
      const own = L(k);
      if (own >= 0.999) continue;
      ctx.save();
      ctx.clip(p[k]);
      ctx.fillStyle = rgba(P.c100, 0.62 * dim * (1 - own));
      ctx.fillRect(0, 0, 1000, 820);
      ctx.restore();
    }
    for (const [k, m] of Object.entries(v.masks)) {
      if (L(k) > 0) {
        ctx.save();
        ctx.clip(p[m.clip]);
        ctx.clip(m.path);
        // undo the dimming inside a lit mask
        litFill(ctx, m.path, L(k), t);
        ctx.restore();
      }
    }
  }

  drawSulci(ctx, v, 0.55);
  // brighter sulci inside lit areas
  for (const k of LOBES) if (L(k) > 0) drawSulciLit(ctx, v, p[k], L(k));
  for (const [k, m] of Object.entries(v.masks)) if (L(k) > 0) drawSulciLit(ctx, v, m.path, L(k), p[m.clip]);

  // fissures and conventional boundaries
  ctx.save();
  ctx.strokeStyle = rgba(P.c40, 0.9);
  ctx.lineWidth = 4;
  v.fissures.forEach((f) => ctx.stroke(f));
  ctx.setLineDash([7, 9]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = rgba(P.c40, 0.55);
  v.conventional.forEach((f) => ctx.stroke(f));
  ctx.restore();

  outline(ctx, p.outline, glow);
  for (const k of LOBES) litEdge(ctx, p[k], L(k), null, 4);
  for (const [k, m] of Object.entries(v.masks)) litEdge(ctx, m.path, L(k), p[m.clip]);

  // glass-brain hints of deep structures
  const ghost = st.ghost || 0;
  if (ghost > 0) {
    const a = v.anchors;
    ctx.save();
    ctx.setLineDash([5, 6]);
    ctx.strokeStyle = rgba(P.c20, 0.8 * ghost);
    ctx.fillStyle = rgba(P.c40, 0.25 * ghost);
    ctx.lineWidth = 2;
    for (const [x, y, rx, ry] of [[...a.amygdala_proj, 20, 15], [...a.hippocampus_proj, 70, 14], [...a.thalamus_proj, 46, 28]]) {
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, -0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawSulciLit(ctx, v, path, lit, clip2) {
  ctx.save();
  if (clip2) ctx.clip(clip2);
  ctx.clip(path);
  ctx.fillStyle = rgba(P.c10, 0.75 * lit);
  for (const s of v.sulci) ctx.fill(s);
  ctx.restore();
}

function drawMedial(ctx, v, L, st, t, dim, glow) {
  const p = v.paths;
  const deep = ["thalamus", "hypothalamus", "pituitary", "brainstem", "cerebellum", "cc", "fornix"];

  // cerebellum behind the brainstem
  baseFill(ctx, p.cerebellum, P.c80, P.c90);
  ctx.fillStyle = rgba(P.c40, 0.55);
  v.arbor.forEach((s) => ctx.fill(s));
  litFill(ctx, p.cerebellum, L("cerebellum"), t);
  dimOver(ctx, p.cerebellum, dim * (1 - L("cerebellum")));
  outline(ctx, p.cerebellum, glow, 0.8);

  // cortex (medial surface)
  ctx.save();
  ctx.shadowColor = rgba(P.c100, 0.9);
  ctx.shadowBlur = 30;
  baseFill(ctx, p.outline);
  ctx.restore();
  softShade(ctx, p.outline, 380, 260, 520, 0.5);
  // cingulate gyrus band, slightly lighter
  ctx.save();
  ctx.clip(p.outline);
  ctx.fillStyle = rgba(P.c70, 0.55);
  ctx.fill(p.cingOuter);
  ctx.restore();

  for (const [k, m] of Object.entries(v.masks)) litFill(ctx, m.path, L(k), t, p[m.clip]);
  if (dim > 0) {
    ctx.save();
    ctx.clip(p.outline);
    ctx.fillStyle = rgba(P.c100, 0.62 * dim);
    ctx.fillRect(0, 0, 1000, 820);
    ctx.restore();
    for (const [k, m] of Object.entries(v.masks)) if (L(k) > 0) litFill(ctx, m.path, L(k), t, p[m.clip]);
  }
  drawSulci(ctx, v, 0.55, p.outline);
  for (const [k, m] of Object.entries(v.masks)) if (L(k) > 0) drawSulciLit(ctx, v, m.path, L(k), p[m.clip]);

  // septal / ventricular cut surface under the corpus callosum
  ctx.fillStyle = P.c100;
  ctx.fill(p.interior);

  // corpus callosum (white matter band)
  ctx.save();
  const gcc = ctx.createLinearGradient(320, 230, 710, 340);
  gcc.addColorStop(0, rgba(P.c40, 0.95));
  gcc.addColorStop(1, rgba(P.c50, 0.95));
  ctx.fillStyle = gcc;
  ctx.fill(p.cc);
  ctx.strokeStyle = rgba(P.c20, 0.8);
  ctx.lineWidth = 2;
  ctx.stroke(p.cc);
  ctx.restore();
  dimOver(ctx, p.cc, dim * (1 - L("cc")) * 0.8);
  litFill(ctx, p.cc, L("cc"), t);

  // fornix
  ctx.fillStyle = rgba(P.c50, 0.85);
  ctx.fill(p.fornix);
  dimOver(ctx, p.fornix, dim * 0.8);

  // diencephalon + brainstem
  for (const k of ["brainstem", "thalamus", "hypothalamus"]) {
    baseFill(ctx, p[k], k === "brainstem" ? P.c80 : P.c70, k === "brainstem" ? P.c90 : P.c80);
    litFill(ctx, p[k], L(k), t);
    dimOver(ctx, p[k], dim * (1 - L(k)));
    ctx.save();
    ctx.strokeStyle = rgba(P.c30, 0.75);
    ctx.lineWidth = 2;
    ctx.stroke(p[k]);
    ctx.restore();
  }
  ctx.fillStyle = P.c100;
  ctx.fill(p.ventricle4);
  // pituitary, stalk, chiasm, mammillary body
  ctx.save();
  ctx.strokeStyle = rgba(P.c40, 0.9);
  ctx.lineWidth = 6;
  ctx.stroke(v.stalk);
  ctx.restore();
  for (const k of ["pituitary", "chiasm", "mammillary"]) {
    baseFill(ctx, p[k], P.c60, P.c70);
    const lk = k === "pituitary" ? Math.max(L("pituitary"), L("hypothalamus") * 0.6) : L("hypothalamus") * (k === "mammillary" ? 1 : 0);
    litFill(ctx, p[k], lk, t);
    dimOver(ctx, p[k], dim * (1 - lk));
    ctx.strokeStyle = rgba(P.c30, 0.8);
    ctx.lineWidth = 1.5;
    ctx.stroke(p[k]);
  }

  // hippocampus and amygdala are lateral to the mid-line: drawn as projections
  const ghost = st.ghost ?? 0.6;
  for (const k of ["hippocampus", "amygdala"]) {
    const lk = L(k);
    const a = Math.max(ghost * 0.6, lk);
    if (a <= 0.01) continue;
    ctx.save();
    ctx.fillStyle = rgba(P.c40, 0.28 * a);
    ctx.fill(p[k]);
    ctx.restore();
    litFill(ctx, p[k], lk, t);
    ctx.save();
    ctx.setLineDash(lk > 0.5 ? [] : [5, 5]);
    ctx.strokeStyle = rgba(P.c20, 0.85 * a);
    ctx.lineWidth = 2;
    ctx.stroke(p[k]);
    ctx.restore();
  }

  outline(ctx, p.outline, glow);
  for (const k of deep) litEdge(ctx, p[k], L(k));
  for (const k of ["hippocampus", "amygdala"]) litEdge(ctx, p[k], L(k));
  for (const [k, m] of Object.entries(v.masks)) litEdge(ctx, m.path, L(k), p[m.clip]);
}

// Line-drawing build-up used in the intro: outline first, then sulci.
function drawReveal(ctx, v, viewName, r) {
  const g = v.g;
  const lines = [];
  if (viewName === "lateral") {
    lines.push({ pts: g.outline, w: 3, a: 1 });
    lines.push({ pts: g.cerebellum, w: 2.5, a: 0.9 });
    lines.push({ pts: g.brainstem, w: 2.5, a: 0.9 });
    g.fissures.forEach((f) => lines.push({ pts: f, w: 3, a: 0.95 }));
    g.conventional.forEach((f) => lines.push({ pts: f, w: 1.5, a: 0.6 }));
    g.sulci.forEach((s) => lines.push({ pts: catmull(s, false, 8), w: 2, a: 0.7 }));
  }
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = rgba(P.c40, 0.9);
  ctx.shadowBlur = 14;
  const n = lines.length;
  lines.forEach((ln, i) => {
    // outline draws over the first 45%, the rest staggers in afterwards
    const start = i === 0 ? 0 : 0.3 + (0.6 * (i - 1)) / n;
    const dur = i === 0 ? 0.45 : 0.25;
    const k = Math.max(0, Math.min(1, (r - start) / dur));
    if (k <= 0) return;
    const m = Math.max(2, Math.floor(ln.pts.length * k));
    ctx.strokeStyle = rgba(P.c30, ln.a);
    ctx.lineWidth = ln.w;
    ctx.beginPath();
    for (let j = 0; j < m; j++) (j ? ctx.lineTo : ctx.moveTo).call(ctx, ln.pts[j][0], ln.pts[j][1]);
    ctx.stroke();
    // bright pen tip
    if (k < 1) {
      const [x, y] = ln.pts[m - 1];
      ctx.fillStyle = P.c10;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  ctx.restore();
}
