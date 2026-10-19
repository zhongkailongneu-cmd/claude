// Small explanatory graphics shown in the right-hand panel. Each takes a box
// and `lb`, the local beat count since the widget appeared; elements land on
// whole beats so they pop in time with the drums.
import { P, rgba } from "./palette.js";
import { txt, measure, roundRect, clamp, lerp, easeOut, easeBack, FONT } from "./ui.js";
import { envelope, rng } from "./fx.js";

const on = (lb, at) => clamp((lb - at) / 0.35); // 0 -> 1 over ~a third of a beat
const pulse = (lb) => Math.exp(-((lb % 1) + 1) % 1 * 4);

export function cite(ctx, box, s, lb) {
  txt(ctx, "【循证】" + s, box.x, box.y + box.h + 36, { size: 17, family: FONT.mono, color: P.c40, alpha: on(lb, 1) });
}

function label(ctx, box, zh, en, lb) {
  const a = on(lb, 0);
  txt(ctx, zh, box.x, box.y + 4, { size: 26, weight: 800, color: P.c20, alpha: a, base: "top" });
  if (en) txt(ctx, en, box.x + measure(ctx, zh, 26, 800) + 14, box.y + 9, { size: 18, weight: 800, family: FONT.title, spacing: 3, color: P.c40, alpha: a, base: "top" });
}

function node(ctx, x, y, w, h, zh, en, lit, a = 1) {
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha *= clamp(a);
  roundRect(ctx, x, y, w, h, 12);
  ctx.fillStyle = lit > 0.5 ? rgba(P.c20, 0.95) : rgba(P.c90, 0.9);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = rgba(P.c40, 0.9);
  if (lit > 0.5) {
    ctx.shadowColor = P.c40;
    ctx.shadowBlur = 20 * lit;
  }
  ctx.stroke();
  ctx.shadowBlur = 0;
  const dark = lit > 0.5;
  txt(ctx, zh, x + w / 2, y + h / 2 - (en ? 6 : -10), { size: 26, weight: 800, align: "center", color: dark ? P.c100 : P.white });
  if (en) txt(ctx, en, x + w / 2, y + h / 2 + 22, { size: 15, weight: 800, family: FONT.title, spacing: 2, align: "center", color: dark ? P.c70 : P.c40 });
  ctx.restore();
}

