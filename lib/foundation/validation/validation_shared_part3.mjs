// VALIDATION part3 — pedestal anchor + footing shear/flexure (hand-calc)
import { computeGoverningCa1, computeAnchorCapacity, evaluateAnchorCombo } from '../shared/pedestalCheck.js';
import { oneWayShearCheck, twoWayShearCheck, pileCapMoment, flexuralDesign, barLayout } from '../shared/footingCheck.js';
import { pedestalShearCheck, searchPedestalBars } from '../shared/pedestalCheck.js';
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
// bolt coordinates in m (the UI converts its mm inputs): 4 bolts at (+-0.15, +-0.15), P = 0, M = 54 kN·m
// sum dx^2 = 4 * 0.15^2 = 0.09 -> T = 54 * 0.15 / 0.09 = 90 kN on the two bolts at x = -0.15
const ab4=evaluateAnchorCombo([{x:-0.15,y:-0.15},{x:0.15,y:-0.15},{x:-0.15,y:0.15},{x:0.15,y:0.15}],0,0,54,cap);
eq('Tmax 4 bolts M only',ab4.Tmax,90,1e-9);
// with P = 100 kN compression: T = 90 - 100/4 = 65 kN
eq('Tmax 4 bolts P + M',evaluateAnchorCombo([{x:-0.15,y:0},{x:0.15,y:0},{x:-0.15,y:0.3},{x:0.15,y:0.3}],100,0,54,cap).Tmax,65,1e-9);
const ow=oneWayShearCheck({bw:1000,h:500,cc:40,Dbar:25,fc:25,vu:100,rho:0.005,lambda:1,method:'simplified',avOk:true});
eq('d',ow.d,435,1e-9);eq('phiVc',ow.phiVc,0.75*0.17*5*1000*435,1);ok('1way pass',ow.pass===true);
const tw=twoWayShearCheck({c1:500,c2:500,h:500,cc:40,Dbar:25,fc:25,vu:500,lambda:1,loc:'interior'});
eq('bo',tw.bo,3740,1e-9);eq('beta',tw.beta,1,1e-9);ok('vc>0',tw.vc_gov>0);
const mc=pileCapMoment([{x:-1.5,F:100},{x:-0.5,F:100},{x:0.5,F:100},{x:1.5,F:100}],0,0.25);
eq('Mcap',mc,150,1e-9);
const fx=flexuralDesign(100,1000,400,500,25,420);
ok('flex ok',fx.ok===true);eq('AsMin',fx.AsMin,0.0018*1000*500,1e-9);eq('AsMin fy 500 = max(0.0018·420/500, 0.0014)·b·t',flexuralDesign(100,1000,400,500,25,500).AsMin,0.0018*420/500*1000*500,1e-9);eq('AsMin fy 400 = 0.0020·b·t',flexuralDesign(100,1000,400,500,25,400).AsMin,0.0020*1000*500,1e-9);eq('AsMin fy 600 floor 0.0014',flexuralDesign(100,1000,400,500,25,600).AsMin,0.0014*1000*500,1e-9);eq('AsMin beam option = max(0.0018bt, 1.4bd/fy)',flexuralDesign(100,1000,400,300,25,420,'beam').AsMin,Math.max(0.0018*1000*300,1.4/420*1000*400),1e-9);{const Ab=Math.PI/4*13*13, l1=barLayout(648,1200,13,300);eq('barLayout s = floor(Ab·b/As / 25)·25 = 225',l1.s,Math.floor(Ab*1200/648/25)*25,1e-12);eq('barLayout As,prov = Ab·b/s ≥ As',l1.AsProv,Ab*1200/225,1e-9);ok('barLayout As,prov ≥ As',l1.AsProv>=648);eq('barLayout n = ceil(b/s)',l1.n,6,0);eq('barLayout s ≤ min(3t, 450): small As -> 450',barLayout(100,1000,13,300).s,450,0);eq('barLayout thin t 120 -> s ≤ 360 -> 350',barLayout(100,1000,13,120).s,350,0);ok('barLayout As too large -> invalid (s < 25)',barLayout(1e6,1000,13,300).valid===false);}
{const l2=barLayout(800,1000,13,300,50,75);eq('barLayout cover: s = floor(132.73·1000/800/50)·50 = 150',l2.s,150,0);eq('barLayout cover: n = ceil((1000 − 150 − 13)/150) + 1 = 7',l2.n,7,0);eq('barLayout cover: As,prov = 7·A_bar',l2.AsProv,7*Math.PI/4*169,1e-9);eq('barLayout cover: actual spacing = 837/6',l2.sAct,837/6,1e-9);}
// ---- pedestal shear with axial load (pedestalShearCheck, ACI 318M-19 §22.5) — hand calc ----
// 300 × 300, d′ 68 -> d 232; 3 D16 per face A = 603.19; f'c 21.7; Nu 20 kN; λs = min(1, √(2/(1 + 0.004·232))) = 1
{ const As = 3 * Math.PI / 4 * 256, d = 232, rho = As / (300 * d), ax = 20000 / (6 * 90000);
  const Vc = (0.66 * Math.cbrt(rho) * Math.sqrt(21.7) + ax) * 300 * d;
  const r1 = pedestalShearCheck({ bw: 300, h: 300, dPrime: 68, fc: 21.7, AsLayer: As, Nu: 20, Vu: 5, tieDia: 10, legs: 2, fyt: 280, barDia: 16 });
  eq('ped shear d = 232', r1.d, 232, 0);
  eq('ped shear Vc = [0.66ρ^(1/3)√fc + Nu/6Ag]·bw·d', r1.Vc, Vc, 1e-6);
  ok('ped shear Vu 5 < 0.5φVc -> no ties needed, detailing s = min(16·16, 48·10, 300) = 256', !r1.needTies && !r1.minTiesRequired && r1.sReq === 256);
  // tension Nu = −200 kN: Nu/(6Ag) = −0.370 MPa reduces Vc; large tension -> Vc floored at 0
  const r2 = pedestalShearCheck({ bw: 300, h: 300, dPrime: 68, fc: 21.7, AsLayer: As, Nu: -200, Vu: 5, tieDia: 10, legs: 2, fyt: 280, barDia: 16 });
  eq('ped shear tension reduces Vc', r2.Vc, Math.max((0.66 * Math.cbrt(rho) * Math.sqrt(21.7) - 200000 / (6 * 90000)) * 300 * d, 0), 1e-6);
  ok('ped shear large tension -> Vc = 0', pedestalShearCheck({ bw: 300, h: 300, dPrime: 68, fc: 21.7, AsLayer: As, Nu: -2000, Vu: 5 }).Vc === 0);
  // Vu 80 kN, Nu 0: Vs = 80000/0.75 − Vc0, s = Av·fyt·d/Vs (Av = 2·78.54), cap d/2 = 116
  const Vc0 = 0.66 * Math.cbrt(rho) * Math.sqrt(21.7) * 300 * d, Vs = 80000 / 0.75 - Vc0, sH = Math.min(2 * Math.PI / 4 * 100 * 280 * d / Vs, d / 2);
  const r3 = pedestalShearCheck({ bw: 300, h: 300, dPrime: 68, fc: 21.7, AsLayer: As, Nu: 0, Vu: 80, tieDia: 10, legs: 2, fyt: 280, barDia: 16 });
  ok('ped shear Vu 80 -> ties required', r3.needTies && r3.minTiesRequired);
  eq('ped shear s = min(Av·fyt·d/Vs, d/2)', r3.sShear, sH, 1e-9);
  // minimum ties: Av/s ≥ max(0.062√fc, 0.35)·bw/fyt -> s ≤ Av·fyt/(0.35·300) (0.062√21.7 = 0.289 < 0.35)
  eq('ped shear s_min = Av·fyt/(0.35·bw)', r3.sMin, 2 * Math.PI / 4 * 100 * 280 / (0.35 * 300), 1e-9);
  ok('ped shear capacity with ties ≥ Vu at sReq', r3.uc <= 1 + 1e-12 && r3.sectionOk); }
// searchPedestalBars rhoMin option: 300 × 300, tiny load -> n per face from ρ: 1 % -> 3 D16 (1.34 %), 0.5 % -> 2 D16 (0.89 %)
{ const cs = [{ combo: { name: 't' }, Ptop: 10, Mtop: 1 }];
  eq('pedestal ρmin 1 % -> 3 D16 per face', searchPedestalBars(300, 300, 68, 21.7, 420, 16, cs).n, 3, 0);
  eq('pedestal ρmin 0.5 % option -> 2 D16 per face', searchPedestalBars(300, 300, 68, 21.7, 420, 16, cs, 25, 0.005).n, 2, 0); }
console.log(`PART3: ${pass} pass, ${fail} fail`);
process.exit(fail>0?1:0);
