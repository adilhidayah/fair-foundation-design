// ==========================================================================
// SHARED — FOOTING CHECK AND REINFORCEMENT
// One-way shear (§22.5.5), two-way/punching shear (§22.6.5), and pile-cap flexural
// reinforcement design at the pedestal face — generic across every equipment
// category. Pure functions — no DOM access.
// ==========================================================================

// Finds the smallest x in [lo,hi] where fn(x) >= targetY, assuming fn is non-decreasing in x.
function bisectMinX(targetY, fn, lo, hi, iters = 60) {
  if (fn(hi) < targetY) return null;
  if (fn(lo) >= targetY) return lo;
  for (let i = 0; i < iters; i++) {
    const mid = (lo + hi) / 2;
    if (fn(mid) >= targetY) hi = mid; else lo = mid;
  }
  return hi;
}

// ---------- One-way shear — ACI 318M-19 §22.5.5 ----------
// Vc per Table 22.5.5.1 (no axial force), bw, d in mm, fc in MPa, result in N:
//   simplified : Vc = 0.17·λ·√f'c·bw·d  (permitted only with Av ≥ Av,min or h ≤ 250 mm — the caller reports that)
//   detailed, Av ≥ Av,min (avOk) : the larger of (a) 0.17·λ·√f'c·bw·d and (b) 0.66·λ·ρw^(1/3)·√f'c·bw·d
//   detailed, Av <  Av,min       : (c) 0.66·λs·λ·ρw^(1/3)·√f'c·bw·d, λs = √(2/(1 + d/254)) ≤ 1.0 — NO 0.17 floor
//   all: Vc ≤ 0.42·λ·√f'c·bw·d.
// Footings and mats have no shear reinforcement, so (c) is the normal case (λs is kept: conservative — §13.2.6.2 may allow λs = 1
// for shallow foundations; verify). Before 14 Oct 2026 the 0.17 floor was applied to (c) as well, overstating Vc by 29–120 % for
// ρw = 1.0–0.2 % (d = 341 mm).
function oneWayVc({ bw, dd, fc, rho, lambda, method, avOk }) {
  const sqrtfc = Math.sqrt(fc);
  const vcLower = 0.17 * lambda * sqrtfc * bw * dd, vcUpper = 0.42 * lambda * sqrtfc * bw * dd;
  if (method === 'simplified') return { vc: vcLower, vcLower, vcUpper, lambdaS: null, useFloor: true, detail: 'Simplified — Table 22.5.5.1' };
  const rhoCube = Math.cbrt(Math.max(rho, 0.0001));
  if (avOk) {
    const vcB = 0.66 * lambda * rhoCube * sqrtfc * bw * dd;
    return { vc: Math.min(Math.max(vcLower, vcB), vcUpper), vcLower, vcUpper, lambdaS: null, useFloor: true,
      detail: `Detailed, Av ≥ Av,min — larger of Eq. (a) 0.17λ√f'c·b·d and (b) 0.66λ(ρw)^1/3√f'c·b·d, ≤ 0.42λ√f'c·b·d` };
  }
  const lambdaS = Math.min(1.0, Math.sqrt(2 / (1 + dd / 254)));
  const vcC = 0.66 * lambdaS * lambda * rhoCube * sqrtfc * bw * dd;
  return { vc: Math.min(vcC, vcUpper), vcLower, vcUpper, lambdaS, useFloor: false,
    detail: `Detailed, Av < Av,min — Eq. (c) 0.66λsλ(ρw)^1/3√f'c·b·d (no 0.17 floor), ≤ 0.42λ√f'c·b·d` };
}
import { pointLoadsBeyond } from './loadPoints.js';

export function oneWayShearCheck({ bw, h, cc, Dbar, fc, vu, rho, lambda, method, avOk }) {
  const d = h - cc - Dbar;
  const simplifiedAllowed = avOk || (h > 0 && h <= 250);
  if (d <= 0) {
    return { valid: false, d };
  }
  const sqrtfc = Math.sqrt(fc);
  const { vc, vcLower: vc_lower, vcUpper: vc_upper, lambdaS, useFloor, detail } = oneWayVc({ bw, dd: d, fc, rho, lambda, method, avOk });
  const phi = 0.75;
  const phiVc = phi * vc; // N
  const vu_N = vu * 1000;
  const uc = vu_N / phiVc;
  const pass = uc <= 1.0;

  // Minimum h (rounded up to 50mm) that still satisfies UC <= 1.00, holding other inputs constant.
  let hMinRounded = null;
  if (pass) {
    const phiVcOfD = (dd) => phi * oneWayVc({ bw, dd, fc, rho, lambda, method, avOk }).vc;
    const hMinRaw = bisectMinX(vu_N, (hh) => phiVcOfD(hh - cc - Dbar), cc + Dbar + 1, h);
    if (hMinRaw !== null) hMinRounded = Math.min(h, Math.ceil(hMinRaw / 50) * 50);
  }

  return {
    valid: true, d, sqrtfc, vc_lower, vc_upper, vc, lambdaS, useFloor, detail, phi, phiVc, vu_N, uc, pass,
    simplifiedAllowed, hMinRounded, bw, h, cc, Dbar, fc, vu, rho, lambda, method
  };
}

