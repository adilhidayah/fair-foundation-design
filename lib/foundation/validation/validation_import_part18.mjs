// VALIDATION part18 — STAAD import (parseStaadLoads, primaryFactors, parseStaadReactions, reactionToFoundationLoad, parseCaseList)
// and the batch shallow-footing stability of tools/staad-stability.mjs (STAAD reactions -> underside of footing -> 4A checks).
// Hand-calc vectors: statics of a fixed column base (reaction signs), footing self-weight, lever arm Δh, FS sliding / overturning.
import { parseStaadLoads, primaryFactors, parseStaadReactions, reactionToFoundationLoad, parseCaseList } from '../import/staadOutput.js';
import { buildFoundationDrawing, toDXF, toSVG } from '../../../tools/foundation-drawing.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runConfig } from '../../../tools/staad-stability.mjs';
import { evaluateStaadFoundation, footingWeights, allowableBearingFor, autosizeFoundation, deepMerge, resolveFoundation, footingDesignCheck, pedestalDesignCheck } from '../../../tools/staad-stability.mjs';
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

// ---- 7. bearing FS permanent / temporary, auto-size ----
// FS 3 (permanent) / 2 (temporary): q_a,temp = q_u/2 = 1.5·q_a,perm for the same footing; L/C 102 (wind) uses it, L/C 101 does not
const critT = { ...crit, soil: { c: 6.865, phi: 18.81, method: 'meyerhof', FS: 3, FSTemp: 2 } };
const qP = allowableBearingFor(critT, 0.8, 0.8, 0.6), qT = allowableBearingFor(critT, 0.8, 0.8, 0.6, true);
ok('q_a temporary = q_u/2 = 1.5·q_a permanent', near(qT.qa, qP.qu / 2, 1e-9) && near(qT.qa, 1.5 * qP.qa, 1e-9) && qT.FS === 2);
const rT = evaluateStaadFoundation(fdn, critT, ld2, rc.reactions, [101, 102]);
ok('temporary combo uses FS 2, permanent FS 3', near(rT.rows.find(r => r.lc === 102).qaBear, qT.qa, 1e-9) && near(rT.rows.find(r => r.lc === 101).qaBear, qP.qa, 1e-9));
// auto-size: L/C 102 alone, FS OT 1.5. Overturning about z governs: SF1 = (Ry + ΔW(B))·(B/2) / (MZ + FX·Δh) ≥ 1.5.
// B 0.8 -> SF1 1.509 (pass, part 4); B 0.7 must then be checked by the loop: it is the smallest passing size iff it passes.
const as = autosizeFoundation({ ...fdn, autosize: { from: 0.5, to: 1.5, step: 0.1 } }, crit, ld2, rc.reactions, [102]);
const firstPass = as.trials.findIndex(t => t.pass);
ok('auto-size stops at the first passing size', as.pass === true && firstPass === as.trials.length - 1 && near(as.B, as.trials[firstPass].B, 1e-12), `B = ${as.B}`);
ok('auto-size: every smaller trial fails', as.trials.slice(0, -1).every(t => !t.pass));
ok('auto-size: size ≤ 0.8 (0.8 passes, part 4)', as.B <= 0.8 + 1e-12);

// ---- 8. project file (extends / deep merge), presets, locked pedestal depth Dp ----
const mg = deepMerge({ lc: '101-164', criteria: { mu: 0.45, soil: { c: 7.649, FS: 3 } } }, { criteria: { soil: { FS: 2.5 } }, std: 'a.std' });
ok('deep merge keeps base keys, override wins', mg.lc === '101-164' && mg.criteria.mu === 0.45 && mg.criteria.soil.c === 7.649 && mg.criteria.soil.FS === 2.5 && mg.std === 'a.std');
const cfgP = { presets: { P: { type: 'pedestal', Bp: 0.3, Lp: 0.3, pedGp: 0.275, Dp: 0.65, Hf: 0.3, groutT: 25, Bf: 1, Lf: 1 } } };
const fP = resolveFoundation(cfgP)({ name: 'X', node: 1, preset: 'P', Hf: 0.4 });
ok('preset fields + foundation override', fP.Bp === 0.3 && fP.Hf === 0.4 && fP.node === 1);
ok('Dp locked: Df = Dp + Hf = 1.05', near(fP.Df, 1.05, 1e-12));
// Dp 0.65, Hf 0.3, pedGp 0.275, grout 25 -> Hp = 0.275 + 0.65 + 0.025 = 0.95, Δh = Hp + Hf = 1.25
ok('Δh with Dp 0.65, Gp 0.275, grout 25, Hf 0.3 = 1.25', near(footingWeights(resolveFoundation(cfgP)({ name: 'Y', node: 1, preset: 'P' }), crit).dh, 1.25, 1e-12));

