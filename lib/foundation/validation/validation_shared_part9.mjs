// VALIDATION part9 — LRFD combination set (ASCE 7-22 §2.3.1 / §2.3.6) + pile cap shear from pile reactions (hand-calc)
import { buildLrfdCombos } from '../shared/loadCombinations.js';
import { pileShearFraction, oneWayPileShear, signedDistanceToRect, punchingPileShear } from '../shared/pileCapShear.js';
let pass=0, fail=0;
function eq(n,g,e,t=1e-9){const o=Math.abs(g-e)<=t;if(o){pass++;console.log('PASS '+n+'='+g);}else{fail++;console.log('FAIL '+n+' got='+g+' exp='+e);}}
function ok(n,c,x=''){if(c){pass++;console.log('PASS '+n+' '+x);}else{fail++;console.log('FAIL '+n+' '+x);}}

// ---- LRFD set, SDS = 0.5 -> (1.2 + 0.2SDS) = 1.3, (0.9 - 0.2SDS) = 0.8
const L = buildLrfdCombos(0.5);
ok('27 combinations, numbered 201-227',L.length===27 && L[0].lc==='201' && L[26].lc==='227');
ok('lc numbers unique',new Set(L.map(c=>c.lc)).size===L.length);
const by = (f) => L.find(c => c.formula === f);
const c1 = by('1.4[D + E(E)]');
eq('1.4D  D',c1.f.D,1.4); eq('1.4D  E(E)',c1.f['E(E)'],1.4);
const c2 = by('1.2[D + E(E)] + 1.6L + 0.5Lr');
eq('1.2D+1.6L+0.5Lr',c2.f.D+c2.f.L*10+c2.f.Lr*100,1.2+16+50);
const cw = by('1.2[D + E(E)] + 1.0WX + L + 0.5Lr');
eq('1.2D+W+L  W',cw.f.WX,1); eq('1.2D+W+L  L',cw.f.L,1); eq('1.2D+W+L  Lr',cw.f.Lr,0.5);
const cu = by('0.9[D + E(E)] + 1.0WZ');
eq('0.9D+W  D',cu.f.D,0.9); eq('0.9D+W  W',cu.f.WZ,1);
const ch = by('(1.2 + 0.2SDS)[D + E(E)] + 1.0(EQX(E) + 0.3EQZ(E)) + L');
eq('(1.2+0.2SDS)D  D',ch.f.D,1.3); eq('  E(E)',ch.f['E(E)'],1.3); eq('  EQX',ch.f['EQX(E)'],1); eq('  EQZ 30%',ch.f['EQZ(E)'],0.3); eq('  L',ch.f.L,1);
const cl = by('(0.9 − 0.2SDS)[D + E(O)] + 1.0(0.3EQX(O) + EQZ(O))');
eq('(0.9-0.2SDS)D  D',cl.f.D,0.8); eq('  EQX 30%',cl.f['EQX(O)'],0.3); eq('  EQZ',cl.f['EQZ(O)'],1);
ok('test condition has no seismic combos',L.filter(c => c.cond === 'Test Condition').every(c => !Object.keys(c.f).some(k => k.startsWith('EQ'))));
ok('SDS = 0 -> 1.2 / 0.9 exactly',buildLrfdCombos(0).find(c=>c.formula.startsWith('(0.9')).f.D===0.9);
ok('every factor positive & finite',L.every(c => Object.values(c.f).every(v => Number.isFinite(v) && v > 0)));

// ---- share of a pile reaction, dp = 0.4 (interpolation between +dp/2 outside and -dp/2 inside)
eq('frac s=+0.3',pileShearFraction(0.3,0.4),1); eq('frac s=+0.2',pileShearFraction(0.2,0.4),1);
eq('frac s=+0.1',pileShearFraction(0.1,0.4),0.75); eq('frac s=0',pileShearFraction(0,0.4),0.5);
eq('frac s=-0.1',pileShearFraction(-0.1,0.4),0.25); eq('frac s=-0.2',pileShearFraction(-0.2,0.4),0);
eq('frac s=-1',pileShearFraction(-1,0.4),0);

