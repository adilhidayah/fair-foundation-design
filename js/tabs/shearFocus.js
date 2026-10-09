// 5B — Footing / Pile Cap Check: Focus Canvas view of the two shear checks (#focus-capcheck). Shown instead of the A4 sheets of
// 6.1 / 6.2 while the preview is in Focus Canvas mode (css/app.css); Report Preview and print keep #calc-oneway / #calc-twoway.
// Builds markup only from lastResults.oneway.viz / lastResults.twoway.viz (set by calcOneWay() / calcTwoWay(), js/tabs/shear.js)
// — nothing is recomputed here. Declarations only; the click / hover wiring lives in app.js.
import { escapeHtml } from '../core/dom.js?v=20261009q';
import { fmt } from '../core/format.js?v=20261009q';
import { lastResults, state } from '../core/state.js?v=20261009q';
import { oneWayElevSVG, oneWayIsoSVG, oneWayPlanSVG, twoWayElevSVG, twoWayIsoSVG, twoWayPlanSVG } from '../diagrams/shearFocusDiagram.js?v=20261009q';

const MODES = [['oneway', 'One-Way Shear'], ['twoway', 'Two-Way (Punching) Shear']];
const VIEWS = [['plan', '📐', 'Plan View'], ['elev', '📏', 'Elevation View'], ['iso', '🧊', 'Isometric 2.5D']];

