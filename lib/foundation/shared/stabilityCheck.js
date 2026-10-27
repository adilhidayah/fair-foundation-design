// ==========================================================================
// SHARED — STABILITY CHECK
// Overturning, sliding, eccentricity and bearing pressure (shallow footing), and
// axial/lateral pile-group distribution (pile foundation) — generic across every
// equipment category. Pure functions — no DOM access, no formatting-library
// dependency (note strings use plain .toFixed(), not the app's fmt() helper).
// ==========================================================================

// Evaluates one load combination's P,H,M against the four shallow-footing stability checks.
export function evaluateFoundationCombo(B, L, P, H, M, qa, mu, eccRatioAllow, fsSlideMin, fsOTMin) {
  if (P <= 0) {
    return { valid: false, note: 'Net uplift (P ≤ 0) — footing loses contact entirely.', governingUC: Infinity };
  }
  const Habs = Math.abs(H), Mabs = Math.abs(M);
  const e = Mabs / P;
  const kernLimit = B / 6;
  const eAllow = eccRatioAllow * B;
  let qmax, qmin, bearingNote, effWidthUsed = false, Beff = null;
  if (e <= kernLimit) {
    qmax = (P / (B*L)) * (1 + 6*e/B);
    qmin = (P / (B*L)) * (1 - 6*e/B);
    bearingNote = `Full contact (e ≤ B/6): q = (P/BL)(1 ± 6e/B)`;
  } else {
    Beff = B - 2*e;
    effWidthUsed = true;
    if (Beff <= 0) {
      return { valid: false, note: `Complete base separation (e = ${e.toFixed(3)} m exceeds B/2).`, governingUC: Infinity };
    }
    qmax = P / (Beff * L);
    qmin = 0;
    bearingNote = `Partial uplift (e > B/6), effective width: B' = B - 2e = ${Beff.toFixed(3)} m`;
  }
  const ucBearing = qmax / qa;
  const ucEcc = e / eAllow;
  const fsSliding = Habs > 0 ? (mu * P) / Habs : Infinity;
  const ucSliding = Habs > 0 ? fsSlideMin / fsSliding : 0;
  const resistMomentOT = P * B / 2;
  const fsOT = Mabs > 0 ? resistMomentOT / Mabs : Infinity;
  const ucOT = Mabs > 0 ? fsOTMin / fsOT : 0;
  const checks = [
    {name: 'Eccentricity', uc: ucEcc},
    {name: 'Bearing pressure', uc: ucBearing},
    {name: 'Sliding', uc: ucSliding},
    {name: 'Overturning', uc: ucOT}
  ];
  const governingCheck = checks.reduce((a,b) => b.uc > a.uc ? b : a);
  return {
    valid: true, Habs, Mabs, e, kernLimit, eAllow, qmax, qmin, bearingNote, effWidthUsed, Beff,
    fsSliding, fsOT, resistMomentOT, checks, governingCheck, governingUC: governingCheck.uc,
    overallPass: checks.every(c => c.uc <= 1.0)
  };
}

// Biaxial kern (eccentricity) and overturning checks for one combination — a supplement to
// evaluateFoundationCombo()'s uniaxial (resultant-M) versions of the same two checks. P is the load at the
// footing centroid, Mx/Mz its longitudinal/transversal moment components (not the resultant M).
// Kern: ex (from Mz, checked against B) and ez (from Mx, checked against L) combined via the standard
// kern-diamond criterion for a rectangular footing, 6ex/B + 6ez/L ≤ 1 — generalized with eccRatioAllow in place
// of the fixed 1/6 (so it also covers the 1/4 seismic option), giving ucKernBiaxial = (ex/B + ez/L)/eccRatioAllow.
// Overturning: resisting moment uses the half-dimension toward the edge the moment actually acts about — B1 =
// B/2 resists Mz (transversal), B2 = L/2 resists Mx (longitudinal); each direction gets its own factor of
// safety (SF1, SF2), and ucOTBiaxial is the worse (governing) of the two against fsOTMin.
export function evaluateBiaxialFooting(B, L, P, Mx, Mz, eccRatioAllow, fsOTMin) {
  const B1 = B / 2, B2 = L / 2;
  if (P <= 0) {
    return { ex: NaN, ez: NaN, ucKernBiaxial: Infinity, OM1: 0, OM2: 0, RM1: 0, RM2: 0, SF1: 0, SF2: 0, ucOTBiaxial: Infinity };
  }
  const ex = Math.abs(Mz) / P, ez = Math.abs(Mx) / P;
  const ucKernBiaxial = (ex / B + ez / L) / eccRatioAllow;
  const OM1 = Math.abs(Mz), OM2 = Math.abs(Mx);
  const RM1 = P * B1, RM2 = P * B2;
  const SF1 = OM1 > 0 ? RM1 / OM1 : Infinity;
  const SF2 = OM2 > 0 ? RM2 / OM2 : Infinity;
  const ucOTBiaxial = Math.max(OM1 > 0 ? fsOTMin / SF1 : 0, OM2 > 0 ? fsOTMin / SF2 : 0);
  return { ex, ez, ucKernBiaxial, OM1, OM2, RM1, RM2, SF1, SF2, ucOTBiaxial };
}

