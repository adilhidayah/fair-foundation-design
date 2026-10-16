// VALIDATION part39 — anchor group against ACI SP-17M(14) "The Reinforced Concrete Design Handbook", Anchorage Example 18 (cast-in
// column anchors, tension and shear): 4 × 33 mm F1554 Gr 380 (A_se 694, f_uta 520), h_ef 450, A_brg 1764, f'c 31, pedestal 700 × 700
// (Steps 5–10) and 800 × 800 (Step 11), s = 400, Condition A (φ 0.75), N_ua,g = 516.5 kN, V_ua,g = 133.7 kN. Handbook values are
// rounded (h_ef' 133, A_Nco 159 200, #25 = 510 mm², #13 = 129 mm²): tolerance 1 % unless noted. Also the side-face corner factor
// (§17.6.4.1.1, Step 10), the ties in the top 125 mm (Steps 17b / 17c, Case 1 / 2) and the CLI / .fnd mapping of the ties.
import { anchorGroupCheck } from '../shared/anchorGroup.js';
import { anchorShearReinf } from '../../../tools/staad-stability.mjs';
import { parseFndCommands } from '../import/fndCommands.js';
let pass = 0, fail = 0;
function ok(n, c, x = '') { if (c) { pass++; console.log('PASS ' + n + ' ' + x); } else { fail++; console.log('FAIL ' + n + ' ' + x); } }
const rel = (a, b, tol = 0.01) => Math.abs(a - b) <= tol * Math.abs(b);
const phi = { sN: 0.75, cN: 0.75, pN: 0.75, sV: 0.65, cV: 0.75, ar: 0.75 };
const ex = { Bp: 700, Lp: 700, sx: 400, sz: 400, da: 33, Ase: 694, futa: 520, hef: 450, Abrg: 1764, fc: 31, seismic: false, phi, P: -516.5, Fx: 133.7 };
const r = anchorGroupCheck(ex);

