// VALIDATION part13 — shallow footing with an offset pedestal (pedestalOffsetMoments) and the biaxial checks in the
// governing UC / pass (combineFootingChecks). Hand-calc vectors from the pipe-support design of 9 Oct 2026 (STAAD node 1).
import { pedestalOffsetMoments, combineFootingChecks, evaluateFoundationCombo, evaluateBiaxialFooting } from '../shared/stabilityCheck.js';
import { foundationSizing } from '../static/foundationSizing.js';
let pass = 0, fail = 0;
function ok(n, c, x = '') { if (c) { pass++; console.log('PASS ' + n + ' ' + x); } else { fail++; console.log('FAIL ' + n + ' ' + x); } }
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

// ---- pedestalOffsetMoments: zero offset, signs, soil centroid ----
const z0 = pedestalOffsetMoments({ Ptop: 50, kD: 1, Wped: 5, Wsoil: 20, OffX: 0, OffZ: 0, Af: 2, Ap: 0.25 });
ok('no offset -> no moment', z0.dMx === 0 && Math.abs(z0.dMz) === 0, `${z0.dMx}, ${z0.dMz}`);
// downward load at +x compresses the +x side -> Mz = +P·OffX
const sx = pedestalOffsetMoments({ Ptop: 10, OffX: 0.2, Af: 1, Ap: 0.25 });
ok('P at +x -> dMz = +P·OffX = +2', near(sx.dMz, 2) && near(sx.dMx, 0), `${sx.dMz}`);
// downward load at +z compresses the +z side -> Mx = −P·OffZ (Mx > 0 compresses the −z side)
const sz = pedestalOffsetMoments({ Ptop: 10, OffZ: 0.2, Af: 1, Ap: 0.25 });
ok('P at +z -> dMx = −P·OffZ = −2', near(sz.dMx, -2) && near(sz.dMz, 0), `${sz.dMx}`);
// backfill centroid: Af 1, Ap 0.25, OffZ 0.2 -> zs = −0.2·0.25/0.75 = −0.06667; Ws 10 -> dMx = −(10·zs) = +0.6667
const ss = pedestalOffsetMoments({ Wsoil: 10, OffZ: 0.2, Af: 1, Ap: 0.25 });
ok('soil centroid zs = −0.06667', near(ss.zs, -0.2 * 0.25 / 0.75), `${ss.zs}`);
ok('soil at −z -> dMx = +0.6667', near(ss.dMx, 10 * 0.2 * 0.25 / 0.75), `${ss.dMx}`);
// kD scales the self-weight only, not P_top: Ptop 4, kD 0.6, Wped 2, OffX 0.3 -> (4 + 1.2)·0.3 = 1.56
const kd = pedestalOffsetMoments({ Ptop: 4, kD: 0.6, Wped: 2, OffX: 0.3, Af: 2, Ap: 0.09 });
ok('kD on self-weight only', near(kd.Wat, 5.2) && near(kd.dMz, 5.2 * 0.3 + 0), `${kd.dMz}`);
// equilibrium: pedestal + soil prism of the same unit weight over the whole footing area acts at the footing centre
// (W_ped = γ·Ap·h at +Off, W_soil = γ·(Af − Ap)·h at the shifted centroid) -> no net moment
const eq = pedestalOffsetMoments({ Wped: 18 * 0.25 * 1.0, Wsoil: 18 * 0.75 * 1.0, OffX: 0.2, OffZ: -0.15, Af: 1, Ap: 0.25 });
ok('uniform prism -> zero net moment', near(eq.dMx, 0, 1e-12) && near(eq.dMz, 0, 1e-12), `${eq.dMx}, ${eq.dMz}`);

// ---- pipe support, LC 115, footing 1.30 (x) × 1.40 (z), +z edge 0.40 m from the pedestal centre -> OffZ = 0.30 ----
// footing 0.25 thick, Df 0.90, pedestal 0.30 × 0.30, 0.275 above ground, grout 25 mm, γc 24, γs 18 kN/m³
const g = 9.80665;
const sz13 = foundationSizing({ type: 'pedestal', Bf: 1.3, Lf: 1.4, Hf: 0.25, Df: 0.9, gc: 24 / g, gs: 18 / g, Bp: 0.3, Lp: 0.3,
  pedGp: 0.275, OffX: 0, OffZ: 0.30, blockGp: 0, groutT: 0.025 });