// Moments about the footing centroid from a pedestal that is offset from it (shallow footing, 4A). The loads at the top of
// the pedestal act at the pedestal centre (OffX, OffZ measured from the footing centre). Of the foundation self-weight, the
// pedestal + grout act there too, the footing at its own centre (no moment), and the backfill above the footing — footing area
// minus pedestal area — at its centroid, which shifts the other way: x_s = −OffX·Ap/(Af − Ap), z_s = −OffZ·Ap/(Af − Ap).
// kD = the combination's dead-load factor (it scales the self-weight, as for ΔW). App sign convention: Mz > 0 compresses the
// +x side, Mx > 0 compresses the −z side, so a downward load W at (x, z) gives Mz = +W·x and Mx = −W·z.
// Units: kN, m -> kN·m. Statics (resultant of the vertical loads about the footing centroid) — no code clause involved.
export function pedestalOffsetMoments({ Ptop = 0, kD = 1, Wped = 0, Wsoil = 0, OffX = 0, OffZ = 0, Af = 0, Ap = 0 }) {
  const Wat = Ptop + kD * Wped;                         // acting at the pedestal centre
  const share = Af > Ap && Ap > 0 ? Ap / (Af - Ap) : 0; // soil centroid shift per unit offset
  const xs = -OffX * share, zs = -OffZ * share;
  const dMz = Wat * OffX + kD * Wsoil * xs;
  const dMx = -(Wat * OffZ + kD * Wsoil * zs);
  return { dMx, dMz, Wat, xs, zs };
}

// Adds the biaxial kern and overturning checks (evaluateBiaxialFooting) to evaluateFoundationCombo()'s uniaxial checks, so the
// governing check, governing UC and overallPass cover both. Under moments about both axes the kern diamond
// (6ex/B + 6ez/L ≤ 1) is stricter than the resultant-e check alone, which could otherwise report PASS while the biaxial kern
// fails. uni: evaluateFoundationCombo() result; bi: evaluateBiaxialFooting() result. An invalid uni (net uplift / base
// separation) is returned unchanged.
// opts (optional, the call without it is unchanged):
//   eccLimit = false   — no eccentricity limit (project criterion): both eccentricity checks are left out, partial uplift is
//                        accepted and bearing pressure + overturning govern;
//   ucBearingBiaxial   — q_max / q_a from biaxialSoilPressure() (no-tension, both moments at once), added as its own check;
//   minContact (0..1)  — project criterion: share of the base that must stay in contact (rigid footing, soil without tension);
//                        with contactRatio (biaxialSoilPressure().contactRatio; 0 / missing = no equilibrium) it is a check
//                        UC = minContact / contactRatio (∞ without contact). Left out when minContact is 0 / not given.
export function combineFootingChecks(uni, bi, opts = {}) {
  if (!uni || !uni.valid) return uni;
  const eccLimit = opts.eccLimit !== false;
  const checks = [
    ...uni.checks.filter(c => eccLimit || c.name !== 'Eccentricity'),
    ...(eccLimit ? [{ name: 'Eccentricity (biaxial kern)', uc: bi.ucKernBiaxial }] : []),
    { name: 'Overturning (biaxial)', uc: bi.ucOTBiaxial },
    ...(opts.ucBearingBiaxial !== undefined ? [{ name: 'Bearing pressure (biaxial)', uc: opts.ucBearingBiaxial }] : []),
    ...(opts.minContact > 0 ? [{ name: `Contact area (min ${(opts.minContact * 100).toFixed(0)} %)`, uc: opts.contactRatio > 0 ? opts.minContact / opts.contactRatio : Infinity }] : [])
  ];
  const governingCheck = checks.reduce((a, b) => (b.uc > a.uc ? b : a));
  return { checks, governingCheck, governingUC: governingCheck.uc, overallPass: checks.every(c => c.uc <= 1.0) };
}

