// 5A presentation only: section geometry, longitudinal bars and existing P-M results.
import { escapeHtml } from '../core/dom.js?v=20261028f2';
import { fmt } from '../core/format.js?v=20261028f2';

const txt = (x,y,s,attrs='') => `<text x="${x}" y="${y}" ${attrs}>${escapeHtml(s)}</text>`;
const svg = (body,label) => `<svg class="fdn-diagram pd-svg" viewBox="0 0 700 430" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeHtml(label)}" style="font:12px var(--sans);fill:var(--ink)">${body}</svg>`;
const header = title => txt(24,28,title,'font-weight="600"');

// Same two-face bar positions as pedestalSectionSVG / the anchor reinforcement layout.
function positions(v) {
  const zs = v.n === 1 ? [0] : Array.from({length:v.n},(_,i)=>-v.Lp/2+v.dPrime+i*(v.Lp-2*v.dPrime)/(v.n-1));
  return [-v.Bp/2+v.dPrime,v.Bp/2-v.dPrime].flatMap(x=>zs.map(z=>({x,z})));
}

export function pedestalGeometrySVG(v, view) {
  if (![v.Bp,v.Lp,v.Hp,v.dPrime,v.barDia].every(Number.isFinite) || !(v.Bp>0&&v.Lp>0&&v.Hp>0&&v.n>0&&v.dPrime>=0&&2*v.dPrime<Math.min(v.Bp,v.Lp))) return '<div class="fz-note">No valid pedestal geometry available for this view.</div>';
  const h = v.Hp-v.groutT;
  if (!(h>0) || !Number.isFinite(v.groutT) || v.groutT<0) return '<div class="fz-note">Concrete pedestal height and grout geometry must be valid for this view.</div>';
  const bars = positions(v);
  let out=header(view==='iso'?'PEDESTAL · ISOMETRIC 2.5D':'PEDESTAL · ELEVATION');
  if (view==='elev') {
    const s=Math.min(390/v.Bp,260/v.Hp), x0=340-v.Bp*s/2, y0=65, bottom=y0+v.Hp*s;
    out+=`<rect x="${x0}" y="${y0+v.groutT*s}" width="${v.Bp*s}" height="${h*s}" fill="var(--bg-subtle)" stroke="var(--ink-soft)"/>`;
    if(v.groutT>0)out+=`<rect x="${x0}" y="${y0}" width="${v.Bp*s}" height="${v.groutT*s}" fill="var(--caution-bg)" stroke="var(--caution)"/>`;
    for(const x of [-v.Bp/2+v.dPrime,v.Bp/2-v.dPrime]) {
      const px=340+x*s;
      out+=`<line x1="${px}" y1="${y0+v.groutT*s+6}" x2="${px}" y2="${bottom-6}" stroke="var(--primary)" stroke-width="4" stroke-dasharray="7 3"/>`;
    }
    out+=txt(340,y0-14,`${v.n} bars per face projected along z`,'text-anchor="middle"')+
      `<path d="M${x0-25} ${y0}V${bottom}M${x0-30} ${y0}h10M${x0-30} ${bottom}h10" fill="none" stroke="var(--ink-soft)"/>`+
      txt(x0-32,(y0+bottom)/2,`Hp ${fmt(v.Hp,0)} mm`,'text-anchor="end" font-size="11"')+
      txt(340,bottom+27,`Bp ${fmt(v.Bp,0)} mm`,'text-anchor="middle"');
  } else {
    const C=Math.cos(Math.PI/6), raw=(x,z,y)=>[(x-z)*C,(x+z)*.5-y];
    const corners=[[-v.Bp/2,-v.Lp/2],[v.Bp/2,-v.Lp/2],[v.Bp/2,v.Lp/2],[-v.Bp/2,v.Lp/2]];
    const pts=corners.flatMap(([x,z])=>[raw(x,z,0),raw(x,z,v.Hp)]);
    const minX=Math.min(...pts.map(p=>p[0])),maxX=Math.max(...pts.map(p=>p[0])),minY=Math.min(...pts.map(p=>p[1])),maxY=Math.max(...pts.map(p=>p[1]));
    const s=Math.min(500/(maxX-minX),280/(maxY-minY));
    const P=(x,z,y)=>{const p=raw(x,z,y);return [350+(p[0]-(minX+maxX)/2)*s,205+(p[1]-(minY+maxY)/2)*s];};
    const poly=(ps,kind)=>`<polygon class="iso-face iso-${kind}" points="${ps.map(p=>P(...p).join(',')).join(' ')}" fill-opacity="0.3"/>`;
    const box=(lo,hi,kind)=>poly([[v.Bp/2,-v.Lp/2,lo],[v.Bp/2,v.Lp/2,lo],[v.Bp/2,v.Lp/2,hi],[v.Bp/2,-v.Lp/2,hi]],`${kind} iso-sx`)+poly([[-v.Bp/2,v.Lp/2,lo],[v.Bp/2,v.Lp/2,lo],[v.Bp/2,v.Lp/2,hi],[-v.Bp/2,v.Lp/2,hi]],`${kind} iso-sz`)+poly(corners.map(([x,z])=>[x,z,hi]),`${kind} iso-top`);
    out+=box(0,h,'pedestal');
    if(v.groutT>0)out+=box(h,v.Hp,'grout');
    out+=bars.map(b=>{const p=P(b.x,b.z,0),q=P(b.x,b.z,h);return `<line x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}" stroke="var(--primary)" stroke-width="2" stroke-dasharray="5 3"/>`;}).join('');
    out+=txt(350,371,`${fmt(v.Bp,0)} × ${fmt(v.Lp,0)} × Hp ${fmt(v.Hp,0)} mm · ${v.n*2} D${fmt(v.barDia,0)}`,'text-anchor="middle"');
  }
  out+=txt(350,401,'Longitudinal bar layout only · ties and end anchorage not detailed','text-anchor="middle" font-size="11" fill="var(--ink-soft)"');
  if(v.groutT>0)out+=txt(350,417,`Hp includes grout ${fmt(v.groutT,0)} mm; longitudinal bars shown in concrete`,'text-anchor="middle" font-size="10" fill="var(--ink-soft)"');
  return svg(out,'Pedestal '+view+' with the designed two-face longitudinal reinforcement');
}

