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
export function combineFootingChecks(uni, bi) {
  if (!uni || !uni.valid) return uni;
  const checks = [
    ...uni.checks,
    { name: 'Eccentricity (biaxial kern)', uc: bi.ucKernBiaxial },
    { name: 'Overturning (biaxial)', uc: bi.ucOTBiaxial }
  ];
  const governingCheck = checks.reduce((a, b) => (b.uc > a.uc ? b : a));
  return { checks, governingCheck, governingUC: governingCheck.uc, overallPass: checks.every(c => c.uc <= 1.0) };
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
