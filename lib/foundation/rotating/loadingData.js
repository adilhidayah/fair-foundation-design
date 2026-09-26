// ==========================================================================
// ROTATING EQUIPMENT (pump, centrifugal compressor, turbine, motor) — LOADING DATA
// Static loads (same convention as static/loadingData.js) PLUS harmonic
// dynamic forces from vendor datasheets. Pure functions — no DOM access.
//
// Dynamic forces are reported per axis at the shaft centerline height hs
// above footing top; they transfer as H_dyn = F0 and M_dyn = F0 * hs.
// Fatigue-relevant cyclic component is flagged via loadTypeCode 'Dyn' so the
// project load-combination table can factor it separately.
// ==========================================================================

export function lateralToBase(F_kN, h_m) {
  return { H: F_kN, M: F_kN * h_m };
}

export function rotatingDeadLoad({ skidWeight_kN, eccentricity_m = 0 }) {
  const P = Math.max(0, skidWeight_kN);
  return { P, H: 0, M: P * eccentricity_m };
}

// Residual unbalance force from vendor: F0 = m * e * omega^2 (kN), or given directly.
// Direction loops over operating cases; caller stores the envelope.
export function unbalanceForce({ mass_kg = 0, ecc_mm = 0, rpm = 0, F0_kN = null }) {
  if (F0_kN !== null) return { F0_kN };
  const omega = (2 * Math.PI * rpm) / 60;
  const F0_N = mass_kg * (ecc_mm / 1000) * omega * omega;
  return { F0_kN: F0_N / 1000 };
}

export function rotatingLoadingData({ dead, live = null, wind = null, seismic = null, dynamic = null, shaftHeight_m = 0 }) {
  const loads = {};
  loads.D = rotatingDeadLoad(dead);
  if (live) loads.L = { P: Math.max(0, live.liveWeight_kN), H: 0, M: 0 };
  if (wind) loads.W = { P: 0, ...lateralToBase(wind.Fw_kN, wind.hw_m) };
  if (seismic) loads.E = { P: 0, ...lateralToBase(seismic.Fe_kN, seismic.he_m) };
  if (dynamic) {
    const { F0_kN } = unbalanceForce(dynamic);
    loads.Dyn = { P: 0, ...lateralToBase(F0_kN, shaftHeight_m) };
  }
  return loads;
}
