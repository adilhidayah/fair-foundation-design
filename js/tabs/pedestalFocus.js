// 5A display-only Focus Canvas. Engineering data is captured by calcRebar; wiring stays in app.js.
import { escapeHtml } from '../core/dom.js?v=20261028p3';
import { fmt } from '../core/format.js?v=20261028p3';
import { lastResults, state } from '../core/state.js?v=20261028p3';
import { comboLabel } from '../core/worksheet.js?v=20261028p3';
import { pedestalSectionSVG } from '../diagrams/rebarDiagram.js?v=20261028p3';
import { pedestalGeometrySVG, pedestalPMFocusSVG } from '../diagrams/pedestalFocusDiagram.js?v=20261028p3';

const VIEWS=[['section','📐 Section View'],['elev','📏 Elevation View'],['iso','🧊 Isometric 2.5D'],['pm','P–M Interaction']];
const ucText=n=>Number.isFinite(n)?fmt(n,3):n===Infinity?'∞':'—';
function preserveScroll(only) {
  const positions=[];
  for(let e=document.getElementById('focus-pedestal');e;e=e.parentElement)positions.push([e,e.scrollTop,e.scrollLeft]);
  renderPedestalFocus(only);
  const restore=()=>positions.forEach(([e,t,l])=>{e.scrollTop=t;e.scrollLeft=l;});
  restore();requestAnimationFrame(restore);
}
export function setPedestalFocusView(view) {
  if(!VIEWS.some(([key])=>key===view))return;
  state.pedestalFocusView=view;preserveScroll(true);
}
export function selectPedestalFocusCombo(label) {
  if(!lastResults.pedestalRebar?.viz?.perCombo.some(r=>comboLabel(r.combo)===label))return;
  state.pedestalFocusLC=label;preserveScroll(false);
}
function viewport(v,r) {
  const view=VIEWS.some(([key])=>key===state.pedestalFocusView)?state.pedestalFocusView:'section';
  const section=()=>!(v.dPrime>=0&&2*v.dPrime<Math.min(v.Bp,v.Lp)) ? '<div class="fz-note">Section geometry is invalid for the reinforcement drawing.</div>' : pedestalSectionSVG(v).replace(/viewBox="0 0 640 [^"]+"/,'viewBox="0 0 640 402"').replace('<svg class="fdn-diagram"','<svg role="img" aria-label="Designed two-face pedestal reinforcement cross-section" class="fdn-diagram"');
  const drawing=view==='section'?section():view==='pm'?pedestalPMFocusSVG(v,r):pedestalGeometrySVG(v,view);
  const data=view==='pm'?`<div><dt>Pu</dt><dd>${fmt(r.Pu,1)} kN</dd></div><div><dt>Mu resultant</dt><dd>${fmt(r.Mu,1)} kN·m</dd></div><div><dt>φMn at Pu</dt><dd>${r.outOfRange?'OUT OF RANGE':fmt(r.phiMn,1)+' kN·m'}</dd></div><div><dt>Selected UC</dt><dd>${ucText(r.uc)}</dd></div>`:
    `<div><dt>Section Bp × Lp</dt><dd>${fmt(v.Bp,0)} × ${fmt(v.Lp,0)} mm</dd></div><div><dt>Height Hp · Section 02</dt><dd>${fmt(v.Hp,0)} mm</dd></div><div><dt>Longitudinal bars</dt><dd>${v.n*2} D${fmt(v.barDia,0)}</dd></div><div><dt>Centroid distance d′</dt><dd>${fmt(v.dPrime,0)} mm</dd></div><div><dt>Ast / ratio ρ</dt><dd>${fmt(v.Ast,0)} mm² / ${fmt(v.rho*100,2)}%</dd></div>`;
  return `<section class="fz-card fz-diagram cad-viewport av-viewport pd-viewport" data-view="${view}"><div class="cad-switcher" role="group" aria-label="Pedestal viewport">${VIEWS.map(([key,label])=>`<button type="button" data-pd-view="${key}" aria-pressed="${key===view}">${label}</button>`).join('')}</div><div class="av-scene"><div class="cad-stage av-stage">${drawing}<div class="av-caption">${view==='pm'?'Design strengths and load points from the existing calculation':'Designed two-face longitudinal reinforcement · ties and anchorage not detailed'}</div></div><aside class="av-inspector"><div class="fz-sub">${view==='pm'?'Selected LRFD combination':'Section & reinforcement'}</div><dl>${data}</dl><p class="fz-note">${view==='pm'?escapeHtml(comboLabel(r.combo)):'d′ is measured to the bar centroid; it is not the clear concrete cover.'}</p><p class="fz-note">Uniaxial resultant model about Bp. No biaxial P–M–M or second-order check.</p></aside></div></section>`;
}

