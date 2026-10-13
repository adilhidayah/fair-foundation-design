// Preview mode switch at the top of every preview column (".results" / ".ld-results"):
//   canvas — Focus Canvas: no A4 width/margins or page headers, full-width diagrams, governing status badge;
//   report — Report Preview: the A4 paper layout (what prints).
// Declarations only — injection at startup and event wiring live in app.js. Print always uses the report
// layout (the canvas CSS is screen-only).
import { escapeHtml } from '../core/dom.js?v=20261013d';
import { getGoverningStatus } from '../workflow/status.js?v=20261013d';

export const VIEW_MODE_KEY = 'fair_fdn_view_mode';
export const VIEW_MODES = ['canvas', 'report'];
const PREVIEW_COLUMNS = '.results, .ld-results';

export function getSavedViewMode() {
  try {
    const v = localStorage.getItem(VIEW_MODE_KEY);
    return VIEW_MODES.includes(v) ? v : 'report';
  } catch (e) { return 'report'; }
}
// Adds the switcher bar at the top of every preview column (idempotent).
export function injectViewSwitchers() {
  document.querySelectorAll(PREVIEW_COLUMNS).forEach((pane) => {
    if (pane.querySelector(':scope > .view-switcher-bar')) return;
    const bar = document.createElement('div');
    bar.className = 'view-switcher-bar';
    bar.innerHTML = '<button type="button" class="vs-inputs" data-sidebar-set="expanded" title="Show input panel">▶ Inputs</button>' +
      '<div class="vs-modes" role="group" aria-label="Preview mode">' +
        '<button type="button" data-mode="canvas" aria-pressed="false">Focus Canvas</button>' +
        '<button type="button" data-mode="report" aria-pressed="false">Report Preview</button>' +
      '</div><span class="vs-badge"></span>' +
      '<button type="button" class="vs-status" data-rp-set="expanded" title="Show status panel">◀ Status</button>';
    pane.prepend(bar);
  });
}
export function setViewMode(mode, persist = true) {
  const next = VIEW_MODES.includes(mode) ? mode : 'report';
  // 00 — Equipment Setup has no report page: its preview is always the Focus Canvas (its mode buttons are hidden in css/app.css).
  document.querySelectorAll(PREVIEW_COLUMNS).forEach((p) => { p.dataset.view = p.closest('#in-setup') ? 'canvas' : next; });
  document.querySelectorAll('.view-switcher-bar [data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === next)));
  if (persist) { try { localStorage.setItem(VIEW_MODE_KEY, next); } catch (e) {} }
}
// Governing status badge — repeats what the checks already reported (getGoverningStatus), never recomputes.
// notReady: the Design Status panel is in its first-time-entry state, so results from untouched defaults are not shown.
export function renderGoverningBadges(notReady = false) {
  const badges = document.querySelectorAll('.view-switcher-bar .vs-badge');
  if (!badges.length) return;
  let cls = 'pending', head = 'NOT READY', sub = 'Complete the inputs to run the checks';
  if (!notReady) {
    const g = getGoverningStatus();
    const gov = g.governing ? 'Governing: ' + g.governing.label + ' · UC ' + g.governing.ucText : '';
    if (g.status === 'FAIL') { cls = 'fail'; head = 'FAIL'; sub = g.fails + ' of ' + g.total + ' checks fail' + (gov ? ' · ' + gov : ''); }
    else if (g.status === 'PASS') { cls = 'pass'; head = 'ALL PASS'; sub = gov || (g.done + ' of ' + g.total + ' checks pass'); }
    else if (g.status === 'INCOMPLETE') { head = 'INCOMPLETE'; sub = g.done + ' of ' + g.total + ' checks computed' + (gov ? ' · ' + gov : ''); }
    else { head = 'PENDING'; sub = 'No check computed yet'; }
  }
  const html = '<span class="vs-badge-head">' + escapeHtml(head) + '</span><span class="vs-badge-sub">' + escapeHtml(sub) + '</span>';
  badges.forEach((b) => { b.className = 'vs-badge ' + cls; b.innerHTML = html; });
}
