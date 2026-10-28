// Summary report tab.
// Moved from app.js — function/const declarations only; event wiring stays in app.js.
import { getRadioVal } from '../core/dom.js?v=20261028c4';
import { lastResults } from '../core/state.js?v=20261028c4';
import { SCOPE_NA_LABEL, inScope } from '../workflow/scope.js?v=20261028c4';
import { generateReport } from '../report/builder.js?v=20261028c4';

export function buildQuickStatusHtml() {
  // 4A (shallow) and 4B (pile) are exclusive: the stability check of the other support is not part of this design
  const order = ['oneway', 'twoway', getRadioVal('fs-support') === 'pile' ? 'pile' : 'foundation', 'bearing', 'settlement', 'anchor', 'pedestalRebar', 'pileCapRebar'];
  // Checks taken out of scope in Section 00 are listed as NA (not counted), whatever their last computed status.
  const SCOPE_OF = { foundation: 'stability', pile: 'stability', settlement: 'settlement', oneway: 'structural', twoway: 'structural', pedestalRebar: 'structural', pileCapRebar: 'structural' };
  // Checks of the other support type (Tab 02 Shallow / Deep) do not apply — same rule as the 4A / 4B workflow status:
  // deep foundation -> shallow stability (4A) and soil bearing (08) are N/A; shallow -> pile stability (4B) is N/A.
  const isPile = getRadioVal('fs-support') === 'pile';
  const OTHER_SUPPORT = isPile ? { foundation: 'Shallow footing check — deep foundation selected (see 4B).', bearing: 'Shallow footing bearing — deep foundation selected (pile capacity in 4B).' }
    : { pile: 'Pile check — shallow foundation selected (see 4A).' };
  const entries = order.map(key => {
    const e = lastResults[key];
    const sc = SCOPE_OF[key];
    if (e && OTHER_SUPPORT[key]) return { ...e, status: 'NA', metric: 'N/A', detail: OTHER_SUPPORT[key] };
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
