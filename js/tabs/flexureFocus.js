// 6.3: snapshot-only Focus Canvas, shared by shallow footings and pile caps.
import { escapeHtml } from '../core/dom.js?v=20261028f2';
import { fmt } from '../core/format.js?v=20261028f2';
import { state,lastResults } from '../core/state.js?v=20261028f2';
import { pileCapRebarPlanSVG,pileCapRebarSectionSVG } from '../diagrams/rebarDiagram.js?v=20261028f2';
import { flexureIsoSVG,flexureMomentsSVG } from '../diagrams/flexureFocusDiagram.js?v=20261028f2';
const VIEWS=[['plan','📐 Plan View'],['elev','📏 Section X'],['iso','🧊 Isometric 2.5D'],['moments','Design Moments']];
const selectedCase=v=>v.cases.find(c=>c.key===state.flexureCase)||v.cases[0];
const selectedCombo=(v,c)=>v.combos.find(r=>r.name===state.flexureCombo)||v.combos.find(r=>r.name===c.govName)||v.combos[0];
const hasBars=c=>c.required&&c.design?.ok&&c.n>0&&c.spacing>0;
function update(only) {
  const positions=[];for(let e=document.getElementById('focus-flexure');e;e=e.parentElement)positions.push([e,e.scrollTop,e.scrollLeft]);
  renderFlexureFocus(only);const restore=()=>positions.forEach(([e,t,l])=>{e.scrollTop=t;e.scrollLeft=l;});restore();requestAnimationFrame(restore);
}
export function setFlexureView(view) {if(!VIEWS.some(([key])=>key===view))return;state.flexureView=view;update(true);}
export function selectFlexureCase(key) {if(!lastResults.pileCapRebar?.viz?.cases.some(c=>c.key===key))return;state.flexureCase=key;state.flexureCombo=null;update(false);}
export function selectFlexureCombo(name) {if(!lastResults.pileCapRebar?.viz?.combos.some(r=>r.name===name))return;state.flexureCombo=name;update(true);}
const layerStatus=c=>!c.required?'NOT REQUIRED':!c.design?.ok?'SECTION TOO SMALL':!hasBars(c)?'LAYOUT UNAVAILABLE':c.AsProv<c.design.As?'STEEL AREA SHORT':'DESIGNED';
const barText=(v,c)=>hasBars(c)?`${c.n} D${fmt(v.db,0)} @ ${fmt(c.spacing,0)} mm`:'—';
function viewport(v,c,r) {
  const view=VIEWS.some(([key])=>key===state.flexureView)?state.flexureView:'plan';
  const layers=hasBars(c)?{[c.key]:{n:c.n,label:barText(v,c)}}:{};
  let drawing;
  const geom=[v.Bf,v.Lf,v.t,v.cc,v.db].every(Number.isFinite)&&v.Bf>0&&v.Lf>0&&v.t>0;
  if(view==='moments')drawing=flexureMomentsSVG(v,r);
  else if(!geom)drawing='<div class="fz-note">Geometry is not available.</div>';
  else if(view==='iso')drawing=flexureIsoSVG(v,c);
  else {
    const args={Bf:v.Bf,Lf:v.Lf,t:v.t,cc:v.cc,db:v.db,piles:v.piles,D:v.D,ped:v.ped,layers,name:v.name};
    drawing=(view==='plan'?pileCapRebarPlanSVG(args):pileCapRebarSectionSVG(args)).replace('<svg class="fdn-diagram"',`<svg role="img" aria-label="${v.name} ${view==='plan'?'plan':'section along x'} — selected ${c.title}" class="fdn-diagram"`);
  }
  const info=`<div class="fz-sub">${escapeHtml(c.title)}</div><span class="fz-tag ${c.required&&(!hasBars(c)||c.AsProv<c.design?.As)?'bad':''}">${layerStatus(c)}</span>
    <dl><div><dt>Design Mu envelope</dt><dd>${fmt(c.Mu,2)} kN·m</dd></div><div><dt>Design width b</dt><dd>${fmt(c.b,0)} mm</dd></div><div><dt>Effective depth d</dt><dd>${fmt(c.dEff,0)} mm</dd></div>${c.design?.ok?`<div><dt>As from flexure</dt><dd>${fmt(c.design.AsCalc,0)} mm²</dd></div><div><dt>As minimum</dt><dd>${fmt(c.design.AsMin,0)} mm²</dd></div><div><dt>As governing</dt><dd>${fmt(c.design.As,0)} mm²</dd></div><div><dt>As provided · nominal</dt><dd>${hasBars(c)?fmt(c.AsProv,0)+' mm²':'—'}</dd></div>`:''}<div><dt>Bars</dt><dd>${barText(v,c)}</dd></div></dl>
    <p class="fz-note">${!c.required?'No top layer designed by the current hogging / minimum-mat option.':c.minOnly?'Minimum top mat controls this layer.':escapeHtml(c.govName+(c.location||''))}</p>
    <p class="fz-note">${view==='moments'?`Plot: ${escapeHtml(r?.name||'No combination')}. Bars remain the LRFD envelope design.`:'Selected layer only. Section X shows x bars in-plane and z bars as cut dots.'}</p>`;
  return `<section class="fz-card fz-diagram cad-viewport av-viewport fx-viewport" data-view="${view}"><div class="cad-switcher" role="group" aria-label="Flexure viewport">${VIEWS.map(([key,label])=>`<button type="button" data-fx-view="${key}" aria-pressed="${key===view}">${label}</button>`).join('')}</div><div class="av-scene"><div class="cad-stage av-stage">${drawing}<div class="av-caption">${view==='moments'?'Existing design-section values, not a continuous moment diagram':`Selected ${c.title} · schematic bar placement; development / anchorage not detailed`}</div></div><aside class="av-inspector">${info}</aside></div></section>`;
}

