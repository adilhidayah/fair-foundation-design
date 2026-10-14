// VALIDATION part14 — audit fixes of 14 Oct 2026 (hand-calc vectors, each expected value written out independently of the lib):
//  A. anchor single-anchor shear breakout Vb — SI coefficients 0.6 / 3.7 (ACI 318M-19 §17.7.2.2.1), not the US-customary 7 / 9
//  B. one-way shear Vc — Table 22.5.5.1: the 0.17 floor only with Av >= Av,min; Eq. (c) with lambda_s otherwise
//  C. pedestal P-M — phi from the NET TENSILE strain (ACI 318M-19 Table 21.2.2), pure-tension end of the curve, envelope lookup
import { computeAnchorCapacity, pmInteractionCurve, phiMnAtP, searchPedestalBars } from '../shared/pedestalCheck.js';
import { oneWayShearCheck } from '../shared/footingCheck.js';
let pass = 0, fail = 0;
function eq(n, g, e, t = 1e-6) { const rel = Math.abs(g - e) <= t * Math.max(1, Math.abs(e)); if (rel) { pass++; console.log('PASS ' + n + ' = ' + g); } else { fail++; console.log('FAIL ' + n + ' got=' + g + ' exp=' + e); } }
function ok(n, c, x = '') { if (c) { pass++; console.log('PASS ' + n + ' ' + x); } else { fail++; console.log('FAIL ' + n + ' ' + x); } }
const anchor = (o) => computeAnchorCapacity({ da: 20, Ase: 245, futa: 400, hef: 300, Abrg: 1500, fc: 25, lambda: 1, anchorType: 'cast-in', cracked: true, phiNsa: 0.75, phiNcb: 0.65, phiNpn: 0.65, phiVsa: 0.65, phiVcb: 0.65, phiVcp: 0.65, ...o });
const Vcb = (cap) => cap.modesV.find(m => m.name.startsWith('Concrete breakout')).val;

// ---- A. anchor Vb ----
// da 20, hef 300 -> le = min(300, 160) = 160, le/da = 8, 8^0.2 = 1.515717; f'c 25 -> 5; ca1 100 -> 1000
//  (a) 0.6 * 1.515717 * sqrt(20) * 5 * 1000 = 20,335 N ;  (b) 3.7 * 5 * 1000 = 18,500 N -> Vb = 18,500 N (b governs), cracked psi = 1.0
eq('A1 Vcb, (b) governs, cracked (N)', Vcb(anchor({ ca1: 100 })), 18500, 1e-6);
eq('A2 Vcb uncracked = 1.4 x (N)', Vcb(anchor({ ca1: 100, cracked: false })), 1.4 * 18500, 1e-6);
// da 12, hef 200, f'c 30, ca1 200 -> le = min(200, 96) = 96, le/da = 8; (a) 0.6*1.515717*sqrt(12)*sqrt(30)*200^1.5 = 48,805 N ; (b) 3.7*5.477226*2828.427 = 57,324 N -> (a) governs
eq('A3 Vcb, (a) governs (N)', Vcb(anchor({ da: 12, hef: 200, fc: 30, ca1: 200 })), 0.6 * Math.pow(8, 0.2) * Math.sqrt(12) * Math.sqrt(30) * Math.pow(200, 1.5), 1e-9);
ok('A3 value 48,805 N (hand)', Math.abs(Vcb(anchor({ da: 12, hef: 200, fc: 30, ca1: 200 })) - 48805) < 5);
// US-customary cross-check of A1's anchor: Vb = 7 (le/da)^0.2 sqrt(da) sqrt(f'c) ca1^1.5 [lb, in, psi] -> 4,428 lb = 19.70 kN vs SI (a) 20.34 kN
{ const lb = 7 * Math.pow(8, 0.2) * Math.sqrt(20 / 25.4) * Math.sqrt(25 * 145.038) * Math.pow(100 / 25.4, 1.5); const kN = lb * 4.44822 / 1000;
  ok('A4 SI (a) agrees with the US-customary equation within 4 % (not 11.7x)', Math.abs(20.335 - kN) / kN < 0.04, `US ${kN.toFixed(2)} kN, SI(a) 20.34 kN`); }
// the old coefficient would have given 7 * 1.515717 * 4.472136 * 5 * 1000 = 237,244 N
ok('A5 old US coefficient (7) not used', Vcb(anchor({ ca1: 100 })) < 30000);

