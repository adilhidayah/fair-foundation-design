// ==========================================================================
// ROTATING EQUIPMENT — FOUNDATION SIZING
// Block foundation geometry + self-weight + total vibrating mass.
// Pure function — no DOM access.
//
// Rotating machines usually sit on a massive concrete block (not a spread
// footing + slender pedestal): mass ratio block/machine ≥ 3 (reciprocating
// ≥ 5) per ACI 351.3R practice. This module sizes the block and returns the
// total mass used by vibrationCheck.js for frequency tuning.
// ==========================================================================

export function rotatingFoundationSizing({ Bf, Lf, Hf, Df, gc, machineMass_kg = 0, minMassRatio = 3 }) {
  if (Bf <= 0 || Lf <= 0 || Hf <= 0) return { valid: false };
  const Af = Bf * Lf;
  const Wf_ton = gc * Af * Hf; // gc in ton/m3
  const blockMass_kg = Wf_ton * 1000;
  const totalMass_kg = blockMass_kg + Math.max(0, machineMass_kg);
  const massRatio = machineMass_kg > 0 ? blockMass_kg / machineMass_kg : Infinity;
  const massOk = massRatio >= minMassRatio;
  const totalWeightKN = (Wf_ton * 9.80665);
  const HfEff = Hf;
  return {
    valid: true, Af, Hf: HfEff, Df,
    Wf_ton, totalWeightKN,
    blockMass_kg, machineMass_kg, totalMass_kg,
    massRatio, minMassRatio, massOk,
    deltaH: HfEff, // machine base to underside of block
    note: massOk ? 'Block/machine mass ratio satisfied.' : 'Block too light — enlarge block.'
  };
}