// Size effect factor for two-way shear without shear reinforcement — ACI 318M-19 Table 22.6.5.2 applies λs of §22.5.5.1.3 to
// all three expressions: λs = √(2 / (1 + 0.004d)) ≤ 1.0, d in mm.
export function twoWaySizeFactor(dmm) {
  return Math.min(1, Math.sqrt(2 / (1 + 0.004 * dmm)));
}

// ---------- Two-way (punching) shear — ACI 318M-19 §22.6.5 ----------
export function twoWayShearCheck({ c1, c2, h, cc, Dbar, fc, vu, lambda, loc }) {
  const d = h - cc - Dbar;
  if (d <= 0) {
    return { valid: false, d };
  }
  let alphaS, bo, boFormula;
  if (loc === 'interior') {
    alphaS = 40;
    bo = 2*(c1+d) + 2*(c2+d);
    boFormula = `2(c₁+d) + 2(c₂+d)`;
  } else if (loc === 'edge') {
    alphaS = 30;
    bo = 2*(c1 + d/2) + (c2 + d);
    boFormula = `2(c₁+d/2) + (c₂+d)`;
  } else {
    alphaS = 20;
    bo = (c1 + d/2) + (c2 + d/2);
    boFormula = `(c₁+d/2) + (c₂+d/2)`;
  }
  const beta = Math.max(c1,c2) / Math.min(c1,c2);
  const sqrtfc = Math.sqrt(fc);
  const lambdaS = twoWaySizeFactor(d);
  const vc_a = 0.33 * lambdaS * lambda * sqrtfc;
  const vc_b = 0.17 * (1 + 2/beta) * lambdaS * lambda * sqrtfc;
  const vc_c = 0.083 * ((alphaS * d / bo) + 2) * lambdaS * lambda * sqrtfc;
  const vc_vals = [
    {label: "(a) 0.33λ<sub>s</sub>λ√f'c", val: vc_a, clause: "Table 22.6.5.2"},
    {label: "(b) 0.17(1+2/β)λ<sub>s</sub>λ√f'c", val: vc_b, clause: "Table 22.6.5.2"},
    {label: "(c) 0.083(α_s·d/b_o + 2)λ<sub>s</sub>λ√f'c", val: vc_c, clause: "Table 22.6.5.2"}
  ];
  const vc_gov = Math.min(vc_a, vc_b, vc_c);
  const Vc = vc_gov * bo * d; // N
  const phi = 0.75;
  const phiVc = phi * Vc;
  const vu_N = vu * 1000;
  const uc = vu_N / phiVc;
  const pass = uc <= 1.0;

  // Minimum h (rounded up to 50mm) that still satisfies UC <= 1.00, holding other inputs constant.
  let hMinRounded = null;
  if (pass) {
    const phiVcOfD = (dd) => {
      let aS, boo;
      if (loc === 'interior') { aS = 40; boo = 2*(c1+dd) + 2*(c2+dd); }
      else if (loc === 'edge') { aS = 30; boo = 2*(c1+dd/2) + (c2+dd); }
      else { aS = 20; boo = (c1+dd/2) + (c2+dd/2); }
      const ls = twoWaySizeFactor(dd);
      const vca = 0.33 * ls * lambda * sqrtfc;
      const vcb = 0.17 * (1 + 2/beta) * ls * lambda * sqrtfc;
      const vcc = 0.083 * ((aS * dd / boo) + 2) * ls * lambda * sqrtfc;
      const vcgov = Math.min(vca, vcb, vcc);
      return phi * vcgov * boo * dd;
    };
    const hMinRaw = bisectMinX(vu_N, (hh) => phiVcOfD(hh - cc - Dbar), cc + Dbar + 1, h);
    if (hMinRaw !== null) hMinRounded = Math.min(h, Math.ceil(hMinRaw / 50) * 50);
  }

  return { valid: true, d, alphaS, bo, boFormula, beta, sqrtfc, lambdaS, vc_vals, vc_gov, Vc, phi, phiVc, vu_N, uc, pass, hMinRounded, h, c1, c2, cc, Dbar, fc, vu, lambda, loc };
}

