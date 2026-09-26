// ==========================================================================
// ROTATING EQUIPMENT — VIBRATION CHECK
// Resonance avoidance + amplitude check for rigid-block foundations on
// elastic soil. Pure functions — no DOM access.
//
// Model: single-DOF vertical + rocking (Barkan / ACI 351.3R simplified).
// Soil springs from shared settlement/elastic inputs (kz in kN/m).
// Units SI: f in Hz, m in kg, k in kN/m → convert internally to N/m.
// Rule: operating frequency must stay outside ±20% of natural frequency;
// amplitude must be below vendor/project limit (typ. 0.05–0.2 mm).
// ==========================================================================

// Natural frequency: fn = (1/2π) * sqrt(k/m).
export function naturalFrequency({ stiffness_kNpm, mass_kg }) {
  if (stiffness_kNpm <= 0 || mass_kg <= 0) return { valid: false };
  const k = stiffness_kNpm * 1000; // N/m
  const fn = (1 / (2 * Math.PI)) * Math.sqrt(k / mass_kg);
  return { valid: true, fn_Hz: fn };
}

// Resonance check: require fOp < 0.8*fn OR fOp > 1.2*fn.
export function resonanceCheck({ fOp_Hz, fn_Hz }) {
  if (fOp_Hz <= 0 || fn_Hz <= 0) return { valid: false };
  const ratio = fOp_Hz / fn_Hz;
  const pass = ratio <= 0.8 || ratio >= 1.2;
  return { valid: true, ratio, pass, note: pass ? 'Outside ±20% resonance band.' : 'Inside resonance band — retune mass/stiffness.' };
}

// Steady-state amplitude of undamped-tuned SDOF with damping ratio zeta:
// X = (F0/k) / sqrt((1-r²)² + (2·zeta·r)²), returned in mm.
export function vibrationAmplitude({ F0_kN, stiffness_kNpm, fOp_Hz, fn_Hz, zeta = 0.1, allow_mm = 0.1 }) {
  if (F0_kN < 0 || stiffness_kNpm <= 0 || fn_Hz <= 0) return { valid: false };
  const r = fOp_Hz / fn_Hz;
  const staticDefl_m = (F0_kN * 1000) / (stiffness_kNpm * 1000);
  const denom = Math.sqrt(Math.pow(1 - r * r, 2) + Math.pow(2 * zeta * r, 2));
  const X_mm = denom > 0 ? (staticDefl_m / denom) * 1000 : Infinity;
  const uc = X_mm / allow_mm;
  return { valid: true, X_mm, allow_mm, uc, pass: uc <= 1.0 };
}

// Combined check helper: vertical mode from total mass + vertical spring.
export function rotatingVibrationCheck({ mass_kg, kz_kNpm, F0_kN, fOp_Hz, zeta, allow_mm }) {
  const nat = naturalFrequency({ stiffness_kNpm: kz_kNpm, mass_kg });
  if (!nat.valid) return { valid: false };
  const res = resonanceCheck({ fOp_Hz, fn_Hz: nat.fn_Hz });
  const amp = vibrationAmplitude({ F0_kN, stiffness_kNpm: kz_kNpm, fOp_Hz, fn_Hz: nat.fn_Hz, zeta, allow_mm });
  const governingUC = Math.max(res.pass ? 0 : Infinity, amp.uc);
  return { valid: true, fn_Hz: nat.fn_Hz, resonance: res, amplitude: amp, governingUC, overallPass: res.pass && amp.pass };
}
