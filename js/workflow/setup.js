// 00 — Equipment setup + foundation-type tab visibility + load input mode.
// Moved from app.js — function/const declarations only; event wiring stays in app.js.
import { getCategoryForEquipment, requiredChecksForCategory } from '../../lib/foundation/index.js?v=20261025a';
import { getRadioVal } from '../core/dom.js?v=20261025a';
import { renderLoadCaseInputs } from '../tabs/loading.js?v=20261025a';
import { equipmentDiagramSVG } from '../diagrams/equipmentDiagram.js?v=20261025a';

// "4A — Foundation Stability" (shallow) and "4B — Pile Foundation Stability" are mutually exclusive — only the
// tab matching the selected Foundation Type (set in "01 — GENERAL INPUT DATA") is shown in the nav.
export const SHOW_BOTH_FOUNDATION_TABS = false;
// "Load points" (several equipment / skid runners on one footing or pile cap): offered for a pile cap and a shallow footing, with or
// without pedestals (one pedestal per point).
export function syncLoadPointBox() {
  const el = document.getElementById('fs-lp-fields');
  if (el) el.style.display = ['block', 'pedestal'].includes(getRadioVal('fs-type')) ? '' : 'none';
  const isPile = getRadioVal('fs-support') === 'pile';
  const sum = document.getElementById('fs-lp-summary');
  if (sum) sum.textContent = isPile ? 'Load Points (several equipment on the cap)' : 'Load Points (several equipment / skid runners on the footing)';
  const note = document.getElementById('fs-lp-note');
  if (note) note.innerHTML = isPile
    ? 'Each point is a base plate / skid on the cap (x, z = centre from the cap centre, m; c<sub>1</sub> × c<sub>2</sub> = size along x × along z, m). The superstructure loads of Section 03 are shared out by "Share"; the cap weight acts at the cap centre. 4B uses the statically equivalent group load; 5B checks flexure, one-way and punching shear at every point and governs on the worst (the other points\' loads beyond a section are netted against the pile reactions).'
    : 'Each point is a base plate / skid runner on the footing (x, z = centre from the footing centre, m; c<sub>1</sub> × c<sub>2</sub> = size along x × along z, m — a runner is a long narrow strip). The superstructure loads of Section 03 are shared out by "Share"; the footing (and backfill) weight is uniform. 4A uses the group resultant about the footing centre; 5B takes the soil pressure of that resultant and checks flexure at the faces of every point and across the spans between them (hogging between runners), one-way shear at d and punching at d/2 from every point, the other points\' loads beyond a section netted.';
}
export function updateFoundationTabVisibility() {
  sync5BSources();
  syncPedestalTab();
  const fdTab = document.querySelector('.tab[data-tab="foundation"]');
  const plTab = document.querySelector('.tab[data-tab="pile"]');
  if (!fdTab || !plTab) return;
  if (SHOW_BOTH_FOUNDATION_TABS) { fdTab.style.display = ''; plTab.style.display = ''; return; }
  const isPile = getRadioVal('fs-support') === 'pile';
  fdTab.style.display = isPile ? 'none' : ''; // '' keeps the tab's flex layout (code + label gap); 'block' glued them ("4BPILE")
  plTab.style.display = isPile ? '' : 'none';
  // 5B follows the support: pile cap check (pile reactions) or footing check (soil pressure) — label, notes and the V_u source choices.
  const setTxt = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
  const show = (id, on) => { const el = document.getElementById(id); if (el) el.style.display = on ? '' : 'none'; };
  setTxt('capcheck-tab-label', isPile ? 'PILE CAP CHECK' : 'FOOTING CHECK');
  // 08B follows the support: pile group settlement (Vesic) for piles, the elastic / consolidation settlement of a footing otherwise.
  // Load points: several equipment on one footing / pile cap.
  syncLoadPointBox();
  show('st-shallow-box', !isPile); show('st-diff-box', !isPile); show('st-pile-box', isPile);
  setTxt('settlement-tab-label', isPile ? 'PILE SETTLEMENT' : 'SETTLEMENT (SOIL)');
  setTxt('rb-summary-label', isPile ? 'Pile Cap Flexure' : 'Footing Flexure');
  show('rb-note-piles', isPile); show('rb-note-soil', !isPile);
  ['ow-vu-src', 'tw-vu-src'].forEach(id => {
    const g = document.getElementById(id); if (!g) return;
    const soilBtn = g.querySelector('button[data-val="soil"]'), pileBtn = g.querySelector('button[data-val="piles"]'), manBtn = g.querySelector('button[data-val="manual"]');
    if (soilBtn) soilBtn.style.display = isPile ? 'none' : '';
    if (pileBtn) pileBtn.style.display = isPile ? '' : 'none';
    const sel = g.querySelector('button.sel');
    // switching the support moves the V_u source to the one that exists for it (a pile source has no meaning for a footing and vice versa)
    const want = isPile ? (sel && sel.dataset.val === 'soil' ? manBtn : null) : (sel && sel.dataset.val === 'soil' ? null : soilBtn);
    if (want && want !== sel) { g.querySelectorAll('button').forEach(b => b.classList.remove('sel')); want.classList.add('sel'); }
  });
  // If the tab that just got hidden was the active one, switch to its now-visible sibling instead of leaving
  // the user on a blank panel.
  const active = document.querySelector('.tab.active');
  if (active && active.style.display === 'none') (isPile ? plTab : fdTab).click();
}
// 5B follows the foundation type: the V_u source "From pile reactions" is offered for a pile cap, "From soil pressure" for a
// shallow footing (a hidden selection is moved to its counterpart; shear.js maps them the same way), and the tab is named
// accordingly.
export function sync5BSources() {
  const isPile = getRadioVal('fs-support') === 'pile';
  ['ow-vu-src', 'tw-vu-src'].forEach(id => {
    const g = document.getElementById(id);
    if (!g) return;
    const show = { piles: isPile, soil: !isPile };
    g.querySelectorAll('button').forEach(b => { if (b.dataset.val in show) b.style.display = show[b.dataset.val] ? '' : 'none'; });
    const sel = g.querySelector('button.sel');
    if (sel && sel.style.display === 'none') {
      sel.classList.remove('sel');
      g.querySelector(`button[data-val="${isPile ? 'piles' : 'soil'}"]`).classList.add('sel');
    }
  });
  const lbl = document.querySelector('.tab[data-tab="capcheck"] .tab-label');
  if (lbl) lbl.textContent = isPile ? 'PILE CAP CHECK' : 'FOOTING CHECK';
}
// "5A — Pedestal Check" only exists with a pedestal: hidden for "Footing Only" (Tab 02 fs-type = block); if it was the active tab,
// move to 5B. Its result is NA then (calcRebar()), so it is left out of the status counts.
export function syncPedestalTab() {
  const tab = document.querySelector('.tab[data-tab="pedcheck"]');
  if (!tab) return;
  const hasPed = getRadioVal('fs-type') === 'pedestal';
  tab.style.display = hasPed ? '' : 'none';
  if (!hasPed && tab.classList.contains('active')) {
    const cap = document.querySelector('.tab[data-tab="capcheck"]');
    if (cap) cap.click();
  }
}
// "Support Reaction" mode hides the per-component worksheets (Equipment/Wind/Seismic direct entry + popup
// generators) — those exist to help build up unfactored per-load-type values from mechanical/vendor datasheet
// components, which is redundant once you already have the combined reaction straight from a structural
// model run. Load Types, the direct Load Values table, and the footing self-weight top->bottom transfer stay
// visible either way, since the model's reaction is still at the top of pedestal, not bottom of footing.
export function toggleLoadInputMode() {
  const isReaction = getRadioVal('ld-mode') === 'reaction';
  document.getElementById('ld-manual-fields').style.display = isReaction ? 'none' : 'block';
  // Load Values (per-type P/H/M from the structural model) is only offered for Support Reaction input.
  document.getElementById('lc-values-group').style.display = isReaction ? '' : 'none';
  // The sign convention of the typed values (FAIR / STAAD reactions) only exists for typed Support Reaction values.
  const signField = document.getElementById('ld-sign-field');
  if (signField) {
    signField.style.display = isReaction ? '' : 'none';
    const staad = getRadioVal('ld-sign') === 'staad';
    document.getElementById('ld-sign-note-fair').style.display = staad ? 'none' : '';
    document.getElementById('ld-sign-note-staad').style.display = staad ? '' : 'none';
  }
  renderLoadCaseInputs(); // pick up any values edited in the Load Values dialog
}
// Setup Equipment Logic (UX Journey 9.1 — visual cards + dynamic adaptation)
export function updateEquipmentSetup() {
  const eqType = getRadioVal('eq-type');
  const statusEl = document.getElementById('setup-status');
  document.getElementById('in-piperack').style.display = 'none';
  document.getElementById('in-vessel').style.display = 'none';
  document.getElementById('in-tank').style.display = 'none';
  const skidBox = document.getElementById('skid-sup-box');
  if (skidBox) skidBox.style.display = eqType === 'skid' ? '' : 'none';
  const saddleField = document.getElementById('eq-saddle-field');
  if (saddleField) saddleField.style.display = (eqType === 'horizontal_vessel') ? 'block' : 'none';
  let title = 'GENERIC MODE';
  let desc = 'Ready for all generic foundation calculations';
  let foundRec = 'Footing + Pedestal or Block — choice in Tab 02.';
  let helperNote = 'Use the generic D/L/W/E/T load matrix in Tab 03.';
  const fsTypeField = document.getElementById('fs-type').parentElement;
  fsTypeField.style.display = 'block';
  const clickFs = (val) => {
    const btn = document.querySelector('#fs-type button[data-val="' + val + '"]');
    if (btn && !btn.classList.contains('sel')) btn.click();
  };
  if (eqType === 'piperack') {
    title = 'PIPE RACK FOUNDATION';
    desc = 'Optimized for multiple column reactions, wind on piping, and thermal expansion forces. Pipe Rack base reactions are now available in "03 — LOADING DATA".';
    document.getElementById('in-piperack').style.display = 'block';
    clickFs('pedestal');
    foundRec = 'Footing + Pedestal per pier (Tab 02) — iterative sizing closes self-weight loop.';
    helperNote = 'Pipe-rack helper in Tab 03: thermal split L-dir/T-dir, combos in both directions.';
  } else if (eqType === 'vertical_vessel' || eqType === 'horizontal_vessel') {
    title = eqType === 'vertical_vessel' ? 'VERTICAL VESSEL / TOWER' : 'HORIZONTAL VESSEL / EXCHANGER';
    desc = 'Vessel base reactions are now available in "03 — LOADING DATA".';
    if (eqType === 'horizontal_vessel') desc += ' Saddle distance Ls (left panel) recorded for saddle-span helper.';
    document.getElementById('in-vessel').style.display = 'block';
    clickFs('pedestal');
    foundRec = 'Footing + Pedestal (octagonal/round ideal) — overturning usually governs.';
    helperNote = 'Vessel helper in Tab 03: D / Do / W / E base reactions (static module).';
  } else if (eqType === 'tank') {
    title = 'STORAGE TANK';
    desc = 'Tank base reactions are now available in "03 — LOADING DATA".';
    document.getElementById('in-tank').style.display = 'block';
    clickFs('block');
    foundRec = 'Block / ringwall slab (Tab 02 Block mode, API 650) — product governs bearing.';
    helperNote = 'Tank helper in Tab 03: D / product / test-water / W / E. Check uplift.';
  } else if (eqType === 'pump') {
    title = 'ROTATING EQUIPMENT';
    desc = 'Pump/compressor/turbine on massive block. Static loads via generic matrix; F0 vendor input for vibration check.';
    clickFs('block');
    foundRec = 'Concrete block, mass ratio block/machine >= 3. Tune fn clear of fOp +-20%.';
    helperNote = 'Tab 03 matrix for D/L/W/E. F0 = m*e*w^2 + vibration check — helper UI pending.';
  } else if (eqType === 'pistonCompressor') {
    title = 'RECIPROCATING EQUIPMENT';
    desc = 'Piston compressor / diesel engine on heavy block. 1x + 2x rpm forces govern.';
    clickFs('block');
    foundRec = 'Large rigid block, mass ratio >= 5. Check 1x and 2x resonance + amplitude.';
    helperNote = 'Tab 03 matrix for D/L/W/E. F1/F2 + M1/M2 dynamic — helper UI pending.';
  } else if (eqType === 'skid') {
    title = 'SKID PACKAGE UNIT';
    desc = 'Skid-mounted package: bolt reactions summed to footing-top resultants.';
    clickFs('block');
    foundRec = 'Slab = skid footprint + 2x edge (ACI 318 Ch.17 ca1).';
    helperNote = 'Tab 03 Equipment Load: support reactions per base plate / runner → E(E) / E(O) / E(T) + Tab 02 load points ("Apply").';
  } else {
    // Generic mode leaves foundation choice as is.
  }
  let cat = 'static', mapped = false;
  try {
    const c = getCategoryForEquipment(eqType);
    if (c) { cat = c; mapped = true; }
  } catch (e) {}
  let checks = ['bearing', 'stability', 'settlement', 'pedestal', 'footing'];
  try {
    const rc = requiredChecksForCategory(cat);
    if (rc && rc.length) checks = rc;
  } catch (e) {}
  const base = requiredChecksForCategory('static');
  const lis = checks.map((c) => {
    const info = CHECK_INFO[c] || { label: c };
    const code = info.tab ? checkTabCode(info.tab) : '—';
    const extra = !base.includes(c);
    const tag = info.pending ? '<span class="ep-tag pending">' + info.pending + '</span>' : (extra ? '<span class="ep-tag">+ ' + cat + '</span>' : '');
    const attrs = info.tab ? ' data-check-tab="' + info.tab + '" title="Open ' + code + '"' : ' disabled title="' + (info.pending || '') + '"';
    return '<li><button type="button" class="ep-check' + (extra ? ' extra' : '') + '"' + attrs + '>' +
      '<span class="ep-code">' + code + '</span><span class="ep-name">' + info.label + '</span>' + tag + '</button></li>';
  }).join('');
  const pills = (EQ_CODES[eqType] || EQ_CODES.generic).map((c) => '<span class="ep-pill">' + c + '</span>').join('') +
    (EQ_CRITERIA[eqType] ? '<span class="ep-pill crit">' + EQ_CRITERIA[eqType] + '</span>' : '');
  statusEl.innerHTML = `<div class="eq-profile">
    <div class="ep-head">
      <div><div class="ep-kicker">Equipment profile</div><div class="ep-title">${title}</div><div class="ep-desc">${desc}</div></div>
      <span class="ep-cat" title="${mapped ? 'Library category (dispatcher)' : 'Not mapped in the library dispatcher — static assumed'}">${cat}${mapped ? '' : ' (default)'}</span>
    </div>
    <div class="ep-body">
      <div class="ep-diagram">${equipmentDiagramSVG(eqType)}</div>
      <div class="ep-side">
        <div class="ep-sub">Applicable codes</div>
        <div class="ep-pills">${pills}</div>
        <div class="ep-sub">Required engineering checks</div>
        <ul class="ep-checks">${lis}</ul>
      </div>
    </div>
    <div class="limits-box"><strong>Recommended foundation:</strong> ${foundRec}<br>${helperNote}</div>
  </div>`;
}
// Shown on the 00 profile card only — display text, no check reads these.
const EQ_CODES = {
  generic: ['ACI 318M-19', 'ASCE 7-22'],
  vertical_vessel: ['PIP STE02900', 'ACI 318M-19'],
  horizontal_vessel: ['PIP STE02910', 'ACI 318M-19'],
  tank: ['API 650', 'ACI 318M-19'],
  piperack: ['PIP STC01015', 'ASCE 7-22'],
  pump: ['ACI 351.3R', 'API 610'],
  pistonCompressor: ['ACI 351.3R', 'API 618'],
  skid: ['PIP STC01015', 'ACI 318M-19']
};
// Same minimum as the minMassRatio defaults of rotating/ and reciprocating/ foundationSizing().
const EQ_CRITERIA = { pump: 'Mass ratio ≥ 3.0', pistonCompressor: 'Mass ratio ≥ 5.0' };
// requiredChecksForCategory() keys -> label + the tab where the check is done ('stability' = 4A or 4B by Support).
// pending: no UI for it yet (js/workflow/setup.js helperNote) — shown, not linked.
const CHECK_INFO = {
  bearing: { label: 'Bearing capacity', tab: 'bearing' },
  stability: { label: 'Stability (overturning / sliding)', tab: 'stability' },
  settlement: { label: 'Settlement', tab: 'settlement' },
  pedestal: { label: 'Pedestal + anchor', tab: 'pedcheck' },
  footing: { label: 'Footing / pile cap shear + flexure', tab: 'capcheck' },
  vibration: { label: 'Vibration (resonance + amplitude)', pending: 'Helper UI pending' },
  dynamicForce: { label: 'Dynamic force (1x / 2x rpm + mass ratio)', pending: 'Helper UI pending' },
  twoDirectionStability: { label: 'Two-direction stability (L and T)', tab: 'loadingdata' },
  anchorConcentration: { label: 'Anchor concentration', tab: 'anchor', pending: 'Bolt-map helper pending' }
};
export function resolveCheckTab(tab) {
  return tab === 'stability' ? (getRadioVal('fs-support') === 'pile' ? 'pile' : 'foundation') : tab;
}
function checkTabCode(tab) {
  if (tab === 'stability') return '4A/4B';
  const el = document.querySelector('.sidebar-menu .tab[data-tab="' + tab + '"] .tab-code');
  return el ? el.textContent.trim() : '—';
}
