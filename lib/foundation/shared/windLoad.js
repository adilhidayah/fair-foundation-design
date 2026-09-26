// ==========================================================================
// SHARED — WIND LOAD (ASCE 7-16 Chapter 29, force method for a rigid "other structure")
// Simplified two-direction (transversal X / longitudinal Z) wind force generator, used by
// any equipment category's Wind Load Generator popup. Pure functions — no DOM access.
// ==========================================================================

export const WIND_EXPOSURE = {
  B: { alpha: 7.0, zg: 365.76 },
  C: { alpha: 9.5, zg: 274.32 },
  D: { alpha: 11.5, zg: 213.36 }
};

// V: basic wind speed (m/s). z: reference height (m, clamped to a 4.6 m minimum per ASCE 7-16 §26.10.1).
// Kzt, Kd: topographic/directionality factors. G: gust effect factor. Cf: force coefficient.
// h: height at which the resultant force acts (m) — used to get the overturning moment from each force.
// Asx, Asz: projected area (m²) in the transversal and longitudinal direction.
export function windForceASCE716({ V, exposure, z, Kzt, Kd, G, Cf, h, Asx, Asz }) {
  const { alpha, zg } = WIND_EXPOSURE[exposure];
  const zEff = Math.max(z, 4.6);
  const Kz = 2.01 * Math.pow(zEff / zg, 2 / alpha);
  const qz = 0.613 * Kz * Kzt * Kd * V * V; // Pa
  const Fx = qz * G * Cf * Asx / 1000; // kN — transversal (X) force
  const Mz = Fx * h; // kN·m — moment about Z from Fx
  const Fz = qz * G * Cf * Asz / 1000; // kN — longitudinal (Z) force
  const Mx = Fz * h; // kN·m — moment about X from Fz
  return { alpha, zg, z: zEff, Kz, qz, Fx, Mz, Fz, Mx };
}
