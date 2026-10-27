// Printable report builder (sections, logos, document header).
// Moved from app.js — function/const declarations only; event wiring stays in app.js.
import { flushRecalc } from '../workflow/recalc.js?v=20261028a1';
import { escapeHtml, getRadioVal } from '../core/dom.js?v=20261028a1';
import { reportBlocks, state } from '../core/state.js?v=20261028a1';
import { buildQuickStatusHtml } from '../report/summary.js?v=20261028a1';

export function renderBlockList() {
  document.getElementById('rpt-block-body').innerHTML = reportBlocks.map((b, i) => `
    <tr>
      <td><input type="checkbox" class="rpt-include" data-i="${i}" ${b.include ? 'checked' : ''}></td>
      <td>${b.title}</td>
      <td>
        <button type="button" class="combo-remove rpt-up" data-i="${i}" ${i === 0 ? 'disabled' : ''} title="Move up">↑</button>
        <button type="button" class="combo-remove rpt-down" data-i="${i}" ${i === reportBlocks.length - 1 ? 'disabled' : ''} title="Move down">↓</button>
      </td>
      <td><input type="checkbox" class="rpt-pagebreak" data-i="${i}" ${b.pageBreak ? 'checked' : ''}></td>
    </tr>`).join('');
}
export function wireLogoUpload(inputId, previewId, setFn) {
  document.getElementById(inputId).addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setFn(ev.target.result);
      document.getElementById(previewId).innerHTML = `<img src="${ev.target.result}" style="max-height:60px;max-width:100%;border:1px solid var(--line);margin-top:6px;">`;
      generateReport();
    };
    reader.readAsDataURL(file);
  });
}
export function buildDocHeaderTable(title, rev) {
  const companyId = document.getElementById('rpt-companyDocId').value || '—';
  const contractorId = document.getElementById('rpt-contractorDocId').value || '—';
  const pages = document.getElementById('rpt-pages').value || '—';
  return `<table class="doc-header-table">
    <tr>
      <td rowspan="2" class="dh-logo">${state.rptLogo1 ? `<img src="${state.rptLogo1}">` : ''}</td>
      <td>Company Document ID<strong>${escapeHtml(companyId)}</strong></td>
      <td rowspan="2" class="dh-title">${escapeHtml(title)}</td>
      <td>No. of Pages<strong>${escapeHtml(pages)}</strong></td>
      <td rowspan="2" class="dh-logo">${state.rptLogo2 ? `<img src="${state.rptLogo2}">` : ''}</td>
    </tr>
    <tr>
      <td>Contractor Document ID<strong>${escapeHtml(contractorId)}</strong></td>
      <td>Revision Number<strong>${escapeHtml(rev)}</strong></td>
    </tr>
  </table>`;
}
export function generateReport() {
  flushRecalc(); // a debounced recalculation (large STAAD imports) must finish before the report reads the results
  const name = document.getElementById('rpt-project').value || 'Untitled Project';
  const loc = document.getElementById('rpt-location').value;
  const by = document.getElementById('rpt-by').value;
  const date = document.getElementById('rpt-date').value;
  const rev = document.getElementById('rpt-rev').value || '0';
  const useDocHeader = document.getElementById('rpt-use-docheader').checked;
  let html = '';
  if (useDocHeader) {
    html += buildDocHeaderTable(name, rev);
  } else {
    html += `<div class="report-header">
      <h2>Project Notes</h2>
      <div class="report-meta">
        ${loc ? `<span>Location/Client: ${escapeHtml(loc)}</span>` : ''}
        ${by ? `<span>Calculated by: ${escapeHtml(by)}</span>` : ''}
        ${date ? `<span>Date: ${escapeHtml(date)}</span>` : ''}
        <span>Rev: ${escapeHtml(rev)}</span>
      </div>
    </div>`;
  }
  html += `<div class="section-label">Overall Status</div>` + buildQuickStatusHtml();
  // 5A only with a pedestal (Tab 02); 5B blocks are named after the foundation type (pile cap / footing).
  const hasPed = getRadioVal('fs-type') === 'pedestal', shallow = getRadioVal('fs-support') !== 'pile';
  reportBlocks.filter(b => b.include && !(b.id === 'rebar' && !hasPed)).forEach(b => {
    let content;
    const title = shallow ? b.title.replace('Pile Cap Check', 'Footing Check') : b.title;
    if (b.id === 'loadcomb') {
      const factorsEl = document.getElementById('std-combo-factors');
      const topEl = document.getElementById('lc-summary-top'), botEl = document.getElementById('lc-summary-bottom');
      content = (factorsEl ? factorsEl.innerHTML : '')
        + (topEl ? `<div class="section-label" style="margin-top:16px;">Load at top of pedestal</div>${topEl.innerHTML}` : '')
        + (botEl ? `<div class="section-label" style="margin-top:16px;">Load at bottom of footing</div>${botEl.innerHTML}` : '');
      // LRFD results (pedestal base for 5A, footing bottom for 5B)
      const lrfdPedEl = document.getElementById('lrfd-summary-ped'), lrfdBotEl = document.getElementById('lrfd-summary-bottom');
      const lrfdTopEl = document.getElementById('lrfd-summary-top');
      content += (lrfdTopEl ? `<div class="section-label" style="margin-top:16px;">Load at top of pedestal (LRFD)</div>${lrfdTopEl.innerHTML}` : '');
      content += (lrfdPedEl ? `<div class="section-label" style="margin-top:16px;">Load at base of pedestal (LRFD)</div>${lrfdPedEl.innerHTML}` : '')
        + (lrfdBotEl ? `<div class="section-label" style="margin-top:16px;">Load at bottom of footing (LRFD)</div>${lrfdBotEl.innerHTML}` : '');
    } else {
      const el = document.getElementById('calc-' + b.id);
      content = el ? el.innerHTML : '';
    }
    html += `<div class="report-block ${b.pageBreak ? 'page-break-before' : ''}">
      <div class="section-label">${title}</div>
      ${content || '<div class="note">(no result yet — open this tab at least once first)</div>'}
    </div>`;
  });
  document.getElementById('calc-summary').innerHTML = html;
}
