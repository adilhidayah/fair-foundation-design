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

// Critical section for punching (ACI 318M-19 §22.6.4.1): the rectangle at d/2 from the pedestal faces, (c1 + d) × (c2 + d)
// centred on the pedestal (cx, cz), cut by the footing edges. A side whose distance to the footing edge is less than d/2 lies
// outside the footing and is dropped — the section runs out to the free edge (edge = 3 sides, corner = 2 sides). The location,
// α_s (§22.6.5.3: 40 / 30 / 20), b_o, the centroid of the section and J_c about it in both directions (R8.4.4.2.3: each side a
// face of depth d; sides parallel to the bending direction add d·l³/12 + l·d³/12) follow from the remaining sides. Units m.
// Invalid when the pedestal is not within the footing or two opposite sides are free (the section spans the footing — two-way
// action does not develop, one-way shear governs).
export function footingPunchingSection({ B, L, cx, cz, c1, c2, d }) {
  const eps = 1e-9;
  if (!(B > 0 && L > 0 && c1 > 0 && c2 > 0 && d > 0)) return { valid: false, note: 'B, L, c1, c2 and d must be greater than zero.' };
  if (cx - c1 / 2 < -B / 2 - eps || cx + c1 / 2 > B / 2 + eps || cz - c2 / 2 < -L / 2 - eps || cz + c2 / 2 > L / 2 + eps) {
    return { valid: false, note: 'Pedestal is not within the footing.' };
  }
  const hx = c1 / 2 + d / 2, hz = c2 / 2 + d / 2;
  const free = { xm: cx - hx <= -B / 2 + eps, xp: cx + hx >= B / 2 - eps, zm: cz - hz <= -L / 2 + eps, zp: cz + hz >= L / 2 - eps };
  const X1 = Math.max(cx - hx, -B / 2), X2 = Math.min(cx + hx, B / 2), Z1 = Math.max(cz - hz, -L / 2), Z2 = Math.min(cz + hz, L / 2);
  const rect = { X1, X2, Z1, Z2 };
  if ((free.xm && free.xp) || (free.zm && free.zp)) {
    return { valid: false, free, rect, note: 'Critical section at d/2 spans the footing between two opposite edges — two-way action does not develop; one-way shear governs.' };
  }
  // sides: dir 'z' = parallel to z (at x = const), dir 'x' = parallel to x (at z = const)
  const sides = [];
  if (!free.xm) sides.push({ name: 'x−', dir: 'z', x: X1, z1: Z1, z2: Z2 });
  if (!free.xp) sides.push({ name: 'x+', dir: 'z', x: X2, z1: Z1, z2: Z2 });
  if (!free.zm) sides.push({ name: 'z−', dir: 'x', z: Z1, x1: X1, x2: X2 });
  if (!free.zp) sides.push({ name: 'z+', dir: 'x', z: Z2, x1: X1, x2: X2 });
  sides.forEach(sd => {
    sd.l = sd.dir === 'z' ? sd.z2 - sd.z1 : sd.x2 - sd.x1;
    sd.xm = sd.dir === 'z' ? sd.x : (sd.x1 + sd.x2) / 2; sd.zm = sd.dir === 'x' ? sd.z : (sd.z1 + sd.z2) / 2;
    sd.ends = sd.dir === 'z' ? [[sd.x, sd.z1], [sd.x, sd.z2]] : [[sd.x1, sd.z], [sd.x2, sd.z]];
  });
  const nFree = 4 - sides.length;
  const loc = nFree === 0 ? 'interior' : nFree === 1 ? 'edge' : 'corner';
  const alphaS = { interior: 40, edge: 30, corner: 20 }[loc];
  const bo = sides.reduce((a, sd) => a + sd.l, 0);
  const xbar = sides.reduce((a, sd) => a + sd.l * sd.xm, 0) / bo, zbar = sides.reduce((a, sd) => a + sd.l * sd.zm, 0) / bo;
  // Jz: stress varying along x (moment Mz); Jx: varying along z (moment Mx).
  const Jz = sides.reduce((a, sd) => a + (sd.dir === 'x' ? d * sd.l ** 3 / 12 + sd.l * d ** 3 / 12 : 0) + sd.l * d * (sd.xm - xbar) ** 2, 0);
  const Jx = sides.reduce((a, sd) => a + (sd.dir === 'z' ? d * sd.l ** 3 / 12 + sd.l * d ** 3 / 12 : 0) + sd.l * d * (sd.zm - zbar) ** 2, 0);
  return { valid: true, loc, alphaS, free, rect, sides, bo, d, xbar, zbar, Jz, Jx,
    b1z: X2 - X1, b2z: Z2 - Z1, b1x: Z2 - Z1, b2x: X2 - X1, cx, cz, c1, c2 };
}