// ---- B. one-way shear: bw 1000, h 400, cc 40, D 19 -> d = 341; f'c 30 (5.477226); rho 0.5 % (cbrt = 0.171002); lambda 1 ----
const ow = (o) => oneWayShearCheck({ bw: 1000, h: 400, cc: 40, Dbar: 19, fc: 30, vu: 220, rho: 0.005, lambda: 1, method: 'detailed', avOk: false, ...o });
const sq = Math.sqrt(30), cb = Math.cbrt(0.005);
const lamS = Math.sqrt(2 / (1 + 341 / 254)); // 0.92399
eq('B1 d (mm)', ow().d, 341, 1e-9);
eq('B2 lambda_s', ow().lambdaS, lamS, 1e-9);
// (c): 0.66 * 0.92399 * 0.171002 * 5.477226 * 1000 * 341 = 194,780 N, no 0.17 floor (floor would be 317,513 N)
eq('B3 Vc Av<Av,min = Eq. (c), no floor (N)', ow().vc, 0.66 * lamS * cb * sq * 1000 * 341, 1e-9);
ok('B3 value 194.78 kN (hand)', Math.abs(ow().vc - 194780) < 30);
eq('B4 UC = 220 / (0.75 * 194.78) = 1.506', ow().uc, 220000 / (0.75 * 194780), 2e-4);
ok('B4 fails', ow().pass === false && ow().useFloor === false);
// Av >= Av,min: larger of (a) 0.17*sqrt(fc)*bw*d = 317,513 N and (b) 0.66*cbrt(rho)*sqrt(fc)*bw*d = 210,800 N, no lambda_s
eq('B5 Vc Av>=Av,min = max(a, b) (N)', ow({ avOk: true }).vc, 0.17 * sq * 1000 * 341, 1e-9);
ok('B5 value 317.51 kN, lambda_s not applied', Math.abs(ow({ avOk: true }).vc - 317513) < 30 && ow({ avOk: true }).lambdaS === null && ow({ avOk: true }).useFloor === true);
// (b) larger than (a): rho 3 % -> 0.66 * cbrt(0.03) * 5.477226 * 341000 = 383,000 N > 317,513 N
eq('B6 (b) governs for rho 3 % (N)', ow({ avOk: true, rho: 0.03 }).vc, 0.66 * Math.cbrt(0.03) * sq * 1000 * 341, 1e-9);
// (c) at rho 3 %: 0.66 * 0.92399 * 0.310723 * 5.477226 * 341000 = 353,900 N (above the old floor, below the cap)
eq('B7 (c) at rho 3 % (N)', ow({ rho: 0.03 }).vc, 0.66 * lamS * Math.cbrt(0.03) * sq * 1000 * 341, 1e-9);
// cap 0.42*sqrt(fc)*bw*d = 784,400 N when rho = 100 %
eq('B8 upper limit 0.42 (N)', ow({ rho: 1 }).vc, 0.42 * sq * 1000 * 341, 1e-9);
// simplified unchanged: 0.17*sqrt(fc)*bw*d
eq('B9 simplified unchanged (N)', ow({ method: 'simplified', avOk: true }).vc, 0.17 * sq * 1000 * 341, 1e-9);
// minimum depth search uses the same Vc: with Av < Av,min and Vu = 100 kN the section passes, hMin is below h and the check at hMin passes
{ const r = ow({ vu: 100 }); ok('B10 passes at Vu 100 kN and a minimum h is returned', r.pass && r.hMinRounded !== null && r.hMinRounded <= 400, 'hMin ' + r.hMinRounded);
  const r2 = oneWayShearCheck({ bw: 1000, h: r.hMinRounded, cc: 40, Dbar: 19, fc: 30, vu: 100, rho: 0.005, lambda: 1, method: 'detailed', avOk: false }); ok('B10 UC <= 1 at that h', r2.uc <= 1.0, 'UC ' + r2.uc.toFixed(3)); }

// ---- C. pedestal P-M: 600 x 600, d' 65, 8 D25 per layer (AsLayer 3926.99), f'c 30, fy 420 ----
const h = 600, b = 600, dp = 65, AsL = 8 * Math.PI / 4 * 625, fc = 30, fy = 420, Ast = 2 * AsL, Es = 200000;
const cv = pmInteractionCurve(h, b, dp, fc, fy, AsL);
eq('C1 first point = pure tension phiPn = -0.9 Ast fy (N)', cv[0].phiPn, -0.9 * Ast * fy, 1e-9);
eq('C1 pure tension Mn = 0', cv[0].phiMn, 0, 1e-9);
const beta1 = 0.85 - 0.05 * (30 - 28) / 7;
// c = 120 mm (curve[4]): a = 100.286; eps at d1 = 0.003(120-65)/120 = 0.001375 -> fs = 275 MPa (compression, inside the block: minus 0.85 f'c);
// eps at d2 = 535: 0.003(120-535)/120 = -0.010375 -> fs = -420, net tensile strain 0.010375 >= 0.005 -> phi = 0.90
{ const c = 120, a = beta1 * c, Cc = 0.85 * fc * b * a, F1 = AsL * (0.001375 * Es - 0.85 * fc), F2 = -AsL * fy; const Pn = Cc + F1 + F2, Mn = Cc * (h / 2 - a / 2) + F1 * (h / 2 - dp) + F2 * (h / 2 - (h - dp));
  eq('C2 phi at c = 120 mm (tension-controlled)', cv[4].phi, 0.90, 1e-12); eq('C2 Pn at c = 120 mm (N)', cv[4].Pn, Pn, 1e-9); eq('C2 Mn at c = 120 mm (N.mm)', cv[4].Mn, Math.abs(Mn), 1e-9);
  ok('C2 Pn = 864.8 kN (hand)', Math.abs(Pn / 1000 - 864.8) < 0.5, (Pn / 1000).toFixed(1)); }
