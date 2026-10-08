// Screenshot every page in headless Chromium (software WebGL via SwiftShader)
// and report console errors. Usage:
//   node neuro/scripts/shoot.mjs [file] [outDir]
//   PAGES=0,4,4.5 SIZES=desktop N=30000 node neuro/scripts/shoot.mjs
// Needs Playwright (`npm i -D playwright`), or PW_MODULE pointing at its index.mjs.

import path from 'node:path';
import fs from 'node:fs/promises';

const { chromium } = await import(process.env.PW_MODULE || 'playwright');
const file = path.resolve(process.argv[2] || 'neuro/dist/index.html');
const out = path.resolve(process.argv[3] || 'shots');
const pages = (process.env.PAGES || '0,1,2,3,4,5,6,7,8,9,10,11,12').split(',').map(Number);
const want = (process.env.SIZES || 'desktop,phone').split(',');
const sizes = [['desktop', 1440, 900], ['phone', 390, 844]].filter(([k]) => want.includes(k));
const N = process.env.N || 30000;
const wait = Number(process.env.WAIT || 2600);

await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const problems = [];
for (const [name, w, h] of sizes) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: name === 'phone' });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`[${name}] ${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`[${name}] pageerror: ${e.message}`));
  await page.goto(`file://${file}?n=${N}`);
  await page.waitForFunction(() => window.__neuro && document.body.classList.contains('ready'), null, { timeout: 180000 });
  for (const i of pages) {
    await page.evaluate((k) => window.__neuro.jump(k), i);
    await page.waitForTimeout(wait);
    const shot = path.join(out, `${name}-${String(i).replace('.', '_')}.png`);
    await page.screenshot({ path: shot });
    console.log('saved', path.relative(process.cwd(), shot));
  }
  await page.close();
}
await browser.close();
console.log(problems.length ? `\n${problems.length} console problems:\n${[...new Set(problems)].join('\n')}` : '\nno console errors');