const dW = sz13.totalWeightKN, Wped = (sz13.Wp + sz13.Wg) * g, Ws = sz13.Ws * g;
ok('ΔW = 33.21 kN (Wf 10.92 + Wp 2.00 + Wg 0.05 + Ws 20.24)', near(dW, 33.21, 0.01), dW.toFixed(3));
ok('Δh = 1.200 m', near(sz13.deltaH, 1.2, 1e-9), String(sz13.deltaH));
// STAAD reaction LC 115: Fx −0.838, Fy 0.622, Fz −0.251, Mx −0.626, Mz 1.539 -> load on the foundation (app convention):
// P = +Fy, Hx = −Fx, Hz = −Fz, Mx = +Mx, Mz = +Mz; dead-load factor kD = 0.6 − 0.14·SDS, SDS = 0.623
const kD115 = 0.6 - 0.14 * 0.623, Ptop = 0.622, Hx = 0.838, Hz = 0.251;
const off = pedestalOffsetMoments({ Ptop, kD: kD115, Wped, Wsoil: Ws, OffX: 0, OffZ: 0.30, Af: 1.3 * 1.4, Ap: 0.09 });
// hand: −[(0.622 + 0.5128·2.054)·0.30 + 0.5128·20.24·(−0.30·0.09/1.73)] = −(0.5026 − 0.1620) = −0.3405
ok('LC115 ΔMx,off = −0.340 kN·m', near(off.dMx, -0.340, 0.002), off.dMx.toFixed(4));
const P = Ptop + kD115 * dW, Mx = -0.626 - Hz * 1.2 + off.dMx, Mz = 1.539 + Hx * 1.2;
ok('LC115 P at bottom = 17.65 kN', near(P, 17.65, 0.01), P.toFixed(3));
ok('LC115 Mx at bottom = −1.267 kN·m', near(Mx, -1.267, 0.002), Mx.toFixed(4));
ok('LC115 Mz at bottom = 2.545 kN·m', near(Mz, 2.5446, 0.001), Mz.toFixed(4));
const bi = evaluateBiaxialFooting(1.3, 1.4, P, Mx, Mz, 1 / 6, 1.5);
// hand: (2.545/17.65/1.3 + 1.267/17.65/1.4)·6 = (0.1109 + 0.0513)·6 = 0.973
ok('LC115 biaxial kern = 0.973', near(bi.ucKernBiaxial, 0.973, 0.002), bi.ucKernBiaxial.toFixed(4));
// hand: SF1 = P·B/2 / |Mz| = 17.65·0.65/2.545 = 4.51 -> UC = 1.5/4.51 = 0.333
ok('LC115 biaxial OT UC = 0.333', near(bi.ucOTBiaxial, 0.333, 0.002), bi.ucOTBiaxial.toFixed(4));

// ---- combineFootingChecks: biaxial kern governs where the resultant-e check passes ----
// B = L = 1.2, P = 10, Mx = Mz = 1.1 -> e = 0.1556 ≤ B/6 = 0.2 (uniaxial UC 0.778), biaxial (0.11/1.2·2)·6 = 1.100
const M = Math.hypot(1.1, 1.1);
const u = evaluateFoundationCombo(1.2, 1.2, 10, 0, M, 300, 0.4, 1 / 6, 1.5, 1.5);
const b = evaluateBiaxialFooting(1.2, 1.2, 10, 1.1, 1.1, 1 / 6, 1.5);
ok('uniaxial checks alone pass', u.overallPass, u.governingUC.toFixed(3));
const c = combineFootingChecks(u, b);
ok('combined: fails', c.overallPass === false);
ok('combined: governed by biaxial kern', c.governingCheck.name === 'Eccentricity (biaxial kern)', c.governingCheck.name);
ok('combined: governing UC = 1.100', near(c.governingUC, 1.1, 1e-9), c.governingUC.toFixed(4));
ok('combined: keeps the 4 uniaxial checks + 2 biaxial', c.checks.length === 6 && c.checks[1].name === 'Bearing pressure');
// all within limits -> passes, governing = largest of the six
const u2 = evaluateFoundationCombo(2.0, 2.0, 50, 2, 3, 300, 0.4, 1 / 6, 1.5, 1.5), b2 = evaluateBiaxialFooting(2.0, 2.0, 50, 2, 2.236, 1 / 6, 1.5);
const c2 = combineFootingChecks(u2, b2);
ok('combined: passes when all six pass', c2.overallPass && near(c2.governingUC, Math.max(...c2.checks.map(k => k.uc))));
// invalid uniaxial result (net uplift) is passed through unchanged
const inv = evaluateFoundationCombo(1, 1, -5, 0, 1, 300, 0.4, 1 / 6, 1.5, 1.5);
ok('invalid passes through', combineFootingChecks(inv, evaluateBiaxialFooting(1, 1, -5, 0, 1, 1 / 6, 1.5)) === inv);

console.log(`PART13: ${pass} pass, ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