// ---- 9. static uplift classification (rigid footing, soil without tension) ----
// L/C 101: e_x = 1.22/10.933 = 0.1116 < B/6 = 0.1333, e_z 0.010 -> 6ex/B + 6ez/L = 0.837 + 0.075 = 0.912 ≤ 1 -> none
// L/C 102: e_x = 0.265 > B/6 -> partial; net uplift case of part 5 -> net
const rU1 = evaluateStaadFoundation(fdn, crit, ld2, rc.reactions, [101, 102]);
ok('101 full contact -> uplift none', rU1.rows.find(r => r.lc === 101).uplift === 'none');
ok('102 outside the kern -> partial, contact < 100 %', rU1.rows.find(r => r.lc === 102).uplift === 'partial' && rU1.rows.find(r => r.lc === 102).bp.contactRatio < 1);
ok('summary: 1 partial, min contact = 102 contact', rU1.upl.partial.length === 1 && rU1.upl.worst.lc === 102 && near(rU1.upl.minContact, rU1.rows.find(r => r.lc === 102).bp.contactRatio, 1e-12));
ok('P ≤ 0 -> net uplift', rU.rows[0].uplift === 'net' && rU.upl.net.length === 1);
// resultant outside the base with P > 0: block 0.6, reaction MZ 10 with P small -> e > B/2 -> separation
const rS = evaluateStaadFoundation(blk, crit, ld2, { '4:101': [0, 1, 0, 0, 0, 10] }, [101]);
ok('e ≥ B/2 with P > 0 -> base separation', rS.rows[0].uplift === 'separation' && rS.pass === false);

// ---- 10. minimum contact area (project criterion) ----
// L/C 102 contact ratio c (statics) -> UC = 0.70 / c, added to the checks; L/C 101 full contact -> UC 0.70
const rC = evaluateStaadFoundation(fdn, { ...crit, minContact: 0.7 }, ld2, rc.reactions, [101, 102]);
const c102 = rC.rows.find(r => r.lc === 102), cc = c102.checks.find(k => k.name.startsWith('Contact area'));
ok('contact check UC = 0.70 / contact ratio (102)', !!cc && near(cc.uc, 0.7 / c102.bp.contactRatio, 1e-12), `${c102.bp.contactRatio.toFixed(4)} -> ${cc.uc.toFixed(4)}`);
ok('full contact -> contact UC 0.70', near(rC.rows.find(r => r.lc === 101).checks.find(k => k.name.startsWith('Contact area')).uc, 0.7, 1e-12));
ok('contact 50.6 % < 70 % -> combination fails, governed by the contact check', c102.bp.contactRatio < 0.7 && c102.overallPass === false && c102.governingCheck.name.startsWith('Contact area'));
ok('no minContact -> no contact check', !rU1.rows[0].checks.some(k => k.name.startsWith('Contact area')));

