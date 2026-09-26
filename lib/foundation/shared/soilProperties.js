// ==========================================================================
// SHARED — SOIL PROPERTIES
// Derive design soil parameters from field/lab data. Used by every equipment
// category. Pure functions — no DOM access.
//
// Units: SI — c, cu in kPa; gamma in kN/m3; Es in kPa; N in blows/300mm.
// Methods are empirical correlations — user must verify against project
// geotechnical report before clicking "Hitung".
// ==========================================================================

// Overburden + energy correction: N60 = N * (ER/60) * Cn
// Cn = sqrt(pa / sigmaV) capped [0.5, 2.0], pa = 100 kPa (Liao & Whitman).
export function correctSPT(N, sigmaV_kPa, energyRatio = 60) {
  if (N <= 0 || sigmaV_kPa <= 0) return { valid: false };
  const Cn = Math.min(2.0, Math.max(0.5, Math.sqrt(100 / sigmaV_kPa)));
  const N60 = N * (energyRatio / 60) * Cn;
  return { valid: true, Cn, N60 };
}

// Peck et al. approx for granular soils: phi ≈ 27 + 0.3*N60 - 0.00054*N60^2 (deg).
// Clamped to [26, 45]. For cohesive soils phi ≈ 0 (UU), use cu below.
export function phiFromSPT(N60, soilType = 'sand') {
  if (soilType === 'clay') return { phiDeg: 0, method: 'UU clay — phi = 0, use cu' };
  const phi = 27 + 0.3 * N60 - 0.00054 * N60 * N60;
  const phiDeg = Math.min(45, Math.max(26, phi));
  return { phiDeg, method: "Peck et al. granular approx" };
}

// Stroud correlation: cu ≈ k * N60 (kPa), k ≈ 4–6 for low-plasticity clay.
// Default k = 5; caller overrides per lab data.
export function cuFromSPT(N60, k = 5) {
  return { cu: k * N60, k, method: 'cu = k*N60 (Stroud)' };
}

// Bowles approx for elastic modulus: granular Es ≈ 500*(N60+15) kPa;
// cohesive Es ≈ 300*cu..500*cu. Returns range so caller picks conservatively.
export function esFromSPT(N60, cu = 0) {
  const EsGranular = 500 * (N60 + 15);
  const EsCohesiveLow = 300 * cu;
  const EsCohesiveHigh = 500 * cu;
  return { EsGranular, EsCohesiveLow, EsCohesiveHigh };
}

// Submerged unit weight + Poisson suggestion by soil type.
export function soilDefaults(soilType = 'sand', gammaMoist = 18, gammaSat = 20) {
  const belowWT = gammaSat - 9.81;
  const nu = soilType === 'clay' ? 0.45 : 0.3;
  return { gammaMoist, gammaSat, gammaSubmerged: belowWT, poisson: nu };
}
