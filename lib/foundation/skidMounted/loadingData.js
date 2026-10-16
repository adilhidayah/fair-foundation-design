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

// Vendor reactions per skid support (base plate / runner / anchor-bolt group) -> the equipment loads of Section 03 and the load
// points of Tab 02 (several load points, lib/foundation/shared/loadPoints.js). Pure, kN / m.
// supports: [{ x, z, c1, c2, PE, PO, PT }] — centre from the footing / pile cap centre (x along B, z along L), footprint c1 × c2,
// vertical reaction (down +) per condition: empty E(E), operating E(O), test E(T) — each the total weight of the equipment in
// that condition, as the datasheet E(E) / E(O) / E(T) fields.
// Returns { EE, EO, ET } = Σ P per condition, points [{ x, y, c1, c2, share }] with share = the support reaction of the basis
// condition (operating; empty, then test when the operating column is all zero; equal shares when every column is zero), and
// per condition the reaction centroid (x̄ = ΣP·x / ΣP) and its distance `shift` from the basis centroid: the load-point model
// shares every load type by ONE set of shares, so a condition whose reactions are distributed differently is placed at the basis
// centroid — `shift` is that error in position (moment error = ΣP·shift). issues: negative reactions (uplift supports: share 0,
// the uplift is not modelled) and a missing basis.
export function skidSupportLoads(supports) {
  const list = (supports || []).filter(s => s && Number.isFinite(s.x) && Number.isFinite(s.z));
  const issues = [];
  if (!list.length) return { valid: false, EE: 0, EO: 0, ET: 0, points: [], issues: ['No supports.'] };
  const sum = (k) => list.reduce((a, s) => a + (Number(s[k]) || 0), 0);
  const EE = sum('PE'), EO = sum('PO'), ET = sum('PT');
  const centroid = (k) => {
    const P = sum(k);
    return P > 0 ? { x: list.reduce((a, s) => a + (Number(s[k]) || 0) * s.x, 0) / P, z: list.reduce((a, s) => a + (Number(s[k]) || 0) * s.z, 0) / P, P } : null;
  };
  const basis = EO > 0 ? 'PO' : EE > 0 ? 'PE' : ET > 0 ? 'PT' : null;
  if (!basis) issues.push('Every reaction is zero — equal shares used.');
  else if (basis !== 'PO') issues.push(`No operating reactions — shares from the ${basis === 'PE' ? 'empty' : 'test'} reactions.`);
  list.forEach((s, i) => { ['PE', 'PO', 'PT'].forEach(k => { if ((Number(s[k]) || 0) < 0) issues.push(`Support ${i + 1}: ${k === 'PE' ? 'empty' : k === 'PO' ? 'operating' : 'test'} reaction ${Number(s[k]).toFixed(2)} kN < 0 (uplift) — not modelled, share 0.`); }); });
  const points = list.map(s => ({ x: s.x, y: s.z, c1: s.c1 > 0 ? s.c1 : 0, c2: s.c2 > 0 ? s.c2 : 0,
    share: basis ? Math.max(Number(s[basis]) || 0, 0) : 1 }));
  const cB = basis ? centroid(basis) : null;
  const cond = {};
  [['E', 'PE'], ['O', 'PO'], ['T', 'PT']].forEach(([c, k]) => {
    const g = centroid(k);
    cond[c] = g ? { ...g, shift: cB ? Math.hypot(g.x - cB.x, g.z - cB.z) : 0 } : null;
  });
  return { valid: true, EE, EO, ET, points, basis: basis ? basis.slice(1) : null, centroid: cB, cond, issues };
}
