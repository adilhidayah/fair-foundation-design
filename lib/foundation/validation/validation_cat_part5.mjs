// VALIDATION part5 — static + rotating (hand-calc)
import { staticDeadLoad, staticWindLoad, staticLoadingData } from '../static/loadingData.js';
import { foundationSizing } from '../static/foundationSizing.js';
import { buildStdCombos, stdComboVector, loadTypeVector, buildComboBase, LOAD_KINDS, DEFAULT_KIND_BY_CODE } from '../shared/loadCombinations.js';
import { unbalanceForce, rotatingLoadingData } from '../rotating/loadingData.js';
import { naturalFrequency, resonanceCheck, vibrationAmplitude, rotatingVibrationCheck } from '../rotating/vibrationCheck.js';
import { rotatingFoundationSizing } from '../rotating/foundationSizing.js';
let pass=0, fail=0;
function eq(n,g,e,t=1e-6){const o=Math.abs(g-e)<=t;if(o){pass++;console.log('PASS '+n+'='+g);}else{fail++;console.log('FAIL '+n+' got='+g+' exp='+e);}}
function ok(n,c,x=''){if(c){pass++;console.log('PASS '+n+' '+x);}else{fail++;console.log('FAIL '+n+' '+x);}}
const d=staticDeadLoad({operatingWeight_kN:500,eccentricity_m:0.1});
eq('D.P',d.P,500,1e-9);eq('D.M',d.M,50,1e-9);
const w=staticWindLoad({Fw_kN:60,hw_m:5});eq('W.H',w.H,60,1e-9);eq('W.M',w.M,300,1e-9);
const ld=staticLoadingData({dead:{operatingWeight_kN:500},wind:{Fw_kN:60,hw_m:5}});
ok('ld keys',ld.D&&ld.W&&!ld.L);
// pedestal: Bf2 Lf2 Hf0.6 Df1.5 gc2.4 gs1.8 Bp0.5 Lp0.5 Gp1 Dp0.9 Hp1.9 Ap0.25
const fs=foundationSizing({type:'pedestal',Bf:2,Lf:2,Hf:0.6,Df:1.5,gc:2.4,gs:1.8,Bp:0.5,Lp:0.5,pedGp:1.0,OffX:0,OffZ:0});
eq('Wf',fs.Wf,2.4*4*0.6,1e-9);eq('Dp',fs.Dp,0.9,1e-9);eq('Hp',fs.Hp,1.9,1e-9);
eq('Wp',fs.Wp,2.4*0.25*1.9,1e-9);eq('Ws',fs.Ws,1.8*(4-0.25)*0.9,1e-9);
eq('dH',fs.deltaH,2.5,1e-9);
// pedestal + grout 25 mm: Hp=1.0+0.9+0.025=1.925  Wp=2.4*0.25*(1.0+0.9)=1.14 (concrete only)
// Wg=2.4*0.25*0.025=0.015 (grouting, separate)  dH=1.925+0.6=2.525  total = no-grout total + Wg
const fg=foundationSizing({type:'pedestal',Bf:2,Lf:2,Hf:0.6,Df:1.5,gc:2.4,gs:1.8,Bp:0.5,Lp:0.5,pedGp:1.0,OffX:0,OffZ:0,groutT:0.025});
eq('grout Hp',fg.Hp,1.925,1e-9);eq('grout Wp',fg.Wp,1.14,1e-9);eq('grout Wg',fg.Wg,0.015,1e-9);eq('grout dH',fg.deltaH,2.525,1e-9);
eq('no grout Wg',fs.Wg,0,1e-9);
eq('grout W',fg.totalWeightTon,fs.totalWeightTon+0.015,1e-9);eq('no grout t',fs.groutT,0,1e-9);
// block (footing/pile cap only): Bf2.4 Lf2.4 Hf0.4 Df1.0 gc2.4 gs1.8 -> Af5.76 hs0.6
// Wf=2.4*5.76*0.4=5.5296  Ws=1.8*5.76*0.6=6.2208  total=11.7504 t  dH=Hf=0.4  Gp=0
const fb=foundationSizing({type:'block',Bf:2.4,Lf:2.4,Hf:0.4,Df:1.0,gc:2.4,gs:1.8});
eq('blk Hf',fb.Hf,0.4,1e-9);eq('blk hs',fb.hs,0.6,1e-9);eq('blk Wf',fb.Wf,5.5296,1e-9);
eq('blk Ws',fb.Ws,6.2208,1e-9);eq('blk W',fb.totalWeightTon,11.7504,1e-9);
eq('blk dH',fb.deltaH,0.4,1e-9);eq('blk Gp',fb.Gp,0,1e-9);
const fbFlush=foundationSizing({type:'block',Bf:2,Lf:2,Hf:0.5,Df:0.5,gc:2.4,gs:1.8});
eq('blk flush Ws',fbFlush.Ws,0,1e-9);
// block + grout 25 mm: HfTot=0.425 Wf=2.4*5.76*0.4=5.5296 (concrete only) Wg=2.4*5.76*0.025=0.3456
// hs=0.575 Ws=1.8*5.76*0.575=5.9616 W=5.5296+0.3456+5.9616=11.8368 dH=0.425
const fbg=foundationSizing({type:'block',Bf:2.4,Lf:2.4,Hf:0.4,Df:1.0,gc:2.4,gs:1.8,groutT:0.025});
eq('blkG HfTot',fbg.HfTot,0.425,1e-9);eq('blkG Wf',fbg.Wf,5.5296,1e-9);eq('blkG Wg',fbg.Wg,0.3456,1e-9);eq('blkG hs',fbg.hs,0.575,1e-9);
eq('blkG Ws',fbg.Ws,5.9616,1e-9);eq('blkG W',fbg.totalWeightTon,11.8368,1e-9);eq('blkG dH',fbg.deltaH,0.425,1e-9);
// flush cap (Df=Hf) + grout above grade: hs clamps to 0, still valid, dH=0.525
const fbgF=foundationSizing({type:'block',Bf:2,Lf:2,Hf:0.5,Df:0.5,gc:2.4,gs:1.8,groutT:0.025});
ok('blkG flush valid',fbgF.valid===true);eq('blkG flush hs',fbgF.hs,0,1e-9);eq('blkG flush dH',fbgF.deltaH,0.525,1e-9);
// block projecting above grade (user decision 26 Sep 2026: allowed, bottom must not be above grade):
// Hf=0.8 Df=0.5 -> Gp=0.3 above grade, no backfill (hs=0, Ws=0), Wf=2.4*4*0.8=7.68 t = total, dH=0.8
const fbP=foundationSizing({type:'block',Bf:2,Lf:2,Hf:0.8,Df:0.5,gc:2.4,gs:1.8});
ok('blk Df<Hf now valid (projects)',fbP.valid===true);eq('blkP Gp',fbP.Gp,0.3,1e-9);eq('blkP hs',fbP.hs,0,1e-9);
eq('blkP Ws',fbP.Ws,0,1e-9);eq('blkP Wf',fbP.Wf,7.68,1e-9);eq('blkP W',fbP.totalWeightTon,7.68,1e-9);eq('blkP dH',fbP.deltaH,0.8,1e-9);
// + grout 25 mm: Wg=2.4*4*0.025=0.24, W=7.92, dH=0.825, Gp (concrete projection) stays 0.3
const fbPg=foundationSizing({type:'block',Bf:2,Lf:2,Hf:0.8,Df:0.5,gc:2.4,gs:1.8,groutT:0.025});
eq('blkPG Wg',fbPg.Wg,0.24,1e-9);eq('blkPG W',fbPg.totalWeightTon,7.92,1e-9);eq('blkPG dH',fbPg.deltaH,0.825,1e-9);eq('blkPG Gp',fbPg.Gp,0.3,1e-9);
// resting on grade (Df=0) valid; negative Df (floating) invalid; pedestal type still needs Df >= Hf
ok('blk Df=0 valid',foundationSizing({type:'block',Bf:2,Lf:2,Hf:0.8,Df:0,gc:2.4,gs:1.8}).valid===true);
ok('blk Df<0 invalid',foundationSizing({type:'block',Bf:2,Lf:2,Hf:0.8,Df:-0.1,gc:2.4,gs:1.8}).valid===false);
ok('ped Df<Hf invalid',foundationSizing({type:'pedestal',Bf:2,Lf:2,Hf:0.8,Df:0.5,gc:2.4,gs:1.8,Bp:0.5,Lp:0.5,pedGp:0.3,OffX:0,OffZ:0}).valid===false);
// std combo seismic codes (24 Sep 2026): operating EQX(O)/EQZ(O), empty EQX(E)/EQZ(E), no legacy VX/VZ keys. SDS=0.5
// LC111 (1+0.14*0.5)=1.07[D+E(E)] + 0.7(EQX(E) + 0.3EQZ(E)); LC121 (1+0.105*0.5)[D+E(O)] + 0.75L + 0.525(EQX(O) + 0.3EQZ(O))
const sc=buildStdCombos(0.5); const c111=sc.find(c=>c.lc==='111'), c121=sc.find(c=>c.lc==='121');
eq('LC111 EQX(E)',c111.f['EQX(E)'],0.7,1e-9);eq('LC111 EQZ(E)',c111.f['EQZ(E)'],0.21,1e-9);eq('LC111 D',c111.f.D,1.07,1e-9);
eq('LC121 EQX(O)',c121.f['EQX(O)'],0.525,1e-9);eq('LC121 EQZ(O)',c121.f['EQZ(O)'],0.1575,1e-9);
ok('no VX/VZ keys',sc.every(c=>!('VX' in c.f)&&!('VZ' in c.f)));
// load type kinds (24 Sep 2026): direction from kind, not from the code/notation.
// eqZ H45 M70 dh1.275 -> Fz45 Mx-70 dMx-(45*1.275)=-57.375 ; dead P500 H10 M5 dh2 -> P500 Fx10 Mz5 dMz20
const vz=loadTypeVector('eqZ',{P:9,H:45,M:70},1.275);
eq('kind eqZ Fz',vz.Fz,45,1e-9);eq('kind eqZ Mx',vz.Mx,-70,1e-9);eq('kind eqZ dMx',vz.dMx,-57.375,1e-9);eq('kind eqZ P ignored',vz.P,0,1e-9);eq('kind eqZ Fx',vz.Fx,0,1e-9);
const vd=loadTypeVector('dead',{P:500,H:10,M:5},2);
eq('kind dead P',vd.P,500,1e-9);eq('kind dead Fx',vd.Fx,10,1e-9);eq('kind dead dMz',vd.dMz,20,1e-9);
// dead with biaxial H/M: Hx10 Mz5 Hz4 Mx-3 dh2 -> Fz4 Mx-3 dMx=-(4*2)=-8 ; lateral kind ignores Hz/Mx
const vd2=loadTypeVector('dead',{P:500,H:10,M:5,Hz:4,Mx:-3},2);
eq('kind dead Fz',vd2.Fz,4,1e-9);eq('kind dead Mx',vd2.Mx,-3,1e-9);eq('kind dead dMx',vd2.dMx,-8,1e-9);eq('kind dead Fx still',vd2.Fx,10,1e-9);
const vx2=loadTypeVector('windX',{H:60,M:90,Hz:7,Mx:7},1);
eq('kind windX ignores Hz',vx2.Fz,0,1e-9);eq('kind windX ignores Mx',vx2.Mx,0,1e-9);
ok('kind unknown -> null',loadTypeVector('bogus',{P:1},1)===null);
// engineer notation: "V" = seismic X, "DL" = dead. V factor 0.7, H45 M70 -> Fx 31.5, Mz 49 ; dW 100 goes on DL
const cb=buildComboBase([{code:'V',kind:'eqX',H:45,M:70},{code:'DL',kind:'dead',P:500},{code:'Q',kind:undefined,P:9}],1,100);
eq('base DL dP',cb.base.DL.dP,100,1e-9);ok('base untyped Q',cb.untyped.length===1&&cb.untyped[0]==='Q');ok('base Q excluded',!('Q' in cb.base));
const vv=stdComboVector({V:0.7,DL:1},cb.base);
eq('V combo Fx',vv.Fx,31.5,1e-9);eq('V combo Mz',vv.Mz,49,1e-9);eq('V combo P',vv.P,500,1e-9);eq('V combo dP',vv.dP,100,1e-9);
// D preferred for dW when both D and another dead-kind code exist
const cb2=buildComboBase([{code:'SW',kind:'dead',P:10},{code:'D',kind:'dead',P:800}],1,50);
eq('dW on D',cb2.base.D.dP,50,1e-9);eq('dW not on SW',cb2.base.SW.dP,0,1e-9);
ok('every default kind exists',Object.values(DEFAULT_KIND_BY_CODE).every(k=>LOAD_KINDS[k]));
ok('empty combos no operating codes',sc.filter(c=>c.cond==='Empty Condition').every(c=>!('EQX(O)' in c.f)&&!('EQZ(O)' in c.f)));
// unbalance: m=100 e=0.05mm rpm=3000 -> om=314.159 F=100*5e-5*98696=493.48N=0.4935kN
const ub=unbalanceForce({mass_kg:100,ecc_mm:0.05,rpm:3000});
eq('F0',ub.F0_kN,100*(0.05/1000)*Math.pow(2*Math.PI*3000/60,2)/1000,1e-9);
// fn: k=200000kN/m m=5000kg -> fn=1/2pi*sqrt(2e8/5000)=31.831Hz
const nf=naturalFrequency({stiffness_kNpm:200000,mass_kg:5000});
eq('fn',nf.fn_Hz,(1/(2*Math.PI))*Math.sqrt(2e8/5000),1e-9);
const rc=resonanceCheck({fOp_Hz:50,fn_Hz:31.831});
eq('ratio',rc.ratio,50/31.831,1e-6);ok('res pass',rc.pass===true);
const rc2=resonanceCheck({fOp_Hz:30,fn_Hz:31.831});
ok('res fail inside band',rc2.pass===false);
// amplitude r=0: X=F0/k=2000N/2e8=1e-5m=0.01mm
const am=vibrationAmplitude({F0_kN:2,stiffness_kNpm:200000,fOp_Hz:0,fn_Hz:31.831,zeta:0.1,allow_mm:0.1});
eq('X0',am.X_mm,0.01,1e-9);
const rs=rotatingFoundationSizing({Bf:3,Lf:4,Hf:1.5,Df:1.5,gc:2.4,machineMass_kg:5000});
eq('block kg',rs.blockMass_kg,2.4*12*1.5*1000,1e-6);
eq('ratio',rs.massRatio,(2.4*12*1.5*1000)/5000,1e-9);ok('mass ok',rs.massOk===true);
console.log(`PART5: ${pass} pass, ${fail} fail`);
process.exit(fail>0?1:0);