export function renderPedestalFocus(only=false) {
  const panel=document.getElementById('focus-pedestal');if(!panel)return;
  const result=lastResults.pedestalRebar,v=result?.viz;
  if(!v){panel.innerHTML=`<section class="fz"><div class="fz-head"><div><div class="fz-kicker">5A · Pedestal check</div><div class="fz-title">${result?.status==='NA'?'No pedestal in this model':'Pedestal results unavailable'}</div></div><span class="fz-tag">${escapeHtml(result?.status||'NOT COMPUTED')}</span></div><div class="fz-card">${escapeHtml(result?.detail||'Complete the section and LRFD load inputs first.')}</div></section>`;return;}
  const r=v.perCombo.find(p=>comboLabel(p.combo)===state.pedestalFocusLC)||v.perCombo.find(p=>p.combo===v.worstCombo)||v.perCombo[0];
  if(!r){panel.innerHTML='<section class="fz"><div class="fz-head"><div><div class="fz-kicker">5A · Pedestal check</div><div class="fz-title">No LRFD combinations available</div></div></div><div class="fz-card">Load the factored LRFD combinations in Section 03 before inspecting the pedestal design.</div></section>';return;}
  if(only&&panel.querySelector('.pd-viewport')){panel.querySelector('.pd-viewport').outerHTML=viewport(v,r);return;}
  const tile=(label,value,sub)=>`<div class="fz-tile"><div class="fz-tile-label">${label}</div><div class="fz-tile-value">${value}</div><div class="fz-tile-sub">${sub}</div></div>`;
  const good=result.status==='PASS';
  panel.innerHTML=`<section class="fz pd-focus"><div class="fz-head"><div><div class="fz-kicker">5A · Pedestal · ACI 318M-19</div><div class="fz-title">Pedestal reinforcement</div></div><div class="fz-tags"><span class="fz-tag ${good?'ok':'bad'}">P–M envelope · UC ${ucText(v.maxUC)} · ${escapeHtml(result.status)}</span>${v.pedClearOk?'':'<span class="fz-tag bad">Detailing warning</span>'}</div></div>
    <div class="fz-note">Pedestal ${v.siteIndex} of ${v.sites.length} · ${escapeHtml(result.detail)}</div>
    <div class="fz-tiles even">${tile('Section',`${fmt(v.Bp,0)} × ${fmt(v.Lp,0)}<span class="fz-unit">mm</span>`,`Hp ${fmt(v.Hp,0)} mm · Section 02`)}${tile('Longitudinal bars',`${v.n*2} D${fmt(v.barDia,0)}`,`${v.n} bars per face · 2 faces`)}${tile('Steel area Ast',`${fmt(v.Ast,0)}<span class="fz-unit">mm²</span>`,`ρ ${fmt(v.rho*100,2)}% · model range 1–8%`)}${tile('Clear bar spacing',v.pedClear===null?'—':`${fmt(v.pedClear,0)}<span class="fz-unit">mm</span>`,v.pedClear===null?'One bar per face':`${v.pedClearOk?'OK':'TOO SMALL'} · minimum ${fmt(v.pedMinClear,0)} mm`)}</div>
    <div class="fz-card ab-select"><label for="pd-focus-combo">Inspect LRFD combination</label><select id="pd-focus-combo">${v.perCombo.map(p=>`<option value="${escapeHtml(comboLabel(p.combo))}" ${p===r?'selected':''}>${escapeHtml(comboLabel(p.combo))}${p.combo===v.worstCombo?' · GOVERNING':''}</option>`).join('')}</select><span class="fz-tag ${r.uc<=1&&!r.outOfRange?'ok':'bad'}">${r.outOfRange?'P OUT OF RANGE':'UC '+ucText(r.uc)}</span></div>
    ${viewport(v,r)}
    <div class="fz-cols"><div class="fz-card"><div class="fz-sub">Reinforcement & detailing</div><table class="fz-table"><tr><th>Item</th><th class="fz-num">Result</th></tr><tr><td>Bars per face</td><td class="fz-num">${v.n} D${fmt(v.barDia,0)}</td></tr><tr><td>Bar centroid distance d′</td><td class="fz-num">${fmt(v.dPrime,0)} mm</td></tr><tr><td>Spacing c/c along face</td><td class="fz-num">${v.pedSpacing===null?'—':fmt(v.pedSpacing,0)+' mm'}</td></tr><tr><td>Clear spacing</td><td class="fz-num">${v.pedClearOk?'OK':'TOO SMALL'}</td></tr><tr><td>Concrete f′c / steel fy</td><td class="fz-num">${fmt(v.fc,0)} / ${fmt(v.fy,0)} MPa</td></tr></table><p class="fz-note">${v.pedClearOk?'Spacing follows the existing detailing check.':'P–M strength result does not resolve the bar-spacing warning; review the section size / bar diameter.'}</p></div>
    <div class="fz-card"><div class="fz-sub">LRFD checks · base of pedestal</div><div class="overflow-x"><table class="fz-table"><tr><th>LC</th><th>Pu (kN)</th><th>Mu (kN·m)</th><th>UC</th></tr>${v.perCombo.map(p=>`<tr class="${p===r?'governing':''}"><td>${escapeHtml(String(p.combo.lc||p.combo.name))}</td><td>${fmt(p.Pu,1)}</td><td>${fmt(p.Mu,1)}</td><td>${p.outOfRange?'OUT OF RANGE':ucText(p.uc)}</td></tr>`).join('')}</table></div><p class="fz-note">Loads include the existing pedestal-height moment transfer and self-weight. Capacity is read from the same factored P–M curve as Report Preview.</p></div></div>
    ${v.sites.length>1?`<div class="fz-card"><div class="fz-sub">All pedestals · design summary</div><div class="overflow-x"><table class="fz-table"><tr><th>Pedestal</th><th>Section (mm)</th><th>Bars</th><th>UC</th><th>Status</th></tr>${v.sites.map(s=>`<tr class="${s.idx===v.siteIndex?'governing':''}"><td>${s.idx}</td><td>${s.Bp} × ${s.Lp}</td><td>${s.search.found?s.search.n*2+' D'+fmt(v.barDia,0):'—'}</td><td>${s.search.found?ucText(s.search.maxUC):'—'}</td><td>${s.search.found?'PASS':'NOT FOUND'}</td></tr>`).join('')}</table></div><p class="fz-note">Viewport details the governing pedestal ${v.siteIndex}; each pedestal retains its own designed reinforcement.</p></div>`:''}
    <div class="fz-card ab-limit"><div class="fz-sub">Model limitations</div>Two symmetric layers, with bars lumped at d′ from the faces perpendicular to bending. The resultant of Mx and Mz is applied about Bp; no biaxial P–M–M analysis. Pedestal shear, ties, end anchorage and slenderness / second-order effects are not designed in 5A. The views show longitudinal reinforcement only.</div></section>`;
}
