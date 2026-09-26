// ==========================================================================
// SKID-MOUNTED PACKAGE UNIT — FOUNDATION SIZING
// Slab or combined footing sized to envelope the skid footprint plus edge
// distances for anchor bolts. Pure function — no DOM access.
//
// Rule: footing plan = skid footprint + 2*edge (min edge per ACI 318 Ch.17
// ca1 requirements, typical 150–300 mm constructability margin). Self-weight
// same pattern as static block.
// ==========================================================================

export function skidFoundationSizing({ skidB, skidL, edge = 0.3, Hf, Df, gc, gs = 0 }) {
  if (skidB <= 0 || skidL <= 0 || Hf <= 0 || edge < 0) return { valid: false };
  const Bf = skidB + 2 * edge;
  const Lf = skidL + 2 * edge;
  const Af = Bf * Lf;
  const Wf_ton = gc * Af * Hf;
  const totalWeightKN = Wf_ton * 9.80665;
  return {
    valid: true, skidB, skidL, edge, Bf, Lf, Hf, Df, Af,
    Wf_ton, totalWeightKN, deltaH: Hf,
    note: 'Plan = skid footprint + 2x edge distance.'
  };
}
