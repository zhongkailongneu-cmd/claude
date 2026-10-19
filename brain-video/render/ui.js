// Text, chips, subtitles and HUD drawing helpers.
import { P, rgba } from "./palette.js";

export const FONT = { zh: "NotoSC", title: "Barlow", en: "InterF", mono: "JBM" };

export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeOut = (t) => 1 - Math.pow(1 - clamp(t), 3);
export const easeInOut = (t) => (t = clamp(t), t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeBack = (t) => {
  t = clamp(t);
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

export function txt(ctx, s, x, y, o = {}) {
  const {
    size = 32, weight = 500, family = FONT.zh, color = P.white, align = "left", base = "alphabetic",
    spacing = 0, alpha = 1, glow = 0, glowColor = P.c50, stroke = 0, strokeColor = P.c100, maxWidth,
  } = o;
  if (alpha <= 0.002) return 0;
  ctx.save();
  ctx.globalAlpha *= clamp(alpha);
  ctx.font = `${weight} ${size}px ${family}, NotoSC, sans-serif`;
  ctx.letterSpacing = `${spacing}px`;
  ctx.textAlign = align;
  ctx.textBaseline = base;
  if (stroke) {
    ctx.lineJoin = "round";
    ctx.lineWidth = stroke;
    ctx.strokeStyle = strokeColor;
    ctx.strokeText(s, x, y, maxWidth);
  }
  if (glow) {
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = glow;
  }
  ctx.fillStyle = color;
  ctx.fillText(s, x, y, maxWidth);
  const w = ctx.measureText(s).width;
  ctx.restore();
  return w;
}

export function measure(ctx, s, size, weight = 500, family = FONT.zh, spacing = 0) {
  ctx.save();
  ctx.font = `${weight} ${size}px ${family}, NotoSC, sans-serif`;
  ctx.letterSpacing = `${spacing}px`;
  const w = ctx.measureText(s).width;
  ctx.restore();
  return w;
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// A title that slams in: big and blurred, snapping to size within ~0.15 s.
export function slam(ctx, s, x, y, age, o = {}) {
  if (age < 0) return;
  const k = Math.exp(-age * 16);
  const scale = 1 + (o.from ?? 0.7) * k;
  const alpha = clamp(age * 14) * (o.alpha ?? 1);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  if (k > 0.05) ctx.filter = `blur(${(10 * k).toFixed(1)}px)`;
  txt(ctx, s, 0, 0, { ...o, alpha });
  ctx.restore();
}

// Light chip with a Chinese line and a smaller English line.
export function chip(ctx, x, y, zh, en, p, o = {}) {
  if (p <= 0) return 0;
  const sz = o.size ?? 28;
  const wz = measure(ctx, zh, sz, 700);
  const we = en ? measure(ctx, en, sz * 0.62, 600, FONT.en) : 0;
  const w = Math.max(wz, we) + 36;
  const h = en ? sz * 2.25 : sz * 1.6;
  const s = 0.6 + 0.4 * easeBack(p);
  ctx.save();
  ctx.globalAlpha *= clamp(p * 3);
  ctx.translate(x + w / 2, y + h / 2);
  ctx.scale(s, s);
  ctx.translate(-w / 2, -h / 2);
  roundRect(ctx, 0, 0, w, h, 10);
  ctx.fillStyle = o.dark ? rgba(P.c90, 0.92) : rgba(P.c20, 0.96);
  ctx.fill();
  if (o.dark) {
    ctx.strokeStyle = rgba(P.c40, 0.9);
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  txt(ctx, zh, 18, sz * 1.12, { size: sz, weight: 700, color: o.dark ? P.white : P.c100 });
  if (en) txt(ctx, en, 18, sz * 1.86, { size: sz * 0.62, weight: 600, family: FONT.en, color: o.dark ? P.c30 : P.c70 });
  ctx.restore();
  return w;
}

// Leader-line label for a point on the brain (screen coordinates).
export function callout(ctx, ax, ay, lx, ly, zh, en, p, o = {}) {
  if (p <= 0) return;
  const k = easeOut(p);
  ctx.save();
  ctx.globalAlpha *= clamp(p * 2.5);
  ctx.strokeStyle = rgba(P.c30, 0.95);
  ctx.lineWidth = 2;
  const mx = lerp(ax, lx, k), my = lerp(ay, ly, k);
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(mx, my);
  ctx.stroke();
  ctx.fillStyle = P.c10;
  ctx.beginPath();
  ctx.arc(ax, ay, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = rgba(P.c10, 0.6);
  ctx.beginPath();
  ctx.arc(ax, ay, 10 + 6 * (1 - k), 0, Math.PI * 2);
  ctx.stroke();
  if (k > 0.6) {
    const a = clamp((k - 0.6) / 0.4);
    const left = lx < ax;
    const align = left ? "right" : "left";
    const dx = left ? -10 : 10;
    txt(ctx, zh, lx + dx, ly - 4, { size: o.size ?? 34, weight: 800, align, alpha: a, stroke: 6, strokeColor: rgba(P.c100, 0.85) });
    if (en) txt(ctx, en, lx + dx, ly + (o.size ?? 34) * 0.78, { size: (o.size ?? 34) * 0.52, weight: 600, family: FONT.title, spacing: 2, align, color: P.c30, alpha: a, stroke: 5, strokeColor: rgba(P.c100, 0.85) });
  }
  ctx.restore();
}

export function subtitles(ctx, S) {
  const sub = S.sub;
  if (!sub) return;
  const a = sub.bar * S.BAR, b = (sub.bar + sub.len) * S.BAR;
  const t = S.t;
  const fin = clamp((t - a) / 0.12), fout = clamp((b - t) / 0.12);
  const alpha = Math.min(fin, fout);
  if (alpha <= 0) return;
  const y0 = 978 + 10 * (1 - easeOut(fin));
  // legibility band
  const g = ctx.createLinearGradient(0, 905, 0, 1080);
  g.addColorStop(0, rgba(P.c100, 0));
  g.addColorStop(0.35, rgba(P.c100, 0.78 * alpha));
  g.addColorStop(1, rgba(P.c100, 0.92 * alpha));
  ctx.fillStyle = g;
  ctx.fillRect(0, 905, 1920, 175);
  txt(ctx, sub.zh, 960, y0, { size: 46, weight: 700, align: "center", alpha, stroke: 5, strokeColor: rgba(P.c100, 0.9) });
  txt(ctx, sub.en, 960, y0 + 50, { size: 29, weight: 400, family: FONT.en, align: "center", color: P.c30, alpha, stroke: 4, strokeColor: rgba(P.c100, 0.9) });
}

export function hud(ctx, S) {
  const sc = S.sc;
  ctx.save();
  // progress bar
  ctx.fillStyle = rgba(P.c80, 0.9);
  ctx.fillRect(0, 0, 1920, 4);
  ctx.fillStyle = P.c50;
  ctx.fillRect(0, 0, 1920 * (S.t / S.DUR), 4);
  // beat indicator: four dots, the current beat lit
  const beatInBar = Math.floor(S.beatG) % 4;
  for (let k = 0; k < 4; k++) {
    const on = k === beatInBar;
    const pulse = on ? Math.exp(-(S.beatG % 1) * 5) : 0;
    ctx.fillStyle = on ? rgba(P.c10, 0.55 + 0.45 * pulse) : rgba(P.c60, 0.7);
    ctx.beginPath();
    ctx.arc(1792 + k * 22, 56, on ? 6 + 2 * pulse : 5, 0, Math.PI * 2);
    ctx.fill();
  }
  txt(ctx, "BRAIN ATLAS", 1772, 62, { size: 22, weight: 800, family: FONT.title, spacing: 4, align: "right", color: P.c30 });
  txt(ctx, `${S.BPM} BPM · BAR ${String(Math.floor(S.barG) + 1).padStart(3, "0")}`, 1860, 92, { size: 15, family: FONT.mono, align: "right", color: P.c50 });
  // chapter label
  const ch = S.chapter;
  if (ch) {
    txt(ctx, ch.zh, 60, 62, { size: 24, weight: 700, color: P.c20 });
    txt(ctx, ch.en, 60, 90, { size: 15, family: FONT.mono, color: P.c50, spacing: 1 });
    if (sc.index) {
      const total = sc.kind === "subregion" ? 6 : 10;
      txt(ctx, `${String(sc.index).padStart(2, "0")} / ${String(total).padStart(2, "0")}`, 60 + 18 + measure(ctx, ch.zh, 24, 700), 62, { size: 18, family: FONT.mono, color: P.c40 });
    }
  }
  ctx.restore();
}
