// ==========================================================================
// PIPE RACK — LOADING DATA (per pier / per bent)
// Vertical pipe weights + thermal/friction + wind on pipes/structure +
// seismic. Pure functions — no DOM access.
//
// Convention per pier: P kN (down +), HL longitudinal, HT transversal (kN),
// ML/MT kN·m at top of pier footing. Thermal anchor/friction loads come from
// pipe stress analysis — this module transfers them, it does not compute
// pipe thermal expansion itself.
// ==========================================================================

export function pipeVerticalLoad({ pipeWeights_kN = [], eccentricity_m = 0 }) {
  const P = pipeWeights_kN.reduce((s, w) => s + w, 0);
  return { P: Math.max(0, P), M: P * eccentricity_m };
}

// Friction/sliding force at support: F = mu * W per pipe, summed.
export function frictionLoad({ pipeWeights_kN = [], mu = 0.3, height_m = 0 }) {
  const F = pipeWeights_kN.reduce((s, w) => s + mu * w, 0);
  return { H: F, M: F * height_m };
}

// Anchor/guide thrust from pipe stress: given force at pipe elevation hp.
export function anchorThrust({ F_kN, hp_m }) {
  return { H: F_kN, M: F_kN * hp_m };
}

// Wind on exposed pipes + structure tributary to this pier at height hw.
export function rackWindLoad({ Fw_kN, hw_m }) {
  return { H: Fw_kN, M: Fw_kN * hw_m };
}

// Bundle into per-direction load maps consumed by shared/combineLoadCombo.
// Longitudinal (L-dir) and transversal (T-dir) kept as separate H/M pairs
// because stability is checked independently in each direction.
export function piperackLoadingData({ vertical, frictionL = null, anchorL = null, anchorT = null, windL = null, windT = null, seismicL = null, seismicT = null, live_kN = 0 }) {
  const v = pipeVerticalLoad(vertical);
  const loads = { D: { P: v.P, H: 0, M: 0 } };
  if (live_kN) loads.L = { P: live_kN, H: 0, M: 0 };
  const dirL = { therm: [], wind: null, seismic: null };
  const dirT = { therm: [], wind: null, seismic: null };
  if (frictionL) dirL.therm.push(frictionLoad(frictionL));
  if (anchorL) dirL.therm.push(anchorThrust(anchorL));
  if (anchorT) dirT.therm.push(anchorThrust(anchorT));
  if (windL) dirL.wind = rackWindLoad(windL);
  if (windT) dirT.wind = rackWindLoad(windT);
  if (seismicL) dirL.seismic = rackWindLoad(seismicL);
  if (seismicT) dirT.seismic = rackWindLoad(seismicT);
  const sumHM = (arr) => arr.reduce((s, x) => ({ H: s.H + x.H, M: s.M + x.M }), { H: 0, M: 0 });
  const tL = sumHM(dirL.therm);
  const tT = sumHM(dirT.therm);
  // 'T' load type here = thermal/friction (matches ASCE 7 T).
  loads.T = { P: 0, H: Math.max(Math.abs(tL.H), Math.abs(tT.H)), M: Math.max(Math.abs(tL.M), Math.abs(tT.M)) };
  return { loads, dirL, dirT };
}
