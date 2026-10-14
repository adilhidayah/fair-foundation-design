// ==========================================================================
// SHARED — SPREAD FOOTING ACTIONS FROM THE SOIL PRESSURE (shallow foundation)
// Contact pressure under a rigid rectangular footing for P and biaxial moments (no tension: partial contact is solved), and the
// factored actions that follow from it at the pedestal: flexure at the pedestal faces (ACI 318M-19 §13.2.7.1), one-way shear at d
// from the face (§22.5) and the shear force inside the punching perimeter at d/2 (§22.6). Pure functions — no DOM access.
//
// Axes: x along B (footing width), z along L, origin at the footing centre. Sign convention of the load vectors (loadTypeVector(),
// pileGroup.js): Mz > 0 puts compression on the +x side, Mx > 0 puts compression on the −z side. Moments are about the footing
// centre: for a pedestal at (cx, cz) the caller adds the offset of the column load, Mz,c = Mz + P_col·cx, Mx,c = Mx − P_col·cz.
// Units: kN, kN·m, m, kPa.
//
// Net pressure for design: q_net = q_contact − w, w = the factored uniform weight of footing + backfill (kPa) — it is part of P
// (P is the total at the underside) but is carried by the footing itself, so it does not load the cantilevers. The pedestal weight
// belongs to the column load (it acts at the pedestal), not to w. w = 0 gives the pressure of the column loads only.
// All areas / moments are integrated exactly over polygons (clipped to q ≥ 0), not on a grid.
// ==========================================================================

