// 08 — Bearing capacity (soil).
// Moved from app.js — function/const declarations only; event wiring stays in app.js.
import { bearingCapacityCheck } from '../../lib/foundation/index.js?v=20261015q';
import { escapeHtml, getRadioVal, num } from '../core/dom.js?v=20261015q';
import { fmt } from '../core/format.js?v=20261015q';
import { lastResults } from '../core/state.js?v=20261015q';
import { inScope } from '../workflow/scope.js?v=20261015q';

// q_a used by 4A and Table 1.3.1 — one source. In scope: computed from the Tab 08 soil inputs (same bearingCapacityCheck()
// call as calcBearing()). Out of scope (Section 00 → Scope of Work): the geotechnical-report value bc-qa-given, as entered.
// qa = null when it cannot be determined (B ≤ 0, or the given value is not set).
export function allowableBearing() {
  if (!inScope('bearing')) {
    const v = num('bc-qa-given');
    return { qa: v > 0 ? v : null, given: true, ref: document.getElementById('bc-qa-ref').value.trim() };
  }
  const shape = getRadioVal('bc-shape'), B = num('bc-B');
  if (B <= 0) return { qa: null, given: false, ref: '' };
  const L = (shape === 'square' || shape === 'circular') ? B : num('bc-L');
  const { qa } = bearingCapacityCheck({ c: num('bc-c'), phiDeg: num('bc-phi'), gamma: num('gen-gs'), shape, B, L, Df: num('bc-Df'),
    method: getRadioVal('bc-method'), FS: num('bc-FS'), failure: getRadioVal('bc-failure'), beta: num('bc-beta') });
  return { qa, given: false, ref: '' };
}
// q_a for an effective footing B′ × L′ (4A, Meyerhof effective area): the same soil inputs, formula and FS as Tab 08, with the
// shorter effective side as the width (rectangular shape). Out of scope (given q_a): the given value — it cannot be recomputed.
export function allowableBearingAt(Beff, Leff) {
  if (!inScope('bearing')) return { qa: allowableBearing().qa, recomputed: false };
  const Bs = Math.min(Beff, Leff), Ls = Math.max(Beff, Leff);
  if (!(Bs > 0)) return { qa: null, recomputed: true };
  const { qa } = bearingCapacityCheck({ c: num('bc-c'), phiDeg: num('bc-phi'), gamma: num('gen-gs'), shape: 'rectangular', B: Bs, L: Ls,
    Df: num('bc-Df'), method: getRadioVal('bc-method'), FS: num('bc-FS'), failure: getRadioVal('bc-failure'), beta: num('bc-beta') });
  return { qa, recomputed: true };
}
// Out of scope: no soil calculation — Tab 08 shows the given q_a and its source only.
function renderGivenBearing() {
  const { qa, ref } = allowableBearing();
  const label = 'Bearing Capacity (Soil)';
  if (qa === null) {
    lastResults.bearing = { label, status: 'ERROR', metric: 'q_a NOT SET', detail: 'Given by geotechnical report — value not entered.' };
    document.getElementById('calc-bearing').innerHTML = `<div class="warn-box"><strong>⚠  q<sub>a</sub> NOT SET:</strong> detailed bearing capacity is out of scope (Section 00 → Scope of Work). Enter the allowable bearing capacity from the geotechnical report in the input panel — "4A — Foundation Stability" cannot check the bearing pressure until it is set.</div>`;
    return;
  }
  lastResults.bearing = { label, status: 'INFO', metric: `q_a = ${fmt(qa,1)} kPa (given)`, detail: 'Given by geotechnical report' + (ref ? ` — ${ref}` : '') };
  document.getElementById('calc-bearing').innerHTML = `<div class="verdict">
    <div class="stamp">GIVEN — GEOTECHNICAL REPORT</div>
    <div class="uc"><div class="val">${fmt(qa,1)}</div><div class="lbl">q<sub>a</sub>, allowable (kPa)</div></div>
  </div>
  <div class="overflow-x"><table class="calc-table">
    <caption>Allowable bearing capacity</caption>
    <tr><th>Parameter</th><th>Source</th><th>Value</th></tr>
    <tr class="governing"><td>q<sub>a</sub>, allowable</td><td class="clause">${ref ? escapeHtml(ref) : 'Geotechnical report (reference not entered)'}</td><td class="num">${fmt(qa,1)} kPa</td></tr>
  </table></div>
  <div class="note">Detailed soil bearing capacity is outside the scope of this calculation. q<sub>a</sub> is taken as given by the geotechnical report and feeds "4A — Foundation Stability" directly.</div>`;
}

