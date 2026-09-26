// ==========================================================================
// SHARED — SETTLEMENT CHECK
// Elastic (immediate) + primary consolidation settlement, generic across
// every equipment category. Pure functions — no DOM access.
//
// Units: SI — q, sigma in kPa; B, L, H in m; Es in kPa; Se, Sc in mm.
// Methods are standard textbook (Bowles / Das); allowable limits per project
// criteria (typical: 25 mm total, 19 mm differential for static equipment).
// ==========================================================================

// Influence factor If for rectangular footing (approx, flexible, center).
// Simplified Steinbrenner chart fit: If ≈ f(L/B, nu). For rigid footing multiply by 0.8 by caller.
export function influenceFactor(LB, nu = 0.3) {
  const lb = Math.max(1, LB);
  // Fit: If grows log-like with L/B, corrected for nu.
  const If = (0.95 + 0.15 * Math.log(lb)) * (1 - 0.2 * (nu - 0.3));
  return { If, LB: lb, nu };
}

// Elastic settlement: Se = q_net * B * (1 - nu^2) / Es * If   (m → returned mm).
export function elasticSettlement({ qNet_kPa, B, L, Es_kPa, nu = 0.3, rigid = true }) {
  if (qNet_kPa <= 0 || B <= 0 || Es_kPa <= 0) return { valid: false };
  const { If } = influenceFactor(L / B, nu);
  const rigidity = rigid ? 0.8 : 1.0;
  const Se_m = (qNet_kPa * B * (1 - nu * nu) / Es_kPa) * If * rigidity;
  return { valid: true, Se_mm: Se_m * 1000, If, rigidity };
}

// Primary 1-D consolidation of a single clay layer:
//   OC/normally consolidated unified: Sc = H/(1+e0) * [Cr*log(sv+ds / sv) ...] etc.
// Simplified: caller passes preconsolidation pc; if sv+ds <= pc → recompression (Cr),
// else Cr part to pc + Cc part beyond.
export function consolidationSettlement({ H, e0, Cc, Cr, sigmaV0_kPa, dSigma_kPa, pc_kPa = null }) {
  if (H <= 0 || e0 < 0 || sigmaV0_kPa <= 0) return { valid: false };
  const sv = sigmaV0_kPa;
  const ds = Math.max(0, dSigma_kPa);
  const pc = pc_kPa === null ? sv : pc_kPa; // null → normally consolidated
  let Sc_m;
  if (sv + ds <= pc) {
    Sc_m = (H / (1 + e0)) * Cr * Math.log10((sv + ds) / sv);
  } else if (sv >= pc) {
    Sc_m = (H / (1 + e0)) * Cc * Math.log10((sv + ds) / sv);
  } else {
    Sc_m = (H / (1 + e0)) * (Cr * Math.log10(pc / sv) + Cc * Math.log10((sv + ds) / pc));
  }
  return { valid: true, Sc_mm: Sc_m * 1000, pc };
}

// Total vs allowable check.
export function settlementCheck({ Se_mm = 0, Sc_mm = 0, allowTotal_mm = 25, allowDiff_mm = 19, diff_mm = 0 }) {
  const total = Se_mm + Sc_mm;
  const ucTotal = total / allowTotal_mm;
  const ucDiff = diff_mm / allowDiff_mm;
  const governingUC = Math.max(ucTotal, ucDiff);
  return {
    valid: true, total_mm: total, Se_mm, Sc_mm,
    ucTotal, ucDiff, governingUC,
    overallPass: governingUC <= 1.0
  };
}
