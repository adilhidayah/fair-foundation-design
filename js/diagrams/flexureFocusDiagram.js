// 6.3 display-only reinforcement geometry and design-section moment bars.
import { escapeHtml } from '../core/dom.js?v=20261028s3';
import { fmt } from '../core/format.js?v=20261028s3';
const text=(x,y,s,attrs='')=>`<text x="${x}" y="${y}" ${attrs}>${escapeHtml(s)}</text>`;
const svg=(body,label)=>`<svg class="fdn-diagram fx-svg" viewBox="0 0 720 440" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeHtml(label)}" style="font:12px var(--sans);fill:var(--ink)">${body}</svg>`;
export const FLEXURE_COLORS={xb:'var(--accent)',yb:'var(--pass)',xt:'var(--caution)',yt:'var(--ink-soft)'};

export function flexureIsoSVG(v,c) {
  if(![v.Bf,v.Lf,v.t,v.cc,v.db].every(Number.isFinite)||!(v.Bf>0&&v.Lf>0&&v.t>0))return '<div class="fz-note">No finite geometry available.</div>';
  const h=v.t/1000,cover=v.cc/1000,db=v.db/1000,C=Math.cos(Math.PI/6);
  const raw=(x,z,y)=>[(x-z)*C,(x+z)*.5-y], footprint=[[-v.Bf/2,-v.Lf/2],[v.Bf/2,-v.Lf/2],[v.Bf/2,v.Lf/2],[-v.Bf/2,v.Lf/2]];
  const pts=footprint.flatMap(([x,z])=>[raw(x,z,-h*.8),raw(x,z,h)]);
  const minX=Math.min(...pts.map(p=>p[0])),maxX=Math.max(...pts.map(p=>p[0])),minY=Math.min(...pts.map(p=>p[1])),maxY=Math.max(...pts.map(p=>p[1]));
  const s=Math.min(560/(maxX-minX),300/(maxY-minY)),P=(x,z,y)=>{const p=raw(x,z,y);return[360+(p[0]-(minX+maxX)/2)*s,215+(p[1]-(minY+maxY)/2)*s];};
  const poly=(ps,cls)=>`<polygon points="${ps.map(p=>P(...p).join(',')).join(' ')}" class="iso-face ${cls}" fill-opacity="0.30"/>`;
  const box=(x0,x1,z0,z1,y0,y1,kind)=>poly([[x1,z0,y0],[x1,z1,y0],[x1,z1,y1],[x1,z0,y1]],`iso-${kind} iso-sx`)+poly([[x0,z1,y0],[x1,z1,y0],[x1,z1,y1],[x0,z1,y1]],`iso-${kind} iso-sz`)+poly([[x0,z0,y1],[x1,z0,y1],[x1,z1,y1],[x0,z1,y1]],`iso-${kind} iso-top`);
  let out=text(24,28,`${v.name.toUpperCase()} REINFORCEMENT · ISOMETRIC 2.5D`,'font-weight="600"');
  for(const p of v.piles)out+=box(p.x-v.D/2,p.x+v.D/2,p.y-v.D/2,p.y+v.D/2,-h*.7,0,'pile');
  out+=box(-v.Bf/2,v.Bf/2,-v.Lf/2,v.Lf/2,0,h,'footing');
  for(const p of (Array.isArray(v.ped)?v.ped:[v.ped])) {
    if(!p)continue;
    out+=poly([[p.x-p.Bp/2000,p.y-p.Lp/2000,h],[p.x+p.Bp/2000,p.y-p.Lp/2000,h],[p.x+p.Bp/2000,p.y+p.Lp/2000,h],[p.x-p.Bp/2000,p.y+p.Lp/2000,h]],'iso-pedestal iso-top');
  }
  if(c.required&&c.design?.ok&&c.n>0&&c.spacing>0) {
    const inner=c.key.startsWith('y'),offset=cover+(inner?1.5:.5)*db,y=c.face==='bottom'?offset:h-offset;
    for(let i=1;i<=c.n;i++) {
      const f=i/(c.n+1),p=inner?P(-v.Bf/2+f*v.Bf,-v.Lf/2+cover,y):P(-v.Bf/2+cover,-v.Lf/2+f*v.Lf,y),q=inner?P(-v.Bf/2+f*v.Bf,v.Lf/2-cover,y):P(v.Bf/2-cover,-v.Lf/2+f*v.Lf,y);
      out+=`<line x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}" stroke="${FLEXURE_COLORS[c.key]}" stroke-width="2.4" ${c.face==='top'?'stroke-dasharray="6 3"':''}/>`;
    }
  }
  out+=text(360,394,`${fmt(v.Bf,2)} × ${fmt(v.Lf,2)} m · t ${fmt(v.t,0)} mm · ${c.title}`,'text-anchor="middle"')+
    text(360,418,'Selected mat only · symbolic pile stubs / bar placement · development not detailed','text-anchor="middle" font-size="10" fill="var(--ink-soft)"');
  return svg(out,'Selected '+c.title+' reinforcement on the '+v.name.toLowerCase());
}

export function flexureMomentsSVG(v,r) {
  if(!r||r.invalid)return '<div class="fz-note">Selected combination is invalid; design moments are not plotted.</div>';
  if(!v.cases.every(c=>Number.isFinite(r.m[c.key])))return '<div class="fz-note">No finite design moments available.</div>';
  const max=Math.max(1,...v.cases.map(c=>r.m[c.key]))*1.12,X=m=>360+m/max*230;
  let out=text(24,28,'DESIGN-SECTION MOMENTS · SELECTED LRFD COMBINATION','font-weight="600"')+
    text(24,51,r.name,'font-size="11" fill="var(--ink-soft)"');
  out+=`<path d="M360 85V355" stroke="var(--ink-soft)"/>`+text(115,80,'TOP · HOGGING','text-anchor="middle" font-size="10"')+text(570,80,'BOTTOM · SAGGING','text-anchor="middle" font-size="10"');
  v.cases.forEach((c,i)=>{const y=120+i*66,m=r.m[c.key],left=c.face==='top',end=X(left?-m:m),x=Math.min(end,360),w=Math.abs(end-360);
    out+=`<rect x="${x}" y="${y-16}" width="${w}" height="21" rx="3" fill="${FLEXURE_COLORS[c.key]}"/>`+
      text(24,y+24,c.title,'font-size="11"')+text(left?end-8:end+8,y,fmt(m,2)+' kN·m',`text-anchor="${left?'end':'start'}" font-size="11"`);
  });
  out+=text(360,409,'Magnitudes at the checked sections · top shown left, bottom right','text-anchor="middle" font-size="11" fill="var(--ink-soft)"')+
    text(360,428,'Each value can govern at a different face / point; no continuous moment field is implied','text-anchor="middle" font-size="10" fill="var(--ink-soft)"');
  return svg(out,'Four design-section moments for '+r.name);
}
