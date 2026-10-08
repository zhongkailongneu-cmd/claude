// Viewer settings: title and particle fluorescence, display font, weight,
// size and stroke, Chinese body font, music and sound-effect volume. Applied
// as CSS custom properties (type) or through callbacks (particles, audio),
// and remembered in this browser's localStorage when it is available.

export const FONTS = {
  oswald: { family: 'Oswald', label: 'Oswald', note: '原站字体', w: { light: 300, mid: 500, bold: 700 }, fw: { light: 0.45, mid: 0.48, bold: 0.51 } },
  bebas: { family: 'Bebas Neue', label: 'Bebas Neue', note: '窄体', w: { light: 400, mid: 400, bold: 400 }, fw: { light: 0.37, mid: 0.37, bold: 0.37 } },
  orbitron: { family: 'Orbitron', label: 'Orbitron', note: '科技', w: { light: 400, mid: 600, bold: 800 }, fw: { light: 0.75, mid: 0.75, bold: 0.75 } },
  cinzel: { family: 'Cinzel', label: 'Cinzel', note: '古典', w: { light: 400, mid: 600, bold: 800 }, fw: { light: 0.64, mid: 0.67, bold: 0.7 } },
  krona: { family: 'Krona One', label: 'Krona', note: '宽体', w: { light: 400, mid: 400, bold: 400 }, fw: { light: 0.85, mid: 0.85, bold: 0.85 } },
};

const CN = {
  sans: '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
  serif: '"Noto Serif SC", "Songti SC", "SimSun", serif',
  system: 'system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif',
};

export const DEFAULTS = {
  titleGlow: 1,
  particleGlow: 1,
  font: 'oswald',
  weight: 'mid',
  titleScale: 1,
  stroke: 1,
  cn: 'sans',
  music: 0.7,
  sfx: 0.8,
};

const KEY = 'neuro-plasticity-settings-v1';

