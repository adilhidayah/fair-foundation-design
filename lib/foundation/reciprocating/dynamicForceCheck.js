// ==========================================================================
// RECIPROCATING EQUIPMENT — DYNAMIC FORCE CHECK
// Verifies massive block foundation against unbalanced forces: resonance
// avoidance at 1x and 2x rpm + amplitude + minimum mass ratio.
// Pure functions — no DOM access. Units SI (Hz, kg, kN/m, kN, mm).
// Reference practice: ACI 351.3R, vendor allowable amplitudes.
// ==========================================================================

export function naturalFrequency({ stiffness_kNpm, mass_kg }) {
  if (stiffness_kNpm <= 0 || mass_kg <= 0) return { valid: false };
  const fn = (1 / (2 * Math.PI)) * Math.sqrt((stiffness_kNpm * 1000) / mass_kg);
  return { valid: true, fn_Hz: fn };
}

// Both 1x rpm and 2x rpm excitations must stay outside +/-20% of fn.
export function resonanceCheckTwoOrders({ f1_Hz, f2_Hz, fn_Hz }) {
  if (f1_Hz <= 0 || f2_Hz <= 0 || fn_Hz <= 0) return { valid: false };
  const r1 = f1_Hz / fn_Hz;
  const r2 = f2_Hz / fn_Hz;
  const pass1 = r1 <= 0.8 || r1 >= 1.2;
  const pass2 = r2 <= 0.8 || r2 >= 1.2;
  return { valid: true, r1, r2, pass1, pass2, pass: pass1 && pass2 };
}

// Steady-state amplitude per excitation order, SDOF with damping zeta.
export function amplitudeAt({ F0_kN, stiffness_kNpm, fOp_Hz, fn_Hz, zeta = 0.1 }) {
  if (stiffness_kNpm <= 0 || fn_Hz <= 0) return { valid: false };
  const r = fOp_Hz / fn_Hz;
  const staticDefl_m = (Math.abs(F0_kN) * 1000) / (stiffness_kNpm * 1000);
  const denom = Math.sqrt(Math.pow(1 - r * r, 2) + Math.pow(2 * zeta * r, 2));
  const X_mm = denom > 0 ? (staticDefl_m / denom) * 1000 : Infinity;
  return { valid: true, X_mm, r };
}

// Combined: mass ratio >= 5, resonance at both orders, summed amplitude <= allow.
export function reciprocatingDynamicCheck({ blockMass_kg, machineMass_kg, kz_kNpm, F1_kN, F2_kN, rpm, zeta = 0.1, allow_mm = 0.2, minMassRatio = 5 }) {
  const massRatio = machineMass_kg > 0 ? blockMass_kg / machineMass_kg : Infinity;
  const massOk = massRatio >= minMassRatio;
  const totalMass_kg = blockMass_kg + Math.max(0, machineMass_kg);
  const nat = naturalFrequency({ stiffness_kNpm: kz_kNpm, mass_kg: totalMass_kg });
  if (!nat.valid) return { valid: false };
  const f1_Hz = rpm / 60;
  const f2_Hz = 2 * f1_Hz;
  const res = resonanceCheckTwoOrders({ f1_Hz, f2_Hz, fn_Hz: nat.fn_Hz });
  const a1 = amplitudeAt({ F0_kN: F1_kN, stiffness_kNpm: kz_kNpm, fOp_Hz: f1_Hz, fn_Hz: nat.fn_Hz, zeta });
  const a2 = amplitudeAt({ F0_kN: F2_kN, stiffness_kNpm: kz_kNpm, fOp_Hz: f2_Hz, fn_Hz: nat.fn_Hz, zeta });
  const Xtotal_mm = a1.X_mm + a2.X_mm;
  const ucAmp = Xtotal_mm / allow_mm;
  const ampPass = ucAmp <= 1.0;
  const governingUC = Math.max(massOk ? 0 : Infinity, res.pass ? 0 : Infinity, ucAmp);
  return {
    valid: true, fn_Hz: nat.fn_Hz, f1_Hz, f2_Hz,
    massRatio, minMassRatio, massOk,
    resonance: res, a1, a2, Xtotal_mm, allow_mm, ucAmp, ampPass,
    governingUC, overallPass: massOk && res.pass && ampPass
  };
}

