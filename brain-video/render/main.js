// Frame renderer: window.renderFrame(i) draws frame i of the video onto the
// canvas. All state is derived from the frame time, the timeline and the
// beat map, so any frame can be rendered independently (parallel workers).
import { P } from "./palette.js";
import { SCENES } from "./scenes.js";
import * as FX from "./fx.js";
import * as UI from "./ui.js";

const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");
let TL, BM, BEAT, BAR, FPS, DUR, SUBS, CUTS;

const FONTS = [
  ["NotoSC", "NotoSansSC-500.woff2", 500], ["NotoSC", "NotoSansSC-700.woff2", 700], ["NotoSC", "NotoSansSC-900.woff2", 900],
  ["Barlow", "BarlowCondensed-600.woff2", 600], ["Barlow", "BarlowCondensed-800.woff2", 800],
  ["InterF", "Inter-400.woff2", 400], ["InterF", "Inter-600.woff2", 600], ["JBM", "JetBrainsMono-500.woff2", 500],
];

const CHAPTERS = [
  { from: 16, to: 60, zh: "第一章 · 主要脑区", en: "CH.1 · MAJOR REGIONS" },
  { from: 68, to: 124, zh: "第二章 · 前额叶皮层", en: "CH.2 · PREFRONTAL CORTEX" },
];

async function init() {
  await Promise.all(FONTS.map(async ([fam, file, w]) => {
    const f = new FontFace(fam, `url(../fonts/${file})`, { weight: String(w) });
    await f.load();
    document.fonts.add(f);
  }));
  TL = await (await fetch("../timeline.json")).json();
  BM = await (await fetch("../build/beatmap.json")).json();
  FPS = TL.meta.fps;
  BEAT = 60 / TL.meta.bpm;
  BAR = BEAT * TL.meta.beatsPerBar;
  DUR = TL.meta.totalBars * BAR;
  SUBS = TL.scenes.flatMap((s) => (s.subs || []).map((u) => ({ ...u, scene: s })));
  // every scene start is a cut; the rapid finale also cuts on each beat
  CUTS = [];
  for (const s of TL.scenes) {
    if (s.bar > 0) CUTS.push(s.bar * BAR);
    if (s.kind === "finaleRapid") for (let b = 1; b < s.len * 4 - 1; b++) CUTS.push(s.bar * BAR + b * BEAT);
  }
  window.TOTAL_FRAMES = Math.round(DUR * FPS);
}

function frameState(i) {
  const t = i / FPS;
  const beatG = t / BEAT + 1e-9;
  const barG = beatG / 4;
  const idx = TL.scenes.findIndex((s) => barG >= s.bar && barG < s.bar + s.len);
  const k = idx < 0 ? TL.scenes.length - 1 : idx;
  const sc = TL.scenes[k];
  const lb = beatG - sc.bar * 4;
  const sub = SUBS.find((u) => barG >= u.bar && barG < u.bar + u.len);
  const chapter = CHAPTERS.find((c) => barG >= c.from && barG < c.to);
  return {
    i, t, beatG, barG, sc, lb, lt: lb * BEAT, prev: TL.scenes[k - 1], next: TL.scenes[k + 1],
    sub: sub && !(sc.title && sub.zh === sc.title.zh) ? sub : null,
    chapter, TL, BM, BEAT, BAR, DUR, BPM: TL.meta.bpm,
    kick: FX.envelope(BM.kick, t, 0.09),
    snare: FX.envelope(BM.snare, t, 0.08),
    impact: FX.envelope(BM.impact, t, 0.16),
    stab: FX.envelope(BM.stab, t, 0.1),
    kickTimes: BM.kick.map((k) => k[0]),
  };
}

function inGap(t) {
  for (const [a, b] of BM.gap) if (t >= a - 1e-6 && t < b) return clamp01((t - a) / 0.04);
  return 0;
}
const clamp01 = (x) => Math.max(0, Math.min(1, x));

function renderFrame(i) {
  const S = frameState(i);
  S.shake = 14 * FX.envelope(BM.impact, S.t, 0.11, 0.8);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.filter = "none";
  FX.background(ctx, S);
  const [dx, dy] = FX.shakeOffset(S);
  ctx.save();
  ctx.translate(dx, dy);
  const draw = SCENES[S.sc.kind];
  if (draw) draw(ctx, S);
  ctx.restore();
  FX.vignette(ctx);
  // cut glitch on the downbeat of every scene change
  for (let c = 0; c < CUTS.length; c++) {
    const age = S.t - CUTS[c];
    if (age >= 0 && age < 0.14) FX.cutGlitch(ctx, age, 1000 + c * 7 + S.i, S.sc.kind === "finaleRapid" ? 0.6 : 1);
  }
  UI.subtitles(ctx, S);
  UI.hud(ctx, S);
  // impact flash: strongest on the drops, a faint lift on snares
  FX.flash(ctx, 0.42 * FX.envelope(BM.impact, S.t, 0.13, 0.8) + 0.05 * S.snare + 0.12 * S.stab);
  FX.darken(ctx, 0.93 * inGap(S.t));
  // outro fade to the darkest palette tone
  const fadeStart = DUR - 2.0;
  if (S.t > fadeStart) FX.darken(ctx, (S.t - fadeStart) / 2.0);
  ctx.restore();
}

window.renderFrame = renderFrame;
window.ready = init().then(() => true);

// ?play turns the page into a real-time preview with the soundtrack.
if (new URLSearchParams(location.search).has("play")) {
  window.ready.then(() => {
    const audio = new Audio("../build/bgm.wav");
    const start = Number(new URLSearchParams(location.search).get("t") || 0);
    document.body.addEventListener("click", () => {
      audio.currentTime = start;
      audio.play();
      const loop = () => {
        renderFrame(Math.floor(audio.currentTime * FPS));
        if (!audio.paused) requestAnimationFrame(loop);
      };
      loop();
    }, { once: true });
    renderFrame(Math.floor(start * FPS));
  });
}
