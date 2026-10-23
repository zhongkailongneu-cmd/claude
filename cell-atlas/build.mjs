// Builds the two copies derived from cell-atlas/index.html (the CDN version, which is the source):
//
//   cell-atlas/cell-atlas-offline.html  three.js r160 embedded; opens by double-click with no network
//   .artifact/cell-atlas.html           page body for the claude.ai preview (no document wrapper, no org name)
//
// Usage: node cell-atlas/build.mjs <path to three@0.160.0 build/three.min.js>
// Get that file with:  npm pack three@0.160.0 && tar xzf three-0.160.0.tgz   →  package/build/three.min.js
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const threePath = process.argv[2];
if (!threePath) {
  console.error('usage: node cell-atlas/build.mjs <three@0.160.0/build/three.min.js>');
  process.exit(1);
}

const page = readFileSync(join(here, 'index.html'), 'utf8');
let three = readFileSync(threePath, 'utf8');
if (!three.includes('const e="160"')) throw new Error(`${threePath} is not the three.js r160 UMD build`);
if (/<\/script|<!--/i.test(three)) throw new Error('three.min.js contains a sequence that would end an inline <script>');
// the UMD build warns that it is deprecated on every load; keep the console clean
three = three.replace(/console\.warn\('Scripts "build\/three\.js"[^']*'\)/, 'void 0');

function replaceOnce(text, from, to) {
  if (text.split(from).length !== 2) throw new Error(`expected exactly one match for: ${from.slice(0, 60)}`);
  return text.replace(from, () => to);
}

const HINT = /<span class="hint">[\s\S]*?<\/span>/;

// ---- offline: three.js as a classic script that defines window.THREE before the scene module runs
let offline = replaceOnce(page, '<script type="module">', `<script>/* three.js r160 · MIT · https://threejs.org */\n${three}\n</script>\n<script type="module">`);
offline = offline.replace(HINT, '<span class="hint">three.js is built into this file; WebGL must be enabled in the browser.</span>');
writeFileSync(join(here, 'cell-atlas-offline.html'), offline);

// ---- claude.ai preview: the host supplies <!doctype>/<head>/<body>, charset and viewport
let art = page;
for (const tag of ['<!doctype html>\n', '<html lang="zh-CN">\n', '<head>\n', '</head>\n', '<body>\n', '</body>\n', '</html>\n',
  '<meta charset="utf-8">\n', '<meta name="viewport" content="width=device-width,initial-scale=1">\n']) art = replaceOnce(art, tag, '');
art = replaceOnce(art, '<title>Anthropic · Cell Atlas</title>', '<title>Cell Atlas</title>\n<meta name="claude:viewport-fit-sides" content="cover">');
art = replaceOnce(art, '<h1>Anthropic <em>·</em> Cell Atlas</h1>', '<h1>Cell Atlas</h1>');
art = art.replace(HINT, '<span class="hint">Check that cdn.jsdelivr.net or unpkg.com is reachable, then reload.</span>');
mkdirSync(join(here, '..', '.artifact'), { recursive: true });
writeFileSync(join(here, '..', '.artifact', 'cell-atlas.html'), art);

console.log(`offline: ${(offline.length / 1024).toFixed(0)} KB · preview: ${(art.length / 1024).toFixed(0)} KB`);
