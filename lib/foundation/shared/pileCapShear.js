// ==========================================================================
// PILE CAP SHEAR FROM PILE REACTIONS — one-way and punching V_u from the pile forces of a (factored) load combination.
// Pure functions, SI units (m, kN), no DOM. Pile { i, x, y, F }: F = axial force, compression + (pile pushes up on the cap),
// coordinates in the pile-cap frame (origin = cap centre, x along B, y along L), same as pileGroup.js.
//
// Pile reactions near a critical section (ACI 318M-19 Ch.13, shear in footings / pile caps — verify the clause number
// against your edition): a pile whose centre is d_p/2 or more OUTSIDE the section produces its full reaction as shear on
// the section; one whose centre is d_p/2 or more INSIDE produces none; in between the share is linear (d_p = pile
// diameter). "Outside" = on the side away from the pedestal.
//
// Tension (uplift) piles push the cap down, the opposite sense of shear from compression piles, so they are not netted
// against each other: V_u is the larger of (sum of compression shares) and (sum of tension shares) — conservative.
// Unbalanced-moment shear stress (γv·Mu·c/Jc) is NOT included, same limitation as twoWayShearCheck().
// ==========================================================================

import { pointLoadsBeyond, pointShare } from './loadPoints.js';

// Share (0..1) of a pile's reaction that produces shear on a section; s = signed distance (m) of the pile centre outside
// the section (negative = inside), dp = pile diameter (m).
export function pileShearFraction(s, dp) {
  const half = dp / 2;
  if (s >= half) return 1;
  if (s <= -half) return 0;
  return (s + half) / dp;
}

// Larger of the compression-share sum and the tension-share sum.
function sumShares(items) {
  let vc = 0, vt = 0;
  items.forEach(it => { vc += Math.max(it.F, 0) * it.frac; vt += Math.max(-it.F, 0) * it.frac; });
  return { Vc: vc, Vt: vt, V: Math.max(vc, vt) };
}

// One-way shear: sections perpendicular to `axis` ('x' | 'y'), at distance d from each pedestal face.
//   pos+ = center + half + d,  pos- = center - half - d   (center = pedestal centre coordinate along axis,
//   half = pedestal half-size along axis, d = effective depth of the cap, all in m).
// Each side: V = Σ F_i · fraction(s_i), s_i = coord_i − pos+ (outer side +) or pos- − coord_i (outer side −).
// Returns { valid, Vpos, Vneg, Vu, side, pos, perPile } (perPile = the shares on the governing side).
// pointLoads (optional, loadPoints.js): several load points on the cap — the point loads beyond a section are netted against the pile
// reactions beyond it: V = |Σ F·share − Σ P·share|. Without point loads beyond, the result is the unchanged one above.
export function oneWayPileShear({ pileForces, axis, center, half, d, dp, pointLoads = null, capWeight = null }) {
  if (!pileForces || pileForces.length === 0) return { valid: false, note: 'No piles defined.' };
  if (!(d > 0)) return { valid: false, note: 'Effective depth d must be greater than zero.' };
  if (!(dp > 0)) return { valid: false, note: 'Pile diameter must be greater than zero.' };
  const coord = (p) => (axis === 'x' ? p.x : p.y);
  const posP = center + half + d, posN = center - half - d;
  const side = (sign) => {
    const items = pileForces.map(p => {
      const s = sign > 0 ? coord(p) - posP : posN - coord(p);
      return { i: p.i, x: p.x, y: p.y, F: p.F, s, frac: pileShearFraction(s, dp) };
    });
    const r = sumShares(items);
    if (pointLoads && pointLoads.length) {
      let Pb = 0;
      pointLoads.forEach(q => { const w = axis === 'x' ? q.c1 : q.c2; Pb += q.P * pointShare((sign > 0 ? coord(q) - posP : posN - coord(q)), w); });
      if (capWeight) Pb += pointLoadsBeyond([], axis, sign > 0 ? posP : posN, 0, sign, capWeight).V; // cap weight beyond the section
      if (Pb > 0) { const Vnet = Math.abs(items.reduce((s2, it) => s2 + it.F * it.frac, 0) - Pb); return { ...r, V: Vnet, Vc: Math.max(r.Vc - Pb, 0), Vt: r.Vt, items }; }
    }
    return { ...r, items };
  };
  const P = side(1), N = side(-1);
  const gov = P.V >= N.V ? { s: '+', r: P } : { s: '-', r: N };
  return { valid: true, Vpos: P.V, Vneg: N.V, Vu: gov.r.V, side: gov.s, pos: { plus: posP, minus: posN },
    perPile: gov.r.items, Vc: gov.r.Vc, Vt: gov.r.Vt };
}

// Signed distance (m) from a point to the outside of a rectangle centred (cx, cy) with half-sizes (hx, hy):
// positive outside (Euclidean, so a pile diagonal to a corner counts by its true distance), negative inside.
export function signedDistanceToRect(x, y, cx, cy, hx, hy) {
  const dx = Math.abs(x - cx) - hx, dy = Math.abs(y - cy) - hy;
  if (dx > 0 || dy > 0) return Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  return Math.max(dx, dy);
}

// Punching shear: critical perimeter at d/2 from the pedestal faces — rectangle (c1 + d) x (c2 + d) centred on the
// pedestal (c1 along x, c2 along y, all in m). V_u = the pile reactions outside that perimeter (shares by the same
// d_p/2 interpolation) = P_u minus the reactions inside it. Returns { valid, Vu, Vc, Vt, hx, hy, perPile }.
// Pcol (optional): the load of this point, so that V_u = P_col − Σ F inside the perimeter (several load points on the cap; for one
// point P_col is the whole load and the result equals the outside sum above, up to the cap weight share the caller adds).
export function punchingPileShear({ pileForces, cx, cy, c1, c2, d, dp, Pcol = null }) {
  if (!pileForces || pileForces.length === 0) return { valid: false, note: 'No piles defined.' };
  if (!(d > 0)) return { valid: false, note: 'Effective depth d must be greater than zero.' };
  if (!(dp > 0)) return { valid: false, note: 'Pile diameter must be greater than zero.' };
  const hx = c1 / 2 + d / 2, hy = c2 / 2 + d / 2;
  const items = pileForces.map(p => {
    const s = signedDistanceToRect(p.x, p.y, cx, cy, hx, hy);
    return { i: p.i, x: p.x, y: p.y, F: p.F, s, frac: pileShearFraction(s, dp) };
  });
  const r = sumShares(items);
  if (Pcol !== null && Pcol !== undefined) {
    const inside = items.reduce((s, it) => s + it.F * (1 - it.frac), 0);
    return { valid: true, Vu: Math.max(Pcol - inside, 0), Vc: r.Vc, Vt: r.Vt, hx, hy, perPile: items, Pcol, inside };
  }
  return { valid: true, Vu: r.V, Vc: r.Vc, Vt: r.Vt, hx, hy, perPile: items };
}