// ---------- Punching shear with unbalanced moment (eccentric shear stress model) ----------
// ACI 318M-19 §8.4.4.2 / R8.4.4.2.3, interior column / pedestal only. Units: c1, c2, d in mm; Vu in kN; Mx, Mz in kN·m.
// c1 is the pedestal size along x, c2 along y (plan z). Mz bends along x (its critical-section side b1 = c1 + d),
// Mx bends along y (b1 = c2 + d). Both terms are added at the governing corner (biaxial, conservative):
//   vu = Vu/(bo·d) + Σ γv·|Mu|·c_AB/Jc,   γf = 1 / (1 + (2/3)·√(b1/b2)),  γv = 1 − γf,  c_AB = b1/2,
//   Jc = d·b1³/6 + b1·d³/6 + d·b2·b1²/2,  bo = 2(c1 + d) + 2(c2 + d).
// Returns stresses in MPa. Edge / corner geometry is not implemented (valid: false).
export function eccentricPunchingStress({ c1, c2, d, Vu, Mx = 0, Mz = 0, loc = 'interior' }) {
  if (loc !== 'interior') return { valid: false, note: 'Unbalanced-moment shear is implemented for an interior column / pedestal only.' };
  if (!(c1 > 0 && c2 > 0 && d > 0)) return { valid: false, note: 'c1, c2 and d must be greater than zero.' };
  const bo = 2 * (c1 + d) + 2 * (c2 + d);
  const vDirect = Math.abs(Vu) * 1000 / (bo * d);
  const term = (axis, M, b1, b2) => {
    const gf = 1 / (1 + (2 / 3) * Math.sqrt(b1 / b2));
    const gv = 1 - gf;
    const c = b1 / 2;
    const Jc = d * b1 ** 3 / 6 + b1 * d ** 3 / 6 + d * b2 * b1 ** 2 / 2;
    const v = gv * Math.abs(M) * 1e6 * c / Jc;
    return { axis, M, b1, b2, gf, gv, c, Jc, v };
  };
  const terms = [term('z', Mz, c1 + d, c2 + d), term('x', Mx, c2 + d, c1 + d)];
  const vu = vDirect + terms[0].v + terms[1].v;
  return { valid: true, bo, d, vDirect, terms, vu };
}

// ---------- Pile cap flexural reinforcement at the pedestal face ----------

// Sums pile reactions beyond the pedestal face (x = ±xCrit from the pile-group centroid) for cap flexure.
export function pileCapMoment(pileForces, xbar, xCrit) {
  const mPos = pileForces.filter(pf => (pf.x - xbar) > xCrit).reduce((s, pf) => s + pf.F * ((pf.x - xbar) - xCrit), 0);
  const mNeg = pileForces.filter(pf => (pf.x - xbar) < -xCrit).reduce((s, pf) => s + pf.F * (-xCrit - (pf.x - xbar)), 0);
  return Math.max(mPos, mNeg, 0);
}

// Pile cap flexure at the pedestal faces about either axis, bottom AND top face.
//   axis 'x': sections perpendicular to x (piles' x coordinate), 'y': perpendicular to y.
//   ref = pedestal centre coordinate along the axis, crit = pedestal half-size along it (m), so the sections are at
//   ref ± crit. For each side the NET moment of the pile reactions beyond the section is  M_side = Σ F_i·(arm_i),
//   arm_i = |coord_i − ref| − crit  (F_i > 0 compression = upward on the cap). Positive net = sagging (bottom
//   tension); negative net = hogging (top tension), which happens when uplift piles dominate.
//   bottom = max(0, larger of the two sides' net), top = max(0, larger of the two sides' −net).  kN·m for F in kN, m.
// Cap self-weight and soil over the cap are not deducted (conservative for the bottom, unconservative for the top).
// pointLoads (optional, see loadPoints.js): with several load points on the cap the point loads beyond a section are netted against the
// pile reactions beyond it (free body of the cap beyond the section); without them the result is unchanged.
export function pileCapMomentAxis(pileForces, axis, ref, crit, pointLoads = null, capWeight = null) {
  const c = (p) => (axis === 'x' ? p.x : p.y) - ref;
  const side = (sign) => pileForces.filter(p => sign * c(p) > crit).reduce((s, p) => s + p.F * (sign * c(p) - crit), 0) - (pointLoads ? pointLoadsBeyond(pointLoads, axis, ref, crit, sign, capWeight).M : 0);
  const plus = side(1), minus = side(-1);
  return { bottom: Math.max(plus, minus, 0), top: Math.max(-plus, -minus, 0), plus, minus };
}

