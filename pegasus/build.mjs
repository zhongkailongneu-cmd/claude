// Builds pegasus/dist/index.html: one self-contained file (three.js, CSS and the Inter Tight
// font all inlined), so it works offline and straight from disk.
//   node build.mjs            one-off build
//   node build.mjs --watch    rebuild on change and serve dist/ on http://localhost:8001

import * as esbuild from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.dirname(new URL(import.meta.url).pathname);
const r = (p) => path.join(root, p);
const watch = process.argv.includes('--watch');

const TITLE = 'Pegasus · Light-fibre data infrastructure';
const DESCRIPTION = 'A scroll-driven WebGL landing page: light fibres morph from a fan into a funnel, a beam, a hyperboloid, a tube and an iris, then a 3D dashboard rises. Three colour themes (Violet, Loyel Blue, Aurora Green) and a generative BGM.';

const safeScript = (js) => js.replace(/<\/script/gi, '<\\/script');

async function font(weight) {
  const buf = await fs.readFile(r(`node_modules/@fontsource/inter-tight/files/inter-tight-latin-${weight}-normal.woff2`));
  return `data:font/woff2;base64,${buf.toString('base64')}`;
}

async function build() {
  const t0 = Date.now();
  const js = await esbuild.build({
    entryPoints: [r('src/main.js')], bundle: true, minify: true, write: false, format: 'iife', target: 'es2020', legalComments: 'none',
  });
  let css = await fs.readFile(r('src/styles.css'), 'utf8');
  for (const w of [400, 500, 600]) css = css.replace(`__FONT_${w}__`, await font(w));
  const body = await fs.readFile(r('src/body.html'), 'utf8');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#000000">
<meta name="description" content="${DESCRIPTION}">
<title>${TITLE}</title>
<style>${css}</style>
</head>
<body>
${body}
<script>${safeScript(js.outputFiles[0].text)}</script>
</body>
</html>
`;
  await fs.mkdir(r('dist'), { recursive: true });
  await fs.writeFile(r('dist/index.html'), html);
  console.log(`built in ${Date.now() - t0} ms · dist/index.html ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB`);
}

await build();

if (watch) {
  const { watch: fsWatch } = await import('node:fs');
  const http = await import('node:http');
  let pending = null;
  fsWatch(r('src'), { recursive: true }, () => {
    clearTimeout(pending);
    pending = setTimeout(() => build().catch((e) => console.error(e.message)), 80);
  });
  http.createServer(async (req, res) => {
    try { res.writeHead(200, { 'content-type': 'text/html' }); res.end(await fs.readFile(r('dist/index.html'))); }
    catch (e) { res.writeHead(500); res.end(String(e)); }
  }).listen(8001, () => console.log('serving http://localhost:8001'));
}
