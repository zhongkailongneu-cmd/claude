// One renderer per scene kind (see timeline.json). Each receives the frame
// state S: S.lb = beats since the scene started, S.t = seconds since the
// video started, plus beat envelopes (S.kick, S.snare ...).
import { P, rgba } from "./palette.js";
import { drawBrain, VIEWS } from "./brain.js";
import { txt, measure, slam, chip, callout, roundRect, clamp, lerp, easeOut, easeInOut, easeBack, FONT } from "./ui.js";
import { ring, burst, NODES, rng, envelope } from "./fx.js";
import * as Wd from "./widgets.js";

// ---- camera ------------------------------------------------------------------
const STAGE = { x: 600, y: 492 };
const CENTER = [503, 446];

export function cam(view, o = {}) {
  return { view, cx: o.cx ?? CENTER[0], cy: o.cy ?? CENTER[1], z: o.z ?? 1, sx: o.sx ?? 1, x: o.x ?? STAGE.x, y: o.y ?? STAGE.y };
}
export function toScreen(c, [bx, by]) {
  return [c.x + (bx - c.cx) * c.z * c.sx, c.y + (by - c.cy) * c.z];
}
function withCam(ctx, c, fn) {
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.scale(c.z * c.sx, c.z);
  ctx.translate(-c.cx, -c.cy);
  fn();
  ctx.restore();
}
function brain(ctx, S, c, st) {
  const z = c.z * (1 + 0.012 * clamp(S.kick));
  withCam(ctx, { ...c, z }, () => drawBrain(ctx, c.view, { t: S.t, glow: clamp(S.snare * 0.8 + S.impact), ...st }));
}
const anchor = (view, key) => VIEWS[view].anchors[key];
const focus = (view, key, k, z) => {
  const a = anchor(view, key);
  return { cx: lerp(CENTER[0], a[0], k), cy: lerp(CENTER[1], a[1], k), z };
};

// flip transition between lateral and medial views (squash on the last beat, expand on the first)
function flipScale(S) {
  let sx = 1;
  const sc = S.sc;
  const len = sc.len * 4;
  if (S.next && S.next.view !== sc.view && isSingle(S.next.view) && isSingle(sc.view) && S.lb > len - 1) {
    sx = Math.cos((Math.PI / 2) * clamp(S.lb - (len - 1)));
  }
  if (S.prev && S.prev.view !== sc.view && isSingle(S.prev.view) && isSingle(sc.view) && S.lt < 0.22) {
    sx = Math.sin((Math.PI / 2) * clamp(S.lt / 0.22));
  }
  return Math.max(0.02, sx);
}
const isSingle = (v) => v === "lateral" || v === "medial";

// ---- shared panel bits ----------------------------------------------------------
const PX = 1110, PW = 740;

function bigIndex(ctx, n, S) {
  ctx.save();
  ctx.globalAlpha = 0.9 * clamp(S.lt * 6);
  ctx.font = `800 260px ${FONT.title}, NotoSC, sans-serif`;
  ctx.lineWidth = 2;
  ctx.strokeStyle = rgba(P.c60, 0.8);
  ctx.textAlign = "right";
  ctx.strokeText(String(n).padStart(2, "0"), 1860, 330);
  ctx.restore();
}

function divider(ctx, x, y, w, p) {
  ctx.fillStyle = P.c50;
  ctx.fillRect(x, y, w * easeOut(p), 3);
  ctx.fillStyle = P.c10;
  ctx.fillRect(x, y - 1, 60 * easeOut(p), 5);
}

