// Anchor embedment views. Only Bp/Lp, bolt coordinates, and hef are geometric inputs.
// Concrete below the embedment is cropped; no pedestal height or base-plate detail is inferred.
import { escapeHtml } from '../core/dom.js?v=20261028p3';
import { fmt } from '../core/format.js?v=20261028p3';

export function anchorGeometryDiagramSVG(v, forces, view) {
  const { Bp, Lp } = v.site, hef = v.hef;
  if (!forces?.length || ![Bp,Lp,hef].every(n => Number.isFinite(n) && n > 0) || forces.some(b => ![b.x,b.y,b.tension].every(Number.isFinite))) return '<div class="fz-note">Complete the anchor geometry first.</div>';
  const cx = forces.reduce((s,b) => s+b.x,0)/forces.length, cz = forces.reduce((s,b) => s+b.y,0)/forces.length;
  const text = (x,y,s,attrs='') => `<text x="${x}" y="${y}" ${attrs}>${escapeHtml(s)}</text>`;
  let shapes = '';
  if (view === 'elev') {
    const s = Math.min(420 / Math.max(Bp, ...forces.map(b => 2*Math.abs(b.x-cx))), 235 / hef);
    const X = x => 320+(x-cx)*s, top=80, head=top+hef*s, bottom=head+32;
    shapes += `<rect x="${X(cx-Bp/2)}" y="${top}" width="${Bp*s}" height="${bottom-top}" fill="var(--bg-subtle)" stroke="var(--line-strong)"/>
      <path d="M${X(cx-Bp/2)} ${bottom}l10 -5l10 10l10 -10l10 5H${X(cx+Bp/2)}" fill="none" stroke="var(--ink-soft)" stroke-dasharray="5 4"/>`;
    const xs = [...new Set(forces.map(b => b.x))].sort((a,b)=>a-b);
    shapes += xs.map(x => {
      const bs=forces.filter(b=>b.x===x), px=X(x), color=bs.some(b=>b.tension>0)?'var(--caution)':'var(--primary)';
      return `<path d="M${px} ${top-20}V${head}m-9 0h18" stroke="${color}" stroke-width="4" fill="none"/>${text(px,top-30,bs.map(b=>'#'+b.i).join('/'),'text-anchor="middle" font-size="11"')}`;
    }).join('');
    shapes += `<path d="M565 ${top}V${head}M560 ${top}h10M560 ${head}h10" stroke="var(--ink-soft)"/>${text(574,(top+head)/2,`hef ${fmt(hef,0)} mm`,'font-size="11"')}
      ${text(320,bottom+25,`Bp ${fmt(Bp,0)} mm · projection along x; coincident rows labelled together`,'text-anchor="middle" font-size="11"')}`;
  } else {
    const depth=hef*1.18, C=Math.cos(Math.PI/6);
    const raw=(x,z,d)=>[(x-z)*C,(x+z)*.5+d];
    const corners=[[-Bp/2,-Lp/2],[Bp/2,-Lp/2],[Bp/2,Lp/2],[-Bp/2,Lp/2]];
    const box=corners.flatMap(([x,z])=>[raw(x,z,-hef*.13),raw(x,z,depth)]);
    const minX=Math.min(...box.map(p=>p[0])),maxX=Math.max(...box.map(p=>p[0])),minY=Math.min(...box.map(p=>p[1])),maxY=Math.max(...box.map(p=>p[1]));
    const s=Math.min(490/(maxX-minX),280/(maxY-minY));
    const P=(x,z,d)=>{const p=raw(x,z,d);return [320+(p[0]-(minX+maxX)/2)*s,205+(p[1]-(minY+maxY)/2)*s];};
    const poly=(pts,cls)=>`<polygon points="${pts.map(p=>P(...p).join(',')).join(' ')}" class="iso-face ${cls}" fill-opacity="0.35"/>`;
    shapes += poly([[Bp/2,-Lp/2,0],[Bp/2,Lp/2,0],[Bp/2,Lp/2,depth],[Bp/2,-Lp/2,depth]],'iso-pedestal iso-sx')+
      poly([[-Bp/2,Lp/2,0],[Bp/2,Lp/2,0],[Bp/2,Lp/2,depth],[-Bp/2,Lp/2,depth]],'iso-pedestal iso-sz')+
      poly(corners.map(([x,z])=>[x,z,0]),'iso-pedestal iso-top');
    shapes += forces.map(b=>{
      const p=P(b.x-cx,b.y-cz,-hef*.12), q=P(b.x-cx,b.y-cz,hef), t=P(b.x-cx,b.y-cz,0),color=b.tension>0?'var(--caution)':'var(--primary)';
      return `<g><title>${escapeHtml(`#${b.i}: tension ${fmt(b.tension,2)} kN`)}</title><path d="M${p}L${q}m-6 0h12" stroke="${color}" stroke-width="3" fill="none" stroke-dasharray="5 2"/><circle cx="${t[0]}" cy="${t[1]}" r="5" fill="${color}"/>${text(p[0],p[1]-10,'#'+b.i,'text-anchor="middle" font-size="11"')}</g>`;
    }).join('');
    shapes += text(320,371,`Bp ${fmt(Bp,0)} × Lp ${fmt(Lp,0)} mm · hef ${fmt(hef,0)} mm`,'text-anchor="middle" font-size="12"');
  }
  return `<svg class="fdn-diagram av-geometry" viewBox="0 0 680 410" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Anchor ${view === 'elev' ? 'elevation' : 'isometric 2.5D'}; embedment zone only" style="font-family:var(--sans);font-size:12px;fill:var(--ink)">${text(25,30,view==='elev'?'ANCHOR ELEVATION':'ANCHOR ISOMETRIC 2.5D','font-weight="600"')}${shapes}${text(340,398,'Embedment zone only · concrete cropped below heads · rod / head thickness symbolic','text-anchor="middle" font-size="10" fill="var(--ink-soft)"')}</svg>`;
}
