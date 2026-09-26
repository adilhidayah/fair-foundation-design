// 00 — Equipment setup + foundation-type tab visibility + load input mode.
// Moved from app.js — function/const declarations only; event wiring stays in app.js.
import { getCategoryForEquipment, requiredChecksForCategory } from '../../lib/foundation/index.js?v=20260926k';
import { getRadioVal } from '../core/dom.js?v=20260926k';
import { renderLoadCaseInputs } from '../tabs/loading.js?v=20260926k';

// "4A — Foundation Stability" (shallow) and "4B — Pile Foundation Stability" are mutually exclusive — only the
// tab matching the selected Foundation Type (set in "01 — GENERAL INPUT DATA") is shown in the nav.
export const SHOW_BOTH_FOUNDATION_TABS = false;
export function updateFoundationTabVisibility() {
  const fdTab = document.querySelector('.tab[data-tab="foundation"]');
  const plTab = document.querySelector('.tab[data-tab="pile"]');
  if (!fdTab || !plTab) return;
  if (SHOW_BOTH_FOUNDATION_TABS) { fdTab.style.display = 'block'; plTab.style.display = 'block'; return; }
  const isPile = getRadioVal('fs-support') === 'pile';
  fdTab.style.display = isPile ? 'none' : 'block';
  plTab.style.display = isPile ? 'block' : 'none';
  // If the tab that just got hidden was the active one, switch to its now-visible sibling instead of leaving
  // the user on a blank panel.
  const active = document.querySelector('.tab.active');
  if (active && active.style.display === 'none') (isPile ? plTab : fdTab).click();
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
  renderLoadCaseInputs(); // pick up any values edited in the Load Values dialog
}
// Setup Equipment Logic (UX Journey 9.1 — visual cards + dynamic adaptation)
export function updateEquipmentSetup() {
  const eqType = getRadioVal('eq-type');
  const statusEl = document.getElementById('setup-status');
  document.getElementById('in-piperack').style.display = 'none';
  document.getElementById('in-vessel').style.display = 'none';
  document.getElementById('in-tank').style.display = 'none';
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
    helperNote = 'Sum per-bolt P/H + thermal thrust into Tab 03 — bolt-map helper pending.';
  } else {
    // Generic mode leaves foundation choice as is.
  }
  let cat = 'static';
  try {
    const c = getCategoryForEquipment(eqType);
    if (c) cat = c;
  } catch (e) {}
  let checks = ['bearing', 'stability', 'settlement', 'pedestal', 'footing'];
  try {
    const rc = requiredChecksForCategory(cat);
    if (rc && rc.length) checks = rc;
  } catch (e) {}
  const lbl = { bearing: 'bearing capacity', stability: 'stability (OT/slide)', settlement: 'settlement', pedestal: 'pedestal + anchor', footing: 'footing shear/flexure', vibration: 'vibration (resonance + amplitude)', dynamicForce: 'dynamic force (1x/2x + mass ratio)', twoDirectionStability: 'two-direction stability (L and T)', anchorConcentration: 'anchor concentration' };
  const lis = checks.map(c => '<li><strong>' + (lbl[c] || c) + '</strong></li>').join('');
  statusEl.innerHTML = `<div class="verdict">
    <div class="stamp">${title}</div>
    <div class="uc"><div class="lbl">${desc}</div></div>
  </div>
  <div class="limits-box"><strong>Library category:</strong> ${cat}<br><strong>Recommended foundation:</strong> ${foundRec}<br>${helperNote}</div>
  <div class="section-label" style="margin-top:14px;">Relevant checks</div>
  <ul class="eq-checks">${lis}</ul>`;
}
