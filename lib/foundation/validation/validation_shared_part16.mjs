// VALIDATION part16 — shallow footing design actions from the soil pressure (footingDesign.js): flexure at the pedestal
// faces, one-way shear at d, punching at d/2, with the factored self-weight of footing + backfill deducted (net pressure).
// Closed-form hand calculations (uniform, trapezoidal, triangular pressure) plus an independent brute-force grid integration
// for a biaxial partial-contact case and the sign convention (Mz > 0 compresses +x, Mx > 0 compresses −z).
import { signedSoilPressure, pressureIntegral, footingFlexureAxis, footingOneWayShear, footingPunchingShear } from '../index.js';
let pass = 0, fail = 0;
function ok(n, c, x = '') { if (c) { pass++; console.log('PASS ' + n + ' ' + x); } else { fail++; console.log('FAIL ' + n + ' ' + x); } }
const near = (a, b, tol) => Math.abs(a - b) <= tol;
// resultant position from the app moments: xR = Mz/P, zR = −Mx/P
const plane = (B, L, P, Mx, Mz) => signedSoilPressure(B, L, P, Mz / P, -Mx / P);

// ---- 1. uniform: B = L = 2, P = 400 -> q = 100 kPa; pedestal 0.5 × 0.5 centred, d = 0.3 ----
const u = plane(2, 2, 400, 0, 0);
const f1 = footingFlexureAxis({ pl: u, w: 0, B: 2, L: 2, axis: 'x', ref: 0, half: 0.25 });
ok('uniform flexure M = q·L·c²/2 = 100·2·0.75²/2 = 56.25', near(f1.bottom, 56.25, 1e-9), f1.bottom);
ok('uniform flexure symmetric, no top', near(f1.plus, f1.minus, 1e-9) && f1.top === 0);
const v1 = footingOneWayShear({ pl: u, w: 0, B: 2, L: 2, axis: 'x', ref: 0, half: 0.25, d: 0.3 });
ok('uniform one-way V = 100·2·(1 − 0.55) = 90', near(v1.Vu, 90, 1e-9), v1.Vu);
const p1 = footingPunchingShear({ pl: u, w: 0, B: 2, L: 2, cx: 0, cz: 0, c1: 0.5, c2: 0.5, d: 0.3 });
ok('uniform punching V = 400 − 100·0.8² = 336', p1.valid && near(p1.Vu, 336, 1e-9), p1.Vu);
// net: w = 20 kPa (factored footing + backfill)
const f1w = footingFlexureAxis({ pl: u, w: 20, B: 2, L: 2, axis: 'x', ref: 0, half: 0.25 });
ok('net flexure (100 − 20)·2·0.75²/2 = 45', near(f1w.bottom, 45, 1e-9), f1w.bottom);
const v1w = footingOneWayShear({ pl: u, w: 20, B: 2, L: 2, axis: 'x', ref: 0, half: 0.25, d: 0.3 });
ok('net one-way (100 − 20)·2·0.45 = 72', near(v1w.Vu, 72, 1e-9), v1w.Vu);
const p1w = footingPunchingShear({ pl: u, w: 20, B: 2, L: 2, cx: 0, cz: 0, c1: 0.5, c2: 0.5, d: 0.3 });
ok('net punching 336 − 20·(4 − 0.64) = 268.8', near(p1w.Vu, 268.8, 1e-9), p1w.Vu);
// one-way section beyond the footing edge -> 0
ok('one-way section outside footing -> V = 0', footingOneWayShear({ pl: u, w: 0, B: 2, L: 2, axis: 'x', ref: 0, half: 0.25, d: 0.8 }).Vu === 0);

