// Builds the Neuroplasticity site from neuro/src:
//   neuro/dist/index.html          everything inlined (three.js and fonts included);
//                                  works offline, even opened straight from disk.
//   docs/neuro/index.html          a copy for GitHub Pages (…/claude/neuro/).
//   .artifact/neuroplasticity.html a body fragment that loads three.js from
//                                  jsDelivr through an import map (claude.ai preview).
// `--watch` rebuilds on change and serves neuro/dist at http://localhost:8001.

import * as esbuild from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '..');
const repo = path.resolve(root, '..');
const r = (p) => path.join(root, p);
const watch = process.argv.includes('--watch');
const THREE_VERSION = JSON.parse(await fs.readFile(path.join(repo, 'node_modules/three/package.json'), 'utf8')).version;
const CDN = process.env.THREE_CDN || `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}`;

const TITLE = 'Neuroplasticity';
const DESCRIPTION = '神经可塑性粒子网页：从分子到脑–身体–环境，沿 L1–L10 层级滚动穿越，低饱和蓝色荧光粒子与实时生成的配乐。';
const FONTS_LINK = [
  '<link rel="preconnect" href="https://fonts.googleapis.com">',
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Noto+Sans+SC:wght@300;400;500&family=Noto+Serif+SC:wght@400;500&display=swap">',
].join('\n');

// Hollow-safe display fonts (overlaps removed by scripts/fonts.py), inlined.
const FACES = [
  ['Oswald', 'oswald', [300, 500, 700]],
  ['Bebas Neue', 'bebas-neue', [400]],
  ['Orbitron', 'orbitron', [400, 600, 800]],
  ['Cinzel', 'cinzel', [400, 600, 800]],
  ['Krona One', 'krona-one', [400]],
];

async function fontFaces() {
  const out = [];
  for (const [family, slug, weights] of FACES) {
    for (const w of weights) {
      const b64 = (await fs.readFile(r(`fonts/${slug}-${w}.woff2`))).toString('base64');
      // A single-weight family answers every weight, so the browser never fakes bold.
      const range = weights.length === 1 ? '100 900' : String(w);
      out.push(`@font-face{font-family:"${family}";src:url(data:font/woff2;base64,${b64}) format("woff2");font-weight:${range};font-style:normal;font-display:block}`);
    }
  }
  return out.join('\n');
}

const safeScript = (js) => js.replace(/<\/script/gi, '<\\/script');

async function build() {
  const t0 = Date.now();
  const common = { entryPoints: [r('src/main.js')], bundle: true, minify: true, write: false, target: 'es2020', legalComments: 'none', nodePaths: [path.join(repo, 'node_modules')] };
  const [full, esm] = await Promise.all([
    esbuild.build({ ...common, format: 'iife' }),
    esbuild.build({ ...common, format: 'esm', external: ['three', 'three/addons/*'] }),
  ]);
  const css = `${await fontFaces()}\n${await fs.readFile(r('src/styles.css'), 'utf8')}`;
  const body = await fs.readFile(r('src/body.html'), 'utf8');

  const standalone = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#02060d">
<meta name="description" content="${DESCRIPTION}">
<title>${TITLE}</title>
${FONTS_LINK}
<style>${css}</style>
</head>
<body>
${body}
<script>${safeScript(full.outputFiles[0].text)}</script>
</body>
</html>
`;

  const importMap = JSON.stringify({ imports: { three: `${CDN}/build/three.module.min.js`, 'three/addons/': `${CDN}/examples/jsm/` } });
  const artifact = `<title>${TITLE}</title>
${FONTS_LINK}
<style>${css}</style>
${body}
<script type="importmap">${importMap}</script>
<script type="module">${safeScript(esm.outputFiles[0].text)}</script>
`;

  await fs.mkdir(r('dist'), { recursive: true });
  await fs.mkdir(path.join(repo, 'docs/neuro'), { recursive: true });
  await fs.mkdir(path.join(repo, '.artifact'), { recursive: true });
  await fs.writeFile(r('dist/index.html'), standalone);
  await fs.writeFile(path.join(repo, 'docs/neuro/index.html'), standalone);
  await fs.writeFile(path.join(repo, '.artifact/neuroplasticity.html'), artifact);
  const kb = (s) => `${(Buffer.byteLength(s) / 1024).toFixed(0)} KB`;
  console.log(`built in ${Date.now() - t0} ms · neuro/dist/index.html ${kb(standalone)} · artifact ${kb(artifact)}`);
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
  console.log('serving neuro/dist on http://localhost:8001');
}
