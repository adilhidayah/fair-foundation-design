// VALIDATION part40 — several load points on a SHALLOW footing (skid runners / base plates / one pedestal per point):
// footingPointLoads() (loadPoints.js), netBeyondWithPoints / footingFlexurePoints / footingOneWayShearPoints / footingPunchingPoint
// (footingDesign.js), foundationGeometryCheck(pointList).
// Hand calculation — rectangular skid tank on a footing 3.0 × 12.1 × 0.4 m (γc 24 kN/m³, no backfill), two skid runners along z at
// x = ±0.9 m, c1 × c2 = 0.2 × 11.5 m, shares 1 : 1, one LRFD combination P = 1000 kN (superstructure), M = 0, kD = 1.2:
//   ΔW = 3.0·12.1·0.4·24 = 348.48 kN, w = 1.2·348.48/36.3 = 11.52 kPa;  P_u = 1000 + 1.2·348.48 = 1418.176 kN
//   q = 1418.176/36.3 = 39.0682 kPa (uniform),  q − w = 1000/36.3 = 27.5482 kPa
//   flexure about x (full length 12.1 m): M(s) = (1000/3)·(1.5 − s)²/2 − 500·(0.9 − s) for |s| < 0.8 (between the runners)
//     s = 0 (span):        375.000 − 450 = −75.000 kN·m  -> hogging 75.0 (top steel) — missed by one load point 2.0 × 11.5 m
//     s = 0.8 (inner face): 81.667 − 50 = 31.667 kN·m;  s = 1.0 (outer face): (1000/3)·0.5²/2 = 41.667 kN·m  -> bottom 41.667
//   one-way shear, d = 0.3 m:  x = 1.3: V = (1000/3)·0.2 = 66.667;  x = 0.5 (− side): (1000/3)·2.0 − 500 = 166.667 kN -> V_u = 166.667
//   punching, runner 2, d = 0.3 m: section x 0.65…1.15, z ±5.9 (inside L/2 = 6.05) -> A = 0.5·11.8 = 5.9 m²
//     V_u = 500 − 27.5482·5.9 = 500 − 162.534 = 337.466 kN
//   shares 1 : 3: group M_z = 250·(−0.9) + 750·0.9 = 450 kN·m
import { footingPointLoads, pedestalOffsetMoments, signedSoilPressure, footingFlexureAxis, footingOneWayShear, footingPunchingShear,
  netBeyondWithPoints, footingFlexurePoints, footingOneWayShearPoints, footingPunchingPoint, foundationGeometryCheck } from '../index.js';
let pass = 0, fail = 0;
function ok(n, c, x = '') { if (c) { pass++; console.log('PASS ' + n + ' ' + x); } else { fail++; console.log('FAIL ' + n + ' ' + x); } }
const near = (a, b, tol) => Math.abs(a - b) <= tol;
let seed = 40102026; const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);

// ---- 1. hand calculation: two skid runners ----
const B = 3.0, L = 12.1, Af = B * L, dW = Af * 0.4 * 24;
const runners = [{ x: -0.9, y: 0, c1: 0.2, c2: 11.5, share: 1 }, { x: 0.9, y: 0, c1: 0.2, c2: 11.5, share: 1 }];
ok('ΔW = 348.48 kN', near(dW, 348.48, 1e-9), dW.toFixed(4));
const fp = footingPointLoads(runners, { P: 1000, Mx: 0, Mz: 0, kD: 1.2, dW, Af });
ok('w = 1.2·348.48/36.3 = 11.52 kPa', near(fp.w, 11.52, 1e-9), fp.w.toFixed(6));
ok('point loads 500 / 500 kN, group P_u = 1418.176 kN, M = 0', near(fp.pointLoads[0].P, 500, 1e-9) && near(fp.pointLoads[1].P, 500, 1e-9) && near(fp.group.P, 1418.176, 1e-9) && near(fp.group.Mx, 0, 1e-9) && near(fp.group.Mz, 0, 1e-9), fp.group.P.toFixed(4));
const pl = signedSoilPressure(B, L, fp.group.P, fp.group.Mz / fp.group.P, -fp.group.Mx / fp.group.P);
ok('uniform q = 39.0682 kPa', pl.valid && near(pl.qmax, 39.0682, 1e-4) && near(pl.qmin, 39.0682, 1e-4), pl.qmax.toFixed(4));
const mid = netBeyondWithPoints({ pl, w: fp.w, B, L, axis: 'x', s: 0, sign: 1, pointLoads: fp.pointLoads });
ok('M at the centre between the runners = 375 − 450 = −75.0 kN·m (hogging)', near(mid.M, -75, 1e-6), mid.M.toFixed(4));
const inner = netBeyondWithPoints({ pl, w: fp.w, B, L, axis: 'x', s: 0.8, sign: 1, pointLoads: fp.pointLoads });
ok('M at the inner face x = 0.8 = 81.667 − 50 = 31.667 kN·m', near(inner.M, 31.6667, 1e-3), inner.M.toFixed(4));
const fx = footingFlexurePoints({ pl, w: fp.w, B, L, axis: 'x', pointLoads: fp.pointLoads });
ok('flexure x: bottom = 41.667 kN·m at an outer face, top = 75.0 kN·m in the span at x = 0', near(fx.bottom, 41.6667, 1e-3) && fx.atBottom.kind === 'face' && near(Math.abs(fx.atBottom.s), 1.0, 1e-9)
  && near(fx.top, 75, 1e-6) && fx.atTop.kind === 'span' && near(fx.atTop.s, 0, 1e-9), `${fx.bottom.toFixed(4)} ${fx.top.toFixed(4)} @ ${fx.atTop.s}`);
