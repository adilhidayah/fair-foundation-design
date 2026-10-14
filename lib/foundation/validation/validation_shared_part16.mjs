// VALIDATION part16 — STAAD support reactions -> FAIR load input convention (staadReactionToFair).
// Independent first-principles check: loads are applied to a structure above the footing at known points, the STAAD reactions at the base node are
// derived by vector statics (R = −ΣF, M_r = −Σ r×F, right-hand rule, Y up), mapped to the FAIR inputs, run through loadTypeVector(), and the
// location of the pressure resultant implied by the FAIR vector at the underside of the footing is compared with the one from statics.
import { staadReactionToFair, loadTypeVector, LOAD_KINDS } from '../shared/loadCombinations.js';
import { soilPressure } from '../shared/spreadFooting.js';
let pass = 0, fail = 0;
function eq(n, g, e, t = 1e-9) { const o = Math.abs(g - e) <= t * Math.max(1, Math.abs(e)); if (o) { pass++; console.log('PASS ' + n + ' = ' + (+g).toFixed(4)); } else { fail++; console.log('FAIL ' + n + ' got=' + g + ' exp=' + e); } }
function ok(n, c, x = '') { if (c) { pass++; console.log('PASS ' + n + ' ' + x); } else { fail++; console.log('FAIL ' + n + ' ' + x); } }
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
// statics: forces F (on the structure, global X right / Y up / Z toward the viewer) at points r measured from the BASE NODE (top of pedestal)
const staadReactions = (loads) => { const R = [0, 0, 0], Mr = [0, 0, 0]; for (const { F, r } of loads) { const m = cross(r, F); for (let i = 0; i < 3; i++) { R[i] -= F[i]; Mr[i] -= m[i]; } } return { FX: R[0], FY: R[1], FZ: R[2], MX: Mr[0], MY: Mr[1], MZ: Mr[2] }; };
// the action on the foundation about the footing UNDERSIDE centre, dh below the base node: moment = Σ r' × F with r' = r + (0, dh, 0); resultant of the pressure at (xe, ze):
//   pressure P up on the footing = −Fy_total..., centre of pressure from vertical equilibrium of moments: xe = −MZ_f / P, ze = +MX_f / P  (RH rule, action on the foundation)
const physical = (loads, dh) => { let Fx = 0, Fy = 0, Fz = 0, Mx = 0, Mz = 0; for (const { F, r } of loads) { const m = cross([r[0], r[1] + dh, r[2]], F); Fx += F[0]; Fy += F[1]; Fz += F[2]; Mx += m[0]; Mz += m[2]; } const P = -Fy; return { P, Fx, Fz, xe: -Mz / P, ze: Mx / P }; };
// FAIR side: the same loads entered as STAAD reactions in a single load type of the given kind (X / Z lateral kinds and a vertical kind), summed with loadTypeVector()
const fairVector = (reactions, dh) => { // reactions of ONE vertical-kind load (all components typed in the vertical row)
  const f = staadReactionToFair('dead', { P: reactions.FY, H: reactions.FX, M: reactions.MZ, Hz: reactions.FZ, Mx: reactions.MX });
  const v = loadTypeVector('dead', f, dh); return { P: v.P, Fx: v.Fx, Fz: v.Fz, Mx: v.Mx + v.dMx, Mz: v.Mz + v.dMz }; };

// ---- 1. the worked example of the review: +x lateral load 100 kN at 5 m, vertical 800 kN, base node = top of pedestal, dh = 1.275 m ----
{ const loads = [{ F: [100, 0, 0], r: [0, 5, 0] }, { F: [0, -800, 0], r: [0, 0, 0] }];
  const R = staadReactions(loads);
  eq('1 STAAD FX = -100', R.FX, -100); eq('1 STAAD FY = +800 (up)', R.FY, 800); eq('1 STAAD MZ = +500', R.MZ, 500);
  const m = staadReactionToFair('windX', { H: R.FX, M: R.MZ });
  eq('1 windX: H = -FX = 100', m.H, 100); eq('1 windX: M = +MZ = 500', m.M, 500);
  const v = loadTypeVector('windX', m, 1.275); eq('1 Mz at the underside = F (h + dh) = 627.5', v.Mz + v.dMz, 627.5); eq('1 Fx = +100', v.Fx, 100);
  const raw = loadTypeVector('windX', { H: R.FX, M: R.MZ }, 1.275); eq('1 raw STAAD entry would give 372.5 (41 % low) — why the mapping is needed', raw.Mz + raw.dMz, 372.5);
  const s = soilPressure({ B: 4, L: 4, P: 800, Mz: v.Mz + v.dMz }); ok('1 pressure peaks on the +x side (load pushes +x)', s.plane.a > 0); }
