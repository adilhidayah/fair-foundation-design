// 01 — General Input Data: design standards register + general summary.
// Moved from app.js — function/const declarations only; event wiring stays in app.js.
import { bearingCapacityCheck } from '../../lib/foundation/index.js?v=20260926v';
import { escapeHtml, getRadioVal, num } from '../core/dom.js?v=20260926v';
import { fmt } from '../core/format.js?v=20260926v';
import { designStandards } from '../core/state.js?v=20260926v';
import { calcAnchor } from '../tabs/anchor.js?v=20260926v';
import { calcBearing } from '../tabs/bearing.js?v=20260926v';
import { renderLcSummary, renderStdComboTables } from '../tabs/combos.js?v=20260926v';
import { calcFoundation } from '../tabs/foundation.js?v=20260926v';
import { calcFoundSize } from '../tabs/foundSize.js?v=20260926v';
import { calcPile } from '../tabs/pile.js?v=20260926v';
import { calcRebar } from '../tabs/rebar.js?v=20260926v';
import { calcSettlement } from '../tabs/settlement.js?v=20260926v';
import { calcOneWay, calcTwoWay } from '../tabs/shear.js?v=20260926v';
import { renderWorkflowLive } from '../workflow/status.js?v=20260926v';

// Rows are editable in place (✎ -> Save/Cancel); the editing row index lives on window since this renders at startup.
export function renderDesignStandardsTable() {
  const editing = window.__stdEditingIndex;
  document.getElementById('gen-standards-body').innerHTML = designStandards.map((s, i) => i === editing ? `<tr class="row-editing">
      <td class="num">${i + 1}</td>
      <td><input type="text" class="row-edit-input" id="std-edit-docno" value="${escapeHtml(s.docNo)}" aria-label="Document No."></td>
      <td><input type="text" class="row-edit-input" id="std-edit-title" value="${escapeHtml(s.title)}" aria-label="Document Title"></td>
      <td class="row-actions"><button type="button" class="row-btn row-btn-save gen-standard-save" data-i="${i}" title="Save">✓</button><button type="button" class="row-btn gen-standard-cancel" title="Cancel">✕</button></td>
    </tr>` : `<tr>
      <td class="num">${i + 1}</td>
      <td>${escapeHtml(s.docNo)}</td>
      <td>${escapeHtml(s.title)}</td>
      <td class="row-actions"><button type="button" class="row-btn gen-standard-edit" data-i="${i}" title="Edit standard">✎</button><button type="button" class="combo-remove gen-standard-remove" data-i="${i}" title="Remove standard">•</button></td>
    </tr>`).join('');
}
export function saveStandardEdit(i) {
  const docNoEl = document.getElementById('std-edit-docno'), titleEl = document.getElementById('std-edit-title');
  const docNo = docNoEl.value.trim();
  if (!docNo) { docNoEl.focus(); return; }
  designStandards[i] = { docNo, title: titleEl.value.trim() };
  window.__stdEditingIndex = null;
  renderDesignStandardsTable();
  renderGeneralSummary();
}
export function renderGeneralSummary() {
  const fc = num('gen-fc'), fy = num('gen-fy'), gc = num('gen-gc'), gs = num('gen-gs'), gl = num('gen-gl');
  const Ec = 4700 * Math.sqrt(fc);
  // Geotechnical parameters below are NOT separate inputs — they are read live from where they're actually
  // set ("08 — Bearing Capacity" and "4A — Foundation Stability") so this section can never drift out of
  // sync with a second, duplicate copy of the same number.
  const bcC = num('bc-c'), bcPhi = num('bc-phi'), bcFS = num('bc-FS'), bcShape = getRadioVal('bc-shape');
  const bcB = num('bc-B'), bcLraw = num('bc-L'), bcDf = num('bc-Df');
  const bcMethod = getRadioVal('bc-method'), bcFailure = getRadioVal('bc-failure'), bcBeta = num('bc-beta');
  const bcL = (bcShape === 'square' || bcShape === 'circular') ? bcB : bcLraw;
  let qaRows = `<tr><td>Allowable bearing capacity, q<sub>a</sub></td><td class="num">—</td></tr>`;
  if (bcB > 0) {
    const { qa } = bearingCapacityCheck({ c: bcC, phiDeg: bcPhi, gamma: gs, shape: bcShape, B: bcB, L: bcL, Df: bcDf, method: bcMethod, FS: bcFS, failure: bcFailure, beta: bcBeta });
    qaRows = `<tr><td>Allowable bearing capacity, q<sub>a</sub></td><td class="num">${fmt(qa,1)} kPa</td></tr>`;
  }
  const fsDistinguish = document.getElementById('fd-fsDistinguish').checked;
  document.getElementById('fd-fsSlide-temp-field').style.display = fsDistinguish ? 'block' : 'none';
  document.getElementById('fd-fsOT-temp-field').style.display = fsDistinguish ? 'block' : 'none';
  const fdFsSlidePerm = num('fd-fsSlide-perm'), fdFsSlideTemp = fsDistinguish ? num('fd-fsSlide-temp') : fdFsSlidePerm;
  const fdFsOTPerm = num('fd-fsOT-perm'), fdFsOTTemp = fsDistinguish ? num('fd-fsOT-temp') : fdFsOTPerm;
  // "01 — General Input Data" now hosts the Foundation Type master control (id="fs-support", moved from
  // "02 — Foundation Dimension") — Section 1.3 below reads it to decide which geotechnical parameters apply.
  const isPile = getRadioVal('fs-support') === 'pile';
  document.getElementById('gen-pile-fields').style.display = isPile ? 'block' : 'none';
  document.getElementById('gen-shallow-fs-section-label').style.display = isPile ? 'none' : 'block';
  document.getElementById('gen-shallow-fs-fields').style.display = isPile ? 'none' : 'block';
  const foundTypeLabel = isPile ? 'Deep Foundation (Piles)' : 'Shallow Foundation (Pad Footing)';
  const projName = (document.getElementById('gen-proj').value || '').trim() || '[Equipment / Structure Name]';
  const unitSystemPhrase = 'SI Metric';
  const standardsRows = designStandards.map((s, i) => `<tr><td class="num">${i + 1}</td><td>${escapeHtml(s.docNo)}</td><td>${escapeHtml(s.title)}</td></tr>`).join('');
  document.getElementById('calc-general').innerHTML = `
    <div class="report-header"><h2>01. General Input Data</h2></div>
    <p style="margin:0 0 14px; font-size:13px; color:var(--ink-soft); line-height:1.5;">This chapter establishes the governing design codes, material properties, and geotechnical design criteria for the ${escapeHtml(projName)} foundation.</p>

    <div class="section-label">1.1 Design Standards</div>
    <p style="margin:0 0 10px; font-size:13px; color:var(--ink-soft); line-height:1.5;">Structural calculations for the ${escapeHtml(projName)} foundation are executed in the ${unitSystemPhrase} unit system. Governing design codes and project standards are summarized in Table 1.1.</p>
    <div class="overflow-x"><table class="calc-table" style="table-layout:fixed;">
      <colgroup><col style="width:6%"><col style="width:20%"><col style="width:74%"></colgroup>
      <caption>Table 1.1. Applicable Design Standards</caption>
      <tr><th>No</th><th>Document No.</th><th>Document Title</th></tr>
      ${standardsRows}
    </table></div>

    <div class="section-label" style="margin-top:20px;">1.2 Material Properties</div>
    <p style="margin:0 0 10px; font-size:13px; color:var(--ink-soft); line-height:1.5;">The mechanical strength parameters, elastic moduli, and unit weights applied in the structural and geotechnical evaluation of the ${escapeHtml(projName)} foundation are summarized in the tables below.</p>
    <div class="overflow-x"><table class="calc-table" style="table-layout:fixed;">
      <colgroup><col style="width:65%"><col style="width:35%"></colgroup>
      <caption>Table 1.2.1. Material Strengths &amp; Elastic Moduli</caption>
      <tr><th>Parameter</th><th>Value</th></tr>
      <tr><td>Concrete compressive strength, f'c</td><td class="num">${fmt(fc,1)} MPa</td></tr>
      <tr><td>Concrete modulus of elasticity, E<sub>c</sub> = 4700√(f'<sub>c</sub>)</td><td class="num">${fmt(Ec,0)} MPa</td></tr>
      <tr><td>Rebar yield strength, f<sub>y</sub></td><td class="num">${fmt(fy,1)} MPa</td></tr>
      <tr><td>Steel modulus of elasticity, E<sub>s</sub></td><td class="num">200,000 MPa</td></tr>
    </table></div>
    <div class="overflow-x" style="margin-top:14px;"><table class="calc-table" style="table-layout:fixed;">
      <colgroup><col style="width:65%"><col style="width:35%"></colgroup>
      <caption>Table 1.2.2. Unit Weights</caption>
      <tr><th>Parameter</th><th>Value</th></tr>
      <tr><td>Concrete unit weight, γ<sub>c</sub></td><td class="num">${fmt(gc,2)} kN/m³</td></tr>
      <tr><td>Lean concrete unit weight, γ<sub>L</sub></td><td class="num">${fmt(gl,2)} kN/m³</td></tr>
      <tr><td>Soil unit weight, γ<sub>s</sub></td><td class="num">${fmt(gs,2)} kN/m³</td></tr>
    </table></div>

    <div class="section-label" style="margin-top:20px;">1.3 Geotechnical Design Criteria</div>
    <p style="margin:0 0 10px; font-size:13px; color:var(--ink-soft); line-height:1.5;">${isPile
      ? `The governing geotechnical design criteria and allowable pile capacities for the deep foundation are summarized in Table 1.3.1.`
      : `The allowable geotechnical limits and minimum stability safety criteria for the ${escapeHtml(projName)} shallow foundation are summarized in Table 1.3.1.`}</p>
    ${isPile ? `
    <div class="overflow-x"><table class="calc-table" style="table-layout:fixed;">
      <colgroup><col style="width:65%"><col style="width:35%"></colgroup>
      <caption>Table 1.3.1. Pile Geometry</caption>
      <tr><th>Parameter</th><th>Value</th></tr>
      <tr><td>Pile type</td><td class="num">${escapeHtml((document.getElementById('pf-type').value || '').trim() || '—')}</td></tr>
      <tr><td>Pile diameter, D</td><td class="num">${fmt(num('pf-dia'),0)} mm</td></tr>
      <tr><td>Embedment length, L</td><td class="num">${fmt(num('pf-L'),1)} m</td></tr>
    </table></div>
    <div class="overflow-x" style="margin-top:14px;"><table class="calc-table" style="table-layout:fixed;">
      <colgroup><col style="width:65%"><col style="width:35%"></colgroup>
      <caption>Table 1.3.2. Pile Capacity Parameters</caption>
      <tr><th>Parameter</th><th>Value</th></tr>
      <tr><td>Allowable compression capacity, P<sub>all</sub></td><td class="num">${fmt(num('pf-Qc'),1)} kN</td></tr>
      <tr><td>Allowable tension / uplift capacity, T<sub>all</sub></td><td class="num">${fmt(num('pf-Qt'),1)} kN</td></tr>
      <tr><td>Allowable lateral capacity, H<sub>all</sub></td><td class="num">${fmt(num('pf-Ql'),1)} kN</td></tr>
    </table></div>` : `
    <div class="overflow-x"><table class="calc-table" style="table-layout:fixed;">
      <colgroup><col style="width:65%"><col style="width:35%"></colgroup>
      <caption>Table 1.3.1. Bearing Capacity Limits &amp; Minimum Safety Factors</caption>
      <tr><th>Parameter</th><th>Value</th></tr>
      ${qaRows}
      <tr><td>Factor of safety, overturning — Permanent (static), FS<sub>OT,perm</sub></td><td class="num">${fmt(fdFsOTPerm,2)}</td></tr>
      <tr><td>Factor of safety, overturning — Temporary (seismic/wind), FS<sub>OT,temp</sub></td><td class="num">${fmt(fdFsOTTemp,2)}</td></tr>
      <tr><td>Factor of safety, sliding — Permanent (static), FS<sub>sliding,perm</sub></td><td class="num">${fmt(fdFsSlidePerm,2)}</td></tr>
      <tr><td>Factor of safety, sliding — Temporary (seismic/wind), FS<sub>sliding,temp</sub></td><td class="num">${fmt(fdFsSlideTemp,2)}</td></tr>
    </table></div>`}
  `;
}
export function recalcAllGeneral() {
  calcOneWay();
  calcTwoWay();
  calcBearing();
  calcSettlement();
  calcAnchor();
  calcRebar();
  calcFoundSize();
  calcFoundation();
  if (typeof calcPile === 'function') calcPile();
  renderGeneralSummary();
  // calcFoundSize() can change ΔW (footing/pedestal self-weight, "lc-dW") — refresh the combo tables that read it
  // for the top->bottom transfer, so they don't go stale until some unrelated recalcAll() happens to fire.
  if (typeof renderLcSummary === 'function') renderLcSummary();
  if (typeof renderStdComboTables === 'function') renderStdComboTables();
  if (typeof renderWorkflowLive === 'function') renderWorkflowLive();
}
