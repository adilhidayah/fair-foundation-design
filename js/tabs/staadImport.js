// 03 — Import of STAAD support reactions per combination (.std + .ANL) into the load model (Support Reaction mode, STAAD sign).
// Declarations only — wiring in app.js. The conversion is staadReactionCombos() (lib/foundation/import/staadImport.js): five unit load
// types FY / FX / FZ / MX / MZ whose combination factors are the reactions of the chosen node, D with the dead-load factor kD (foundation
// self-weight of Tab 02), TMP marking the combinations with a STAAD Wind / Seismic case (temporary). Nothing is computed here.
import { staadReactionCombos } from '../../lib/foundation/index.js?v=20261015p';
import { escapeHtml } from '../core/dom.js?v=20261015p';
import { comboState, state } from '../core/state.js?v=20261015p';
import { renderLoadTypesTable, renderLoadCaseInputs } from '../tabs/loading.js?v=20261015p';
import { renderComboTable } from '../tabs/combos.js?v=20261015p';
import { recalcAll } from '../workflow/recalc.js?v=20261015p';

const msg = (html, bad = false) => { const el = document.getElementById('sti-msg'); if (el) { el.className = bad ? 'warn-box' : 'note'; el.innerHTML = html; } };

// After a file is chosen: keep its text (state.staadImport) and, once the .ANL is there, list the support nodes.
export function readStaadImportFile(which, file) {
  return new Promise((resolve) => {
    if (!file) { resolve(); return; }
    const rd = new FileReader();
    rd.onload = () => { state.staadImport[which] = String(rd.result || ''); state.staadImport[which + 'Name'] = file.name; refreshStaadImportNodes(); resolve(); };
    rd.readAsText(file);
  });
}
export function refreshStaadImportNodes() {
  const sel = document.getElementById('sti-node');
  if (!sel || !state.staadImport.anl) return;
  const r = staadReactionCombos({ std: state.staadImport.std, anl: state.staadImport.anl });
  if (!r.ok && !r.nodes) { sel.innerHTML = ''; msg(escapeHtml(r.error), true); return; }
  const nodes = r.nodes || [];
  const keep = sel.value;
  sel.innerHTML = nodes.map((n) => `<option value="${n}">${n}</option>`).join('');
  if (nodes.map(String).includes(keep)) sel.value = keep;
  msg(`${escapeHtml(state.staadImport.anlName || '.ANL')}: support reactions of ${nodes.length} node(s)${state.staadImport.std ? `, ${escapeHtml(state.staadImport.stdName || '.std')} read` : ' — choose the .std too (combination factors, dead / wind / seismic cases)'}.`);
}
// Replace the load types and both combination sets by the imported ones (the previous Tab 03 loads are discarded).
export function applyStaadImport() {
  const S = state.staadImport;
  if (!S.std || !S.anl) { msg('Choose both the .std and the .ANL file first.', true); return null; }
  const val = (id) => (document.getElementById(id) || {}).value || '';
  const r = staadReactionCombos({ std: S.std, anl: S.anl, node: val('sti-node'), lcAsd: val('sti-asd'), lcLrfd: val('sti-lrfd') });
  if (!r.ok) { msg(escapeHtml(r.error), true); return r; }
  if (!r.lc.length) { msg('No ASD combination of the list has a reaction at this node — check the node and the list.', true); return r; }
  // Support Reaction mode, STAAD sign (the unit loads are typed as STAAD reactions)
  ['ld-mode:reaction', 'ld-sign:staad'].forEach((s) => { const [g, v] = s.split(':'); const b = document.querySelector(`#${g} button[data-val="${v}"]`); if (b && !b.classList.contains('sel')) b.click(); });
  state.lcLoadTypes = r.loadTypes.map(({ code, label, kind }) => ({ code, label, kind }));
  renderLoadTypesTable();   // also the Load Values rows (lc-<code>-*)
  r.loadTypes.forEach((lt) => ['P', 'H', 'M', 'Hz', 'Mx'].forEach((f) => { const el = document.getElementById(`lc-${lt.code}-${f}`); if (el && !el.readOnly) el.value = String(lt.values[f] ?? 0); }));
  renderLoadCaseInputs();
  comboState.lc = r.lc.map(({ lc, name, f }) => ({ lc, name, f }));
  comboState.lrfd = r.lrfd.map(({ lc, name, f }) => ({ lc, name, f }));
  renderComboTable('lc');
  recalcAll();
  const miss = [...r.missing.asd, ...r.missing.lrfd];
  msg(`Imported node ${r.node}: <strong>${r.lc.length} ASD</strong> and <strong>${r.lrfd.length} LRFD</strong> combinations (${r.lc.filter((c) => c.temporary).length + r.lrfd.filter((c) => c.temporary).length} temporary — STAAD Wind / Seismic), dead case ${r.dead ?? '—'} (k<sub>D</sub> on the foundation self-weight). Reactions from the last table of the .ANL, KN / METER.`
    + (miss.length ? ` <strong>No reaction for L/C ${miss.join(', ')}</strong> — left out.` : ''), false);
  return r;
}