const SCHEMA = [
  { group: '荧光', items: [
    { key: 'titleGlow', label: '标题荧光', type: 'range', min: 0, max: 2, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` },
    { key: 'particleGlow', label: '粒子荧光', type: 'range', min: 0.2, max: 2, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` },
  ] },
  { group: '字体', items: [
    { key: 'font', label: '标题字体', type: 'fonts' },
    { key: 'weight', label: '字重', type: 'seg', options: [['light', '细'], ['mid', '常规'], ['bold', '粗']] },
    { key: 'titleScale', label: '标题字号', type: 'range', min: 0.7, max: 1.3, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` },
    { key: 'stroke', label: '描边粗细', type: 'range', min: 0.5, max: 2, step: 0.05, fmt: (v) => `${v.toFixed(2)}×` },
    { key: 'cn', label: '中文字体', type: 'seg', options: [['sans', '黑体'], ['serif', '宋体'], ['system', '系统']] },
  ] },
  { group: '声音', items: [
    { key: 'music', label: '配乐', type: 'range', min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` },
    { key: 'sfx', label: '音效', type: 'range', min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` },
  ] },
];

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const s = { ...DEFAULTS, ...JSON.parse(raw) };
    if (!FONTS[s.font]) s.font = DEFAULTS.font;
    if (!CN[s.cn]) s.cn = DEFAULTS.cn;
    return s;
  } catch {
    return { ...DEFAULTS };
  }
}

function save(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: settings last for this visit only */
  }
}

// Stacked drop-shadows in Loyel blues: a bright inner rim fading into a wide
// steel-blue halo. g = 0 leaves the bare hollow outline.
export function neonFilter(g) {
  if (g < 0.02) return 'none';
  const layers = [
    [0.7, '204,219,235', 0.95],
    [3, '159,189,218', 0.9],
    [9, '108,154,196', 0.85],
    [22, '73,125,174', 0.7],
    [46, '55,99,146', 0.55],
  ];
  return layers
    .map(([r, rgb, a]) => `drop-shadow(0 0 ${(r * (0.5 + 0.5 * g)).toFixed(1)}px rgba(${rgb},${Math.min(1, a * g).toFixed(2)}))`)
    .join(' ');
}

export function createSettings({ onChange, sound }) {
  const state = load();
  const root = document.documentElement;
  const panel = document.getElementById('settings');
  const toggle = document.getElementById('settings-toggle');

  function apply(key) {
    const f = FONTS[state.font];
    root.style.setProperty('--neon-filter', neonFilter(state.titleGlow));
    root.style.setProperty('--glow-k', String(state.titleGlow));
    root.style.setProperty('--f-display', `"${f.family}", "Oswald", "Arial Narrow", sans-serif`);
    root.style.setProperty('--display-weight', String(f.w[state.weight]));
    root.style.setProperty('--fw', String(f.fw[state.weight]));
    root.style.setProperty('--title-scale', String(state.titleScale));
    root.style.setProperty('--stroke-k', String(state.stroke));
    root.style.setProperty('--f-body', CN[state.cn]);
    onChange?.(state, key);
  }

  // ---- build the panel ----
  const body = panel.querySelector('.settings-body');
  body.innerHTML = SCHEMA.map((g) => `
    <section><h3>${g.group}</h3>${g.items.map((it) => {
      if (it.type === 'range') {
        return `<label class="row"><span>${it.label}</span><input type="range" min="${it.min}" max="${it.max}" step="${it.step}" data-key="${it.key}"><output data-for="${it.key}"></output></label>`;
      }
      if (it.type === 'fonts') {
        return `<div class="row row--stack"><span>${it.label}</span><div class="seg seg--fonts" role="radiogroup" aria-label="${it.label}">${Object.entries(FONTS).map(([k, f]) =>
          `<button type="button" role="radio" data-key="font" data-val="${k}" style="font-family:'${f.family}';font-weight:${f.w.mid}"><b>${f.label}</b><small>${f.note}</small></button>`).join('')}</div></div>`;
      }
      return `<div class="row"><span>${it.label}</span><div class="seg" role="radiogroup" aria-label="${it.label}">${it.options.map(([v, t]) =>
        `<button type="button" role="radio" data-key="${it.key}" data-val="${v}">${t}</button>`).join('')}</div></div>`;
    }).join('')}${g.group === '字体' ? '<p class="preview neon" lang="en" aria-hidden="true">PLASTICITY</p>' : ''}</section>`).join('');

  const fmt = Object.fromEntries(SCHEMA.flatMap((g) => g.items).filter((i) => i.fmt).map((i) => [i.key, i.fmt]));
  function sync() {
    body.querySelectorAll('input[type=range]').forEach((el) => {
      el.value = state[el.dataset.key];
      const out = body.querySelector(`output[data-for="${el.dataset.key}"]`);
      if (out) out.textContent = fmt[el.dataset.key](state[el.dataset.key]);
    });
    body.querySelectorAll('button[data-val]').forEach((b) => b.setAttribute('aria-checked', String(state[b.dataset.key] === b.dataset.val)));
    const single = FONTS[state.font].w.light === FONTS[state.font].w.bold;
    body.querySelectorAll('button[data-key="weight"]').forEach((b) => { b.disabled = single; });
  }

  let saveTimer = 0;
  const commit = (key) => {
    apply(key);
    sync();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => save(state), 250);
  };

  body.addEventListener('input', (e) => {
    const el = e.target.closest('input[type=range]');
    if (!el) return;
    const key = el.dataset.key;
    state[key] = Number(el.value);
    commit(key);
    sound?.('slide', (state[key] - Number(el.min)) / (Number(el.max) - Number(el.min)), key);
  });
  body.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-val]');
    if (!b || b.disabled) return;
    state[b.dataset.key] = b.dataset.val;
    commit(b.dataset.key);
    sound?.('pick');
  });
  panel.querySelector('[data-reset]').addEventListener('click', () => {
    Object.assign(state, DEFAULTS);
    commit('reset');
    sound?.('reset');
  });

  // ---- open / close ----
  const setOpen = (open) => {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('settings-open', open);
    sound?.(open ? 'open' : 'close');
    if (open) panel.querySelector('input, button')?.focus({ preventScroll: true });
  };
  toggle.addEventListener('click', () => setOpen(panel.hidden));
  panel.querySelector('[data-close]').addEventListener('click', () => {
    setOpen(false);
    toggle.focus({ preventScroll: true });
  });
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) {
      setOpen(false);
      toggle.focus({ preventScroll: true });
    }
  });

  apply('init');
  sync();
  return { state, setOpen };
}
