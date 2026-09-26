import { fmt } from './format.js?v=20260926r';

// HTML snippets for calc worksheets: combo labels, worksheet rows, PASS/FAIL verdict + efficiency badge.
// Combines a combo's separate LC-number and formula/description fields back into one label (e.g.
// "LC101 — D + E(E)") for narrative text and per-row governing-combo captions that show a single string —
// combo tables that show the LC number as its own column read combo.lc and combo.name directly instead.
export function comboLabel(combo) {
  return combo.lc ? `${combo.lc} — ${combo.name}` : combo.name;
}
// ----- Report chapter structure (same pattern as 01 / 02 / 04): chapter title, numbered sub-sections with a short
// introduction, table captions numbered "Table <sub-section>.<n>.". No verdict box — the status lives in the Live Design panel.
export function chapterHeader(title, intro) {
  return `<div class="report-header"><h2>${title}</h2></div>` + (intro ? introPara(intro) : '');
}
export function introPara(text) {
  return `<p style="margin:0 0 10px; font-size:13px; color:var(--ink-soft); line-height:1.5;">${text}</p>`;
}
// code: e.g. '5B.2' — printed at the start of the section label and used by numberTables().
export function sectionHeader(code, title, intro, first = false) {
  return `<div class="section-label"${first ? '' : ' style="margin-top:20px;"'}>${code} ${title}</div>` + (intro ? introPara(intro) : '');
}
// Numbers every <caption> as "Table <code>.<n>." after the last sectionHeader() whose code starts with `prefix.` (e.g. '5B').
// Captions before the first section use the prefix alone ("Table 5B.<n>.").
export function numberTables(html, prefix) {
  const esc = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(<div class="section-label"[^>]*>(${esc}\\.\\d+) )|<caption>`, 'g');
  let cur = prefix, n = 0;
  return html.replace(re, (m, lbl, code) => {
    if (lbl) { cur = code; n = 0; return m; }
    n += 1;
    return `<caption>Table ${cur}.${n}. `;
  });
}
// Renders one "formula = substituted numbers = result" item (3 stacked lines) for a narrative-style
// calculation worksheet (e.g. Dead Load), matching the layout of a typical printed calc sheet.
export function dlWorksheetItem(desc, sym, exprSym, exprSub, val, unit, dec, plus) {
  return `<tr>
      <td class="dl-desc" rowspan="3">${desc}</td>
      <td class="dl-sym" rowspan="3">${sym}</td>
      <td class="dl-eq">=</td>
      <td class="dl-expr" colspan="3">${exprSym}</td>
    </tr>
    <tr>
      <td class="dl-eq">=</td>
      <td class="dl-expr" colspan="3">${exprSub}</td>
    </tr>
    <tr>
      <td class="dl-eq">=</td>
      <td class="dl-expr"></td>
      <td class="dl-val">${fmt(val, dec)}</td>
      <td class="dl-unit">${unit}${plus ? '&nbsp;&nbsp;+' : ''}</td>
    </tr>`;
}
export function dlWorksheetTotal(desc, sym, val, unit, dec) {
  return `<tr class="dl-total">
    <td class="dl-desc">${desc}</td>
    <td class="dl-sym">${sym}</td>
    <td class="dl-eq">=</td>
    <td class="dl-expr"></td>
    <td class="dl-val">${fmt(val, dec)}</td>
    <td class="dl-unit">${unit}</td>
  </tr>`;
}
export function verdictHTML(uc, pass, title, ucLabel = 'UNITY CHECK (V_u / π V_c)') {
  return `<div class="verdict ${pass ? '' : 'fail'}">
    <div class="stamp">${pass ? 'PASS' : 'FAIL'} — ${title}</div>
    <div class="uc"><div class="val">${fmt(uc,3)}</div><div class="lbl">${ucLabel}</div></div>
  </div>`;
}
export function efficiencyBadge(uc, pass) {
  if (!pass || !isFinite(uc)) return '';
  let cls, label, note;
  if (uc >= 0.85) {
    cls = 'eff-high';
    label = 'EFFICIENT';
    note = 'Utilization 85–100% of this check\'s capacity — economical for shear. Confirm flexure/deflection checks are also satisfied.';
  } else if (uc >= 0.5) {
    cls = 'eff-mid';
    label = 'ADEQUATE MARGIN';
    note = 'Utilization 50–85%. Shear is unlikely to be the governing check here — this alone does not mean the section is oversized; verify against flexure/deflection before resizing.';
  } else {
    cls = 'eff-low';
    label = 'LOW UTILIZATION';
    note = 'Utilization below 50% for this check. If shear is the intended governing limit state, bw/d could potentially be reduced; otherwise another check (flexure, deflection, minimum practical dimension, or material grades fixed by project spec) is controlling the size — this tool does not evaluate those.';
  }
  return `<div class="eff-note ${cls}"><strong>${label} (shear check only)</strong> — ${note}</div>`;
}
