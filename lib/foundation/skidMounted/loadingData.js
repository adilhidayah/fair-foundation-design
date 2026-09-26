// ==========================================================================
// SKID-MOUNTED PACKAGE UNIT — LOADING DATA
// Concentrated anchor-bolt reactions from the skid vendor: per-bolt P/H
// plus skid self-weight. Pure functions — no DOM access.
//
// Vendor gives per-support reactions (Pi, Hi) at bolt coordinates; this
// module sums them to footing-top resultants and keeps the per-bolt map for
// shared/evaluateAnchorCombo. Thermal/skid-growth thrusts pass through as
// an extra lateral at skid base height.
// ==========================================================================

export function sumBoltReactions({ bolts = [] }) {
  // bolts: [{ x, y, P_kN, Hx_kN, Hy_kN }]
  const P = bolts.reduce((s, b) => s + (b.P_kN || 0), 0);
  const Hx = bolts.reduce((s, b) => s + (b.Hx_kN || 0), 0);
  const Hy = bolts.reduce((s, b) => s + (b.Hy_kN || 0), 0);
  // Moment about footing-top centroid from eccentric bolt plan positions:
  const n = Math.max(1, bolts.length);
  const xbar = bolts.reduce((s, b) => s + b.x, 0) / n;
  const Mx = bolts.reduce((s, b) => s + (b.P_kN || 0) * (b.x - xbar), 0);
  return { P, Hx, Hy, Mx };
}

export function skidLoadingData({ bolts, skidWeight_kN = 0, thermalThrust_kN = 0, thrustHeight_m = 0, wind = null, seismic = null }) {
  const sum = sumBoltReactions({ bolts });
  const P = sum.P + Math.max(0, skidWeight_kN);
  const H = Math.hypot(sum.Hx, sum.Hy) + Math.abs(thermalThrust_kN);
  const M = Math.abs(sum.Mx) + Math.abs(thermalThrust_kN) * thrustHeight_m;
  const loads = { D: { P, H: 0, M: 0 } };
  loads.Skid = { P: 0, H, M }; // factored with L-type factors by project combos
  if (wind) loads.W = { P: 0, H: wind.Fw_kN, M: wind.Fw_kN * wind.hw_m };
  if (seismic) loads.E = { P: 0, H: seismic.Fe_kN, M: seismic.Fe_kN * seismic.he_m };
  return { loads, boltSum: sum };
}