// ---- intro ------------------------------------------------------------------------
function stat(ctx, S) {
  const sc = S.sc, lb = S.lb, age = S.lt;
  const cx = 960, cy = 450;
  if (sc.id === "S04") return statBrain(ctx, S);
  if (sc.id === "S01") {
    const hb = envelope(S.BM.kick, S.t, 0.12);
    const r = 14 + 26 * hb;
    ctx.save();
    ctx.shadowColor = P.c40;
    ctx.shadowBlur = 60;
    ctx.fillStyle = P.c10;
    ctx.beginPath();
    ctx.arc(cx, cy - 180, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    for (const k of [0, 2, 4, 6]) ring(ctx, cx, cy - 180, lb - k, { dur: 1.2, r1: 260, width: 4 });
    burst(ctx, cx, cy - 180, age, 3, { dur: 0.8 });
  }
  if (sc.id === "S02") {
    const n = Math.floor(NODES.length * clamp(lb / 5));
    ctx.save();
    ctx.lineWidth = 1.2;
    for (let i = 0; i < n; i++) {
      const a = NODES[i];
      for (let j = i + 1; j < n; j++) {
        const b = NODES[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < 190) {
          ctx.strokeStyle = rgba(P.c50, 0.45 * (1 - d / 190));
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }
    for (let i = 0; i < n; i++) {
      const a = NODES[i];
      const fl = 0.5 + 0.5 * Math.sin(S.t * 5 + a.ph);
      ctx.fillStyle = rgba(fl > 0.8 ? P.c10 : P.c40, 0.9);
      ctx.beginPath();
      ctx.arc(a.x, a.y, a.s * (1 + 0.5 * S.kick), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  if (sc.id === "S03") {
    const v = 0.2 * easeOut(clamp(lb / 4));
    ctx.save();
    ctx.lineWidth = 26;
    ctx.strokeStyle = rgba(P.c80, 0.95);
    ctx.beginPath();
    ctx.arc(cx, cy - 40, 250, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = P.c40;
    ctx.shadowColor = P.c40;
    ctx.shadowBlur = 30;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(cx, cy - 40, 250, -Math.PI / 2, -Math.PI / 2 + v * Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    for (let k = 0; k < 8; k++) ring(ctx, cx, cy - 40, lb - k, { dur: 1, r0: 260, r1: 160, width: 3, alpha: 0.5 });
  }
  // the number
  const st = sc.stat;
  const y = sc.id === "S03" ? cy + 30 : cy + 70;
  const shown = sc.id === "S02" ? String(Math.round(860 * easeOut(clamp(lb / 1.5)))) : st.value;
  const valueSize = sc.id === "S02" ? 230 : 250;
  ctx.save();
  ctx.font = `800 ${valueSize}px ${FONT.title}, NotoSC, sans-serif`;
  const vw = ctx.measureText(st.value).width;
  ctx.font = `900 ${st.unit === "亿" ? 110 : 120}px ${st.unit === "亿" ? FONT.zh : FONT.title}, NotoSC, sans-serif`;
  const uw = ctx.measureText(st.unit).width;
  ctx.restore();
  const x0 = cx - (vw + uw + 20) / 2;
  slam(ctx, shown, x0, y, age, { size: valueSize, weight: 800, family: FONT.title, color: P.c10, glow: 40, glowColor: P.c50 });
  slam(ctx, st.unit, x0 + vw + 20, y, age - 0.05, { size: st.unit === "亿" ? 110 : 120, weight: 900, family: st.unit === "亿" ? FONT.zh : FONT.title, color: P.c40 });
  txt(ctx, st.label_zh + "  ·  " + st.label_en, cx, y + 80, { size: 30, weight: 700, align: "center", color: P.c30, spacing: 4, alpha: clamp((lb - 0.5) * 3) });
}

function statBrain(ctx, S) {
  const c = cam("lateral", { z: 0.95, x: 960, y: 470 });
  brain(ctx, S, c, { reveal: clamp(S.lb / 7) });
}

function build(ctx, S) {
  const lb = S.lb;
  const z = 0.95 + 0.12 * easeInOut(lb / 16);
  const c = cam("lateral", { z, x: 760, y: 480 });
  const r = clamp(0.62 + lb / 6);
  if (r < 1) brain(ctx, S, c, { reveal: r });
  else {
    ctx.save();
    ctx.globalAlpha = clamp((lb - 2.3) / 2);
    brain(ctx, S, c, { tint: clamp((lb - 6) / 6) * 0.8 });
    ctx.restore();
    if (lb < 4.3) {
      ctx.save();
      ctx.globalAlpha = 1 - clamp((lb - 2.3) / 2);
      brain(ctx, S, c, { reveal: 0.999 });
      ctx.restore();
    }
  }
  const i = Math.min(3, Math.floor(lb / 4));
  const w = S.sc.words[i];
  const age = (lb - i * 4) * S.BEAT;
  const fade = 1 - clamp((lb - i * 4 - 3.4) / 0.6);
  slam(ctx, w.zh, 1540, 470, age, { size: 150, weight: 900, align: "center", glow: 30, glowColor: P.c60, alpha: fade });
  slam(ctx, w.en, 1540, 560, age - 0.04, { size: 58, weight: 800, family: FONT.title, spacing: 16, align: "center", color: P.c40, alpha: fade });
}

function title(ctx, S) {
  const sc = S.sc, lb = S.lb, age = S.lt;
  const pfc = sc.id === "S20";
  const c = pfc ? cam("lateral", { ...focus("lateral", "pfc", 0.55, 1.25 + 0.04 * lb / 8), x: 640, y: 520 }) : cam("lateral", { z: 1.0 + 0.03 * lb / 16, x: 960, y: 500 });
  ctx.save();
  ctx.globalAlpha = 0.55;
  brain(ctx, S, c, pfc ? { lit: { pfc: 1 }, dim: 0.8 } : { tint: 0.9 });
  ctx.restore();
  const [ax, ay] = pfc ? toScreen(c, anchor("lateral", "pfc")) : [960, 470];
  ring(ctx, ax, ay, age, { dur: 0.9, r1: 900, width: 10 });
  ring(ctx, ax, ay, age - 0.12, { dur: 0.9, r1: 700, width: 5 });
  burst(ctx, ax, ay, age, pfc ? 9 : 4, { dur: 0.7, n: 40 });
  const shrink = pfc ? 0 : easeInOut(clamp((lb - 8) / 0.6));
  const ty = lerp(470, 330, shrink);
  const sz = lerp(pfc ? 170 : 190, 120, shrink);
  // dark plate behind the title for contrast
  ctx.save();
  const g = ctx.createLinearGradient(0, ty - 220, 0, ty + 160);
  g.addColorStop(0, rgba(P.c100, 0));
  g.addColorStop(0.5, rgba(P.c100, 0.6));
  g.addColorStop(1, rgba(P.c100, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, ty - 220, 1920, 380);
  ctx.restore();
  slam(ctx, sc.title.zh, 960, ty, age, { size: sz, weight: 900, align: "center", glow: 40, glowColor: P.c50, from: 0.9 });
  slam(ctx, sc.title.en, 960, ty + sz * 0.62, age - 0.06, { size: sz * 0.42, weight: 800, family: FONT.title, spacing: sz * 0.12, align: "center", color: P.c30, from: 0.9 });
  if (!pfc && lb >= 8) {
    const a2 = (lb - 8) * S.BEAT;
    chip(ctx, 960 - 210, 560, "第一章 · 主要脑区", "CHAPTER 1 · THE MAJOR REGIONS", clamp(a2 * 4), { size: 40, dark: true });
  }
  if (pfc) txt(ctx, "第二章 · CHAPTER 2", 960, ty - sz * 0.95, { size: 30, weight: 700, align: "center", color: P.c30, spacing: 6, alpha: clamp(age * 4) });
}

// ---- chapter 1 ---------------------------------------------------------------------------
const LOBE_LABEL = {
  frontal: [["额叶", "FRONTAL"], [-230, -110]],
  parietal: [["顶叶", "PARIETAL"], [80, -170]],
  temporal: [["颞叶", "TEMPORAL"], [-60, 190]],
  occipital: [["枕叶", "OCCIPITAL"], [120, -60]],
  cerebellum: [["小脑", "CEREBELLUM"], [120, 90]],
  brainstem: [["脑干", "BRAINSTEM"], [-150, 80]],
};

function overview(ctx, S) {
  const lb = S.lb;
  const c = cam("lateral", { z: 1.0, x: 700, y: 480 });
  const seq = S.sc.sequence;
  const lit = {};
  seq.forEach((k, i) => {
    const age = lb - i * 0.5;
    if (age >= 0) lit[k] = lb >= 7 ? 0.55 : Math.max(0.35, Math.exp(-age * 1.2));
  });
  brain(ctx, S, c, { lit, tint: 0.5, dim: 0.35 });
  seq.forEach((k, i) => {
    const age = lb - i * 0.5;
    const [lab, off] = LOBE_LABEL[k];
    const [ax, ay] = toScreen(c, anchor("lateral", k));
    callout(ctx, ax, ay, ax + off[0], ay + off[1], lab[0], lab[1], clamp(age / 0.5));
    if (age >= 0 && age < 0.6) ring(ctx, ax, ay, age * S.BEAT * 2, { dur: 0.5, r1: 160, width: 4 });
  });
  // list on the right
  seq.forEach((k, i) => {
    const [lab] = LOBE_LABEL[k];
    const a = clamp((lb - i * 0.5) * 3);
    const y = 230 + i * 92;
    txt(ctx, String(i + 1).padStart(2, "0"), 1440, y, { size: 30, family: FONT.mono, color: P.c50, alpha: a });
    txt(ctx, lab[0], 1510, y, { size: 52, weight: 900, alpha: a });
    txt(ctx, lab[1], 1520 + measure(ctx, lab[0], 52, 900), y, { size: 26, weight: 800, family: FONT.title, spacing: 4, color: P.c40, alpha: a });
  });
}

// Brain overlays that belong to particular region scenes (drawn in brain space).
const OVERLAY = {
  frontal(ctx, S, lb) {
    return { motor: lb >= 8 ? 0.6 + 0.4 * Math.sin(S.t * 6) : 0 };
  },
  parietal(ctx, S, lb) {
    return { somato: lb >= 4 ? 0.5 + 0.3 * Math.sin(S.t * 6) : 0 };
  },
  temporal(ctx, S, lb) {
    return { wernicke: lb >= 8 ? 0.6 + 0.4 * Math.exp(-((lb % 1)) * 3) : 0, auditory: lb >= 4 ? 0.5 : 0 };
  },
  occipital(ctx, S, lb) {
    return { v1: 0.8 };
  },
};

function streamsOverlay(ctx, S, c, lb) {
  if (lb < 8) return;
  const paths = [
    [[900, 430], [820, 480], [720, 520], [600, 540], [470, 548]],
    [[890, 380], [830, 300], [740, 230], [640, 200]],
  ];
  paths.forEach((pts, i) => {
    const k = easeOut(clamp((lb - 8 - i) / 1.5));
    if (k <= 0) return;
    const sp = pts.map((p) => toScreen(c, p));
    ctx.save();
    ctx.strokeStyle = P.c10;
    ctx.lineWidth = 9;
    ctx.lineCap = "round";
    ctx.shadowColor = P.c40;
    ctx.shadowBlur = 20;
    ctx.setLineDash([2, 18]);
    ctx.lineDashOffset = -S.t * 120;
    ctx.beginPath();
    const n = Math.max(2, Math.ceil(sp.length * k));
    for (let j = 0; j < n; j++) (j ? ctx.lineTo : ctx.moveTo).call(ctx, sp[j][0], sp[j][1]);
    ctx.stroke();
    ctx.restore();
    const end = sp[n - 1];
    txt(ctx, i ? "在哪里 WHERE" : "是什么 WHAT", end[0] + (i ? -10 : -20), end[1] + (i ? -24 : 46), { size: 28, weight: 800, align: i ? "right" : "right", stroke: 6, strokeColor: rgba(P.c100, 0.85), alpha: k });
  });
}

function hormoneOverlay(ctx, S, c, lb) {
  if (lb < 8) return;
  const a = toScreen(c, [446, 478]), b = toScreen(c, [438, 520]);
  for (let k = 0; k < 6; k++) {
    const p = ((S.t * 1.2 + k / 6) % 1);
    ctx.fillStyle = rgba(P.c10, 1 - p);
    ctx.beginPath();
    ctx.arc(lerp(a[0], b[0], p), lerp(a[1], b[1], p), 6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function amygdalaOverlay(ctx, S, c, lb) {
  const [x, y] = toScreen(c, anchor("medial", "amygdala"));
  for (let k = 0; k < 4; k++) ring(ctx, x, y, (lb % 1) * S.BEAT + k * 0.0 - 0, { dur: S.BEAT, r0: 30, r1: 140, width: 4, alpha: 0.7 });
  if (lb >= 8) {
    const h = toScreen(c, anchor("medial", "hippocampus"));
    const k = easeOut(clamp((lb - 8) / 1));
    ctx.save();
    ctx.strokeStyle = P.c10;
    ctx.lineWidth = 4;
    ctx.setLineDash([10, 8]);
    ctx.lineDashOffset = -S.t * 60;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(lerp(x, h[0], k), lerp(y, h[1], k));
    ctx.stroke();
    ctx.restore();
  }
}

function region(ctx, S) {
  const sc = S.sc, lb = S.lb, age = S.lt;
  const view = sc.view;
  const f = focus(view, sc.region, 0.35, 1.12 + 0.05 * lb / 16);
  const c = cam(view, { ...f, sx: flipScale(S) });
  const extra = OVERLAY[sc.region] ? OVERLAY[sc.region](ctx, S, lb) : {};
  const lit = { [sc.region]: 1, ...extra };
  if (sc.region === "hypothalamus") lit.pituitary = 1;
  if (sc.region === "amygdala" && lb >= 8) lit.hippocampus = 0.5;
  if (sc.region === "hippocampus") lit.hippocampus = clamp(lb / 2);
  brain(ctx, S, c, { lit, dim: 1, ghost: view === "medial" ? 0.5 : 0 });
  const [ax, ay] = toScreen(c, anchor(view, sc.region));
  ring(ctx, ax, ay, age, { dur: 0.6, r1: 360, width: 6 });
  if (sc.region === "occipital") streamsOverlay(ctx, S, c, lb);
  if (sc.region === "hypothalamus") hormoneOverlay(ctx, S, c, lb);
  if (sc.region === "amygdala") amygdalaOverlay(ctx, S, c, lb);

  // panel
  bigIndex(ctx, sc.index, S);
  slam(ctx, sc.title.zh, PX, 300, age, { size: 120, weight: 900, glow: 24, glowColor: P.c60 });
  slam(ctx, sc.title.en, PX + 4, 372, age - 0.05, { size: 54, weight: 800, family: FONT.title, spacing: 8, color: P.c40 });
  divider(ctx, PX, 404, PW, clamp(age * 3));
  let x = PX;
  sc.chips.forEach((ch, i) => {
    const w = chip(ctx, x, 432, ch.zh, ch.en, clamp((lb - 1 - i) / 0.4), { size: 26 });
    x += w + 14;
  });
  const box = { x: PX, y: 580, w: PW, h: 290 };
  const wl = lb - 8;
  if (wl >= 0) {
    const type = sc.widget.type;
    const W = Wd.WIDGETS[type];
    ctx.save();
    ctx.globalAlpha = clamp(wl * 4);
    if (type === "bigNumber" || type === "caseCard") W(ctx, box, wl, sc.widget);
    else W(ctx, box, wl, S);
    ctx.restore();
  }
}

function breakdown(ctx, S) {
  const lb = S.lb;
  const k = easeInOut(lb / 16);
  const f = focus("lateral", "fpc", 0.25 + 0.45 * k, 1.0 + 0.35 * k);
  const c = cam("lateral", { ...f, x: 760, y: 480 });
  const breath = 0.35 + 0.3 * (0.5 + 0.5 * Math.sin(S.t * Math.PI * 2 / 1.6));
  brain(ctx, S, c, { lit: { pfc: breath * clamp(lb / 4) }, dim: 0.6 + 0.3 * k });
  txt(ctx, "?", 1580, 560, { size: 320, weight: 800, family: FONT.title, align: "center", color: P.c60, alpha: 0.35 + 0.2 * Math.sin(S.t * 3) });
}

function pfcbuild(ctx, S) {
  const lb = S.lb;
  const punch = lb >= 12 ? Math.floor(lb - 12) * 0.06 + 0.06 * Math.exp(-((lb - 12) % 1) * 5) : 0;
  const f = focus("lateral", "pfc", 0.6, 1.25 + 0.1 * lb / 12 + punch);
  const c = cam("lateral", { ...f, x: 700, y: 500 });
  brain(ctx, S, c, { lit: { pfc: 0.3 + 0.7 * clamp(lb / 15) }, dim: 0.85 });
  const i = Math.min(3, Math.floor(lb / 4));
  const w = S.sc.words[i];
  const age = (lb - i * 4) * S.BEAT;
  slam(ctx, w.zh, 1530, 470, age, { size: 160, weight: 900, align: "center", glow: 34, glowColor: P.c60 });
  slam(ctx, w.en, 1530, 560, age - 0.04, { size: 60, weight: 800, family: FONT.title, spacing: 16, align: "center", color: P.c40 });
  // previous words stacked small
  for (let j = 0; j < i; j++) {
    txt(ctx, S.sc.words[j].zh, 1240 + j * 130, 200, { size: 40, weight: 800, color: P.c50, alpha: 0.8 });
  }
}

function pfcintro(ctx, S) {
  const sc = S.sc, lb = S.lb, age = S.lt;
  const c = cam("lateral", { z: 0.95, x: 640, y: 560, cx: 470, cy: 430 });
  if (sc.id === "S21") {
    const lit = { motor: clamp(lb / 0.5) * 0.9, premotor: clamp((lb - 1.5) / 0.5) * 0.75, pfc: clamp((lb - 3) / 0.5) };
    brain(ctx, S, c, { lit, dim: 0.9 });
    const items = [["motor", "初级运动皮层", "PRIMARY MOTOR", [250, -200], 0], ["premotor", "前运动区", "PREMOTOR", [-60, -200], 1.5], ["pfc", "前额叶皮层", "PREFRONTAL", [-140, -210], 3]];
    for (const [k, zh, en, off, at] of items) {
      const [x, y] = toScreen(c, anchor("lateral", k));
      callout(ctx, x, y, x + off[0], y + off[1], zh, en, clamp((lb - at) / 0.5), { size: 34 });
    }
    const [px, py] = toScreen(c, [180, 300]);
    Wd.WIDGETS.flow; // keep import used
    ctx.save();
    ctx.globalAlpha = clamp((lb - 4) / 0.5);
    ctx.strokeStyle = P.c10;
    ctx.fillStyle = P.c10;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(1680, 760);
    ctx.lineTo(1260, 760);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(1230, 760);
    ctx.lineTo(1266, 738);
    ctx.lineTo(1266, 782);
    ctx.fill();
    ctx.restore();
    txt(ctx, "前 · ANTERIOR", 1232, 724, { size: 30, weight: 800, alpha: clamp((lb - 4) / 0.5) });
    txt(ctx, "后 · POSTERIOR", 1680, 820, { size: 30, weight: 800, align: "right", color: P.c40, alpha: clamp((lb - 4) / 0.5) });
  } else {
    brain(ctx, S, c, { lit: { pfc: 1, parietal: lb >= 1 ? 0.35 : 0 }, dim: 0.8, ghost: 1 });
    const from = toScreen(c, anchor("lateral", "pfc"));
    const targets = [["parietal", "注意", "ATTENTION", 1], ["hippocampus_proj", "记忆", "MEMORY", 2.5], ["amygdala_proj", "情绪", "EMOTION", 4]];
    for (const [k, zh, en, at] of targets) {
      const to = toScreen(c, anchor("lateral", k));
      const p = easeOut(clamp((lb - at) / 0.8));
      if (p <= 0) continue;
      ctx.save();
      ctx.strokeStyle = P.c10;
      ctx.lineWidth = 5;
      ctx.shadowColor = P.c40;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      const mx = (from[0] + to[0]) / 2, my = Math.min(from[1], to[1]) - 120;
      ctx.moveTo(from[0], from[1]);
      const steps = 30;
      for (let s = 1; s <= steps * p; s++) {
        const u = s / steps;
        const x = (1 - u) * (1 - u) * from[0] + 2 * (1 - u) * u * mx + u * u * to[0];
        const y = (1 - u) * (1 - u) * from[1] + 2 * (1 - u) * u * my + u * u * to[1];
        ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
      if (p > 0.9) {
        ring(ctx, to[0], to[1], (lb - at - 0.8) * S.BEAT, { dur: 0.5, r1: 90, width: 4 });
        chip(ctx, to[0] + 20, to[1] + 18, zh, en, clamp((lb - at - 0.8) * 3), { size: 26, dark: true });
      }
    }
  }
}

// ---- chapter 2 -------------------------------------------------------------------------
const SUB_SHORT = {
  dlpfc: ["DLPFC", "lateral"], vlpfc: ["VLPFC", "lateral"], fpc: ["FPC", "lateral"],
  ofc: ["OFC", "medial"], vmpfc: ["VMPFC", "medial"], acc: ["ACC", "medial"],
};
const DUAL = {
  lateral: cam("lateral", { z: 0.8, x: 570, y: 470 }),
  medial: cam("medial", { z: 0.8, x: 1400, y: 470 }),
};
const SUB_LABEL_OFF = { dlpfc: [-60, -150], vlpfc: [-120, 110], fpc: [-90, -40], ofc: [-90, 120], vmpfc: [-120, -120], acc: [40, -170] };

function dual(ctx, S, litL, litM, st = {}) {
  brain(ctx, S, DUAL.lateral, { lit: litL, dim: st.dim ?? 0.8 });
  brain(ctx, S, DUAL.medial, { lit: litM, dim: st.dim ?? 0.8, ghost: st.ghost ?? 0.3 });
  if (st.captions === false) return;
  txt(ctx, "侧视图 LATERAL", 570, 840, { size: 22, family: FONT.mono, align: "center", color: P.c40 });
  txt(ctx, "内侧视图 MEDIAL", 1400, 840, { size: 22, family: FONT.mono, align: "center", color: P.c40 });
}

function subLabel(ctx, S, key, p, size = 40) {
  const [abbr, view] = SUB_SHORT[key];
  const c = DUAL[view];
  const [x, y] = toScreen(c, anchor(view, key));
  const off = SUB_LABEL_OFF[key];
  callout(ctx, x, y, x + off[0], y + off[1], abbr, null, p, { size });
}

function pfcmap(ctx, S) {
  const lb = S.lb;
  const seq = S.sc.sequence;
  const litL = {}, litM = {};
  seq.forEach((k, i) => {
    const v = clamp((lb - i) / 0.3);
    (SUB_SHORT[k][1] === "lateral" ? litL : litM)[k] = v;
  });
  dual(ctx, S, litL, litM);
  seq.forEach((k, i) => subLabel(ctx, S, k, clamp((lb - i) / 0.4)));
}

const PHASE_WIDGETS = {
  dlpfc: ["memorySlots", "delayRaster", "ruleSwitch"],
  vlpfc: ["stopSignal", "speech", "retrieval"],
  fpc: ["branching", "confidence", "exploreExploit"],
  ofc: ["valueBars0", "valueBars1", "flavour"],
  vmpfc: ["gage", "somatic", "regulate"],
  acc: ["flankerArrows", "ern", "painBars"],
};
const PHASE_CITES = {
  dlpfc: ["Baddeley (2003) Nat Rev Neurosci", "Funahashi, Bruce & Goldman-Rakic (1989)", "Miller & Cohen (2001)"],
  vlpfc: ["Aron, Robbins & Poldrack (2004; 2014)", "Broca (1861)", "Badre & Wagner (2007)"],
  fpc: ["Koechlin et al. (1999) Nature", "Fleming et al. (2010) Science", "Daw et al. (2006) Nature"],
  ofc: ["Padoa-Schioppa & Assad (2006) Nature", "Rolls (2004) Brain Cogn", "de Araujo et al. (2003)"],
  vmpfc: ["Harlow (1868); Damasio et al. (1994)", "Damasio (1994); Bechara et al. (1994)", "Phelps et al. (2004) Neuron"],
  acc: ["Botvinick et al. (2001) Psychol Rev", "Gehring et al. (1993) Psychol Sci", "Rainville et al. (1997) Science"],
};
const LOCATION = {
  dlpfc: ["额中回", "MIDDLE FRONTAL GYRUS", [-170, -170]],
  vlpfc: ["额下回", "INFERIOR FRONTAL GYRUS", [-170, 150]],
  fpc: ["额叶最前端", "FRONTAL POLE", [170, -150]],
  ofc: ["额叶底面", "ORBITAL SURFACE", [120, 230]],
  vmpfc: ["内侧前额叶下部", "VENTROMEDIAL SURFACE", [-60, -230]],
  acc: ["环绕胼胝体膝部", "AROUND THE GENU", [190, -200]],
};

function subregion(ctx, S) {
  const sc = S.sc, lb = S.lb, age = S.lt;
  const key = sc.region, view = sc.view;
  const z = 1.6 + 0.08 * lb / 32;
  const f = focus(view, key, 0.8, z);
  const c = cam(view, { ...f, x: 560, y: 500, sx: flipScale(S) });
  const phase = Math.floor(lb / 8); // 0 location, 1-3 widgets
  const lit = { [key]: 1 };
  if (key === "vlpfc" && phase === 2) lit.broca = 1;
  if (key === "vmpfc" && phase === 3) lit.amygdala = 1;
  brain(ctx, S, c, { lit, dim: 1, ghost: view === "medial" ? 0.35 : 0 });
  const [ax, ay] = toScreen(c, anchor(view, key));
  ring(ctx, ax, ay, age, { dur: 0.6, r1: 420, width: 7 });
  burst(ctx, ax, ay, age, 20 + sc.index, { dur: 0.5, n: 22 });
  if (phase === 0) {
    const [zh, en, off] = LOCATION[key];
    callout(ctx, ax, ay, ax + off[0], ay + off[1], zh, en, clamp((lb - 1) / 0.6), { size: 38 });
  }
  if (key === "ofc") orbitOverlay(ctx, S, c);
  if (key === "vmpfc" && phase === 1) rodOverlay(ctx, S, c, lb - 8);
  if (key === "vmpfc" && phase === 3) inhibitOverlay(ctx, S, c, lb - 24);

  // panel
  const T = sc.title;
  ctx.save();
  const pg = ctx.createLinearGradient(PX - 160, 0, PX - 30, 0);
  pg.addColorStop(0, rgba(P.c100, 0));
  pg.addColorStop(1, rgba(P.c100, 0.8));
  ctx.fillStyle = pg;
  ctx.fillRect(PX - 160, 0, 1920 - PX + 160, 1080);
  ctx.restore();
  txt(ctx, `PFC · ${String(sc.index).padStart(2, "0")} / 06`, PX, 150, { size: 20, family: FONT.mono, color: P.c40, alpha: clamp(age * 5) });
  slam(ctx, T.en, PX - 6, 286, age, { size: T.en.length > 6 ? 120 : 150, weight: 800, family: FONT.title, spacing: 4, color: P.c10, glow: 36, glowColor: P.c50 });
  slam(ctx, T.zh, PX, 360, age - 0.05, { size: 60, weight: 900 });
  txt(ctx, T.full, PX + 2, 402, { size: 24, weight: 600, family: FONT.en, color: P.c30, alpha: clamp((age - 0.1) * 5) });
  divider(ctx, PX, 426, PW, clamp(age * 3));
  const bw = chip(ctx, PX, 446, T.ba, null, clamp((lb - 1) / 0.4), { size: 24, dark: true });
  if (sc.note) chip(ctx, PX + bw + 12, 446, "【争议】" + sc.note.zh, null, clamp((lb - 2) / 0.4), { size: 20, dark: true });

  const box = { x: PX, y: 540, w: PW, h: 300 };
  if (phase === 0) {
    const a = clamp((lb - 3) / 0.5);
    txt(ctx, "比喻 ANALOGY", PX, 600, { size: 18, family: FONT.mono, color: P.c40, alpha: a });
    slam(ctx, "“" + T.analogy_zh + "”", PX - 10, 690, (lb - 3) * S.BEAT, { size: 64, weight: 900, glow: 20, glowColor: P.c60 });
    txt(ctx, T.analogy_en, PX + 4, 740, { size: 28, weight: 600, family: FONT.en, color: P.c30, alpha: a });
  } else {
    const wl = lb - phase * 8;
    const name = PHASE_WIDGETS[key][phase - 1];
    const slide = 1 - easeOut(clamp(wl / 0.4));
    ctx.save();
    ctx.globalAlpha = clamp(wl * 3);
    ctx.translate(60 * slide, 0);
    drawPhaseWidget(ctx, S, name, box, wl);
    Wd.cite(ctx, box, PHASE_CITES[key][phase - 1], wl);
    ctx.restore();
  }
}

function drawPhaseWidget(ctx, S, name, box, wl) {
  const W = Wd.WIDGETS;
  switch (name) {
    case "valueBars0": return W.valueBars(ctx, box, wl, 0);
    case "valueBars1": return W.valueBars(ctx, box, wl, 1);
    case "flavour":
      txt(ctx, "风味的汇聚", box.x, box.y + 4, { size: 26, weight: 800, color: P.c20, base: "top" });
      return W.flow(ctx, { ...box, y: box.y + 30, h: box.h - 30 }, wl - 0.5, [{ zh: "嗅觉", en: "SMELL" }, { zh: "味觉", en: "TASTE" }, { zh: "风味 · 好吃", en: "FLAVOUR" }], { step: 1.2 });
    case "somatic":
      txt(ctx, "躯体标记", box.x, box.y + 4, { size: 26, weight: 800, color: P.c20, base: "top" });
      return W.flow(ctx, { ...box, y: box.y + 30, h: box.h - 30 }, wl - 0.5, [{ zh: "身体信号", en: "HEART · SKIN" }, { zh: "VMPFC", en: "EVALUATE" }, { zh: "选择", en: "CHOICE" }], { step: 1.2 });
    case "regulate":
      txt(ctx, "情绪调节", box.x, box.y + 4, { size: 26, weight: 800, color: P.c20, base: "top" });
      return W.flow(ctx, { ...box, y: box.y + 30, h: box.h - 30 }, wl - 0.5, [{ zh: "VMPFC", en: "REGULATE", inhibitNext: true }, { zh: "杏仁核", en: "AMYGDALA · FEAR" }], { step: 1.5 });
    default:
      return W[name](ctx, box, wl, S);
  }
}

function orbitOverlay(ctx, S, c) {
  // the eye socket sits just under the orbital surface
  const [x, y] = toScreen(c, [236, 560]);
  ctx.save();
  ctx.strokeStyle = rgba(P.c30, 0.9);
  ctx.setLineDash([10, 9]);
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(x, y + 40 * c.z, 70 * c.z, 52 * c.z, 0, Math.PI * 1.05, Math.PI * 1.95);
  ctx.stroke();
  ctx.restore();
  txt(ctx, "眼眶 ORBIT", x, y + 62 * c.z, { size: 26, weight: 800, align: "center", color: P.c30, stroke: 5, strokeColor: rgba(P.c100, 0.9) });
}

function rodOverlay(ctx, S, c, wl) {
  // Gage's tamping iron: in below the cheekbone, out through the top of the frontal skull
  const p0 = toScreen(c, [300, 760]), p1 = toScreen(c, [210, 20]);
  const k = easeOut(clamp(wl / 0.5));
  if (k <= 0) return;
  const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  const ux = (p1[0] - p0[0]) / len, uy = (p1[1] - p0[1]) / len;
  const rodLen = len * 0.75;
  const head = lerp(-0.1, 1.05, k) * len;
  const hx = p0[0] + ux * head, hy = p0[1] + uy * head;
  const tx = hx - ux * rodLen, ty = hy - uy * rodLen;
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = P.c10;
  ctx.shadowColor = P.c40;
  ctx.shadowBlur = 30;
  ctx.lineWidth = 16;
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(hx, hy);
  ctx.stroke();
  ctx.restore();
  const [cx, cy] = toScreen(c, anchor("medial", "vmpfc"));
  ring(ctx, cx, cy, (wl - 0.25) * S.BEAT, { dur: 0.6, r1: 300, width: 10 });
}

function inhibitOverlay(ctx, S, c, wl) {
  const a = toScreen(c, anchor("medial", "vmpfc")), b = toScreen(c, anchor("medial", "amygdala"));
  const k = easeOut(clamp(wl / 1.2));
  if (k <= 0) return;
  ctx.save();
  ctx.strokeStyle = P.c10;
  ctx.lineWidth = 6;
  ctx.shadowColor = P.c40;
  ctx.shadowBlur = 14;
  const ex = lerp(a[0], b[0], k), ey = lerp(a[1], b[1], k);
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  if (k > 0.95) {
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(ex - Math.sin(ang) * 22, ey + Math.cos(ang) * 22);
    ctx.lineTo(ex + Math.sin(ang) * 22, ey - Math.cos(ang) * 22);
    ctx.stroke();
  }
  ctx.restore();
}

// ---- finale --------------------------------------------------------------------------
function finaleRapid(ctx, S) {
  const lb = S.lb;
  const seq = S.sc.sequence;
  const i = Math.floor(lb);
  if (i < 6) {
    const key = seq[i];
    const [abbr, view] = SUB_SHORT[key];
    const litL = view === "lateral" ? { [key]: 1 } : {};
    const litM = view === "medial" ? { [key]: 1 } : {};
    dual(ctx, S, litL, litM, { dim: 1, captions: false });
    subLabel(ctx, S, key, 1, 48);
    const kw = S.sc.keywords[i];
    const age = (lb - i) * S.BEAT;
    slam(ctx, kw.zh, 960, 840, age, { size: 92, weight: 900, align: "center", glow: 30, glowColor: P.c60, from: 0.5 });
    txt(ctx, kw.en, 960, 890, { size: 34, weight: 800, family: FONT.title, spacing: 10, align: "center", color: P.c40 });
    const [x, y] = toScreen(DUAL[view], anchor(view, key));
    ring(ctx, x, y, age, { dur: 0.4, r1: 260, width: 6 });
  } else {
    const litL = { dlpfc: 1, vlpfc: 1, fpc: 1 }, litM = { ofc: 1, vmpfc: 1, acc: 1 };
    dual(ctx, S, litL, litM, { dim: 1, captions: false });
    seq.forEach((k) => subLabel(ctx, S, k, 1, 34));
  }
}

const LINKS = [["dlpfc", "vlpfc"], ["dlpfc", "fpc"], ["vlpfc", "fpc"], ["fpc", "vmpfc"], ["vmpfc", "ofc"], ["vmpfc", "acc"], ["acc", "dlpfc"], ["ofc", "vlpfc"]];

function finaleNetwork(ctx, S) {
  const lb = S.lb;
  dual(ctx, S, { dlpfc: 0.7, vlpfc: 0.7, fpc: 0.7 }, { ofc: 0.7, vmpfc: 0.7, acc: 0.7 }, { dim: 1, captions: false });
  const pos = (k) => {
    const v = SUB_SHORT[k][1];
    return toScreen(DUAL[v], anchor(v, k));
  };
  LINKS.forEach(([a, b], i) => {
    const p = easeOut(clamp((lb - i * 0.5) / 0.6));
    if (p <= 0) return;
    const A = pos(a), B = pos(b);
    const mx = (A[0] + B[0]) / 2, my = Math.min(A[1], B[1]) - 160 - 30 * (i % 3);
    const pt = (u) => [(1 - u) * (1 - u) * A[0] + 2 * (1 - u) * u * mx + u * u * B[0], (1 - u) * (1 - u) * A[1] + 2 * (1 - u) * u * my + u * u * B[1]];
    ctx.save();
    ctx.strokeStyle = rgba(P.c20, 0.85);
    ctx.lineWidth = 3;
    ctx.shadowColor = P.c40;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    for (let s = 0; s <= 40 * p; s++) {
      const [x, y] = pt(s / 40);
      s ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
    if (p >= 1) {
      const u = (S.t * 0.9 + i * 0.13) % 1;
      const [x, y] = pt(u);
      ctx.fillStyle = P.c10;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  });
  for (const k of Object.keys(SUB_SHORT)) {
    const [x, y] = pos(k);
    ctx.fillStyle = P.c10;
    ctx.beginPath();
    ctx.arc(x, y, 8 + 4 * S.kick, 0, Math.PI * 2);
    ctx.fill();
  }
}

function finaleDeep(ctx, S) {
  const lb = S.lb;
  const push = lb >= 4 ? easeInOut((lb - 4) / 3.5) : 0;
  const f = focus("medial", "thalamus", 0.3 + 0.3 * push, 1.1 + 0.35 * push);
  const c = cam("medial", { ...f, x: 900, y: 480 });
  const targets = [["amygdala", "vmpfc", 0], ["hippocampus", "vmpfc", 1], ["thalamus", "acc", 2]];
  const lit = { ofc: 0.7, vmpfc: 0.8, acc: 0.8 };
  for (const [tgt, , at] of targets) lit[tgt] = clamp((lb - at - 0.6) / 0.3);
  brain(ctx, S, c, { lit, dim: 0.9, ghost: 0.8 });
  const names = { amygdala: ["杏仁核", "AMYGDALA"], hippocampus: ["海马", "HIPPOCAMPUS"], thalamus: ["丘脑", "THALAMUS"] };
  for (const [tgt, src, at] of targets) {
    const a = toScreen(c, anchor("medial", src)), b = toScreen(c, anchor("medial", tgt));
    const p = easeOut(clamp((lb - at) / 0.6));
    if (p <= 0) continue;
    ctx.save();
    ctx.strokeStyle = P.c10;
    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    ctx.shadowColor = P.c40;
    ctx.shadowBlur = 24;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(lerp(a[0], b[0], p), lerp(a[1], b[1], p));
    ctx.stroke();
    ctx.restore();
    if (p >= 1) {
      ring(ctx, b[0], b[1], (lb - at - 0.6) * S.BEAT, { dur: 0.6, r1: 180, width: 5 });
      const [zh, en] = names[tgt];
      chip(ctx, b[0] + 30, b[1] + (tgt === "thalamus" ? -110 : 30), zh, en, clamp((lb - at - 0.6) * 3), { size: 28, dark: true });
    }
  }
}

function finaleSlam(ctx, S) {
  const age = S.lt, lb = S.lb;
  const c = cam("lateral", { z: 1.05 + 0.04 * lb / 8, x: 960, y: 470 });
  ctx.save();
  ctx.globalAlpha = 0.65;
  brain(ctx, S, c, { lit: { frontal: 0.8, parietal: 0.8, temporal: 0.8, occipital: 0.8, cerebellum: 0.8, brainstem: 0.8 }, tint: 1 });
  ctx.restore();
  ring(ctx, 960, 470, age, { dur: 1.0, r1: 1100, width: 12 });
  ring(ctx, 960, 470, age - 0.1, { dur: 1.0, r1: 800, width: 6 });
  burst(ctx, 960, 470, age, 77, { dur: 0.9, n: 60 });
  ctx.save();
  const g = ctx.createLinearGradient(0, 330, 0, 640);
  g.addColorStop(0, rgba(P.c100, 0));
  g.addColorStop(0.5, rgba(P.c100, 0.75));
  g.addColorStop(1, rgba(P.c100, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 330, 1920, 310);
  ctx.restore();
  slam(ctx, S.sc.title.zh, 960, 500, age, { size: 110, weight: 900, align: "center", glow: 40, glowColor: P.c50, from: 1.0 });
  slam(ctx, S.sc.title.en, 960, 572, age - 0.08, { size: 44, weight: 800, family: FONT.title, spacing: 12, align: "center", color: P.c30, from: 1.0 });
}

function outro(ctx, S) {
  const lb = S.lb;
  const refs = S.TL.references;
  const fade = 1 - clamp((lb - 13) / 3);
  ctx.save();
  ctx.globalAlpha = fade;
  txt(ctx, "大脑地图", 120, 170, { size: 64, weight: 900, alpha: clamp(lb) });
  txt(ctx, "BRAIN ATLAS · 参考文献 REFERENCES", 122, 214, { size: 24, weight: 800, family: FONT.title, spacing: 6, color: P.c40, alpha: clamp(lb) });
  const half = Math.ceil(refs.length / 2);
  refs.forEach((r, i) => {
    const col = i < half ? 0 : 1;
    const row = col ? i - half : i;
    const short = r.length > 92 ? r.slice(0, 90) + "…" : r;
    txt(ctx, short, 122 + col * 850, 280 + row * 44, { size: 16.5, family: FONT.en, color: P.c30, alpha: clamp((lb - row * 0.15) * 2), maxWidth: 800 });
  });
  txt(ctx, "画面与配乐均由代码生成 · Visuals and music generated from code · Loyel 渐变蓝", 960, 880, { size: 20, family: FONT.mono, color: P.c50, align: "center", alpha: clamp(lb - 2) });
  ctx.restore();
}

export const SCENES = {
  stat, build, title, overview, region, breakdown, pfcbuild, pfcintro, pfcmap, subregion,
  finaleRapid, finaleNetwork, finaleDeep, finaleSlam, outro,
};