export function renderFlexureFocus(only=false) {
  const panel=document.getElementById('focus-flexure');if(!panel)return;
  const result=lastResults.pileCapRebar,v=result?.viz;
  if(!v||!v.combos.length){panel.innerHTML=`<section class="fz"><div class="fz-head"><div><div class="fz-kicker">6.3 · Flexure</div><div class="fz-title">Reinforcement results unavailable</div></div><span class="fz-tag">${escapeHtml(result?.status||'NOT COMPUTED')}</span></div><div class="fz-card">${escapeHtml(v&&!v.combos.length?'No factored LRFD combinations available.':result?.detail||'Complete geometry and LRFD loading first.')}</div></section>`;return;}
  const c=selectedCase(v),r=selectedCombo(v,c);
  if(only&&panel.querySelector('.fx-viewport')){panel.querySelector('.fx-viewport').outerHTML=viewport(v,c,r);return;}
  const tile=(label,value,sub)=>`<div class="fz-tile"><div class="fz-tile-label">${label}</div><div class="fz-tile-value">${value}</div><div class="fz-tile-sub">${sub}</div></div>`;
  const layoutWarning=v.cases.some(q=>q.required&&!hasBars(q));
  panel.innerHTML=`<section class="fz fx-focus"><div class="fz-head"><div><div class="fz-kicker">6.3 · ${v.name} · Flexure</div><div class="fz-title">${v.name} reinforcement</div></div><div class="fz-tags"><span class="fz-tag ${result.status==='PASS'?'ok':'bad'}">Envelope · ${escapeHtml(result.status)}</span>${v.tight.length?'<span class="fz-tag bad">Spacing warning</span>':''}${layoutWarning?'<span class="fz-tag bad">Layout warning</span>':''}</div></div>
    <div class="fz-tiles even">${tile('Geometry',`${fmt(v.Bf,2)} × ${fmt(v.Lf,2)}<span class="fz-unit">m</span>`,`t ${fmt(v.t,0)} mm · ${v.name}`)}${tile('Selected layer',`${c.lbl.toUpperCase()} · ${c.face}`,layerStatus(c))}${tile('Design Mu envelope',`${fmt(c.Mu,2)}<span class="fz-unit">kN·m</span>`,c.minOnly?'Minimum top mat controls':escapeHtml(c.govName))}${tile('Nominal bars',hasBars(c)?`D${fmt(v.db,0)} @ ${fmt(c.spacing,0)}`:'—',hasBars(c)?`${c.n} bars · spacing in mm`:'No drawable layout for this layer')}</div>
    <div class="cad-switcher" role="group" aria-label="Reinforcement layer">${v.cases.map(q=>`<button type="button" data-fx-case="${q.key}" aria-pressed="${q===c}">${q.lbl.toUpperCase()} · ${q.face}</button>`).join('')}</div>
    <div class="fz-card ab-select"><label for="fx-focus-combo">Inspect LRFD moments</label><select id="fx-focus-combo">${v.combos.map(q=>`<option value="${escapeHtml(q.name)}" ${q===r?'selected':''}>${escapeHtml(q.name)}${q.invalid?' · INVALID':''}${q.name===c.govName&&!c.minOnly?' · GOVERNING':''}</option>`).join('')}</select></div>
    ${viewport(v,c,r)}
    ${v.invalidCount?`<div class="fz-card ab-limit">${v.invalidCount} combination(s) are invalid. The envelope is incomplete; resolve the missing pile distribution / soil pressure before using this design.</div>`:''}
    <div class="fz-card"><div class="fz-sub">Required and provided steel · all layers</div><div class="overflow-x"><table class="fz-table"><tr><th>Layer</th><th>Mu (kN·m)</th><th>As governing (mm²)</th><th>As provided (mm²)</th><th>Bars</th><th>State</th></tr>${v.cases.map(q=>`<tr class="${q===c?'governing':''}"><td>${q.title}</td><td>${fmt(q.Mu,2)}</td><td>${q.required&&q.design?.ok?fmt(q.design.As,0):'—'}</td><td>${hasBars(q)?fmt(q.AsProv,0):'—'}</td><td>${barText(v,q)}</td><td>${layerStatus(q)}</td></tr>`).join('')}</table></div></div>
    <div class="fz-card"><div class="fz-sub">Design moments · all LRFD combinations</div><div class="overflow-x"><table class="fz-table"><tr><th>Combination</th>${v.cases.map(q=>`<th>${q.lbl}-${q.face}<br>kN·m</th>`).join('')}</tr>${v.combos.map(q=>`<tr class="${q===r?'governing':''}"><td>${escapeHtml(q.name)}${q.invalid?' · INVALID':''}</td>${v.cases.map(layer=>`<td>${q.invalid?'—':fmt(q.m[layer.key],2)}</td>`).join('')}</tr>`).join('')}</table></div></div>
    <div class="fz-card ab-limit"><div class="fz-sub">Model & detailing</div>${v.shallow?'Moments from the existing net soil-pressure calculation, including the checked faces / spans for multiple load points.':'Moments from the existing LRFD pile reactions at the checked load-point faces.'} X bars are the outer layer, Z bars the inner layer. ${v.topMode==='two'?`Minimum top mat selected (ρtop ${fmt(v.rhoTop,4)}).`:'Top layers are designed where the existing load combinations produce hogging.'} As provided is based on nominal spacing over the design width b. The steel-area comparison is not an independent flexural-strength UC. ${v.tight.length?'Clear-spacing warning: '+escapeHtml(v.tight.join(', '))+'. ':''}Schematic bar placement follows the report drawing; verify actual spacing, cover, development, anchorage and any rectangular-footing central-band detailing.</div></section>`;
}
