// Load combinations: editable table, computed summary, standard LC101-126 set.
// Moved from app.js — function/const declarations only; event wiring stays in app.js.
import { buildComboBase, buildLrfdCombos, buildStdCombos, combineLoadCombo, designSpectralAccel, stdComboVector } from '../../lib/foundation/index.js?v=20260926q';
import { escapeHtml, getRadioVal, num } from '../core/dom.js?v=20260926q';
import { fmt } from '../core/format.js?v=20260926q';
import { comboState, state } from '../core/state.js?v=20260926q';
import { EQUIPMENT_CODE_TO_FIELD } from '../tabs/loading.js?v=20260926q';

// Reads the shared unfactored load matrix (top of footing/pedestal) from the "03 — LOADING DATA" tab.
export function getLcLoads() {
  const loads = {};
  state.lcLoadTypes.forEach(lt => {
    loads[lt.code] = { P: num(`lc-${lt.code}-P`), H: num(`lc-${lt.code}-H`), M: num(`lc-${lt.code}-M`) };
  });
  return loads;
}
// Thin DOM-aware wrapper around combineLoadCombo() (lib/foundation/shared/loadCombinations.js): supplies the current
// load type codes and the top-of-footing→bottom-of-footing transfer (ΔW, Δh) from "03 — LOADING DATA".
export function comboTopBottom(combo, loads) {
  const dW = num('lc-dW'), dh = num('lc-dh');
  return combineLoadCombo(combo, loads, state.lcLoadTypes.map(lt => lt.code), dW, dh);
}
// Renders the editable combination table for `prefix` ('lc' = ASD set, 'lrfd' = factored set for pile cap 5B). The two
// tables share the same load-type columns, so redrawing 'lc' (load type added / removed / renamed) also redraws 'lrfd'.
export function renderComboTable(prefix) {
  renderOneComboTable(prefix);
  if (prefix === 'lc' && document.getElementById('lrfd-combo-body')) renderOneComboTable('lrfd');
}
function renderOneComboTable(prefix) {
  const combos = comboState[prefix];
  document.getElementById(prefix + '-combo-header').innerHTML = `<th>No.</th><th>Combination</th>${state.lcLoadTypes.map(lt => `<th>${escapeHtml(lt.code)}</th>`).join('')}<th></th>`;
  document.getElementById(prefix + '-combo-body').innerHTML = combos.map((c, i) => `
    <tr>
      <td><input type="text" class="combo-input combo-input-lc" data-i="${i}" data-f="lc" value="${escapeHtml(c.lc || '')}"></td>
      <td><input type="text" class="combo-input" data-i="${i}" data-f="name" value="${escapeHtml(c.name)}"></td>
      ${state.lcLoadTypes.map(lt => `<td><input type="number" step="0.05" class="combo-input" data-i="${i}" data-f="${lt.code}" value="${c.f[lt.code] || 0}"></td>`).join('')}
      <td><button type="button" class="combo-remove" data-i="${i}" title="Remove">•</button></td>
    </tr>`).join('');
}
export function wireComboTable(prefix, recalcFn) {
  const table = document.getElementById(prefix + '-combo-table');
  table.addEventListener('input', (e) => {
    if (!e.target.classList.contains('combo-input')) return;
    const i = +e.target.dataset.i, f = e.target.dataset.f;
    if (f === 'name') comboState[prefix][i].name = e.target.value;
    else if (f === 'lc') comboState[prefix][i].lc = e.target.value;
    else comboState[prefix][i].f[f] = parseFloat(e.target.value) || 0;
    recalcFn();
  });
  table.addEventListener('click', (e) => {
    if (!e.target.classList.contains('combo-remove')) return;
    comboState[prefix].splice(+e.target.dataset.i, 1);
    renderComboTable(prefix);
    recalcFn();
  });
  document.getElementById(prefix + '-add-combo').addEventListener('click', () => {
    const f = {};
    state.lcLoadTypes.forEach(lt => { f[lt.code] = 0; });
    comboState[prefix].push({ lc: '', name: 'New combo', f });
    renderComboTable(prefix);
    recalcFn();
  });
  renderComboTable(prefix);
}
// Computed top-of-footing (anchor bolt) and bottom-of-footing (stability) loads for each combination currently
// in the editable Load Combinations table — shown right under the "A.3.2" factor table, split into two tables
// (not one combined P/H/M table) since wind and seismic are direction-resolved (Fx/Mz transversal, Fz/Mx
// longitudinal) rather than a single generic H/M magnitude. Uses the same biaxial vector math as the factor
// table (buildStdComboBase() / stdComboVector()), but driven by comboState.lc so it reflects any hand-edited/
// added/removed combo, not just the fixed LC101-126 set the table starts out as.
export function renderLcSummary() {
  const topEl = document.getElementById('lc-summary-top'), botEl = document.getElementById('lc-summary-bottom');
  if (!topEl || !botEl) return;
  // One result table: the combinations of `set` ('lc' ASD / 'lrfd'), factored onto the per-code vectors of `base`.
  // withTransfer = add the top -> bottom transfer terms (dP, dMx, dMz) of that base, i.e. read the loads at the bottom.
  const resultTable = (set, base, caption, colHeader, withTransfer) => {
    const rows = comboState[set].map(combo => ({ lc: combo.lc || '', name: combo.name, v: stdComboVector(combo.f, base) }));
    return `<table class="calc-table load-summary-table">
    <caption>${caption}</caption>
    <colgroup><col style="width:5%"><col style="width:50%"><col style="width:9%"><col style="width:9%"><col style="width:9%"><col style="width:9%"><col style="width:9%"></colgroup>
    <tr><th>No.</th><th>${colHeader}</th><th>F<sub>x</sub> <span class="unit">kN</span></th><th>F<sub>z</sub> <span class="unit">kN</span></th><th>P <span class="unit">kN</span></th><th>M<sub>x</sub> <span class="unit">kN·m</span></th><th>M<sub>z</sub> <span class="unit">kN·m</span></th></tr>
    ${rows.map(r => {
      const P = r.v.P + (withTransfer ? r.v.dP : 0), Mx = r.v.Mx + (withTransfer ? r.v.dMx : 0), Mz = r.v.Mz + (withTransfer ? r.v.dMz : 0);
      return `<tr><td>${escapeHtml(r.lc)}</td><td>${escapeHtml(r.name)}</td><td class="num">${fmt(r.v.Fx,2)}</td><td class="num">${fmt(r.v.Fz,2)}</td><td class="num">${fmt(P,2)}</td><td class="num">${fmt(Mx,2)}</td><td class="num">${fmt(Mz,2)}</td></tr>`;
    }).join('')}
  </table>`;
  };
  const footBase = buildStdComboBase();
  topEl.innerHTML = untypedLoadTypesWarning() + resultTable('lc', footBase, 'Load Combination Result at top of pedestal (ASD) — For Anchor Bolt Calculation', 'For Anchor Bolt Calculation', false);
  botEl.innerHTML = resultTable('lc', footBase, 'Load Combination Result at bottom of footing (ASD) — For Foundation Stability Calculation', 'For Foundation Stability Calculation', true);
  // LRFD results (strength design): the pedestal base carries H × pedestal height and the pedestal weight (5A pedestal design);
  // the bottom of the footing carries the whole footing transfer (5B pile cap flexure / shear).
  const lrfdPedEl = document.getElementById('lrfd-summary-ped'), lrfdBotEl = document.getElementById('lrfd-summary-bottom');
  const lrfdTopEl = document.getElementById('lrfd-summary-top');
  if (lrfdTopEl) lrfdTopEl.innerHTML = comboState.lrfd.length
    ? resultTable('lrfd', footBase, 'Load Combination Result at top of pedestal (LRFD) — For Anchor Bolt Design (09)', 'For Anchor Bolt Design', false)
    : '<div class="note">No LRFD combinations — load them with "Edit Load Combinations (LRFD)".</div>';
  if (lrfdPedEl) lrfdPedEl.innerHTML = comboState.lrfd.length
    ? resultTable('lrfd', buildPedestalComboBase(), `Load Combination Result at base of pedestal (LRFD) — For Pedestal Design (5A); H·H<sub>p</sub> with H<sub>p</sub> = ${fmt(state.pedHp,3)} m and pedestal weight ${fmt(state.pedW,1)} kN included`, 'For Pedestal Design', true)
    : '<div class="note">No LRFD combinations — load them with "Edit Load Combinations (LRFD)".</div>';
  if (lrfdBotEl) lrfdBotEl.innerHTML = comboState.lrfd.length
    ? resultTable('lrfd', footBase, 'Load Combination Result at bottom of footing (LRFD) — For Pile Cap Design (5B)', 'For Pile Cap Design', true)
    : '<div class="note">No LRFD combinations — load them with "Edit Load Combinations (LRFD)".</div>';
  renderComboPrintTable();
  renderLrfdPrintTable();
}
// Read-only print/preview version of the "Edit Load Combinations" table (#lc-combo-table) — same
// comboState.lc / state.lcLoadTypes data, formatted for "3.2 Load Combination" in the report instead of an
// editable popup, so the actual factors used are visible in the document, not just in a modal.
export function renderComboPrintTable() {
  const container = document.getElementById('lc-combo-print-container');
  if (!container) return;
  // No. + combination formula only — the per-load-type factor columns are left out of the preview (the factors
  // stay editable in the Load Combinations popup and are what 3.3 is computed from).
  const rows = comboState.lc.map(c => `<tr><td>${escapeHtml(c.lc || '')}</td><td>${escapeHtml(c.name)}</td></tr>`).join('');
  container.innerHTML = `<div class="overflow-x"><table class="calc-table" style="table-layout:fixed;">
    <caption>Table 3.2.1. ASD Load Combinations (allowable stress design — stability, pile capacity, anchor bolts)</caption>
    <tr><th style="width:10%;">No.</th><th style="width:90%;">Combination</th></tr>
    ${rows}
  </table></div>${sdsFactorBlock()}`;
}
// Read-only print version of the LRFD table (comboState.lrfd, edited in its own popup): No. + combination text, then the
// S_DS-dependent factors evaluated, like the ASD block above. Any combination whose text uses a factor but whose D factor
// no longer matches the current S_DS is flagged (needs "Reload standard LRFD set").
export function renderLrfdPrintTable() {
  const container = document.getElementById('lrfd-combo-print-container');
  if (!container) return;
  if (comboState.lrfd.length === 0) { container.innerHTML = '<div class="note">No LRFD combinations — load them with "Edit Load Combinations (LRFD)".</div>'; return; }
  const rows = comboState.lrfd.map(c => `<tr><td>${escapeHtml(c.lc || '')}</td><td>${escapeHtml(c.name)}</td></tr>`).join('');
  const sds = getStdComboSDS();
  const std = buildLrfdCombos(sds);
  const kOf = lc => (std.find(c => c.lc === lc) || { f: {} }).f.D;
  const terms = [
    { text: '(1.2 + 0.2SDS)', expr: '1.2 + 0.2·S<sub>DS</sub>', sub: `1.2 + 0.2 × ${fmt(sds,3)}`, k: kOf('210') },
    { text: '(0.9 − 0.2SDS)', expr: '0.9 − 0.2·S<sub>DS</sub>', sub: `0.9 − 0.2 × ${fmt(sds,3)}`, k: kOf('212') }
  ].map(t => {
    const used = comboState.lrfd.filter(c => (c.name || '').includes(t.text));
    return { ...t, lcs: used.map(c => c.lc).filter(Boolean), stale: used.filter(c => Math.abs((c.f.D || 0) - t.k) > 1e-9).map(c => c.lc || c.name) };
  }).filter(t => t.lcs.length);
  const stale = terms.flatMap(t => t.stale);
  container.innerHTML = `<div class="overflow-x"><table class="calc-table" style="table-layout:fixed;">
    <caption>Table 3.2.2. LRFD Load Combinations (strength design — pedestal 5A, pile cap 5B) — ASCE 7-22 §2.3.1 / §2.3.6</caption>
    <tr><th style="width:10%;">No.</th><th style="width:90%;">Combination</th></tr>
    ${rows}
  </table></div>
  <div class="lc-formula">
    <div class="lc-formula-title">LRFD factors</div>
    W and E are the strength-level values (the ASD set scales them by 0.6 and 0.7). L = 1.0 in wind / seismic combinations and ρ = 1.0; the vertical seismic effect E<sub>v</sub> = 0.2·S<sub>DS</sub>·D (ASCE 7-22 §12.4.2.3) gives the factors below. All factors are editable in "Edit Load Combinations (LRFD)".
    ${terms.length ? `<div>S<sub>DS</sub> = ${fmt(sds,3)} g</div>` : ''}
    ${terms.map(t => `<div>${t.expr} = ${t.sub} = <strong>${fmt(t.k,3)}</strong> <span class="lc-formula-note">(LC ${t.lcs.join(', ')})</span></div>`).join('')}
    ${stale.length ? `<div class="warn-box" style="margin-top:6px;"><strong>⚠  Combination factors out of date:</strong> LC ${stale.join(', ')} were generated with a different S<sub>DS</sub> — click "↺ Reload standard LRFD set" in Edit Load Combinations (LRFD).</div>` : ''}
  </div>`;
}
// The only non-literal factors in the 101-126 set are the S_DS-dependent ones — shown evaluated under 3.2 so the
// checker can verify them. Values come from buildStdCombos() (lib, single source of the formulas), read off
// LC111/113/115's D factor. comboState.lc keeps the factors it was generated with, so any combo whose text uses a
// term but whose D factor no longer matches the current S_DS is flagged (needs "Reload standard 101–126 set").
export function sdsFactorBlock() {
  const sds = getStdComboSDS();
  const std = buildStdCombos(sds);
  const kOf = lc => (std.find(c => c.lc === lc) || { f: {} }).f.D;
  const terms = [
    { text: '(1 + 0.14SDS)',  expr: '1 + 0.14·S<sub>DS</sub>',  sub: `1 + 0.14 × ${fmt(sds,3)}`,  k: kOf('111') },
    { text: '(1 + 0.105SDS)', expr: '1 + 0.105·S<sub>DS</sub>', sub: `1 + 0.105 × ${fmt(sds,3)}`, k: kOf('113') },
    { text: '(0.6 - 0.14SDS)', expr: '0.6 − 0.14·S<sub>DS</sub>', sub: `0.6 − 0.14 × ${fmt(sds,3)}`, k: kOf('115') }
  ].map(t => {
    const used = comboState.lc.filter(c => (c.name || '').includes(t.text));
    return { ...t, lcs: used.map(c => c.lc).filter(Boolean), stale: used.filter(c => Math.abs((c.f.D || 0) - t.k) > 1e-9).map(c => c.lc || c.name) };
  }).filter(t => t.lcs.length);
  if (!terms.length) return '';
  const stale = terms.flatMap(t => t.stale);
  return `<div class="lc-formula">
    <div class="lc-formula-title">Seismic factors (S<sub>DS</sub>-dependent)</div>
    <div>S<sub>DS</sub> = ${fmt(sds,3)} g <span class="lc-formula-note">(Seismic Load, ${getRadioVal('sg-mode') === 'direct' ? 'direct input' : 'computed'})</span></div>
    ${terms.map(t => `<div>${t.expr} = ${t.sub} = <strong>${fmt(t.k,3)}</strong> <span class="lc-formula-note">(LC ${t.lcs.join(', ')})</span></div>`).join('')}
    ${stale.length ? `<div class="warn-box" style="margin-top:6px;"><strong>⚠  Combination factors out of date:</strong> LC ${stale.join(', ')} were generated with a different S<sub>DS</sub> — click "↺ Reload standard 101–126 set" in Load Combinations so 3.3 uses S<sub>DS</sub> = ${fmt(sds,3)} g.</div>` : ''}
  </div>`;
}
// buildStdCombos() (the fixed LC101-126 set) and stdComboVector() (biaxial factor-combination) live in
// lib/foundation/shared/loadCombinations.js. key === code throughout (matches the registered state.lcLoadTypes
// codes) — a combo's f object can be used directly as comboState.lc's f object, or looked up by
// getLcLoads()/buildStdComboBase(), with no renaming.
export const STD_COMBO_COLS = [
  { key: 'D',     code: 'D',    label: 'Dead load' },
  { key: 'L',     code: 'L',    label: 'Live load' },
  { key: 'Lr',    code: 'Lr',   label: 'Roof Live Load' },
  { key: 'E(E)',  code: 'E(E)', label: 'Equipment Empty weight' },
  { key: 'E(O)',  code: 'E(O)', label: 'Equipment Operating Weight' },
  { key: 'E(T)',  code: 'E(T)', label: 'Equipment Testing Weight' },
  { key: 'WX',    code: 'WX',   label: 'Wind Load' },
  { key: 'WZ',    code: 'WZ',   label: 'Wind Load' },
  { key: 'EQX(E)',   code: 'EQX(E)',  label: 'Seismic Load, Empty' },
  { key: 'EQZ(E)',   code: 'EQZ(E)',  label: 'Seismic Load, Empty' },
  { key: 'EQX(O)',    code: 'EQX(O)',   label: 'Seismic Load, Operating' },
  { key: 'EQZ(O)',    code: 'EQZ(O)',   label: 'Seismic Load, Operating' }
];
// Reads SDS the same way the Seismic Load Generator would, without depending on it having been run this session.
export function getStdComboSDS() {
  const mode = getRadioVal('sg-mode');
  return designSpectralAccel({ mode, Ss: num('sg-Ss'), S1: num('sg-S1'), site: getRadioVal('sg-site'), SDSDirect: num('sg-SDS-direct'), SD1Direct: num('sg-SD1-direct') }).SDS;
}
// Per-code biaxial load vectors with the top -> bottom transfer set to the footing (lc-dh / lc-dW: everything down to the
// underside of the footing) — the base of the stability, pile and pile cap checks.
export function buildStdComboBase() { return buildComboBaseFor(num('lc-dh'), num('lc-dW')); }
// Same vectors transferred only down to the BASE OF THE PEDESTAL (top of footing) for the 5A pedestal design: lever arm of
// H = pedestal height Hp, and the pedestal self-weight added to the dead load (scaled by the combination's D factor).
export function buildPedestalComboBase() { return buildComboBaseFor(state.pedHp || 0, state.pedW || 0); }
function buildComboBaseFor(dh, dWfoot) {
  const numOr0 = (id) => { const el = document.getElementById(id); if (!el) return 0; const v = parseFloat(el.value); return isFinite(v) ? v : 0; };
  const items = state.lcLoadTypes.map(lt => {
    const eqField = EQUIPMENT_CODE_TO_FIELD[lt.code];
    return { code: lt.code, kind: lt.kind,
      P: eqField ? num(eqField) : numOr0(`lc-${lt.code}-P`), H: numOr0(`lc-${lt.code}-H`), M: numOr0(`lc-${lt.code}-M`),
      Hz: numOr0(`lc-${lt.code}-Hz`), Mx: numOr0(`lc-${lt.code}-Mx`) }; // Hz/Mx: vertical types only (absent -> 0)
  });
  const { base, untyped } = buildComboBase(items, dh, dWfoot);
  state.lastUntypedLoadTypes = untyped;
  return base;
}
// Warning shown wherever combination results are reported, while any registered load type still has no type.
export function untypedLoadTypesWarning() {
  if (!state.lastUntypedLoadTypes.length) return '';
  return `<div class="warn-box"><strong>⚠  Load type without a type:</strong> ${state.lastUntypedLoadTypes.map(escapeHtml).join(', ')} — not included in the combination results. Choose its type (vertical / wind / earthquake / …) in "⧉ Edit Load Types".</div>`;
}
// Renders only the A.3.2 factor table (fixed LC101-126 reference set) — the computed top/bottom P/H/M results
// live in renderLcSummary() instead (driven by the editable comboState.lc, which starts out equal to this same
// set), so there's a single pair of result tables rather than two that would otherwise show identical numbers.
export function renderStdComboTables() {
  const factorsEl = document.getElementById('std-combo-factors');
  if (!factorsEl) return;
  const sds = getStdComboSDS();
  const combos = buildStdCombos(sds);
  const rowLabelCells = (c) => `<td class="lc-no">${escapeHtml(c.lc)}</td><td>${escapeHtml(c.formula)}</td>`;
  const groupRow = (cond, colspan) => `<tr class="combo-group-row"><td colspan="${colspan}">${escapeHtml(cond)}</td></tr>`;
  let lastCond = null, factorRows = '';
  combos.forEach(c => {
    if (c.cond !== lastCond) { factorRows += groupRow(c.cond, STD_COMBO_COLS.length + 2); lastCond = c.cond; }
    factorRows += `<tr>${rowLabelCells(c)}${STD_COMBO_COLS.map(col => `<td class="num">${c.f[col.key] ? fmt(c.f[col.key],2) : ''}</td>`).join('')}</tr>`;
  });
  factorsEl.innerHTML = `<table class="calc-table std-factor-table">
    <tr><th>No.</th><th>Combination</th>${STD_COMBO_COLS.map(col => `<th title="${escapeHtml(col.label)}"><span class="unit">${escapeHtml(col.label)}</span><br>${escapeHtml(col.code)}</th>`).join('')}</tr>
    ${factorRows}
  </table>`;
}
// Replaces the editable Load Combinations table (comboState.lc, used by Foundation Stability / Pile / Anchor
// Bolt / Rebar) with the same LC101-126 set shown in the "A.3.2" report above, so both tables always show the
// same combinations and factors — only their P/H/M source (registered Load Values vs. this report's own read)
// differs. Re-run whenever the combo set should be regenerated (e.g. after adding/removing LC rows by hand and
// wanting to reset back to the standard set).
export function loadStandardVesselCombos() {
  const combos = buildStdCombos(getStdComboSDS());
  comboState.lc = combos.map(c => ({ lc: c.lc, name: c.formula, f: c.f }));
  if (typeof renderComboTable === 'function') renderComboTable('lc');
}
// Factored (strength-design) combinations LC201+ for the pile cap flexure / shear checks (5B) — ASCE 7-22 §2.3.1 /
// §2.3.6, built by buildLrfdCombos() in the lib. Separate from the ASD set above; editable in its own popup.
export function loadLrfdCombos() {
  comboState.lrfd = buildLrfdCombos(getStdComboSDS()).map(c => ({ lc: c.lc, name: c.formula, f: c.f }));
  if (document.getElementById('lrfd-combo-body')) renderOneComboTable('lrfd');
}
