// VALIDATION part6 — reciprocating + piperack + skid (hand-calc)
import { unbalancedToBase, unbalancedMoment, reciprocatingLoadingData } from '../reciprocating/loadingData.js';
import { resonanceCheckTwoOrders, amplitudeAt, reciprocatingDynamicCheck } from '../reciprocating/dynamicForceCheck.js';
import { reciprocatingFoundationSizing } from '../reciprocating/foundationSizing.js';
import { pipeVerticalLoad, frictionLoad, anchorThrust } from '../piperack/loadingData.js';
import { pierSelfWeight, sizePierFooting } from '../piperack/foundationSizing.js';
import { sumBoltReactions, skidLoadingData } from '../skidMounted/loadingData.js';
import { skidFoundationSizing } from '../skidMounted/foundationSizing.js';
let pass=0, fail=0;
function eq(n,g,e,t=1e-6){const o=Math.abs(g-e)<=t;if(o){pass++;console.log('PASS '+n+'='+g);}else{fail++;console.log('FAIL '+n+' got='+g+' exp='+e);}}
function ok(n,c,x=''){if(c){pass++;console.log('PASS '+n+' '+x);}else{fail++;console.log('FAIL '+n+' '+x);}}
const ub=unbalancedToBase({F1_kN:5,F2_kN:2,hs_m:1.2});
eq('Fenv',ub.F_env_kN,7,1e-9);eq('H',ub.H,7,1e-9);eq('M',ub.M,8.4,1e-9);
eq('Mcouple',unbalancedMoment({M1_kNm:3,M2_kNm:1}).M,4,1e-9);
const rt=resonanceCheckTwoOrders({f1_Hz:10,f2_Hz:20,fn_Hz:18.177});
ok('r1 pass',Math.abs(10/18.177-0.5502)<0.001);
ok('two-order fail',rt.pass===false&&rt.pass1===true&&rt.pass2===false);
const rs=reciprocatingFoundationSizing({Bf:4,Lf:5,Hf:2,Df:2,gc:2.4,machineMass_kg:3000});
eq('rmass',rs.massRatio,(2.4*20*2*1000)/3000,1e-6);ok('r mass ok',rs.massOk===true);
eq('Pvert',pipeVerticalLoad({pipeWeights_kN:[50,30,20]}).P,100,1e-9);
const fr=frictionLoad({pipeWeights_kN:[100],mu:0.3,height_m:6});
eq('Ffric',fr.H,30,1e-9);eq('Mfric',fr.M,180,1e-9);
const at=anchorThrust({F_kN:40,hp_m:5});eq('AH',at.H,40,1e-9);eq('AM',at.M,200,1e-9);
const pw=pierSelfWeight({Bf:2,Lf:2,Hf:0.6,Df:1.5,gc:2.4,gs:1.8,Bp:0.5,Lp:0.5,Hp:1.0});
eq('pier ton',pw.totalTon,5.76+0.6+6.075,1e-9);
eq('pier kN',pw.totalKN,(5.76+0.6+6.075)*9.80665,1e-6);
const sz=sizePierFooting({P0_kN:400,qa_kPa:150,B0:1.5,L0:1.5,step:0.25,maxB:6,maxIter:40,weightFn:({Bf,Lf})=>pierSelfWeight({Bf,Lf,Hf:0.6,Df:1.5,gc:2.4,gs:1.8,Bp:0.5,Lp:0.5,Hp:1.0}),fixed:{}});
ok('pier converged',sz.converged===true,JSON.stringify({B:sz.B,L:sz.L,q:sz.q_kPa}));
ok('pier q<=qa',sz.q_kPa<=150.0001,'q='+sz.q_kPa);
const sb=sumBoltReactions({bolts:[{x:-1,P_kN:100,Hx_kN:5,Hy_kN:0},{x:1,P_kN:100,Hx_kN:5,Hy_kN:0}]});
eq('boltP',sb.P,200,1e-9);eq('boltHx',sb.Hx,10,1e-9);eq('boltMx',sb.Mx,0,1e-9);
const sk=skidFoundationSizing({skidB:3,skidL:6,edge:0.3,Hf:0.5,Df:1.2,gc:2.4});
eq('skB',sk.Bf,3.6,1e-9);eq('skL',sk.Lf,6.6,1e-9);eq('skW',sk.Wf_ton,2.4*3.6*6.6*0.5,1e-9);
console.log(`PART6: ${pass} pass, ${fail} fail`);
process.exit(fail>0?1:0);
