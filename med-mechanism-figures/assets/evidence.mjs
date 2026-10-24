// Every number a figure shows is registered here with where it came from; the build stops if one isn't.
// See references/evidence.md for the rules this enforces.

export const LEVELS = {
  A: "指南、系统综述或 RCT",
  B: "单项临床研究或人体测量",
  C: "动物或体外研究",
  D: "教科书、综述或共识",
  S: "示意值",
};

const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹";
const sup = (n) => String(n).split("").map((d) => SUP[Number(d)]).join("");
const escape = (text) => String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const pending = (s) => s.pending || /待核/.test(s.cite);

// Sources: [{ id, cite, level, supports?, url?, pending? }]. Numbered in list order: ¹ is the first.
export function defineSources(list) {
  const seen = new Set();
  return list.map((source, index) => {
    if (seen.has(source.id)) throw new Error(`duplicate source id: ${source.id}`);
    seen.add(source.id);
    return { ...source, n: index + 1, used: false };
  });
}

// Params: [{ id, label, value, unit, level, source?, note? }]. Use unit "—" for a dimensionless number.
export const defineParams = (list) => list;

// The superscript for a source, to put after a number in a readout or caption. Marks the source as used.
export function mark(id, sources) {
  const source = sources.find((s) => s.id === id);
  if (!source) throw new Error(`mark(): unknown source id "${id}"`);
  source.used = true;
  return sup(source.n);
}

export const value = (params, id) => {
  const param = params.find((p) => p.id === id);
  if (!param) throw new Error(`value(): unknown param id "${id}"`);
  return param.value;
};

// Numbers in running text that carry neither a source mark nor "示意". Heuristic: skips years, figure and
// step numbers, and digits that are part of a name (CDK4/6, GLUT1, Ca²⁺).
export function unsourcedNumbers(text) {
  const plain = String(text).replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ");
  const found = [];
  for (const match of plain.matchAll(/\d+(?:\.\d+)?/g)) {
    const at = match.index, end = at + match[0].length;
    const before = plain.slice(Math.max(0, at - 4), at), after = plain.slice(end, end + 14);
    if (/[A-Za-z/\-_]$/.test(before) || /^[A-Za-z_]/.test(after)) continue;
    if (/^\s*(年|月|日|世纪|步|个场景)/.test(after) || /(Fig|第|按键|场景|z)\s*$/.test(before)) continue;
    if (/^(19|20)\d{2}$/.test(match[0])) continue;
    const tail = after.split(/[·，。；、\n]/)[0];          // the number's own unit and marks, up to the next separator
    if (/[⁰¹²³⁴⁵⁶⁷⁸⁹]|示意|\[\d+\]/.test(tail)) continue;
    found.push(plain.slice(Math.max(0, at - 10), end + 8).trim());
  }
  return found;
}

export function auditSources(params, sources, { texts = [] } = {}) {
  const errors = [], warnings = [];
  const ids = new Set(sources.map((s) => s.id));
  for (const p of params) {
    const name = p.id || p.label || JSON.stringify(p);
    for (const key of ["id", "label", "unit", "level"]) if (p[key] === undefined || p[key] === "") errors.push(`参数 ${name} 缺少 ${key}`);
    if (p.value === undefined) errors.push(`参数 ${name} 缺少 value`);
    if (p.level && !LEVELS[p.level]) errors.push(`参数 ${name} 的证据级别 ${p.level} 不在 A/B/C/D/S 中`);
    if (p.level && p.level !== "S" && !p.source) errors.push(`参数 ${name} 不是示意值（${p.level}），但没有出处`);
    if (p.source && !ids.has(p.source)) errors.push(`参数 ${name} 的出处 ${p.source} 不存在`);
  }
  for (const s of sources) {
    if (!s.cite) errors.push(`出处 ${s.id} 缺少 cite`);
    if (!LEVELS[s.level]) errors.push(`出处 ${s.id} 的证据级别 ${s.level} 不在 A/B/C/D/S 中`);
    if (!s.used && !params.some((p) => p.source === s.id)) warnings.push(`出处 ${s.id} 没有被任何参数或读数用到`);
    if (pending(s)) warnings.push(`出处 ${s.id} 标为【待核】，交付时提醒用户核对`);
  }
  texts.forEach((text, index) => unsourcedNumbers(text).forEach((snippet) => warnings.push(`文本 ${index + 1} 里的数字没有出处号或「示意」：…${snippet}…`)));
  return { errors, warnings };
}

export function auditOrExit(params, sources, options) {
  const { errors, warnings } = auditSources(params, sources, options);
  warnings.forEach((w) => console.log("  提醒  " + w));
  errors.forEach((e) => console.log("  错误  " + e));
  if (errors.length) {
    console.log(`出处检查未通过：${errors.length} 个错误`);
    process.exit(1);
  }
  const shown = params.filter((p) => p.level === "S").length;
  console.log(`出处检查通过 · ${params.length} 个参数 · ${sources.length} 条出处 · ${shown} 个示意值 · ${warnings.length} 条提醒`);
}

// The 「证据与出处」 section: numbered sources in mark order, then the illustrative values.
export function sourcesHtml(params, sources, { title = "证据与出处" } = {}) {
  const items = sources.map((s) => {
    const uses = params.filter((p) => p.source === s.id).map((p) => p.label);
    const parts = [escape(s.cite), `<span class="mm-level">${s.level} · ${LEVELS[s.level]}</span>`];
    if (s.supports || uses.length) parts.push(`支持：${escape([s.supports, ...uses].filter(Boolean).join("；"))}`);
    if (pending(s)) parts.push('<span class="mm-pending">待核</span>');
    const cite = s.url ? `<a href="${escape(s.url)}">${parts[0]}</a>` : parts[0];
    return `<li>${[cite, ...parts.slice(1)].join(" · ")}</li>`;
  }).join("");
  const shown = params.filter((p) => p.level === "S");
  const illustrative = shown.length
    ? `<p class="mm-illustrative">示意值（为画面而设，不是实测）：${shown.map((p) => `${escape(p.label)} ${escape(p.value)}${p.unit === "—" ? "" : " " + escape(p.unit)}${p.note ? `（${escape(p.note)}）` : ""}`).join("；")}</p>`
    : "";
  return `<section class="mm-sources"><h2>${escape(title)}</h2><ol>${items}</ol>${illustrative}</section>`;
}

export const EVIDENCE_CSS = `
.mm-sources{margin-top:40px}
.mm-sources h2{color:var(--anatomy-strong);font-size:17px;margin:0 0 12px;font-weight:650}
.mm-sources ol{margin:0;padding-left:22px;display:grid;gap:6px;font-size:13px}
.mm-sources a{color:var(--anatomy-text)}
.mm-level{color:var(--anatomy-muted);font-family:var(--anatomy-mono);font-size:11.5px}
.mm-pending{color:var(--anatomy-strong);border:1px solid var(--anatomy-mid);border-radius:3px;padding:0 4px;font-size:11.5px}
.mm-illustrative{color:var(--anatomy-muted);font-size:13px;margin:12px 0 0}
.mm-disclaimer{color:var(--anatomy-muted);font-size:12.5px;margin:20px 0 0;padding-top:12px;border-top:1px solid var(--anatomy-faint)}
`;