function arrow(ctx, x1, y1, x2, y2, p, o = {}) {
  if (p <= 0) return;
  const k = easeOut(p);
  const ex = lerp(x1, x2, k), ey = lerp(y1, y2, k);
  ctx.save();
  ctx.strokeStyle = o.color ?? P.c30;
  ctx.fillStyle = o.color ?? P.c30;
  ctx.lineWidth = o.width ?? 3;
  if (o.dash) ctx.setLineDash(o.dash);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  ctx.setLineDash([]);
  const a = Math.atan2(y2 - y1, x2 - x1);
  if (o.inhibit) {
    ctx.beginPath();
    ctx.moveTo(ex - Math.sin(a) * 14, ey + Math.cos(a) * 14);
    ctx.lineTo(ex + Math.sin(a) * 14, ey - Math.cos(a) * 14);
    ctx.lineWidth = 5;
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - Math.cos(a - 0.45) * 16, ey - Math.sin(a - 0.45) * 16);
    ctx.lineTo(ex - Math.cos(a + 0.45) * 16, ey - Math.sin(a + 0.45) * 16);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// Horizontal chain of nodes, one lighting per beat.
export function flow(ctx, box, lb, nodes, o = {}) {
  const n = nodes.length;
  const gap = 46;
  const w = (box.w - gap * (n - 1)) / n;
  const h = o.h ?? 92;
  const y = box.y + (box.h - h) / 2 + (o.dy ?? 0);
  nodes.forEach((nd, i) => {
    const x = box.x + i * (w + gap);
    const at = (o.step ?? 1) * i;
    node(ctx, x, y, w, h, nd.zh, nd.en, on(lb, at) * (i === n - 1 || o.allLit ? 1 : 0.4 + 0.6 * (lb >= at ? 1 : 0)), on(lb, at - 0.3) * 1.5);
    if (i < n - 1) arrow(ctx, x + w + 6, y + h / 2, x + w + gap - 6, y + h / 2, on(lb, at + 0.5), { inhibit: nd.inhibitNext });
  });
}

export function motorStrip(ctx, box, lb) {
  label(ctx, box, "运动指令通路", "MOTOR OUTPUT", lb);
  flow(ctx, { x: box.x, y: box.y + 40, w: box.w, h: box.h - 40 }, lb - 1, [
    { zh: "运动皮层", en: "MOTOR CORTEX" }, { zh: "脊髓", en: "SPINAL CORD" }, { zh: "肌肉", en: "MUSCLES" },
  ]);
}

export function crosshair(ctx, box, lb) {
  label(ctx, box, "空间定位", "WHERE IS IT?", lb);
  const cx = box.x + box.w / 2, cy = box.y + 50 + (box.h - 50) / 2;
  const r = rng(11);
  const targets = Array.from({ length: 12 }, () => [cx + (r() - 0.5) * 420, cy + (r() - 0.5) * 140]);
  const i = Math.max(0, Math.floor(lb));
  const prev = targets[Math.max(0, i - 1) % 12], cur = targets[i % 12];
  const k = easeBack(clamp((lb - i) / 0.3));
  const x = lerp(prev[0], cur[0], k), y = lerp(prev[1], cur[1], k);
  ctx.save();
  ctx.globalAlpha *= on(lb, 0);
  ctx.strokeStyle = rgba(P.c60, 0.6);
  ctx.lineWidth = 1;
  roundRect(ctx, box.x, box.y + 50, box.w, box.h - 50, 14);
  ctx.stroke();
  ctx.fillStyle = P.c30;
  ctx.beginPath();
  ctx.arc(cur[0], cur[1], 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = P.c10;
  ctx.lineWidth = 3;
  const rr = 34 + 20 * (1 - k);
  ctx.beginPath();
  ctx.arc(x, y, rr, 0, Math.PI * 2);
  ctx.moveTo(x - rr - 16, y); ctx.lineTo(x - rr + 12, y);
  ctx.moveTo(x + rr - 12, y); ctx.lineTo(x + rr + 16, y);
  ctx.moveTo(x, y - rr - 16); ctx.lineTo(x, y - rr + 12);
  ctx.moveTo(x, y + rr - 12); ctx.lineTo(x, y + rr + 16);
  ctx.stroke();
  txt(ctx, `X ${Math.round(x - box.x)}  Y ${Math.round(y - box.y)}`, x + rr + 20, y - rr, { size: 15, family: FONT.mono, color: P.c40 });
  ctx.restore();
}

export function soundwave(ctx, box, lb, S) {
  label(ctx, box, "声音输入", "AUDITORY INPUT", lb);
  const n = 46;
  const bw = box.w / n;
  const base = box.y + 50 + (box.h - 50) / 2;
  const e = clamp(S.kick * 0.8 + S.snare * 0.9);
  ctx.save();
  ctx.globalAlpha *= on(lb, 0);
  for (let i = 0; i < n; i++) {
    const ph = i / n;
    const v = 0.25 + 0.35 * Math.abs(Math.sin(S.t * 6 + i * 0.7)) * Math.sin(Math.PI * ph) + 0.6 * e * Math.sin(Math.PI * ph) * (0.6 + 0.4 * Math.sin(i * 1.3));
    const hh = (box.h - 70) * clamp(v) * 0.5;
    ctx.fillStyle = i % 3 ? P.c50 : P.c30;
    roundRect(ctx, box.x + i * bw + 2, base - hh, bw - 5, hh * 2, 3);
    ctx.fill();
  }
  ctx.restore();
}

export function visualStreams(ctx, box, lb) {
  label(ctx, box, "两条视觉通路", "TWO VISUAL STREAMS", lb);
  const y = box.y + 70;
  const w = (box.w - 30) / 2;
  node(ctx, box.x, y, w, 110, "背侧 · 在哪里", "DORSAL · WHERE", on(lb, 1), on(lb, 0.7) * 1.5);
  node(ctx, box.x + w + 30, y, w, 110, "腹侧 · 是什么", "VENTRAL · WHAT", on(lb, 2), on(lb, 1.7) * 1.5);
  txt(ctx, "→ 顶叶 parietal", box.x + 10, y + 150, { size: 20, color: P.c40, alpha: on(lb, 1) });
  txt(ctx, "→ 颞叶 temporal", box.x + w + 40, y + 150, { size: 20, color: P.c40, alpha: on(lb, 2) });
}

export function bars(ctx, box, lb, items, o = {}) {
  const n = items.length;
  const top = box.y + 54;
  const rowH = (box.h - 54) / n;
  items.forEach((it, i) => {
    const at = it.at ?? i * 2;
    const k = easeOut(clamp((lb - at) / 0.8));
    const y = top + i * rowH + 8;
    const bh = Math.min(48, rowH - 34);
    txt(ctx, it.zh, box.x, y + 2, { size: 24, weight: 800, base: "top", alpha: on(lb, at - 0.2) });
    txt(ctx, it.en, box.x + measure(ctx, it.zh, 24, 800) + 10, y + 6, { size: 15, weight: 800, family: FONT.title, spacing: 2, color: P.c40, base: "top", alpha: on(lb, at - 0.2) });
    const bx = box.x, by = y + 34, bw = box.w - 130;
    ctx.fillStyle = rgba(P.c80, 0.9);
    roundRect(ctx, bx, by, bw, bh, 8);
    ctx.fill();
    const v = lerp(it.from ?? 0, it.value, k) / (o.max ?? 100);
    if (v > 0.002) {
      const g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      g.addColorStop(0, it.hi ? P.c40 : P.c60);
      g.addColorStop(1, it.hi ? P.c10 : P.c50);
      ctx.fillStyle = g;
      roundRect(ctx, bx, by, Math.max(bh, bw * v), bh, 8);
      ctx.fill();
    }
    const shown = Math.round(lerp(it.from ?? 0, it.value, k));
    txt(ctx, `${shown}${o.unit ?? "%"}`, bx + bw + 18, by + bh - 6, { size: 40, weight: 800, family: FONT.title, color: it.hi ? P.c10 : P.c30, alpha: on(lb, at - 0.2) });
  });
}

export function barCompare(ctx, box, lb) {
  label(ctx, box, "小脑占比", "CEREBELLUM SHARE", lb);
  bars(ctx, box, lb, [
    { zh: "脑重", en: "BRAIN MASS", value: 10, at: 1 },
    { zh: "神经元", en: "NEURONS", value: 80, at: 3, hi: true },
  ]);
}

export function vitals(ctx, box, lb, S) {
  label(ctx, box, "生命体征", "VITAL SIGNS", lb);
  const x0 = box.x, x1 = box.x + box.w;
  const yEcg = box.y + 120, yBr = box.y + 230;
  ctx.save();
  ctx.globalAlpha *= on(lb, 0);
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  // ECG: a QRS spike drawn at every kick that already happened, scrolling left
  ctx.strokeStyle = P.c10;
  ctx.shadowColor = P.c40;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  const span = 3.2; // seconds visible
  for (let px = 0; px <= box.w; px += 2) {
    const tt = S.t - span + (px / box.w) * span;
    const hit = S.kickTimes.findLast?.((k) => k <= tt) ?? null;
    let v = 0;
    if (hit != null) {
      const d = tt - hit;
      v = d < 0.03 ? -d / 0.03 * 0.25 : d < 0.06 ? -0.25 + (d - 0.03) / 0.03 * 1.25 : d < 0.1 ? 1 - (d - 0.06) / 0.04 * 1.4 : d < 0.14 ? -0.4 + (d - 0.1) / 0.04 * 0.4 : d < 0.3 ? 0.12 * Math.sin((d - 0.14) / 0.16 * Math.PI) : 0;
    }
    const y = yEcg - v * 55;
    px ? ctx.lineTo(x0 + px, y) : ctx.moveTo(x0 + px, y);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = P.c50;
  ctx.beginPath();
  for (let px = 0; px <= box.w; px += 3) {
    const tt = S.t - span + (px / box.w) * span;
    const y = yBr - Math.sin(tt * Math.PI * 2 / 3.2) * 26;
    px ? ctx.lineTo(x0 + px, y) : ctx.moveTo(x0 + px, y);
  }
  ctx.stroke();
  ctx.restore();
  txt(ctx, "心跳 HEART", x1, yEcg - 60, { size: 18, family: FONT.mono, color: P.c30, align: "right", alpha: on(lb, 0) });
  txt(ctx, "呼吸 BREATH", x1, yBr - 40, { size: 18, family: FONT.mono, color: P.c40, align: "right", alpha: on(lb, 0) });
}

export function relay(ctx, box, lb) {
  label(ctx, box, "感觉中继", "SENSORY RELAY", lb);
  const top = box.y + 54;
  const senses = [["视觉", "VISION"], ["听觉", "HEARING"], ["触觉", "TOUCH"], ["味觉", "TASTE"]];
  const rowH = 44;
  senses.forEach(([zh, en], i) => {
    const y = top + i * (rowH + 6);
    const a = on(lb, i * 0.5);
    node(ctx, box.x, y, 150, rowH, zh, null, 0, a);
    arrow(ctx, box.x + 156, y + rowH / 2, box.x + 300, top + 98, on(lb, i * 0.5 + 0.3), { color: P.c40 });
  });
  node(ctx, box.x + 306, top + 54, 170, 88, "丘脑", "THALAMUS", on(lb, 2.5), on(lb, 2));
  arrow(ctx, box.x + 482, top + 98, box.x + 560, top + 98, on(lb, 3));
  node(ctx, box.x + 566, top + 54, 170, 88, "皮层", "CORTEX", on(lb, 3.5), on(lb, 3));
  // smell takes a shortcut
  const ys = top + 4 * (rowH + 6) + 6;
  node(ctx, box.x, ys, 150, rowH, "嗅觉", null, 0, on(lb, 4));
  ctx.save();
  ctx.globalAlpha *= on(lb, 4.5);
  ctx.strokeStyle = P.c30;
  ctx.setLineDash([8, 7]);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(box.x + 156, ys + rowH / 2);
  ctx.lineTo(box.x + 650, ys + rowH / 2);
  ctx.lineTo(box.x + 650, top + 146);
  ctx.stroke();
  ctx.restore();
  txt(ctx, "绕过丘脑 bypass", box.x + 330, ys + rowH / 2 - 10, { size: 18, family: FONT.mono, color: P.c30, alpha: on(lb, 4.5) });
}

export function bigNumber(ctx, box, lb, w) {
  const k = easeBack(clamp(lb / 0.4));
  ctx.save();
  ctx.globalAlpha *= clamp(lb * 3);
  ctx.translate(box.x, box.y + box.h * 0.72);
  ctx.scale(0.7 + 0.3 * k, 0.7 + 0.3 * k);
  const ww = txt(ctx, w.value, 0, 0, { size: 190, weight: 800, family: FONT.title, color: P.c10, glow: 30, glowColor: P.c50 });
  txt(ctx, w.unit, ww + 14, 0, { size: 90, weight: 800, family: FONT.title, color: P.c40 });
  ctx.restore();
  txt(ctx, "下丘脑约重 4 克 · about 4 grams", box.x + 6, box.y + box.h * 0.72 + 50, { size: 22, color: P.c30, alpha: on(lb, 1) });
}

export function caseCard(ctx, box, lb, w) {
  const a = on(lb, 0);
  ctx.save();
  ctx.globalAlpha *= a;
  const flip = clamp(lb / 0.4);
  ctx.translate(box.x + box.w / 2, box.y + box.h / 2);
  ctx.scale(1, Math.max(0.02, easeOut(flip)));
  ctx.translate(-box.w / 2, -box.h / 2);
  roundRect(ctx, 0, 0, box.w, box.h, 16);
  ctx.fillStyle = rgba(P.c20, 0.96);
  ctx.fill();
  txt(ctx, "病例 CASE FILE", 26, 42, { size: 16, family: FONT.mono, color: P.c60 });
  txt(ctx, w.zh, 26, 96, { size: 46, weight: 900, color: P.c100 });
  txt(ctx, w.en + " · 1926–2008", 26 + measure(ctx, w.zh, 46, 900) + 18, 94, { size: 20, weight: 800, family: FONT.title, spacing: 2, color: P.c70 });
  txt(ctx, w.year, box.w - 26, 96, { size: 64, weight: 800, family: FONT.title, color: P.c60, align: "right" });
  const y = 150;
  const segW = (box.w - 52 - 20) / 2;
  roundRect(ctx, 26, y, segW, 92, 10);
  ctx.fillStyle = P.c40;
  ctx.fill();
  txt(ctx, "术前 BEFORE", 42, y + 34, { size: 18, family: FONT.mono, color: P.c100 });
  txt(ctx, "记忆正常", 42, y + 72, { size: 30, weight: 800, color: P.c100 });
  const k2 = on(lb, 2);
  roundRect(ctx, 46 + segW, y, segW, 92, 10);
  ctx.fillStyle = k2 > 0.5 ? P.c70 : rgba(P.c40, 0.4);
  ctx.fill();
  txt(ctx, "术后 AFTER", 62 + segW, y + 34, { size: 18, family: FONT.mono, color: P.c20, alpha: k2 });
  txt(ctx, "记不住新经历", 62 + segW, y + 72, { size: 30, weight: 800, color: P.white, alpha: k2 });
  ctx.restore();
}

export function alarm(ctx, box, lb) {
  label(ctx, box, "威胁警报", "THREAT DETECTED", lb);
  const cx = box.x + 120, cy = box.y + 160;
  const p = pulse(lb);
  ctx.save();
  ctx.globalAlpha *= on(lb, 0);
  for (let k = 0; k < 3; k++) {
    const age = ((lb % 1) + k * 0.33) % 1;
    ctx.strokeStyle = rgba(P.c30, (1 - age) * 0.8);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, 50 + age * 80, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(cx, cy - 58);
  ctx.lineTo(cx + 56, cy + 42);
  ctx.lineTo(cx - 56, cy + 42);
  ctx.closePath();
  ctx.fillStyle = p > 0.5 ? P.c10 : P.c30;
  ctx.shadowColor = P.c40;
  ctx.shadowBlur = 30 * p;
  ctx.fill();
  ctx.shadowBlur = 0;
  txt(ctx, "!", cx, cy + 32, { size: 72, weight: 900, family: FONT.title, align: "center", color: P.c100 });
  ctx.restore();
  txt(ctx, "危险 → 心跳加速、警觉", box.x + 260, box.y + 140, { size: 26, weight: 700, alpha: on(lb, 1) });
  txt(ctx, "Danger → racing heart, vigilance", box.x + 260, box.y + 176, { size: 18, family: FONT.en, color: P.c30, alpha: on(lb, 1) });
  txt(ctx, "情绪事件 → 记得更牢", box.x + 260, box.y + 236, { size: 26, weight: 700, alpha: on(lb, 8) });
  txt(ctx, "Emotion → stronger memory", box.x + 260, box.y + 272, { size: 18, family: FONT.en, color: P.c30, alpha: on(lb, 8) });
}

// ---------------------------------------------------------------- chapter 2
export function memorySlots(ctx, box, lb) {
  label(ctx, box, "工作记忆", "WORKING MEMORY", lb);
  const items = ["7", "B", "◆", "3"];
  const n = 4, gap = 22;
  const w = (box.w - gap * (n - 1)) / n, h = 150;
  const y = box.y + 70;
  const swap = clamp((lb - 5) / 0.6);
  items.forEach((it, i) => {
    let x = box.x + i * (w + gap);
    if (i === 1) x = lerp(x, box.x + 2 * (w + gap), easeOut(swap));
    if (i === 2) x = lerp(x, box.x + 1 * (w + gap), easeOut(swap));
    const a = on(lb, i);
    ctx.save();
    roundRect(ctx, box.x + i * (w + gap), y, w, h, 14);
    ctx.strokeStyle = rgba(P.c40, 0.8);
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
    if (a > 0) {
      ctx.save();
      ctx.globalAlpha *= a;
      roundRect(ctx, x + 6, y + 6, w - 12, h - 12, 10);
      ctx.fillStyle = rgba(P.c20, 0.95);
      ctx.shadowColor = P.c40;
      ctx.shadowBlur = 18 * pulse(lb);
      ctx.fill();
      ctx.restore();
      txt(ctx, it, x + w / 2, y + h / 2 + 28, { size: 84, weight: 800, family: FONT.title, align: "center", color: P.c100, alpha: a });
    }
  });
  txt(ctx, lb < 5 ? "暂存 HOLD" : "加工 MANIPULATE ⇄", box.x, y + h + 46, { size: 22, family: FONT.mono, color: P.c30, alpha: on(lb, 1) });
}

export function delayRaster(ctx, box, lb) {
  label(ctx, box, "延迟期持续放电", "DELAY-PERIOD ACTIVITY", lb);
  const x0 = box.x, x1 = box.x + box.w, y0 = box.y + 60, y1 = box.y + box.h - 30;
  const T = [0, 0.5, 3.0, 3.6]; // cue, delay, response, end (seconds of trial)
  const X = (t) => lerp(x0, x1, t / T[3]);
  const sweep = clamp(lb / 6) * T[3];
  ctx.save();
  ctx.globalAlpha *= on(lb, 0);
  ctx.fillStyle = rgba(P.c60, 0.35);
  ctx.fillRect(X(T[0]), y0, X(T[1]) - X(T[0]), y1 - y0);
  ctx.fillStyle = rgba(P.c70, 0.35);
  ctx.fillRect(X(T[1]), y0, X(T[2]) - X(T[1]), y1 - y0);
  ctx.fillStyle = rgba(P.c60, 0.35);
  ctx.fillRect(X(T[2]), y0, X(T[3]) - X(T[2]), y1 - y0);
  txt(ctx, "提示 CUE", X(0) + 6, y1 + 24, { size: 15, family: FONT.mono, color: P.c30 });
  txt(ctx, "延迟 DELAY · 记住位置", X(T[1]) + 10, y1 + 24, { size: 15, family: FONT.mono, color: P.c20 });
  txt(ctx, "反应 GO", X(T[2]) + 6, y1 + 24, { size: 15, family: FONT.mono, color: P.c30 });
  const rows = 8, rh = (y1 - y0) / rows;
  const r = rng(5);
  ctx.fillStyle = P.c10;
  for (let row = 0; row < rows; row++) {
    let t = 0;
    while (t < T[3]) {
      const rate = t < T[1] ? 6 : t < T[2] ? 26 : 10;
      t += -Math.log(1 - r() * 0.999) / rate;
      if (t > sweep || t > T[3]) continue;
      ctx.fillRect(X(t) - 1, y0 + row * rh + 4, 2.5, rh - 8);
    }
  }
  ctx.strokeStyle = P.c10;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(X(sweep), y0 - 6);
  ctx.lineTo(X(sweep), y1 + 6);
  ctx.stroke();
  ctx.restore();
}

export function ruleSwitch(ctx, box, lb) {
  label(ctx, box, "认知控制 · 规则切换", "COGNITIVE CONTROL", lb);
  const y = box.y + 66, w = (box.w - 80) / 2, h = 130;
  const k = clamp((lb - 4) / 0.5);
  node(ctx, box.x, y, w, h, "规则 A · 按形状", "RULE A · SHAPE", k < 0.5 ? 1 : 0, on(lb, 0) * 1.5);
  arrow(ctx, box.x + w + 10, y + h / 2, box.x + w + 70, y + h / 2, on(lb, 3.5));
  node(ctx, box.x + w + 80, y, w, h, "规则 B · 按数量", "RULE B · NUMBER", k >= 0.5 ? 1 : 0, on(lb, 1) * 1.5);
  const steps = ["计划", "执行", "检查"];
  steps.forEach((s, i) => node(ctx, box.x + i * (box.w / 3), y + h + 30, box.w / 3 - 20, 50, `${i + 1} · ${s}`, null, on(lb, 5 + i), on(lb, 4.5 + i) * 1.5));
}

export function stopSignal(ctx, box, lb) {
  label(ctx, box, "停止信号任务", "STOP-SIGNAL TASK", lb);
  const y = box.y + 150, x0 = box.x + 20, x1 = box.x + box.w - 40;
  const cyc = lb % 4;
  const go = clamp(cyc / 2.2);
  const stopped = cyc >= 2;
  const ax = lerp(x0, x1, stopped ? 2 / 2.2 * 0.55 : go * 0.55);
  ctx.save();
  ctx.globalAlpha *= on(lb, 0);
  ctx.strokeStyle = rgba(P.c50, 0.7);
  ctx.setLineDash([10, 10]);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x1, y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = P.c10;
  ctx.beginPath();
  ctx.moveTo(ax + 40, y);
  ctx.lineTo(ax, y - 30);
  ctx.lineTo(ax, y + 30);
  ctx.closePath();
  ctx.fill();
  txt(ctx, "GO", ax - 10, y - 44, { size: 30, weight: 800, family: FONT.title, color: P.c20, align: "center" });
  if (cyc >= 1.6) {
    const k = easeBack(clamp((cyc - 1.6) / 0.3));
    const sx = lerp(x0, x1, 0.75), sy = y;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(k, k);
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = Math.PI / 8 + (i * Math.PI) / 4;
      ctx.lineTo(Math.cos(a) * 66, Math.sin(a) * 66);
    }
    ctx.closePath();
    ctx.fillStyle = P.c10;
    ctx.shadowColor = P.c40;
    ctx.shadowBlur = 30;
    ctx.fill();
    ctx.restore();
    txt(ctx, "STOP", sx, sy + 14, { size: 40, weight: 800, family: FONT.title, align: "center", color: P.c100, alpha: k });
  }
  if (stopped) {
    const k = clamp((cyc - 2) / 0.5);
    ctx.strokeStyle = rgba(P.c10, 1 - k);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(ax + 20, y, 30 + 60 * k, 0, Math.PI * 2);
    ctx.stroke();
    txt(ctx, "反应被叫停 RESPONSE CANCELLED", box.x + 20, y + 110, { size: 22, weight: 700, color: P.c20, alpha: clamp((cyc - 2) * 3) });
  }
  ctx.restore();
}

export function speech(ctx, box, lb) {
  label(ctx, box, "布洛卡区 · 言语产生", "BROCA'S AREA", lb);
  const words = ["组织", "词语", "说出口"];
  words.forEach((wd, i) => {
    const a = on(lb, i * 1.5);
    const x = box.x + i * 245, y = box.y + 80 + (i % 2) * 40;
    ctx.save();
    ctx.globalAlpha *= a;
    const s = 0.7 + 0.3 * easeBack(a);
    ctx.translate(x + 110, y + 50);
    ctx.scale(s, s);
    roundRect(ctx, -110, -50, 220, 100, 50);
    ctx.fillStyle = i === 2 ? P.c20 : rgba(P.c80, 0.95);
    ctx.fill();
    ctx.strokeStyle = P.c40;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-40, 48);
    ctx.lineTo(-62, 78);
    ctx.lineTo(-12, 50);
    ctx.fillStyle = i === 2 ? P.c20 : rgba(P.c80, 0.95);
    ctx.fill();
    txt(ctx, wd, 0, 12, { size: 34, weight: 800, align: "center", color: i === 2 ? P.c100 : P.white });
    ctx.restore();
  });
  txt(ctx, "受损 → 能理解，却难以流利表达（布洛卡失语）", box.x, box.y + box.h - 36, { size: 20, color: P.c30, alpha: on(lb, 5) });
}

export function retrieval(ctx, box, lb) {
  label(ctx, box, "从记忆中挑选", "SELECT & RETRIEVE", lb);
  const items = ["雨伞", "车票", "钥匙", "电话", "钱包"];
  const pick = 2;
  const cur = lb < 5 ? Math.floor(Math.max(0, lb)) % items.length : pick;
  const w = (box.w - 4 * 16) / 5;
  items.forEach((it, i) => {
    const sel = i === cur;
    const final = lb >= 5 && i === pick;
    node(ctx, box.x + i * (w + 16), box.y + 90, w, 96, it, final ? "✓ FOUND" : null, sel ? 1 : 0, on(lb, i * 0.2) * 1.5);
  });
  txt(ctx, "“出门要带什么？” → 只取出相关的那一个", box.x, box.y + 250, { size: 22, color: P.c30, alpha: on(lb, 5.2) });
}

export function branching(ctx, box, lb) {
  label(ctx, box, "分支任务", "BRANCHING", lb);
  const top = box.y + 60;
  const mx = box.x + 10, mw = 250, mh = 96;
  const paused = lb >= 1 && lb < 6;
  node(ctx, mx, top + 70, mw, mh, paused ? "主目标 · 挂起" : "主目标", paused ? "MAIN GOAL · ON HOLD" : "MAIN GOAL", lb >= 6 ? 1 : paused ? 0 : 1, on(lb, 0) * 1.5);
  if (paused) {
    // bookmark ribbon
    ctx.save();
    ctx.fillStyle = P.c10;
    const bx = mx + mw - 40, by = top + 70 - 10;
    ctx.beginPath();
    ctx.moveTo(bx, by); ctx.lineTo(bx + 26, by); ctx.lineTo(bx + 26, by + 46); ctx.lineTo(bx + 13, by + 34); ctx.lineTo(bx, by + 46);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  const sx = box.x + 420, sw = 300;
  node(ctx, sx, top, sw, 80, "子任务 1", "SUBTASK", on(lb, 2), on(lb, 1.6) * 1.5);
  node(ctx, sx, top + 160, sw, 80, "子任务 2", "SUBTASK", on(lb, 3.5), on(lb, 3.1) * 1.5);
  arrow(ctx, mx + mw + 8, top + 100, sx - 8, top + 40, on(lb, 1.5));
  arrow(ctx, sx + sw / 2, top + 84, sx + sw / 2, top + 154, on(lb, 3));
  // return to the main goal
  if (lb >= 5) {
    ctx.save();
    ctx.strokeStyle = P.c10;
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 6]);
    const k = easeOut(clamp((lb - 5) / 0.8));
    ctx.beginPath();
    ctx.moveTo(sx, top + 200);
    ctx.quadraticCurveTo(lerp(sx, mx + mw / 2, 0.5), top + 260, lerp(sx, mx + mw / 2, k), lerp(top + 200, top + 170, k));
    ctx.stroke();
    ctx.restore();
    txt(ctx, "返回 RESUME", mx + mw / 2 + 40, top + 262, { size: 18, family: FONT.mono, color: P.c20, alpha: on(lb, 5.5) });
  }
}

export function confidence(ctx, box, lb) {
  label(ctx, box, "元认知：我有多确定？", "METACOGNITION", lb);
  const x0 = box.x + 10, x1 = box.x + box.w - 10, y = box.y + 160;
  const targets = [0.3, 0.85, 0.55, 0.72];
  const i = Math.max(0, Math.min(3, Math.floor(lb / 1.5)));
  const prev = i ? targets[i - 1] : 0;
  const v = lerp(prev, targets[i], easeBack(clamp((lb - i * 1.5) / 0.5)));
  ctx.save();
  ctx.globalAlpha *= on(lb, 0);
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, P.c80);
  g.addColorStop(1, P.c40);
  ctx.fillStyle = g;
  roundRect(ctx, x0, y - 14, x1 - x0, 28, 14);
  ctx.fill();
  for (let k = 0; k <= 10; k++) {
    const x = lerp(x0, x1, k / 10);
    ctx.fillStyle = P.c30;
    ctx.fillRect(x - 1, y + 22, 2, k % 5 ? 10 : 18);
  }
  const nx = lerp(x0, x1, v);
  ctx.fillStyle = P.c10;
  ctx.shadowColor = P.c40;
  ctx.shadowBlur = 20;
  ctx.beginPath();
  ctx.arc(nx, y, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  txt(ctx, `${Math.round(v * 100)}%`, nx, y - 40, { size: 44, weight: 800, family: FONT.title, align: "center", color: P.c10, alpha: on(lb, 0) });
  txt(ctx, "瞎猜 GUESS", x0, y + 70, { size: 18, family: FONT.mono, color: P.c40, alpha: on(lb, 0) });
  txt(ctx, "确定 SURE", x1, y + 70, { size: 18, family: FONT.mono, color: P.c30, align: "right", alpha: on(lb, 0) });
}

export function exploreExploit(ctx, box, lb) {
  label(ctx, box, "探索 vs 利用", "EXPLORE vs EXPLOIT", lb);
  const cx = box.x + box.w / 2, cy = box.y + 190;
  const tilt = Math.sin(Math.floor(lb) * 1.7) * 0.18 * (lb < 6 ? 1 : 0.3);
  const k = easeBack(clamp((lb % 1) / 0.4));
  const ang = tilt * k;
  ctx.save();
  ctx.globalAlpha *= on(lb, 0);
  ctx.fillStyle = P.c40;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx - 26, cy + 60);
  ctx.lineTo(cx + 26, cy + 60);
  ctx.closePath();
  ctx.fill();
  ctx.translate(cx, cy);
  ctx.rotate(ang);
  ctx.fillStyle = P.c30;
  ctx.fillRect(-300, -5, 600, 10);
  ctx.restore();
  const ly = cy - Math.sin(ang) * 270, ry = cy + Math.sin(ang) * 270;
  node(ctx, cx - 300 - 100, ly - 110, 220, 96, "利用 · 已知", "EXPLOIT", tilt < 0 ? 1 : 0, on(lb, 0) * 1.5);
  node(ctx, cx + 300 - 120, ry - 110, 220, 96, "探索 · 未知", "EXPLORE", tilt >= 0 ? 1 : 0, on(lb, 0.5) * 1.5);
}