// the same tank as ONE load point 2.0 × 11.5 m (the whole skid footprint): only the outer faces, no hogging -> the runners model matters
const one = footingPointLoads([{ x: 0, y: 0, c1: 2.0, c2: 11.5, share: 1 }], { P: 1000, kD: 1.2, dW, Af });
const fx1 = footingFlexurePoints({ pl, w: one.w, B, L, axis: 'x', pointLoads: one.pointLoads });
ok('one footprint 2.0 × 11.5 m: bottom 41.667, top 0 — the hogging between the runners is not seen', near(fx1.bottom, 41.6667, 1e-3) && fx1.top < 1e-9, `${fx1.bottom.toFixed(4)} ${fx1.top}`);
const ow = footingOneWayShearPoints({ pl, w: fp.w, B, L, axis: 'x', pointLoads: fp.pointLoads, d: 0.3 });
ok('one-way x, d = 0.3: V(1.3) = 66.667, V(0.5, − side) = 1000·2/3 − 500 = 166.667 kN -> V_u = 166.667', ow.valid && near(ow.per[1].Vpos, 66.6667, 1e-3) && near(ow.per[1].Vneg, 166.6667, 1e-3) && near(ow.Vu, 166.6667, 1e-3), `${ow.per[1].Vpos.toFixed(4)} ${ow.per[1].Vneg.toFixed(4)}`);
const pp = footingPunchingPoint({ pl, w: fp.w, B, L, pointLoads: fp.pointLoads, j: 1, d: 0.3 });
ok('punching runner 2: interior, A_in = 5.9 m², V_u = 500 − 162.534 = 337.466 kN', pp.valid && pp.sec.loc === 'interior' && near(pp.Ain, 5.9, 1e-9) && near(pp.Vu, 337.4656, 1e-3) && pp.others === 0, `${pp.sec.loc} ${pp.Vu.toFixed(4)}`);
const fp13 = footingPointLoads(runners.map((p, j) => ({ ...p, share: j ? 3 : 1 })), { P: 1000, kD: 1.2, dW, Af });
ok('shares 1 : 3: group M_z = 250·(−0.9) + 750·0.9 = 450 kN·m', near(fp13.group.Mz, 450, 1e-9) && near(fp13.group.P, 1418.176, 1e-9), fp13.group.Mz.toFixed(4));

