// ==========================================================================
// REPORT DOCUMENT — one standalone, print-ready (A4) HTML report for the CLI (.fnd runs) and the app (Summary tab).
// Pure functions, no DOM, no file access: the callers supply the CSS text (css/report.css), the body HTML and the document data.
//   buildReportDocument({ title, meta, bodyHtml, css }) -> complete HTML string (header table, body, A4 print rules).
//   markdownToHtml(md)  -> the small Markdown subset the CLI reports use (#..### headings, paragraphs, pipe tables, "- " lists,
//                          **bold**, *italic*, `code`; X_sub is shown as a subscript); everything else is escaped text.
// ==========================================================================
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtmlText = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

// Inline formatting of one line of already-plain text: escape first, then **bold**, *italic*, `code`, subscripts (single-letter base).
export function inlineMarkdown(text) {
  const parts = String(text).split(/(`[^`]+`)/);   // code spans are left alone
  return parts.map((p, i) => {
    if (i % 2 === 1) return `<code>${escapeHtmlText(p.slice(1, -1))}</code>`;
    let h = escapeHtmlText(p);
    h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    h = h.replace(/(^|[\s(])\*([^*\s][^*]*?)\*(?=[\s).,;:]|$)/g, '$1<em>$2</em>');
    // X_sub: one-letter (or Greek) base, sub of letters / digits / commas (A_s,min, E_g, f_y, P_all,g, M_u); a trailing comma or dot is not part of it
    h = h.replace(/(^|[^A-Za-z0-9_])([A-Za-zφΔΣγλμρτθωε])_([A-Za-z0-9]+(?:,[A-Za-z0-9]+)*)/g, '$1$2<sub>$3</sub>');
    return h;
  }).join('');
}

function tableHtml(rows) {
  const cells = (line) => {
    const t = line.trim().replace(/^\|/, '').replace(/\|$/, '');
    return t.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
  };
  const isSep = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
  const head = cells(rows[0]);
  const body = rows.slice(isSep(rows[1] || '') ? 2 : 1);
  const num = (c) => /^[-+−]?\d[\d,.]*\s*(%|[A-Za-zµ²³·/]*)?$/.test(c) || c === '-' || c === '∞';
  return `<div class="overflow-x"><table class="calc-table">\n<tr>${head.map((c) => `<th>${inlineMarkdown(c)}</th>`).join('')}</tr>\n`
    + body.map((r) => {
      const cs = cells(r);
      const gov = cs.some((c) => c.includes('◄'));
      return `<tr${gov ? ' class="governing"' : ''}>${cs.map((c) => `<td${num(c.replace(/\s*◄/, '')) ? ' class="num"' : ''}>${inlineMarkdown(c)}</td>`).join('')}</tr>`;
    }).join('\n') + '\n</table></div>';
}

export function markdownToHtml(md) {
  const lines = String(md).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let para = [], list = [], tbl = [], first = true;
  const flushPara = () => { if (para.length) { out.push(`<p>${inlineMarkdown(para.join(' '))}</p>`); para = []; } };
  const flushList = () => { if (list.length) { out.push('<ul>' + list.map((x) => `<li>${inlineMarkdown(x)}</li>`).join('') + '</ul>'); list = []; } };
  const flushTbl = () => { if (tbl.length) { out.push(tableHtml(tbl)); tbl = []; } };
  const flush = () => { flushPara(); flushList(); flushTbl(); };
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    let m;
    if (!line.trim()) { flush(); continue; }
    if ((m = line.match(/^(#{1,4})\s+(.*)$/))) {
      flush();
      const lvl = m[1].length;
      if (lvl === 1 && first) out.push(`<div class="report-header"><h2>${inlineMarkdown(m[2])}</h2></div>`);
      else out.push(lvl <= 2 ? `<div class="section-label">${inlineMarkdown(m[2])}</div>` : `<h${lvl} class="sub-title">${inlineMarkdown(m[2])}</h${lvl}>`);
      first = false;
      continue;
    }
    first = false;
    if ((m = line.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/))) { flush(); out.push(`<figure><img src="${escapeHtmlText(decodeURI(m[2]))}" alt="${escapeHtmlText(m[1])}"><figcaption>${escapeHtmlText(m[1])}</figcaption></figure>`); continue; }
    if (/^\s*\|/.test(line)) { flushPara(); flushList(); tbl.push(line); continue; }
    if ((m = line.match(/^\s*[-*]\s+(.*)$/))) { flushPara(); flushTbl(); list.push(m[1]); continue; }
    flushList(); flushTbl();
    para.push(line.trim());
  }
  flush();
  return out.join('\n');
}

// meta: { project, location, by, date, rev, companyDocId, contractorDocId, pages, logo1, logo2 (data URLs) }.
// With a company / contractor document ID the header is the document table of the app's Report Preview (logos, IDs, title,
// revision); otherwise the plain "Project Notes" block. title = the report title shown in the header cell / the browser tab.
export function reportHeaderHtml(title, meta = {}) {
  const e = escapeHtmlText;
  const useDoc = !!(meta.companyDocId || meta.contractorDocId || meta.logo1 || meta.logo2 || meta.pages);
  if (useDoc) {
    return `<table class="doc-header-table">
  <tr>
    <td rowspan="2" class="dh-logo">${meta.logo1 ? `<img src="${e(meta.logo1)}" alt="">` : ''}</td>
    <td>Company Document ID<strong>${e(meta.companyDocId || '—')}</strong></td>
    <td rowspan="2" class="dh-title">${e(meta.project || title)}</td>
    <td>No. of Pages<strong>${e(meta.pages || '—')}</strong></td>
    <td rowspan="2" class="dh-logo">${meta.logo2 ? `<img src="${e(meta.logo2)}" alt="">` : ''}</td>
  </tr>
  <tr>
    <td>Contractor Document ID<strong>${e(meta.contractorDocId || '—')}</strong></td>
    <td>Revision Number<strong>${e(meta.rev || '0')}</strong></td>
  </tr>
</table>`;
  }
  const bits = [meta.location && `Location/Client: ${e(meta.location)}`, meta.by && `Calculated by: ${e(meta.by)}`, meta.date && `Date: ${e(meta.date)}`, `Rev: ${e(meta.rev || '0')}`].filter(Boolean);
  return `<div class="report-header"><h2>${e(meta.project || title)}</h2><div class="report-meta">${bits.map((b) => `<span>${b}</span>`).join('')}</div></div>`;
}

// header = false: the body already starts with its own header (the app's Summary report does); toolbar = a Print / Save as PDF button
// (screen only) at the top.
export function buildReportDocument({ title = 'Foundation calculation report', meta = {}, bodyHtml = '', css = '', footer = '', header = true, toolbar = true }) {
  const e = escapeHtmlText;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${e(meta.project ? `${meta.project} — ${title}` : title)}</title>
<style>
${css}
</style>
</head>
<body>
${toolbar ? '<div class="report-toolbar"><button type="button" onclick="window.print()">Print / Save as PDF</button></div>\n' : ''}<div class="report-doc">
${header ? reportHeaderHtml(title, meta) + '\n' : ''}${bodyHtml}
${footer ? `<div class="report-footer">${footer}</div>` : ''}
</div>
</body>
</html>
`;
}
