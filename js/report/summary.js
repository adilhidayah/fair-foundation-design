// Summary report tab.
// Moved from app.js — function/const declarations only; event wiring stays in app.js.
import { lastResults } from '../core/state.js?v=20260927c';
import { generateReport } from '../report/builder.js?v=20260927c';

export function buildQuickStatusHtml() {
  const order = ['oneway', 'twoway', 'foundation', 'pile', 'bearing', 'settlement', 'anchor', 'pedestalRebar', 'pileCapRebar'];
  const entries = order.map(key => lastResults[key]).filter(Boolean);
  const anyError = entries.some(e => e.status === 'ERROR');
  const anyFail = entries.some(e => e.status === 'FAIL');
  const overallPass = !anyError && !anyFail && entries.length > 0;
  let html = `<div class="verdict ${overallPass ? '' : 'fail'}">
    <div class="stamp">${overallPass ? 'ALL CHECKS PASS' : (anyError ? 'INCOMPLETE — SOME TABS NOT COMPUTED' : 'ONE OR MORE CHECKS FAIL')}</div>
    <div class="uc"><div class="val">${entries.filter(e=>e.status==='PASS').length}/${entries.length}</div><div class="lbl">TABS PASSING</div></div>
  </div>`;
  html += entries.map(e => {
    const cls = e.status === 'PASS' ? 'pass' : (e.status === 'FAIL' ? 'fail' : (e.status === 'INFO' ? 'info' : ''));
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
