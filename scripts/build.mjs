// Builds two single-file pages from src/:
//   dist/index.html            everything inlined (three.js included); works offline,
//                              even opened straight from disk.
//   .artifact/luminous-deep.html  a body fragment that loads three.js from jsDelivr
//                              through an import map (used for the claude.ai preview).
// `--watch` rebuilds on change and serves dist/ at http://localhost:8000.

import * as esbuild from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const r = (p) => path.join(root, p);
const watch = process.argv.includes('--watch');
const THREE_VERSION = JSON.parse(await fs.readFile(r('node_modules/three/package.json'), 'utf8')).version;
const CDN = process.env.THREE_CDN || `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}`;

const TITLE = 'Luminous Deep';
const DESCRIPTION = 'A scroll-driven journey through the ocean, with sea creatures drawn in fluorescent particles and a generative deep-sea score.';
const FONTS = [
  '<link rel="preconnect" href="https://fonts.googleapis.com">',
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:ital,wght@0,400;0,500;1,400&family=Krona+One&family=Sora:wght@300;400;500&display=swap">',
].join('\n');

const safeScript = (js) => js.replace(/<\/script/gi, '<\\/script');

async function build() {
  const t0 = Date.now();
  const common = { entryPoints: [r('src/main.js')], bundle: true, minify: true, write: false, target: 'es2020', legalComments: 'none' };
  const [full, esm] = await Promise.all([
    esbuild.build({ ...common, format: 'iife' }),
    esbuild.build({ ...common, format: 'esm', external: ['three', 'three/addons/*'] }),
  ]);
  const css = await fs.readFile(r('src/styles.css'), 'utf8');
  const body = await fs.readFile(r('src/body.html'), 'utf8');

  const standalone = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#01040b">
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
  const artifact = `<title>${TITLE}</title>
${FONTS}
<style>${css}</style>
${body}
<script type="importmap">${importMap}</script>
<script type="module">${safeScript(esm.outputFiles[0].text)}</script>
`;

  await fs.mkdir(r('dist'), { recursive: true });
  await fs.mkdir(r('.artifact'), { recursive: true });
  await fs.writeFile(r('dist/index.html'), standalone);
  await fs.writeFile(r('.artifact/luminous-deep.html'), artifact);
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
  await ctx.serve({ servedir: r('dist'), port: 8000 });
  console.log('serving dist/ on http://localhost:8000');
}
