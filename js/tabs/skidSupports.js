// Tab 03 — vendor reactions per skid support (base plate / runner): the table of state.skidSupportList and its "Apply", which writes the
// sums into the Equipment Load fields E(E) / E(O) / E(T) and the supports into the Tab 02 load points (skidSupportLoads(), lib).
// Function/const declarations only; event wiring stays in app.js.
import { skidSupportLoads } from '../../lib/foundation/index.js?v=20261028s1';
import { escapeHtml, num } from '../core/dom.js?v=20261028s1';
import { fmt } from '../core/format.js?v=20261028s1';
import { loadPointList, skidSupportList } from '../core/state.js?v=20261028s1';
import { renderLoadPointTable } from '../tabs/loadPoints.js?v=20261028s1';

export const SKID_FIELDS = [['x', 'x (m)', 0.05], ['z', 'z (m)', 0.05], ['c1', 'c₁ (m)', 0.05], ['c2', 'c₂ (m)', 0.05],
  ['PE', 'P empty (kN)', 0.1], ['PO', 'P operating (kN)', 0.1], ['PT', 'P test (kN)', 0.1]];

export function renderSkidSupportTable() {
  const body = document.getElementById('skid-sup-list');
  if (!body) return;
  body.innerHTML = skidSupportList.map((s, i) => `
    <div class="lp-card">
      <div class="lp-head"><span>Support ${i + 1}</span><button type="button" class="combo-remove skid-sup-remove" data-i="${i}" title="Remove support">•</button></div>
      <div class="lp-grid">${SKID_FIELDS.map(([f, lbl, st]) => `<label>${lbl}<input type="number" step="${st}" class="skid-sup-input" data-i="${i}" data-f="${f}" value="${s[f]}"></label>`).join('')}</div>
    </div>`).join('');
  renderSkidSupportNote();
}
// The sums / issues line under the table (refreshed on every keystroke without rebuilding the inputs).
export function renderSkidSupportNote() {
  const note = document.getElementById('skid-sup-note');
  if (note) {
    const r = skidSupportLoads(skidSupportList);
    note.innerHTML = r.valid
      ? `Σ empty ${fmt(r.EE, 2)} kN, Σ operating ${fmt(r.EO, 2)} kN, Σ test ${fmt(r.ET, 2)} kN.${r.issues.length ? ' ⚠ ' + r.issues.map(escapeHtml).join(' ') : ''}`
      : 'No supports — add one per base plate / runner.';
  }
}

// Writes the sums into E(E) / E(O) / E(T) and replaces the Tab 02 load points by the supports (share = operating reaction).
// The caller (app.js) then selects "Multiple" load points and recalculates. Returns the lib result, or null without supports.
export function applySkidSupports() {
  const r = skidSupportLoads(skidSupportList);
  if (!r.valid) return null;
  [['eq-load-ee', r.EE], ['eq-load-eo', r.EO], ['eq-load-et', r.ET]].forEach(([id, v]) => { document.getElementById(id).value = (+v.toFixed(3)).toString(); });
  loadPointList.splice(0, loadPointList.length, ...r.points.map(p => ({ x: p.x, y: p.y, c1: p.c1, c2: p.c2, share: +p.share.toFixed(4) })));
  renderLoadPointTable();
  return r;
}

// 3.1.5 of the report: the vendor reactions and what they were turned into (empty without supports).
export function skidSupportPreviewHtml() {
  if (!skidSupportList.length) return '';
  const r = skidSupportLoads(skidSupportList);
  if (!r.valid) return '';
  const applied = Math.abs(num('eq-load-ee') - r.EE) < 5e-3 && Math.abs(num('eq-load-eo') - r.EO) < 5e-3 && Math.abs(num('eq-load-et') - r.ET) < 5e-3;
  const basisName = { O: 'operating', E: 'empty', T: 'test' }[r.basis] || 'equal';
  const shiftTxt = ['E', 'T'].filter(c => r.cond[c] && r.cond[c].shift > 1e-6)
    .map(c => `${c === 'E' ? 'empty' : 'test'} reaction centroid ${fmt(r.cond[c].shift, 3)} m from the ${basisName} centroid (moment error up to ${fmt(r.cond[c].P * r.cond[c].shift, 1)} kN·m)`);
  return `<div class="overflow-x"><table class="calc-table">
    <caption>3.1.5. Equipment support reactions (vendor)</caption>
    <tr><th>Support</th><th>x (m)</th><th>z (m)</th><th>c<sub>1</sub> × c<sub>2</sub> (m)</th><th>P empty (kN)</th><th>P operating (kN)</th><th>P test (kN)</th><th>Share</th></tr>
    ${skidSupportList.map((s, i) => `<tr><td>${i + 1}</td><td class="num">${fmt(s.x, 2)}</td><td class="num">${fmt(s.z, 2)}</td><td class="num">${fmt(s.c1, 2)} × ${fmt(s.c2, 2)}</td><td class="num">${fmt(s.PE, 2)}</td><td class="num">${fmt(s.PO, 2)}</td><td class="num">${fmt(s.PT, 2)}</td><td class="num">${fmt(100 * r.points[i].share / (r.points.reduce((a, p) => a + p.share, 0) || 1), 1)} %</td></tr>`).join('')}
    <tr class="calc-total"><td colspan="4">Σ = E(E), E(O), E(T)</td><td class="num">${fmt(r.EE, 2)}</td><td class="num">${fmt(r.EO, 2)}</td><td class="num">${fmt(r.ET, 2)}</td><td class="num">100 %</td></tr>
  </table></div>
  <div class="note">${applied ? 'Applied: the sums are the Equipment Load fields E(E) / E(O) / E(T) above, and every support is a load point of Section 02' : '⚠ Not applied — the Equipment Load fields differ from these sums; press "Apply" to use the supports'} (share = ${basisName} reaction, one set of shares for every load type${shiftTxt.length ? '; ' + shiftTxt.join('; ') : ''}).${r.issues.length ? ' ⚠ ' + r.issues.map(escapeHtml).join(' ') : ''}</div>`;
}
