// VALIDATION part46 — grout-pad factor for steel anchor shear, ACI 318M-19 §17.7.1.2.1.
// Hand vector: Ase,V = 694 mm², futa = 520 MPa -> Vsa,bare = 216528 N; grout -> 173222.4 N.
// This vector keeps the pre-existing four-anchor sharing unchanged; that choice is a separate audit item.
import { anchorGroupCheck, computeAnchorCapacity, parseStaadLoads } from '../index.js';
import { pedestalDesignCheck } from '../../../tools/staad-stability.mjs';
let pass = 0, fail = 0;
const near = (a,b) => a === b || Math.abs(a-b) <= 1e-8 * Math.max(1,Math.abs(b));
function ok(name, condition) { console.log(`${condition ? 'PASS' : 'FAIL'} ${name}`); condition ? pass++ : fail++; }
const base = { shearAnchors:4, shearBasis:'Validation vector assumes equal sharing among four anchors', Bp: 800, Lp: 800, sx: 400, sz: 400, da: 33, Ase: 694, futa: 520, hef: 450, Abrg: 1764, fc: 31, seismic: false, P: -516.5, Fx: 133.7 };
const bare = anchorGroupCheck(base);
const grout = anchorGroupCheck({ ...base, groutPad: true });
ok('group: no grout keeps 0.6 * 694 * 520 = 216528 N', near(bare.Vsa,216528) && bare.groutFactor===1 && !bare.groutPad);
ok('group: grout nominal Vsa = 0.8 * 216528 = 173222.4 N', near(grout.Vsa,173222.4) && grout.groutFactor===0.8 && grout.groutPad);
ok('group: unmodified nominal strength is returned separately', near(grout.VsaBare,216528));
ok('group: design steel shear strength = 0.65 * 173222.4 = 112594.56 N', near(0.65*grout.Vsa,112594.56));
ok('group: steel shear UC uses the reduced nominal strength', near(grout.shear[0].uc,33425/112594.56));
ok('group: grout increases steel shear UC by 25 percent', near(grout.shear[0].uc/bare.shear[0].uc,1.25));
for (const key of ['Nsa','Ncbg','Npn','Nsbg','Vcbg','Vcpg']) ok(`group: grout does not modify ${key}`, near(bare[key],grout[key]));
ok('group: tension checks remain unchanged', bare.tension.every((m,i)=>near(m.uc,grout.tension[i].uc)));
ok('group: concrete and pryout checks remain unchanged', grout.shear.slice(1).every((m,i)=>near(m.uc,bare.shear[i+1].uc)));
const seismic = anchorGroupCheck({ ...base, groutPad: true, seismic: true });
ok('group: seismic multiplier is not applied again to steel Vsa', near(seismic.Vsa,173222.4) && near(seismic.shear[0].uc,grout.shear[0].uc));
const input = { ca1:200, da:33, Ase:694, futa:520, hef:450, Abrg:1764, fc:31, lambda:1, anchorType:'cast-in', cracked:true,
  phiNsa:0.75, phiNcb:0.7, phiNpn:0.7, phiVsa:0.65, phiVcb:0.7, phiVcp:0.7 };
const capBare = computeAnchorCapacity(input), capGrout = computeAnchorCapacity({ ...input, groutPad:true });
ok('single-anchor capacity: same grout factor as group', near(capGrout.modesV[0].val,grout.Vsa) && capGrout.groutFactor===0.8);
ok('single-anchor capacity: no-grout behavior preserved', near(capBare.modesV[0].val,216528));
ok('single-anchor capacity: tension / concrete shear / pryout unchanged', capBare.modesN.every((m,i)=>near(m.val,capGrout.modesN[i].val)) && capBare.modesV.slice(1).every((m,i)=>near(m.val,capGrout.modesV[i+1].val)));
const f = { name:'Audit',node:7,type:'pedestal',Bf:1.2,Lf:1.2,Hf:0.3,Df:0.95,Bp:0.4,Lp:0.4,pedGp:0.275,groutT:25,bolts:{n:4,dia:16,sx:130,sz:130} };
const crit = { gc:24,gs:18,qa:100,mu:0.4,ecc:0,fsSlidePerm:1.5,fsSlideTemp:1.5,fsOTPerm:1.5,fsOTTemp:1.5,
  design:{fc:21.7,fy:420,cover:75,bar:13},pedestal:{bar:13,tie:10,legs:2,clearCover:40,fyt:280,rhoMin:0.005,
    anchor:{shearAnchors:4,shearBasis:'Validation fixture',Ase:157,futa:400,hef:300,Abrg:290,seismic:false}} };
const loads = parseStaadLoads('LOAD 3 LOADTYPE Dead TITLE D\nSELFWEIGHT Y -1\nLOAD 301 1.2D\nREPEAT LOAD\n3 1.2\n');
const reactions = {'7:301':[4,20,0,0,0,0]};
const withPad=pedestalDesignCheck(f,crit,loads,reactions,[301]);
const withoutPad=pedestalDesignCheck({...f,groutT:0},crit,loads,reactions,[301]);
ok('CLI: groutT 25 mm automatically enables grout factor', withPad.anchor.res.groutPad && near(withPad.anchor.res.Vsa,0.8*0.6*157*400));
ok('CLI: groutT zero disables grout factor', !withoutPad.anchor.res.groutPad && near(withoutPad.anchor.res.Vsa,0.6*157*400));
ok('CLI: steel shear UC ratio is 1.25 for the same top reactions', near(withPad.anchor.res.shear[0].uc/withoutPad.anchor.res.shear[0].uc,1.25));
console.log(`PART46: ${pass} pass, ${fail} fail`);
process.exit(fail?1:0);
