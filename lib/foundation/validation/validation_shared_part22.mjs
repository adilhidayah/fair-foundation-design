// VALIDATION part22 — spread footing from the soil pressure: contact pressure (full contact, partial uplift, biaxial) and the
// factored actions at the pedestal (flexure at the faces, one-way shear at d, punching). Expected values are closed-form hand
// calculations, or a brute-force midpoint grid (independent of the lib's polygon integration).
import { soilPressure, footingActions } from '../shared/spreadFooting.js';
let pass = 0, fail = 0;
function eq(n, g, e, t = 1e-6) { const o = Math.abs(g - e) <= t * Math.max(1, Math.abs(e)); if (o) { pass++; console.log('PASS ' + n + ' = ' + (+g).toFixed(4)); } else { fail++; console.log('FAIL ' + n + ' got=' + g + ' exp=' + e); } }
function ok(n, c, x = '') { if (c) { pass++; console.log('PASS ' + n + ' ' + x); } else { fail++; console.log('FAIL ' + n + ' ' + x); } }

// Brute-force reference: midpoint grid over [x0,x1]x[z0,z1]
const grid = (x0, x1, z0, z1, f, N = 700) => { let s = 0; const hx = (x1 - x0) / N, hz = (z1 - z0) / N; for (let i = 0; i < N; i++) { const x = x0 + (i + 0.5) * hx; for (let j = 0; j < N; j++) s += f(x, z0 + (j + 0.5) * hz); } return s * hx * hz; };

// ---- 1. uniform pressure: B = L = 4, P = 1000, pedestal 1 x 1 centred, w = 0 ----
{ const s = soilPressure({ B: 4, L: 4, P: 1000 });
  eq('1 q = P/A (kPa)', s.qmax, 62.5, 1e-12); ok('1 full contact', s.fullContact === true && s.contactFraction === 1);
  const r = footingActions({ B: 4, L: 4, plane: s.plane, w: 0, ped: { c1: 1, c2: 1 }, dx: 0.4, dz: 0.4, dPunch: 0.4 });
  eq('1 face moment = q L c^2/2 = 62.5*4*1.5^2/2 (kN.m)', r.x.bottom, 62.5 * 4 * 1.125, 1e-9); eq('1 both directions equal', r.z.bottom, r.x.bottom, 1e-9);
  eq('1 one-way shear = q L (c - d) = 62.5*4*1.1 (kN)', r.x.Vu, 62.5 * 4 * 1.1, 1e-9);
  eq('1 punching = P - q (c1+d)(c2+d) = 1000 - 62.5*1.96 (kN)', r.punch.Vu, 1000 - 62.5 * 1.96, 1e-9);
  const rw = footingActions({ B: 4, L: 4, plane: s.plane, w: 20, ped: { c1: 1, c2: 1 }, dx: 0.4, dz: 0.4, dPunch: 0.4 });
  eq('1 net of w = 20 kPa: M = (62.5-20)*4*1.125 (kN.m)', rw.x.bottom, 42.5 * 4 * 1.125, 1e-9);
  eq('1 net of w: punching = (1000 - 20*16) - 42.5*1.96 (kN)', rw.punch.Vu, (1000 - 320) - 42.5 * 1.96, 1e-9);
  const ru = footingActions({ B: 4, L: 4, plane: { q0: 10, a: 0, c: 0 }, w: 20, ped: { c1: 1, c2: 1 }, dx: 0.4, dz: 0.4, dPunch: 0.4 });
  eq('1 pressure below the weight: sagging 0, hogging M = (20-10)*4*1.125', ru.x.top, 10 * 4 * 1.125, 1e-9); eq('1 no bottom steel', ru.x.bottom, 0, 1e-12); }
// ---- 2. uniaxial, inside the kern: ex = 0.5 < B/6 = 0.667: q = P/A (1 +- 6e/B) = 109.375 / 15.625 ----
{ const s = soilPressure({ B: 4, L: 4, P: 1000, Mz: 500 });
  eq('2 qmax', s.qmax, 62.5 * 1.75, 1e-12); eq('2 qmin', s.qmin, 62.5 * 0.25, 1e-12);
  const r = footingActions({ B: 4, L: 4, plane: s.plane, w: 0, ped: { c1: 1, c2: 1 }, dx: 0.4, dz: 0.4, dPunch: 0.4 });
  // x in [0.5, 2]: q(x) = 62.5 + 23.4375 x ; M+ = L [62.5*1.125 + 23.4375*1.6875] = 439.45 kN.m ; M- side: q(x) = 62.5 + 23.4375 x for x in [-2, -0.5], arm = -0.5 - x
  eq('2 M+ high side (kN.m)', r.x.Mplus, 4 * (62.5 * 1.125 + 23.4375 * 1.6875), 1e-9);
  eq('2 M- low side (kN.m)', r.x.Mminus, 4 * (62.5 * 1.125 - 23.4375 * 1.6875), 1e-9);
  eq('2 bottom steel from the high side', r.x.bottom, r.x.Mplus, 1e-12);
  eq('2 z direction (no moment about x): uniform in z', r.z.bottom, 62.5 * 4 * 1.125, 1e-9); }
