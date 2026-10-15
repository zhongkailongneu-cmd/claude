// Builds the Pocket Planet pages from pocket-planet/src:
//   pocket-planet/dist/index.html   everything inlined (three.js included); works
//                                   offline, even opened straight from disk.
//   docs/pocket-planet/index.html   same file, served by GitHub Pages.
//   .artifact/pocket-planet.html    body fragment that loads three.js from jsDelivr
//                                   through an import map (claude.ai preview only).
// `--watch` rebuilds on change and serves dist/ at http://localhost:8001.

import * as esbuild from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const repo = path.resolve(here, '..');
const r = (p) => path.join(here, p);
const watch = process.argv.includes('--watch');
const THREE_VERSION = JSON.parse(await fs.readFile(path.join(repo, 'node_modules/three/package.json'), 'utf8')).version;
const CDN = process.env.THREE_CDN || `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}`;

const TITLE = 'Pocket Planet';
const DESCRIPTION = 'A walkable low-poly pocket planet with four seasons: sakura brook, firefly camp, harvest cabin and an aurora-lit snow peak.';
const FONTS = [
  '<link rel="preconnect" href="https://fonts.googleapis.com">',
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600&family=IBM+Plex+Mono:wght@400&family=Noto+Sans+SC:wght@400;500&family=ZCOOL+XiaoWei&display=swap">',
].join('\n');

const safeScript = (js) => js.replace(/<\/script/gi, '<\\/script');

async function build() {
  const t0 = Date.now();
  const common = { entryPoints: [r('src/main.js')], bundle: true, minify: true, write: false, target: 'es2020', legalComments: 'none', nodePaths: [path.join(repo, 'node_modules')] };
  const [full, esm] = await Promise.all([
    esbuild.build({ ...common, format: 'iife' }),
    esbuild.build({ ...common, format: 'esm', external: ['three'] }),
  ]);
  const css = await fs.readFile(r('src/styles.css'), 'utf8');
  const body = await fs.readFile(r('src/body.html'), 'utf8');

  const standalone = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#263B54">
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

  const importMap = JSON.stringify({ imports: { three: `${CDN}/build/three.module.min.js` } });
  const artifact = `<title>${TITLE}</title>
<meta name="claude:viewport-fit-sides" content="cover">
${FONTS}
<style>${css}</style>
${body}
<script type="importmap">${importMap}</script>
<script type="module">${safeScript(esm.outputFiles[0].text)}</script>
`;

  await fs.mkdir(r('dist'), { recursive: true });
  await fs.mkdir(path.join(repo, 'docs/pocket-planet'), { recursive: true });
  await fs.mkdir(path.join(repo, '.artifact'), { recursive: true });
  await fs.writeFile(r('dist/index.html'), standalone);
  await fs.writeFile(path.join(repo, 'docs/pocket-planet/index.html'), standalone);
  await fs.writeFile(path.join(repo, '.artifact/pocket-planet.html'), artifact);
  const kb = (s) => `${(Buffer.byteLength(s) / 1024).toFixed(0)} KB`;
  console.log(`built in ${Date.now() - t0} ms · dist/index.html ${kb(standalone)} · artifact ${kb(artifact)}`);
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
  console.log('serving pocket-planet/dist on http://localhost:8001');
}
