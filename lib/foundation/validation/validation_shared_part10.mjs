// VALIDATION part10 — pile cap flexure at the pedestal faces, both axes, bottom and top face (hand-calc)
import { pileCapMoment, pileCapMomentAxis } from '../shared/footingCheck.js';
let pass=0, fail=0;
function eq(n,g,e,t=1e-9){const o=Math.abs(g-e)<=t;if(o){pass++;console.log('PASS '+n+'='+g);}else{fail++;console.log('FAIL '+n+' got='+g+' exp='+e);}}
function ok(n,c,x=''){if(c){pass++;console.log('PASS '+n+' '+x);}else{fail++;console.log('FAIL '+n+' '+x);}}

// 6 piles: x = -1.2, 0, +1.2 ; y = -0.6, +0.6.  Pedestal half-size 0.4 (x), 0.1 (y test).
const mk = (F) => { const p=[]; let i=0; for (const y of [-0.6,0.6]) for (const x of [-1.2,0,1.2]) { i++; p.push({i,x,y,F:F(x,y)}); } return p; };
const flat = mk(() => 100);

// x axis, all 100 kN: each outer column (2 piles) at arm 1.2 - 0.4 = 0.8 -> 2*100*0.8 = 160 both sides
const a = pileCapMomentAxis(flat, 'x', 0, 0.4);
eq('x flat plus',a.plus,160); eq('x flat minus',a.minus,160); eq('x flat bottom',a.bottom,160); eq('x flat top',a.top,0);

// uplift piles (F = -40) on the +x column: plus side net = 2*(-40)*0.8 = -64 (hogging), minus side +160
const up = mk((x) => (x > 1 ? -40 : 100));
const b = pileCapMomentAxis(up, 'x', 0, 0.4);
eq('uplift plus',b.plus,-64); eq('uplift minus',b.minus,160); eq('uplift bottom (worse side)',b.bottom,160); eq('uplift top',b.top,64);

// all outer piles in uplift, inner piles compression: both sides hogging -> no bottom moment, top = 64
const allUp = mk((x) => (Math.abs(x) > 1 ? -40 : 100));
const c = pileCapMomentAxis(allUp, 'x', 0, 0.4);
eq('all uplift bottom',c.bottom,0); eq('all uplift top',c.top,64);

// pedestal offset 0.5 in x: + side x=1.2 -> c = 0.7, arm 0.3 -> 2*100*0.3 = 60;
// - side: x=-1.2 -> c = -1.7 arm 1.3 -> 260 ; x=0 -> c = -0.5 arm 0.1 -> 20  => 280
const d = pileCapMomentAxis(flat, 'x', 0.5, 0.4);
eq('offset plus',d.plus,60); eq('offset minus',d.minus,280); eq('offset bottom',d.bottom,280);

// y axis: piles y = +-0.6, crit 0.1 -> arm 0.5; 3 piles per side -> 3*100*0.5 = 150
const e = pileCapMomentAxis(flat, 'y', 0, 0.1);
eq('y flat plus',e.plus,150); eq('y flat minus',e.minus,150); eq('y bottom',e.bottom,150);
// y axis with the +y row in uplift (-30): plus = 3*(-30)*0.5 = -45, minus = 150
const f = pileCapMomentAxis(mk((x,y) => (y > 0 ? -30 : 100)), 'y', 0, 0.1);
eq('y uplift plus',f.plus,-45); eq('y uplift top',f.top,45); eq('y uplift bottom',f.bottom,150);
// pedestal offset in y: ref 0.2 -> + side y=0.6: c=0.4 arm 0.3 -> 3*100*0.3 = 90; - side y=-0.6: c=-0.8 arm 0.7 -> 210
const g = pileCapMomentAxis(flat, 'y', 0.2, 0.1);
eq('y offset plus',g.plus,90); eq('y offset minus',g.minus,210);

// consistent with the older x-only function on the bottom moment
ok('x bottom == pileCapMoment (flat)',Math.abs(a.bottom-pileCapMoment(flat,0,0.4))<1e-9);
ok('x bottom == pileCapMoment (uplift)',Math.abs(b.bottom-pileCapMoment(up,0,0.4))<1e-9);
// piles inside the section contribute nothing
eq('piles inside section only',pileCapMomentAxis(flat,'x',0,1.5).bottom,0);
ok('empty layout',pileCapMomentAxis([],'x',0,0.4).bottom===0);
console.log(`PART10: ${pass} pass, ${fail} fail`);
process.exit(fail>0?1:0);
