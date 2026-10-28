// Deferred rendering of heavy result panels. The calc*() functions write their report HTML into #calc-* / #focus-* panels
// (and the Tab 03 summary tables) on every recalculation, although only the panels of the open tab can be seen. With 100+ load
// combinations those panels hold ~35 000 nodes, and building / styling them on every keystroke was the main cost (the
// calculations themselves take ~60-100 ms). Here a write to a panel whose tab is not open is kept as a string and applied when
// its tab opens (setActiveTab) or before printing. Reading .innerHTML (the report builder, `el.innerHTML += ...`) returns the
// latest string either way, so callers need no change. Display only — nothing in lib/ or in the results depends on it.
const TAB_OF = {
  'calc-summary': 'summary', 'calc-foundation': 'foundation', 'calc-pile': 'pile', 'calc-anchor': 'anchor',
  'calc-oneway': 'capcheck', 'calc-twoway': 'capcheck', 'calc-rebarcap': 'capcheck', 'calc-platformcap': 'capcheck', 'calc-rebar': 'pedcheck',
  'focus-foundation': 'foundation', 'focus-pile': 'pile', 'focus-capcheck': 'capcheck', 'focus-loading': 'loadingdata', 'focus-settlement': 'settlement', 'focus-anchor': 'anchor', 'focus-pedestal': 'pedcheck',
  'lc-summary-top': 'loadingdata', 'lc-summary-bottom': 'loadingdata',
  'lrfd-summary-top': 'loadingdata', 'lrfd-summary-ped': 'loadingdata', 'lrfd-summary-bottom': 'loadingdata'
};
const desc = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
const raw = new Map();     // element -> the full HTML last written (what .innerHTML returns, what the report builder reads)
const pending = new Map(); // element -> { html (display version), s (full HTML) } not yet applied
const shown = new WeakMap(); // element -> the full HTML its DOM currently shows
const openTables = new Set(); // 'panel#n' of long tables the user expanded; survives re-renders
let activeTab = 'setup';

// Long tables (one row per load combination: 100+ rows) are shown with their first rows on screen and a "Show all N rows" button;
// the full table stays in the DOM text of .innerHTML (reports) and prints in full. This is the display version only.
const LONG_ROWS = 40, SHOWN_ROWS = 21; // SHOWN_ROWS must match the nth-child(n+22) rule in css/app.css
function collapseLong(html, id) {
  let k = 0;
  return html.replace(/<table\b[^>]*>[\s\S]*?<\/table>/g, (t) => {
    const n = (t.match(/<tr\b/g) || []).length;
    k += 1;
    if (n <= LONG_ROWS) return t;
    const key = id + '#' + k, open = openTables.has(key);
    // A failing row must never hide behind the button: count the NG / FAIL rows among the collapsed ones and say so on it.
    const bad = t.split(/<tr\b/).slice(SHOWN_ROWS + 1).filter((r) => />\s*(NG|FAIL)\s*</.test(r) || /class="[^"]*\bfail\b/.test(r)).length;
    const more = 'Show all ' + (n - 1) + ' rows' + (bad ? ' — ' + bad + ' failing hidden' : '');
    return t.replace('<table', '<table data-lt="' + key + '"' + (open ? ' data-lt-open' : '')) +
      '<div class="lt-bar"><button type="button" class="lt-more' + (bad ? ' lt-bad' : '') + '" data-lt-key="' + key + '" data-more="' + more.replace(/"/g, '&quot;') + '">' +
      (open ? 'Show first ' + (SHOWN_ROWS - 1) + ' rows' : more) + '</button></div>';
  });
}
function apply(el) {
  if (!pending.has(el)) return;
  const { html, s } = pending.get(el);
  pending.delete(el);
  desc.set.call(el, html);
  shown.set(el, s);
}
export function installLazyPanels() {
  Object.keys(TAB_OF).forEach((id) => {
    const el = document.getElementById(id);
    if (!el || Object.prototype.hasOwnProperty.call(el, 'innerHTML')) return;
    Object.defineProperty(el, 'innerHTML', {
      configurable: true,
      get() { return raw.has(el) ? raw.get(el) : desc.get.call(el); },
      set(v) {
        const s = String(v);
        raw.set(el, s);
        // The DOM already shows exactly this HTML (e.g. reopening Summary with no change): skip collapseLong, the parse and the layout.
        if (shown.get(el) === s) { pending.delete(el); return; }
        const html = collapseLong(s, id);
        if (TAB_OF[id] === activeTab) { pending.delete(el); desc.set.call(el, html); shown.set(el, s); } else pending.set(el, { html, s });
      }
    });
  });
  // Printing / saving as PDF renders every panel that is not display:none — make them all current first.
  window.addEventListener('beforeprint', () => { pending.forEach((_, el) => apply(el)); });
  // "Show all N rows" / "Show first rows" under a long table.
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('.lt-more');
    if (!b) return;
    const key = b.dataset.ltKey, t = b.parentElement.previousElementSibling;
    if (!t || t.dataset.lt !== key) return;
    const open = !openTables.has(key);
    if (open) openTables.add(key); else openTables.delete(key);
    t.toggleAttribute('data-lt-open', open);
    b.textContent = open ? 'Show first ' + (SHOWN_ROWS - 1) + ' rows' : b.dataset.more;
  });
}
// Called by the tab click handler (app.js) after the tab is made active.
export function setActiveTab(tab) {
  activeTab = tab;
  Object.keys(TAB_OF).forEach((id) => { if (TAB_OF[id] === tab) { const el = document.getElementById(id); if (el) apply(el); } });
}