// Step 5: steel, φN_sa = 0.75·360.9 = 270.7 kN, N_ua = 516.5/4 = 129.1 kN -> 0.48
ok('Step 5: φN_sa = 270.7 kN/anchor, UC 129.1/270.7 = 0.48', rel(0.75 * r.Nsa / 1000, 270.7) && rel(r.tension[0].uc, 129.125 / 270.7), r.tension[0].uc.toFixed(3));
// Step 6: h_ef' = max(150/1.5, 400/3) = 133, A_Nc = 700², ψ_ed,N = 0.927, N_b = 85.4, N_cbg = 243.7, φN_cbg = 183 < 516.5 NG
ok("Step 6: h_ef' = 133 mm (s/3 controls)", rel(r.hefE, 133), r.hefE.toFixed(1));
ok('Step 6: A_Nc = 490 000 mm² (pedestal area)', r.ANc === 490000);
ok('Step 6: ψ_ed,N = 0.927', rel(r.psiEdN, 0.927), r.psiEdN.toFixed(3));
ok('Step 6: N_b = 85.4 kN', rel(r.Nb / 1000, 85.4), (r.Nb / 1000).toFixed(1));
ok('Step 6: N_cbg = 243.7 kN', rel(r.Ncbg / 1000, 243.7), (r.Ncbg / 1000).toFixed(1));
ok('Step 6: breakout UC = 516.5/183 = 2.82 (NG)', rel(r.tension[1].uc, 516.5 / 183) && r.tension[1].name === 'Concrete breakout N_cbg', r.tension[1].uc.toFixed(3));
// Step 9: pullout N_p = 8·1764·31 = 437 kN, φ = 0.75 -> 328 kN vs 129.1 -> 0.39
ok('Step 9: φN_pn = 328 kN, UC 0.39', rel(0.75 * r.Npn / 1000, 328) && rel(r.tension[2].uc, 129.125 / 328), r.tension[2].uc.toFixed(3));
// Step 10: side-face blowout, h_ef 450 > 2.5·150, s 400 < 6·150: N_sb = 456 kN, corner (1 + 150/150)/4 = 1/2 -> 228 kN,
// φN_sbg = (1 + 400/900)·0.75·228 = 247 kN; 2φN_sbg = 494 kN < 516.5 NG
ok('Step 10: corner factor (1 + c_a2/c_a1)/4 = 0.5', rel(r.psiCornerSb, 0.5, 1e-12));
ok('Step 10: φN_sbg = (1 + 400/900)·0.75·0.5·456 = 247 kN', rel(0.75 * r.Nsbg / 1000, 247), (0.75 * r.Nsbg / 1000).toFixed(1));
ok('Step 10: side-face UC = 516.5 / (2·247) = 1.05 (NG)', rel(r.tension[3].uc, 516.5 / 494) && r.tension[3].uc > 1, r.tension[3].uc.toFixed(3));
// Step 11: pedestal 800 × 800: h_ef' = 133, ψ_ed,N = 1.0, N_cbg = 343.3 kN, φN_cbg = 257.5 kN; side-face not considered (450 < 500)
const r8 = anchorGroupCheck({ ...ex, Bp: 800, Lp: 800 });
ok('Step 11: 800 × 800 -> ψ_ed,N = 1.0, N_cbg = 343.3 kN', rel(r8.psiEdN, 1, 1e-9) && rel(r8.Ncbg / 1000, 343.3), (r8.Ncbg / 1000).toFixed(1));
ok('Step 11: φN_cbg = 257.5 kN -> UC 516.5/257.5 = 2.01 (NG)', rel(r8.tension[1].uc, 516.5 / 257.5), r8.tension[1].uc.toFixed(3));
ok('Step 10/11: h_ef 450 ≤ 2.5·200 -> no side-face blowout', !Number.isFinite(r8.Nsbg) && r8.tension[3].uc === 0);
// Step 7: anchor reinforcement = the 8 pedestal bars (all within h_ef/2 = 225 of an anchor): A_s,req = 516.5/(0.75·420) = 1640 mm²;
// A_s,prov = 8 × 510 (handbook) -> 1640/4080 = 0.40 (FAIR: 8 × π/4·25² = 3927 mm² -> 0.42; nominal-area difference only)
const d = 50 + 13 + 12.5, h8 = 350 - d;
const bars = [[-h8, -h8], [0, -h8], [h8, -h8], [h8, 0], [h8, h8], [0, h8], [-h8, h8], [-h8, 0]];
const rb = anchorGroupCheck({ ...ex, reinf: { bars, db: 25, fy: 420, topCover: 50 } });
ok('Step 7: all 8 pedestal bars count (within h_ef/2 = 225 of an anchor)', rb.ar.n === 8);
ok('Step 7: strength N_ua,g / (0.75·A_s·f_y) = 516.5/(0.75·8·490.9·420) (handbook 1640/4080 with 510 mm²)',
  rel(516.5e3 / rb.ar.phiNn, 516.5e3 / (0.75 * 8 * Math.PI / 4 * 625 * 420), 1e-9) && rel(516.5e3 / rb.ar.phiNn, 1640 / 4080, 0.05), (516.5e3 / rb.ar.phiNn).toFixed(3));
// Step 8: available above the 35° plane = 450 − 50 − 105·tan35° = 326.5 mm (handbook ≈ 350). Handbook l_dh = 0.7 (ψc, 318M-14)
// × 453 × A_s,req/A_s,prov (§25.4.10.1) = 255 mm -> OK. FAIR: l_dh per 318M-19 §25.4.3.1 (ψc = f'c/105 + 0.6) without the
// excess-reinforcement reduction = 367 mm > 326.5 -> not developed (conservative; documented difference).
ok('Step 8: available length 326.5 mm; FAIR l_dh (318M-19, no A_s,req/A_s,prov) = 367 mm -> not developed (handbook 255 mm OK)',
  rel(rb.ar.avail, 450 - 50 - Math.SQRT2 * 74.5 * Math.tan(35 * Math.PI / 180), 1e-9) && rel(rb.ar.ldh, 420 * (31 / 105 + 0.6) / (23 * Math.sqrt(31)) * Math.pow(25, 1.5), 1e-9) && !rb.ar.developed,
  `${rb.ar.avail.toFixed(1)} / ${rb.ar.ldh.toFixed(1)}`);