// ---- 11. footing thickness + reinforcement from LRFD reactions (concentric load, hand calc) ----
// Block-free case: footing 1.2 × 1.2 × 0.3 with pedestal 0.3 × 0.3, Gp 0.275, Dp 0.65, grout 25; γc 24, γs 18.
// L/C 301 = 1.2·D (D primary 3): reaction FY = 50 kN, no moment -> Pu = 50 + 1.2·ΔW, uniform q = Pu/A; w = 1.2·(Wf/A + Ws/(A − Ap)).
const ldD = parseStaadLoads(STD + '\nLOAD 301 1.2D\nREPEAT LOAD\n3 1.2\n');
const fD = { name: 'D', node: 7, type: 'pedestal', Bf: 1.2, Lf: 1.2, Hf: 0.3, Df: 0.95, Bp: 0.3, Lp: 0.3, pedGp: 0.275, groutT: 25 };
const critD = { ...crit, design: { fc: 21.7, fy: 420, cover: 75, bar: 13, lambda: 1 } };
const dz = footingDesignCheck(fD, critD, ldD, { '7:301': [0, 50, 0, 0, 0, 0] }, [301]);
const wD = footingWeights(fD, critD), A = 1.44, Ap = 0.09;
const PuD = 50 + 1.2 * wD.dW, q = PuD / A, wN = 1.2 * (wD.Wfoot / A + wD.Wsoil / (A - Ap)), qn = q - wN;
const dmm = 300 - 75 - 13, dm = dmm / 1000;
ok('design: d = 300 − 75 − 13 = 212 mm', dz.d === 212);
ok('design: net pressure w = kD·(Wf/A + Ws/(A − Ap))', near(dz.items[0].w, wN, 1e-9), `${wN.toFixed(3)} kPa`);
// flexure at the pedestal face, cantilever a = 0.6 − 0.15 = 0.45 m over the full width 1.2: Mu = qn·1.2·a²/2
const MuH = qn * 1.2 * 0.45 ** 2 / 2;
ok('design: Mu x-bottom = qn·L·a²/2', near(dz.flex.find(c => c.key === 'x-bottom').Mu, MuH, 1e-6), `${MuH.toFixed(3)} kN·m`);
ok('design: no hogging -> top bars not required', dz.flex.filter(c => c.face === 'top').every(c => !c.required));
// A_s,min = 0.0018·b·h (fy 420, Table 8.6.1.1) = 0.0018·1200·300 = 648 mm² (x); s = floor(132.73·1200/648 / 25)·25 = 225 ->
// D13-225 written; bars between the covers: n = ⌈(1200 − 2·75 − 13)/225⌉ + 1 = ⌈4.61⌉ + 1 = 6, A_s,prov = 6·132.73 = 796.4 mm²
ok('design: As,min x = 0.0018·1200·300 = 648', near(dz.flex[0].des.AsMin, 648, 1e-9));
ok('design: bars x = D13-225 (25 mm steps), 6 bars rounded up, As,prov = 6·A_bar', dz.flex[0].s === 225 && dz.flex[0].n === 6 && near(dz.flex[0].AsProv, 6 * Math.PI / 4 * 169, 1e-9));
// project option asMin 'beam': max(648, 1.4·1200·212/420 = 848) = 848 -> s = floor(132.73·1200/848 / 25)·25 = 175
const dzB = footingDesignCheck(fD, { ...crit, design: { ...critD.design, asMin: 'beam' } }, ldD, { '7:301': [0, 50, 0, 0, 0, 0] }, [301]);
ok("design: asMin 'beam' = 1.4·b·d/fy = 848 -> D13 @ 175", near(dzB.flex[0].des.AsMin, 848, 1e-9) && dzB.flex[0].s === 175);
// one-way shear at d: Vu = qn·1.2·(0.45 − 0.212)
const VuH = qn * 1.2 * (0.45 - dm);
ok('design: one-way Vu = qn·L·(a − d)', near(dz.oneway[0].Vu, VuH, 1e-6), `${VuH.toFixed(3)} kN`);
// φVc, Table 22.5.5.1 Eq. (c) (no shear reinforcement: Av < Av,min): 0.66·λs·ρw^(1/3)·√f'c·bw·d, λs = √(2/(1 + d/254)) ≤ 1, capped at 0.42√f'c·bw·d;
// the 0.17√f'c·bw·d floor (Eq. a) applies only with Av ≥ Av,min (audit fix, validation part21)
const lsH = Math.min(1, Math.sqrt(2 / (1 + dmm / 254))), rhoH = 6 * Math.PI / 4 * 169 / (1200 * dmm);
const vcH = Math.min(0.66 * lsH * Math.cbrt(rhoH) * Math.sqrt(21.7) * 1200 * dmm, 0.42 * Math.sqrt(21.7) * 1200 * dmm);
ok('design: one-way φVc = 0.75·Vc (Eq. c)', near(dz.oneway[0].chk.phiVc, 0.75 * vcH, 1e-6), `${(0.75 * vcH / 1000).toFixed(2)} kN`);
// punching: interior, b_o = 4(0.3 + d), Vu = qn·(A − (0.3 + d)²), no moment -> v = Vu/(b_o·d)
const bo = 4 * (0.3 + dm), VpH = qn * (A - (0.3 + dm) ** 2);
ok('design: punching interior, b_o = 4(c + d)', dz.punch.loc === 'interior' && near(dz.punch.bo, bo, 1e-12));
ok('design: punching Vu = qn·(A − (c + d)²)', near(dz.punch.Vu, VpH, 1e-6), `${VpH.toFixed(3)} kN`);
ok('design: punching v = Vu/(b_o·d)', near(dz.punch.vu, VpH / (bo * dm) / 1000, 1e-12));
// φvc = 0.75·min(0.33, 0.17(1 + 2/β), 0.083(40d/bo + 2))·λs·√f'c, β = 1, λs = √(2/(1 + 0.004d))
const ls2 = Math.min(1, Math.sqrt(2 / (1 + 0.004 * dmm))), vcP = Math.min(0.33, 0.17 * 3, 0.083 * (40 * dmm / (bo * 1000) + 2)) * ls2 * Math.sqrt(21.7);
ok('design: punching φvc', near(dz.punch.cap.phiVc_stress, 0.75 * vcP, 1e-12), (0.75 * vcP).toFixed(4));
ok('design: H 250 -> depth above the bottom mat (upper layer) = 250 − 75 − 13 − 13 = 149 < 150 fails; H 300 -> 199 passes',
  footingDesignCheck({ ...fD, Hf: 0.25, Df: 0.9 }, critD, ldD, { '7:301': [0, 50, 0, 0, 0, 0] }, [301]).checks[0].uc > 1 && dz.checks[0].uc <= 1);
