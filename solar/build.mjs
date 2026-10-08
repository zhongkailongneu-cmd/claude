// Builds the solar-system particle site from solar/src into two pages:
//   solar/dist/index.html          everything inlined (three.js and the display
//                                  fonts included); works offline, even opened
//                                  straight from disk.
//   .artifact/solar-particles.html loads three.js from jsDelivr through an import
//                                  map (used for the claude.ai preview).
// `--watch` rebuilds on change and serves solar/dist at http://localhost:8001.

import * as esbuild from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '..');
const r = (p) => path.join(here, p);
const watch = process.argv.includes('--watch');
const THREE_VERSION = JSON.parse(await fs.readFile(path.join(root, 'node_modules/three/package.json'), 'utf8')).version;
const CDN = process.env.THREE_CDN || `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}`;

const TITLE = 'Particle Solar System';
const DESCRIPTION = 'A scroll-driven journey from the Sun past nine planets, drawn in fluorescent particles, with a generative space score.';
// Chinese body text; the display fonts are inlined below so they work offline.
const FONTS = [
  '<link rel="preconnect" href="https://fonts.googleapis.com">',
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Noto+Sans+SC:wght@300;400;500&display=swap">',
].join('\n');

// Display fonts, overlap-free (see tools/make_fonts.py), inlined as base64.
const FACES = [
  ['Oswald', 400, 'Oswald-400'],
  ['Oswald', 500, 'Oswald-500'],
  ['Oswald', 600, 'Oswald-600'],
  ['Bebas Neue', 400, 'BebasNeue-400'],
  ['Orbitron', 600, 'Orbitron-600'],
  ['Michroma', 400, 'Michroma-400'],
  ['Syncopate', 700, 'Syncopate-700'],
];

async function fontCSS() {
  const rules = await Promise.all(FACES.map(async ([family, weight, file]) => {
    const b64 = (await fs.readFile(r(`fonts/${file}.woff2`))).toString('base64');
    return `@font-face{font-family:"${family} Hollow";font-style:normal;font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${b64}) format("woff2")}`;
  }));
  return rules.join('\n');
}

const safeScript = (js) => js.replace(/<\/script/gi, '<\\/script');

async function build() {
  const t0 = Date.now();
  const common = { entryPoints: [r('src/main.js')], bundle: true, minify: true, write: false, target: 'es2020', legalComments: 'none' };
  const [full, esm] = await Promise.all([
    esbuild.build({ ...common, format: 'iife' }),
    esbuild.build({ ...common, format: 'esm', external: ['three', 'three/addons/*'] }),
  ]);
  const css = (await fontCSS()) + '\n' + (await fs.readFile(r('src/styles.css'), 'utf8'));
  const body = await fs.readFile(r('src/body.html'), 'utf8');

  const standalone = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#02040a">
<meta name="description" content="${DESCRIPTION}">
<title>${TITLE}</title>
${FONTS}
<style>${css}</style>
</head>
<body>
${body}
<script>${safeScript(full.outputFiles[0].text)}</script>
</body>
</html>
`;

  const importMap = JSON.stringify({ imports: { three: `${CDN}/build/three.module.min.js`, 'three/addons/': `${CDN}/examples/jsm/` } });
  const artifact = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${TITLE}</title>
${FONTS}
<style>${css}</style>
</head>
<body>
${body}
<script type="importmap">${importMap}</script>
<script type="module">${safeScript(esm.outputFiles[0].text)}</script>
</body>
</html>
`;

  await fs.mkdir(r('dist'), { recursive: true });
  await fs.mkdir(path.join(root, '.artifact'), { recursive: true });
  await fs.writeFile(r('dist/index.html'), standalone);
  await fs.writeFile(path.join(root, '.artifact/solar-particles.html'), artifact);
  const kb = (s) => `${(Buffer.byteLength(s) / 1024).toFixed(0)} KB`;
  console.log(`built in ${Date.now() - t0} ms · solar/dist/index.html ${kb(standalone)} · artifact ${kb(artifact)}`);
}

await build();

if (watch) {
  const { watch: fsWatch } = await import('node:fs');
  let pending = null;
  fsWatch(r('src'), { recursive: true }, () => {
    clearTimeout(pending);
    pending = setTimeout(() => build().catch((e) => console.error(e.message)), 80);
  });
  const ctx = await esbuild.context({});
  await ctx.serve({ servedir: r('dist'), port: 8001 });
  console.log('serving solar/dist on http://localhost:8001');
}
