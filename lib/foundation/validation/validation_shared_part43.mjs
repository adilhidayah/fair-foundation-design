// VALIDATION part43 — pile cap as a beam between the pile lines (capBeamAnalysis) and crack-control bar spacing (crackSpacingCheck).
// Reference: Filter Coalescer foundation calculation, Doc 2512-01GT-90-05J-A0014 Rev B, C.6.3 (Tables C.20, C.21, Fig. C.6, C.7) and C.6.8.
// Inputs are the factored LC 221 / LC 220 values of the document (SDS 0.558, f = 1.2 + 0.2·SDS), reactions as printed to 0.1 kN.
import { capBeamAnalysis, crackSpacingCheck, eccentricPunchingStress, twoWayShearCheck } from '../index.js';
let pass = 0, fail = 0;
function ok(n, c, x = '') { if (c) { pass++; console.log('PASS ' + n + ' ' + x); } else { fail++; console.log('FAIL ' + n + ' ' + x); } }
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const f = 1.2 + 0.2 * 0.558, Pq = (421.83 - 26.24) / 3 * f, W = f * 378.994, Bf = 3.5, ring = 1.267;
// platform columns: C1..C6 at z = -5.25 .. 5.25 (two columns, x = ±1.25, per station)
const cz = [-5.25, -2.75, -1.25, 1.25, 2.75, 5.25];
const Dc = [4.39, 5.02, 4.84, 4.84, 5.02, 4.39], Lc = [5.79, 10.25, 9.70, 9.70, 10.25, 5.79], Pc = [1.48, 2.61, 2.47, 2.47, 2.61, 1.48], VZ = [-1.43, -0.44, 0.94, -0.94, 0.44, 1.43];
// LC 221 along z: three rings, the five pile lines of Fig. C.7
const colsZ = cz.map((s, k) => ({ s, P: 2 * (f * (Dc[k] + Pc[k]) + Lc[k]) + 2 * VZ[k] }));
const z = capBeamAnalysis({ s0: -5.75, s1: 5.75, weight: W,
  supports: [-4.8, -2.4, 0, 2.4, 4.8].map((s, k) => ({ s, R: [194.3, 220.0, 245.6, 271.3, 297.0][k] })),
  loads: [...[-4, 0, 4].map(s => ({ s, P: Pq, len: ring, M: 162.0, balance: true })), ...colsZ] });
ok('z: force equilibrium (reactions 1228.2 = loads 1228.1)', z.valid && near(z.closureForce, 0, 0.5), z.closureForce.toFixed(2));
ok('z: couple left to balance = 3 × 33.3 kN·m (lever arm of H and column base moments)', near(-z.closureMoment, 99.2, 1.5), z.closureMoment.toFixed(1));
ok('z: Mu+ per metre = 57.6 kN·m/m (Fig. C.7) within 1%', near(z.Mpos / Bf, 57.6, 0.6), (z.Mpos / Bf).toFixed(2));
ok('z: Mu− per metre = 29.0 kN·m/m (Fig. C.7) within 1%', near(z.Mneg / Bf, 29.0, 0.4), (z.Mneg / Bf).toFixed(2));
ok('z: moment closes to zero at the free end', near(z.momentAt(5.75), 0, 1e-6));
ok('z: design moment of the bottom bars = Mu+·Bf = 201.6 kN·m (face moment is only 31.0)', near(z.Mpos, 201.6, 2.5), z.Mpos.toFixed(1));
// LC 220 along x: two pile rows x = ±1.15, rings summed (centred), columns beyond the rows at x = ±1.25
const x = capBeamAnalysis({ s0: -1.75, s1: 1.75, weight: W,
  supports: [{ s: -1.15, R: 346.2 }, { s: 1.15, R: 881.9 }],
  loads: [{ s: 0, P: 3 * Pq, len: ring, M: 3 * 162.0, balance: true }, { s: -1.25, P: 95.85 }, { s: 1.25, P: 116.29 }] });
