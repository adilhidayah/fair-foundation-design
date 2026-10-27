// VALIDATION part44 — pile cap under three vessels and a platform (pileCapPlatformCombo), LC 220 and LC 221 of the Filter Coalescer
// calculation, Doc 2512-01GT-90-05J-A0014 Rev B (C.5, C.6.3, C.6.4; Tables C.7, C.9, C.19, C.20, C.22, Fig. C.5 to C.7).
// Pile forces come from evaluatePileGroupCombo with the load at the underside of the cap (Table C.9 resultants of the combination).
import { evaluatePileGroupCombo, pileCapPlatformCombo, pileCapFlexureCheck, pileCapPlatformEnvelope } from '../index.js';
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
// envelope of LC 220 and LC 221 against D13-150 top and bottom (Tables C.21, C.22; f'c 19, fy 420, t 400, cover 75)
const env = pileCapPlatformEnvelope([{ lc: '220', ...a }, { lc: '221', ...b }], { B: 3.5, L: 11.5 }, { bar: 13, spacing: 150, cc: 75, fc: 19, fy: 420, t: 400 });
const fl = Object.fromEntries(env.flexure.map(f => [f.key, f]));
ok('C.21 x bottom: governing LC 220, As min 8280, As prov 10176.1, φMn 1155.9, Mu/φMn = 0.332', fl['x-bottom'].lc === '220' && near(fl['x-bottom'].AsMin, 8280, 0.5) && near(fl['x-bottom'].AsProv, 10176.1, 0.5) && near(fl['x-bottom'].phiMn, 1155.9, 1) && near(fl['x-bottom'].ratio, 0.332, 2e-3), fl['x-bottom'].ratio.toFixed(3));
ok('C.21 z bottom: governing LC 221, As min 2520, As prov 3097.1, φMn 336.6, Mu/φMn = 0.599 (doc) within 0.01', fl['z-bottom'].lc === '221' && near(fl['z-bottom'].AsMin, 2520, 0.5) && near(fl['z-bottom'].AsProv, 3097.1, 0.5) && near(fl['z-bottom'].phiMn, 336.6, 1) && near(fl['z-bottom'].ratio, 0.599, 0.01), fl['z-bottom'].ratio.toFixed(3));
ok('C.21 x top 0.033 and z top 0.301 within 0.01; the minimum steel governs all four (As req = As min)', near(fl['x-top'].ratio, 0.033, 0.01) && near(fl['z-top'].ratio, 0.301, 0.01) && env.flexure.every(f => near(f.AsReq, f.AsMin, 1e-6)), `${fl['x-top'].ratio.toFixed(3)} ${fl['z-top'].ratio.toFixed(3)}`);
const sh = Object.fromEntries(env.shear.map(s => [s.axis, s]));
ok('C.22 one-way shear x: ρw 0.284 %, vc 0.384 MPa, UC 0.741 (LC 220)', sh.x.lc === '220' && near(sh.x.rho * 100, 0.284, 5e-3) && near(sh.x.vcMPa, 0.384, 3e-3) && near(sh.x.ratio, 0.741, 6e-3), `${sh.x.vcMPa.toFixed(3)} ${sh.x.ratio.toFixed(3)}`);
ok('C.22 one-way shear z: ρw 0.296 %, vc 0.394 MPa, UC 0.383 (LC 221) within 0.01', sh.z.lc === '221' && near(sh.z.rho * 100, 0.296, 5e-3) && near(sh.z.vcMPa, 0.394, 3e-3) && near(sh.z.ratio, 0.383, 0.01), `${sh.z.vcMPa.toFixed(3)} ${sh.z.ratio.toFixed(3)}`);
ok('crack control inside the envelope 0.779 and it is the governing check (Table C.23: 0.779 > shear x 0.741)', near(env.crack.uc, 0.779, 5e-4) && env.gov.name === 'Crack control', env.gov.name);
ok('flexure check on a section that is too small is rejected', !pileCapFlexureCheck({ Mu: 1e5, b: 1000, d: 100, t: 150, fc: 19, fy: 420, bar: 13, spacing: 150 }).valid);
ok('invalid input is rejected', !pileCapPlatformCombo({ cap: { B: 3, L: 3 }, pileForces: [], dp: 0.3, vessels: [], ringD: 1 }).valid);
console.log(`\nPASS ${pass}  FAIL ${fail}`); process.exit(fail ? 1 : 0);