// Soil pressure under a rigid rectangular footing B (x) × L (z) with biaxial eccentricity and no tension (the soil cannot pull).
// Linear pressure q(x, z) = a + b·x + c·z over the contact zone q ≥ 0, origin at the footing centroid; ex = |Mz|/P, ez = |Mx|/P
// (the sign only mirrors the picture, so the maximum is at the (+B/2, +L/2) corner). Equilibrium:
//   ∫ q dA = P,  ∫ q·x dA = P·ex,  ∫ q·z dA = P·ez   over the contact zone.
// Full contact (6ex/B + 6ez/L ≤ 1): closed form q = P/(BL)·(1 ± 6ex/B ± 6ez/L). Otherwise the contact zone is the rectangle clipped
// by the line q = 0 (a convex polygon); the three equations are solved by Newton's method. The integrals are exact — the polygon is
// split into triangles and a degree-2 polynomial is integrated by the edge-midpoint rule (exact to degree 2) — and the Jacobian is
// ∫ [1, x, z]ᵀ[1, x, z] dA over the contact zone (the boundary term vanishes because q = 0 on the line).
// Same statics as the closed forms for eccentric footings in Bowles, Foundation Analysis and Design (uniaxial: q_max = 2P / [3L(B/2 − e)];
// corner triangle: q_max = 6P/(s·t), s = 4(B/2 − ex), t = 4(L/2 − ez)) — validation part14 checks both.
// Returns { valid, fullContact, qmax, qmin, contactArea, contactRatio, a, b, c, iterations, note }; valid = false when the
// resultant lies on or outside the footing edge (no equilibrium possible) or P ≤ 0.
export function biaxialSoilPressure(B, L, P, ex, ez) {
  ex = Math.abs(ex); ez = Math.abs(ez);
  const A = B * L;
  if (!(P > 0) || !(B > 0) || !(L > 0)) return { valid: false, qmax: Infinity, note: 'P ≤ 0 or zero footing size.' };
  if (ex >= B / 2 || ez >= L / 2) return { valid: false, qmax: Infinity, note: 'Resultant outside the footing — no equilibrium (overturning).' };
  const kern = 6 * ex / B + 6 * ez / L;
  if (kern <= 1) {
    const q0 = P / A;
    return { valid: true, fullContact: true, qmax: q0 * (1 + kern), qmin: q0 * (1 - kern), contactArea: A, contactRatio: 1,
      a: q0, b: 12 * P * ex / (B * B * B * L), c: 12 * P * ez / (B * L * L * L), iterations: 0,
      note: 'Full contact (6ex/B + 6ez/L ≤ 1): q = (P/BL)(1 ± 6ex/B ± 6ez/L)' };
  }
  const rect = [[-B / 2, -L / 2], [B / 2, -L / 2], [B / 2, L / 2], [-B / 2, L / 2]];
  // Contact polygon: rectangle clipped to a + b·x + c·z ≥ 0 (Sutherland–Hodgman, one half-plane).
  const clip = (a, b, c) => {
    const out = [], f = (p) => a + b * p[0] + c * p[1];
    for (let i = 0; i < 4; i++) {
      const p = rect[i], q = rect[(i + 1) % 4], fp = f(p), fq = f(q);
      if (fp >= 0) out.push(p);
      if ((fp >= 0) !== (fq >= 0)) { const t = fp / (fp - fq); out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]); }
    }
    return out;
  };
  // Integrals over the polygon: F = ∫ q·[1, x, z] dA, J = ∫ [1, x, z]ᵀ[1, x, z] dA, area.
  const integrate = (a, b, c) => {
    const poly = clip(a, b, c), F = [0, 0, 0], J = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    let area = 0;
    for (let i = 1; i + 1 < poly.length; i++) {
      const p0 = poly[0], p1 = poly[i], p2 = poly[i + 1];
      const At = 0.5 * Math.abs((p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1]));
      area += At;
      for (const [u, v] of [[p0, p1], [p1, p2], [p2, p0]]) {
        const x = (u[0] + v[0]) / 2, z = (u[1] + v[1]) / 2, w = At / 3, g = [1, x, z], q = a + b * x + c * z;
        for (let r = 0; r < 3; r++) { F[r] += w * q * g[r]; for (let s = 0; s < 3; s++) J[r][s] += w * g[r] * g[s]; }
      }
    }
    return { F, J, area };
  };
  const target = [P, P * ex, P * ez], scale = [P, P * B, P * L];
  const resid = (I) => Math.hypot(...I.F.map((v, i) => (v - target[i]) / scale[i]));
  const solve3 = (M, r) => { // Cramer's rule, 3 × 3
    const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    const D = det(M);
    return [0, 1, 2].map(k => det(M.map((row, i) => row.map((v, j) => (j === k ? r[i] : v)))) / D);
  };
  // Start from the full-contact (elastic, with tension) plane.
  let th = [P / A, 12 * P * ex / (B * B * B * L), 12 * P * ez / (B * L * L * L)];
  let I = integrate(...th), res = resid(I), it = 0;
  for (; it < 200 && res > 1e-12; it++) {
    const d = solve3(I.J, I.F.map((v, i) => target[i] - v));
    let step = 1, next, In, rn;
    do {
      next = th.map((v, i) => v + step * d[i]);
      In = integrate(...next); rn = resid(In); step /= 2;
    } while ((In.area <= 0 || rn >= res) && step > 1e-6);
    if (In.area <= 0 || rn >= res) break;
    th = next; I = In; res = rn;
  }
  const [a, b, c] = th;
  const corners = rect.map(p => a + b * p[0] + c * p[1]);
  return { valid: res <= 1e-8, fullContact: false, qmax: Math.max(...corners), qmin: 0, contactArea: I.area, contactRatio: I.area / A,
    a, b, c, iterations: it, residual: res,
    note: `Partial contact (6ex/B + 6ez/L = ${kern.toFixed(3)} > 1), no tension: contact ${(100 * I.area / A).toFixed(1)}% of the base` };
}

