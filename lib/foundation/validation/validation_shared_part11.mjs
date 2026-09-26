// VALIDATION part11 — punching shear with unbalanced moment, ACI 318M-19 §8.4.4.2 (hand-calc)
import { eccentricPunchingStress } from '../shared/footingCheck.js';
let pass=0, fail=0;
function eq(n,g,e,t=1e-6){const o=Math.abs(g-e)<=t;if(o){pass++;console.log('PASS '+n+'='+g);}else{fail++;console.log('FAIL '+n+' got='+g+' exp='+e);}}
function ok(n,c,x=''){if(c){pass++;console.log('PASS '+n+' '+x);}else{fail++;console.log('FAIL '+n+' '+x);}}

// Square: c1 = c2 = 500, d = 400 -> b1 = b2 = 900, bo = 3600, gf = 1/(1 + 2/3) = 0.6, gv = 0.4, c = 450
// Jc = 400·900³/6 + 900·400³/6 + 400·900·900²/2 = 48.6e9 + 9.6e9 + 145.8e9 = 204.0e9 mm⁴
const a = eccentricPunchingStress({ c1: 500, c2: 500, d: 400, Vu: 500, Mz: 100 });
eq('bo',a.bo,3600,1e-9); eq('Jc',a.terms[0].Jc,204.0e9,1); eq('gv',a.terms[0].gv,0.4,1e-12);
eq('vDirect = 500e3/(3600·400)',a.vDirect,0.3472222,1e-6);
eq('v moment = 0.4·1e8·450/204e9',a.terms[0].v,0.0882353,1e-6);
eq('vu',a.vu,0.3472222+0.0882353,1e-6);
eq('no Mx term',a.terms[1].v,0,1e-12);
// biaxial, square: equal moments -> twice the moment term
const b = eccentricPunchingStress({ c1: 500, c2: 500, d: 400, Vu: 500, Mz: 100, Mx: -100 });
eq('biaxial square vu (|M| used)',b.vu,0.3472222+2*0.0882353,1e-6);
// Rectangular: c1 = 600, c2 = 400, d = 400 -> Mz: b1 = 1000, b2 = 800; Mx: b1 = 800, b2 = 1000
const r = eccentricPunchingStress({ c1: 600, c2: 400, d: 400, Vu: 0, Mz: 100, Mx: 100 });
eq('gf z = 1/(1+(2/3)√1.25)',r.terms[0].gf,0.5729490,1e-6);
eq('gf x = 1/(1+(2/3)√0.8)',r.terms[1].gf,0.6264548,1e-6);
// Jc z = 400·1000³/6 + 1000·400³/6 + 400·800·1000²/2 = 66.667e9 + 10.667e9 + 160e9 = 237.333e9
eq('Jc z',r.terms[0].Jc,237.3333333e9,1e3);
eq('v z = 0.427051·1e8·500/237.333e9',r.terms[0].v,0.4270510*1e8*500/237.3333333e9,1e-7);
// Jc x = 400·800³/6 + 800·400³/6 + 400·1000·800²/2 = 34.133e9 + 8.533e9 + 128e9 = 170.667e9
eq('Jc x',r.terms[1].Jc,170.6666667e9,1e3);
eq('v x = 0.373545·1e8·400/170.667e9',r.terms[1].v,(1-0.6264548)*1e8*400/170.6666667e9,1e-7);
ok('edge location not implemented',eccentricPunchingStress({ c1: 500, c2: 500, d: 400, Vu: 1, loc: 'edge' }).valid===false);
ok('d = 0 invalid',eccentricPunchingStress({ c1: 500, c2: 500, d: 0, Vu: 1 }).valid===false);
console.log(`PART11: ${pass} pass, ${fail} fail`);
process.exit(fail>0?1:0);