ok('design: thin footing -> min depth fails (H 200: d = 112 < 150)', footingDesignCheck({ ...fD, Hf: 0.2, Df: 0.85 }, critD, ldD, { '7:301': [0, 50, 0, 0, 0, 0] }, [301]).checks[0].uc > 1);

// ---- 12. pedestal from STAAD reactions (pedestalDesignCheck): actions at the pedestal base ----
// L/C 301 = 1.2·D; reaction FX = −4, FY = 50, MZ = 2 at the top -> Fx = 4, P_u = 50 + 1.2·W_ped, M_z = 2 + 4·H_p (H_p = 0.95)
{ const critP = { ...critD, pedestal: { bar: 16, tie: 10, legs: 2, clearCover: 50, fyt: 280 } };
  const pd = footingWeights(fD, critP), pr = pedestalDesignCheck(fD, critP, ldD, { '7:301': [-4, 50, 0, 0, 0, 2] }, [301]);
  ok('pedestal: H_p = 0.275 + 0.65 + 0.025 = 0.95', near(pd.Hp, 0.95, 1e-12));
  ok('pedestal: P_u = R_Y + kD·W_ped', near(pr.rows[0].Pu, 50 + 1.2 * pd.Wped, 1e-9), pr.rows[0].Pu.toFixed(3));
  ok('pedestal: M_u = M_top + F_x·H_p = 2 + 4·0.95 = 5.8', near(pr.rows[0].Mu, 5.8, 1e-9));
  ok('pedestal: d′ = 50 + 10 + 8 = 68, 3 D16 per face (ρ ≥ 1 %)', pr.dPrime === 68 && pr.pm.n === 3);
  ok('pedestal: ties at min(16·16, 48·10, 300) = 256 -> 250 (25 mm steps)', pr.tieS === 250 && pr.pass); }

