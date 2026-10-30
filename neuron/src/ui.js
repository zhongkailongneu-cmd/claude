// DOM helpers: headline scramble, count-up numbers, chart + card markup, theme switcher.

import { THEMES, THEME_ORDER } from './themes.js';

const GLYPHS = 'abcdefghkmnopqrstuvwxyzABDEGHKNPQRSTUVXZ0123456789<>/\\|_=+*';
const rg = () => GLYPHS[(Math.random() * GLYPHS.length) | 0];

// ---- scramble text -------------------------------------------------------------------
// Characters decode left to right. Ahead of the decode head, letters flicker as random
// glyphs; further ahead they are just blurred slivers, like the reference page.
export class Scrambler {
  constructor(el) {
    this.el = el;
    this.lines = el.dataset.lines.split('|');
    el.setAttribute('aria-label', this.lines.join(' '));
    el.innerHTML = this.lines
      .map((ln) => `<span class="ln" aria-hidden="true">${[...ln].map((ch) => `<span class="c">${ch === ' ' ? '&nbsp;' : ch}</span>`).join('')}</span>`)
      .join('');
    this.chars = [...el.querySelectorAll('.c')];
    this.final = this.lines.join('').split('').map((c) => (c === ' ' ? ' ' : c));
    this.raf = 0;
    this.shown = false;
  }

  play(delay = 0, speed = 1) {
    cancelAnimationFrame(this.raf);
    this.shown = true;
    const n = this.chars.length;
    const start = performance.now() + delay;
    const per = 42 / speed; // ms per character of decode head travel
    let lastFlick = 0;
    const tick = (now) => {
      const el = now - start;
      if (el < 0) { this.paint(-99); this.raf = requestAnimationFrame(tick); return; }
      const head = el / per;
      const flick = now - lastFlick > 55;
      if (flick) lastFlick = now;
      this.paint(head, flick);
      if (head < n + 8) this.raf = requestAnimationFrame(tick);
      else this.paint(1e9);
    };
    this.raf = requestAnimationFrame(tick);
  }

  paint(head, flick = true) {
    for (let i = 0; i < this.chars.length; i++) {
      const c = this.chars[i];
      const d = i - head;
      const fin = this.final[i];
      if (d <= 0) {
        if (c.textContent !== fin) c.textContent = fin;
        c.className = 'c';
      } else if (fin === ' ') {
        c.className = 'c';
      } else if (d < 7) {
        if (flick) c.textContent = rg();
        c.className = 'c x';
      } else {
        c.textContent = d < 11 ? 'ı' : '|';
        c.className = 'c bar';
      }
    }
  }

  hide() {
    cancelAnimationFrame(this.raf);
    this.shown = false;
    for (const c of this.chars) { c.className = 'c bar'; c.textContent = '|'; }
  }
}

// ---- count-up ---------------------------------------------------------------------
const fmt = (v, dec) => v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
export function bindCounters(root) {
  const items = [...root.querySelectorAll('[data-count]')].map((el) => ({
    el,
    target: parseFloat(el.dataset.count),
    pre: el.dataset.pre || '',
    suf: el.dataset.suf || '',
    dec: parseInt(el.dataset.dec || '0', 10),
  }));
  return (k) => {
    for (const it of items) it.el.textContent = it.pre + fmt(it.target * k, it.dec) + it.suf;
  };
}

// ---- dashboard content ---------------------------------------------------------------
export function buildChart(host) {
  const rows = [['L5 pyramidal', 100, '18.4 Hz'], ['L2/3', 63, '11.6 Hz'], ['L4', 39, '7.2 Hz'], ['L6', 21, '3.9 Hz'], ['Thalamus', 11, '2.0 Hz']];
  host.innerHTML = rows
    .map(([d, h, v], i) => `<div class="col"><div class="lab"><small>${d}</small><b>${v}</b></div><div class="step" style="--h:${h * 0.7}%;--d:${0.15 * i}s"></div></div>`)
    .join('');
}

export function buildOpps(host) {
  const data = [
    ['Prefrontal Cortex', 'Cortex', '14.2 Hz', '9.8 M'],
    ['Hippocampus CA1', 'Limbic', '6.8 Hz', '1.1 M'],
    ['Motor Cortex M1', 'Cortex', '17.5 Hz', '6.4 M'],
    ['Visual Cortex V1', 'Cortex', '12.9 Hz', '8.2 M'],
    ['Amygdala', 'Limbic', '9.3 Hz', '0.9 M'],
    ['Thalamus', 'Relay', '11.0 Hz', '2.7 M'],
    ['Cerebellum', 'Motor', '38.0 Hz', '69 M'],
    ['Striatum', 'Basal ganglia', '5.1 Hz', '4.4 M'],
  ];
  host.innerHTML = data
    .map(([n, kind, rate, count]) => `<div class="opp"><div class="opp-t"><em class="tag">${kind.toUpperCase().split(' ')[0]}</em><span>${kind}</span><span>Active</span><span class="more">More Details →</span></div><h6>${n}</h6><dl><div><dt>Rate</dt><dd class="acc">${rate}</dd></div><div><dt>Neurons</dt><dd>${count}</dd></div></dl></div>`)
    .join('');
}

// ---- theme switcher --------------------------------------------------------------------
export function buildThemeSwitch(host, current, onPick) {
  host.innerHTML = THEME_ORDER.map((id) => {
    const t = THEMES[id];
    return `<button class="sw" type="button" role="radio" aria-checked="${id === current}" data-id="${id}" aria-label="${t.name}" style="--s1:${t.swatch[0]};--s2:${t.swatch[1]};--s3:${t.swatch[2]}"><span class="tip">${t.name}</span></button>`;
  }).join('');
  host.addEventListener('click', (e) => {
    const b = e.target.closest('.sw');
    if (!b) return;
    onPick(b.dataset.id);
  });
  return (id) => host.querySelectorAll('.sw').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.id === id)));
}
