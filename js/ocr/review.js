// OCR / pasted-text review tables (parsers live in lib/foundation/import/textParsers.js).
// Moved from app.js — function/const declarations only; event wiring stays in app.js.
import { parseComboImport, parseEquipmentWeightText, parseFoundationDimText, parseLoadTypeText } from '../../lib/foundation/index.js?v=20261015f';
import { escapeHtml, getRadioVal } from '../core/dom.js?v=20261015f';
import { calcFoundSize } from '../tabs/foundSize.js?v=20261015f';
import { fmt } from '../core/format.js?v=20261015f';
import { comboState, state } from '../core/state.js?v=20261015f';
import { renderComboTable } from '../tabs/combos.js?v=20261015f';
import { renderEquipmentLoad, renderLoadTypesTable } from '../tabs/loading.js?v=20261015f';
import { recalcAll } from '../workflow/recalc.js?v=20261015f';

// parseLoadTypeText() lives in lib/foundation/import/textParsers.js.
export function renderLtOcrReview(text) {
  const parsed = parseLoadTypeText(text);
  const reviewEl = document.getElementById('lt-ocr-review');
  const rawBlock = `<details style="margin-top:8px;"><summary class="note" style="cursor:pointer;">Raw extracted text</summary><pre class="ocr-raw">${escapeHtml(text || '(empty)')}</pre></details>`;
  if (parsed.length === 0) {
    reviewEl.innerHTML = `<div class="warn-box"><strong>⚠  No load type rows detected.</strong> Try a clearer image, or check the raw text below and add rows manually.</div>${rawBlock}`;
    return;
  }
  reviewEl.innerHTML = `
    <div class="warn-box"><strong>⚠  Verify before use:</strong> OCR/table parsing can misread characters or merge rows — compare every row below against the source before adding. A code that already exists in "Load Types" is skipped automatically.</div>
    <div class="overflow-x"><table class="calc-table">
      <tr><th>Detected label</th><th>Code</th><th></th></tr>
      ${parsed.map((r, i) => `<tr>
        <td>${escapeHtml(r.label)}</td><td class="num">${escapeHtml(r.code)}</td>
        <td><button type="button" class="combo-add-btn lt-ocr-add-row" data-i="${i}">+ Add</button></td>
      </tr>`).join('')}
    </table></div>
    <button type="button" id="lt-ocr-add-all" class="combo-add-btn">+ Add all rows</button>
    ${rawBlock}
  `;
  const addOne = (r) => {
    if (state.lcLoadTypes.some(lt => lt.code === r.code)) return false;
    state.lcLoadTypes.push({ code: r.code, label: r.label });
    return true;
  };
  reviewEl.querySelectorAll('.lt-ocr-add-row').forEach(btn => {
    btn.addEventListener('click', () => {
      const r = parsed[+btn.dataset.i];
      const added = addOne(r);
      renderLoadTypesTable();
      renderComboTable('lc');
      recalcAll();
      if (!added) alert(`Code "${r.code}" already exists — skipped.`);
    });
  });
  document.getElementById('lt-ocr-add-all').addEventListener('click', () => {
    let added = 0; const skipped = [];
    parsed.forEach(r => { if (addOne(r)) added++; else skipped.push(r.code); });
    renderLoadTypesTable();
    renderComboTable('lc');
    recalcAll();
    document.getElementById('lt-ocr-status').textContent = `Added ${added} load type(s).` + (skipped.length ? ` Skipped (already exist): ${skipped.join(', ')}.` : '');
  });
}
// parseEquipmentWeightText() (lib/foundation/import/textParsers.js) extracts the raw number + unit per
// condition; the unit -> kN conversion (ton, kg, lb; unmarked = ton) stays here in the UI (AGENTS.md §4).
export const EQ_IMPORT_FIELDS = {
  empty: { key: 'eq-load-ee', label: 'Empty load, E<sub>E</sub>' },
  operating: { key: 'eq-load-eo', label: 'Operating load, E<sub>O</sub>' },
  test: { key: 'eq-load-et', label: 'Test load, E<sub>T</sub>' }
};
export function parseEquipmentLoadText(text) {
  return parseEquipmentWeightText(text).map(({ cond, found, line, value, unit }) => {
    const f = EQ_IMPORT_FIELDS[cond];
    if (!found) return line === undefined ? { ...f, found } : { ...f, found, line };
    let val = value;
    if (unit === 'kg') val = val / 1000 * 9.80665;
    else if (unit === 'ton' || unit === 'tonne') val = val * 9.80665;
    else if (unit === 'lb' || unit === 'lbs') val = val * 0.000453592 * 9.80665;
    // 'kn' is already kN — no conversion
    return { ...f, found, line, val, unit };
  });
}
export function renderEqOcrReview(text) {
  const results = parseEquipmentLoadText(text);
  const reviewEl = document.getElementById('eq-ocr-review');
  const rawBlock = `<details style="margin-top:8px;"><summary class="note" style="cursor:pointer;">Raw extracted text</summary><pre class="ocr-raw">${escapeHtml(text || '(empty)')}</pre></details>`;
  if (!results.some(r => r.found)) {
    reviewEl.innerHTML = `<div class="warn-box"><strong>⚠  No Empty/Operating/Test values detected.</strong> Enter the values manually in the fields above, or check the raw text below.</div>${rawBlock}`;
    return;
  }
  reviewEl.innerHTML = `
    <div class="warn-box"><strong>⚠  Verify before use:</strong> OCR/text parsing can misread digits or units — compare every detected row against the source before applying. Detected values are converted to kN (ton×9.80665, kg×0.00980665, lb×0.004448); numbers with no unit are assumed to be in ton.</div>
    <div class="overflow-x"><table class="calc-table">
      <tr><th>Field</th><th>Detected line</th><th>Value (kN)</th><th></th></tr>
      ${results.map((r, i) => `<tr>
        <td>${r.label}</td>
        <td>${r.found ? escapeHtml(r.line) : '<span class="clause">not found</span>'}</td>
        <td class="num">${r.found ? fmt(r.val,2) : '—'}</td>
        <td>${r.found ? `<button type="button" class="combo-add-btn eq-ocr-apply" data-i="${i}">Apply</button>` : ''}</td>
      </tr>`).join('')}
    </table></div>
    <button type="button" id="eq-ocr-apply-all" class="combo-add-btn">Apply all detected</button>
    ${rawBlock}
  `;
  reviewEl.querySelectorAll('.eq-ocr-apply').forEach(btn => {
    btn.addEventListener('click', () => {
      const r = results[+btn.dataset.i];
      document.getElementById(r.key).value = r.val.toFixed(2);
      renderEquipmentLoad();
    });
  });
  document.getElementById('eq-ocr-apply-all').addEventListener('click', () => {
    results.filter(r => r.found).forEach(r => { document.getElementById(r.key).value = r.val.toFixed(2); });
    renderEquipmentLoad();
  });
}
// parseFoundationDimText() (lib/foundation/import/textParsers.js) returns raw value + unit per key; the conversion
// to the field unit happens here. A number with no unit is read in the field unit, except a length >= 50 in an
// m-field, which is read as mm (a 50 m footing is not plausible) — the Unit column always says which was used.
export const FS_IMPORT_FIELDS = {
  Bf: { id: 'fs-Bf', label: 'Width, B<sub>f</sub>', unit: 'm' },
  Lf: { id: 'fs-Lf', label: 'Length, L<sub>f</sub>', unit: 'm' },
  Hf: { id: 'fs-Hf', label: 'Height, H<sub>f</sub>', unit: 'm' },
  Df: { id: 'fs-Df', label: 'Depth, D<sub>f</sub>', unit: 'm' },
  Bp: { id: 'fs-Bp', label: 'Pedestal width, B<sub>p</sub>', unit: 'm' },
  Lp: { id: 'fs-Lp', label: 'Pedestal length, L<sub>p</sub>', unit: 'm' },
  Gp: { id: 'fs-Gp', label: 'Pedestal height above ground, G<sub>p</sub>', unit: 'm' },
  OffX: { id: 'fs-OffX', label: 'Offset X, Off<sub>X</sub>', unit: 'm' },
  OffZ: { id: 'fs-OffZ', label: 'Offset Z, Off<sub>Z</sub>', unit: 'm' },
  tGrout: { id: 'fs-grout-t', label: 'Grout thickness, t<sub>grout</sub>', unit: 'mm' },
  hEmbed: { id: 'fs-hpile', label: 'Embedded pile in pile cap, h', unit: 'm' }
};
const FS_TO_M = { mm: 0.001, cm: 0.01, m: 1 };
function fsToFieldUnit(value, unit, fieldUnit) {
  if (fieldUnit === 'mm') {
    if (!unit) return { val: value, how: 'no unit → mm' };
    return { val: value * FS_TO_M[unit] * 1000, how: unit };
  }
  if (!unit) return Math.abs(value) >= 50 ? { val: value / 1000, how: 'no unit, ≥ 50 → mm' } : { val: value, how: 'no unit → m' };
  return { val: value * FS_TO_M[unit], how: unit };
}
const FS_SUPPORT_LABEL = { pile: 'Pile', shallow: 'Shallow' };
const FS_TYPE_LABEL = { pedestal: 'Yes', block: 'No' };
export function renderFsAutoFillReview(text, source = 'text') {
  const reviewEl = document.getElementById('fs-ai-review');
  const res = parseFoundationDimText(text);
  const rows = res.fields.filter(f => FS_IMPORT_FIELDS[f.key]).map(f => {
    const d = FS_IMPORT_FIELDS[f.key], c = fsToFieldUnit(f.value, f.unit, d.unit);
    return { ...d, key: f.key, src: f.src, val: +c.val.toFixed(4), how: c.how, cur: document.getElementById(d.id)?.value ?? '' };
  });
  const curSupport = getRadioVal('fs-support'), curType = getRadioVal('fs-type');
  const rawBlock = source === 'ocr' ? `<details style="margin-top:8px;"><summary class="note" style="cursor:pointer;">Raw OCR text</summary><pre class="ocr-raw">${escapeHtml(text || '(empty)')}</pre></details>` : '';
  if (!rows.length && !res.support && !res.type) {
    reviewEl.innerHTML = `<div class="warn-box"><strong>⚠  Nothing recognised.</strong> Use labels such as <code>Bf 2.4</code>, <code>Df 1.5 m</code>, <code>Gp 275 mm</code>, or a size group such as <code>footing 2.4 x 2.4 x 0.8</code> / <code>pedestal 1.25 x 1.25</code>.</div>${rawBlock}`;
    return;
  }
  // Three narrow columns (the input panel is narrow): field + the text it came from, new value, current value.
  const srcLine = s => `<div class="clause" style="font-size:11px;margin-top:2px;">${s}</div>`;
  const kwRow = (lbl, v, cur, map) => v ? `<tr><td>${lbl}${srcLine('keyword')}</td><td class="num">${map[v]}</td><td class="num">${map[cur] || '—'}</td></tr>` : '';
  reviewEl.innerHTML = `
    <div class="warn-box"><strong>⚠  Verify before use:</strong> compare every value with the source${source === 'ocr' ? ' — OCR can misread digits (e.g. 0.8 as 0.6)' : ''}. Filled fields are highlighted until you edit them.
      ${res.conflicts.length ? `<br><strong>Different values found for the same field</strong> (the first one is used): ${res.conflicts.map(c => `${escapeHtml(c.src)}`).join('; ')}.` : ''}
      ${res.ignored.length ? `<br><strong>Not used:</strong> ${res.ignored.map(escapeHtml).join('; ')}.` : ''}</div>
    <div class="overflow-x"><table class="calc-table fs-ai-table">
      <tr><th style="width:54%;">Field</th><th style="width:23%;">New</th><th style="width:23%;">Now</th></tr>
      ${kwRow('Support', res.support, curSupport, FS_SUPPORT_LABEL)}
      ${kwRow('Pedestal', res.type, curType, FS_TYPE_LABEL)}
      ${rows.map(r => `<tr><td>${r.label} [${r.unit}]${srcLine(`${escapeHtml(r.src)} · ${r.how}`)}</td><td class="num">${r.val}</td><td class="num">${escapeHtml(r.cur)}</td></tr>`).join('')}
    </table></div>
    <button type="button" id="fs-ai-apply-all" class="combo-add-btn">Apply to form</button>
    ${rawBlock}`;
  document.getElementById('fs-ai-apply-all').addEventListener('click', () => {
    // Radios first (their handlers show / hide the pedestal and pile groups), then the values, then one recalculation.
    if (res.support && res.support !== curSupport) document.querySelector(`#fs-support button[data-val="${res.support}"]`)?.click();
    if (res.type && res.type !== curType) document.querySelector(`#fs-type button[data-val="${res.type}"]`)?.click();
    rows.forEach(r => {
      const el = document.getElementById(r.id);
      if (!el) return;
      el.value = String(r.val);
      el.classList.add('ai-filled');
      if (r.key === 'tGrout') document.getElementById('fs-grout').checked = r.val > 0;
    });
    calcFoundSize();
    reviewEl.innerHTML = `<div class="note">✓ ${rows.length} value(s)${res.support || res.type ? ' and the foundation type' : ''} applied — highlighted fields stay marked until you edit them.</div>`;
  });
}
// parseComboImport(text, codes) and parseFactorCell() live in lib/foundation/import/textParsers.js.
// Shared review + apply UI for both sources. mode 'replace' swaps the whole comboState.lc; 'append' adds rows.
export function renderComboImportReview(reviewEl, text, source) {
  const res = parseComboImport(text, state.lcLoadTypes.map(lt => lt.code));
  const rawBlock = `<details style="margin-top:8px;"><summary class="note" style="cursor:pointer;">Raw ${source === 'ocr' ? 'OCR' : 'pasted'} text</summary><pre class="ocr-raw">${escapeHtml(text || '(empty)')}</pre></details>`;
  if (!res.ok || !res.rows.length) {
    const why = !res.ok
      ? `No header row with load type codes found. Include the header row (e.g. <code>No. | Combination | D | L | E(E) | WX …</code>) — codes must match "Edit Load Types": ${state.lcLoadTypes.map(lt => escapeHtml(lt.code)).join(', ')}.`
      : 'Header found, but no rows with factors below it.';
    reviewEl.innerHTML = `<div class="warn-box"><strong>⚠  Nothing to import.</strong> ${why}</div>${rawBlock}`;
    return;
  }
  const badCount = res.rows.filter(r => r.bad).length;
  reviewEl.innerHTML = `
    <div class="warn-box"><strong>⚠  Verify before use:</strong> ${res.rows.length} combination(s) read${source === 'ocr' ? ' by OCR — digits can be misread (e.g. 0.6 as 0.8)' : ''}. Check every factor below against the source before applying.
      ${res.unknown.length ? `<br><strong>Ignored columns</strong> (not in Load Types): ${res.unknown.map(escapeHtml).join(', ')} — add them in "Edit Load Types" first if they should count.` : ''}
      ${badCount ? `<br><strong>${badCount} row(s) highlighted</strong> have a non-numeric cell${source === 'ocr' ? ' or fewer numbers than code columns' : ''} — fix them in the table after applying.` : ''}</div>
    <div class="overflow-x"><table class="calc-table">
      <tr><th>No.</th><th>Combination</th>${res.codes.map(c => `<th>${escapeHtml(c)}</th>`).join('')}</tr>
      ${res.rows.map(r => `<tr${r.bad ? ' style="background:var(--caution-soft, #FEF3C7);"' : ''}><td>${escapeHtml(r.lc)}</td><td>${escapeHtml(r.name)}</td>${res.codes.map(c => `<td class="num">${r.f[c] ? +r.f[c].toFixed(4) : ''}</td>`).join('')}</tr>`).join('')}
    </table></div>
    <button type="button" class="combo-add-btn lc-import-apply" data-mode="replace">Replace all combinations (${res.rows.length})</button>
    <button type="button" class="combo-add-btn lc-import-apply" data-mode="append" style="background:transparent;">+ Append to existing</button>
    ${rawBlock}`;
  reviewEl.querySelectorAll('.lc-import-apply').forEach(btn => btn.addEventListener('click', () => {
    const imported = res.rows.map(r => ({ lc: r.lc, name: r.name, f: { ...r.f } }));
    comboState.lc = btn.dataset.mode === 'replace' ? imported : comboState.lc.concat(imported);
    renderComboTable('lc');
    recalcAll();
    reviewEl.innerHTML = `<div class="note">✓ ${imported.length} combination(s) ${btn.dataset.mode === 'replace' ? 'loaded (previous set replaced)' : 'appended'} — edit them in the table above if needed.</div>`;
  }));
}
export function renderOcrReview(rawText) {
  renderComboImportReview(document.getElementById('lc-ocr-review'), rawText, 'ocr');
}
