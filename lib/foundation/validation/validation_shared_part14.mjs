// VALIDATION part14 — soil pressure under a rigid rectangular footing with biaxial eccentricity, no tension (biaxialSoilPressure)
// and the "no eccentricity limit" option of combineFootingChecks. Closed-form vectors (Bowles, Foundation Analysis and Design —
// eccentrically loaded footings) plus an independent brute-force grid integration of the returned pressure plane.
import { biaxialSoilPressure, combineFootingChecks, evaluateFoundationCombo, evaluateBiaxialFooting, meyerhofEffectiveArea } from '../shared/stabilityCheck.js';
import { bearingCapacityCheck, terzaghiFactors } from '../shared/bearingCapacity.js';
let pass = 0, fail = 0;
function ok(n, c, x = '') { if (c) { pass++; console.log('PASS ' + n + ' ' + x); } else { fail++; console.log('FAIL ' + n + ' ' + x); } }
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const rel = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol * Math.abs(b);

// Independent check: integrate max(0, a + b·x + c·z) on an n × n grid (midpoint rule) -> P, P·ex, P·ez, contact area.
function grid(B, L, r, n = 600) {
  let F = 0, Fx = 0, Fz = 0, Ac = 0;
  const dx = B / n, dz = L / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x = -B / 2 + (i + 0.5) * dx, z = -L / 2 + (j + 0.5) * dz, q = r.a + r.b * x + r.c * z;
    if (q > 0) { F += q * dx * dz; Fx += q * x * dx * dz; Fz += q * z * dx * dz; Ac += dx * dz; }
  }
  return { F, Fx, Fz, Ac };
}

// ---- 1. full contact: q = P/(BL)(1 ± 6ex/B ± 6ez/L) ----
// B 2.0, L 3.0, P 600, ex 0.10, ez 0.15 -> 6ex/B + 6ez/L = 0.3 + 0.3 = 0.6; q0 = 100 -> qmax 160, qmin 40
const f1 = biaxialSoilPressure(2.0, 3.0, 600, 0.10, 0.15);
ok('full contact flagged', f1.valid && f1.fullContact === true && f1.contactRatio === 1);
ok('full contact qmax = 160', near(f1.qmax, 160, 1e-9), f1.qmax);
ok('full contact qmin = 40', near(f1.qmin, 40, 1e-9), f1.qmin);
// sign of the eccentricity only mirrors the picture
ok('negative ex/ez -> same qmax', near(biaxialSoilPressure(2.0, 3.0, 600, -0.10, -0.15).qmax, 160, 1e-9));
// on the kern line exactly: 6·0.2/2 + 6·0.2/3 = 0.6 + 0.4 = 1 -> qmax = 2·P/A = 200, qmin = 0
const f2 = biaxialSoilPressure(2.0, 3.0, 600, 0.2, 0.2);
ok('kern line: qmax = 2P/A = 200', near(f2.qmax, 200, 1e-9) && near(f2.qmin, 0, 1e-9), f2.qmax);

// ---- 2. uniaxial beyond the kern: q_max = 2P / [3L(B/2 − e)], contact length 3(B/2 − e) ----
// B 2.0, L 1.5, P 300, ex 0.5 (> B/6 = 0.333) -> 2·300/(3·1.5·0.5) = 266.667; contact 3·0.5 = 1.5 m of 2.0 -> 75 %
const u1 = biaxialSoilPressure(2.0, 1.5, 300, 0.5, 0);
ok('uniaxial e > B/6: partial contact', u1.valid && u1.fullContact === false);
ok('uniaxial qmax = 2P/[3L(B/2−e)] = 266.667', rel(u1.qmax, 2 * 300 / (3 * 1.5 * 0.5)), u1.qmax.toFixed(4));
ok('uniaxial contact ratio = 0.75', rel(u1.contactRatio, 0.75), u1.contactRatio.toFixed(6));
// along z instead: L 2.0, B 1.5, ez 0.6 -> 2·300/(3·1.5·0.4) = 333.333
const u2 = biaxialSoilPressure(1.5, 2.0, 300, 0, 0.6);
ok('uniaxial along z qmax = 333.333', rel(u2.qmax, 2 * 300 / (3 * 1.5 * 0.4)), u2.qmax.toFixed(4));