// ---- 2. +z lateral load: FZ = -F, MX = -F h; FAIR windZ: H = +F, M = +F h, internal Mx < 0 -> compression on +z ----
{ const loads = [{ F: [0, 0, 60], r: [0, 4, 0] }]; const R = staadReactions(loads); eq('2 STAAD FZ = -60', R.FZ, -60); eq('2 STAAD MX = -240', R.MX, -240);
  const m = staadReactionToFair('windZ', { H: R.FZ, M: R.MX }); eq('2 windZ: H = -FZ = 60', m.H, 60); eq('2 windZ: M = -MX = 240', m.M, 240);
  const v = loadTypeVector('windZ', m, 1); eq('2 Fz = +60', v.Fz, 60); eq('2 Mx at the underside = -F (h + dh) = -300', v.Mx + v.dMx, -300);
  const s = soilPressure({ B: 4, L: 4, P: 500, Mx: v.Mx + v.dMx }); ok('2 pressure peaks on the +z side', s.plane.c > 0); }
// ---- 3. random loads: the centre of pressure from the FAIR vector equals the one from vector statics ----
{ let worst = 0, n = 0;
  for (let i = 0; i < 300; i++) { const rnd = (k) => ((i * 7919 + k * 104729) % 2000) / 1000 - 1; // deterministic pseudo-random in [-1, 1)
    const loads = [{ F: [150 * rnd(1), -600 - 300 * Math.abs(rnd(2)), 120 * rnd(3)], r: [0.6 * rnd(4), 1 + 4 * Math.abs(rnd(5)), 0.6 * rnd(6)] },
                   { F: [80 * rnd(7), -200 * Math.abs(rnd(8)), 90 * rnd(9)], r: [0.9 * rnd(10), 0.5 + 3 * Math.abs(rnd(11)), 0.9 * rnd(12)] }];
    const dh = 0.4 + 1.2 * Math.abs(rnd(13)); const R = staadReactions(loads); const ph = physical(loads, dh); const fv = fairVector(R, dh);
    // centre of pressure implied by the FAIR vector (app convention): ex = Mz/P toward +x, ez = -Mx/P toward +z
    const xe = fv.Mz / fv.P, ze = -fv.Mx / fv.P; worst = Math.max(worst, Math.abs(xe - ph.xe), Math.abs(ze - ph.ze), Math.abs(fv.P - ph.P) / ph.P, Math.abs(fv.Fx - ph.Fx), Math.abs(fv.Fz - ph.Fz)); n++; }
  ok(`3 ${n} random load sets: P, Fx, Fz and the pressure centre (xe, ze) of the FAIR vector match vector statics (worst ${worst.toExponential(1)})`, worst < 1e-9); }
// ---- 4. vertical rows: P = FY (uplift negative), Mx field = +MX, M field = +MZ ----
{ const m = staadReactionToFair('equipment', { P: -50, H: 10, M: 30, Hz: -20, Mx: 40 });
  eq('4 P = FY (negative = uplift)', m.P, -50); eq('4 H = -FX', m.H, -10); eq('4 M = +MZ', m.M, 30); eq('4 Hz = -FZ', m.Hz, 20); eq('4 Mx = +MX', m.Mx, 40);
  const v = loadTypeVector('equipment', m, 0); ok('4 Mx > 0 -> compression on -z (pile / footing convention)', soilPressure({ B: 4, L: 4, P: 800, Mx: v.Mx }).plane.c < 0); }
// ---- 5. lateral kinds ignore P / Hz / Mx; unknown kind -> null; all kinds covered ----
{ const x = staadReactionToFair('eqX', { P: 99, H: 5, M: 7, Hz: 3, Mx: 2 }); ok('5 lateral X: P, Hz, Mx dropped', x.P === 0 && x.Hz === 0 && x.Mx === 0 && x.H === -5 && x.M === 7);
  const z = staadReactionToFair('eqZ', { P: 99, H: 5, M: 7 }); ok('5 lateral Z: H = -FZ, M = -MX', z.H === -5 && z.M === -7 && z.P === 0);
  ok('5 unknown kind -> null', staadReactionToFair('nope', { P: 1 }) === null); ok('5 every kind of LOAD_KINDS maps', Object.keys(LOAD_KINDS).every(k => staadReactionToFair(k, { P: 1, H: 1, M: 1 }) !== null)); }
console.log(`\nPART16: ${pass} pass, ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