// Meyerhof effective area for an eccentric footing (both directions): B' = B − 2ex, L' = L − 2ez, uniform pressure
// q' = P / (B'·L') over the effective area. The bearing capacity is then computed with the effective dimensions (shorter one as
// the width) — done by the caller with bearingCapacityCheck(). Returns { valid, Beff, Leff, Bshort, Llong, Aeff, qeff, note };
// valid = false when B' or L' ≤ 0 (resultant at or outside the footing edge) or P ≤ 0.
export function meyerhofEffectiveArea(B, L, P, ex, ez) {
  const Beff = B - 2 * Math.abs(ex), Leff = L - 2 * Math.abs(ez);
  if (!(P > 0) || !(Beff > 0) || !(Leff > 0)) {
    return { valid: false, Beff, Leff, qeff: Infinity, note: 'Effective area B′·L′ ≤ 0 — resultant at or outside the footing edge.' };
  }
  const Aeff = Beff * Leff;
  return { valid: true, Beff, Leff, Bshort: Math.min(Beff, Leff), Llong: Math.max(Beff, Leff), Aeff, qeff: P / Aeff,
    note: `Meyerhof effective area: B′ = B − 2ex = ${Beff.toFixed(3)} m, L′ = L − 2ez = ${Leff.toFixed(3)} m, q = P/(B′L′)` };
}

// Distributes P, H, M across a pile group (rigid cap, uniaxial bending about the axis varying x).
export function evaluatePileCombo(piles, P, H, M, Qc, Qt, Ql) {
  const n = piles.length;
  if (n === 0) return { valid: false, note: 'No piles defined.', governingUC: Infinity };
  const xbar = piles.reduce((s, p) => s + p.x, 0) / n;
  const sumX2 = piles.reduce((s, p) => s + Math.pow(p.x - xbar, 2), 0);
  const pileForces = piles.map((p, i) => {
    const dx = p.x - xbar;
    const F = P / n + (sumX2 > 1e-9 ? (M * dx / sumX2) : 0);
    return { i: i + 1, x: p.x, y: p.y, F };
  });
  const Fmax = Math.max(...pileForces.map(pf => pf.F));
  const Fmin = Math.min(...pileForces.map(pf => pf.F));
  const Habs = Math.abs(H);
  const Hi = Habs / n;
  const ucCompression = Fmax > 0 ? Fmax / Qc : 0;
  const ucUplift = Fmin < 0 ? (-Fmin) / Qt : 0;
  const ucLateral = Hi > 0 ? (Ql > 0 ? Hi / Ql : Infinity) : 0;
  const checks = [
    { name: 'Compression', uc: ucCompression },
    { name: 'Uplift', uc: ucUplift },
    { name: 'Lateral', uc: ucLateral }
  ];
  const governingCheck = checks.reduce((a, b) => b.uc > a.uc ? b : a);
  return {
    valid: true, pileForces, Fmax, Fmin, Hi, n,
    checks, governingCheck, governingUC: governingCheck.uc,
    overallPass: checks.every(c => c.uc <= 1.0)
  };
}
