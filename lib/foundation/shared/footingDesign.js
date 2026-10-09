// ==========================================================================
// SHARED — SHALLOW FOOTING DESIGN ACTIONS FROM THE SOIL PRESSURE
// Factored flexure, one-way shear and punching shear of a spread footing from the soil pressure under a factored (LRFD)
// combination: rigid footing, linear pressure, no tension (biaxialSoilPressure()), minus the factored self-weight of the
// footing and the backfill above it ("net" design pressure). Pure functions, SI units (m, kN, kPa), no DOM.
//
// Frame: origin at the footing centre, x along B, z along L. App sign convention (loadTypeVector()): Mz > 0 compresses the +x
// side, Mx > 0 compresses the −z side, so the resultant of the vertical load sits at xR = Mz/P, zR = −Mx/P.
// Critical sections (ACI 318M-19): flexure at the face of the pedestal (§13.2.7.1), one-way shear at d from that face
// (§13.2.7.2 → §7.4.3.2 / §22.5), punching at d/2 from it (§22.6.4.1). Actions are taken over the full footing width.
// ==========================================================================
import { biaxialSoilPressure } from './stabilityCheck.js';

// Signed pressure plane q(x, z) = max(0, a + b·x + c·z) for the resultant at (xR, zR). biaxialSoilPressure() works with
// |e| (pressure rising toward +x / +z); the signs are put back here. Returns its result plus { a, b, c } signed.
export function signedSoilPressure(B, L, P, xR, zR) {
  const r = biaxialSoilPressure(B, L, P, xR, zR);
  if (!r.valid) return { ...r, valid: false };
  const sx = xR < 0 ? -1 : 1, sz = zR < 0 ? -1 : 1;
  return { ...r, a: r.a, b: sx * r.b, c: sz * r.c, xR, zR, B, L, P };
}

// Exact integrals of the no-tension pressure over the rectangle [x1, x2] × [z1, z2]: the rectangle is clipped to q ≥ 0
// (convex polygon), split into triangles, and the degree-2 integrands q, q·x, q·z are integrated by the edge-midpoint rule
// (exact for degree 2). Returns { F = ∫q dA (kN), Fx = ∫q·x dA, Fz = ∫q·z dA (kN·m), area (m², whole rectangle) }.
export function pressureIntegral(pl, x1, x2, z1, z2) {
  const area = Math.max(x2 - x1, 0) * Math.max(z2 - z1, 0);
  if (!(area > 0)) return { F: 0, Fx: 0, Fz: 0, area: 0 };
  const f = (p) => pl.a + pl.b * p[0] + pl.c * p[1];
  const rect = [[x1, z1], [x2, z1], [x2, z2], [x1, z2]];
  const poly = [];
  for (let i = 0; i < 4; i++) {
    const p = rect[i], q = rect[(i + 1) % 4], fp = f(p), fq = f(q);
    if (fp >= 0) poly.push(p);
    if ((fp >= 0) !== (fq >= 0)) { const t = fp / (fp - fq); poly.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]); }
  }
  let F = 0, Fx = 0, Fz = 0;
  for (let i = 1; i + 1 < poly.length; i++) {
    const p0 = poly[0], p1 = poly[i], p2 = poly[i + 1];
    const At = 0.5 * Math.abs((p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1]));
    for (const [u, v] of [[p0, p1], [p1, p2], [p2, p0]]) {
      const x = (u[0] + v[0]) / 2, z = (u[1] + v[1]) / 2, q = f([x, z]) * At / 3;
      F += q; Fx += q * x; Fz += q * z;
    }
  }
  return { F, Fx, Fz, area };
}

