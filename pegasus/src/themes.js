// Three colour systems. Each theme feeds both the WebGL fibres (c1/c2/c3/hot, bg)
// and the DOM through CSS variables (ui), so one switch re-colours everything.
//
//  violet  - the palette of the reference video (lavender fibres on black).
//  loyel   - Loyel 2025 gradient blue. Only the ten official tokens are used:
//            #F4F7FB #E8EEF6 #CCDBEB #9FBDDA #6C9AC4 #497DAE #376392 #2E5076 #2B4868 #263B54
//  aurora  - emerald / teal northern-lights green with a faint violet fringe.

export const LOYEL = ['#F4F7FB', '#E8EEF6', '#CCDBEB', '#9FBDDA', '#6C9AC4', '#497DAE', '#376392', '#2E5076', '#2B4868', '#263B54'];
export const AURORA = ['#F0FFF8', '#D6FFEC', '#A8FFD8', '#6BFFC0', '#2DF5A6', '#14D68E', '#0FA874', '#0B7A5A', '#085446', '#05302B'];

export const THEMES = {
  violet: {
    id: 'violet',
    name: 'Pegasus Violet',
    swatch: ['#9B7BFF', '#4C66FF', '#E07BE0'],
    c1: '#A98DFF', c2: '#5A6CFF', c3: '#E27FE6', hot: '#F6F1FF',
    bg1: '#07050F', bg2: '#000000',
    gain: 1.0, vignette: 0.55, tone: 1.3, bloom: 1.0,
    themeColor: '#000000',
    ui: {
      '--bg': '#000000',
      '--text': '#FFFFFF',
      '--text-dim': 'rgba(255,255,255,.62)',
      '--text-faint': 'rgba(255,255,255,.38)',
      '--line': 'rgba(255,255,255,.09)',
      '--glass': 'rgba(255,255,255,.075)',
      '--glass-strong': 'rgba(255,255,255,.14)',
      '--accent': '#A58BFF',
      '--accent-2': '#6E56F0',
      '--accent-soft': 'rgba(165,139,255,.18)',
      '--accent-glow': 'rgba(150,120,255,.55)',
      '--panel': 'rgba(14,12,24,.93)',
      '--panel-2': 'rgba(255,255,255,.035)',
      '--panel-line': 'rgba(255,255,255,.08)',
      '--bar-top': '#D9CCFF', '--bar-a': '#B79CFF', '--bar-b': '#8F72EE', '--bar-side': '#6A53C9',
      '--ok': '#2FBF71', '--ok-bg': 'rgba(47,191,113,.16)',
      '--knob-a': '#C5B5FF', '--knob-b': '#6E56F0',
    },
  },

  loyel: {
    id: 'loyel',
    name: 'Loyel Gradient Blue',
    swatch: ['#9FBDDA', '#497DAE', '#263B54'],
    // fibres: Color 50 / Color 70 / Color 40, with Color 10 as the white-hot core
    c1: '#6C9AC4', c2: '#376392', c3: '#9FBDDA', hot: '#F4F7FB',
    // background: Color 100 in the middle fading to Color 90 -> Color 100 only (no custom darks)
    bg1: '#2B4868', bg2: '#263B54',
    gain: 1.1, vignette: 0.18, tone: 1.1, bloom: 0.5,
    themeColor: '#263B54',
    ui: {
      '--bg': '#263B54',
      '--text': '#FFFFFF',
      '--text-dim': '#CCDBEB',
      '--text-faint': '#9FBDDA',
      '--line': 'rgba(159,189,218,.22)',
      '--glass': 'rgba(244,247,251,.10)',
      '--glass-strong': 'rgba(244,247,251,.18)',
      '--accent': '#9FBDDA',
      '--accent-2': '#497DAE',
      '--accent-soft': 'rgba(159,189,218,.20)',
      '--accent-glow': 'rgba(108,154,196,.65)',
      '--panel': 'rgba(43,72,104,.94)',
      '--panel-2': 'rgba(46,80,118,.55)',
      '--panel-line': 'rgba(159,189,218,.26)',
      '--bar-top': '#E8EEF6', '--bar-a': '#9FBDDA', '--bar-b': '#6C9AC4', '--bar-side': '#497DAE',
      '--ok': '#CCDBEB', '--ok-bg': 'rgba(73,125,174,.55)',
      '--knob-a': '#CCDBEB', '--knob-b': '#497DAE',
    },
  },

  aurora: {
    id: 'aurora',
    name: 'Aurora Green',
    swatch: ['#2DF5A6', '#18C8D8', '#9B8CFF'],
    c1: '#2DF5A6', c2: '#18C8D8', c3: '#9B8CFF', hot: '#E6FFF4',
    bg1: '#03140F', bg2: '#000605',
    gain: 1.0, vignette: 0.55, tone: 1.25, bloom: 1.0,
    themeColor: '#000605',
    ui: {
      '--bg': '#000605',
      '--text': '#FFFFFF',
      '--text-dim': 'rgba(214,255,236,.66)',
      '--text-faint': 'rgba(214,255,236,.4)',
      '--line': 'rgba(120,255,200,.12)',
      '--glass': 'rgba(120,255,200,.08)',
      '--glass-strong': 'rgba(120,255,200,.16)',
      '--accent': '#3DF7B0',
      '--accent-2': '#14C88A',
      '--accent-soft': 'rgba(61,247,176,.16)',
      '--accent-glow': 'rgba(45,245,166,.5)',
      '--panel': 'rgba(4,22,18,.93)',
      '--panel-2': 'rgba(120,255,200,.04)',
      '--panel-line': 'rgba(120,255,200,.12)',
      '--bar-top': '#BFFFE6', '--bar-a': '#5EF2B8', '--bar-b': '#2DC98F', '--bar-side': '#17936B',
      '--ok': '#3DF7B0', '--ok-bg': 'rgba(61,247,176,.16)',
      '--knob-a': '#8CFFD3', '--knob-b': '#14C88A',
    },
  },
};

export const THEME_ORDER = ['violet', 'loyel', 'aurora'];

export function applyUI(theme) {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(theme.ui)) root.style.setProperty(k, v);
  root.dataset.theme = theme.id;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme.themeColor);
}
