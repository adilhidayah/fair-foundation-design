// Section 02-style viewport. View changes display snapshots, never alter engineering results.
import { state } from '../core/state.js?v=20261028e4';
import { fmt } from '../core/format.js?v=20261028e4';
import { anchorFocusDiagramSVG } from '../diagrams/anchorFocusDiagram.js?v=20261028e4';
import { anchorGeometryDiagramSVG } from '../diagrams/anchorGeometryDiagram.js?v=20261028e4';
import { anchorModesHTML } from './anchorModes.js?v=20261028e4';

export const ANCHOR_VIEWS = [['plan','📐 Plan View'],['elev','📏 Elevation View'],['iso','🧊 Isometric 2.5D'],['modes','Failure Modes · ACI']];
export function anchorViewportHTML(v, result, forces) {
  const view = ANCHOR_VIEWS.some(([key])=>key===state.anchorFocusView) ? state.anchorFocusView : 'plan';
  const group=v.method==='group';
  const ready = forces?.length && [v.site.Bp,v.site.Lp].every(n=>Number.isFinite(n)&&n>0) && forces.every(b=>[b.x,b.y,b.tension].every(Number.isFinite));
  const drawing = !ready ? '<div class="fz-note">No finite anchor geometry / forces available.</div>' : view==='plan' ? anchorFocusDiagramSVG(forces,v.site.Bp,v.site.Lp) : anchorGeometryDiagramSVG(v,forces,view);
  const scene=view==='modes' ? anchorModesHTML(result,group,state.anchorFailureMode) : `<div class="av-scene"><div class="cad-stage av-stage">${drawing}<div class="av-caption">${view==='plan'?'Anchor tension · amber = tensile demand, blue = zero tensile demand':'Embedment geometry · amber / blue identifies anchors with / without tensile demand'}</div></div>
    <aside class="av-inspector"><div class="fz-sub">Anchor geometry</div><dl><div><dt>Pedestal Bp × Lp</dt><dd>${fmt(v.site.Bp,0)} × ${fmt(v.site.Lp,0)} mm</dd></div><div><dt>Embedment hef</dt><dd>${fmt(v.hef,0)} mm</dd></div><div><dt>Diameter da</dt><dd>${fmt(v.da,0)} mm</dd></div><div><dt>Anchor count</dt><dd>${v.bolts.length}</dd></div></dl><p class="fz-note">Centred on the bolt-group centroid, matching the calculation model. Elevation and isometric show only the embedment zone; pedestal height, head dimensions, base plate and reinforcement details are not inferred.</p></aside></div>`;
  return `<section class="fz-card fz-diagram cad-viewport av-viewport" data-view="${view}"><div class="cad-switcher" role="group" aria-label="Anchor viewport">${ANCHOR_VIEWS.map(([key,label])=>`<button type="button" data-ab-view="${key}" aria-pressed="${key===view}">${label}</button>`).join('')}</div>${scene}</section>`;
}
