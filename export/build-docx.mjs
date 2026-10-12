// Converts export/src/conversation.md into a Loyel-blue Word document (Xiaofeng style).
//   node export/build-docx.mjs   ->  export/Particle-Solar-conversation.docx
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire('/opt/node22/lib/node_modules/');
const D = require('docx');
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle, AlignmentType, Header, Footer, PageNumber, TableLayoutType, LevelFormat, HeadingLevel, VerticalAlign } = D;

const here = path.dirname(new URL(import.meta.url).pathname);
const md = fs.readFileSync(path.join(here, 'src/conversation.md'), 'utf8').split('\n');
const C = { L10: 'F4F7FB', L20: 'E8EEF6', L30: 'CCDBEB', L40: '9FBDDA', L50: '6C9AC4', L70: '376392', L80: '2E5076', L90: '2B4868', L100: '263B54' };
const ZH = { ascii: 'Segoe UI', hAnsi: 'Segoe UI', eastAsia: 'Microsoft YaHei' };
const VERSION = 'v1.0', DATE = '2026-10-12';
const TITLE = '粒子太阳系 · 对话记录';

const run = (text, o = {}) => new TextRun({ text, font: ZH, color: C.L100, size: 20, ...o });
// Inline: `code`, URLs stay plain. Marker tags 【重要】 etc. get bold L90.
function inline(text, base = {}) {
  const out = [];
  const re = /(【[^】]+】|\*\*[^*]+\*\*)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(run(text.slice(last, m.index), base));
    const t = m[0];
    out.push(run(t.startsWith('**') ? t.slice(2, -2) : t, { ...base, bold: true, color: C.L90 }));
    last = m.index + t.length;
  }
  if (last < text.length) out.push(run(text.slice(last), base));
  return out;
}
const spacing = { line: 300, before: 0, after: 100 };
const cm = (x) => Math.round(x * 567);
const TOTAL = cm(17.0);

