// ==========================================================================
// SHARED — SEISMIC LOAD (ASCE 7-22 equivalent lateral force, rigid non-building structure/equipment)
// Site coefficients, design spectral accelerations, and the seismic response coefficient C_s (with its
// min/max clamps) — used by any equipment category's Seismic Load Generator popup, and by the "A.3.2 Loading
// Combination" report (which only needs S_DS, without running the full generator). Pure functions — no DOM
// access, no formatting-library dependency.
// ==========================================================================

export const FA_TABLE = {
  A: [0.8, 0.8, 0.8, 0.8, 0.8],
  B: [0.9, 0.9, 0.9, 0.9, 0.9],
  C: [1.3, 1.3, 1.2, 1.2, 1.2],
  D: [1.6, 1.4, 1.2, 1.1, 1.0],
  E: [2.4, 1.7, 1.3, 1.1, 0.9]
};
export const FV_TABLE = {
  A: [0.8, 0.8, 0.8, 0.8, 0.8],
  B: [0.8, 0.8, 0.8, 0.8, 0.8],
  C: [1.5, 1.5, 1.5, 1.5, 1.5],
  D: [2.4, 2.2, 2.0, 1.9, 1.8],
  E: [4.2, 3.3, 2.8, 2.4, 2.2]
};
export const SS_BREAKPOINTS = [0.25, 0.5, 0.75, 1.0, 1.25];
export const S1_BREAKPOINTS = [0.1, 0.2, 0.3, 0.4, 0.5];

// Piecewise-linear interpolation/extrapolation-clamp over an ascending breakpoints array — used here for the
// ASCE 7 site coefficient tables (Fa/Fv), not a general-purpose utility beyond that.
function interpLinear(x, breakpoints, values) {
  if (x <= breakpoints[0]) return values[0];
  if (x >= breakpoints[breakpoints.length - 1]) return values[values.length - 1];
  for (let i = 0; i < breakpoints.length - 1; i++) {
    if (x >= breakpoints[i] && x <= breakpoints[i + 1]) {
      const t = (x - breakpoints[i]) / (breakpoints[i + 1] - breakpoints[i]);
      return values[i] + t * (values[i + 1] - values[i]);
    }
  }
  return values[values.length - 1];
}

// mode 'compute': derives S_DS/S_D1 from S_S, S_1 and site class (Fa/Fv tables, Tables 11.4-1/11.4-2).
// mode 'direct': passes SDSDirect/SD1Direct straight through (already known from a site-specific study).
export function designSpectralAccel({ mode, Ss, S1, site, SDSDirect, SD1Direct }) {
  if (mode === 'compute') {
    const Fa = interpLinear(Ss, SS_BREAKPOINTS, FA_TABLE[site]);
    const Fv = interpLinear(S1, S1_BREAKPOINTS, FV_TABLE[site]);
    const SMS = Fa * Ss, SM1 = Fv * S1;
    return { Fa, Fv, SMS, SM1, SDS: (2 / 3) * SMS, SD1: (2 / 3) * SM1 };
  }
  return { Fa: null, Fv: null, SMS: null, SM1: null, SDS: SDSDirect, SD1: SD1Direct };
}

// Ta = Ct·hn^x (approximate fundamental period); Cs clamped between Cs,min and Cs,max per ASCE 7-22 §12.8.1.1,
// including the S1≥0.6g alternate minimum (§12.8.1.1, mode==='compute' only — that alternate needs the actual
// S1, not just SDS, so it doesn't apply when SDS/SD1 were entered directly). Returns which branch governed
// (csMinBasis, csGovernedBy) as plain flags rather than pre-built HTML note text, same convention as the rest
// of this shared lib (pure data — the caller decides how to phrase it for display).
export function seismicResponseCoefficient({ SDS, SD1, R, Ie, hn, Ct, xExp, TL, S1 = 0, mode }) {
  const Ta = Ct * Math.pow(hn, xExp);
  const Ts = SDS > 0 ? SD1 / SDS : 0;
  const CsInit = SDS / (R / Ie);
  const CsMax = Ta <= TL ? SDS / (Ta * (R / Ie)) : (SDS * TL) / (Ta * Ta * (R / Ie));
  let CsMin = Math.max(0.044 * SDS * Ie, 0.01);
  let csMinBasis = 'default';
  if (mode === 'compute' && S1 >= 0.6) {
    const CsMin2 = 0.5 * S1 / (R / Ie);
    if (CsMin2 > CsMin) { CsMin = CsMin2; csMinBasis = 'S1'; }
  }
  let Cs = CsInit, csGovernedBy = 'init';
  if (Cs > CsMax) { Cs = CsMax; csGovernedBy = 'max'; }
  else if (Cs < CsMin) { Cs = CsMin; csGovernedBy = 'min'; }
  return { Ta, Ts, CsInit, CsMax, CsMin, csMinBasis, Cs, csGovernedBy };
}