// Punching shear V_u: net upward force outside the critical section = ∫(q − w) over the footing minus the same over the
// region enclosed by the section (the clipped rectangle, which reaches the footing edge on the free sides), m / kN.
export function footingPunchingShear({ pl, w = 0, B, L, cx, cz, c1, c2, d }) {
  const sec = footingPunchingSection({ B, L, cx, cz, c1, c2, d });
  if (!sec.valid) return { valid: false, note: sec.note, sec };
  const { X1, X2, Z1, Z2 } = sec.rect;
  const all = pressureIntegral(pl, -B / 2, B / 2, -L / 2, L / 2), inner = pressureIntegral(pl, X1, X2, Z1, Z2);
  const Vout = (all.F - inner.F) - w * (all.area - inner.area);
  return { valid: true, Vu: Math.max(Vout, 0), Vout, Fall: all.F, Finside: inner.F, Aout: all.area - inner.area,
    hx: (X2 - X1) / 2, hz: (Z2 - Z1) / 2, sec };
}

// Combined shear stress on a footingPunchingSection() (ACI 318M-19 §8.4.4.2, eccentric shear stress model, both directions):
//   v = Vu/(bo·d) + γvz·Mz,c·(x − x̄)/Jz − γvx·Mx,c·(z − z̄)/Jx, evaluated at the ends of every side, maximum governs.
// The moments transferred are those at the pedestal centre (xp, zp) moved to the centroid of the critical section
// (R8.4.4.2.3): Mz,c = Mz + Vu·(xp − x̄), Mx,c = Mx − Vu·(zp − z̄) (app convention: a downward load W at x gives Mz = +W·x,
// at z gives Mx = −W·z). For an interior section x̄ = xp, z̄ = zp and the result equals eccentricPunchingStress().
// γf = 1/(1 + (2/3)√(b1/b2)) (§8.4.2.2.2) with b1 = section extent in the bending direction, without the §8.4.2.2.4 increase.
// Units: kN, kN·m, m -> stresses in MPa.
export function footingPunchingStress({ sec, Vu, Mx = 0, Mz = 0 }) {
  const gamma = (b1, b2) => 1 - 1 / (1 + (2 / 3) * Math.sqrt(b1 / b2));
  const Mzc = Mz + Vu * (sec.cx - sec.xbar), Mxc = Mx - Vu * (sec.cz - sec.zbar);
  const gvz = gamma(sec.b1z, sec.b2z), gvx = gamma(sec.b1x, sec.b2x);
  const vDirect = Vu / (sec.bo * sec.d) / 1000;
  let best = null;
  sec.sides.forEach(sd => sd.ends.forEach(([x, z]) => {
    const tz = gvz * Mzc * (x - sec.xbar) / sec.Jz / 1000, tx = -gvx * Mxc * (z - sec.zbar) / sec.Jx / 1000;
    const v = vDirect + tz + tx;
    if (!best || v > best.v) best = { v, x, z, tz, tx };
  }));
  return { valid: true, vDirect, vu: best.v, at: { x: best.x, z: best.z },
    terms: [
      { axis: 'z', M: Mz, Mc: Mzc, b1: sec.b1z, b2: sec.b2z, gv: gvz, J: sec.Jz, c: best.x - sec.xbar, v: best.tz },
      { axis: 'x', M: Mx, Mc: Mxc, b1: sec.b1x, b2: sec.b2x, gv: gvx, J: sec.Jx, c: best.z - sec.zbar, v: best.tx }
    ] };
}

// Two-way shear strength of a footingPunchingSection(): v_c = min of ACI 318M-19 Table 22.6.5.2 (a) 0.33λ√f'c,
// (b) 0.17(1 + 2/β)λ√f'c, (c) 0.083(α_s·d/b_o + 2)λ√f'c (MPa, d and b_o in mm), β = long / short side of the pedestal —
// the same expressions as twoWayShearCheck() (footingCheck.js), with α_s and b_o of the actual section.
export function footingPunchingCapacity({ sec, fc, lambda = 1 }) {
  const sqrtfc = Math.sqrt(fc), dmm = sec.d * 1000, bomm = sec.bo * 1000;
  const beta = Math.max(sec.c1, sec.c2) / Math.min(sec.c1, sec.c2);
  const vc_vals = [
    { label: "(a) 0.33λ√f'c", val: 0.33 * lambda * sqrtfc, clause: 'Table 22.6.5.2' },
    { label: "(b) 0.17(1+2/β)λ√f'c", val: 0.17 * (1 + 2 / beta) * lambda * sqrtfc, clause: 'Table 22.6.5.2' },
    { label: "(c) 0.083(α_s·d/b_o + 2)λ√f'c", val: 0.083 * (sec.alphaS * dmm / bomm + 2) * lambda * sqrtfc, clause: 'Table 22.6.5.2' }
  ];
  const vc_gov = Math.min(...vc_vals.map(v => v.val));
  const phi = 0.75;
  return { beta, sqrtfc, vc_vals, vc_gov, phi, phiVc_stress: phi * vc_gov, Vc: vc_gov * bomm * dmm / 1000, phiVc: phi * vc_gov * bomm * dmm / 1000 }; // Vc, phiVc in kN
}