// ---- 2. one point with share 1 = the single-pedestal model (pedestalOffsetMoments, footingFlexureAxis, footingOneWayShear, footingPunchingShear) ----
let worstM = 0, worstF = 0, worstV = 0, worstP = 0, nP = 0, worstScan = 0;
for (let k = 0; k < 400; k++) {
  const Bf = 2 + 3 * rnd(), Lf = 2 + 3 * rnd(), c1 = 0.4 + 0.6 * rnd(), c2 = 0.4 + 0.6 * rnd();
  const x = (rnd() - 0.5) * (Bf - c1) * 0.9, y = (rnd() - 0.5) * (Lf - c2) * 0.9;
  const Ptop = 300 + 1500 * rnd(), kD = [0.9, 1.2, 1.4][k % 3];
  const footW = Bf * Lf * 0.5 * 24, Wped = 24 * c1 * c2 * 1.0, Wsoil = (Bf * Lf - c1 * c2) * 0.6 * 18, dWk = footW + Wped + Wsoil;
  const Mx0 = (rnd() - 0.5) * 600, Mz0 = (rnd() - 0.5) * 600;
  const r = footingPointLoads([{ x, y, c1, c2, share: 1 }], { P: Ptop, Mx: Mx0, Mz: Mz0, kD, dW: dWk, Wped: [Wped], pedAreas: [c1 * c2], Wsoil, Af: Bf * Lf });
  const off = pedestalOffsetMoments({ Ptop, kD, Wped, Wsoil, OffX: x, OffZ: y, Af: Bf * Lf, Ap: c1 * c2 });
  worstM = Math.max(worstM, Math.abs(r.group.Mx - (Mx0 + off.dMx)), Math.abs(r.group.Mz - (Mz0 + off.dMz)), Math.abs(r.group.P - (Ptop + kD * dWk)));
  const wOld = kD * (footW / (Bf * Lf) + Wsoil / (Bf * Lf - c1 * c2));
  worstM = Math.max(worstM, Math.abs(r.w - wOld));
  const Pu = r.group.P, plk = signedSoilPressure(Bf, Lf, Pu, r.group.Mz / Pu, -r.group.Mx / Pu);
  if (!plk.valid) continue;
  for (const axis of ['x', 'z']) {
    const ref = axis === 'x' ? x : y, half = (axis === 'x' ? c1 : c2) / 2;
    const a = footingFlexureAxis({ pl: plk, w: r.w, B: Bf, L: Lf, axis, ref, half });
    const b = footingFlexurePoints({ pl: plk, w: r.w, B: Bf, L: Lf, axis, pointLoads: r.pointLoads, nScan: 0 });
    worstF = Math.max(worstF, Math.abs(a.bottom - b.bottom), Math.abs(a.top - b.top));
    const bs = footingFlexurePoints({ pl: plk, w: r.w, B: Bf, L: Lf, axis, pointLoads: r.pointLoads });
    worstScan = Math.min(worstScan, bs.bottom - b.bottom, bs.top - b.top); // the span scan can only add sections
    const d = 0.35;
    const c = footingOneWayShear({ pl: plk, w: r.w, B: Bf, L: Lf, axis, ref, half, d });
    const e = footingOneWayShearPoints({ pl: plk, w: r.w, B: Bf, L: Lf, axis, pointLoads: r.pointLoads, d });
    worstV = Math.max(worstV, Math.abs(c.Vu - e.Vu));
  }
  const ps = footingPunchingShear({ pl: plk, w: r.w, B: Bf, L: Lf, cx: x, cz: y, c1, c2, d: 0.35 });
  const pq = footingPunchingPoint({ pl: plk, w: r.w, B: Bf, L: Lf, pointLoads: r.pointLoads, j: 0, d: 0.35 });
  if (ps.valid && pq.valid) { nP++; worstP = Math.max(worstP, Math.abs(ps.Vu - pq.Vu)); }
}
ok('one point, share 1: group P / M_x / M_z = P_top + kD·ΔW and the pedestal-offset moments, w = the single model w (400 cases)', worstM < 1e-9, worstM.toExponential(2));
ok('one point: flexure at the faces = footingFlexureAxis() (bottom and top, both axes)', worstF < 1e-6, worstF.toExponential(2));
ok('one point: span scan never lowers the face moments', worstScan > -1e-9, worstScan.toExponential(2));
ok('one point: one-way V_u = footingOneWayShear()', worstV < 1e-6, worstV.toExponential(2));
ok(`one point: punching V_u = footingPunchingShear() (${nP} cases, by equilibrium)`, nP > 200 && worstP < 1e-6, worstP.toExponential(2));