// Net upward force and its moment about the section for the part of the footing beyond a section line.
//   axis 'x': section x = s, part beyond = x > s (sign +1) or x < s (sign −1), full length L;
//   axis 'z': section z = s, likewise in z, full width B.
// w = factored self-weight of footing + backfill per unit area (kPa, downward). Returns { V (kN, + = net upward),
// M (kN·m about the section, + = sagging / bottom tension), Fsoil, Wself, area }.
function netBeyond(pl, w, B, L, axis, s, sign) {
  const lo = axis === 'x' ? -B / 2 : -L / 2, hi = -lo;
  const a = sign > 0 ? Math.max(s, lo) : lo, b = sign > 0 ? hi : Math.min(s, hi);
  if (!(b > a)) return { V: 0, M: 0, Fsoil: 0, Wself: 0, area: 0 };
  const I = axis === 'x' ? pressureIntegral(pl, a, b, -L / 2, L / 2) : pressureIntegral(pl, -B / 2, B / 2, a, b);
  const first = axis === 'x' ? I.Fx : I.Fz;                // ∫q·coord
  const Msoil = sign * (first - s * I.F);                   // ∫q·|coord − s|
  const Wself = w * I.area, armW = sign * ((a + b) / 2 - s);
  return { V: I.F - Wself, M: Msoil - Wself * armW, Fsoil: I.F, Wself, area: I.area };
}

// Flexure at the two pedestal faces about one axis: sections at ref ± half (pedestal centre ± half-size along the axis).
// bottom = largest sagging moment of the two sides (≥ 0), top = largest hogging (≥ 0). kN·m over the full footing width.
export function footingFlexureAxis({ pl, w = 0, B, L, axis, ref, half }) {
  const plus = netBeyond(pl, w, B, L, axis, ref + half, 1), minus = netBeyond(pl, w, B, L, axis, ref - half, -1);
  return { plus: plus.M, minus: minus.M, bottom: Math.max(plus.M, minus.M, 0), top: Math.max(-plus.M, -minus.M, 0),
    sections: { plus: ref + half, minus: ref - half }, parts: { plus, minus } };
}

// One-way shear at d from the pedestal faces about one axis: sections at ref ± (half + d). V = net force beyond the section;
// shear capacity does not depend on the sense, so Vu = the largest |V| of the two sides. A section beyond the footing edge
// gives V = 0.
export function footingOneWayShear({ pl, w = 0, B, L, axis, ref, half, d }) {
  const posP = ref + half + d, posN = ref - half - d;
  const P = netBeyond(pl, w, B, L, axis, posP, 1), N = netBeyond(pl, w, B, L, axis, posN, -1);
  const gov = Math.abs(P.V) >= Math.abs(N.V) ? { side: '+', r: P } : { side: '-', r: N };
  return { valid: true, Vpos: P.V, Vneg: N.V, Vu: Math.abs(gov.r.V), side: gov.side, pos: { plus: posP, minus: posN }, parts: { plus: P, minus: N } };
}

// Punching shear: critical perimeter at d/2 from the pedestal faces, rectangle (c1 + d) × (c2 + d) centred on the pedestal
// (cx, cz), c1 along x, c2 along z (m). Vu = net upward force outside the perimeter = ∫(q − w) over the footing minus the same
// over the perimeter area. Interior only: a perimeter reaching the footing edge is reported invalid (edge / corner geometry
// not implemented).
export function footingPunchingShear({ pl, w = 0, B, L, cx, cz, c1, c2, d }) {
  const hx = c1 / 2 + d / 2, hz = c2 / 2 + d / 2;
  if (cx - hx < -B / 2 - 1e-9 || cx + hx > B / 2 + 1e-9 || cz - hz < -L / 2 - 1e-9 || cz + hz > L / 2 + 1e-9) {
    return { valid: false, hx, hz, note: 'Critical perimeter at d/2 reaches the footing edge — edge / corner punching is not implemented (check one-way shear, or enlarge the footing).' };
  }
  const all = pressureIntegral(pl, -B / 2, B / 2, -L / 2, L / 2), inner = pressureIntegral(pl, cx - hx, cx + hx, cz - hz, cz + hz);
  const Vout = (all.F - inner.F) - w * (all.area - inner.area);
  return { valid: true, Vu: Math.max(Vout, 0), Vout, Fall: all.F, Finside: inner.F, Aout: all.area - inner.area, hx, hz };
}
