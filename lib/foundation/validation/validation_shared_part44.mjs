// VALIDATION part44 — pile cap under three vessels and a platform (pileCapPlatformCombo), LC 220 and LC 221 of the Filter Coalescer
// calculation, Doc 2512-01GT-90-05J-A0014 Rev B (C.5, C.6.3, C.6.4; Tables C.7, C.9, C.19, C.20, C.22, Fig. C.5 to C.7).
// Pile forces come from evaluatePileGroupCombo with the load at the underside of the cap (Table C.9 resultants of the combination).
import { evaluatePileGroupCombo, pileCapPlatformCombo } from '../index.js';
let pass = 0, fail = 0;
function ok(n, c, x = '') { if (c) { pass++; console.log('PASS ' + n + ' ' + x); } else { fail++; console.log('FAIL ' + n + ' ' + x); } }
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const piles = []; [-4.8, -2.4, 0, 2.4, 4.8].forEach(y => [-1.15, 1.15].forEach(x => piles.push({ x, y })));
const f = 1.2 + 0.2 * 0.558, Pq = (421.83 - 26.24) / 3 * f, W = f * 378.994, ringD = 1.267;
const cz = [-5.25, -2.75, -1.25, 1.25, 2.75, 5.25];
const Dc = [4.39, 5.02, 4.84, 4.84, 5.02, 4.39], Lc = [5.79, 10.25, 9.70, 9.70, 10.25, 5.79], Pc = [1.48, 2.61, 2.47, 2.47, 2.61, 1.48];
const VX = [-1.46, -1.80, -1.85, -1.85, -1.80, -1.46], VZ = [-1.43, -0.44, 0.94, -0.94, 0.44, 1.43];
function run(under, kx, kz, ringMx, ringMz) {
  const ev = evaluatePileGroupCombo(piles, { ...under, at: { x: 0, y: 0 } }, { Qc: 1e12, Qt: 1e12, Ql: 1e12 });
  const columns = [];
  [-1.25, 1.25].forEach((x, side) => cz.forEach((y, k) => columns.push({ x, y, c1: 0.3, c2: 0.3,
    P: f * (Dc[k] + Pc[k]) + Lc[k] + (side ? -VX[k] : VX[k]) * kx + VZ[k] * kz })));
  // D, P(O) factored (f), L unfactored, platform seismic columns: VX(O) negative at x = −1.25, positive at +1.25
  return pileCapPlatformCombo({ cap: { B: 3.5, L: 11.5, W, dx: 0.312, dz: 0.299 }, pileForces: ev.pileForces, dp: 0.3, ringD,
    vessels: [-4, 0, 4].map(y => ({ x: 0, y, P: Pq, Mx: ringMx, Mz: ringMz })), columns });
}
// LC 220: (1.2+0.2SDS)[D+E(O)+P(O)] + VX + 0.3VZ + L ; underside: Fx 154.5, P 1228.1, Fz 46.4, Mx −184.8, Mz 616.0
const a = run({ P: 1228.1, Hx: 154.5, Hz: 46.4, Mx: -184.8, Mz: 616.0 }, 1, 0.3, -48.6, 162.0);
ok('LC 220: the combination gives a valid section analysis', a.valid && near(a.beamX.closureForce, 0, 0.5), a.beamX.closureForce.toFixed(2));
ok('LC 220: footprint 1.267 × 9.267 m (doc C.6.3)', near(a.footprint.Bp, 1.267, 1e-9) && near(a.footprint.Lp, 9.267, 1e-9));
ok('LC 220: face moment x = 383.8 kN·m (Table C.19) within 0.5%', near(a.face.x.bottom, 383.8, 2), a.face.x.bottom.toFixed(1));
ok('LC 220: beam along x Mu+ = 369.0 kN·m (Table C.20) within 1%', near(a.beamX.Mpos, 369.0, 3.7), a.beamX.Mpos.toFixed(1));
ok('LC 220: design moment x bottom = face 383.8 (larger of the two)', near(a.design.xBottom, 383.8, 2), a.design.xBottom.toFixed(1));
ok('LC 220: one-way shear x at ±0.946 m: Vu = 765.6 kN (Table C.22)', near(a.shear.x.Vu, 765.6, 3), a.shear.x.Vu.toFixed(1));
// LC 221: (1.2+0.2SDS)[D+E(O)+P(O)] + 0.3VX + VZ + L ; underside: Fx 46.4, P 1228.1, Fz 154.5, Mx −616.0, Mz 184.8
const b = run({ P: 1228.1, Hx: 46.4, Hz: 154.5, Mx: -616.0, Mz: 184.8 }, 0.3, 1, -162.0, 48.6);
ok('LC 221: face moment z = 31.0 kN·m (Table C.19)', near(b.face.y.bottom, 31.0, 1.5), b.face.y.bottom.toFixed(1));
ok('LC 221: beam along z Mu+ = 57.6 kN·m/m and Mu− = 29.0 kN·m/m (Fig. C.7) within 1.5%', near(b.beamZ.Mpos / 3.5, 57.6, 0.9) && near(b.beamZ.Mneg / 3.5, 29.0, 0.5), `${(b.beamZ.Mpos / 3.5).toFixed(1)} ${(b.beamZ.Mneg / 3.5).toFixed(1)}`);
ok('LC 221: design moment z bottom = 201.6 kN·m (Table C.21), top = 101.3 kN·m', near(b.design.zBottom, 201.6, 3) && near(b.design.zTop, 101.3, 2), `${b.design.zBottom.toFixed(1)} ${b.design.zTop.toFixed(1)}`);
ok('LC 221: the face moment alone (31.0) would be 6.5 times too small for the z bottom bars', b.design.zBottom > 6 * b.face.y.bottom);
ok('LC 221: one-way shear z at −3.068 m: Vu = 118.6 kN (Table C.22) within 3%', near(b.shear.z.Vu, 118.6, 3.6), `${b.shear.z.Vu.toFixed(1)} at ${b.shear.z.s.toFixed(3)}`);
ok('invalid input is rejected', !pileCapPlatformCombo({ cap: { B: 3, L: 3 }, pileForces: [], dp: 0.3, vessels: [], ringD: 1 }).valid);
console.log(`\nPASS ${pass}  FAIL ${fail}`); process.exit(fail ? 1 : 0);
