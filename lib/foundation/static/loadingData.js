// ==========================================================================
// STATIC EQUIPMENT (vessel, tank, heat exchanger, generic) — LOADING DATA
// Assemble unfactored P/H/M per load type (D, L, W, E, T) at top of
// footing/pedestal. Pure functions — no DOM access.
//
// Convention (matches shared/combineLoadCombo): loads = { D:{P,H,M}, ... },
// P in kN (down +), H in kN, M in kN·m. Wind/seismic from equipment vendor
// datasheet or ASCE 7 analysis — this module only transfers them to the
// foundation reference point, it does not compute wind/seismic pressures.
// ==========================================================================

// Transfer a lateral load applied at height h (m) above footing top into
// base shear H and overturning moment M = F * h.
export function lateralToBase(F_kN, h_m) {
  return { H: F_kN, M: F_kN * h_m };
}

// Dead load: operating weight (equipment + contents + platforms/ladders)
// applied concentrically unless eccentricity ex given (M = P * ex).
export function staticDeadLoad({ operatingWeight_kN, eccentricity_m = 0 }) {
  const P = Math.max(0, operatingWeight_kN);
  return { P, H: 0, M: P * eccentricity_m };
}

// Live / maintenance load on top of dead load (same point).
export function staticLiveLoad({ liveWeight_kN, eccentricity_m = 0 }) {
  const P = Math.max(0, liveWeight_kN);
  return { P, H: 0, M: P * eccentricity_m };
}

// Wind: vendor/ASCE7 base shear Fw at effective height hw above footing top.
export function staticWindLoad({ Fw_kN, hw_m }) {
  return { P: 0, ...lateralToBase(Fw_kN, hw_m) };
}

// Seismic: vendor/ASCE7 base shear Fe at effective height he above footing top.
export function staticSeismicLoad({ Fe_kN, he_m }) {
  return { P: 0, ...lateralToBase(Fe_kN, he_m) };
}

// Bundle the five load types into the { D, L, W, E, T } map consumed by
// shared/combineLoadCombo. Thermal T is normally zero for static equipment.
export function staticLoadingData({ dead, live = null, wind = null, seismic = null, thermal = null }) {
  const loads = {};
  loads.D = staticDeadLoad(dead);
  if (live) loads.L = staticLiveLoad(live);
  if (wind) loads.W = staticWindLoad(wind);
  if (seismic) loads.E = staticSeismicLoad(seismic);
  if (thermal) loads.T = { P: thermal.P || 0, H: thermal.H || 0, M: thermal.M || 0 };
  return loads;
}