// Switch the check (re-render) or the view (in place); both are kept in state across the recalculations.
export function setShearFocusMode(m) {
  if (!MODES.some(([k]) => k === m)) return;
  state.shMode = m;
  renderShearFocus();
}
export function setShearFocusView(vw) {
  if (!VIEWS.some(([k]) => k === vw)) return;
  state.shView = vw;
  const vp = document.querySelector('#focus-capcheck .sh-viewport');
  if (!vp) return;
  vp.dataset.view = vw;
  vp.querySelectorAll('[data-sh-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.shView === vw)));
}

const tile = (label, value, sub) => `<div class="fz-tile"><div class="fz-tile-label">${label}</div><div class="fz-tile-value">${value}</div>${sub ? `<div class="fz-tile-sub">${sub}</div>` : ''}</div>`;
const nb = (t) => `<span class="fz-nb">${t}</span>`;
const SRC = { soil: 'net soil pressure, LRFD', piles: 'pile reactions, LRFD', manual: 'typed in' };

export function renderShearFocus() {
  const host = document.getElementById('focus-capcheck');
  if (!host) return;
  const mode = MODES.some(([k]) => k === state.shMode) ? state.shMode : 'oneway';
  const view = VIEWS.some(([k]) => k === state.shView) ? state.shView : 'plan';
  const r = mode === 'oneway' ? lastResults.oneway : lastResults.twoway;
  const fWord = (r && r.viz ? r.viz.shallow : document.querySelector('#fs-support button.sel')?.dataset.val !== 'pile') ? 'Footing' : 'Pile cap';
  const modeBtns = MODES.map(([k, lbl]) => `<button type="button" data-sh-mode="${k}" aria-pressed="${k === mode}">${lbl}</button>`).join('');
  const head = (tag) => `<div class="fz-head">
      <div><div class="fz-kicker">5B · ${fWord} Check — Shear</div><div class="fz-title">${mode === 'oneway' ? 'One-way shear — ACI 318M-19 §22.5' : 'Two-way (punching) shear — ACI 318M-19 §22.6'}</div></div>
      <div class="fz-tags">${tag}</div>
    </div>
    <div class="cad-switcher sh-modes" role="group" aria-label="Shear check">${modeBtns}</div>`;
  if (!r || !r.viz) {
    host.innerHTML = `<div class="fz">${head('<span class="fz-tag">Not computed</span>')}
      <div class="fz-card fz-alert bad">${escapeHtml(r && r.detail ? r.detail : 'This check has not been computed yet.')}</div></div>`;
    return;
  }
  const v = r.viz;
  const dc = `<span class="fz-tag sh-dc ${v.pass ? 'ok' : 'bad'}" title="Demand / capacity ratio">D/C = ${fmt(v.uc, 3)} · ${v.pass ? 'PASS' : 'FAIL'}</span>`;
  const one = mode === 'oneway';
  const tiles = [
    tile(`${fWord} B<sub>f</sub> × L<sub>f</sub> × H<sub>f</sub>`, `${fmt(v.B, 2)} × ${fmt(v.L, 2)} × ${fmt(v.H, 2)}<span class="fz-unit">m</span>`,
      `${nb(`c<sub>1</sub> × c<sub>2</sub> = ${fmt(v.ped.c1 * 1000, 0)} × ${fmt(v.ped.c2 * 1000, 0)} mm`)}`),
    tile('Effective depth d', `${fmt(v.d * 1000, 0)}<span class="fz-unit">mm</span>`, nb(`d = H<sub>f</sub> − cc − d<sub>b</sub> = ${fmt(v.H * 1000, 0)} − ${fmt(v.cc * 1000, 0)} − ${fmt(v.db * 1000, 0)}`)),
    tile('Factored shear V<sub>u</sub>', `${fmt(v.Vu, 1)}<span class="fz-unit">kN</span>`, `${SRC[v.src]}${v.combo ? ` · ${nb(escapeHtml(v.combo.split(' — ')[0]))}` : ''}`),
    one
      ? tile('Capacity φV<sub>c</sub>', `${fmt(v.phiVc, 1)}<span class="fz-unit">kN</span>`, nb(`D/C = V<sub>u</sub> / φV<sub>c</sub> = ${fmt(v.uc, 3)}`))
      : tile('Stress v<sub>u</sub> / φv<sub>c</sub>', `${fmt(v.vu, 3)} / ${fmt(v.phiVcStress, 3)}<span class="fz-unit">MPa</span>`, `${nb(`φV<sub>c</sub> = ${fmt(v.phiVc, 1)} kN`)} · ${nb('incl. unbalanced moment')}`)
  ].join('');
  const extra = one
    ? [`Sections ⟂ ${v.axis === 'x' ? 'x (width b<sub>w</sub> along z)' : 'z (width b<sub>w</sub> along x)'} at d from the pedestal faces`, `b<sub>w</sub> = ${fmt(v.bw, 0)} mm, ${v.method} V<sub>c</sub>`]
    : [`${v.loc} section, α<sub>s</sub> = ${v.alphaS}`, `b<sub>o</sub> = ${fmt(v.bo * 1000, 0)} mm at d/2 from the pedestal faces`];
  if (v.w > 0) extra.push(`net pressure: footing + backfill w = ${fmt(v.w, 2)} kPa deducted`);
  const svgs = one
    ? oneWayPlanSVG(v, 'shv-plan') + oneWayElevSVG(v, 'shv-elev') + oneWayIsoSVG(v, 'shv-iso')
    : twoWayPlanSVG(v, 'shv-plan') + twoWayElevSVG(v, 'shv-elev') + twoWayIsoSVG(v, 'shv-iso');
  const viewBtns = VIEWS.map(([k, icon, lbl]) => `<button type="button" data-sh-view="${k}" aria-pressed="${k === view}">${icon} ${lbl}</button>`).join('');
  host.innerHTML = `<div class="fz">
    ${head(`<span class="fz-tag">${SRC[v.src]}</span>${dc}`)}
    <div class="fz-tiles">${tiles}</div>
    <div class="fz-extra">${extra.join(' · ')}</div>
    <div class="fz-card fz-diagram cad-viewport sh-viewport" data-view="${view}">
      <div class="cad-switcher" role="group" aria-label="Viewport">${viewBtns}</div>
      <div class="cad-stage sh-stage">${svgs}<div class="sh-tip" role="tooltip" hidden></div></div>
    </div>
    <div class="fz-note">Hover the critical section, the tributary / punched area or the cone for details. Numbers are those of sections 6.1 / 6.2 (Report Preview).</div>
  </div>`;
}

// Hover popover for elements with data-tip (delegated from app.js): positioned inside the stage, next to the pointer.
export function shearFocusHover(e) {
  const stage = e.target.closest && e.target.closest('#focus-capcheck .sh-stage');
  if (!stage) return;
  const box = stage.querySelector('.sh-tip');
  const el = e.target.closest('[data-tip]');
  if (!el || e.type === 'mouseleave') { box.hidden = true; return; }
  box.textContent = el.getAttribute('data-tip');
  box.hidden = false;
  const r = stage.getBoundingClientRect();
  const x = Math.min(e.clientX - r.left + 14, r.width - box.offsetWidth - 6), y = e.clientY - r.top + 14;
  box.style.left = `${Math.max(6, x)}px`; box.style.top = `${y}px`;
}