// ---- 3. corner triangle: contact zone a right triangle with legs s = 4(B/2 − ex), t = 4(L/2 − ez); q_max = 6P/(s·t) ----
// (pressure pyramid: volume q·s·t/6, centroid s/4, t/4 from the corner). Valid while s ≤ B and t ≤ L.
// B = L = 2.0, P 100, ex = ez = 0.7 -> s = t = 1.2 -> q_max = 600/1.44 = 416.667, contact 0.72/4 = 18 %
const c1 = biaxialSoilPressure(2.0, 2.0, 100, 0.7, 0.7);
ok('corner triangle qmax = 6P/(s·t) = 416.667', rel(c1.qmax, 6 * 100 / (1.2 * 1.2)), c1.qmax.toFixed(4));
ok('corner triangle contact = s·t/2 / A = 0.18', rel(c1.contactRatio, 0.72 / 4), c1.contactRatio.toFixed(6));
// rectangular: B 1.6, L 2.4, P 250, ex 0.55, ez 0.85 -> s = 4·0.25 = 1.0 ≤ 1.6, t = 4·0.35 = 1.4 ≤ 2.4 -> 6·250/1.4 = 1071.43
const c2 = biaxialSoilPressure(1.6, 2.4, 250, 0.55, 0.85);
ok('corner triangle (rect) qmax = 1071.43', rel(c2.qmax, 6 * 250 / (1.0 * 1.4)), c2.qmax.toFixed(4));

// ---- 4. general partial contact (pentagon / trapezoid zones): equilibrium by independent grid integration ----
for (const [B, L, P, ex, ez] of [[1.45, 1.45, 17.6, 0.25, 0.12], [2.0, 3.0, 500, 0.30, 0.35], [1.4, 1.4, 20, 0.45, 0.05], [3.0, 2.0, 800, 0.2, 0.3]]) {
  const r = biaxialSoilPressure(B, L, P, ex, ez);
  const g = grid(B, L, r);
  ok(`grid ΣF = P (${B}×${L}, ex ${ex}, ez ${ez})`, rel(g.F, P, 2e-3), `${g.F.toFixed(4)} vs ${P}`);
  ok(`grid ΣF·x = P·ex`, rel(g.Fx, P * ex, 3e-3), `${g.Fx.toFixed(4)} vs ${(P * ex).toFixed(4)}`);
  ok(`grid ΣF·z = P·ez`, rel(g.Fz, P * ez, 3e-3), `${g.Fz.toFixed(4)} vs ${(P * ez).toFixed(4)}`);
  ok(`grid contact area`, rel(g.Ac, r.contactArea, 5e-3), `${g.Ac.toFixed(4)} vs ${r.contactArea.toFixed(4)}`);
}
// continuity across the kern line: just outside ≈ the full-contact value on it
const k0 = biaxialSoilPressure(2.0, 3.0, 600, 0.2, 0.2), k1 = biaxialSoilPressure(2.0, 3.0, 600, 0.2001, 0.2001);
ok('continuous at the kern line', !k1.fullContact && rel(k1.qmax, k0.qmax, 2e-3), `${k1.qmax.toFixed(3)} vs ${k0.qmax}`);
// biaxial ≥ uniaxial resultant formula for a square footing (ex + ez ≥ √(ex² + ez²))
const sq = biaxialSoilPressure(1.5, 1.5, 50, 0.15, 0.1), e = Math.hypot(0.15, 0.1);
ok('square, full contact: biaxial ≥ uniaxial (resultant) q', sq.qmax >= (50 / 2.25) * (1 + 6 * e / 1.5));
// resultant on / outside the edge -> invalid
ok('ex ≥ B/2 -> invalid', biaxialSoilPressure(2, 2, 100, 1.0, 0.1).valid === false);
ok('P ≤ 0 -> invalid', biaxialSoilPressure(2, 2, -5, 0.1, 0.1).valid === false);

