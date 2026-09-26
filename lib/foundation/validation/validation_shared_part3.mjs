// VALIDATION part3 — pedestal anchor + footing shear/flexure (hand-calc)
import { computeGoverningCa1, computeAnchorCapacity, evaluateAnchorCombo } from '../shared/pedestalCheck.js';
import { oneWayShearCheck, twoWayShearCheck, pileCapMoment, flexuralDesign } from '../shared/footingCheck.js';
let pass=0, fail=0;
function eq(n,g,e,t=1e-6){const o=Math.abs(g-e)<=t;if(o){pass++;console.log('PASS '+n+'='+g);}else{fail++;console.log('FAIL '+n+' got='+g+' exp='+e);}}
function ok(n,c,x=''){if(c){pass++;console.log('PASS '+n+' '+x);}else{fail++;console.log('FAIL '+n+' '+x);}}
const ca1=computeGoverningCa1([{x:-0.2,y:0},{x:0.2,y:0}],1.0);
eq('ca1',ca1,0.3,1e-9);
const cap=computeAnchorCapacity({ca1:100,da:20,Ase:245,futa:400,hef:300,Abrg:1500,fc:25,lambda:1,anchorType:'cast-in',cracked:true,phiNsa:0.75,phiNcb:0.65,phiNpn:0.65,phiVsa:0.65,phiVcb:0.65,phiVcp:0.65});
eq('Nsa',cap.modesN[0].val,98000,1e-6);
eq('Ncb',cap.modesN[1].val,10*Math.sqrt(25)*Math.pow(300,1.5),1e-3);
const ac=evaluateAnchorCombo([{x:-0.3,y:0},{x:0.3,y:0}],100,20,0,cap);
eq('Tmax',ac.Tmax,0,1e-9);eq('Hi',ac.Hi,10,1e-9);
const ow=oneWayShearCheck({bw:1000,h:500,cc:40,Dbar:25,fc:25,vu:100,rho:0.005,lambda:1,method:'simplified',avOk:true});
eq('d',ow.d,435,1e-9);eq('phiVc',ow.phiVc,0.75*0.17*5*1000*435,1);ok('1way pass',ow.pass===true);
const tw=twoWayShearCheck({c1:500,c2:500,h:500,cc:40,Dbar:25,fc:25,vu:500,lambda:1,loc:'interior'});
eq('bo',tw.bo,3740,1e-9);eq('beta',tw.beta,1,1e-9);ok('vc>0',tw.vc_gov>0);
const mc=pileCapMoment([{x:-1.5,F:100},{x:-0.5,F:100},{x:0.5,F:100},{x:1.5,F:100}],0,0.25);
eq('Mcap',mc,150,1e-9);
const fx=flexuralDesign(100,1000,400,500,25,420);
ok('flex ok',fx.ok===true);eq('AsMin',Math.max(fx.AsMinTS,fx.AsMinFlex),Math.max(0.0018*1000*500,(1.4/420)*1000*400),1e-9);
console.log(`PART3: ${pass} pass, ${fail} fail`);
process.exit(fail>0?1:0);
