// 5B — Footing / Pile Cap Check: Focus Canvas view of the two shear checks (#focus-capcheck) — one canvas per check, stacked:
// 6.1 One-Way Shear and 6.2 Punching Shear, each with its own D/C badge, tiles and Plan / Elevation / Isometric 2.5D switcher.
// Shown instead of the A4 sheets of 6.1 / 6.2 while the preview is in Focus Canvas mode (css/app.css); Report Preview and print
// keep #calc-oneway / #calc-twoway. Builds markup only from lastResults.oneway.viz / lastResults.twoway.viz (set by calcOneWay() /
// calcTwoWay(), js/tabs/shear.js) — nothing is recomputed here. Declarations only; the click / hover wiring lives in app.js.
import { escapeHtml } from '../core/dom.js?v=20261014v';
import { fmt } from '../core/format.js?v=20261014v';
import { lastResults, state } from '../core/state.js?v=20261014v';
import { oneWayElevSVG, oneWayIsoSVG, oneWayPlanSVG, twoWayElevSVG, twoWayIsoSVG, twoWayPlanSVG } from '../diagrams/shearFocusDiagram.js?v=20261014v';

const VIEWS = [['plan', '📐', 'Plan View'], ['elev', '📏', 'Elevation View'], ['iso', '🧊', 'Isometric 2.5D']];
// The two canvases: key (also the data-sh-block value), section number, title, view kept in state, picture builders.
const BLOCKS = {
  oneway: { code: '6.1', title: 'One-way shear — ACI 318M-19 §22.5', viewKey: 'shViewOw', svg: [oneWayPlanSVG, oneWayElevSVG, oneWayIsoSVG] },
  twoway: { code: '6.2', title: 'Two-way (punching) shear — ACI 318M-19 §22.6', viewKey: 'shViewTw', svg: [twoWayPlanSVG, twoWayElevSVG, twoWayIsoSVG] }
};
const viewOf = (key) => (VIEWS.some(([k]) => k === state[BLOCKS[key].viewKey]) ? state[BLOCKS[key].viewKey] : 'plan');

// Switch one canvas's view in place (no re-render); state keeps it across the recalculations.
export function setShearFocusView(block, vw) {
  if (!BLOCKS[block] || !VIEWS.some(([k]) => k === vw)) return;
  state[BLOCKS[block].viewKey] = vw;
  const vp = document.querySelector(`#focus-capcheck .sh-viewport[data-sh-block="${block}"]`);
  if (!vp) return;
  vp.dataset.view = vw;
  vp.querySelectorAll('[data-sh-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.shView === vw)));
}

const tile = (label, value, sub) => `<div class="fz-tile"><div class="fz-tile-label">${label}</div><div class="fz-tile-value">${value}</div>${sub ? `<div class="fz-tile-sub">${sub}</div>` : ''}</div>`;
const nb = (t) => `<span class="fz-nb">${t}</span>`;
const SRC = { soil: 'net soil pressure, LRFD', piles: 'pile reactions, LRFD', manual: 'typed in' };

function blockHtml(key, fWord) {
  const B = BLOCKS[key], r = lastResults[key], one = key === 'oneway';
  const head = (tags) => `<div class="fz-head">
      <div><div class="fz-kicker">${B.code} · ${fWord} Check</div><div class="fz-title">${B.title}</div></div>
      <div class="fz-tags">${tags}</div>
    </div>`;
  if (!r || !r.viz) {
    return `<section class="fz sh-block">${head('<span class="fz-tag">Not computed</span>')}
      <div class="fz-card fz-alert bad">${escapeHtml(r && r.detail ? r.detail : 'This check has not been computed yet.')}</div></section>`;
  }
  const v = r.viz, view = viewOf(key);
  const dc = `<span class="fz-tag sh-dc ${v.pass ? 'ok' : 'bad'}" title="Demand / capacity ratio">D/C = ${fmt(v.uc, 3)} · ${v.pass ? 'PASS' : 'FAIL'}</span>`;
  const tiles = [
    tile(`${fWord} B<sub>f</sub> × L<sub>f</sub> × H<sub>f</sub>`, `${fmt(v.B, 2)} × ${fmt(v.L, 2)} × ${fmt(v.H, 2)}<span class="fz-unit">m</span>`,
      nb(`c<sub>1</sub> × c<sub>2</sub> = ${fmt(v.ped.c1 * 1000, 0)} × ${fmt(v.ped.c2 * 1000, 0)} mm`)),
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
  const id = (vw) => `shv-${key}-${vw}`;
  const svgs = B.svg.map((fn, i) => fn(v, id(VIEWS[i][0]))).join('');
  const viewBtns = VIEWS.map(([k, icon, lbl]) => `<button type="button" data-sh-block="${key}" data-sh-view="${k}" aria-pressed="${k === view}">${icon} ${lbl}</button>`).join('');
  return `<section class="fz sh-block">
    ${head(`<span class="fz-tag">${SRC[v.src]}</span>${dc}`)}
    <div class="fz-tiles">${tiles}</div>
    <div class="fz-extra">${extra.join(' · ')}</div>
    <div class="fz-card fz-diagram cad-viewport sh-viewport" data-sh-block="${key}" data-view="${view}">
      <div class="cad-switcher" role="group" aria-label="Viewport, ${B.code}">${viewBtns}</div>
      <div class="cad-stage sh-stage">${svgs}<div class="sh-tip" role="tooltip" hidden></div></div>
    </div>
  </section>`;
}

export function renderShearFocus() {
  const host = document.getElementById('focus-capcheck');
  if (!host) return;
  const anyViz = (lastResults.oneway && lastResults.oneway.viz) || (lastResults.twoway && lastResults.twoway.viz);
  const shallow = anyViz ? anyViz.shallow : document.querySelector('#fs-support button.sel')?.dataset.val !== 'pile';
  const fWord = shallow ? 'Footing' : 'Pile cap';
  host.innerHTML = blockHtml('oneway', fWord) + blockHtml('twoway', fWord)
    + `<div class="fz-note sh-foot">Hover the critical section, the tributary / punched area or the cone for details. Numbers are those of sections 6.1 / 6.2 (Report Preview).</div>`;
}

// Hover popover for elements with data-tip (delegated from app.js): positioned inside that canvas's stage, next to the pointer.
export function shearFocusHover(e) {
  const stage = e.target.closest && e.target.closest('#focus-capcheck .sh-stage');
  document.querySelectorAll('#focus-capcheck .sh-tip').forEach((t) => { if (!stage || !stage.contains(t)) t.hidden = true; });
  if (!stage) return;
  const box = stage.querySelector('.sh-tip');
  const el = e.target.closest('[data-tip]');
  if (!el) { box.hidden = true; return; }
  box.textContent = el.getAttribute('data-tip');
  box.hidden = false;
  const r = stage.getBoundingClientRect();
  const x = Math.min(e.clientX - r.left + 14, r.width - box.offsetWidth - 6), y = e.clientY - r.top + 14;
  box.style.left = `${Math.max(6, x)}px`; box.style.top = `${y}px`;
}
