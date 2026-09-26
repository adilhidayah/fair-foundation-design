// ==========================================================================
// RECIPROCATING EQUIPMENT — FOUNDATION SIZING
// Large rigid block: geometry + self-weight + mass ratio (>= 5 typical) +
// embedment guidance. Pure function — no DOM access.
//
// heavier than rotating: block/machine mass ratio >= 5 (up to 8 for large
// diesel engines). Embedment Df sized so base area + soil stiffness push
// fn clear of 1x/2x rpm — tuning itself happens in dynamicForceCheck.js,
// this module just reports geometry/mass.
// ==========================================================================

export function reciprocatingFoundationSizing({ Bf, Lf, Hf, Df, gc, machineMass_kg = 0, minMassRatio = 5 }) {
  if (Bf <= 0 || Lf <= 0 || Hf <= 0) return { valid: false };
  const Af = Bf * Lf;
  const Wf_ton = gc * Af * Hf;
  const blockMass_kg = Wf_ton * 1000;
  const totalMass_kg = blockMass_kg + Math.max(0, machineMass_kg);
  const massRatio = machineMass_kg > 0 ? blockMass_kg / machineMass_kg : Infinity;
  const massOk = massRatio >= minMassRatio;
  const totalWeightKN = Wf_ton * 9.80665;
  return {
    valid: true, Af, Hf, Df,
    Wf_ton, totalWeightKN,
    blockMass_kg, machineMass_kg, totalMass_kg,
    massRatio, minMassRatio, massOk,
    deltaH: Hf,
    note: massOk ? 'Mass ratio satisfied for reciprocating service.' : 'Block too light — enlarge block (target ratio >= 5).'
  };
}