export function pedestalPMFocusSVG(v, selected) {
  const curve=v.curve.filter(p=>[p.phiMn,p.phiPn].every(Number.isFinite));
  const points=v.perCombo.filter(p=>[p.Mu,p.Pu].every(Number.isFinite));
  if(curve.length<2 || !points.length)return '<div class="fz-note">No finite P–M diagram available.</div>';
  const maxM=Math.max(1,...curve.map(p=>p.phiMn/1e6),...points.map(p=>Math.abs(p.Mu)))*1.12;
  const maxP=Math.max(1,...curve.map(p=>p.phiPn/1000),...points.map(p=>p.Pu))*1.08;
  const minP=Math.min(0,...curve.map(p=>p.phiPn/1000),...points.map(p=>p.Pu))*1.08;
  const X=m=>86+m/maxM*565,Y=p=>65+(maxP-p)/(maxP-minP)*290;
  let out=header('P–M INTERACTION · FACTORED CURVE');
  for(let i=0;i<=4;i++) {
    const m=maxM*i/4,p=minP+(maxP-minP)*i/4;
    out+=`<path d="M${X(m)} 65V355M86 ${Y(p)}H651" stroke="var(--line)" stroke-dasharray="3 4" fill="none"/>`+
      txt(X(m),377,fmt(m,0),'text-anchor="middle" font-size="10"')+txt(76,Y(p)+4,fmt(p,0),'text-anchor="end" font-size="10"');
  }
  out+=`<path d="M86 65V355M86 ${Y(0)}H651" stroke="var(--ink-soft)" fill="none"/><polyline class="pm-curve" points="${curve.map(p=>[X(p.phiMn/1e6),Y(p.phiPn/1000)].join(',')).join(' ')}"/>`;
  out+=points.map(p=>`<circle cx="${X(Math.abs(p.Mu))}" cy="${Y(p.Pu)}" r="3.5" fill="${p.uc<=1?'var(--pass)':'var(--fail)'}" opacity="0.65"><title>${escapeHtml(`LC ${p.combo.lc || p.combo.name}: Pu ${fmt(p.Pu,1)} kN, Mu ${fmt(p.Mu,1)} kN·m, UC ${fmt(p.uc,3)}`)}</title></circle>`).join('');
  if(selected&&[selected.Mu,selected.Pu].every(Number.isFinite)) {
    const x=X(Math.abs(selected.Mu)),y=Y(selected.Pu);
    if(!selected.outOfRange&&Number.isFinite(selected.phiMn))out+=`<path d="M${x} ${y}H${X(selected.phiMn)}" stroke="var(--caution)" stroke-dasharray="5 4"/><rect x="${X(selected.phiMn)-4}" y="${y-4}" width="8" height="8" fill="var(--primary)"/>`;
    out+=`<circle cx="${x}" cy="${y}" r="6" fill="var(--caution)" stroke="var(--panel)" stroke-width="1.5"/>`+
      txt(Math.min(x+12,540),Math.max(52,y-12),`LC ${selected.combo.lc || 'selected'}`,'font-size="11" fill="var(--caution)" font-weight="600"');
  }
  out+=txt(651,402,'M / φMn (kN·m) →','text-anchor="end"')+txt(14,51,'P / φPn (kN)','font-size="11"')+
    txt(86,423,'Blue: design curve / capacity at Pu · orange: selected demand · dots: all combinations','font-size="10" fill="var(--ink-soft)"');
  return svg(out,'Factored pedestal P–M curve, all LRFD load points and selected combination');
}