// TERZAGHI_* tables, terzaghiFactors(), meyerhofFactors(), terzaghiShapeFactors() and bearingCapacityCheck() live in lib/foundation/shared/bearingCapacity.js.
export function calcBearing() {
  const given = !inScope('bearing');
  document.getElementById('bc-given-fields').style.display = given ? 'block' : 'none';
  document.getElementById('bc-calc-fields').style.display = given ? 'none' : 'block';
  if (given) { renderGivenBearing(); return; }
  const c = num('bc-c'), phiDeg = num('bc-phi'), gamma = num('gen-gs');
  const shape = getRadioVal('bc-shape');
  const B = num('bc-B'), Lraw = num('bc-L'), Df = num('bc-Df');
  const method = getRadioVal('bc-method');
  const FS = num('bc-FS');
  const failure = getRadioVal('bc-failure');
  const beta = num('bc-beta');
  document.getElementById('bc-failure-field').style.display = (method === 'terzaghi') ? 'block' : 'none';
  document.getElementById('bc-incl-field').style.display = (method === 'meyerhof') ? 'block' : 'none';
  lastResults.bearing = { label: 'Bearing Capacity (Soil)', status: 'ERROR', metric: '—', detail: 'Not yet computed.' };
  if (B <= 0) {
    document.getElementById('calc-bearing').innerHTML = `<div class="warn-box"><strong>⚠  Invalid input:</strong> B must be greater than zero.</div>`;
    lastResults.bearing.detail = 'Invalid input (B must be > 0).';
    return;
  }
  const L = (shape === 'square' || shape === 'circular') ? B : Lraw;
  const { qu, qa, methodNote, detail } = bearingCapacityCheck({ c, phiDeg, gamma, shape, B, L, Df, method, FS, failure, beta });
  let html = '';
  let detailRows;
  if (detail.type === 'terzaghi') {
    detailRows = `
      <tr><td>${detail.failure === 'local' ? "c′ = (2/3)c" : 'c (input)'}</td><td class="clause">—</td><td class="num">${fmt(detail.useC,2)} kPa</td></tr>
      <tr><td>${detail.failure === 'local' ? "φ′ = arctan[(2/3)tanφ]" : 'φ (input)'}</td><td class="clause">—</td><td class="num">${fmt(detail.usePhi,2)}°</td></tr>
      <tr><td>N<sub>c</sub>, N<sub>q</sub>, N<sub>γ</sub></td><td class="clause">Terzaghi table, interpolated${detail.clamped ? ' (φ clamped to 0–50°)' : ''}</td><td class="num">${fmt(detail.Nc,2)}, ${fmt(detail.Nq,2)}, ${fmt(detail.Ng,2)}</td></tr>
      <tr><td>Shape factors s<sub>c</sub>, s<sub>γ</sub></td><td class="clause">${detail.shape}</td><td class="num">${fmt(detail.sc,3)}, ${fmt(detail.sg,3)}</td></tr>
      <tr><td>Surcharge, q = γ·D<sub>f</sub></td><td class="clause">—</td><td class="num">${fmt(detail.q,2)} kPa</td></tr>
      <tr class="governing"><td>q<sub>u</sub></td><td class="clause">c·N<sub>c</sub>·s<sub>c</sub> + q·N<sub>q</sub> + 0.5·γ·B·N<sub>γ</sub>·s<sub>γ</sub></td><td class="num">${fmt(qu,1)} kPa</td></tr>`;
  } else {
    detailRows = `
      <tr><td>N<sub>c</sub>, N<sub>q</sub>, N<sub>γ</sub></td><td class="clause">exact, K<sub>p</sub>=tan²(45+φ/2)</td><td class="num">${fmt(detail.Nc,2)}, ${fmt(detail.Nq,2)}, ${fmt(detail.Ng,2)}</td></tr>
      <tr><td>Shape F<sub>cs</sub>, F<sub>qs</sub>=F<sub>γs</sub></td><td class="clause">B/L = ${fmt(detail.bl,3)}</td><td class="num">${fmt(detail.Fcs,3)}, ${fmt(detail.Fqs,3)}</td></tr>
      <tr><td>Depth F<sub>cd</sub>, F<sub>qd</sub>=F<sub>γd</sub></td><td class="clause">D<sub>f</sub>/B = ${fmt(detail.Df/detail.B,3)}</td><td class="num">${fmt(detail.Fcd,3)}, ${fmt(detail.Fqd,3)}</td></tr>
      <tr><td>Inclination F<sub>ci</sub>=F<sub>qi</sub>, F<sub>γi</sub></td><td class="clause">β = ${fmt(detail.beta,1)}°</td><td class="num">${fmt(detail.Fci,3)}, ${fmt(detail.Fgi,3)}</td></tr>
      <tr><td>Surcharge, q = γ·D<sub>f</sub></td><td class="clause">—</td><td class="num">${fmt(detail.q,2)} kPa</td></tr>
      <tr class="governing"><td>q<sub>u</sub></td><td class="clause">c·N<sub>c</sub>F<sub>cs</sub>F<sub>cd</sub>F<sub>ci</sub> + q·N<sub>q</sub>F<sub>qs</sub>F<sub>qd</sub>F<sub>qi</sub> + 0.5·γ·B·N<sub>γ</sub>F<sub>γs</sub>F<sub>γd</sub>F<sub>γi</sub></td><td class="num">${fmt(qu,1)} kPa</td></tr>`;
  }
  lastResults.bearing = { label: 'Bearing Capacity (Soil)', status: 'INFO', metric: `q_a = ${fmt(qa,1)} kPa`, detail: `${methodNote}, q_u=${fmt(qu,1)}kPa, FS=${fmt(FS,2)}` };
  html += `<div class="verdict">
    <div class="stamp">${methodNote.toUpperCase()}</div>
    <div class="uc"><div class="val">${fmt(qa,1)}</div><div class="lbl">q<sub>a</sub> = q<sub>u</sub> / FS (kPa)</div></div>
  </div>`;
  html += `<div class="overflow-x"><table class="calc-table">
    <caption>Bearing capacity calculation</caption>
    <tr><th>Parameter</th><th>Expression</th><th>Value</th></tr>
    ${detailRows}
    <tr><td>Factor of safety, FS</td><td class="clause">input</td><td class="num">${fmt(FS,2)}</td></tr>
    <tr class="governing"><td>q<sub>a</sub>, allowable</td><td class="clause">q<sub>u</sub> / FS</td><td class="num">${fmt(qa,1)} kPa</td></tr>
  </table></div>`;
  html += `<div class="note">q<sub>a</sub> feeds "4A — Foundation Stability" automatically, including the per-load-combination bearing pressure check shown there — no need to copy it over or duplicate it here.</div>`;
  html += `<div class="limits-box">
    <strong>Limitation:</strong> No groundwater table correction (effective unit weight below water table is not applied) — reduce γ and the surcharge term manually per Das/Bowles if the water table is above or near the footing base. Eccentric loading (reduced effective width B′) is not combined with this check — run it separately if needed. Verify N-factors and shape/depth/inclination factors against your governing reference and code edition before final design.
  </div>`;
  document.getElementById('calc-bearing').innerHTML = html;
}