export function valueBars(ctx, box, lb, phase) {
  if (phase === 0) {
    label(ctx, box, "这值多少？", "SUBJECTIVE VALUE", lb);
    bars(ctx, box, lb, [
      { zh: "选项 A", en: "OPTION A", value: 8, at: 1, hi: true },
      { zh: "选项 B", en: "OPTION B", value: 5, at: 2 },
    ], { max: 10, unit: "" });
  } else {
    label(ctx, box, "规则反转 → 价值更新", "REVERSAL LEARNING", lb);
    const k = lb >= 2;
    bars(ctx, box, lb, [
      { zh: "选项 A", en: "OPTION A", from: 8, value: k ? 3 : 8, at: 2, hi: !k },
      { zh: "选项 B", en: "OPTION B", from: 5, value: k ? 9 : 5, at: 2, hi: k },
    ], { max: 10, unit: "" });
  }
}

export function gage(ctx, box, lb) {
  const k = easeBack(clamp(lb / 0.4));
  ctx.save();
  ctx.globalAlpha *= clamp(lb * 3);
  ctx.translate(box.x, box.y + 150);
  ctx.scale(0.6 + 0.4 * k, 0.6 + 0.4 * k);
  txt(ctx, "1848", 0, 0, { size: 170, weight: 800, family: FONT.title, color: P.c10, glow: 30, glowColor: P.c50 });
  ctx.restore();
  txt(ctx, "菲尼亚斯·盖奇", box.x + 4, box.y + 214, { size: 34, weight: 900, alpha: on(lb, 1) });
  txt(ctx, "PHINEAS GAGE · 铁路工头", box.x + 250, box.y + 212, { size: 20, weight: 800, family: FONT.title, spacing: 2, color: P.c40, alpha: on(lb, 1) });
  txt(ctx, "约 1.1 米、6 公斤的铁棍贯穿颅骨，他活了下来", box.x + 4, box.y + 262, { size: 22, color: P.c30, alpha: on(lb, 2) });
  txt(ctx, "A 1.1 m, 6 kg tamping iron passed through his skull; he survived", box.x + 4, box.y + 292, { size: 16, family: FONT.en, color: P.c40, alpha: on(lb, 2) });
}