// ---- one-way: 6 piles (0,+-0.6), (+-1.2,+-0.6), 100 kN each, pedestal 0.8 (half 0.4) at 0, d = 0.6 -> sections at +-1.0
const mk = (F) => { const p=[]; let i=0; for (const y of [-0.6,0.6]) for (const x of [-1.2,0,1.2]) { i++; p.push({i,x,y,F:F(x,y)}); } return p; };
const flat = mk(() => 100);
const o1 = oneWayPileShear({ pileForces: flat, axis: 'x', center: 0, half: 0.4, d: 0.6, dp: 0.4 });
eq('1-way pos section',o1.pos.plus,1.0); eq('1-way neg section',o1.pos.minus,-1.0);
eq('1-way Vpos (2 piles 0.2 m outside -> full)',o1.Vpos,200,1e-6); eq('1-way Vneg',o1.Vneg,200,1e-6); eq('1-way Vu',o1.Vu,200,1e-6);
const o2 = oneWayPileShear({ pileForces: flat, axis: 'x', center: 0, half: 0.4, d: 0.7, dp: 0.4 });   // section at 1.1: s = 0.1 -> 75 %
eq('1-way d=0.7 Vu = 2*100*0.75',o2.Vu,150,1e-6);
const skew = mk((x) => (x > 0 ? 120 : (x < 0 ? 80 : 100)));
const o3 = oneWayPileShear({ pileForces: skew, axis: 'x', center: 0, half: 0.4, d: 0.6, dp: 0.4 });
eq('1-way asym Vpos',o3.Vpos,240,1e-6); eq('1-way asym Vneg',o3.Vneg,160,1e-6); ok('1-way governing side +',o3.side==='+');
const o4 = oneWayPileShear({ pileForces: flat, axis: 'y', center: 0, half: 0.4, d: 0.1, dp: 0.4 }); // sections at +-0.5, piles y = +-0.6 -> s = 0.1
eq('1-way y-axis Vu = 3*100*0.75',o4.Vu,225,1e-6);
const off = oneWayPileShear({ pileForces: flat, axis: 'x', center: 0.5, half: 0.4, d: 0.6, dp: 0.4 }); // pos+ = 1.5, pos- = -0.5
eq('1-way offset pedestal: + side has no pile beyond',off.Vpos,0,1e-6);
eq('1-way offset pedestal: - side x=-1.2 (s=0.7) full, x=0 (s=-0.5) none',off.Vneg,200,1e-6);
const tens = mk((x) => (x > 1 ? -40 : 100));
const o5 = oneWayPileShear({ pileForces: tens, axis: 'x', center: 0, half: 0.4, d: 0.6, dp: 0.4 });
eq('1-way tension side V = 2*40',o5.Vpos,80,1e-6);
ok('1-way compression side governs over a smaller tension side',o5.Vu===o5.Vneg && Math.abs(o5.Vu-200)<1e-6);
const tens2 = mk((x) => (Math.abs(x) > 1 ? -40 : 100));   // uplift piles on both outer columns, none in compression beyond the sections
const o6 = oneWayPileShear({ pileForces: tens2, axis: 'x', center: 0, half: 0.4, d: 0.6, dp: 0.4 });
eq('1-way tension governs: Vu = 2*40',o6.Vu,80,1e-6); eq('1-way tension Vt',o6.Vt,80,1e-6); eq('1-way tension Vc',o6.Vc,0,1e-9);
ok('1-way bad inputs invalid',oneWayPileShear({ pileForces: [], axis:'x', center:0, half:0.4, d:0.6, dp:0.4 }).valid===false && oneWayPileShear({ pileForces: flat, axis:'x', center:0, half:0.4, d:0, dp:0.4 }).valid===false);

// ---- signed distance to a rectangle (hx = hy = 0.7)
eq('dist outside in x',signedDistanceToRect(1.2,0.6,0,0,0.7,0.7),0.5);
eq('dist inside',signedDistanceToRect(0,0,0,0,0.7,0.7),-0.7);
eq('dist diagonal corner',signedDistanceToRect(1.0,1.0,0,0,0.7,0.7),Math.hypot(0.3,0.3));
eq('dist on the edge',signedDistanceToRect(0.7,0,0,0,0.7,0.7),0);

// ---- punching: pedestal 0.8 x 0.8, d = 0.6 -> perimeter half-size 0.7. Outer piles (+-1.2,+-0.6): s = 0.5 -> full (4 piles);
// inner piles (0,+-0.6): s = -0.1 -> 25 %.  Vu = 400 + 2*0.25*100 = 450
const p1 = punchingPileShear({ pileForces: flat, cx: 0, cy: 0, c1: 0.8, c2: 0.8, d: 0.6, dp: 0.4 });
eq('punching hx',p1.hx,0.7); eq('punching Vu',p1.Vu,450,1e-6);
ok('punching outer/inner shares',Math.abs(p1.perPile[0].frac-1)<1e-9 && Math.abs(p1.perPile[1].frac-0.25)<1e-9);
// one outer pile in tension: compression sum = 300 + 50, tension sum = 100 -> Vu = 350
const pt = mk((x,y) => (x > 1 && y > 0 ? -100 : 100));
const p2 = punchingPileShear({ pileForces: pt, cx: 0, cy: 0, c1: 0.8, c2: 0.8, d: 0.6, dp: 0.4 });
eq('punching with a tension pile: Vc',p2.Vc,350,1e-6); eq('punching Vt',p2.Vt,100,1e-6); eq('punching Vu = max',p2.Vu,350,1e-6);
// pedestal offset 0.5 in x: perimeter x from -0.2 to 1.2 -> piles at x = 1.2 sit ON the perimeter -> 50 %; x=0 inside (s = -0.1... dx=|0-0.5|-0.7=-0.2, dy=-0.1 -> -0.1) 25 %; x=-1.2: dx = 1.7-0.7 = 1.0 -> full
const p3 = punchingPileShear({ pileForces: flat, cx: 0.5, cy: 0, c1: 0.8, c2: 0.8, d: 0.6, dp: 0.4 });
eq('punching offset: 2*0.5 + 2*0.25 + 2*1 (x cols 1.2, 0, -1.2) *100',p3.Vu,(2*0.5+2*0.25+2*1)*100,1e-6);
// equilibrium: with the whole perimeter far inside every pile (small pedestal) Vu = sum of reactions
const p4 = punchingPileShear({ pileForces: flat, cx: 0, cy: 0, c1: 0.2, c2: 0.2, d: 0.2, dp: 0.4 }); // hx = 0.2 -> every pile s > 0.2
eq('punching small pedestal -> Vu = sum F',p4.Vu,600,1e-6);
console.log(`PART9: ${pass} pass, ${fail} fail`);
process.exit(fail>0?1:0);
