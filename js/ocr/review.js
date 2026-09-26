// OCR / pasted-text review tables (parsers live in lib/foundation/import/textParsers.js).
// Moved from app.js — function/const declarations only; event wiring stays in app.js.
import { parseComboImport, parseEquipmentWeightText, parseLoadTypeText } from '../../lib/foundation/index.js?v=20260926h';
import { escapeHtml } from '../core/dom.js?v=20260926h';
import { fmt } from '../core/format.js?v=20260926h';
import { comboState, state } from '../core/state.js?v=20260926h';
import { renderComboTable } from '../tabs/combos.js?v=20260926h';
import { renderEquipmentLoad, renderLoadTypesTable } from '../tabs/loading.js?v=20260926h';
import { recalcAll } from '../workflow/recalc.js?v=20260926h';

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
