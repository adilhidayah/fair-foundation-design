// Summary report tab.
// Moved from app.js — function/const declarations only; event wiring stays in app.js.
import { lastResults } from '../core/state.js?v=20261009q';
import { SCOPE_NA_LABEL, inScope } from '../workflow/scope.js?v=20261009q';
import { generateReport } from '../report/builder.js?v=20261009q';

export function buildQuickStatusHtml() {
  const order = ['oneway', 'twoway', 'foundation', 'pile', 'bearing', 'settlement', 'anchor', 'pedestalRebar', 'pileCapRebar'];
  // Checks taken out of scope in Section 00 are listed as NA (not counted), whatever their last computed status.
  const SCOPE_OF = { foundation: 'stability', pile: 'stability', settlement: 'settlement', oneway: 'structural', twoway: 'structural', pedestalRebar: 'structural', pileCapRebar: 'structural' };
  const entries = order.map(key => {
    const e = lastResults[key];
    const sc = SCOPE_OF[key];
    return e && sc && !inScope(sc) ? { ...e, status: 'NA', metric: SCOPE_NA_LABEL[sc], detail: 'Not in scope (Section 00 → Scope of Work)' } : e;
  }).filter(Boolean);
  // 'NA' = out of scope (Section 00 → Scope of Work, e.g. anchor bolts by vendor): listed, but not counted.
  const scored = entries.filter(e => e.status !== 'NA');
  const anyError = scored.some(e => e.status === 'ERROR');
  const anyFail = scored.some(e => e.status === 'FAIL');
  const overallPass = !anyError && !anyFail && scored.length > 0;
  let html = `<div class="verdict ${overallPass ? '' : 'fail'}">
    <div class="stamp">${overallPass ? 'ALL CHECKS PASS' : (anyError ? 'INCOMPLETE — SOME TABS NOT COMPUTED' : 'ONE OR MORE CHECKS FAIL')}</div>
    <div class="uc"><div class="val">${scored.filter(e=>e.status==='PASS').length}/${scored.length}</div><div class="lbl">TABS PASSING</div></div>
  </div>`;
  html += entries.map(e => {
    const cls = e.status === 'PASS' ? 'pass' : (e.status === 'FAIL' ? 'fail' : (e.status === 'INFO' ? 'info' : (e.status === 'NA' ? 'na' : '')));
    return `<div class="summary-row ${cls}">
      <div>
        <div class="sr-label">${e.label}</div>
        <div class="sr-detail">${e.detail}</div>
      </div>
      <div class="sr-metric">${e.status === 'ERROR' ? 'N/A' : e.metric}</div>
    </div>`;
  }).join('');
  html += `<div class="limits-box">
    <strong>Note:</strong> Status reflects each tab's last-computed result — nothing is recalculated here. If you haven't opened a tab yet this session it shows "N/A"; visit it once so its result is captured. Bearing Capacity shows q<sub>a</sub> (an input feeding Foundation Stability), not a pass/fail UC.
  </div>`;
  return html;
}
export function renderSummaryReport() {
  generateReport();
}
