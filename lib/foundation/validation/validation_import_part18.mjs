// VALIDATION part18 — STAAD import (parseStaadLoads, primaryFactors, parseStaadReactions, reactionToFoundationLoad, parseCaseList)
// and the batch shallow-footing stability of tools/staad-stability.mjs (STAAD reactions -> underside of footing -> 4A checks).
// Hand-calc vectors: statics of a fixed column base (reaction signs), footing self-weight, lever arm Δh, FS sliding / overturning.
import { parseStaadLoads, primaryFactors, parseStaadReactions, reactionToFoundationLoad, parseCaseList } from '../import/staadOutput.js';
import { evaluateStaadFoundation, footingWeights, allowableBearingFor } from '../../../tools/staad-stability.mjs';
let pass = 0, fail = 0;
function ok(n, c, x = '') { if (c) { pass++; console.log('PASS ' + n + ' ' + x); } else { fail++; console.log('FAIL ' + n + ' ' + x); } }
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// ---- 1. .std load cases: primary (LOADTYPE), REPEAT LOAD with a continuation line, nested REPEAT, LOAD COMB, reference loads ----
const STD = [
  'DEFINE REFERENCE LOADS', 'LOAD R1 LOADTYPE Dead  TITLE SELFWEIGHT', 'SELFWEIGHT Y -1', 'END DEFINE REFERENCE LOADS',
  'LOAD 1 LOADTYPE Seismic-H  TITLE EX', 'IBC LOAD X 1', 'PERFORM ANALYSIS', 'CHANGE',
  'LOAD 3 LOADTYPE Dead  TITLE D STRUKTUR', 'REFERENCE LOAD', 'R1 1.0',
  'LOAD 5 LOADTYPE Dead  TITLE PIPA OPERASI Po', 'JOINT LOAD', '2 FY -2.76',
  'LOAD 7 LOADTYPE Live  TITLE FF+Z', 'JOINT LOAD', '2 FZ 0.83',
  'LOAD 9 LOADTYPE Wind  TITLE W+X', 'MEMBER LOAD', '1 UNI GX 0.0834',
  'LOAD 101 D+Po', 'REPEAT LOAD', '3 1 5 1',
  'LOAD 110 (1+0.14SDS)(D+Po)+0.7EX', 'REPEAT LOAD', '3 1.0867 5 1.0867 -', '1 0.7',
  'LOAD 120 1.5 x LC101 + W', 'REPEAT LOAD', '101 1.5 9 1',
  'LOAD COMB 130 D+W', '3 1.0 9 1.0',
  'PERFORM ANALYSIS', 'LOAD LIST 101 110', 'FINISH'
].join('\n');
const ld = parseStaadLoads(STD);
ok('primary cases 1, 3, 5, 7, 9 (reference loads skipped)', JSON.stringify(Object.keys(ld.primary).map(Number)) === '[1,3,5,7,9]');
ok('LOADTYPE kept', ld.primary[1].type === 'Seismic-H' && ld.primary[9].type === 'Wind' && ld.primary[3].title === 'D STRUKTUR');
ok('REPEAT LOAD 101 factors', ld.combos[101].kind === 'repeat' && ld.combos[101].factors[3] === 1 && ld.combos[101].factors[5] === 1);
ok('continuation line joined (110: 3, 5, 1)', near(ld.combos[110].factors[1], 0.7, 1e-12) && near(ld.combos[110].factors[3], 1.0867, 1e-12));
const f120 = primaryFactors(ld, 120);
ok('nested REPEAT expanded: 120 = 1.5·(D+Po) + W', near(f120[3], 1.5, 1e-12) && near(f120[5], 1.5, 1e-12) && f120[9] === 1);
ok('LOAD COMB parsed', ld.combos[130].kind === 'comb' && ld.combos[130].factors[9] === 1);
ok('LOAD LIST not read as factors', !ld.combos[130].factors[101]);
ok('case list "101-103, 110"', JSON.stringify(parseCaseList('101-103, 110')) === '[101,102,103,110]');

