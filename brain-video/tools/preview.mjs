// Render selected frames to JPEG (for QA).  usage: node tools/preview.mjs <outdir> <width> <frame,frame,...|scene:id,...>
import { chromium } from 'playwright-core';
import { serve } from './serve.mjs';
import path from 'node:path';
import fs from 'node:fs';
const root = path.resolve(import.meta.dirname, '..');
const [outDir, widthArg, listArg] = process.argv.slice(2);
const W = +widthArg || 960;
fs.mkdirSync(outDir, { recursive: true });
const { server, port } = await serve(root);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: Math.round(W * 9 / 16) } });
page.on('console', (m) => { const t = m.text(); if (!t.includes('404')) console.log('[page]', t); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${port}/src/index.html?w=${W}&rs=${process.env.RS || 1}`);
await page.waitForFunction('window.ready === true', null, { timeout: 180000 });
const frames = [];
for (const tok of listArg.split(',')) {
  if (tok.startsWith('scene:')) {
    const id = tok.slice(6).split('@');
    const f = await page.evaluate(([i, off]) => { const m = window.__scenes.find((s) => s.id === i); return Math.round((m.t0 + (+off || 0.55 * (m.t1 - m.t0))) * 30); }, [id[0], id[1]]);
    frames.push([tok, f]);
  } else frames.push([tok, +tok]);
}
for (const [name, f] of frames) {
  const t0 = performance.now();
  await page.evaluate((f) => window.renderFrame(f), f);
  const buf = await page.screenshot({ type: 'jpeg', quality: 90 });
  fs.writeFileSync(path.join(outDir, `f${String(f).padStart(5, '0')}_${name.replace(/[:@]/g, '-')}.jpg`), buf);
  console.log('frame', f, name, `${(performance.now() - t0).toFixed(0)}ms`);
}
await browser.close(); server.close();
