// Wraps island-jelly/island-jelly.html (an artifact body fragment) into a full page
// at docs/island-jelly/index.html for GitHub Pages. three.js loads from jsDelivr.
import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const src = await fs.readFile(path.join(root, 'island-jelly/island-jelly.html'), 'utf8');
const page = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#F4F7FB">
<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>
</head>
<body>
${src}
</body>
</html>
`;
const out = path.join(root, 'docs/island-jelly/index.html');
await fs.mkdir(path.dirname(out), { recursive: true });
await fs.writeFile(out, page);
console.log(`wrote ${path.relative(root, out)} (${(Buffer.byteLength(page) / 1024).toFixed(0)} KB)`);