ok('x: Mu+ between the pile rows = 369.0 kN·m (Table C.20, LC 220) within 1%', near(x.Mpos, 369.0, 3.7), x.Mpos.toFixed(1));
ok('x: moment at the face of the equipment x = 0.634 m = 293.8 kN·m (Fig. C.6) within 1%', near(x.momentAt(0.634), 293.8, 3), x.momentAt(0.634).toFixed(1));
ok('x: the maximum is inside the equipment footprint (|x| < 0.634)', Math.abs(x.sPos) < 0.634, x.sPos.toFixed(2));
// shear from the diagram: just right of the left pile row the shear equals R minus what lies to its left
ok('shear: V just right of the left pile row = reaction − the column and cap weight to its left', near(x.shearAt(-1.149), 346.2 - 95.85 - W * 0.601 / 3.5, 0.5), x.shearAt(-1.149).toFixed(1));
// point load + point couple (len = 0): simply supported check, P = 100 at midspan of 4 m, no weight
const ss = capBeamAnalysis({ s0: 0, s1: 4, supports: [{ s: 0, R: 50 }, { s: 4, R: 50 }], loads: [{ s: 2, P: 100 }] });
ok('simple beam: Mmax = P·L/4 = 100 kN·m at midspan', near(ss.Mpos, 100, 1e-6) && near(ss.sPos, 2, 4 / 2000 + 1e-9) && ss.Mneg < 1e-9);
ok('uniform weight only: M = w·L²/8 on a simply supported span', near(capBeamAnalysis({ s0: 0, s1: 6, weight: 60, supports: [{ s: 0, R: 30 }, { s: 6, R: 30 }] }).Mpos, 10 * 36 / 8, 1e-6));
ok('invalid input is rejected', !capBeamAnalysis({ s0: 1, s1: 1, supports: [] }).valid && !capBeamAnalysis({ s0: 0, s1: 1, supports: [{ s: 0, R: 1 }] }).valid);
// crack control, C.6.8: fy 420, cc 75, D13-150
const c = crackSpacingCheck({ fy: 420, cc: 75, s: 150 });
ok('crack control: fs = 280 MPa, s1 = 192.5, s2 = 300 mm, s_all = 192.5 mm', near(c.fs, 280, 1e-9) && near(c.s1, 192.5, 1e-9) && near(c.s2, 300, 1e-9) && near(c.sAll, 192.5, 1e-9));
ok('crack control: D13-150 passes, UC = 150/192.5 = 0.779 (Table C.22)', c.pass && near(c.uc, 0.779, 5e-4), c.uc.toFixed(3));
ok('crack control: 200 mm spacing fails; lower steel stress lets the spacing grow', !crackSpacingCheck({ fy: 420, cc: 75, s: 200 }).pass && crackSpacingCheck({ fy: 420, cc: 75, s: 150, fs: 200 }).sAll > c.sAll);
// punching of the equipment (C.6.5) and of a platform column (C.6.7) with the existing unbalanced-moment functions: no pile inside the section, d = 312 mm
const punch = (c, Vu, Mx, Mz) => { const e = eccentricPunchingStress({ c1: c, c2: c, d: 312, Vu, Mx, Mz }); const t = twoWayShearCheck({ c1: c, c2: c, h: 400, cc: 75, Dbar: 13, fc: 19, vu: e.vu, lambda: 1, loc: 'interior' }); return { vu: e.vu, phiVc: t.phi * t.vc_gov, uc: e.vu / (t.phi * t.vc_gov), bo: t.bo }; };
const pe = punch(1122.8, 173.0, 48.6, 162.0), pc = punch(300, 23.5, 0.51, 7.04);
ok('equipment punching: vu = 0.194 MPa, φvc = 1.018 MPa, UC = 0.190, bo = 5739 mm (C.6.5)', near(pe.vu, 0.194, 5e-4) && near(pe.phiVc, 1.018, 2e-3) && near(pe.uc, 0.190, 1e-3) && near(pe.bo, 5739.4, 1), `${pe.vu.toFixed(3)} ${pe.uc.toFixed(3)}`);
ok('platform column punching (300 × 300 base plate): vu = 0.049 MPa, UC = 0.048, bo = 2448 mm (C.6.7)', near(pc.vu, 0.049, 5e-4) && near(pc.uc, 0.048, 1e-3) && near(pc.bo, 2448, 0.5), `${pc.vu.toFixed(3)} ${pc.uc.toFixed(3)}`);
console.log(`\nPASS ${pass}  FAIL ${fail}`); process.exit(fail ? 1 : 0);
