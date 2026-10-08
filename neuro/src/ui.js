import { PAGES } from './content.js';

// Builds the text panels, the level ladder (right edge) and the scroll track
// from PAGES.

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
  const levels = PAGES.filter((p) => p.level).length;
  let n = 0;

  panels.innerHTML = PAGES.map((p, i) => {
    const center = !p.level;
    const len = Math.max(...p.name.map((l) => l.length));
    const tag = i === 0 ? 'h1' : 'h2';
    const eyebrow = center
      ? `<p class="eyebrow rise"><span>${esc(p.eyebrow)}</span></p>`
      : `<p class="eyebrow rise"><span class="lvl">${esc(p.level)}</span><span>${esc(p.levelName)}</span><span class="idx">${String(++n).padStart(2, '0')} / ${String(levels).padStart(2, '0')}</span></p>`;
    const facts = p.facts
      ? `<dl class="facts rise">${p.facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`
      : '';
    const evidence = p.evidence ? `<p class="evidence rise"><span class="tag">循证</span>${esc(p.evidence)}</p>` : '';
    const legend = p.legend
      ? `<ul class="legend rise" aria-label="粒子颜色说明">${p.legend.map(([c, t]) => `<li><i style="--c:${c}"></i>${esc(t)}</li>`).join('')}</ul>`
      : '';
    let extra = '';
    if (p.key === 'hero') {
      extra = `<div class="cta-row rise"><button class="cta" type="button" data-action="enter">开启声音 · 进入</button><button class="cta cta--quiet" type="button" data-go="1">静音浏览</button></div>`;
    } else if (p.key === 'outro') {
      extra = `<div class="cta-row rise"><button class="cta" type="button" data-go="0">回到起点</button></div>
        <p class="credits">粒子：Three.js · 配乐与音效：Web Audio 实时合成 · 字体：Oswald 等（SIL OFL）</p>`;
    }
    return `<section class="panel ${center ? 'panel--center' : 'panel--side'} panel--${p.key}" id="p-${p.key}" data-index="${i}">
      <div class="copy">
        ${eyebrow}
        <${tag} class="name neon" style="--len:${len}" lang="en" aria-label="${esc(p.title)}">${neonLines(p.name)}</${tag}>
        <p class="line rise">${esc(p.line)}</p>
        <p class="body rise">${esc(p.body)}</p>
        ${facts}
        ${legend}
        ${evidence}
        ${extra}
      </div>
    </section>`;
  }).join('');

  rail.innerHTML = PAGES.map((p, i) =>
    `<button type="button" data-go="${i}" aria-label="跳转到 ${esc(p.level ? p.level + ' ' : '')}${esc(p.rail)}"><span class="lbl">${esc(p.rail)}</span><span class="code">${esc(p.level || (i ? '∞' : '00'))}</span><span class="dot"></span></button>`
  ).join('');

  track.innerHTML = PAGES.map(() => '<div></div>').join('');

  return {
    panels: [...panels.querySelectorAll('.panel')],
    railButtons: [...rail.querySelectorAll('button')],
  };
}