// ---- 2. trapezoidal (full contact): B = L = 2, P = 400, Mz = 40 -> xR = 0.1, q = 100 + 30x ----
const t = plane(2, 2, 400, 0, 40);
const f2 = footingFlexureAxis({ pl: t, w: 0, B: 2, L: 2, axis: 'x', ref: 0, half: 0.25 });
// +x: 2·∫(100+30x)(x − 0.25)dx, 0.25..1 = 2·(28.125 + 6.328125) = 68.90625; −x: 2·(28.125 − 6.328125) = 43.59375
ok('trapezoid +x face M = 68.906', near(f2.plus, 68.90625, 1e-9), f2.plus);
ok('trapezoid −x face M = 43.594', near(f2.minus, 43.59375, 1e-9), f2.minus);
const v2 = footingOneWayShear({ pl: t, w: 0, B: 2, L: 2, axis: 'x', ref: 0, half: 0.25, d: 0.3 });
// +x: 2·∫(100+30x)dx, 0.55..1 = 2·(45 + 15·(1 − 0.3025)) = 2·55.4625 = 110.925
ok('trapezoid one-way V+ = 110.925 governs', near(v2.Vu, 110.925, 1e-9) && v2.side === '+', v2.Vu);
// same about z: Mx = −40 -> zR = +0.1 -> +z side heavier; Mx = +40 -> −z side heavier
const tz1 = footingFlexureAxis({ pl: plane(2, 2, 400, -40, 0), B: 2, L: 2, axis: 'z', ref: 0, half: 0.25 });
const tz2 = footingFlexureAxis({ pl: plane(2, 2, 400, 40, 0), B: 2, L: 2, axis: 'z', ref: 0, half: 0.25 });
ok('Mx < 0 compresses +z', near(tz1.plus, 68.90625, 1e-9) && near(tz1.minus, 43.59375, 1e-9));
ok('Mx > 0 compresses −z', near(tz2.minus, 68.90625, 1e-9) && near(tz2.plus, 43.59375, 1e-9));
ok('Mz < 0 compresses −x', near(footingFlexureAxis({ pl: plane(2, 2, 400, 0, -40), B: 2, L: 2, axis: 'x', ref: 0, half: 0.25 }).minus, 68.90625, 1e-9));

// ---- 3. triangular (partial contact): B = 2, L = 1, P = 300, xR = 0.5 -> contact 3(B/2 − e) = 1.5, qmax = 400 ----
const tr = plane(1 * 2, 1, 300, 0, 150);
ok('triangle qmax = 2P/[3L(B/2 − e)] = 400', near(tr.qmax, 400, 1e-6), tr.qmax);
const f3 = footingFlexureAxis({ pl: tr, w: 0, B: 2, L: 1, axis: 'x', ref: 0, half: 0.25 });
ok('triangle +x face M = (800/3)·0.3515625 = 93.75', near(f3.plus, 93.75, 1e-6), f3.plus);
ok('triangle −x face M = (800/3)·0.25³/6 = 0.69444', near(f3.minus, 800 / 3 * 0.25 ** 3 / 6, 1e-6), f3.minus);
const f3w = footingFlexureAxis({ pl: tr, w: 10, B: 2, L: 1, axis: 'x', ref: 0, half: 0.25 });
ok('net, +x = 93.75 − 10·0.75·0.375 = 90.9375', near(f3w.plus, 90.9375, 1e-6), f3w.plus);
ok('net, uplift side hogs: top = 2.8125 − 0.69444 = 2.11806', near(f3w.top, 2.8125 - 800 / 3 * 0.25 ** 3 / 6, 1e-6), f3w.top);
const p3 = footingPunchingShear({ pl: tr, w: 0, B: 2, L: 1, cx: 0, cz: 0, c1: 0.5, c2: 0.5, d: 0.3 });
ok('triangle punching V = 300 − (800/3)·0.4·0.8 = 214.667', near(p3.Vu, 300 - 800 / 3 * 0.4 * 0.8, 1e-6), p3.Vu);

// ---- 4. offset pedestal + punching limits ----
const p4 = footingPunchingShear({ pl: u, w: 0, B: 2, L: 2, cx: 0.5, cz: 0, c1: 0.5, c2: 0.5, d: 0.3 });
ok('offset pedestal punching (uniform) = 336', near(p4.Vu, 336, 1e-9), p4.Vu);
// perimeter reaching the footing edge -> edge section (3 sides), covered in part17
ok('perimeter at the footing edge -> edge section', footingPunchingShear({ pl: u, B: 2, L: 2, cx: 0.7, cz: 0, c1: 0.5, c2: 0.5, d: 0.3 }).sec.loc === 'edge');
const f4 = footingFlexureAxis({ pl: u, w: 0, B: 2, L: 2, axis: 'x', ref: 0.4, half: 0.25 });
ok('offset pedestal flexure: +x 100·2·0.35²/2 = 12.25, −x 100·2·1.15²/2 = 132.25', near(f4.plus, 12.25, 1e-9) && near(f4.minus, 132.25, 1e-9));

