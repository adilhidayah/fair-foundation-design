// 03 — Loading Data: load types, load values, live/equipment/wind/seismic entry, design load summary.
// Moved from app.js — function/const declarations only; event wiring stays in app.js.
import { DEFAULT_KIND_BY_CODE, LOAD_KINDS } from '../../lib/foundation/index.js?v=20260927b';
import { escapeHtml, getRadioVal, num } from '../core/dom.js?v=20260927b';
import { fmt } from '../core/format.js?v=20260927b';
import { comboState, state } from '../core/state.js?v=20260927b';
import { loadTransferDiagramSVG } from '../diagrams/loadTransferDiagram.js?v=20260927b';
import { buildStdComboBase, renderComboTable } from '../tabs/combos.js?v=20260927b';
import { recalcAll } from '../workflow/recalc.js?v=20260927b';

export const LC_LOADTYPE_DEFAULTS = {
  D: { P: 0 }, L: { P: 200 }, Lr: { P: 0 }, // D starts at 0 — the foundation self-weight ΔW is added separately
  WX: { H: 60, M: 90 }, WZ: { H: 60, M: 90 },
  'EQX(E)': { H: 45, M: 70 }, 'EQZ(E)': { H: 45, M: 70 }, 'EQX(O)': { H: 45, M: 70 }, 'EQZ(O)': { H: 45, M: 70 },
  W: { H: 60, M: 90 }, E: { H: 45, M: 70 }
};
// Registers a load type if it isn't already present (used by generator buttons — Wind/Seismic Apply, ASCE 7-16
// generators, Pipe Rack/Vessel/Tank "Generate combos" — before they write into that type's lc-<code>-P/H/M
// fields, so writing to a type that isn't in the default set doesn't throw on a missing element).
export function ensureLoadType(code, label, kind) {
  if (state.lcLoadTypes.some(lt => lt.code === code)) return;
  state.lcLoadTypes.push({ code, label, kind: kind || DEFAULT_KIND_BY_CODE[code] });
  renderLoadTypesTable();
  renderComboTable('lc');
}
// Load Types table only registers which load types are considered (code + label) — no values here.
// Rows are editable in place (✎ -> Save/Cancel). Built-in codes are special-cased by the calculations
// (buildStdComboBase, renderLoadSummary, equipment/live-load fields), so only their label can change; custom
// codes can be renamed too, carrying their combo factors and P/H/M values over to the new code.
export function isBuiltinLoadCode(code) {
  return ['D', 'L', 'Lr', 'E(E)', 'E(O)', 'E(T)', 'WX', 'WZ', 'EQX(E)', 'EQZ(E)', 'EQX(O)', 'EQZ(O)', 'W', 'E', 'T'].includes(code);
}
// Suggested kind for a custom code/label (engineer notation varies: "V" or "EQ" for seismic, "DL" for dead …).
// Only ever a SUGGESTION — shown next to the type dropdown for the user to confirm; never applied silently.
export function suggestKind(code, label) {
  const c = String(code || '').trim().toUpperCase(), t = String(label || '').toLowerCase();
  const zdir = /Z(\(.*\))?$/.test(c) || /\bz\b|z-dir|longitud/.test(t);
  if (/seism|earthq|quake|gempa/.test(t) || /^(EQ|V)[XZ]?(\(.*\))?$/.test(c)) return zdir ? 'eqZ' : 'eqX';
  if (/wind|angin/.test(t) || /^W[XZ]?$/.test(c)) return zdir ? 'windZ' : 'windX';
  if (/roof/.test(t) || c === 'LR') return 'roofLive';
  if (/live|hidup/.test(t) || /^L{1,2}$/.test(c)) return 'live';
  if (/equip|empty|operat|\btest\b/.test(t) || /^E\(/.test(c)) return 'equipment';
  if (/dead|self.?weight|mati/.test(t) || /^(D|DL|SW)$/.test(c)) return 'dead';
  if (/snow|salju|rain|hujan/.test(t)) return 'otherV';
  if (/therm|temperat|pipe|friction/.test(t) || c === 'T') return 'otherX';
  return '';
}
export function kindOptions(selected) {
  return `<option value=""${selected ? '' : ' selected'}>— select type —</option>` +
    Object.entries(LOAD_KINDS).map(([k, v]) => `<option value="${k}"${k === selected ? ' selected' : ''}>${escapeHtml(v.label)}</option>`).join('');
}
export function renderLoadTypesTable() {
  const editing = window.__ltEditingCode; // on window (not a top-level let) — this runs during early startup
  document.getElementById('lc-loadtype-body').innerHTML = state.lcLoadTypes.map(lt => {
    const c = escapeHtml(lt.code);
    // Type: fixed for built-in codes (their dialogs/generators assume it); a required dropdown for custom codes,
    // highlighted with a one-click suggestion while still unset.
    const builtin = isBuiltinLoadCode(lt.code);
    const sug = !lt.kind ? suggestKind(lt.code, lt.label) : '';
    const typeCell = builtin
      ? `<span class="clause">${escapeHtml(LOAD_KINDS[lt.kind]?.label || '—')}</span>`
      : `<select class="lc-loadtype-kind" data-code="${c}" aria-label="Load type of ${c}"${lt.kind ? '' : ' style="background:#FEF3C7;"'}>${kindOptions(lt.kind)}</select>
         ${sug ? `<button type="button" class="row-btn lc-loadtype-suggest" data-code="${c}" data-kind="${sug}" title="Use suggested type">Suggested: ${escapeHtml(LOAD_KINDS[sug].label)}</button>` : ''}`;
    if (lt.code === editing) {
      const locked = builtin;
      return `<tr class="row-editing">
        <td><input type="text" class="row-edit-input" id="lt-edit-label" value="${escapeHtml(lt.label)}" aria-label="Load type label"></td>
        <td><input type="text" class="row-edit-input" id="lt-edit-code" value="${c}" aria-label="Load type code" style="max-width:90px;"${locked ? ' disabled title="Built-in code — used by the calculations, only the label can be changed"' : ''}></td>
        <td>${typeCell}</td>
        <td class="row-actions"><button type="button" class="row-btn row-btn-save lc-loadtype-save" data-code="${c}" title="Save">✓</button><button type="button" class="row-btn lc-loadtype-cancel" title="Cancel">✕</button></td>
      </tr>`;
    }
    return `<tr>
      <td>${escapeHtml(lt.label)}</td>
      <td><span class="clause">${c}</span></td>
      <td>${typeCell}</td>
      <td class="row-actions"><button type="button" class="row-btn lc-loadtype-edit" data-code="${c}" title="Edit load type">✎</button><button type="button" class="combo-remove lc-loadtype-remove" data-code="${c}" title="Remove load type">•</button></td>
    </tr>`;
  }).join('');
  renderLoadValuesTable();
}
export function saveLoadTypeEdit(oldCode) {
  const lt = state.lcLoadTypes.find(t => t.code === oldCode);
  if (!lt) return;
  const labelEl = document.getElementById('lt-edit-label'), codeEl = document.getElementById('lt-edit-code');
  const newCode = isBuiltinLoadCode(oldCode) ? oldCode : codeEl.value.trim();
  if (!newCode) { codeEl.focus(); return; }
  if (newCode !== oldCode && state.lcLoadTypes.some(t => t.code === newCode)) { alert(`Load type code "${newCode}" already exists — pick a different code.`); codeEl.focus(); return; }
  if (newCode !== oldCode) {
    // Carry the P/H/M inputs (renderLoadValuesTable() re-reads them by id) and every combo factor to the new code.
    ['P', 'H', 'M'].forEach(f => { const el = document.getElementById(`lc-${oldCode}-${f}`); if (el) el.id = `lc-${newCode}-${f}`; });
    Object.values(comboState).forEach(list => list.forEach(combo => {
      if (Object.prototype.hasOwnProperty.call(combo.f, oldCode)) { combo.f[newCode] = combo.f[oldCode]; delete combo.f[oldCode]; }
    }));
    lt.code = newCode;
  }
  lt.label = labelEl.value.trim() || newCode;
  window.__ltEditingCode = null;
  renderLoadTypesTable();
  renderComboTable('lc');
  recalcAll();
}
// Maps the three Equipment load-type codes to the "Equipment Load (E)" section's kN inputs (Tab 03) — their
// P value is driven from there (already kN, no conversion) rather than typed directly, same pattern as ΔW from Tab 02.
export const EQUIPMENT_CODE_TO_FIELD = { 'E(E)': 'eq-load-ee', 'E(O)': 'eq-load-eo', 'E(T)': 'eq-load-et' };
// Load types with their own dedicated dialog box elsewhere in Tab 03 (already in kN, no unit conversion) — e.g.
// Live Load's own field. Whenever a load type is added that deserves its own section (not just a generic row in
// the Load Values table), add it here and give it a section in the HTML, following this same pattern.
export const DIRECT_CODE_TO_FIELD_KN = { 'L': 'll-load-p', 'Lr': 'lr-load-p' };
export function isLateralLoadType(lt) {
  const k = LOAD_KINDS[lt.kind];
  return !!k && k.dir !== 'V';
}
// Load Values table holds the actual P/H/M inputs, kept separate so registering a type doesn't force a value in.
// Existing values in the DOM are preserved across re-renders (only a brand-new type falls back to its default/0).
export function renderLoadValuesTable() {
  document.getElementById('lc-loadvalue-body').innerHTML = state.lcLoadTypes.map(lt => {
    const d = LC_LOADTYPE_DEFAULTS[lt.code] || {};
    const cur = (field, def) => { const el = document.getElementById(`lc-${lt.code}-${field}`); return el ? el.value : (def || 0); };
    const eqField = EQUIPMENT_CODE_TO_FIELD[lt.code];
    const directField = DIRECT_CODE_TO_FIELD_KN[lt.code];
    // Lateral types (wind / earthquake / other lateral X/Z) carry no vertical load: P is fixed at 0 and locked,
    // so no calculation (vector or scalar getLcLoads()) can pick up a stray P for them.
    const lateral = isLateralLoadType(lt);
    const pReadonly = (eqField || directField || lateral) ? ' readonly' : '';
    const pVal = lateral ? '0' : eqField ? num(eqField).toFixed(2) : directField ? num(directField).toFixed(2) : cur('P', d.P);
    return `<tr>
      <td>${escapeHtml(lt.label)}</td>
      <td><input type="number" class="lc-value-input" id="lc-${lt.code}-P" value="${pVal}"${pReadonly}${lateral ? ' title="Lateral load type — P = 0"' : ''}></td>
      <td><input type="number" class="lc-value-input" id="lc-${lt.code}-H" value="${cur('H', d.H)}"></td>
      <td><input type="number" class="lc-value-input" id="lc-${lt.code}-M" value="${cur('M', d.M)}"></td>
      ${lateral ? `<td class="clause" title="Direction fixed by the load type">—</td><td class="clause" title="Direction fixed by the load type">—</td>`
        : `<td><input type="number" class="lc-value-input" id="lc-${lt.code}-Hz" value="${cur('Hz', 0)}"></td>
      <td><input type="number" class="lc-value-input" id="lc-${lt.code}-Mx" value="${cur('Mx', 0)}"></td>`}
    </tr>`;
  }).join('');
  renderLoadCaseInputs();
}
// "Load Case" group (Tab 03 inputs): shows one input block per registered load type. Blocks tagged
// data-lc-codes appear only while one of their codes is registered; every other type (D, Lr, custom ...) gets
// P/H/M inputs here that write straight into its Load Values row (lc-<code>-P/H/M — the single source the
// calculations read), so no registered load is applied without a visible input, even while the Load Values
// group itself is hidden in Manual mode.
export function renderLoadCaseInputs() {
  // Declared inside (not top-level) so an early call during startup can't hit the const's TDZ.
  const LOAD_CASE_DEDICATED = new Set(['L', 'Lr', 'E(E)', 'E(O)', 'E(T)', 'WX', 'WZ', 'W', 'EQX(O)', 'EQZ(O)', 'E', 'EQX(E)', 'EQZ(E)']);
  const codes = new Set(state.lcLoadTypes.map(lt => lt.code));
  document.querySelectorAll('#in-loadcomb [data-lc-codes]').forEach(el => {
    el.style.display = el.dataset.lcCodes.split(',').some(c => codes.has(c)) ? '' : 'none';
  });
  // Refresh the 3.1.2 preview so the Lr row follows Lr being added/removed in Load Types (only after its first
  // render — this also runs during early startup, before renderLiveLoad()'s dependencies are initialized).
  if (window.__liveLoadReady) renderLiveLoad();
  const host = document.getElementById('lc-case-other');
  const hostD = document.getElementById('lc-case-D');
  if (!host) return;
  const val = (code, f) => { const el = document.getElementById(`lc-${code}-${f}`); return el ? el.value : '0'; };
  // Vertical types (Dead, Live, Equipment, Other-vertical) get their own biaxial H/M: Hx -> lc-<code>-H,
  // Hz -> -Hz, Mx -> -Mx, Mz -> lc-<code>-M. Lateral types keep one H/M (direction fixed by their type), P = 0.
  const block = lt => {
    const c = escapeHtml(lt.code);
    const lateral = isLateralLoadType(lt);
    const fields = lateral
      ? [['P', 'P', 'kN'], ['H', 'H', 'kN'], ['M', 'M', 'kN·m']]
      : [['P', 'P', 'kN'], ['H', 'H<sub>x</sub>', 'kN'], ['Hz', 'H<sub>z</sub>', 'kN'], ['Mx', 'M<sub>x</sub>', 'kN·m'], ['M', 'M<sub>z</sub>', 'kN·m']];
    const input = ([f, lbl, unit]) => `<div class="field" style="flex:1 1 ${lateral ? '0' : (f === 'P' ? '100%' : '40%')}; min-width:0;">
        <label for="lcx-${c}-${f}"><span>${lbl}</span> <span class="unit">${unit}</span></label>
        <input type="number" id="lcx-${c}-${f}" data-src="lc-${c}-${f}" value="${lateral && f === 'P' ? '0' : escapeHtml(val(lt.code, f))}" step="0.1"${lateral && f === 'P' ? ' readonly title="Lateral load type — P = 0"' : ''}>
      </div>`;
    return `<div class="gt-sub">${escapeHtml(lt.label)}</div>
      <div style="display:flex; gap:0 8px; flex-wrap:wrap;">${fields.map(input).join('')}</div>`;
  };
  // Dead Load (D) goes to the top of the Load Case group; every other non-dedicated type stays at the bottom.
  const others = state.lcLoadTypes.filter(lt => !LOAD_CASE_DEDICATED.has(lt.code));
  if (hostD) hostD.innerHTML = others.filter(lt => lt.code === 'D').map(block).join('');
  host.innerHTML = others.filter(lt => !(hostD && lt.code === 'D')).map(block).join('');
}
export function updateNewTypeSuggestion() {
  const sug = suggestKind(document.getElementById('lc-newtype-code').value, document.getElementById('lc-newtype-label').value);
  const kindEl = document.getElementById('lc-newtype-kind');
  document.getElementById('lc-newtype-suggest').innerHTML = sug && kindEl.value !== sug
    ? `Suggested type: <button type="button" class="row-btn" id="lc-newtype-use-suggest" data-kind="${sug}">${escapeHtml(LOAD_KINDS[sug].label)}</button> — confirm it matches your load.`
    : '';
  kindEl.style.background = kindEl.value ? '' : '#FEF3C7';
}
// its own dedicated dialog box instead of being buried as a generic row in the Load Values table/popup. ----------
// Roof Live Load (Lr) follows the same direct-entry pattern with its own preview table (3.1.3), shown only
// while Lr is registered in Load Types.
export function renderLiveLoad() {
  const P = num('ll-load-p'), Pr = num('lr-load-p');
  const hasLr = state.lcLoadTypes.some(lt => lt.code === 'Lr');
  const table = (caption, label, sym, v) => `<div class="overflow-x"><table class="dl-worksheet dl-aligned"><colgroup><col style="width:34%"><col style="width:12%"><col style="width:3%"><col style="width:11%"><col style="width:40%"></colgroup>
    <caption>${caption}</caption>
    <tr>
      <td class="dl-desc">${label}</td>
      <td class="dl-sym">${sym}</td>
      <td class="dl-eq">=</td>
      <td class="dl-val">${fmt(v,2)}</td>
      <td class="dl-unit">kN</td>
    </tr>
  </table></div>`;
  const container = document.getElementById('ll-load-preview');
  if (container) container.innerHTML = table('3.1.2. Live Load (L)', 'Live load,', 'L', P);
  const lrContainer = document.getElementById('lr-load-preview');
  if (lrContainer) lrContainer.innerHTML = hasLr ? table('3.1.3. Roof Live Load (Lr)', 'Roof live load,', 'Lr', Pr) : '';
  const lcL = document.getElementById('lc-L-P');
  if (lcL) lcL.value = P.toFixed(2);
  const lcLr = document.getElementById('lc-Lr-P');
  if (lcLr) lcLr.value = Pr.toFixed(2);
  if (typeof renderLoadSummary === 'function') renderLoadSummary();
}
export function renderEquipmentLoad() {
  const rows = [
    { label: 'Equipment empty load,', sym: 'E(E)', id: 'eq-load-ee' },
    { label: 'Equipment operating load,', sym: 'E(O)', id: 'eq-load-eo' },
    { label: 'Equipment test load,', sym: 'E(T)', id: 'eq-load-et' }
  ];
  const trs = rows.map(r => {
    const kN = num(r.id);
    return `<tr>
      <td class="dl-desc">${r.label}</td>
      <td class="dl-sym">${r.sym}</td>
      <td class="dl-eq">=</td>
      <td class="dl-val">${fmt(kN,2)}</td>
      <td class="dl-unit">kN</td>
    </tr>`;
  }).join('');
  document.getElementById('eq-load-preview').innerHTML = `<div class="overflow-x"><table class="dl-worksheet dl-aligned"><colgroup><col style="width:34%"><col style="width:12%"><col style="width:3%"><col style="width:11%"><col style="width:40%"></colgroup>
    <caption>3.1.4. Equipment Load (E)</caption>
    ${trs}
  </table></div>`;
  // Keep the read-only P fields in Load Values (if that type still exists) in sync, without a full table re-render.
  Object.entries(EQUIPMENT_CODE_TO_FIELD).forEach(([code, eqId]) => {
    const el = document.getElementById(`lc-${code}-P`);
    if (el) el.value = num(eqId).toFixed(2);
  });
  if (typeof renderLoadSummary === 'function') renderLoadSummary();
}
// Preview mirrors the Equipment Load (E) style (dl-worksheet, "mechanical datasheet" as the source) — live as you type.
export function windDirRow(label, sym, id) {
  const v = num(id);
  return `<tr>
    <td class="dl-desc">${label}</td>
    <td class="dl-sym">${sym}</td>
    <td class="dl-eq">=</td>
    <td class="dl-val">${fmt(v,2)}</td>
    <td class="dl-unit">${sym.includes('sub>M') || sym.startsWith('M') ? 'kN·m' : 'kN'}</td>
  </tr>`;
}
export function renderWindDirectPreview() {
  const container = document.getElementById('wl-direct-preview');
  if (!container) return;
  // Symbols follow the registered load case codes (WX, WZ): H = shear, M = moment of that load case.
  const trs = windDirRow('Wind shear, X-direction,', 'H<sub>WX</sub>', 'wl-direct-Fx')
    + windDirRow('Wind moment, X-direction,', 'M<sub>WX</sub>', 'wl-direct-Mz')
    + windDirRow('Wind shear, Z-direction,', 'H<sub>WZ</sub>', 'wl-direct-Fz')
    + windDirRow('Wind moment, Z-direction,', 'M<sub>WZ</sub>', 'wl-direct-Mx');
  container.innerHTML = `<div class="overflow-x"><table class="dl-worksheet dl-aligned"><colgroup><col style="width:34%"><col style="width:12%"><col style="width:3%"><col style="width:11%"><col style="width:40%"></colgroup>
    <caption>3.1.5. Wind Load (WX, WZ)</caption>
    ${trs}
  </table></div>`;
}
// Holds per-direction Fx/Mz (transversal) and Fz/Mx (longitudinal) for both conditions — set by manual "Apply"
// (asymmetric, whatever was actually typed) or by the ASCE 7-22 generator (isotropic, same Cs both directions).
// Always populated (never null) so the Design Load Summary has a single source to read, no separate fallback path.
export function seismicDirRow(label, sym, id) {
  const v = num(id);
  return `<tr>
    <td class="dl-desc">${label}</td>
    <td class="dl-sym">${sym}</td>
    <td class="dl-eq">=</td>
    <td class="dl-val">${fmt(v,2)}</td>
    <td class="dl-unit">${sym.startsWith('M') ? 'kN·m' : 'kN'}</td>
  </tr>`;
}
export function renderSeismicDirectPreview() {
  const container = document.getElementById('sg-direct-preview');
  if (!container) return;
  // Symbols follow the registered load case codes (EQX(O)/EQZ(O) operating, EQX(E)/EQZ(E) empty).
  // Empty condition first, then operating (same order as the E(E) -> E(O) equipment rows and LC111-116 -> 121-122).
  const trs = seismicDirRow('Seismic shear, empty, X-direction,', 'H<sub>EQX(E)</sub>', 'sg-direct-Fx-empty')
    + seismicDirRow('Seismic moment, empty, X-direction,', 'M<sub>EQX(E)</sub>', 'sg-direct-Mz-empty')
    + seismicDirRow('Seismic shear, empty, Z-direction,', 'H<sub>EQZ(E)</sub>', 'sg-direct-Fz-empty')
    + seismicDirRow('Seismic moment, empty, Z-direction,', 'M<sub>EQZ(E)</sub>', 'sg-direct-Mx-empty')
    + seismicDirRow('Seismic shear, operating, X-direction,', 'H<sub>EQX(O)</sub>', 'sg-direct-Fx')
    + seismicDirRow('Seismic moment, operating, X-direction,', 'M<sub>EQX(O)</sub>', 'sg-direct-Mz')
    + seismicDirRow('Seismic shear, operating, Z-direction,', 'H<sub>EQZ(O)</sub>', 'sg-direct-Fz')
    + seismicDirRow('Seismic moment, operating, Z-direction,', 'M<sub>EQZ(O)</sub>', 'sg-direct-Mx');
  container.innerHTML = `<div class="overflow-x"><table class="dl-worksheet dl-aligned"><colgroup><col style="width:34%"><col style="width:12%"><col style="width:3%"><col style="width:11%"><col style="width:40%"></colgroup>
    <caption>3.1.6. Seismic Load (EQ)</caption>
    ${trs}
  </table></div>`;
}
// Wind and Seismic each carry one shear/moment magnitude (direct entry or generator) and are reported once acting
// transversally (X: Fx, Mz) and once longitudinally (Z: Fz, Mx, sign-reversed) — the 100%-in-one-direction convention.
export function renderLoadSummary() {
  const container = document.getElementById('load-summary-container');
  if (!container) return;
  // Safe against D/L/W/E being removed from "Load Types" (Tab 03) — falls back to 0 instead of throwing.
  const numOr0 = (id) => { const el = document.getElementById(id); if (!el) return 0; const v = parseFloat(el.value); return isFinite(v) ? v : 0; };
  const dh = num('lc-dh'), dW = num('lc-dW');
  const EE = num('eq-load-ee'), EO = num('eq-load-eo'), ET = num('eq-load-et'); // kN
  const typeBase = buildStdComboBase();
  const vert = (label, P, dP) => ({ label, Fx: 0, Fz: 0, P, Mx: 0, Mz: 0, dP: dP || 0, dMz: 0, dMx: 0 });
  const trans = (label, H, M) => ({ label, Fx: H, Fz: 0, P: 0, Mx: 0, Mz: M, dP: 0, dMz: H * dh, dMx: 0 });
  const longi = (label, H, M) => ({ label, Fx: 0, Fz: H, P: 0, Mx: -M, Mz: 0, dP: 0, dMz: 0, dMx: -(H * dh) });
  // Built from "Load Types" (Tab 03) so it always matches what was actually registered/entered there — any
  // load type beyond the built-in Wind/Seismic special-cases (including a custom type, or Thermal, T) shows up
  // as a plain P/H/M row instead of being silently dropped. Equipment E/O/T inserted right before Wind (or at
  // the end if Wind was removed), matching the conventional row order in a design-load summary.
  // Equipment codes already registered in Load Types get their row from the generic branch below (lc-E(x)-P is
  // synced from the same ton inputs) — only the unregistered ones fall back to these, so nothing is listed twice.
  const registered = new Set(state.lcLoadTypes.map(lt => lt.code));
  const equipmentRows = [
    ['E(E)', vert('Equipment Empty weight (E(E))', EE)],
    ['E(O)', vert('Equipment Operation weight (E(O))', EO)],
    ['E(T)', vert('Equipment Test weight (E(T))', ET)]
  ].filter(([code]) => !registered.has(code)).map(([, row]) => row);
  let equipmentInserted = false;
  const rows = [];
  state.lcLoadTypes.forEach(lt => {
    if (lt.code === 'W') {
      if (!equipmentInserted) { rows.push(...equipmentRows); equipmentInserted = true; }
      // Direction-specific Fx/Fz from the ASCE 7-16 generator (different Asx/Asz) take priority; falls back to
      // one symmetric H/M (direct-entry from a datasheet, which only ever gives a single magnitude) otherwise.
      if (state.windDirState) {
        rows.push(trans('Wind Load (WX)', state.windDirState.Fx, state.windDirState.Mz));
        rows.push(longi('Wind Load (WZ)', state.windDirState.Fz, state.windDirState.Mx));
      } else {
        const H = numOr0('lc-W-H'), M = numOr0('lc-W-M');
        rows.push(trans('Wind Load (WX)', H, M));
        rows.push(longi('Wind Load (WZ)', H, M));
      }
    } else if (lt.code === 'E') {
      if (!equipmentInserted) { rows.push(...equipmentRows); equipmentInserted = true; }
      // Independent Fx/Mz (transversal) and Fz/Mx (longitudinal) per condition — from manual "Apply" (asymmetric,
      // whatever was typed) or the ASCE 7-22 generator (isotropic, same Cs both directions either way).
      rows.push(trans('Seismic Load, Empty (EQX(E))', state.seismicDirState.empFx, state.seismicDirState.empMz));
      rows.push(longi('Seismic Load, Empty (EQZ(E))', state.seismicDirState.empFz, state.seismicDirState.empMx));
      rows.push(trans('Seismic Load, Ope. (EQX(O))', state.seismicDirState.opeFx, state.seismicDirState.opeMz));
      rows.push(longi('Seismic Load, Ope. (EQZ(O))', state.seismicDirState.opeFz, state.seismicDirState.opeMx));
    } else {
      // Same per-type vector the combinations use (direction from the load type's kind, ΔW on the dead load),
      // so this table and 3.3 always agree — e.g. WZ / EQZ(x) land in Fz / Mx, not Fx / Mz.
      const v = typeBase[lt.code];
      rows.push(v ? { label: lt.label, ...v }
        : { label: `${lt.label} — no type, not included`, Fx: 0, Fz: 0, P: 0, Mx: 0, Mz: 0, dP: 0, dMz: 0, dMx: 0 });
    }
  });
  if (!equipmentInserted) rows.push(...equipmentRows);
  const buildTable = (caption, colHeader, bottom) => {
    const trs = rows.map(r => {
      const P = r.P + (bottom ? r.dP : 0), Mx = r.Mx + (bottom ? r.dMx : 0), Mz = r.Mz + (bottom ? r.dMz : 0);
      return `<tr><td>${r.label}</td><td class="num">${fmt(r.Fx,2)}</td><td class="num">${fmt(r.Fz,2)}</td><td class="num">${fmt(P,2)}</td><td class="num">${fmt(Mx,2)}</td><td class="num">${fmt(Mz,2)}</td></tr>`;
    }).join('');
    return `<div class="overflow-x"><table class="calc-table load-summary-table">
      <caption>${caption}</caption>
      <colgroup><col style="width:32%"><col style="width:13.6%"><col style="width:13.6%"><col style="width:13.6%"><col style="width:13.6%"><col style="width:13.6%"></colgroup>
      <tr><th>${colHeader}</th><th>F<sub>x</sub> <span class="unit">kN</span></th><th>F<sub>z</sub> <span class="unit">kN</span></th><th>P <span class="unit">kN</span></th><th>M<sub>x</sub> <span class="unit">kN·m</span></th><th>M<sub>z</sub> <span class="unit">kN·m</span></th></tr>
      ${trs}
    </table></div>`;
  };
  // Transfer formulas shown right above the bottom-of-footing table — mirror the row terms built above: D carries
  // dP = ΔW, each transversal (X) load dMz = Fx·Δh, each longitudinal (Z) load dMx = −Fz·Δh.
  const isPileSup = getRadioVal('fs-support') === 'pile';
  const cWord = isPileSup ? 'pile cap' : 'footing';
  const formula = `<div class="lc-formula">
    <div class="lc-formula-title">Load transfer from top of ${getRadioVal('fs-type') === 'pedestal' ? 'pedestal' : cWord} to bottom center of ${cWord}</div>
    ${loadTransferDiagramSVG(getRadioVal('fs-type') === 'pedestal', isPileSup, dh, dW)}
    <div>P<sub>bot</sub> = P<sub>top</sub> + ΔW  <span class="lc-formula-note">(Dead Load, D only)</span></div>
    <div>F<sub>x,bot</sub> = F<sub>x,top</sub> ; F<sub>z,bot</sub> = F<sub>z,top</sub></div>
    <div>M<sub>z,bot</sub> = M<sub>z,top</sub> + F<sub>x</sub> · Δh</div>
    <div>M<sub>x,bot</sub> = M<sub>x,top</sub> − F<sub>z</sub> · Δh</div>
    <div class="lc-formula-where">where ΔW = total dead load of foundation (3.1.1) = ${fmt(dW,2)} kN;
      Δh = top of pedestal to underside of ${cWord} = ${fmt(dh,3)} m.</div>
  </div>`;
  container.innerHTML = `<div class="section-label" style="margin-top:28px;">3.1.7 Summary of Design Load</div>
    ${buildTable('Summary of Design Load at top of pedestal — For Base Plate Calculation', 'For Base Plate Calculation', false)}
    ${formula}
    ${buildTable('Summary of Design Load at bottom of footing — For Foundation Calculation', 'For Foundation Calculation', true)}`;
}