// Steps 17b / 17c: ties in the top 125 mm. Case 1: V/4 = 33.4 kN per anchor, A_s = 33.4/(0.75·420) = 106 mm² -> one #13 (129 mm²)
const db13 = Math.sqrt(4 * 129 / Math.PI);
const t1 = anchorGroupCheck({ ...ex, Bp: 800, Lp: 800, shearReinf: { type: 'ties', n: 2, db: db13, fy: 420, case: 1 } });
ok('Step 17b: Case 1 -> V_a = T = 133.7/4 = 33.4 kN', rel(t1.arV.Va, 33.425, 1e-9) && rel(t1.arV.T, 33.425, 1e-9));
ok('Step 17b: A_s,req = 106 mm² ≤ one #13 -> 2 ties UC = 106 / (2·129)', rel(t1.shear[1].uc, 33.425e3 / (0.75 * 420) / (2 * 129), 1e-9) && rel(33.425e3 / (0.75 * 420), 106), t1.shear[1].uc.toFixed(3));
ok('ties replace V_cbg in the shear checks', /ties in the top 125 mm/.test(t1.shear[1].name) && t1.arV.minOk);
const t2 = anchorGroupCheck({ ...ex, Bp: 800, Lp: 800, shearReinf: { type: 'ties', n: 2, db: 13, fy: 420 } });
ok('Step 17c: Case 2 (default) -> V_a = V/2 = 66.9 kN, UC = 66.85 / (0.75·2·132.7·420)', t2.arV.case === 2 && rel(t2.shear[1].uc, 66.85e3 / (0.75 * 2 * Math.PI / 4 * 169 * 420), 1e-9), t2.shear[1].uc.toFixed(3));
ok('§10.7.6.1.6: 1 × D13 < 2 -> UC ∞; 3 × D10 OK, 2 × D10 not', anchorGroupCheck({ ...ex, shearReinf: { type: 'ties', n: 1, db: 13, fy: 420 } }).shear[1].uc === Infinity &&
  anchorGroupCheck({ ...ex, shearReinf: { type: 'ties', n: 3, db: 10, fy: 420 } }).arV.minOk && !anchorGroupCheck({ ...ex, shearReinf: { type: 'ties', n: 2, db: 10, fy: 420 } }).arV.minOk);
ok('diamond ties: flag only, same strength', anchorGroupCheck({ ...ex, shearReinf: { type: 'ties', n: 2, db: 13, fy: 420, diamond: true } }).shear[1].uc === t2.shear[1].uc);
ok('shearReinf none -> concrete breakout V_cbg, also with shear hairpins in reinf', anchorGroupCheck({ ...ex, reinf: { type: 'hairpin', db: 13, fy: 420 }, shearReinf: { type: 'none' } }).shear[1].name === 'Concrete breakout V_cbg');
ok('shearReinf hairpin with pedestal bars in tension', (() => { const q = anchorGroupCheck({ ...ex, Bp: 800, Lp: 800, reinf: { bars, db: 25, fy: 420 }, shearReinf: { type: 'hairpin', db: 13, fy: 420 } }); return q.ar.type === 'bars' && q.arV.type === 'hairpin'; })());

// CLI / .fnd
const cs = anchorShearReinf({ shearReinforcement: 'ties' }, { bar: 13, tie: 10, nTop: 3, fy: 420 });
ok('CLI: "ties" defaults = the pedestal top ties (3 × D10), Case 2', cs.type === 'ties' && cs.n === 3 && cs.db === 10 && cs.case === 2 && !cs.diamond);
ok('CLI: ties { n 4, db 13, case 1, diamond }', (() => { const q = anchorShearReinf({ shearReinforcement: 'ties', ties: { n: 4, db: 13, case: 1, diamond: true } }, { bar: 13, tie: 10, nTop: 3, fy: 420 }); return q.n === 4 && q.db === 13 && q.case === 1 && q.diamond; })());
ok('CLI: not given -> null (tension-hairpin shear flag applies), "none" -> type none', anchorShearReinf({}, { tie: 10, nTop: 3, fy: 420 }) === null && anchorShearReinf({ shearReinforcement: 'none' }, {}).type === 'none');
const f = parseFndCommands('ANCHOR SHEAR TIES N 4 BAR 13 CASE 1 DIAMOND');
ok('.fnd: ANCHOR SHEAR TIES N 4 BAR 13 CASE 1 DIAMOND', (() => { const a = f.config.criteria.pedestal.anchor; return a.shearReinforcement === 'ties' && a.ties.n === 4 && a.ties.db === 13 && a.ties.case === 1 && a.ties.diamond; })());
ok('.fnd: ANCHOR SHEAR needs TIES / HAIRPIN / NONE; CASE 1 or 2', parseFndCommands('ANCHOR SHEAR BARS').errors.some(e => /TIES, HAIRPIN or NONE/.test(e)) && parseFndCommands('ANCHOR SHEAR TIES CASE 3').errors.some(e => /CASE needs 1 or 2/.test(e)));

console.log(`PART39: ${pass} pass, ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