function table(rows) {
  const split = (r) => r.replace(/^\||\|$/g, '').split('|').map((s) => s.trim());
  const head = split(rows[0]);
  const body = rows.slice(2).map(split);
  const n = head.length;
  const widths = n === 2 ? [cm(4.2), TOTAL - cm(4.2)] : n === 3 ? [cm(3.6), cm(6.7), TOTAL - cm(3.6) - cm(6.7)] : Array(n).fill(Math.floor(TOTAL / n));
  const line = (c, sz) => ({ style: BorderStyle.SINGLE, size: sz, color: c });
  const borders = { top: line(C.L70, 8), bottom: line(C.L70, 8), left: line(C.L70, 8), right: line(C.L70, 8), insideHorizontal: line(C.L40, 4), insideVertical: line(C.L40, 4) };
  const cellB = { top: line(C.L40, 4), bottom: line(C.L40, 4), left: line(C.L40, 4), right: line(C.L40, 4) };
  const mk = (txt, i, fill, o = {}) => new TableCell({
    width: { size: widths[i], type: WidthType.DXA },
    shading: { type: ShadingType.CLEAR, fill, color: 'auto' },
    margins: { top: 72, bottom: 72, left: 96, right: 96 },
    verticalAlign: o.head ? VerticalAlign.CENTER : VerticalAlign.TOP,
    borders: cellB,
    children: [new Paragraph({ alignment: o.head ? AlignmentType.CENTER : AlignmentType.LEFT, spacing: { line: 264, before: 0, after: 0 }, children: inline(txt, o.head ? { bold: true, color: 'FFFFFF', size: 19 } : { size: 18, bold: i === 0, color: i === 0 ? C.L90 : C.L100 }) })],
  });
  return new Table({
    width: { size: TOTAL, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    alignment: AlignmentType.CENTER,
    borders,
    rows: [
      new TableRow({ tableHeader: true, cantSplit: true, height: { value: 352, rule: 'atLeast' }, children: head.map((t, i) => mk(t, i, C.L90, { head: true })) }),
      ...body.map((r, k) => new TableRow({ cantSplit: true, children: r.map((t, i) => mk(t, i, k % 2 ? C.L20 : C.L10)) })),
    ],
  });
}

const kids = [];
let i = 0, firstH1 = true, numInst = 0, inNum = false;
const hbar = (c, sz, space = 1) => ({ style: BorderStyle.SINGLE, size: sz, color: c, space });
while (i < md.length) {
  const ln = md[i];
  if (!ln.trim()) { i++; continue; }
  if (!/^\d+\. /.test(ln)) inNum = false;
  if (ln.startsWith('# ')) {
    kids.push(new Paragraph({ heading: HeadingLevel.HEADING_1, keepNext: true, keepLines: true, pageBreakBefore: !firstH1, spacing: { before: 120, after: 160 }, border: { bottom: hbar(C.L40, 6, 4) }, children: [run(ln.slice(2), { bold: true, size: 28, color: C.L90 })] }));
    firstH1 = false;
  } else if (ln.startsWith('## ')) {
    kids.push(new Paragraph({ heading: HeadingLevel.HEADING_2, keepNext: true, keepLines: true, spacing: { before: 220, after: 100 }, children: [run(ln.slice(3), { bold: true, size: 24, color: C.L70 })] }));
  } else if (ln.startsWith('### ')) {
    kids.push(new Paragraph({ heading: HeadingLevel.HEADING_3, keepNext: true, keepLines: true, spacing: { before: 160, after: 80 }, children: [run('▍' + ln.slice(4), { bold: true, size: 21, color: C.L80 })] }));
  } else if (ln.startsWith('|')) {
    const rows = [];
    while (i < md.length && md[i].startsWith('|')) rows.push(md[i++]);
    kids.push(table(rows), new Paragraph({ spacing: { after: 100 }, children: [] }));
    continue;
  } else if (/^- /.test(ln)) {
    kids.push(new Paragraph({ numbering: { reference: 'bul', level: 0 }, spacing, children: inline(ln.slice(2)) }));
  } else if (/^\d+\. /.test(ln)) {
    if (!inNum) numInst++;
    inNum = true;
    kids.push(new Paragraph({ numbering: { reference: 'num', level: 0, instance: numInst }, spacing, children: inline(ln.replace(/^\d+\. /, '')) }));
    i++;
    continue;
  } else if (ln.startsWith('📄 ')) {
    kids.push(new Paragraph({ spacing: { before: 120, after: 100 }, shading: { type: ShadingType.CLEAR, fill: C.L20, color: 'auto' }, border: { left: hbar(C.L90, 24, 6) }, indent: { left: 140 }, children: inline(ln.replace('📄 ', '')) }));
  } else if (ln.startsWith('【重要】') || ln.startsWith('【说明】') || ln.startsWith('【核心思路】')) {
    kids.push(new Paragraph({ spacing: { before: 60, after: 120 }, shading: { type: ShadingType.CLEAR, fill: C.L20, color: 'auto' }, border: { left: hbar(C.L90, 24, 6) }, indent: { left: 140 }, children: inline(ln) }));
  } else {
    // Question text gets a left bar so user prompts stand out from replies.
    const prev = md.slice(0, i).reverse().find((l) => l.startsWith('#'));
    const isUser = prev && prev.startsWith('## 用户提问');
    kids.push(isUser
      ? new Paragraph({ spacing: { before: 40, after: 120 }, shading: { type: ShadingType.CLEAR, fill: C.L10, color: 'auto' }, border: { left: hbar(C.L50, 24, 6) }, indent: { left: 140 }, children: inline(ln) })
      : new Paragraph({ spacing, children: inline(ln) }));
  }
  i++;
}

const doc = new Document({
  title: TITLE,
  creator: 'Claude',
  styles: { default: { document: { run: { font: ZH, size: 20, color: C.L100 } } } },
  numbering: { config: [
    { reference: 'bul', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 460, hanging: 260 } }, run: { color: C.L70 } } }] },
    { reference: 'num', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 460, hanging: 320 } }, run: { color: C.L70, bold: true } } }] },
  ] },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: cm(1.9), bottom: cm(1.8), left: cm(2), right: cm(2), header: 500, footer: 450 } } },
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, border: { bottom: hbar(C.L30, 4, 4) }, children: [run(TITLE + ' · Particle Solar System', { size: 16, color: C.L70 })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
      run(`${VERSION} · ${DATE} · 第 `, { size: 16, color: C.L80 }),
      new TextRun({ children: [PageNumber.CURRENT], font: ZH, size: 16, color: C.L80 }),
      run(' / ', { size: 16, color: C.L80 }),
      new TextRun({ children: [PageNumber.TOTAL_PAGES], font: ZH, size: 16, color: C.L80 }),
      run(' 页', { size: 16, color: C.L80 }),
    ] })] }) },
    children: [
      new Paragraph({ spacing: { before: 0, after: 60 }, children: [run(TITLE, { bold: true, size: 36, color: C.L90 })] }),
      new Paragraph({ spacing: { after: 200 }, border: { bottom: hbar(C.L40, 6, 6) }, children: [run('太阳 + 九大行星粒子网页 · 完整问答与实现记录（Loyel 渐变蓝）', { bold: true, size: 22, color: C.L70 })] }),
      ...kids,
    ],
  }],
});
const out = path.join(here, 'Particle-Solar-conversation.docx');
fs.writeFileSync(out, await Packer.toBuffer(doc));
console.log('wrote', out);
