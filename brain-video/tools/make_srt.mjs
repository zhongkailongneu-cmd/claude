// Bilingual subtitle files generated from the storyboard (same cues, same timing as the burned-in captions).
//   node tools/make_srt.mjs <outDir>
import { SCENES, BEAT } from '../src/scenes.js';
import fs from 'node:fs';
import path from 'node:path';

const fmt = (t) => {
  const ms = Math.round(t * 1000);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};
const cues = [];
for (const s of SCENES) for (const c of s.cues || []) {
  cues.push({ a: s.t0 + c.b0 * BEAT, b: Math.min(s.t1, s.t0 + c.b1 * BEAT) - 0.05, cn: c.cn, en: c.en });
}
cues.sort((x, y) => x.a - y.a);
const out = path.resolve(process.argv[2] || '.');
fs.mkdirSync(out, { recursive: true });
const write = (name, pick) => fs.writeFileSync(path.join(out, name), cues.map((c, i) => `${i + 1}\n${fmt(c.a)} --> ${fmt(c.b)}\n${pick(c)}\n`).join('\n'));
write('brain_tour.zh-en.srt', (c) => `${c.cn}\n${c.en}`);
write('brain_tour.zh.srt', (c) => c.cn);
write('brain_tour.en.srt', (c) => c.en);
console.log(`${cues.length} cues -> ${out}`);