// ---- 2. .ANL support reactions: node carried over continuation rows and page breaks, units ----
const ANL = [
  '   SUPPORT REACTIONS -UNIT KN   METE    STRUCTURE TYPE = SPACE', '   -----------------', '',
  ' JOINT  LOAD   FORCE-X   FORCE-Y   FORCE-Z     MOM-X     MOM-Y     MOM Z', '', '',
  '      1  101      0.00      2.17      0.00     -0.11      0.00      1.22',
  '         102     -0.57      2.17      0.00     -0.11     -0.03      2.37',
  '   SUPPORT REACTIONS -UNIT KN   METE    STRUCTURE TYPE = SPACE', '   -----------------',
  ' JOINT  LOAD   FORCE-X   FORCE-Y   FORCE-Z     MOM-X     MOM-Y     MOM Z',
  '         103      0.57      2.17      0.00     -0.11      0.03      0.08',
  '      4  101      1.00     10.00     -2.00      3.00      0.50     -4.00',
  ' ************** END OF LATEST ANALYSIS RESULT **************'
].join('\n');
const rc = parseStaadReactions(ANL);
ok('units KN / METE accepted', rc.unitOk && rc.units[0] === 'KN');
ok('node 1 rows 101, 102 + 103 after a page header', !!rc.reactions['1:101'] && !!rc.reactions['1:102'] && near(rc.reactions['1:103'][5], 0.08, 1e-12));
ok('node 4 row', JSON.stringify(rc.reactions['4:101']) === '[1,10,-2,3,0.5,-4]');
ok('KIP / FEET flagged', parseStaadReactions(ANL.replace(/KN   METE/g, 'KIP  FEET')).unitOk === false);

// ---- 3. reaction -> load on the foundation (FAIR convention, loadTypeVector()) ----
// Fixed column, height h = 2 m, load F = +5 kN in +X at the top. STAAD reaction: FX = −5, MZ = +F·h = +10 (equilibrium about the
// base: load moment (0,h,0)×(F,0,0) = −F·h about Z). FAIR: Fx = +5 and Mz = +Fx·h = +10 (compresses +x).
const lx = reactionToFoundationLoad([-5, 0, 0, 0, 0, 10]);
ok('X push: Fx = +5, Mz = +10', lx.Fx === 5 && lx.Mz === 10);
// load F = +5 kN in +Z at h = 2: load moment (0,h,0)×(0,0,F) = +F·h about X -> reaction MX = −10, FZ = −5. FAIR: Fz = +5, Mx = −Fz·h = −10.
const lz = reactionToFoundationLoad([0, 0, -5, -10, 0, 0]);
ok('Z push: Fz = +5, Mx = −10', lz.Fz === 5 && lz.Mx === -10);
ok('gravity: P = FY', reactionToFoundationLoad([0, 7, 0, 0, 0, 0]).P === 7);

