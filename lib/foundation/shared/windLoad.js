// ==========================================================================
// SHARED — WIND LOAD (ASCE 7-22 Chapter 29, force method for a rigid "other structure")
// Simplified two-direction (transversal X / longitudinal Z) wind force generator, used by
// any equipment category's Wind Load Generator popup. Pure functions — no DOM access.
// ==========================================================================

const FT = 0.3048; // m per ft — Table 26.11-1 is tabulated in ft

// ASCE 7-22 Table 26.11-1 terrain exposure constants (alpha, zg and zmin converted ft -> m).
export const WIND_EXPOSURE = {
  B: { alpha: 7.5, zg: 3280 * FT, zmin: 30 * FT },
  C: { alpha: 9.8, zg: 2460 * FT, zmin: 15 * FT },
  D: { alpha: 11.5, zg: 1935 * FT, zmin: 7 * FT }
};

// ASCE 7-22 Table 26.9-1 note: Ke = e^(-0.000119·ze), ze = ground elevation above sea level (m). Ke = 1.0 is permitted.
export function groundElevationFactor(ze) {
  return Math.exp(-0.000119 * Math.max(ze, 0));
}

// V: basic wind speed (m/s). z: reference height (m, raised to zmin of the exposure per Table 26.10-1 note).
// Kzt, Kd, Ke: topographic, directionality and ground elevation factors (Ke defaults to 1.0).
// G: gust effect factor. Cf: force coefficient.
// h: height at which the resultant force acts (m) — used to get the overturning moment from each force.
// Asx, Asz: projected area (m²) in the transversal and longitudinal direction.
// ASCE 7-22 moved Kd out of qz (Eq. 26.10-1) into the force equation (Eq. 29.4-1): F = qz·Kd·G·Cf·Af.
export function windForceASCE722({ V, exposure, z, Kzt, Kd, Ke = 1.0, G, Cf, h, Asx, Asz }) {
  const { alpha, zg, zmin } = WIND_EXPOSURE[exposure];
  const zEff = Math.max(z, zmin);
  const Kz = 2.41 * Math.pow(zEff / zg, 2 / alpha);
  const qz = 0.613 * Kz * Kzt * Ke * V * V; // Pa
  const Fx = qz * Kd * G * Cf * Asx / 1000; // kN — transversal (X) force
  const Mz = Fx * h; // kN·m — moment about Z from Fx
  const Fz = qz * Kd * G * Cf * Asz / 1000; // kN — longitudinal (Z) force
  const Mx = Fz * h; // kN·m — moment about X from Fz
  return { alpha, zg, zmin, z: zEff, Kz, qz, Fx, Mz, Fz, Mx };
}
