// VALIDATION part24 — cross-check of the two independent spread-footing implementations on 600 random cases:
//   footingDesign.js  (the app: pressure plane from biaxialSoilPressure, exact polygon integrals)
//   spreadFooting.js  (independent reference: Newton solve of the contact plane on the exact polygon integrals)
// Contact plane (q0, a, c), flexure at the pedestal faces (bottom / top), one-way shear at d and punching Vu must agree, with the
// factored footing + backfill weight w deducted (net pressure), for full and partial contact, biaxial moments of both signs.
import { signedSoilPressure, footingFlexureAxis, footingOneWayShear, footingPunchingShear } from '../shared/footingDesign.js';
import { soilPressure, footingActions } from '../shared/spreadFooting.js';
let pass = 0, fail = 0;
function ok(n, c, x = '') { if (c) { pass++; console.log('PASS ' + n + ' ' + x); } else { fail++; console.log('FAIL ' + n + ' ' + x); } }
let seed = 20261014; const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const rel = (a, b) => Math.abs(a - b) / Math.max(1, Math.abs(a), Math.abs(b));
let n = 0, worst = { plane: 0, M: 0, V: 0, punch: 0 }, partial = 0, bad = '';
for (let k = 0; k < 600; k++) {
  const B = 1.5 + 3 * rnd(), L = 1.5 + 3 * rnd(), P = 200 + 1800 * rnd();
  // eccentricities up to 0.45·(B or L)/2·2 so that roughly half the cases lift off (e > B/6) but the resultant stays inside
  const Mz = (rnd() * 2 - 1) * P * 0.46 * B / 2 * 2 * 0.5, Mx = (rnd() * 2 - 1) * P * 0.46 * L / 2 * 2 * 0.5;
  const w = 10 * rnd() * 3, c1 = 0.3 + 0.5 * rnd(), c2 = 0.3 + 0.5 * rnd(), cx = (rnd() - 0.5) * 0.2, cz = (rnd() - 0.5) * 0.2, d = 0.2 + 0.3 * rnd();
  const ref = soilPressure({ B, L, P, Mx, Mz });
  const pl = signedSoilPressure(B, L, P, Mz / P, -Mx / P);
  if (!ref.valid || !pl.valid) { if (ref.valid !== pl.valid) { bad = `validity differs B=${B} L=${L} P=${P} Mx=${Mx} Mz=${Mz}`; } continue; }
  n++; if (!ref.fullContact) partial++;
  // pressure plane at four corners (the two parametrisations differ: q = q0 + a x + c z vs a + b x + c z)
  const qa = (p, x, z) => p.q0 !== undefined ? Math.max(0, p.q0 + p.a * x + p.c * z) : Math.max(0, p.a + p.b * x + p.c * z);
  let dq = 0; for (const [x, z] of [[-B / 2, -L / 2], [B / 2, -L / 2], [B / 2, L / 2], [-B / 2, L / 2], [0, 0]]) dq = Math.max(dq, rel(qa(ref.plane, x, z), qa(pl, x, z)));
  worst.plane = Math.max(worst.plane, dq);
  const fa = footingActions({ B, L, plane: ref.plane, w, ped: { cx, cz, c1, c2 }, dx: d, dz: d, dPunch: d });
  const fx = footingFlexureAxis({ pl, w, B, L, axis: 'x', ref: cx, half: c1 / 2 }), fz = footingFlexureAxis({ pl, w, B, L, axis: 'z', ref: cz, half: c2 / 2 });
  const vx = footingOneWayShear({ pl, w, B, L, axis: 'x', ref: cx, half: c1 / 2, d }), vz = footingOneWayShear({ pl, w, B, L, axis: 'z', ref: cz, half: c2 / 2, d });
  const pu = footingPunchingShear({ pl, w, B, L, cx, cz, c1, c2, d });
  worst.M = Math.max(worst.M, rel(fa.x.bottom, fx.bottom), rel(fa.x.top, fx.top), rel(fa.z.bottom, fz.bottom), rel(fa.z.top, fz.top));
  worst.V = Math.max(worst.V, rel(fa.x.Vu, vx.Vu), rel(fa.z.Vu, vz.Vu));
  if (pu.valid) worst.punch = Math.max(worst.punch, rel(fa.punch.Vu, pu.Vu));
}
ok('600 random cases: both implementations agree on which are valid', bad === '', bad);
ok(`${n} valid cases compared, ${partial} with partial contact`, n > 400 && partial > 100, `n=${n} partial=${partial}`);
ok('contact plane agrees at corners and centre (rel. ≤ 1e-6)', worst.plane <= 1e-6, worst.plane.toExponential(2));
ok('flexure bottom / top at the pedestal faces, both axes (rel. ≤ 1e-6)', worst.M <= 1e-6, worst.M.toExponential(2));
ok('one-way shear at d, both axes (rel. ≤ 1e-6)', worst.V <= 1e-6, worst.V.toExponential(2));
ok('punching Vu outside d/2 (rel. ≤ 1e-6)', worst.punch <= 1e-6, worst.punch.toExponential(2));
console.log(`\nPASS ${pass}  FAIL ${fail}`); process.exit(fail ? 1 : 0);
