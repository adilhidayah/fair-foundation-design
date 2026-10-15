// Deferred rendering of heavy result panels. The calc*() functions write their report HTML into #calc-* / #focus-* panels
// (and the Tab 03 summary tables) on every recalculation, although only the panels of the open tab can be seen. With 100+ load
// combinations those panels hold ~35 000 nodes, and building / styling them on every keystroke was the main cost (the
// calculations themselves take ~60-100 ms). Here a write to a panel whose tab is not open is kept as a string and applied when
// its tab opens (setActiveTab) or before printing. Reading .innerHTML (the report builder, `el.innerHTML += ...`) returns the
// latest string either way, so callers need no change. Display only — nothing in lib/ or in the results depends on it.
const TAB_OF = {
  'calc-summary': 'summary', 'calc-foundation': 'foundation', 'calc-pile': 'pile', 'calc-anchor': 'anchor',
  'calc-oneway': 'capcheck', 'calc-twoway': 'capcheck', 'calc-rebarcap': 'capcheck', 'calc-rebar': 'pedcheck',
  'focus-foundation': 'foundation', 'focus-pile': 'pile', 'focus-capcheck': 'capcheck', 'focus-loading': 'loadingdata',
  'lc-summary-top': 'loadingdata', 'lc-summary-bottom': 'loadingdata',
  'lrfd-summary-top': 'loadingdata', 'lrfd-summary-ped': 'loadingdata', 'lrfd-summary-bottom': 'loadingdata'
};
const desc = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
const pending = new Map(); // element -> html not yet applied
let activeTab = 'setup';

function apply(el) {
  if (!pending.has(el)) return;
  const html = pending.get(el);
  pending.delete(el);
  desc.set.call(el, html);
}
export function installLazyPanels() {
  Object.keys(TAB_OF).forEach((id) => {
    const el = document.getElementById(id);
    if (!el || Object.prototype.hasOwnProperty.call(el, 'innerHTML')) return;
    Object.defineProperty(el, 'innerHTML', {
      configurable: true,
      get() { return pending.has(el) ? pending.get(el) : desc.get.call(el); },
      set(v) { if (TAB_OF[id] === activeTab) { pending.delete(el); desc.set.call(el, v); } else pending.set(el, String(v)); }
    });
  });
  // Printing / saving as PDF renders every panel that is not display:none — make them all current first.
  window.addEventListener('beforeprint', () => { pending.forEach((_, el) => apply(el)); });
}
// Called by the tab click handler (app.js) after the tab is made active.
export function setActiveTab(tab) {
  activeTab = tab;
  Object.keys(TAB_OF).forEach((id) => { if (TAB_OF[id] === tab) { const el = document.getElementById(id); if (el) apply(el); } });
}
