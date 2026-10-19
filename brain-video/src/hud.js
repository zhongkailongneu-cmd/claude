// HUD overlay. Every element is a pure function of (time, scene), so frames are reproducible.
import { BEAT, CHAPTERS, PFC_PILLS, EF_WORDS, FINAL_TITLE, CREDITS, DURATION } from './scenes.js';

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const outBack = (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const out3 = (x) => 1 - Math.pow(1 - x, 3);
const SVGNS = 'http://www.w3.org/2000/svg';

const modeOf = (sc) => {
  if (sc.chapter !== undefined || sc.fx === 'recap') return 'chap';
  if (sc.pfc !== undefined || sc.fx === 'pfcoverview') return 'pfc';
  return null;
};

export class Hud {
  constructor(doc) {
    this.d = doc;
    const $ = (id) => doc.getElementById(id);
    this.el = {
      pills: $('pills'), tag: $('tag'), chips: $('chips'), counters: $('counters'), banner: $('banner'), title: $('title'),
      ef: $('ef'), lockup: $('lockup'), credits: $('credits'), sub: $('sub'), spec: $('spec'), flash: $('flash'), fade: $('fade'),
      coLine: $('co-line'), coEnd: $('co-end'), coDot: $('co-dot'), coRing: $('co-ring'), arcLabels: $('arc-labels'),
    };
    const q = (p, s) => p.querySelector(s);
    this.tag = { kicker: q(this.el.tag, '.kicker'), cn: q(this.el.tag, '.cn'), en: q(this.el.tag, '.en'), meta: q(this.el.tag, '.meta') };
    this.sub = { cn: q(this.el.sub, '.cn'), en: q(this.el.sub, '.en') };
    this.banner = { cn: q(this.el.banner, '.cn'), en: q(this.el.banner, '.en') };
    this.title = { cn: q(this.el.title, '.cn'), en: q(this.el.title, '.en') };
    this.ef = { cn: q(this.el.ef, '.cn'), en: q(this.el.ef, '.en') };
    this.lockup = { cn: q(this.el.lockup, '.cn'), en: q(this.el.lockup, '.en') };
    this.spec = this.el.spec.getContext('2d');
    this.cache = new Map();

    // pills: 4 chapters + 7 PFC sub-regions
    this.chapPills = CHAPTERS.map((c, i) => this.makePill(`0${i + 1}`, c.cn, c.en));
    this.pfcPills = PFC_PILLS.map((c) => this.makePill('', c.cn, c.en));

    // overview counters
    const defs = [
      { v: 86, dec: 0, unit: 'B', cn: '神经元', en: 'NEURONS', start: 0 },
      { v: 1.4, dec: 1, unit: 'kg', cn: '重量', en: 'WEIGHT', start: 2 },
      { v: 20, dec: 0, unit: '%', cn: '能量消耗', en: 'ENERGY USE', start: 4 },
    ];
    this.counters = defs.map((d) => {
      const n = doc.createElement('div'); n.className = 'counter';
      n.innerHTML = `<div class="num"><span class="v">0</span><small>${d.unit}</small></div><div class="lab">${d.cn}<i>${d.en}</i></div>`;
      this.el.counters.appendChild(n);
      return { ...d, n, vEl: n.querySelector('.v') };
    });

    // credits
    for (const c of CREDITS) {
      const a = doc.createElement('div'); a.textContent = c.cn; this.el.credits.appendChild(a);
      const b = doc.createElement('div'); b.textContent = c.en; b.style.color = '#6C9AC4'; this.el.credits.appendChild(b);
    }

    // control-loop labels (svg)
    this.arcLabels = [];
    for (let i = 0; i < 5; i++) {
      const g = doc.createElementNS(SVGNS, 'g');
      const ln = doc.createElementNS(SVGNS, 'polyline'); ln.setAttribute('class', 'arc-line');
      const dt = doc.createElementNS(SVGNS, 'circle'); dt.setAttribute('r', '5'); dt.setAttribute('fill', '#F4F7FB');
      const t1 = doc.createElementNS(SVGNS, 'text'); t1.setAttribute('class', 'arc-label');
      const t2 = doc.createElementNS(SVGNS, 'text'); t2.setAttribute('class', 'arc-label-en'); t2.setAttribute('dy', '30');
      g.append(ln, dt, t1, t2);
      this.el.arcLabels.appendChild(g);
      this.arcLabels.push({ g, t1, t2, ln, dt });
    }
    this.curScene = null;
    this.chipEls = [];
  }

  makePill(n, cn, en) {
    const p = this.d.createElement('div'); p.className = 'pill';
    p.innerHTML = `${n ? `<span class="n">${n}</span>` : ''}<span class="t">${cn}</span><span class="e">${en}</span>`;
    this.el.pills.appendChild(p);
    return p;
  }

  setText(el, v) { if (this.cache.get(el) !== v) { el.textContent = v; this.cache.set(el, v); } }
  show(el, o, tf = '') { el.style.opacity = o.toFixed(3); el.style.transform = tf; el.style.display = o <= 0.001 ? 'none' : ''; }

  // all text must be on screen once so every glyph subset is fetched before the first capture
  async preloadFonts(scenes) {
    const chars = new Set();
    const add = (s) => { if (s) for (const ch of s) chars.add(ch); };
    for (const s of scenes) {
      for (const k of ['cn', 'en', 'kicker', 'meta']) add(s.tag && s.tag[k]);
      for (const c of s.cues || []) { add(c.cn); add(c.en); }
      for (const c of s.chips || []) { add(c.cn); add(c.en); }
      if (s.banner) { add(s.banner.cn); add(s.banner.en); }
    }
    for (const c of CHAPTERS) { add(c.cn); add(c.en); }
    for (const c of PFC_PILLS) { add(c.cn); add(c.en); }
    for (const w of EF_WORDS) { add(w.cn); add(w.en); add(w.en.toUpperCase()); }
    add(FINAL_TITLE.cn); add(FINAL_TITLE.en);
    for (const c of CREDITS) { add(c.cn); add(c.en); }
    add('人类大脑THE HUMAN BRAIN神经元重量能量消耗0123456789.%kgB控制环路丘脑基底节杏仁核海马顶叶HIPPOCAMPUS');
    const all = [...chars].join('');
    const specs = ['500 33px "Noto Sans SC"', '700 33px "Noto Sans SC"', '900 100px "Noto Sans SC"',
      '600 29px "Barlow Condensed"', '800 60px "Barlow Condensed"', '900 100px "Barlow Condensed"', '600 26px "Rajdhani"', '700 26px "Rajdhani"'];
    await Promise.all(specs.map((s) => this.d.fonts.load(s, all)));
    await this.d.fonts.ready;
  }

  rebuildChips(sc) {
    const host = this.el.chips; host.innerHTML = ''; this.chipEls = [];
    for (const c of sc.chips || []) {
      const n = this.d.createElement('div'); n.className = 'chip';
      n.innerHTML = `<div class="bar"></div><div class="cn">${c.cn}</div><div class="en">${c.en}</div>`;
      n.style.opacity = '0'; host.appendChild(n); this.chipEls.push({ n, b: c.b });
    }
  }

  update(ctx) {
    const { sc, prevSc, u, beat, beatIdx, beatFrac, marker, labels, flash, bands, dip, t, pulse } = ctx;
    const el = this.el;
    if (this.curScene !== sc) { this.curScene = sc; this.rebuildChips(sc); }

    // ---- progress pills
    const mode = modeOf(sc), prevMode = modeOf(prevSc);
    let active = -1, pfcPhase = u;
    if (mode === 'chap') active = sc.fx === 'recap' ? Math.min(3, Math.floor(beat / 2)) : sc.chapter;
    if (mode === 'pfc') {
      if (sc.fx === 'pfcoverview') { const step = 5.4 / 7; active = Math.min(6, Math.floor((u - 0.9) / step)); pfcPhase = (u - 0.9) % step; }
      else active = sc.pfc;
    }
    el.pills.style.opacity = (mode ? (mode === prevMode && prevSc !== sc ? 1 : out3(clamp01(u / 0.25))) : 0).toFixed(3);
    this.chapPills.forEach((p, i) => {
      p.style.display = mode === 'chap' ? '' : 'none';
      p.className = 'pill' + (i === active ? ' on' : i < active ? ' done' : '');
      p.style.transform = i === active ? `scale(${1 + 0.1 * Math.exp(-u * 9)})` : '';
    });
    this.pfcPills.forEach((p, i) => {
      p.style.display = mode === 'pfc' ? '' : 'none';
      p.className = 'pill' + (i === active ? ' on' : i < active ? ' done' : '');
      p.style.transform = i === active ? `scale(${1 + 0.1 * Math.exp(-Math.max(0, pfcPhase) * 9)})` : '';
    });

    // ---- region tag
    if (sc.tag) {
      const tg = sc.tag;
      const kick = tg.kicker || (sc.chapter !== undefined ? `CH.0${sc.chapter + 1}  ·  ${CHAPTERS[sc.chapter].cn}  ${CHAPTERS[sc.chapter].en}` : '');
      this.setText(this.tag.kicker, kick); this.setText(this.tag.cn, tg.cn); this.setText(this.tag.en, tg.en);
      this.setText(this.tag.meta, (tg.meta || '').replace('  ', '\n'));
      const lift = (delay, k) => { const x = clamp01((u - delay) / 0.2); return [out3(x), (1 - outBack(x)) * -k]; };
      const [ok, ox] = lift(0, 40), [oc, xc] = lift(0.04, 90), [oe, xe] = lift(0.09, 70), [om, xm] = lift(0.15, 40);
      this.show(this.tag.kicker, ok, `translateX(${ox}px)`);
      this.show(this.tag.cn, oc, `translateX(${xc}px) scale(${1 + 0.05 * (1 - oc)})`);
      this.show(this.tag.en, oe, `translateX(${xe}px)`);
      this.show(this.tag.meta, tg.meta ? om : 0, `translateX(${xm}px)`);
      this.show(el.tag, 1);
    } else this.show(el.tag, 0);

    // ---- keyword chips (one new chip per bar)
    this.chipEls.forEach((c) => {
      const age = u - c.b * BEAT;
      this.show(c.n, age < 0 ? 0 : out3(clamp01(age / 0.22)), `translateX(${(1 - outBack(clamp01(age / 0.28))) * -80}px)`);
      c.n.style.filter = age >= 0 && age < 0.18 ? 'brightness(1.8)' : '';
    });

    // ---- bilingual subtitle
    let cue = null;
    (sc.cues || []).forEach((c) => { if (u >= c.b0 * BEAT && u < c.b1 * BEAT) cue = c; });
    if (cue) {
      this.setText(this.sub.cn, cue.cn); this.setText(this.sub.en, cue.en);
      const s0 = cue.b0 * BEAT, s1 = cue.b1 * BEAT;
      const a = out3(clamp01((u - s0) / 0.16)) * clamp01((s1 - u) / 0.12);
      this.show(el.sub, a, `translateY(${(1 - out3(clamp01((u - s0) / 0.2))) * 26}px)`);
    } else this.show(el.sub, 0);

    // ---- overview counters
    if (sc.fx === 'overview') {
      const fadeOut = 1 - clamp01((u - 5.4) / 0.3);
      this.counters.forEach((c) => {
        const age = u - c.start * BEAT;
        const v = c.v * out3(clamp01(age / 0.85));
        this.setText(c.vEl, c.dec ? v.toFixed(c.dec) : String(Math.round(v)));
        this.show(c.n, age < 0 ? 0 : out3(clamp01(age / 0.15)) * fadeOut, `translateX(${(1 - outBack(clamp01(age / 0.3))) * -70}px)`);
      });
      this.show(el.counters, 1);
    } else this.show(el.counters, 0);

    // ---- recap banner
    if (sc.fx === 'recap' && sc.banner) {
      this.setText(this.banner.cn, sc.banner.cn); this.setText(this.banner.en, sc.banner.en);
      this.show(el.banner, out3(clamp01(u / 0.15)) * clamp01((4 * BEAT - u) / 0.25), `scale(${1 + 0.14 * (1 - out3(clamp01(u / 0.3)))})`);
    } else this.show(el.banner, 0);

    // ---- intro title
    if (sc.fx === 'intro') {
      this.setText(this.title.cn, '人类大脑'); this.setText(this.title.en, 'THE HUMAN BRAIN');
      const out = clamp01((u - 3.5) / 0.8);
      const a1 = out3(clamp01((u - 1.2) / 0.5)) * (1 - out);
      const a2 = out3(clamp01((u - 2.4) / 0.4)) * (1 - out);
      const s1 = (1.14 - 0.14 * out3(clamp01((u - 1.2) / 0.8))) * (1 + 0.8 * out * out);
      this.title.cn.style.opacity = a1.toFixed(3); this.title.cn.style.transform = `scale(${s1})`;
      this.title.en.style.opacity = a2.toFixed(3);
      this.title.en.style.transform = `translateY(${(1 - out3(clamp01((u - 2.4) / 0.5))) * 30}px) scale(${1 + 0.8 * out * out})`;
      this.show(el.title, 1);
    } else this.show(el.title, 0);

    // ---- finale words + lock-up
    if (sc.fx === 'finale' && beat < 8) {
      const w = EF_WORDS[Math.min(7, beatIdx)];
      this.setText(this.ef.cn, w.cn); this.setText(this.ef.en, w.en.toUpperCase());
      const k = out3(clamp01(beatFrac / 0.22));
      this.show(el.ef, 1, `translateX(${(1 - outBack(clamp01(beatFrac / 0.25))) * -90}px) scale(${1 + 0.05 * (1 - k)})`);
      this.ef.cn.style.opacity = k.toFixed(3); this.ef.en.style.opacity = k.toFixed(3);
    } else this.show(el.ef, 0);
    if ((sc.fx === 'finale' && beat >= 8) || sc.fx === 'outro') {
      this.setText(this.lockup.cn, FINAL_TITLE.cn); this.setText(this.lockup.en, FINAL_TITLE.en);
      const age = sc.fx === 'outro' ? 9 : u - 8 * BEAT;
      this.show(el.lockup, out3(clamp01(age / 0.3)), `translateX(${(1 - outBack(clamp01(age / 0.35))) * -100}px)`);
    } else this.show(el.lockup, 0);
    this.show(el.credits, sc.fx === 'outro' ? out3(clamp01((u - BEAT) / 0.6)) : 0);

    // ---- call-out line from the tag to the structure
    if (marker && sc.tag) {
      const k = out3(clamp01((u - 0.12) / 0.4));
      const endX = 790, endY = Math.min(820, Math.max(320, marker.y));
      const pts = marker.x - 80 > endX + 40 ? [[endX, endY], [marker.x - 80, endY], [marker.x - 22, marker.y]] : [[endX, endY], [marker.x, marker.y]];
      let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      el.coLine.setAttribute('points', pts.map((p) => p.join(',')).join(' '));
      el.coLine.setAttribute('stroke-dasharray', `${(L * k).toFixed(1)} ${L.toFixed(1)}`);
      el.coLine.style.opacity = '0.9';
      el.coEnd.setAttribute('x', endX - 5); el.coEnd.setAttribute('y', endY - 5); el.coEnd.style.opacity = k.toFixed(2);
      el.coDot.setAttribute('cx', marker.x); el.coDot.setAttribute('cy', marker.y); el.coDot.style.opacity = k.toFixed(2);
      el.coRing.setAttribute('cx', marker.x); el.coRing.setAttribute('cy', marker.y); el.coRing.setAttribute('r', (12 + 26 * beatFrac).toFixed(1));
      el.coRing.style.opacity = (k * (1 - beatFrac) * 0.9).toFixed(3);
    } else for (const e of [el.coLine, el.coEnd, el.coDot, el.coRing]) e.style.opacity = '0';

    // ---- control-loop labels: spread vertically so they never overlap, leader lines to the end points
    if (labels && labels.length) {
      const order = labels.map((_, i) => i).sort((a, b) => labels[a].y - labels[b].y);
      const ys = {};
      let last = -1e9;
      for (const i of order) { ys[i] = Math.max(labels[i].y, last + 74); last = ys[i]; }
      const lastI = order[order.length - 1];
      const shiftUp = Math.max(0, (ys[lastI] - labels[lastI].y) * 0.5);
      const lx = Math.min(1560, Math.max(...labels.map((q) => q.x)) + 110);
      this.arcLabels.forEach((a, i) => {
        const L = labels[i];
        if (!L || !L.on) { a.g.style.opacity = '0'; return; }
        const age = clamp01((u - (1 + i) * BEAT) / 0.25);
        const ly = ys[i] - shiftUp;
        a.t1.textContent = L.cn; a.t2.textContent = L.en;
        for (const tt of [a.t1, a.t2]) { tt.setAttribute('x', lx + 14); tt.setAttribute('y', ly + 4); }
        a.ln.setAttribute('points', `${L.x},${L.y} ${lx - 40},${ly} ${lx},${ly}`);
        a.dt.setAttribute('cx', L.x); a.dt.setAttribute('cy', L.y);
        a.g.style.opacity = out3(age).toFixed(3);
      });
    } else this.arcLabels.forEach((a) => { a.g.style.opacity = '0'; });

    // ---- spectrum along the bottom edge
    const g = this.spec; g.clearRect(0, 0, 1920, 64);
    const n = 64, bw = 22, gap = 8, x0 = (1920 - n * (bw + gap) + gap) / 2;
    for (let i = 0; i < n; i++) {
      let v;
      if (bands) { const f = (i / (n - 1)) * (bands.length - 1); const i0 = Math.floor(f); v = bands[i0] * (1 - (f - i0)) + bands[Math.min(bands.length - 1, i0 + 1)] * (f - i0); }
      else v = pulse * (0.4 + 0.6 * Math.abs(Math.sin(i * 0.7 + t * 3)));
      const h = 3 + 54 * Math.min(1, v);
      g.fillStyle = i % 8 === 0 ? '#CCDBEB' : '#6C9AC4'; g.globalAlpha = 0.55 + 0.4 * Math.min(1, v);
      g.fillRect(x0 + i * (bw + gap), 64 - h, bw, h);
    }
    g.globalAlpha = 1;

    // ---- flash / fade
    el.flash.style.opacity = Math.min(0.62, flash * 0.5).toFixed(3);
    let fade = 0;
    if (t < 0.5) fade = 1 - t / 0.5;
    if (t > DURATION - 1.4) fade = Math.max(fade, clamp01((t - (DURATION - 1.4)) / 1.2));
    el.fade.style.opacity = Math.max(fade, dip || 0).toFixed(3);
  }
}
