// Collapsible input panel (the left ".inputs" / ".ld-inputs" column of every tab).
// Declarations only — injection at startup and event wiring live in app.js.
// Two states on ".layout-wrapper[data-sidebar]": expanded (full input panel) and collapsed (hidden; the preview takes the
// full width, "▶ Inputs" in the preview bar brings it back). The preference is kept per browser. (The former "compact" code
// strip was removed on request — a saved "compact" falls back to expanded.)
import { escapeHtml } from '../core/dom.js?v=20261025a';

export const SIDEBAR_KEY = 'fair_fdn_sidebar_state';
export const SIDEBAR_STATES = ['expanded', 'collapsed'];
const INPUT_COLUMNS = '.body-grid > .inputs, .ld-grid > .ld-inputs';

export function getSavedSidebarState() {
  try {
    const v = localStorage.getItem(SIDEBAR_KEY);
    return SIDEBAR_STATES.includes(v) ? v : 'expanded';
  } catch (e) { return 'expanded'; }
}
// Adds the control strip at the top of every input column (idempotent).
export function injectSidebarRails() {
  document.querySelectorAll(INPUT_COLUMNS).forEach((col) => {
    if (col.querySelector(':scope > .sidebar-rail')) return;
    const rail = document.createElement('div');
    rail.className = 'sidebar-rail';
    rail.innerHTML = '<div class="sr-controls">' +
      '<button type="button" class="sr-btn sr-shrink" data-sidebar-step="shrink" title="Hide input panel" aria-label="Hide input panel">◀</button>' +
      '</div>';
    col.prepend(rail);
  });
  syncSidebarRails();
}
// Main preview (centre) columns that get the Previous / Next bar: Tab 00, the shared column of Tabs 01-11, and Tab 03's — not
// the pipe rack / vessel / tank guidance columns inside Tab 03 (that tab already has its own bar in .ld-results).
const NAV_COLUMNS = '#in-setup .body-grid > .results, .main-content > .body-grid > .results, .ld-grid > .ld-results';
// Sticky Previous / Next section bar at the bottom of each main preview column (idempotent); filled by syncSidebarRails().
export function injectSectionNavs() {
  document.querySelectorAll(NAV_COLUMNS).forEach((col) => {
    if (col.querySelector(':scope > .section-nav')) return;
    const nav = document.createElement('nav');
    nav.className = 'section-nav';
    nav.setAttribute('aria-label', 'Previous / next section');
    col.append(nav);
  });
  syncSidebarRails();
}
// "GENERAL INPUT DATA" -> "General Input Data" (keeps short all-caps tokens like 4A / 08B as they are).
const titleCase = (t) => t.toLowerCase().replace(/(^|[\s(\/-])([a-z])/g, (m, p, c) => p + c.toUpperCase());
// The Previous / Next bar mirrors the visible ribbon tabs (4A / 4B follow the Support
// selection), in ribbon order.
export function syncSidebarRails() {
  const tabs = [...document.querySelectorAll('.sidebar-menu .tab')].filter((t) => t.style.display !== 'none');
  const i = tabs.findIndex((t) => t.classList.contains('active'));
  const navBtn = (t, dir) => {
    if (!t) return '<span class="sn-spacer"></span>';
    const code = (t.querySelector('.tab-code')?.textContent || '').trim();
    const name = titleCase((t.querySelector('.tab-label')?.textContent || '').trim());
    return '<button type="button" class="sn-btn sn-' + dir + '" data-go-tab="' + escapeHtml(t.dataset.tab) + '" title="' + escapeHtml(code + ' — ' + name) + '">' +
      '<span class="sn-dir">' + (dir === 'prev' ? '← Previous' : 'Next →') + '</span>' +
      '<span class="sn-name"><span class="sn-code">' + escapeHtml(code) + '</span> ' + escapeHtml(name) + '</span></button>';
  };
  const navHtml = i < 0 ? '' : navBtn(tabs[i - 1], 'prev') + navBtn(tabs[i + 1], 'next');
  document.querySelectorAll('.section-nav').forEach((n) => { n.innerHTML = navHtml; });
}
export function setSidebarState(s, persist = true) {
  const next = SIDEBAR_STATES.includes(s) ? s : 'expanded';
  const wrap = document.querySelector('.layout-wrapper');
  if (!wrap) return;
  wrap.dataset.sidebar = next;
  document.querySelectorAll('.view-switcher-bar .vs-inputs').forEach((b) => b.setAttribute('aria-expanded', String(next !== 'collapsed')));
  if (persist) { try { localStorage.setItem(SIDEBAR_KEY, next); } catch (e) {} }
}
// Right status panel: expanded | collapsed on ".layout-wrapper[data-rpanel]", kept per browser like the input panel.
export const RPANEL_KEY = 'fair_fdn_rightpanel_state';
export function getSavedRightPanelState() {
  try { return localStorage.getItem(RPANEL_KEY) === 'collapsed' ? 'collapsed' : 'expanded'; } catch (e) { return 'expanded'; }
}
export function setRightPanelState(s, persist = true) {
  const next = s === 'collapsed' ? 'collapsed' : 'expanded';
  const wrap = document.querySelector('.layout-wrapper');
  if (!wrap) return;
  wrap.dataset.rpanel = next;
  document.querySelectorAll('.view-switcher-bar .vs-status').forEach((b) => b.setAttribute('aria-expanded', String(next !== 'collapsed')));
  if (persist) { try { localStorage.setItem(RPANEL_KEY, next); } catch (e) {} }
}
// "◀": hide the input panel.
export function shrinkSidebar() {
  setSidebarState('collapsed');
}
