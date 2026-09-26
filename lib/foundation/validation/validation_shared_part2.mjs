// VALIDATION part2 — combos + stability (hand-calc)
import { defaultCombos, combineLoadCombo } from '../shared/loadCombinations.js';
import { evaluateFoundationCombo, evaluatePileCombo } from '../shared/stabilityCheck.js';
let pass=0, fail=0;
function eq(n,g,e,t=1e-6){const o=Math.abs(g-e)<=t;if(o){pass++;console.log('PASS '+n+'='+g);}else{fail++;console.log('FAIL '+n+' got='+g+' exp='+e);}}
function ok(n,c,x=''){if(c){pass++;console.log('PASS '+n+' '+x);}else{fail++;console.log('FAIL '+n+' '+x);}}
const loads={D:{P:500,H:0,M:0},L:{P:100,H:0,M:0},W:{P:0,H:60,M:300}};
const c1=defaultCombos().find(c=>c.name==='D + 0.75L + 0.45W');
const r=combineLoadCombo(c1,loads,['D','L','W','E','T'],50,1.5);
eq('Ptop',r.Ptop,575,1e-9);eq('Htop',r.Htop,27,1e-9);eq('Mtop',r.Mtop,135,1e-9);
eq('Pbot',r.Pbot,625,1e-9);eq('Mbot',r.Mbot,175.5,1e-9);
let st=evaluateFoundationCombo(2,2,600,30,60,270,0.5,1/6,1.5,1.5);
eq('e',st.e,0.1,1e-9);eq('qmax',st.qmax,195,1e-9);eq('qmin',st.qmin,105,1e-9);
eq('FSslide',st.fsSliding,10,1e-9);eq('FSot',st.fsOT,10,1e-9);
ok('stab pass',st.overallPass===true);
st=evaluateFoundationCombo(2,2,400,10,200,500,0.5,1/6,1.5,1.5);
eq('Beff',st.Beff,1.0,1e-9);eq('qmax up',st.qmax,200,1e-9);
st=evaluateFoundationCombo(2,2,-5,10,10,200,0.5,1/6,1.5,1.5);
ok('net uplift',st.valid===false&&st.governingUC===Infinity);
const pg=evaluatePileCombo([{x:-1,y:0},{x:1,y:0}],300,20,100,250,100,50);
eq('Fmax',pg.Fmax,200,1e-9);eq('Fmin',pg.Fmin,100,1e-9);eq('ucComp',pg.checks[0].uc,0.8,1e-9);
console.log(`PART2: ${pass} pass, ${fail} fail`);
process.exit(fail>0?1:0);