// c = 240 mm (curve[8]): net tensile strain = 0.003(535-240)/240 = 0.0036875 -> phi = 0.65 + (0.0036875 - 0.0021) * 0.25/(0.005 - 0.0021) = 0.78685
eq('C3 phi in the transition zone', cv[8].phi, 0.65 + (0.003 * (535 - 240) / 240 - 0.0021) * 0.25 / (0.005 - 0.0021), 1e-12);
ok('C3 value 0.7869', Math.abs(cv[8].phi - 0.78685) < 1e-4, String(cv[8].phi));
// c = 600 mm (curve[20]): extreme layer in compression -> phi = 0.65 (compression-controlled)
eq('C4 phi compression-controlled', cv[20].phi, 0.65, 1e-12);
ok('C4 phi never above 0.65 once c > d2 (no rise towards pure compression)', cv.slice(20).every(p => p.phi <= 0.65 + 1e-12));
// maximum axial: 0.65 * 0.80 * (0.85 f'c (Ag - Ast) + fy Ast)
const phiPnMax = 0.65 * 0.80 * (0.85 * fc * (b * h - Ast) + fy * Ast);
eq('C5 phi Pn,max (N)', Math.max(...cv.map(p => p.phiPn)), phiPnMax, 1e-9);
// lookup: tension beyond capacity and compression beyond the maximum are out of range; the curve point itself is returned
ok('C6 Pu below pure tension capacity -> out of range', phiMnAtP(cv, -0.9 * Ast * fy - 1e5).outOfRange === true);
ok('C6 Pu above phi Pn,max -> out of range', phiMnAtP(cv, phiPnMax + 1e5).outOfRange === true);
ok('C6 Pu = pure tension capacity -> phiMn 0, in range', phiMnAtP(cv, -0.9 * Ast * fy).outOfRange === false && phiMnAtP(cv, -0.9 * Ast * fy).phiMn < 1);
{ const pt = cv[4]; const r = phiMnAtP(cv, pt.phiPn); ok('C7 lookup at a curve point returns at least that point\'s phiMn (envelope)', !r.outOfRange && r.phiMn >= pt.phiMn - 1, `${(r.phiMn / 1e6).toFixed(1)} vs ${(pt.phiMn / 1e6).toFixed(1)} kN.m`); }
// phiMn must shrink as tension grows (it was flat before the fix) and grow with compression up to the balance zone
{ const m = (P) => phiMnAtP(cv, P * 1000).phiMn; ok('C8 phiMn decreases with tension: M(-1500) < M(-500) < M(0)', m(-1500) < m(-500) && m(-500) < m(0), [m(-1500), m(-500), m(0)].map(x => (x / 1e6).toFixed(0)).join(' < ')); }
// searchPedestalBars: pure bending 100 kN.m, Pu = 0 -> smallest symmetric arrangement with rho >= 1 %: n = 4 per face = 8 D25 (rho 1.09 %)
{ const s = searchPedestalBars(600, 600, 65, 30, 420, 25, [{ combo: { lc: 'x' }, Ptop: 0, Mtop: 100 }]); ok('C9 rho >= 1 % governs: n = 4 per face', s.found && s.n === 4 && s.rho >= 0.01 && s.maxUC < 1, s.found ? `n=${s.n} rho=${(s.rho * 100).toFixed(2)}% UC=${s.maxUC.toFixed(3)}` : s.reason); }
// net uplift beyond the tension capacity of the bars is no longer silently accepted
{ const s = searchPedestalBars(600, 600, 65, 30, 420, 25, [{ combo: { lc: 'x' }, Ptop: -2500, Mtop: 50 }]); ok('C10 large uplift needs more bars (UC from the envelope, not a flat value)', s.found ? s.n >= 7 : true, s.found ? `n=${s.n}` : s.reason); }
console.log(`\nPART14: ${pass} pass, ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
