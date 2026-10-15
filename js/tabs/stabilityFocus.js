// 4A / 4B — Foundation and pile stability: Focus Canvas views (#focus-foundation, #focus-pile). Shown instead of the A4 report
// sheet while the preview is in Focus Canvas mode (css/app.css); Report Preview and print keep #calc-foundation / #calc-pile.
// Builds markup only — every UC / force comes from calcFoundation() / calcPile() (lib results); nothing is recomputed here.
// Declarations only. Reuses the .fz-* layout of the 01 / 02 Focus views.
import { escapeHtml } from '../core/dom.js?v=20261015i';
import { fmt } from '../core/format.js?v=20261015i';

const PASS_EPS = 1e-9;
// A string "uc" is an informative value (e.g. contact area %), shown as is without a pass / fail colour.
const ucText = (uc) => (typeof uc === 'string' ? uc : uc === null || uc === undefined ? 'NOT SET' : (Number.isFinite(uc) ? fmt(uc, 3) : '∞'));
const ucCls = (uc) => (typeof uc === 'string' || uc === null || uc === undefined ? 'na' : (uc <= 1 + PASS_EPS ? 'ok' : 'bad'));
// Status tag from the check's lastResults status (PASS / FAIL / anything else = incomplete).
function statusTag(status) {
  if (status === 'PASS') return '<span class="fz-tag ok">All checks pass</span>';
  if (status === 'FAIL') return '<span class="fz-tag bad">Check fails</span>';
  return '<span class="fz-tag">Incomplete</span>';
}
// One check tile: name, governing UC (coloured), bar, governing combination and a short demand / capacity line.
function checkTile(t) {
  const cls = ucCls(t.uc);
  const pct = cls === 'na' ? 0 : Math.min(100, (Number.isFinite(t.uc) ? t.uc : 1) * 100);
  return `<div class="fz-tile fz-check ${cls}">
    <div class="fz-tile-label">${t.name}</div>
    <div class="fz-tile-value">${ucText(t.uc)}${cls === 'na' ? '' : '<span class="fz-unit">UC</span>'}</div>
    <div class="fz-bar"><i style="width:${pct.toFixed(1)}%"></i></div>
    <div class="fz-tile-sub">${t.lc ? `<span class="fz-nb">LC ${escapeHtml(t.lc)}</span>${t.pile ? ` · <span class="fz-nb">pile #${t.pile}</span>` : ''}<br>` : ''}${t.sub || ''}</div>
  </div>`;
}
const ucCell = (uc, gov) => `<td class="fz-num fz-uc ${ucCls(uc)}${gov ? ' gov' : ''}">${ucText(uc)}</td>`;

// Early exit of calcFoundation() / calcPile() (no combinations, geometry, q_a NOT SET, ...) — the same message as the sheet.
export function stabilityAlertHTML(kicker, title, msgHtml) {
  return `<div class="fz"><div class="fz-head"><div><div class="fz-kicker">${kicker}</div><div class="fz-title">${title}</div></div>
    <div class="fz-tags"><span class="fz-tag">Incomplete</span></div></div>
    <div class="fz-card fz-alert">${msgHtml}</div></div>`;
}

// d: { B, L, status, nCombos, qaText, checks: [{ name, uc, lc, sub }], rows: [{ lc, name, temporary, kern, bearing, sliding, ot, gov, invalid }],
//      svg, shownLc }
export function foundationFocusHTML(d) {
  const rows = d.rows.map((r) => r.invalid
    ? `<tr class="fz-invalid"><td class="fz-num">${escapeHtml(r.lc)}</td><td>${escapeHtml(r.name)}</td><td colspan="5">${escapeHtml(r.invalid)}</td></tr>`
    : `<tr${r.gov ? ' class="fz-gov"' : ''}><td class="fz-num">${escapeHtml(r.lc)}</td><td>${escapeHtml(r.name)}</td><td>${r.temporary ? 'Temp.' : 'Perm.'}</td>` +
      ucCell(r.kern, r.govKern) + ucCell(r.bearing, r.govBearing) + ucCell(r.sliding, r.govSliding) + ucCell(r.ot, r.govOt) + '</tr>').join('');
  return `<div class="fz">
    <div class="fz-head">
      <div><div class="fz-kicker">4A · Foundation Stability</div><div class="fz-title">Shallow footing ${fmt(d.B, 2)} × ${fmt(d.L, 2)} m</div></div>
      <div class="fz-tags"><span class="fz-tag">${d.nCombos} ASD combinations</span><span class="fz-tag">q<sub>a</sub> ${d.qaText}</span>${statusTag(d.status)}</div>
    </div>
    <div class="fz-tiles even">${d.checks.map(checkTile).join('')}</div>
    ${d.svg ? `<div class="fz-card fz-diagram"><div class="fz-sub">Soil pressure — governing combination LC ${escapeHtml(d.shownLc || '')}</div>${d.svg}</div>` : ''}
    <div class="fz-card">
      <div class="fz-sub">Utilization per load combination</div>
      <div class="fz-scroll"><table class="fz-table fz-uc-table">
        <tr><th class="fz-num">LC</th><th>Combination</th><th>Case</th><th class="fz-num">Kern</th><th class="fz-num">Bearing</th><th class="fz-num">Sliding</th><th class="fz-num">Overturning</th></tr>
        ${rows}
      </table></div>
      <div class="fz-note">UC = demand / capacity, ≤ 1.00 passes. Highlighted cells: governing combination of each check. Full tables in Report Preview.</div>
    </div>
  </div>`;
}

