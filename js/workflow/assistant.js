// Right panel: DESIGN STATUS | ASSISTANT drawer.
// Moved from app.js — function/const declarations only; event wiring stays in app.js.

// Plan: AI_ASSISTANT_PLAN.md. Closed = plain Live Design Status; open = same 240 px panel with a two-tab toggle
// (no width change, so the calculation preview never shrinks).
import { setRightPanelState } from '../ui/sidebar.js?v=20261028s3';

export function setRightPanelView(view) {
  const panel = document.getElementById('right-panel');
  panel.dataset.view = view;
  panel.querySelectorAll('.rp-tab').forEach(t => t.setAttribute('aria-selected', String(t.dataset.view === view)));
}
export function updateAssistantContext() {
  const tab = document.querySelector('.sidebar-menu .tab.active');
  const code = tab?.querySelector('.tab-code')?.textContent.trim() || '';
  const label = tab?.querySelector('.tab-label')?.textContent.trim() || '—';
  document.getElementById('as-context-tab').textContent = (code ? code + ' — ' : '') + label;
}
export function setAssistantOpen(open) {
  const panel = document.getElementById('right-panel');
  panel.classList.toggle('assistant-open', open);
  document.getElementById('ai-assistant-toggle').setAttribute('aria-expanded', String(open));
  if (open) { setRightPanelView('assistant'); updateAssistantContext(); setRightPanelState('expanded'); } // un-hide a hidden panel
}