// ---- 4. batch stability, footing with pedestal (hand calc) ----
// Footing 0.8 × 0.8 × 0.25, Df 0.6, pedestal 0.3 × 0.3, 0.3 above grade, grout 25 mm; γc 24, γs 18 kN/m³.
// Wf = 0.8·0.8·0.25·24 = 3.84; Wp = 0.3·0.3·(0.3 + 0.35)·24 = 1.404; Wg = 0.09·0.025·24 = 0.054; Ws = (0.64 − 0.09)·0.35·18 = 3.465
// ΔW = 8.763 kN; Δh = Hp + Hf = (0.3 + 0.35 + 0.025) + 0.25 = 0.925 m
const crit = { gc: 24, gs: 18, qa: 100, mu: 0.4, ecc: 0, fsSlidePerm: 1.5, fsSlideTemp: 1.5, fsOTPerm: 1.5, fsOTTemp: 1.5 };
const fdn = { name: 'F1', node: 1, type: 'pedestal', Bf: 0.8, Lf: 0.8, Hf: 0.25, Df: 0.6, Bp: 0.3, Lp: 0.3, pedGp: 0.3, groutT: 25 };
const w = footingWeights(fdn, crit);
ok('ΔW = 8.763 kN', near(w.dW, 8.763, 1e-9), w.dW.toFixed(4));
ok('Δh = 0.925 m', near(w.dh, 0.925, 1e-12), w.dh);
// L/C 102 at node 1 = reaction [-0.57, 2.17, 0, -0.11, -0.03, 2.37], factors 3·1 + 5·1 (+ W in the real model):
// P = 2.17 + 1·8.763 = 10.933; Fx = 0.57; Mz = 2.37 + 0.57·0.925 = 2.89725; Mx = −0.11
// FS sliding = 0.4·10.933/0.57 = 7.6723; SF1 (B/2 resists Mz) = 10.933·0.4/2.89725 = 1.5094; UC OT = 1.5/1.5094
const ld2 = parseStaadLoads(STD + '\nLOAD 102 D+Po+W\nREPEAT LOAD\n3 1 5 1 9 0.6\n');
const res = evaluateStaadFoundation(fdn, crit, ld2, rc.reactions, [101, 102], undefined);
const r102 = res.rows.find(r => r.lc === 102);
ok('dead case = lowest LOADTYPE Dead primary (3)', res.dead === 3);
ok('102 temporary (contains Wind)', r102.temporary === true && res.rows.find(r => r.lc === 101).temporary === false);
ok('102 P = 10.933', near(r102.P, 10.933, 1e-9), r102.P.toFixed(4));
ok('102 Mz = 2.89725', near(r102.Mz, 2.89725, 1e-9), r102.Mz.toFixed(5));
ok('102 FS sliding = 7.6723', near(r102.fsSliding, 0.4 * 10.933 / 0.57, 1e-9), r102.fsSliding.toFixed(4));
ok('102 SF1 overturning = 1.5094', near(r102.SF1, 10.933 * 0.4 / 2.89725, 1e-9), r102.SF1.toFixed(4));
ok('missing L/C reported', evaluateStaadFoundation(fdn, crit, ld2, rc.reactions, [101, 999]).missing[0] === 999);
// kD follows the dead factor: L/C 110 has D·1.0867 (no reaction in the sample) -> add one and check P = Ry + 1.0867·ΔW
const rc2 = { ...rc.reactions, '1:110': [0, 2.36, 0, 0, 0, 0] };
const r110 = evaluateStaadFoundation(fdn, crit, ld2, rc2, [110]).rows[0];
ok('kD = 1.0867 -> P = 2.36 + 1.0867·ΔW', near(r110.kD, 1.0867, 1e-12) && near(r110.P, 2.36 + 1.0867 * 8.763, 1e-9) && r110.temporary === true);

// ---- 5. block (no pedestal), uplift -> invalid ----
// Block 0.6 × 0.6 × 0.6, Df 0.3, grout 25: Wf = 0.216·24 = 5.184; Wg = 0.36·0.025·24 = 0.216; hs = max(0.3 − 0.625, 0) = 0
// ΔW = 5.40 kN, Δh = HfTot = 0.625 m
const blk = { name: 'B', node: 4, type: 'block', Bf: 0.6, Lf: 0.6, Hf: 0.6, Df: 0.3, groutT: 25 };
const wb = footingWeights(blk, crit);
ok('block ΔW = 5.40, Δh = 0.625', near(wb.dW, 5.4, 1e-9) && near(wb.dh, 0.625, 1e-12), `${wb.dW.toFixed(4)} ${wb.dh}`);
const rcU = { '4:101': [0, -9, 0, 0, 0, 0] };   // net uplift 9 kN > ΔW 5.4
const rU = evaluateStaadFoundation(blk, crit, ld2, rcU, [101]);
ok('net uplift -> not valid, FAIL', rU.rows[0].valid === false && rU.pass === false && rU.gov.governingUC === Infinity);