// ---- 3. uniaxial partial contact: B = L = 4, P = 1000, ex = 1.2 > B/6: triangle of length 3(B/2 - e) = 2.4, qmax = 2P/(3 L (B/2 - e)) ----
{ const s = soilPressure({ B: 4, L: 4, P: 1000, Mz: 1200 });
  eq('3 qmax = 2P/(3L(B/2-e)) = 208.33 kPa', s.qmax, 2 * 1000 / (3 * 4 * 0.8), 1e-9); eq('3 contact fraction 2.4/4', s.contactFraction, 0.6, 1e-9); ok('3 not full contact', s.fullContact === false);
  eq('3 qmin = 0', s.qmin, 0, 1e-9);
  // cantilever on the high side: x in [0.5, 2]; q(x) = 208.33 (x - (2-2.4))/2.4 for x >= -0.4 -> M = L ∫ q (x-0.5) dx, all of [0.5,2] in contact
  const r = footingActions({ B: 4, L: 4, plane: s.plane, w: 0, ped: { c1: 1, c2: 1 }, dx: 0.4, dz: 0.4, dPunch: 0.4 });
  const ref = grid(0.5, 2, -2, 2, (x) => (208.3333333333 * (x + 0.4) / 2.4) * (x - 0.5));
  eq('3 M+ vs brute-force integral (kN.m)', r.x.Mplus, ref, 2e-3);
  eq('3 low side carries nothing beyond x = -0.4: M- = 0', r.x.Mminus, 0, 1e-9); }
// ---- 4. biaxial, full contact: ex = 0.3, ez = 0.2 ----
{ const s = soilPressure({ B: 4, L: 3, P: 900, Mz: 270, Mx: 180 });
  const P = 900, A = 12, ex = 0.3, ez = 0.2; const qmax = P / A * (1 + 6 * ex / 4 + 6 * ez / 3);
  eq('4 qmax = P/A (1 + 6ex/B + 6ez/L)', s.qmax, qmax, 1e-12); ok('4 full contact', s.fullContact); }
// ---- 5. biaxial partial contact: equilibrium of the solved plane against a brute-force grid, many cases ----
{ let worst = 0, nv = 0, bad = 0; const cases = [];
  for (let i = 0; i < 40; i++) { const B = 2.5 + (i % 5) * 0.7, L = 2.2 + (i % 7) * 0.6, P = 400 + 90 * i; const fx = 0.12 + ((i * 37) % 64) / 100, fz = 0.1 + ((i * 53) % 60) / 100; cases.push({ B, L, P, ex: fx * B / 2, ez: fz * L / 2 }); }
  for (const t of cases) { const s = soilPressure({ B: t.B, L: t.L, P: t.P, Mz: t.P * t.ex, Mx: t.P * t.ez }); if (!s.valid) { bad++; continue; } nv++;
    const { q0, a, c } = s.plane; const q = (x, z) => Math.max(0, q0 + a * x + c * z); const g = (f) => grid(-t.B / 2, t.B / 2, -t.L / 2, t.L / 2, f, 600);
    const N = g(q), Mx_ = g((x, z) => q(x, z) * x), Mz_ = g((x, z) => q(x, z) * z);
    worst = Math.max(worst, Math.abs(N - t.P) / t.P, Math.abs(Mx_ - t.P * t.ex) / t.P / t.B * 4, Math.abs(Mz_ + t.P * t.ez) / t.P / t.L * 4); }
  ok(`5 ${nv} biaxial cases: N, N*ex, N*ez of the solved plane match a brute-force grid (worst ${(worst * 100).toFixed(2)} %)`, worst < 0.01 && nv >= 36, `${bad} not valid`); }
