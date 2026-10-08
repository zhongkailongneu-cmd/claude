// Page settings: palette (multi / mono), particle glow, text glow, display
// font, type size and the two volumes. Values persist per viewer in
// localStorage (best effort — the page works the same without it).

const KEY = 'solar-particles-settings-v1';

export const DEFAULTS = { palette: 'multi', glow: 70, textGlow: 70, font: 'oswald', size: 100, music: 70, sfx: 70 };

// Each display font with the weights used for the headline and the English line.
export const FONTS = {
  oswald: { family: '"Oswald Hollow", "Arial Narrow", sans-serif', name: 600, line: 500, track: '0.015em' },
  bebas: { family: '"Bebas Neue Hollow", Impact, sans-serif', name: 400, line: 400, track: '0.03em' },
  orbitron: { family: '"Orbitron Hollow", sans-serif', name: 600, line: 600, track: '0.04em' },
  michroma: { family: '"Michroma Hollow", sans-serif', name: 400, line: 400, track: '0.02em' },
  syncopate: { family: '"Syncopate Hollow", sans-serif', name: 700, line: 700, track: '0.01em' },
};

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const v = JSON.parse(raw);
    const out = { ...DEFAULTS };
    for (const k of Object.keys(DEFAULTS)) if (typeof v[k] === typeof DEFAULTS[k]) out[k] = v[k];
    if (!FONTS[out.font]) out.font = DEFAULTS.font;
    if (out.palette !== 'mono') out.palette = 'multi';
    return out;
  } catch {
    return { ...DEFAULTS };
  }
}

function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable: settings last for this visit only */
  }
}

// Average advance width of capitals, in em, so headline sizes can be derived
// from the longest line whatever the font.
const widthCache = {};
function capWidth(fontKey) {
  if (widthCache[fontKey]) return widthCache[fontKey];
  const f = FONTS[fontKey];
  const c = document.createElement('canvas').getContext('2d');
  c.font = `${f.name} 100px ${f.family}`;
  const sample = 'MERCURYSATURNJUPITERNEPTUNE';
  const w = c.measureText(sample).width / (sample.length * 100);
  return (widthCache[fontKey] = w > 0.2 ? w : 0.6);
}

export function createSettings({ onChange }) {
  const state = load();
  const root = document.documentElement;
  const panel = document.getElementById('settings');
  const openBtn = document.getElementById('settings-btn');
  const $ = (id) => document.getElementById(id);
  const sliders = { glow: 's-glow', textGlow: 's-tglow', size: 's-size', music: 's-music', sfx: 's-sfx' };
  const outputs = { glow: 'o-glow', textGlow: 'o-tglow', size: 'o-size', music: 'o-music', sfx: 'o-sfx' };

  function applyText() {
    const f = FONTS[state.font];
    root.style.setProperty('--f-display', f.family);
    root.style.setProperty('--w-name', String(f.name));
    root.style.setProperty('--w-line', String(f.line));
    root.style.setProperty('--track', f.track);
    root.style.setProperty('--wf', capWidth(state.font).toFixed(3));
    root.style.setProperty('--fs', String(state.size / 100));
    const g = state.textGlow / 70;
    const px = (v) => `${(v * g).toFixed(1)}px`;
    root.style.setProperty('--neon-filter', g < 0.01 ? 'none'
      : `drop-shadow(0 0 ${px(1)} var(--neon)) drop-shadow(0 0 ${px(5)} var(--neon)) drop-shadow(0 0 ${px(16)} var(--neon)) drop-shadow(0 0 ${px(34)} var(--neon-halo))`);
  }

  function applyPalette() {
    document.body.classList.toggle('mono', state.palette === 'mono');
    document.querySelectorAll('[data-palette]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.palette === state.palette)));
  }

  function syncInputs() {
    for (const [k, id] of Object.entries(sliders)) $(id).value = state[k];
    for (const [k, id] of Object.entries(outputs)) $(id).textContent = k === 'size' ? `${state[k]}%` : String(state[k]);
    $('s-font').value = state.font;
  }

  function set(key, value, { silent = false } = {}) {
    if (state[key] === value) return;
    state[key] = value;
    if (key === 'palette') applyPalette();
    if (key === 'font' || key === 'size' || key === 'textGlow') applyText();
    syncInputs();
    save(state);
    if (!silent) onChange(key, value, state);
  }

  for (const [k, id] of Object.entries(sliders)) {
    $(id).addEventListener('input', (e) => set(k, Number(e.target.value)));
  }
  $('s-font').addEventListener('change', (e) => {
    const key = e.target.value;
    document.fonts?.load(`${FONTS[key].name} 100px ${FONTS[key].family}`).finally(() => {
      delete widthCache[key];
      set('font', key);
      applyText();
    });
  });
  document.querySelectorAll('[data-palette]').forEach((b) => b.addEventListener('click', () => set('palette', b.dataset.palette)));
  panel.querySelector('[data-reset]').addEventListener('click', () => {
    for (const k of Object.keys(DEFAULTS)) set(k, DEFAULTS[k]);
  });

  function open() {
    panel.hidden = false;
    requestAnimationFrame(() => panel.classList.add('open'));
    openBtn.setAttribute('aria-expanded', 'true');
    onChange('panel', true, state);
  }
  function close() {
    if (panel.hidden) return;
    panel.classList.remove('open');
    openBtn.setAttribute('aria-expanded', 'false');
    setTimeout(() => { if (!panel.classList.contains('open')) panel.hidden = true; }, 320);
    onChange('panel', false, state);
  }
  const isOpen = () => !panel.hidden && panel.classList.contains('open');
  openBtn.addEventListener('click', () => (isOpen() ? close() : open()));
  panel.querySelector('[data-close]').addEventListener('click', close);
  addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  addEventListener('pointerdown', (e) => {
    if (isOpen() && !panel.contains(e.target) && !openBtn.contains(e.target)) close();
  });

  applyPalette();
  syncInputs();
  applyText();
  // Re-measure once the inlined fonts are ready.
  document.fonts?.ready.then(() => {
    for (const k of Object.keys(widthCache)) delete widthCache[k];
    applyText();
  });

  return {
    state,
    set,
    togglePalette: () => set('palette', state.palette === 'mono' ? 'multi' : 'mono'),
    toggleOpen: () => (isOpen() ? close() : open()),
  };
}