export function flankerArrows(ctx, box, lb) {
  label(ctx, box, "侧翼任务 · 冲突", "FLANKER CONFLICT", lb);
  const arrows = ["←", "←", "→", "←", "←"];
  const cx = box.x + box.w / 2, y = box.y + 190;
  arrows.forEach((a, i) => {
    const mid = i === 2;
    const x = cx + (i - 2) * 132;
    const shake = mid ? Math.sin(lb * 40) * 6 * pulse(lb) : 0;
    ctx.save();
    if (mid) {
      roundRect(ctx, x - 58 + shake, y - 92, 116, 124, 16);
      ctx.strokeStyle = P.c10;
      ctx.lineWidth = 3;
      ctx.shadowColor = P.c40;
      ctx.shadowBlur = 24 * pulse(lb);
      ctx.stroke();
    }
    ctx.restore();
    txt(ctx, a, x + shake, y, { size: 110, weight: 800, family: FONT.title, align: "center", color: mid ? P.c10 : P.c50, alpha: on(lb, i * 0.25) });
  });
  txt(ctx, "中间箭头和两侧打架 → ACC 发出“冲突”信号", box.x, box.y + box.h - 4, { size: 20, color: P.c30, alpha: on(lb, 3) });
}

export function ern(ctx, box, lb) {
  label(ctx, box, "错误相关负波", "ERROR-RELATED NEGATIVITY", lb);
  const x0 = box.x, x1 = box.x + box.w, yMid = box.y + 160;
  const T0 = -0.2, T1 = 0.6;
  const X = (t) => lerp(x0, x1, (t - T0) / (T1 - T0));
  const sig = (t) => {
    const ernv = -Math.exp(-Math.pow((t - 0.08) / 0.035, 2)) * 1.0;
    const pe = Math.exp(-Math.pow((t - 0.28) / 0.08, 2)) * 0.55;
    return ernv + pe + 0.06 * Math.sin(t * 60) + 0.04 * Math.sin(t * 23 + 1);
  };
  const sweep = T0 + clamp(lb / 4) * (T1 - T0);
  ctx.save();
  ctx.globalAlpha *= on(lb, 0);
  ctx.strokeStyle = rgba(P.c50, 0.6);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0, yMid); ctx.lineTo(x1, yMid);
  ctx.moveTo(X(0), yMid - 110); ctx.lineTo(X(0), yMid + 110);
  ctx.stroke();
  txt(ctx, "按错键 ERROR", X(0) + 8, yMid - 92, { size: 16, family: FONT.mono, color: P.c30 });
  ctx.strokeStyle = P.c10;
  ctx.lineWidth = 3.5;
  ctx.shadowColor = P.c40;
  ctx.shadowBlur = 12;
  ctx.beginPath();
  for (let t = T0, first = true; t <= sweep; t += 0.004) {
    // negative plotted up, as is the ERP convention
    const y = yMid - sig(t) * 90;
    first ? (ctx.moveTo(X(t), y), (first = false)) : ctx.lineTo(X(t), y);
  }
  ctx.stroke();
  ctx.restore();
  if (sweep > 0.1) {
    const px = X(0.08), py = yMid + 90 + 4;
    txt(ctx, "ERN ≈ 80 ms", px + 16, py + 40, { size: 26, weight: 800, family: FONT.title, color: P.c10, alpha: clamp((sweep - 0.1) * 8) });
  }
  txt(ctx, "负向朝上 · negative up", x1, box.y + box.h + 6, { size: 15, family: FONT.mono, color: P.c50, align: "right", alpha: on(lb, 1) });
}

export function painBars(ctx, box, lb) {
  label(ctx, box, "疼痛的两个维度", "TWO SIDES OF PAIN", lb);
  bars(ctx, box, lb, [
    { zh: "强度 · 痛在哪", en: "INTENSITY · S1", value: 50, at: 1 },
    { zh: "难受程度", en: "UNPLEASANTNESS · ACC", value: 90, at: 2.5, hi: true },
  ]);
}

export const WIDGETS = {
  motorStrip, crosshair, soundwave, visualStreams, barCompare, vitals, relay, bigNumber, caseCard, alarm,
  memorySlots, delayRaster, ruleSwitch, stopSignal, speech, retrieval, branching, confidence, exploreExploit,
  valueBars, gage, flankerArrows, ern, painBars, flow,
};
