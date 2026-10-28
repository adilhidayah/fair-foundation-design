// Presence checks only. Blank project inputs must not be presented as calculated zeroes.
import { pileList, boltList } from '../core/state.js?v=20261028s3';
const selected=id=>document.querySelector(`#${id} button.sel`)?.dataset.val;
const missing=id=>{const el=document.getElementById(id);return !!el&&(el.value.trim()===''||!Number.isFinite(Number(el.value)));};
const MATERIAL=['gen-fc','gen-fy','gen-gc','gen-gs'];
const scope=name=>document.getElementById('scope-'+name)?.checked!==false;
function geometry() {
  return ['fs-Bf','fs-Lf','fs-Hf','fs-Df','fs-OffX','fs-OffZ',
    ...(selected('fs-type')==='pedestal'?['fs-Bp','fs-Lp','fs-Gp']:[]),
    ...(document.getElementById('fs-grout')?.checked?['fs-grout-t']:[])];
}
function loadGaps() {
  const rows=[...document.querySelectorAll('#lc-loadvalue-body tr')];
  let active=0;const gaps=[];
  rows.forEach(row=>{
    const fields=[...row.querySelectorAll('input[type="number"]')];
    if(!fields.some(el=>el.value.trim()!==''&&(!el.readOnly||Number(el.value)!==0)))return;
    active++;fields.forEach(el=>{if(missing(el.id))gaps.push(el.id);});
  });
  return active?gaps:['loading'];
}
export function pendingInputs(tab='summary') {
  const pile=selected('fs-support')==='pile';
  if(tab==='summary') {
    const tabs=['foundsize','loadingdata'];
    if(scope('stability'))tabs.push(pile?'pile':'foundation');
    if(scope('structural'))tabs.push('capcheck',...(selected('fs-type')==='pedestal'?['pedcheck']:[]));
    if(scope('settlement'))tabs.push('settlement');
    if(scope('anchor'))tabs.push('anchor');
    if(!pile&&scope('bearing'))tabs.push('bearing');
    return [...new Set(tabs.flatMap(pendingInputs))];
  }
  const base=[...MATERIAL,...geometry()].filter(missing);
  if(tab==='general')return MATERIAL.filter(missing);
  if(tab==='foundsize')return base;
  if(tab==='loadingdata')return loadGaps();
  if(tab==='setup')return [];
  let ids=[];
  if(['pile','capcheck','settlement','summary'].includes(tab)&&pile)ids.push('pf-dia');
  if(['pile','summary'].includes(tab)&&pile)ids.push('pf-Qc','pf-Qt','pf-Ql');
  if(['foundation','summary'].includes(tab)&&!pile)ids.push('fd-mu',...(scope('bearing')?['bc-c','bc-phi','bc-beta']:['bc-qa-given']));
  if(['pedcheck','summary'].includes(tab)&&selected('fs-type')==='pedestal')ids.push('rb-cover','rb-bar');
  if(['capcheck','summary'].includes(tab)) {
    ids.push('rb-cc','rb-capbar','ow-cc','ow-D','tw-cc','tw-D','ow-rho');
    if(selected('ow-vu-src')==='manual')ids.push('ow-vu','ow-bw');
    if(selected('tw-vu-src')==='manual')ids.push('tw-vu','tw-mux','tw-muz');
  }
  if(tab==='bearing')ids.push('bc-c','bc-phi','bc-beta');
  if(['settlement','summary'].includes(tab))ids.push('st-allowTotal',...(pile?['st-pile-L','st-pile-Ep','st-pile-Es','st-pile-mu','st-pile-shaft','st-pile-Iwp']:['st-Es','st-nu','st-qNet']));
  if(['anchor','summary'].includes(tab))ids.push('ab-da','ab-Ase','ab-futa','ab-hef','ab-Abrg');
  const gaps=[...base,...loadGaps(),...ids.filter(missing)];
  if(tab==='anchor'&&selected('ab-method')==='group'){
    const n=document.getElementById('ab-shear-anchors').value;
    if(!['2','4'].includes(n))gaps.push('ab-shear-anchors');
    if(n==='4'&&!document.getElementById('ab-shear-basis').value.trim())gaps.push('ab-shear-basis');
    const tension=document.getElementById('ab-reinf').value, shear=document.getElementById('ab-vreinf').value;
    const reinforcement=[];
    if(shear==='ties')reinforcement.push('ab-tie-n','ab-tie-db');
    if(tension!=='none')reinforcement.push('ab-topcover');
    if(tension==='hairpin'||shear==='hairpin')reinforcement.push('ab-hp-db','ab-hp-n','ab-hp-cover');
    gaps.push(...reinforcement.filter(missing));
  }
  if(pile&&!pileList.length)gaps.push('pile-layout');
  if(['anchor','summary'].includes(tab)&&!boltList.length)gaps.push('anchor-layout');
  return [...new Set(gaps)];
}
function inputName(id) {
  const names={loading:'Beban: isi semua komponen beban aktif (0 bila tidak ada)', 'pile-layout':'Layout tiang', 'anchor-layout':'Layout angkur'};
  if(names[id])return names[id];
  const el=document.getElementById(id);
  const component=id.match(/^lc-(.*)-(P|H|Hz|M|Mx)$/);
  if(component)return (el?.closest('tr')?.querySelector('td')?.textContent||component[1])+' · '+component[2];
  const label=document.querySelector('label[for='+JSON.stringify(id)+']');
  return (label?.textContent||el?.closest('.field')?.querySelector('label')?.textContent||id).replace(/\s+/g,' ').trim();
}
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function pendingProjectHtml(tab='summary') {
  const gaps=pendingInputs(tab);
  return `<section class="project-pending-card"><div class="fz-kicker">DATA PROYEK</div><h2>Belum dihitung — lengkapi data proyek</h2><p>Kolom kosong belum dianggap sebagai nilai nol. Buka proyek tersimpan atau isi data yang diperlukan.</p><ul>${gaps.slice(0,8).map(id=>`<li>${escape(inputName(id))}</li>`).join('')}</ul>${gaps.length>8?`<p>Dan ${gaps.length-8} isian lainnya.</p>`:''}${tab==='loadingdata'?'<button type="button" class="combo-add-btn" data-zero-loads>Isi komponen beban kosong dengan 0</button><p>Gunakan hanya jika komponen tersebut memang tidak bekerja.</p>':''}</section>`;
}
export function refreshProjectReadiness() {
  const tab=document.querySelector('.sidebar-menu .tab.active')?.dataset.tab||'setup';
  const pending=pendingInputs(tab).length>0;
  const html=pending?pendingProjectHtml(tab):'';
  document.body.dataset.projectReadiness=pending?'pending':'ready';
  document.querySelectorAll('.results, .ld-results').forEach(pane=>{
    let message=pane.querySelector(':scope > .project-pending');
    if(!message){message=document.createElement('div');message.className='project-pending';pane.append(message);}
    pane.dataset.inputsPending=String(pending&&tab!=='setup');
    message.innerHTML=html;
  });
  if(geometry().every(missing))document.querySelectorAll('input[readonly]').forEach(el=>{if(!el.id.startsWith('lc-'))el.value='';});
  ['ow','tw'].forEach(prefix=>{if([prefix+'-h',prefix+'-cc',prefix+'-D'].some(missing))document.getElementById(prefix+'-d-out').textContent='—';});
}