// ---- 3. equilibrium with several points (random layouts, pedestals, backfill, eccentric pressure) ----
let worstEq = 0, worstSym = 0, nEq = 0;
for (let k = 0; k < 400; k++) {
  const Bf = 3 + 5 * rnd(), Lf = 3 + 8 * rnd(), Afk = Bf * Lf;
  const np = 2 + Math.floor(rnd() * 3);
  const pts = Array.from({ length: np }, () => { const c1 = 0.3 + 0.5 * rnd(), c2 = 0.3 + 0.5 * rnd(); return { x: (rnd() - 0.5) * (Bf - c1), y: (rnd() - 0.5) * (Lf - c2), c1, c2, share: 0.5 + rnd() }; });
  const hasPed = k % 2 === 0, kD = [0.9, 1.2, 1.4][k % 3];
  const Wped = hasPed ? pts.map(p => 24 * p.c1 * p.c2 * 0.8) : null, pedAreas = hasPed ? pts.map(p => p.c1 * p.c2) : null;
  const Wsoil = hasPed ? (Afk - pedAreas.reduce((s, a) => s + a, 0)) * 0.5 * 18 : 0;
  const dWk = Afk * 0.5 * 24 + (Wped ? Wped.reduce((s, a) => s + a, 0) : 0) + Wsoil;
  const r = footingPointLoads(pts, { P: 500 + 2000 * rnd(), Mx: (rnd() - 0.5) * 800, Mz: (rnd() - 0.5) * 800, kD, dW: dWk, Wped, pedAreas, Wsoil, Af: Afk });
  const plk = signedSoilPressure(Bf, Lf, r.group.P, r.group.Mz / r.group.P, -r.group.Mx / r.group.P);
  if (!plk.valid) continue;
  nEq++;
  for (const axis of ['x', 'z']) {
    const h = (axis === 'x' ? Bf : Lf) / 2;
    const all = netBeyondWithPoints({ pl: plk, w: r.w, B: Bf, L: Lf, axis, s: -h - 1e-9, sign: 1, pointLoads: r.pointLoads });
    worstEq = Math.max(worstEq, Math.abs(all.V), Math.abs(all.M));
    // a section clear of every footprint: the two free bodies give the same moment
    for (let t = 0; t < 10; t++) {
      const s = (rnd() - 0.5) * 2 * h;
      if (r.pointLoads.some(q => Math.abs(s - (axis === 'x' ? q.x : q.y)) < (axis === 'x' ? q.c1 : q.c2) / 2)) continue;
      const a = netBeyondWithPoints({ pl: plk, w: r.w, B: Bf, L: Lf, axis, s, sign: 1, pointLoads: r.pointLoads });
      const b = netBeyondWithPoints({ pl: plk, w: r.w, B: Bf, L: Lf, axis, s, sign: -1, pointLoads: r.pointLoads });
      worstSym = Math.max(worstSym, Math.abs(a.M - b.M), Math.abs(a.V + b.V));
    }
  }
}
ok(`${nEq} random layouts: soil = w·A + Σ point loads, and no moment about the footing edge (both axes)`, nEq > 300 && worstEq < 1e-6, worstEq.toExponential(2));
ok('section clear of the points: M of the two free bodies equal, V opposite', worstSym < 1e-6, worstSym.toExponential(2));

// ---- 4. punching with a second point inside the critical section ----
{
  const pts = [{ x: -0.3, y: 0, c1: 0.4, c2: 0.4, share: 1 }, { x: 0.15, y: 0, c1: 0.2, c2: 0.2, share: 1 }];
  const r = footingPointLoads(pts, { P: 800, kD: 1, dW: 0, Af: 16 });
  const plk = signedSoilPressure(4, 4, r.group.P, r.group.Mz / r.group.P, -r.group.Mx / r.group.P);
  const p0 = footingPunchingPoint({ pl: plk, w: r.w, B: 4, L: 4, pointLoads: r.pointLoads, j: 0, d: 0.5 });
  // section x −0.75…0.15, z ±0.45 -> half of point 2 (x 0.05…0.25) inside. M_z = 400·(−0.3) + 400·0.15 = −60 kN·m, so
  // q = 50 + (−60/(4·4³/12))·x = 50 − 2.8125·x; over the section (centre x = −0.3, 0.81 m²): 0.81·(50 + 0.84375) = 41.1834 kN
  // V_u = 400 + 0.5·400 − 41.1834 = 558.8166 kN
  ok('point 2 half inside the section of point 1: V_u = 400 + 0.5·400 − 0.81·(50 + 2.8125·0.3) = 558.817 kN', p0.valid && p0.others === 1 && near(plk.b, -2.8125, 1e-9) && near(p0.Vu, 558.8166, 1e-4), p0.Vu.toFixed(4));
}

// ---- 5. geometry: load points (no pedestal) must sit on the footing ----
{
  const g0 = foundationGeometryCheck({ Bf: 3, Lf: 12.1, Hf: 0.4, Df: 0.2, pointList: runners });
  const g1 = foundationGeometryCheck({ Bf: 3, Lf: 11.0, Hf: 0.4, Df: 0.2, pointList: runners });
  const g2 = foundationGeometryCheck({ Bf: 1.8, Lf: 12.1, Hf: 0.4, Df: 0.2, pointList: runners });
  ok('runners inside 3.0 × 12.1: no issue; L = 11.0 < 11.5: pointZ; B = 1.8: pointX on both', g0.issues.length === 0 && g1.issues.some(i => i.code === 'pointZ') && g2.issues.filter(i => i.code === 'pointX').length === 2,
    `${g0.issues.length} ${g1.issues.map(i => i.code)} ${g2.issues.map(i => i.code)}`);
  const g3 = foundationGeometryCheck({ Bf: 1.8, Lf: 12.1, Hf: 0.4, Df: 0.2 });
  ok('without pointList the check is unchanged', g3.issues.length === 0);
}

console.log(`\npart40: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