// ---- 5. combineFootingChecks: no eccentricity limit, biaxial bearing added ----
const uni = evaluateFoundationCombo(1.2, 1.2, 10, 0, Math.hypot(1.1, 1.1), 100, 0.4, 1 / 6, 1.5, 1.5);
const bi = evaluateBiaxialFooting(1.2, 1.2, 10, 1.1, 1.1, 1 / 6, 1.5);
const bp = biaxialSoilPressure(1.2, 1.2, 10, 0.11, 0.11);   // 6·0.11/1.2·2 = 1.1 > 1 -> partial contact
const nl = combineFootingChecks(uni, bi, { eccLimit: false, ucBearingBiaxial: bp.qmax / 100 });
ok('no limit: eccentricity checks left out', !nl.checks.some(c => /Eccentricity/.test(c.name)), nl.checks.map(c => c.name).join(', '));
ok('no limit: biaxial bearing added', nl.checks.some(c => c.name === 'Bearing pressure (biaxial)' && near(c.uc, bp.qmax / 100, 1e-12)));
ok('no limit: passes (kern 1.1 no longer counts)', nl.overallPass === true, nl.governingCheck.name);
const wl = combineFootingChecks(uni, bi, { ucBearingBiaxial: bp.qmax / 100 });
ok('with limit: kern still governs + biaxial bearing listed', wl.overallPass === false && wl.governingCheck.name === 'Eccentricity (biaxial kern)' && wl.checks.length === 7);
ok('no opts: unchanged (6 checks)', combineFootingChecks(uni, bi).checks.length === 6);

// ---- 6. Meyerhof effective area: B' = B − 2ex, L' = L − 2ez, q' = P/(B'L'); q_a recomputed with B' (shorter), L' ----
// B 2.0, L 3.0, P 600, ex 0.5, ez 0.3 -> B' 1.0, L' 2.4, q' = 600/2.4 = 250
const m1 = meyerhofEffectiveArea(2.0, 3.0, 600, -0.5, 0.3);
ok("Meyerhof B' = 1.0, L' = 2.4", m1.valid && near(m1.Beff, 1.0, 1e-12) && near(m1.Leff, 2.4, 1e-12));
ok("Meyerhof q' = 250", near(m1.qeff, 250, 1e-9), m1.qeff);
// ez large -> L' becomes the shorter side: B 1.0, L 1.0, ex 0.1, ez 0.3 -> B' 0.8, L' 0.4 -> Bshort 0.4, Llong 0.8
const m2 = meyerhofEffectiveArea(1.0, 1.0, 10, 0.1, 0.3);
ok("Meyerhof shorter side as width", near(m2.Bshort, 0.4, 1e-12) && near(m2.Llong, 0.8, 1e-12) && near(m2.qeff, 10 / 0.32, 1e-9));
ok("Meyerhof ex ≥ B/2 -> invalid", meyerhofEffectiveArea(1, 1, 10, 0.5, 0).valid === false);
// effective-area bearing capacity, DCPT-01 soil (c 6.865 kPa, φ 18.81°, γ 14.32, Df 0.9), Terzaghi general, FS 3,
// B' = 0.6, L' = 0.9 (rectangular): sc = 1 + 0.3·(0.6/0.9) = 1.2, sγ = 1 − 0.2·(0.6/0.9) = 0.8667
const { Nc, Nq, Ng } = terzaghiFactors(18.81);
const quHand = 6.865 * Nc * 1.2 + 14.32 * 0.9 * Nq + 0.5 * 14.32 * 0.6 * Ng * (1 - 0.2 * 0.6 / 0.9);
const bcE = bearingCapacityCheck({ c: 6.865, phiDeg: 18.81, gamma: 14.32, shape: 'rectangular', B: 0.6, L: 0.9, Df: 0.9, method: 'terzaghi', FS: 3, failure: 'general', beta: 0 });
ok("q_u with B', L' (Terzaghi rect.) = hand", rel(bcE.qu, quHand, 1e-12), `${bcE.qu.toFixed(2)} vs ${quHand.toFixed(2)}`);
// smaller effective width -> lower q_u than the full 1.0 × 1.0 square
const bcF = bearingCapacityCheck({ c: 6.865, phiDeg: 18.81, gamma: 14.32, shape: 'square', B: 1.0, L: 1.0, Df: 0.9, method: 'terzaghi', FS: 3, failure: 'general', beta: 0 });
ok("q_a(B', L') < q_a(B, L)", bcE.qa < bcF.qa, `${bcE.qa.toFixed(1)} < ${bcF.qa.toFixed(1)}`);

console.log(`PART14: ${pass} pass, ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
