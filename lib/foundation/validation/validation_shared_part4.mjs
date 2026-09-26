// VALIDATION part4 — soil properties + settlement (hand-calc)
import { correctSPT, phiFromSPT, cuFromSPT, esFromSPT, soilDefaults } from '../shared/soilProperties.js';
import { elasticSettlement, consolidationSettlement, settlementCheck } from '../shared/settlementCheck.js';
let pass=0, fail=0;
function eq(n,g,e,t=1e-6){const o=Math.abs(g-e)<=t;if(o){pass++;console.log('PASS '+n+'='+g);}else{fail++;console.log('FAIL '+n+' got='+g+' exp='+e);}}
function ok(n,c,x=''){if(c){pass++;console.log('PASS '+n+' '+x);}else{fail++;console.log('FAIL '+n+' '+x);}}
let sp=correctSPT(15,100,60);eq('Cn',sp.Cn,1,1e-9);eq('N60',sp.N60,15,1e-9);
sp=correctSPT(10,25,60);eq('Cn cap',sp.Cn,2.0,1e-9);
eq('phi15',phiFromSPT(15).phiDeg,27+4.5-0.00054*225,1e-9);
ok('phi clay',phiFromSPT(10,'clay').phiDeg===0);
eq('cu',cuFromSPT(10).cu,50,1e-9);
const es=esFromSPT(15,50);eq('Es gran',es.EsGranular,15000,1e-9);eq('Es coh',es.EsCohesiveLow,15000,1e-9);
const sd=soilDefaults('clay',18,20);eq('gsub',sd.gammaSubmerged,10.19,1e-9);eq('nu',sd.poisson,0.45,1e-9);
const se=elasticSettlement({qNet_kPa:100,B:2,L:2,Es_kPa:20000,nu:0.3,rigid:true});
eq('Se',se.Se_mm,(100*2*0.91/20000)*0.95*0.8*1000,1e-6);
let sc=consolidationSettlement({H:2,e0:0.8,Cc:0.3,Cr:0.05,sigmaV0_kPa:100,dSigma_kPa:50,pc_kPa:null});
eq('ScNC',sc.Sc_mm,(2/1.8)*0.3*Math.log10(1.5)*1000,1e-6);
sc=consolidationSettlement({H:2,e0:0.8,Cc:0.3,Cr:0.05,sigmaV0_kPa:100,dSigma_kPa:50,pc_kPa:200});
eq('ScOC',sc.Sc_mm,(2/1.8)*0.05*Math.log10(1.5)*1000,1e-6);
const st=settlementCheck({Se_mm:10,Sc_mm:5});
eq('total',st.total_mm,15,1e-9);ok('sett pass',st.overallPass===true);
console.log(`PART4: ${pass} pass, ${fail} fail`);
process.exit(fail>0?1:0);
