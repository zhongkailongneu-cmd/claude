// Builds one self-contained file: aureole/index.html (fonts + css + js inlined).
//   node aureole/build.mjs                 → aureole/index.html (+ docs/aureole/index.html for GitHub Pages)
//   node aureole/build.mjs --fragment out  → head-less fragment for hosts that wrap the page themselves
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = f => readFileSync(join(here, 'src', f), 'utf8');
const b64 = f => readFileSync(join(here, 'src', 'fonts', f)).toString('base64');

const fontCss = `
@font-face{font-family:'Montserrat';font-style:normal;font-weight:100 900;font-display:swap;src:url(data:font/woff2;base64,${b64('montserrat-latin-wght-normal.woff2')}) format('woff2')}
@font-face{font-family:'Open Sans';font-style:normal;font-weight:600;font-display:swap;src:url(data:font/woff2;base64,${b64('open-sans-latin-600-normal.woff2')}) format('woff2')}
`;
const css = fontCss + src('style.css');
const js = readdirSync(join(here, 'src', 'js')).filter(f => f.endsWith('.js')).sort().map(f => src('js/' + f)).join('\n');
const body = src('body.html');
const script = `<script>\n(() => {\n'use strict';\n${js}\n})();\n</script>`;
const title = 'AUREOLE';

const fi = process.argv.indexOf('--fragment');
if (fi > 0) {
  writeFileSync(process.argv[fi + 1], `<title>${title}</title>\n<style>\n${css}\n</style>\n${body}\n${script}\n`);
  console.log('fragment →', process.argv[fi + 1]);
} else {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#000000">
<title>${title}</title>
<style>
${css}
</style>
</head>
<body>
${body}
${script}
</body>
</html>
`;
  writeFileSync(join(here, 'index.html'), html);
  const docs = join(here, '..', 'docs', 'aureole');
  mkdirSync(docs, { recursive: true });
  writeFileSync(join(docs, 'index.html'), html);
  console.log('built aureole/index.html', (html.length / 1024).toFixed(0) + ' KB');
}