// ---- 5. biaxial partial contact vs independent grid integration ----
// B 2.4, L 1.8, P 500, Mz 260, Mx −150 -> xR 0.52, zR 0.30 (6·0.52/2.4 + 6·0.30/1.8 = 2.3 > 1)
const B5 = 2.4, L5 = 1.8, P5 = 500, bi = plane(B5, L5, P5, -150, 260);
ok('biaxial partial contact', bi.valid && !bi.fullContact, bi.note);
const all = pressureIntegral(bi, -B5 / 2, B5 / 2, -L5 / 2, L5 / 2);
ok('∫q = P', near(all.F, P5, 1e-6 * P5), all.F);
ok('∫q·x = P·xR (Mz)', near(all.Fx, 260, 1e-5 * P5), all.Fx);
ok('∫q·z = P·zR (−Mx)', near(all.Fz, 150, 1e-5 * P5), all.Fz);
function grid(pl, x1, x2, z1, z2, s, axis, sign, w, n = 800) {
  // integrate only the part beyond the section, so no grid cell straddles the section line
  if (axis === 'x') { if (sign > 0) x1 = Math.max(x1, s); else x2 = Math.min(x2, s); }
  else { if (sign > 0) z1 = Math.max(z1, s); else z2 = Math.min(z2, s); }
  let V = 0, M = 0; const dx = (x2 - x1) / n, dz = (z2 - z1) / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x = x1 + (i + 0.5) * dx, z = z1 + (j + 0.5) * dz, c = axis === 'x' ? x : z;
    if (sign * (c - s) <= 0) continue;
    const q = Math.max(0, pl.a + pl.b * x + pl.c * z) - w;
    V += q * dx * dz; M += q * sign * (c - s) * dx * dz;
  }
  return { V, M };
}
const ped = { x: 0.2, z: -0.1, hx: 0.3, hz: 0.25 }, w5 = 15;
const fx = footingFlexureAxis({ pl: bi, w: w5, B: B5, L: L5, axis: 'x', ref: ped.x, half: ped.hx });
const fz = footingFlexureAxis({ pl: bi, w: w5, B: B5, L: L5, axis: 'z', ref: ped.z, half: ped.hz });
const gxp = grid(bi, -B5 / 2, B5 / 2, -L5 / 2, L5 / 2, ped.x + ped.hx, 'x', 1, w5), gxm = grid(bi, -B5 / 2, B5 / 2, -L5 / 2, L5 / 2, ped.x - ped.hx, 'x', -1, w5);
const gzp = grid(bi, -B5 / 2, B5 / 2, -L5 / 2, L5 / 2, ped.z + ped.hz, 'z', 1, w5), gzm = grid(bi, -B5 / 2, B5 / 2, -L5 / 2, L5 / 2, ped.z - ped.hz, 'z', -1, w5);
const tolM = 2e-3 * Math.max(Math.abs(gxp.M), 1);
ok('biaxial flexure +x = grid', near(fx.plus, gxp.M, tolM), `${fx.plus} / ${gxp.M}`);
ok('biaxial flexure −x = grid', near(fx.minus, gxm.M, tolM), `${fx.minus} / ${gxm.M}`);
ok('biaxial flexure +z = grid', near(fz.plus, gzp.M, tolM), `${fz.plus} / ${gzp.M}`);
ok('biaxial flexure −z = grid', near(fz.minus, gzm.M, tolM), `${fz.minus} / ${gzm.M}`);
const ow = footingOneWayShear({ pl: bi, w: w5, B: B5, L: L5, axis: 'x', ref: ped.x, half: ped.hx, d: 0.35 });
const gow = grid(bi, -B5 / 2, B5 / 2, -L5 / 2, L5 / 2, ped.x + ped.hx + 0.35, 'x', 1, w5);
ok('biaxial one-way V+ = grid', near(ow.Vpos, gow.V, 2e-3 * Math.abs(gow.V)), `${ow.Vpos} / ${gow.V}`);
const pu = footingPunchingShear({ pl: bi, w: w5, B: B5, L: L5, cx: ped.x, cz: ped.z, c1: 0.6, c2: 0.5, d: 0.35 });
let gin = 0; { const n = 800, x1 = ped.x - 0.475, z1 = ped.z - 0.425, dx = 0.95 / n, dz = 0.85 / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const x = x1 + (i + 0.5) * dx, z = z1 + (j + 0.5) * dz; gin += (Math.max(0, bi.a + bi.b * x + bi.c * z) - w5) * dx * dz; } }
const gpu = (P5 - w5 * B5 * L5) - gin;
ok('biaxial punching = P − W − ∫inside (grid)', near(pu.Vu, gpu, 2e-3 * gpu), `${pu.Vu} / ${gpu}`);

console.log(`\npart16: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