// Flexural reinforcement of a footing / pile cap strip b × t (mm) with effective depth d, Mu in kN·m — rectangular stress block,
// φ = 0.9 (tension-controlled). Minimum reinforcement, asMinRule:
//   'slab' (default) — footing per ACI 318M-19 §13.3.2.1 / §13.3.3.1 -> §7.6.1.1 / §8.6.1.1, Table 8.6.1.1 (deformed bars):
//          A_s,min = 0.0020·A_g for f_y < 420 MPa, max(0.0018·420/f_y, 0.0014)·A_g for f_y ≥ 420 MPa, A_g = b·t;
//   'beam' — project criterion: max(0.0018·b·t, 1.4·b·d/f_y) (the 1.4·b·d/f_y term is the beam minimum of §9.6.1.2).
export function slabMinSteelRatio(fy) {
  return fy < 420 ? 0.0020 : Math.max(0.0018 * 420 / fy, 0.0014);
}
// Top layer of a footing / pile cap section (b × t, effective depth d, mm; MuKNm = the hogging moment, kN·m, ≥ 0).
//   mode 'bottom' (default, the previous behaviour): a top layer only where a combination gives hogging — designed as flexuralDesign()
//          (A_s = max(A_s,req, A_s,min of the chosen rule)); otherwise none ({ required: false }).
//   mode 'two': a top mat is always provided — A_s = max(hogging design, rhoTop·b·t), rhoTop a project ratio (default 0.0009 = half of
//          0.0018). Without hogging the mat is the minimum only (minOnly: true, AsCalc = 0, so its flexural UC is 0).
// Returns { required, minOnly?, design } with design in the form of flexuralDesign() ({ ok, As, AsCalc, AsMin, ... }).
export function topLayerDesign(MuKNm, b, d, t, fc, fy, { asMinRule = 'slab', mode = 'bottom', rhoTop = 0.0009 } = {}) {
  const hog = MuKNm > 1e-6, two = mode === 'two';
  if (!hog && !two) return { required: false, minOnly: false, design: null };
  const AsTop = two ? Math.max(rhoTop, 0) * b * t : 0;
  if (!hog) return { required: true, minOnly: true, design: { ok: true, rho: 0, As: AsTop, AsCalc: 0, AsMin: AsTop, rhoMin: rhoTop, AsMinFlex: 0, asMinRule: 'top' } };
  const des = flexuralDesign(MuKNm, b, d, t, fc, fy, asMinRule);
  if (!des.ok) return { required: true, minOnly: false, design: des };
  return { required: true, minOnly: false, design: { ...des, As: Math.max(des.As, AsTop), AsMin: Math.max(des.AsMin, AsTop) } };
}
export function flexuralDesign(MuKNm, b, d, t, fc, fy, asMinRule = 'slab') {
  const phi = 0.9;
  const MuNmm = Math.abs(MuKNm) * 1e6;
  const Ru = MuNmm / (phi * b * d * d);
  const term = 1 - (2 * Ru) / (0.85 * fc);
  if (term < 0) return { ok: false };
  const rho = (0.85 * fc / fy) * (1 - Math.sqrt(term));
  const As = rho * b * d;
  const rhoMin = asMinRule === 'beam' ? 0.0018 : slabMinSteelRatio(fy);
  const AsMinFlex = asMinRule === 'beam' ? (1.4 / fy) * b * d : 0;
  const AsMin = Math.max(rhoMin * b * t, AsMinFlex);
  return { ok: true, rho, As: Math.max(As, AsMin), AsCalc: As, AsMin, rhoMin, AsMinFlex, asMinRule };
}

// Bar layout for a required area As (mm²) over a width b (mm): spacing s rounded DOWN to a multiple of `step` (default 25 mm) so
// that A_s,prov = A_bar·b/s ≥ As, and not more than s_max = min(3t, 450) mm (ACI 318M-19 §7.7.2.3 / §8.7.2.2, t = thickness, mm).
// n = number of bars across b at that spacing (b/s rounded up). Returns { s, n, AsProv, sMax, Abar } or { valid: false } when the
// required spacing is below one step. With `cover` (mm): the bars fill the width between the covers — n = ⌈(b − 2·cover − d_b)/s⌉ + 1
// (rounded up, evenly spaced at s_act ≤ s in the drawing), A_s,prov = n·A_bar; the nominal spacing s is what is written (D13-s).
export function barLayout(As, b, db, t, step = 25, cover = null) {
  const Abar = Math.PI / 4 * db * db;
  const sMax = Math.min(3 * t, 450);
  const sReq = As > 0 ? Abar * b / As : Infinity;
  const s = Math.floor(Math.min(sReq, sMax) / step + 1e-9) * step;
  if (!(s >= step)) return { valid: false, s: 0, n: 0, AsProv: 0, sMax, Abar };
  if (cover !== null && cover !== undefined) {
    const span = b - 2 * cover - db;
    const n = Math.max(2, Math.ceil(span / s - 1e-9) + 1);
    return { valid: true, s, n, sAct: span / (n - 1), AsProv: n * Abar, sMax, Abar, cover };
  }
  return { valid: true, s, n: Math.ceil(b / s - 1e-9), AsProv: Abar * b / s, sMax, Abar };
}