function rectPoly(x0, x1, z0, z1) { return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; }
// Keeps the part of a convex polygon where A·x + Bc·z + C ≥ 0 (Sutherland–Hodgman).
function clip(poly, A, Bc, C) {
  const out = [], n = poly.length;
  for (let i = 0; i < n; i++) {
    const p = poly[i], q = poly[(i + 1) % n];
    const fp = A * p[0] + Bc * p[1] + C, fq = A * q[0] + Bc * q[1] + C;
    if (fp >= 0) out.push(p);
    if ((fp >= 0) !== (fq >= 0)) { const t = fp / (fp - fq); out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]); }
  }
  return out;
}
// ∫ f dA over a convex polygon for f of degree ≤ 2 (fan triangulation, edge-midpoint rule — exact for quadratics).
function integrate(poly, f) {
  if (poly.length < 3) return 0;
  let s = 0;
  const p0 = poly[0];
  for (let i = 1; i < poly.length - 1; i++) {
    const p1 = poly[i], p2 = poly[i + 1];
    const area = 0.5 * Math.abs((p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1]));
    if (area <= 0) continue;
    const m = (a, b) => f((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    s += area / 3 * (m(p0, p1) + m(p1, p2) + m(p2, p0));
  }
  return s;
}
const polyArea = (poly) => integrate(poly, () => 1);

function solve3(J, r) { // J·d = r (Cramer)
  const det = J[0][0] * (J[1][1] * J[2][2] - J[1][2] * J[2][1]) - J[0][1] * (J[1][0] * J[2][2] - J[1][2] * J[2][0]) + J[0][2] * (J[1][0] * J[2][1] - J[1][1] * J[2][0]);
  if (!(Math.abs(det) > 1e-300)) return null;
  const col = (k) => J.map((row, i) => row.map((v, j) => (j === k ? r[i] : v)));
  const d3 = (M) => M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
  return [d3(col(0)) / det, d3(col(1)) / det, d3(col(2)) / det];
}

// Damped Newton on the plane q = u0 + u1·x + u2·z (clipped at 0): the contact integrals must equal P, P·ex, P·ez. The exact
// Jacobian is the second-moment matrix of the contact polygon (the boundary term vanishes where q = 0).
function newtonPlane(rect, P, ex, ez, u) {
  const state = (v) => {
    const poly = clip(rect, v[1], v[2], v[0]);
    const I = (f) => integrate(poly, f);
    const A0 = I(() => 1), Ax = I((x) => x), Az = I((x, z) => z), Axx = I((x) => x * x), Axz = I((x, z) => x * z), Azz = I((x, z) => z * z);
    return { A0, J: [[A0, Ax, Az], [Ax, Axx, Axz], [Az, Axz, Azz]],
      res: [v[0] * A0 + v[1] * Ax + v[2] * Az - P, v[0] * Ax + v[1] * Axx + v[2] * Axz - P * ex, v[0] * Az + v[1] * Axz + v[2] * Azz - P * ez] };
  };
  const norm = (r) => Math.hypot(r[0], r[1] / Math.max(1e-9, 1), r[2]);
  let s = state(u), nrm = norm(s.res);
  for (let it = 0; it < 200 && nrm > 1e-10 * P; it++) {
    const step = solve3(s.J, s.res);
    if (!step) return null;
    let t = 1, ok = false;
    for (let k = 0; k < 40; k++, t /= 2) {
      const v = [u[0] - t * step[0], u[1] - t * step[1], u[2] - t * step[2]];
      const sv = state(v);
      if (sv.A0 > 0 && norm(sv.res) < nrm) { u = v; s = sv; nrm = norm(sv.res); ok = true; break; }
    }
    if (!ok) return null;
  }
  return nrm <= 1e-8 * P ? u : null;
}

// Contact pressure plane q = q0 + a·x + c·z for P (kN, down +, TOTAL load at the underside) and the moments Mx, Mz (kN·m) about the
// footing centre (signs as above). Returns { valid, note, plane: { q0, a, c }, ex, ez (magnitudes, m), qmax, qmin, contactArea,
// contactFraction, fullContact }.
export function soilPressure({ B, L, P, Mx = 0, Mz = 0 }) {
  if (!(B > 0 && L > 0)) return { valid: false, note: 'B and L must be greater than zero.' };
  if (!(P > 0)) return { valid: false, note: 'Net uplift (P ≤ 0) — no contact pressure can balance the load.' };
  const ex = Math.abs(Mz) / P, ez = Math.abs(Mx) / P;
  if (ex >= B / 2 || ez >= L / 2) return { valid: false, note: `Resultant outside the footing (e_x = ${ex.toFixed(3)} m vs B/2 = ${(B / 2).toFixed(3)} m, e_z = ${ez.toFixed(3)} m vs L/2 = ${(L / 2).toFixed(3)} m).`, ex, ez };
  const A = B * L;
  const q0 = P / A, a = 12 * P * ex / (L * B ** 3), c = 12 * P * ez / (B * L ** 3);
  const rect = rectPoly(-B / 2, B / 2, -L / 2, L / 2);
  let plane = null;
  if (q0 - a * B / 2 - c * L / 2 >= -1e-9 * q0) plane = { q0, a, c };
  else {
    let u = newtonPlane(rect, P, ex, ez, [q0, a, c]);
    if (!u) { // continuation from a small eccentricity
      let w = [q0, 0, 0], good = true;
      for (let k = 1; k <= 40 && good; k++) { const sc = k / 40; const g = [q0, a * sc, c * sc]; const nx = newtonPlane(rect, P, ex * sc, ez * sc, q0 - g[1] * B / 2 - g[2] * L / 2 >= 0 ? g : w); if (nx) w = nx; else good = false; }
      u = good ? w : null;
    }
    if (u) plane = { q0: u[0], a: u[1], c: u[2] };
  }
  if (plane) { plane = { q0: plane.q0, a: (Mz >= 0 ? 1 : -1) * plane.a, c: (Mx > 0 ? -1 : 1) * plane.c }; } // sign convention above
  if (!plane) return { valid: false, note: `Contact pressure did not converge (resultant very close to the footing edge: e_x = ${ex.toFixed(3)} m, e_z = ${ez.toFixed(3)} m).`, ex, ez };
  const corners = [[-B / 2, -L / 2], [B / 2, -L / 2], [B / 2, L / 2], [-B / 2, L / 2]].map(([x, z]) => plane.q0 + plane.a * x + plane.c * z);
  const contactArea = polyArea(clip(rect, plane.a, plane.c, plane.q0));
  return { valid: true, note: '', plane, ex, ez, qmax: Math.max(...corners), qmin: Math.max(0, Math.min(...corners)), contactArea, contactFraction: contactArea / A, fullContact: Math.min(...corners) >= -1e-9 * q0 };
}

// Factored actions of the net pressure at the pedestal (column c1 × c2 centred at (cx, cz) from the footing centre).
//   Flexure : sections at the pedestal faces, per axis the two sides: M = ∫ q_net·arm over the cantilever beyond the face
//             (kN·m over the full footing width); bottom = max(0, M+, M−) (sagging, bottom steel), top = max(0, −M+, −M−).
//   Shear   : one-way sections at d from the face (dx for x sections, dz for z sections): V = ∫ q_net beyond the section
//             (net upward +); Vu = max |V| of the two sides (kN, whole width).
//   Punching: Vu = (total net upward force = P − w·B·L) − ∫ q_net inside the perimeter (c1 + dPunch) × (c2 + dPunch) (kN).
export function footingActions({ B, L, plane, w = 0, ped, dx, dz, dPunch }) {
  const { q0, a, c } = plane;
  const { cx = 0, cz = 0, c1, c2 } = ped;
  const rect = rectPoly(-B / 2, B / 2, -L / 2, L / 2);
  const contact = clip(rect, a, c, q0);
  const regionAxis = (axis, sign, pos) => (axis === 'x' ? clip(rect, sign, 0, -sign * pos) : clip(rect, 0, sign, -sign * pos));
  const arm = (axis, sign, pos) => (axis === 'x' ? (x) => sign * (x - pos) : (x, z) => sign * (z - pos));
  const net = (region, f) => { // ∫ f·q_net over region (region already clipped to the footing)
    const cr = clip(region, a, c, q0);
    return integrate(cr, (x, z) => f(x, z) * (q0 + a * x + c * z)) - w * integrate(region, f);
  };
  const side = (axis, sign, pos, mode) => {
    const reg = regionAxis(axis, sign, pos);
    if (reg.length < 3) return 0;
    return mode === 'M' ? net(reg, arm(axis, sign, pos)) : net(reg, () => 1);
  };
  const axisResult = (axis, half, centre, d) => {
    const Mp = side(axis, 1, centre + half, 'M'), Mm = side(axis, -1, centre - half, 'M');
    const Vp = side(axis, 1, centre + half + d, 'V'), Vm = side(axis, -1, centre - half - d, 'V');
    return { Mplus: Mp, Mminus: Mm, bottom: Math.max(Mp, Mm, 0), top: Math.max(-Mp, -Mm, 0),
      Vplus: Vp, Vminus: Vm, Vu: Math.max(Math.abs(Vp), Math.abs(Vm)), sections: { plus: centre + half + d, minus: centre - half - d } };
  };
  const total = integrate(contact, (x, z) => q0 + a * x + c * z) - w * B * L;
  const hx = (c1 + dPunch) / 2, hz = (c2 + dPunch) / 2;
  const inside = rectPoly(Math.max(-B / 2, cx - hx), Math.min(B / 2, cx + hx), Math.max(-L / 2, cz - hz), Math.min(L / 2, cz + hz));
  const insideNet = inside[0][0] < inside[1][0] && inside[0][1] < inside[2][1] ? net(inside, () => 1) : 0;
  return { x: axisResult('x', c1 / 2, cx, dx), z: axisResult('z', c2 / 2, cz, dz), punch: { total, inside: insideNet, Vu: Math.max(0, total - insideNet) } };
}