// ---- 5b. signs: Mz > 0 compression on +x, Mx > 0 compression on -z; reversing a moment mirrors the pressure ----
{ const a = soilPressure({ B: 4, L: 3, P: 900, Mz: 270, Mx: 180 }).plane, b = soilPressure({ B: 4, L: 3, P: 900, Mz: -270, Mx: -180 }).plane;
  ok('5b Mz > 0 -> a > 0 ; Mx > 0 -> c < 0', a.a > 0 && a.c < 0, JSON.stringify(a)); ok('5b reversed moments mirror the plane', Math.abs(a.a + b.a) < 1e-9 && Math.abs(a.c + b.c) < 1e-9 && Math.abs(a.q0 - b.q0) < 1e-9);
  const m = soilPressure({ B: 4, L: 4, P: 1000, Mz: 1200 }).plane, n = soilPressure({ B: 4, L: 4, P: 1000, Mz: -1200 }).plane;
  const ra = footingActions({ B: 4, L: 4, plane: m, w: 0, ped: { c1: 1, c2: 1 }, dx: 0.4, dz: 0.4, dPunch: 0.4 }), rb = footingActions({ B: 4, L: 4, plane: n, w: 0, ped: { c1: 1, c2: 1 }, dx: 0.4, dz: 0.4, dPunch: 0.4 });
  eq('5b +x side of Mz > 0 equals -x side of Mz < 0 (kN.m)', ra.x.Mplus, rb.x.Mminus, 1e-9);
  // pedestal offset adds P_col*cx to Mz about the footing centre: column 1000 kN at cx = 0.5 m, no other moment -> ex = 0.5 m, same pressure as Mz = 500
  const off = soilPressure({ B: 4, L: 4, P: 1000, Mz: 0 + 1000 * 0.5 }); eq('5b offset column = equivalent moment: qmax', off.qmax, 62.5 * 1.75, 1e-12); }
// ---- 6. eccentric pedestal (offset), net of w, partial contact: M, V, punching against the brute-force grid ----
{ const B = 4.2, L = 3.6, P = 1500, Mz = 1500 * 0.9, Mx = 1500 * 0.5, w = 25; const s = soilPressure({ B, L, P, Mz, Mx }); const { q0, a, c } = s.plane; ok('6 valid, partial contact', s.valid && !s.fullContact);
  const ped = { cx: 0.35, cz: -0.25, c1: 0.9, c2: 0.7 }, dx = 0.45, dz = 0.4, dp = 0.42;
  const r = footingActions({ B, L, plane: s.plane, w, ped, dx, dz, dPunch: dp });
  const qn = (x, z) => Math.max(0, q0 + a * x + c * z) - w;
  const fxp = ped.cx + ped.c1 / 2, fxm = ped.cx - ped.c1 / 2, fzp = ped.cz + ped.c2 / 2, fzm = ped.cz - ped.c2 / 2;
  eq('6 Mx+ (x side +) (kN.m)', r.x.Mplus, grid(fxp, B / 2, -L / 2, L / 2, (x, z) => qn(x, z) * (x - fxp), 900), 3e-3);
  eq('6 Mx- (x side -) (kN.m)', r.x.Mminus, grid(-B / 2, fxm, -L / 2, L / 2, (x, z) => qn(x, z) * (fxm - x), 900), 3e-3);
  eq('6 Mz+ (z side +) (kN.m)', r.z.Mplus, grid(-B / 2, B / 2, fzp, L / 2, (x, z) => qn(x, z) * (z - fzp), 900), 3e-3);
  eq('6 Mz- (z side -) (kN.m)', r.z.Mminus, grid(-B / 2, B / 2, -L / 2, fzm, (x, z) => qn(x, z) * (fzm - z), 900), 3e-3);
  eq('6 V x section + at c + d (kN)', r.x.Vplus, grid(fxp + dx, B / 2, -L / 2, L / 2, qn, 900), 3e-3);
  eq('6 V z section - at c + d (kN)', r.z.Vminus, grid(-B / 2, B / 2, -L / 2, fzm - dz, qn, 900), 3e-3);
  const x0 = ped.cx - (ped.c1 + dp) / 2, x1 = ped.cx + (ped.c1 + dp) / 2, z0 = ped.cz - (ped.c2 + dp) / 2, z1 = ped.cz + (ped.c2 + dp) / 2;
  eq('6 net total = P - w B L (kN)', r.punch.total, P - w * B * L, 1e-6);
  eq('6 punching Vu = total - inside (kN)', r.punch.Vu, P - w * B * L - grid(x0, x1, z0, z1, qn, 900), 4e-3); }
// ---- 7. invalid input ----
{ ok('7 P <= 0 is invalid', soilPressure({ B: 3, L: 3, P: 0 }).valid === false && soilPressure({ B: 3, L: 3, P: -10 }).valid === false);
  const o = soilPressure({ B: 3, L: 3, P: 500, Mz: 500 * 1.6 }); ok('7 resultant outside the footing is invalid and says so', o.valid === false && /outside the footing/.test(o.note), o.note);
  ok('7 B <= 0 is invalid', soilPressure({ B: 0, L: 3, P: 100 }).valid === false); }
console.log(`\nPART15: ${pass} pass, ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
