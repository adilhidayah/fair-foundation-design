// VALIDATION part36 — minimum contact area criterion (project, e.g. PT-TIP pipe supports: ≥ 70 % of the base in contact), checked by
// combineFootingChecks(..., { minContact, contactRatio }) and used by the app (4A) and tools/staad-stability.mjs alike.
// Hand calculation: footing B = L = 0.60 m, P = 10 kN, M_z = 1.2 kN·m only -> e_x = 0.12 m, e/B = 0.20 > 1/6: partial uplift,
// rigid footing without tension: contact length 3(B/2 − e) = 3·0.18 = 0.54 m -> contact ratio 0.54/0.60 = 0.90 -> UC = 0.70/0.90 = 0.7778.
import { combineFootingChecks, evaluateFoundationCombo, evaluateBiaxialFooting, biaxialSoilPressure } from '../index.js';
let pass = 0, fail = 0;
function ok(n, c, x = '') { if (c) { pass++; console.log('PASS ' + n + ' ' + x); } else { fail++; console.log('FAIL ' + n + ' ' + x); } }
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const B = 0.6, L = 0.6;
const run = (P, Mz, Mx, opts) => {
  const uni = evaluateFoundationCombo(B, L, P, 0, Math.hypot(Mx, Mz), 150, 0.45, 1 / 6, 1.5, 1.5);
  const bi = evaluateBiaxialFooting(B, L, P, Mx, Mz, 1 / 6, 1.5);
  const bp = P > 0 ? biaxialSoilPressure(B, L, P, Mz / P, Mx / P) : { valid: false, contactRatio: 0 };
  return { bp, comb: combineFootingChecks(uni, bi, { eccLimit: false, ucBearingBiaxial: 0.1, ...opts, contactRatio: bp.valid ? bp.contactRatio : 0 }) };
};
const a = run(10, 1.2, 0, { minContact: 0.7 });
const c = (r) => r.comb.checks.find(x => /^Contact area/.test(x.name));
ok('uniaxial e/B = 0.20: contact ratio 0.90 (3(B/2 − e)/B)', near(a.bp.contactRatio, 0.9, 1e-9), a.bp.contactRatio.toFixed(6));
ok('UC = 0.70 / 0.90 = 0.7778, named "Contact area (min 70 %)"', near(c(a).uc, 0.7 / 0.9, 1e-9) && c(a).name === 'Contact area (min 70 %)', c(a).uc.toFixed(4));
const g = run(10, 1.8, 0, { minContact: 0.7 });   // e = 0.18: contact 3·0.12/0.6 = 0.60 -> UC 1.1667 -> fails, governs
ok('e/B = 0.30: contact 0.60, UC 1.1667 governs and fails', near(c(g).uc, 0.7 / 0.6, 1e-9) && g.comb.governingCheck.name === 'Contact area (min 70 %)' && !g.comb.overallPass, c(g).uc.toFixed(4));
const full = run(10, 0.5, 0, { minContact: 0.7 });  // e = 0.05 < 0.1: full contact -> UC 0.70
ok('inside the kern: full contact, UC = 0.70', near(full.bp.contactRatio, 1, 1e-12) && near(c(full).uc, 0.7, 1e-12));
const bi = run(10, 0.9, 0.9, { minContact: 0.7 });
ok('biaxial: UC = 0.70 / contact ratio of biaxialSoilPressure', near(c(bi).uc, 0.7 / bi.bp.contactRatio, 1e-12) && bi.bp.contactRatio < 1, `${bi.bp.contactRatio.toFixed(4)}`);
ok('no criterion (0 / not given): no contact check, previous result unchanged', !c(run(10, 1.8, 0, {})) && !c(run(10, 1.8, 0, { minContact: 0 })) && run(10, 1.8, 0, {}).comb.governingUC === run(10, 1.8, 0, { minContact: 0 }).comb.governingUC);
const sep = combineFootingChecks(evaluateFoundationCombo(B, L, 10, 0, 0.5, 150, 0.45, 1 / 6, 1.5, 1.5), evaluateBiaxialFooting(B, L, 10, 0, 0.5, 1 / 6, 1.5), { eccLimit: false, minContact: 0.7, contactRatio: 0 });
ok('no contact (net uplift / resultant outside the base -> contactRatio 0): UC ∞', c({ comb: sep }).uc === Infinity && !sep.overallPass);
ok('with eccLimit false the kern check is not in the list', !a.comb.checks.some(x => /Eccentricity/.test(x.name)));
console.log(`\nPASS ${pass}  FAIL ${fail}`); process.exit(fail ? 1 : 0);
