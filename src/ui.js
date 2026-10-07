import { PAGES } from './content.js';

// Builds the text panels, the creature rail and the scroll track from PAGES.

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function neonLines(lines) {
  let d = 0;
  return lines
    .map((ln) => `<span class="ln">${[...ln].map((ch) => (ch === ' ' ? ' ' : `<span class="ch" style="--d:${d++}">${esc(ch)}</span>`)).join('')}</span>`)
    .join('');
}

export function buildUI() {
  const panels = document.getElementById('panels');
  const rail = document.getElementById('rail');
  const track = document.getElementById('track');
  const creatures = PAGES.filter((p) => p.facts).length;
  let n = 0;

  panels.innerHTML = PAGES.map((p, i) => {
    const center = !p.facts;
    const len = Math.max(...p.name.map((l) => l.length));
    const tag = i === 0 ? 'h1' : 'h2';
    const idx = center ? '' : `<span class="idx">${String(++n).padStart(2, '0')} / ${String(creatures).padStart(2, '0')}</span>`;
    const eyebrow = `<p class="eyebrow rise">${idx}<span class="zone">${esc(p.zone || p.eyebrow)}</span></p>`;
    const facts = p.facts
      ? `<dl class="facts rise">${p.facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`
      : '';
    let extra = '';
    if (p.key === 'hero') {
      extra = `<div class="cta-row rise"><button class="cta" type="button" data-action="dive">Dive in with sound</button></div>`;
    } else if (p.key === 'outro') {
      extra = `<div class="cta-row rise"><button class="cta" type="button" data-go="0">Return to the surface</button></div>
        <p class="credits">Particles: Three.js · Score: generated live with Web Audio</p>`;
    }
    return `<section class="panel ${center ? 'panel--center' : 'panel--side'} panel--${p.key}" id="p-${p.key}" data-index="${i}" style="--accent:${p.accent || 'var(--neon)'}">
      <div class="copy">
        ${eyebrow}
        <${tag} class="name neon" style="--len:${len}" aria-label="${esc(p.title)}">${neonLines(p.name)}</${tag}>
        ${p.latin ? `<p class="latin rise">${esc(p.latin)}</p>` : ''}
        <p class="line neon">${esc(p.line)}</p>
        <p class="body rise">${esc(p.body)}</p>
        ${facts}
        ${extra}
      </div>
    </section>`;
  }).join('');

  rail.innerHTML = PAGES.map((p, i) =>
    `<button type="button" data-go="${i}" aria-label="Go to ${esc(p.title)}" style="--c:${p.accent || 'var(--neon)'}"><span class="lbl">${esc(p.rail)}</span><span class="dot"></span></button>`
  ).join('');

  track.innerHTML = PAGES.map(() => '<div></div>').join('');

  return {
    panels: [...panels.querySelectorAll('.panel')],
    railButtons: [...rail.querySelectorAll('button')],
  };
}
