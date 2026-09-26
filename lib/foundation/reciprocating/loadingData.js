// ==========================================================================
// RECIPROCATING EQUIPMENT (piston compressor, diesel engine) — LOADING DATA
// Static loads PLUS primary/secondary unbalanced forces and moments from
// vendor datasheets. Pure functions — no DOM access.
//
// Convention: P kN (down +), H kN, M kN·m at top of block. Unbalanced loads
// transfer at crankshaft height hs above block top: H = F, M = F * hs.
// Load type 'Dyn' kept separate so combinations can factor it independently.
// ==========================================================================

export function lateralToBase(F_kN, h_m) {
  return { H: F_kN, M: F_kN * h_m };
}

// Primary (1×rpm) + secondary (2×rpm) unbalanced force envelopes.
// Vendor gives F1, F2 directly; this helper only transfers them to the base.
export function unbalancedToBase({ F1_kN = 0, F2_kN = 0, hs_m = 0 }) {
  const F_env = Math.abs(F1_kN) + Math.abs(F2_kN); // conservative envelope
  return { P: 0, ...lateralToBase(F_env, hs_m), F1_kN, F2_kN, F_env_kN: F_env };
}

// Unbalanced couples (rocking): vendor moment M1/M2 about crankshaft axis.
export function unbalancedMoment({ M1_kNm = 0, M2_kNm = 0 }) {
  return { P: 0, H: 0, M: Math.abs(M1_kNm) + Math.abs(M2_kNm) };
}

export function reciprocatingLoadingData({ dead, live = null, wind = null, seismic = null, dynamic = null, shaftHeight_m = 0 }) {
  const loads = {};
  loads.D = { P: Math.max(0, dead.blockWeight_kN || dead.operatingWeight_kN || 0), H: 0, M: (dead.operatingWeight_kN || 0) * 0 };
  if (live) loads.L = { P: Math.max(0, live.liveWeight_kN), H: 0, M: 0 };
  if (wind) loads.W = { P: 0, ...lateralToBase(wind.Fw_kN, wind.hw_m) };
  if (seismic) loads.E = { P: 0, ...lateralToBase(seismic.Fe_kN, seismic.he_m) };
  if (dynamic) {
    const base = unbalancedToBase({ ...dynamic, hs_m: shaftHeight_m });
    const mom = unbalancedMoment(dynamic);
    loads.Dyn = { P: 0, H: base.H, M: base.M + mom.M };
  }
  return loads;
}