// d: { nPiles, D, Eg, status, checks: [{ name, uc, lc, pile, sub }], rows: [{ lc, name, P, Fmax, Fmin, Vmax, ucC, ucT, ucL, govC, govT, govL, invalid }],
//      svg, govLc, notices: [{ title, text }] }
export function pileFocusHTML(d) {
  const rows = d.rows.map((r) => r.invalid
    ? `<tr class="fz-invalid"><td class="fz-num">${escapeHtml(r.lc)}</td><td>${escapeHtml(r.name)}</td><td colspan="7">${escapeHtml(r.invalid)}</td></tr>`
    : `<tr><td class="fz-num">${escapeHtml(r.lc)}</td><td>${escapeHtml(r.name)}</td><td class="fz-num">${fmt(r.P, 1)}</td><td class="fz-num">${fmt(r.Fmax, 1)}</td><td class="fz-num">${fmt(r.Fmin, 1)}</td><td class="fz-num">${fmt(r.Vmax, 1)}</td>` +
      ucCell(r.ucC, r.govC) + ucCell(r.ucT, r.govT) + ucCell(r.ucL, r.govL) + '</tr>').join('');
  const notices = d.notices.length
    ? `<div class="fz-card"><div class="fz-sub">Notices</div><ul class="fz-checks">${d.notices.map((n) => `<li class="warn"><span class="fz-mark">!</span><span><strong>${escapeHtml(n.title)}</strong> — ${escapeHtml(n.text)}</span></li>`).join('')}</ul></div>`
    : '';
  return `<div class="fz">
    <div class="fz-head">
      <div><div class="fz-kicker">4B · Pile Foundation Stability</div><div class="fz-title">${d.nPiles} piles, D = ${fmt(d.D * 1000, 0)} mm</div></div>
      <div class="fz-tags"><span class="fz-tag">E<sub>g</sub> = ${Number.isFinite(d.Eg) ? fmt(d.Eg, 3) : '—'}</span>${statusTag(d.status)}</div>
    </div>
    ${d.checks.length ? `<div class="fz-tiles even">${d.checks.map(checkTile).join('')}</div>` : ''}
    ${notices}
    <div class="fz-card fz-diagram"><div class="fz-sub">Pile layout${d.govLc ? ` — axial forces, governing combination LC ${escapeHtml(d.govLc)}` : ''}</div>${d.svg}</div>
    ${d.rows.length ? `<div class="fz-card">
      <div class="fz-sub">Pile forces and DCR per load combination</div>
      <div class="fz-scroll"><table class="fz-table fz-uc-table">
        <tr><th class="fz-num">LC</th><th>Combination</th><th class="fz-num">P (kN)</th><th class="fz-num">F<sub>max</sub></th><th class="fz-num">F<sub>min</sub></th><th class="fz-num">V<sub>max</sub></th><th class="fz-num">DCR<sub>c</sub></th><th class="fz-num">DCR<sub>t</sub></th><th class="fz-num">DCR<sub>l</sub></th></tr>
        ${rows}
      </table></div>
      <div class="fz-note">Pile forces in kN, compression positive. DCR = demand / capacity, ≤ 1.00 passes; highlighted cells are the governing combination of each check. Full tables and formulas in Report Preview.</div>
    </div>` : ''}
  </div>`;
}
