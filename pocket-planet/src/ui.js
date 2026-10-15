// HUD: landmark card, region banner, season dock, touch joystick.

import { SEASONS, POLE_INFO } from './world.js';

const $ = (id) => document.getElementById(id);

export function initUI({ onSeason, onOverview, onJump }) {
  const card = $('card');
  const banner = $('banner');
  const dockBtns = [...document.querySelectorAll('[data-season]')];
  const overviewBtn = $('overviewBtn');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  dockBtns.forEach((b) => b.addEventListener('click', () => { onSeason(+b.dataset.season); b.blur(); }));
  overviewBtn.addEventListener('click', () => { onOverview(); overviewBtn.blur(); });
  $('jumpBtn').addEventListener('pointerdown', (e) => { e.preventDefault(); onJump(); });

  function themeFor(season) {
    return season < 0 ? POLE_INFO : SEASONS[season];
  }

  function setCard(lm) {
    const th = themeFor(lm.season);
    card.style.setProperty('--accent', th.accent);
    card.style.setProperty('--accent-soft', th.soft);
    $('cardGlyph').textContent = th.zh;
    $('cardEyebrow').textContent = lm.season < 0 ? `${th.en} · ${th.realm}` : `${th.en} · ${th.realm}`;
    $('cardTitle').textContent = lm.zh;
    $('cardEn').textContent = lm.en;
    $('cardDesc').textContent = lm.desc;
    if (!reduced) {
      card.classList.remove('pop');
      void card.offsetWidth;
      card.classList.add('pop');
    }
  }

  function setMeta(lat, lon, steps) {
    const ns = lat >= 0 ? 'N' : 'S';
    const ew = lon <= 180 ? 'E' : 'W';
    const lo = lon <= 180 ? lon : 360 - lon;
    $('cardCoord').textContent = `${Math.abs(lat).toFixed(0)}°${ns} · ${lo.toFixed(0)}°${ew}`;
    $('cardDist').textContent = steps <= 4 ? '就在这里' : `约 ${steps} 步`;
    $('cardDist').classList.toggle('here', steps <= 4);
  }

  let bannerTimer = 0;
  function showBanner(season) {
    const th = themeFor(season);
    banner.style.setProperty('--accent', th.accent);
    $('bannerZh').textContent = th.realm;
    $('bannerEn').textContent = season < 0 ? 'Where the four seasons meet' : `${th.en} Realm`;
    banner.classList.remove('show');
    void banner.offsetWidth;
    banner.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => banner.classList.remove('show'), 2600);
  }

  function setActive(season) {
    dockBtns.forEach((b) => b.setAttribute('aria-current', String(+b.dataset.season === season)));
  }
  function setOverview(on) {
    overviewBtn.setAttribute('aria-pressed', String(on));
  }

  // virtual joystick (touch): x = turn (right +), y = forward (+)
  const joy = { x: 0, y: 0 };
  const pad = $('joy'), knob = pad.querySelector('.knob');
  let pid = null;
  const move = (e) => {
    const r = pad.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2, max = r.width / 2 - 18;
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const l = Math.hypot(dx, dy);
    if (l > max) { dx *= max / l; dy *= max / l; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    joy.x = dx / max;
    joy.y = -dy / max;
  };
  pad.addEventListener('pointerdown', (e) => { pid = e.pointerId; pad.setPointerCapture(pid); move(e); e.preventDefault(); });
  pad.addEventListener('pointermove', (e) => { if (e.pointerId === pid) move(e); });
  const end = (e) => {
    if (e.pointerId !== pid) return;
    pid = null; joy.x = joy.y = 0; knob.style.transform = '';
  };
  pad.addEventListener('pointerup', end);
  pad.addEventListener('pointercancel', end);

  return { setCard, setMeta, showBanner, setActive, setOverview, joy };
}
