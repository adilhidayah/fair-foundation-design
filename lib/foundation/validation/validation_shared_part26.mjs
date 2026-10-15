// VALIDATION part26 — pile settlement, Vesic (1977) / Das §11.18 (pileSettlementVesic). Expected values worked by hand from the formulas
// with the inputs of the Filter Coalescer pile (D = 0.30 m square, L = 13.9 m, Ep = 29 725 MPa, Es = 48 000 kPa, μs = 0.3, Iwp = 0.85, ξ = 0.67,
// Qwp = 6.12 kN, Qws = 55.05 kN, Bg = 3.2 m). S1 matches the source document (0.22 mm); its S2 and group value differ (see notes below).
import { pileSettlementVesic } from '../index.js';
let pass = 0, fail = 0;
function ok(n, c, x = '') { if (c) { pass++; console.log('PASS ' + n + ' ' + x); } else { fail++; console.log('FAIL ' + n + ' ' + x); } }
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const base = { Qw: 61.17, shaftFraction: 55.05 / 61.17, xi: 0.67, L: 13.9, D: 0.3, shape: 'square', Ep_kPa: 29725e3, Es_kPa: 48000, mu: 0.3, Iwp: 0.85, Bg: 3.2, allow_mm: 25 };
const r = pileSettlementVesic(base);
ok('valid', r.valid && r.Ap === 0.09 && near(r.p, 1.2, 1e-12));
ok('Qws / Qwp split', near(r.Qws, 55.05, 1e-9) && near(r.Qwp, 6.12, 1e-9));
// S1 = (6.12 + 0.67·55.05)·13.9 / (0.09·29 725 000) = 43.0035·13.9 / 2 675 250 = 2.2344e-4 m
ok('S1 = 0.2234 mm (source document: 0.22 mm)', near(r.S1, 0.22344, 5e-5), r.S1.toFixed(5));
// q_wp = 6.12/0.09 = 68.0 kPa ; S2 = 68·0.3·0.91·0.85/48 000 = 3.2874e-4 m
ok('q_wp = Q_wp / A_p = 68.0 kPa (the document divides the shaft load instead: 611.7 kPa)', near(r.qwp, 68.0, 1e-9));
ok('S2 = 0.3287 mm (document: 2.96 mm, from q_wp = Q_ws / A_p)', near(r.S2, 0.32874, 5e-5), r.S2.toFixed(5));
// I_ws = 2 + 0.35·√(13.9/0.3) = 4.3824 ; S3 = 55.05/(1.2·13.9)·(0.3/48 000)·0.91·4.3824 = 8.226e-5 m
ok('I_ws = 2 + 0.35√(L/D) = 4.382 (document: 6.04)', near(r.Iws, 4.38240, 5e-5), r.Iws.toFixed(4));
ok('S3 = 0.0823 mm (square pile, p = 4D = 1.2 m)', near(r.S3, 0.08226, 5e-5), r.S3.toFixed(5));
ok('S_e = S1 + S2 + S3 = 0.6344 mm', near(r.Se, 0.63444, 1e-4), r.Se.toFixed(5));
ok('F_g = √(B_g/D) = 3.266 and S_g = 2.072 mm (document: 3.27 × 3.23 written as 5.84 mm)', near(r.Fg, 3.26599, 1e-4) && near(r.Sg, 2.07206, 5e-4), `${r.Fg.toFixed(4)} ${r.Sg.toFixed(4)}`);
ok('check vs 25 mm: UC = 0.083, PASS', near(r.uc, 2.07206 / 25, 1e-4) && r.overallPass);
// negative control: feeding the shaft load as the tip load reproduces the document's S2 = 2.96 mm
const nc = pileSettlementVesic({ ...base, Qw: 61.17, shaftFraction: 0.1 });
ok('negative control: tip share 90% -> S2 grows ~9× (the document\'s S2 error)', nc.S2 > 8 * r.S2 && nc.valid);
// circular pile: A_p = πD²/4, p = πD
const c = pileSettlementVesic({ ...base, shape: 'circular' });
ok('circular pile uses A_p = πD²/4 and p = πD', near(c.Ap, Math.PI * 0.09 / 4, 1e-12) && near(c.p, Math.PI * 0.3, 1e-12));
// limit cases and scaling
const h = pileSettlementVesic({ ...base, Qw: 2 * base.Qw });
ok('linear in the working load: S_g doubles with Q_w', near(h.Sg, 2 * r.Sg, 1e-9));
const st = pileSettlementVesic({ ...base, Es_kPa: 2 * base.Es_kPa });
ok('S2 and S3 halve with E_s doubled, S1 unchanged', near(st.S2, r.S2 / 2, 1e-9) && near(st.S3, r.S3 / 2, 1e-9) && near(st.S1, r.S1, 1e-12));
ok('group factor grows with the group width', pileSettlementVesic({ ...base, Bg: 6.4 }).Fg > r.Fg && near(pileSettlementVesic({ ...base, Bg: 0.3 }).Fg, 1, 1e-12));
ok('fails (UC > 1) when S_g exceeds the allowable', pileSettlementVesic({ ...base, allow_mm: 1 }).overallPass === false);
ok('invalid inputs are rejected', !pileSettlementVesic({ ...base, Qw: 0 }).valid && !pileSettlementVesic({ ...base, Es_kPa: 0 }).valid && !pileSettlementVesic({ ...base, mu: 0.5 }).valid && !pileSettlementVesic({ ...base, Bg: 0 }).valid && !pileSettlementVesic({ ...base, shaftFraction: 1.2 }).valid);
console.log(`\nPASS ${pass}  FAIL ${fail}`); process.exit(fail ? 1 : 0);