// ---- 6. q_a from soil, Meyerhof (1963) formula (Tab 08), and Meyerhof effective area beyond the kern (4A option) ----
// Independent hand calc: c 6.865 kPa, φ 18.81°, γ 18 kN/m³, square 0.8 × 0.8, Df 0.6, β 0, FS 3.
// Nq = e^(π tanφ)·tan²(45 + φ/2), Nc = (Nq − 1)cotφ, Nγ = (Nq − 1)tan(1.4φ); Kp = tan²(45 + φ/2)
// Fcs = 1 + 0.2Kp·B/L, Fqs = Fγs = 1 + 0.1Kp·B/L, Fcd = 1 + 0.2√Kp·Df/B, Fqd = Fγd = 1 + 0.1√Kp·Df/B, inclination factors 1
function meyHand(c, phiDeg, g, B, L, Df) {
  const ph = phiDeg * Math.PI / 180, Kp = Math.tan(Math.PI / 4 + ph / 2) ** 2;
  const Nq = Math.exp(Math.PI * Math.tan(ph)) * Kp, Nc = (Nq - 1) / Math.tan(ph), Ng = (Nq - 1) * Math.tan(1.4 * ph);
  const bl = B / L, Fcs = 1 + 0.2 * Kp * bl, Fqs = 1 + 0.1 * Kp * bl, Fcd = 1 + 0.2 * Math.sqrt(Kp) * Df / B, Fqd = 1 + 0.1 * Math.sqrt(Kp) * Df / B;
  return c * Nc * Fcs * Fcd + g * Df * Nq * Fqs * Fqd + 0.5 * g * B * Ng * Fqs * Fqd;
}
const critS = { ...crit, soil: { c: 6.865, phi: 18.81, method: 'meyerhof', FS: 3 } };
const qa08 = allowableBearingFor(critS, 0.8, 0.8, 0.6);
ok('q_a Meyerhof 0.8 × 0.8 = hand q_u / 3', near(qa08.qu, meyHand(6.865, 18.81, 18, 0.8, 0.8, 0.6), 1e-9) && near(qa08.qa, qa08.qu / 3, 1e-12), qa08.qa.toFixed(2));
ok('given q_a without soil -> not recomputed', allowableBearingFor(crit, 0.8, 0.8, 0.6).qa === 100 && allowableBearingFor(crit, 0.8, 0.8, 0.6).recomputed === false);
// L/C 102 (e_x = Mz/P = 2.89725/10.933 = 0.26500 > B/6) with bearMethod meyerhof: B' = 0.8 − 2e_x, L' = 0.8 − 2·0.11/10.933
// q' = P/(B'L'), q'a = Meyerhof for B'short × L'long (rectangular), Df 0.6
const resM = evaluateStaadFoundation(fdn, { ...critS, bearMethod: 'meyerhof' }, ld2, rc.reactions, [102]).rows[0];
const exM = 2.89725 / 10.933, ezM = 0.11 / 10.933, BeM = 0.8 - 2 * exM, LeM = 0.8 - 2 * ezM;
const qaM = meyHand(6.865, 18.81, 18, Math.min(BeM, LeM), Math.max(BeM, LeM), 0.6) / 3;
ok("102 Meyerhof effective area used", resM.meyUsed === true && near(resM.mey.Beff, BeM, 1e-9) && near(resM.mey.Leff, LeM, 1e-9));
ok("102 q' = P/(B'L')", near(resM.qBear, 10.933 / (BeM * LeM), 1e-9), resM.qBear.toFixed(3));
ok("102 q'a recomputed for B' × L'", near(resM.qaBear, qaM, 1e-9), `${resM.qaBear.toFixed(3)} vs ${qaM.toFixed(3)}`);
ok("102 bearing UC = q'/q'a in the checks", near(resM.checks.find(c => c.name === 'Bearing pressure (biaxial)').uc, resM.qBear / qaM, 1e-9));
// full contact (L/C 101: e_x = 1.22/10.933 = 0.1116 < B/6 = 0.1333) -> rigid formula, q_a of the full footing
const resF = evaluateStaadFoundation(fdn, { ...critS, bearMethod: 'meyerhof' }, ld2, rc.reactions, [101]).rows[0];
ok('101 full contact -> no effective area, q_a full footing', resF.meyUsed === false && near(resF.qaBear, qa08.qa, 1e-12));

console.log(`PART18: ${pass} pass, ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
