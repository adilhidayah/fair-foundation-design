// Load points on the pile cap or the shallow footing (Tab 02, "Footing Only" or with a pedestal per point): several equipment / base
// plates / skid runners on one footing or cap.
// The list lives in state.loadPointList; this module renders its table and says whether multi-point mode is active.
// Mode off (or one point and Single selected) = the single load point of the pedestal model, unchanged.
import { getRadioVal } from '../core/dom.js?v=20261028a4';
import { loadPointList } from '../core/state.js?v=20261028a4';

// Multi-point statics apply to a pile cap (4B group load, 5B pile reactions) and to a shallow footing (4A group resultant, 5B soil
// pressure with the points netted): without a pedestal each point is a base plate / skid runner on the footing or cap; with pedestals
// (Footing / Pile Cap + Pedestal) each point is a pedestal of size c1 × c2 (same height as Tab 02) designed on its own in 5A and 09.
export function loadPointsActive() {
  const g = document.getElementById('fs-lp-mode');
  return !!g && ['block', 'pedestal'].includes(getRadioVal('fs-type')) && getRadioVal('fs-lp-mode') === 'multi' && loadPointList.length > 0;
}
// Several load points AND a pedestal under each of them.
export function loadPointsPedestals() {
  return loadPointsActive() && getRadioVal('fs-type') === 'pedestal';
}
// Points in the form lib/foundation/shared/loadPoints.js takes (m).
export function activeLoadPoints() {
  return loadPointsActive() ? loadPointList.map(p => ({ x: p.x, y: p.y, c1: p.c1, c2: p.c2, share: p.share })) : null;
}
export function renderLoadPointTable() {
  const body = document.getElementById('lp-list');
  if (!body) return;
  const FIELDS = [['x', 'x', 0.05], ['y', 'z', 0.05], ['c1', 'c₁', 0.05], ['c2', 'c₂', 0.05], ['share', 'Share', 0.1]];
  body.innerHTML = loadPointList.map((p, i) => `
    <div class="lp-card">
      <div class="lp-head"><span>Load point ${i + 1}</span><button type="button" class="combo-remove" data-i="${i}" title="Remove load point">•</button></div>
      <div class="lp-grid">${FIELDS.map(([f, lbl, st]) => `<label>${lbl}<input type="number" step="${st}" class="lp-input" data-i="${i}" data-f="${f}" value="${p[f]}"></label>`).join('')}</div>
    </div>`).join('');
  const sum = loadPointList.reduce((s, p) => s + (p.share > 0 ? p.share : 0), 0);
  const note = document.getElementById('lp-share-note');
  if (note) note.textContent = loadPointList.length ? `Shares are normalised: ${loadPointList.map(p => (sum > 0 ? 100 * Math.max(p.share, 0) / sum : 100 / loadPointList.length).toFixed(1) + '%').join(' / ')}.` : 'No load points — add at least one.';
}
