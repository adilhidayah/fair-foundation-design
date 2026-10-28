// 08B: display-only settlement views. Functions are declared here; event wiring stays in app.js.
import { escapeHtml } from '../core/dom.js?v=20261028c4';
import { fmt } from '../core/format.js?v=20261028c4';
import { state } from '../core/state.js?v=20261028c4';
import { settlementDiagramSVG, settlementSummarySVG } from '../diagrams/settlementDiagram.js?v=20261028c4';

const VIEWS = ['overlay', 'before', 'after'];
export function setSettlementFocusView(view) {
  if (!VIEWS.includes(view)) return;
  state.stView = view;
  const viewport = document.querySelector('#focus-settlement .st-viewport');
  if (!viewport) return;
  viewport.dataset.view = view;
  viewport.querySelectorAll('[data-st-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.stView === view)));
}

export function settlementReportVisualHTML(v) {
  if (!v) return '';
  return `<div class="st-report-visual"><h3 class="sub-title">Settlement visualization</h3>
    ${settlementDiagramSVG(v)}${settlementSummarySVG(v)}
    <div class="note">Movement is amplified for illustration; no deformation field or settlement over time is calculated.${v.kind === 'pile' ? ' S₁/S₂/S₃ are single-pile components; Sg includes the group factor.' : ' Differential settlement is the user estimate, not a calculated tilt.'}</div></div>`;
}

export function settlementFocusHTML(result) {
  const v = result?.viz;
  if (!v) return `<section class="fz"><div class="fz-head"><div><div class="fz-kicker">08B · Settlement</div><div class="fz-title">Visualization unavailable</div></div>
    <span class="fz-tag bad">${escapeHtml(result?.status || 'NOT COMPUTED')}</span></div><div class="fz-card fz-alert bad">${escapeHtml(result?.vizNote || result?.detail || 'Complete the settlement inputs first.')}</div></section>`;
  const pile = v.kind === 'pile', view = VIEWS.includes(state.stView) ? state.stView : 'overlay';
  const tile = (label, amount, sub) => `<div class="fz-tile"><div class="fz-tile-label">${label}</div><div class="fz-tile-value">${amount}</div><div class="fz-tile-sub">${sub}</div></div>`;
  const mm = n => `${fmt(n, 2)}<span class="fz-unit">mm</span>`;
  return `<section class="fz st-focus"><div class="fz-head">
      <div><div class="fz-kicker">08B · ${pile ? 'Pile group' : 'Shallow foundation'}</div><div class="fz-title">Settlement</div></div>
      <span class="fz-tag ${v.pass ? 'ok' : 'bad'}">UC ${fmt(v.uc, 3)} · ${v.pass ? 'PASS' : 'FAIL'}</span>
    </div><div class="fz-tiles even">
      ${tile(pile ? 'Group settlement Sg' : 'Total settlement', mm(v.total), `Allowable ${fmt(v.allow, 2)} mm`)}
      ${pile ? tile('Single pile Se', mm(v.single), 'S₁ + S₂ + S₃; before group factor') : tile('Immediate Se', mm(v.components[0].value), `${v.rigid ? 'Rigid' : 'Flexible'} footing · Es ${fmt(v.Es, 0)} kPa`)}
      ${pile ? tile('Group factor Fg', fmt(v.factor, 3), `Bg ${fmt(v.B, 2)} m · D ${fmt(v.D, 3)} m`) : tile('Consolidation Sc', mm(v.components[1].value), v.consolidationSkipped ? 'Not included (H = 0)' : `1-D layer H ${fmt(v.H, 2)} m`)}
      ${pile ? tile('Working load Qw', `${fmt(v.Qw, 2)}<span class="fz-unit">kN/pile</span>`, escapeHtml(v.loadSource)) : tile('Differential (input)', mm(v.diff), `User estimate · allowable ${fmt(v.allowDiff, 2)} mm`)}
    </div><div class="st-layout">
      <div class="fz-card"><div class="fz-sub">Before / after settlement</div>
        <div class="st-viewport" data-view="${view}"><div class="cad-switcher" role="group" aria-label="Settlement view">
          ${VIEWS.map(key => `<button type="button" data-st-view="${key}" aria-pressed="${key === view}">${key === 'overlay' ? 'Overlay' : key === 'before' ? 'Before' : 'After'}</button>`).join('')}
        </div>${VIEWS.map(key => `<div class="st-view st-${key}">${settlementDiagramSVG(v, key)}</div>`).join('')}</div>
        <div class="fz-note">Schematic geometry; movement amplified. Uniform reference displacement only — individual pile movement, tilt and deformation fields are not calculated.</div>
      </div><div class="fz-card"><div class="fz-sub">Components &amp; allowable limits</div>${settlementSummarySVG(v)}
        <div class="fz-note">${pile ? 'The component bars describe one pile. The result compared with the allowable is Sg, after the group factor.' : 'Differential settlement is entered by the user. It is checked separately and is not added to total settlement.'}</div>
      </div></div>
      <div class="fz-note">${pile ? 'Vesic semi-empirical method. Soil modulus, shaft / tip split and influence factors must follow the geotechnical report.' : 'Elastic settlement plus an optional single 1-D consolidation layer. SPT correlations are empirical; verify against the geotechnical report.'} No time–settlement curve is implied.</div>
    </section>`;
}