// ---- 13. drawing (DXF R12 / SVG) from the results: structure and the values written on it ----
{ const critP = { ...critD, pedestal: { bar: 13, tie: 10, legs: 2, clearCover: 50, fyt: 280, rhoMin: 0.005 } };
  const fP = { ...fD, pedGp: 0.275, Dp: 0.65, baseplate: { B: 0.25, L: 0.25, t: 12 }, bolts: { n: 4, dia: 16, sx: 150, sz: 150 } };
  const st = evaluateStaadFoundation(fP, critP, ldD, { '7:301': [-4, 50, 0, 0, 0, 2] }, [301]);
  const rr = { ...st, design: footingDesignCheck(fP, critP, ldD, { '7:301': [-4, 50, 0, 0, 0, 2] }, [301]),
    pedestal: pedestalDesignCheck(fP, critP, ldD, { '7:301': [-4, 50, 0, 0, 0, 2] }, [301]) };
  const E = buildFoundationDrawing(rr), dxf = toDXF(E), svg = toSVG(E);
  const dl = dxf.split(/\r?\n/);
  ok('drawing: DXF R12 header, layers, EOF', dxf.includes('AC1009') && ['CONCRETE', 'REBAR', 'DIM', 'TEXT', 'AXIS', 'HIDDEN', 'STEEL'].every(l => dl.includes(l)) && dxf.trim().endsWith('EOF'));
  ok('drawing: footing outline B × L = 1200 × 1200 in the plan', E.some(e => e.t === 'line' && e.layer === 'CONCRETE' && Math.abs(e.x1 + 600) < 1e-9 && Math.abs(e.y1 + 600) < 1e-9 && Math.abs(e.x2 - 600) < 1e-9));
  const sx = rr.design.flex.find(c => c.key === 'x-bottom').s;
  ok('drawing: footing bars text = design spacing', E.some(e => e.t === 'text' && e.s.startsWith(`D13-${sx}`)), `D13-${sx}`);
  ok('drawing: pedestal bars and ties text', E.some(e => e.t === 'text' && e.s === `${rr.pedestal.pm.n * 2} D13`) && E.some(e => e.t === 'text' && e.s === `Ø10-${rr.pedestal.tieS}`));
  ok('drawing: 4 anchor bolts in the plan + 4 in the pedestal section', E.filter(e => e.t === 'circle' && e.layer === 'STEEL').length === 8);
  ok('drawing: levels FGL ±0.000, B.O. footing −0.950', E.some(e => e.s === 'EL ±0.000 FGL') && E.some(e => e.s === 'EL −0.950 B.O. footing'));
  ok('drawing: SVG with viewBox, width and height', /<svg[^>]*viewBox="[^"]+" width="\d+" height="\d+"/.test(svg)); }

// ---- 14. anchor bolts in the top of the pedestal (ACI 318M-19 §10.7.6.1.6): top ties, enclosure, bolt / bar clash ----
// 300 × 300, cover 50, tie D10, D13 corner bars at d′ = 50 + 10 + 6.5 = 66.5 -> ±83.5 mm; 4-M16 @ 150 -> ±75: tie inner face =
// 150 − 50 − 10 = 90, bolt edge 75 + 8 = 83 ≤ 90 (enclosed); bar / bolt clear = √2·(83.5 − 75) − (16 + 13)/2 = −2.48 (clash)
{ const critT2 = { ...critD, pedestal: { bar: 13, tie: 10, legs: 2, clearCover: 50, fyt: 280, rhoMin: 0.005 } };
  const fB = { ...fD, bolts: { n: 4, dia: 16, sx: 150, sz: 150 } };
  const pt = pedestalDesignCheck(fB, critT2, ldD, { '7:301': [-4, 50, 0, 0, 0, 2] }, [301]);
  ok('top ties: 3 × D10 within 125 mm (tie < D13)', pt.topTies.n === 3 && pt.topTies.within === 125);
  ok('top ties: tie inner face 90, bolt edge 83 -> enclosed', near(pt.topTies.tieIn, 90, 1e-9) && near(pt.topTies.reach, 83, 1e-9) && pt.topTies.enclosed);
  ok('bolt / corner bar clear = √2·8.5 − 14.5 = −2.48 -> clash, pedestal NOT OK', near(pt.topTies.clear, Math.SQRT2 * 8.5 - 14.5, 1e-9) && !pt.topTies.clearOk && !pt.pass);
  // D13 ties -> 2 top ties; bigger pedestal 400 (bars ±132): clear = √2·57 − 14.5 = 66.1 -> OK
  const pt2 = pedestalDesignCheck({ ...fB, Bp: 0.4, Lp: 0.4 }, { ...critT2, pedestal: { ...critT2.pedestal, tie: 13 } }, ldD, { '7:301': [-4, 50, 0, 0, 0, 2] }, [301]);
  ok('top ties: 2 × D13 when ties are D13; 400 × 400 clears the bolts', pt2.topTies.n === 2 && pt2.topTies.clearOk && pt2.topTies.enclosed); }

// ---- 15. pedestal auto-size (project option): enlarge until the bolts clear the bars by ≥ 25 mm, whole foundation re-run ----
// cover 40, D13 + D10 ties, 4-M16 @ 150: 300 -> bars ±93.5, clear √2·18.5 − 14.5 = 11.7 < 25; 350 -> ±118.5 (corner), clear 47.0 ✓
{ const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p18-'));
  const anl = ['   SUPPORT REACTIONS -UNIT KN   METE    STRUCTURE TYPE = SPACE', ' JOINT  LOAD   FORCE-X   FORCE-Y   FORCE-Z     MOM-X     MOM-Y     MOM Z',
    '      7  101     -1.00     40.00      0.00      0.00      0.00      1.00', '         301     -1.50     50.00      0.00      0.00      0.00      1.50'].join('\n');
  fs.writeFileSync(path.join(dir, 'm.std'), STD + '\nLOAD 301 1.2D\nREPEAT LOAD\n3 1.2\n'); fs.writeFileSync(path.join(dir, 'm.ANL'), anl);
  fs.writeFileSync(path.join(dir, 'c.json'), JSON.stringify({ std: 'm.std', anl: 'm.ANL', lc: '101', lc_lrfd: '301',
    criteria: { ...crit, design: { fc: 21.7, fy: 420, cover: 75, bar: 13 }, pedestal: { bar: 13, tie: 10, clearCover: 40, rhoMin: 0.005, boltBarClearMin: 25, autoSize: { step: 0.05, to: 0.6 } } },
    foundations: [{ name: 'A', node: 7, type: 'pedestal', Bf: 1.2, Lf: 1.2, Hf: 0.3, Df: 0.95, Bp: 0.3, Lp: 0.3, pedGp: 0.275, groutT: 25, bolts: { n: 4, dia: 16, sx: 150, sz: 150 } }] }));
  const ra = runConfig(path.join(dir, 'c.json')).results[0];
  ok('pedestal auto-size: 300 (clear 11.7) -> 350 (clear 47.0)', ra.pedTrials && ra.pedTrials.length === 2 && near(ra.pedTrials[0].clear, Math.SQRT2 * 18.5 - 14.5, 1e-9)
    && near(ra.f.Bp, 0.35, 1e-12) && ra.pedestal.topTies.clearOk, ra.pedTrials && ra.pedTrials.map(t => t.Bp + ':' + t.clear.toFixed(1)).join(' '));
  ok('pedestal auto-size: footing weight re-run with the new pedestal', near(ra.w.Wped, footingWeights({ ...ra.f }, crit).Wped, 1e-9) && ra.f.Bp === 0.35);
  fs.rmSync(dir, { recursive: true, force: true }); }

console.log(`PART18: ${pass} pass, ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
