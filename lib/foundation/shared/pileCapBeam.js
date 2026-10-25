// ==========================================================================
// PILE CAP AS A BEAM BETWEEN THE PILE LINES — moment / shear diagram by statics, and crack-control bar spacing.
// Pure functions, SI units (m, kN, kN·m), no DOM.
//
// Why: the moment at the face of the equipment (pileCapMomentAxis) only counts the pile reactions beyond the face. A cap that is a
// continuous beam on several pile lines (or a short span between two pile rows) also bends BETWEEN the piles, and that moment can be
// several times larger (Filter Coalescer calculation, Doc 2512-01GT-90-05J-A0014 Rev B, C.6.3: z-bottom 201.6 kN·m between the
// pile lines against 31.0 kN·m at the face).
//
// Model (one axis at a time, coordinate s along the beam, ends s0 .. s1):
//   supports  [{ s, R }]   pile-line reactions, kN, upward (sum of the F of the piles on that line) — given, not solved for
//   loads     [{ s, P, len, M, balance }]  downward point load P at s. len > 0 = the load acts as a linear pressure over a patch
//             of that length (a base ring / footing): q(t) = P/len + 12·M·t/len³, t = −len/2 .. +len/2, which carries P and the
//             couple M exactly (M > 0 = more load towards +s). len = 0 = point load and a point couple. balance = true: this load
//             takes its share of the moment that is left over when the reactions and the loads are not in moment equilibrium
//             (horizontal force lever arm, column base moments) — the same couple on every balancing load.
//   weight    total self-weight W, kN, spread uniformly over s0 .. s1 (downward)
// Statics only: M(s) = Σ R·(s − s_r) − Σ loads' moment − W·(s − s0)²/(2(s1 − s0)).
// ==========================================================================

// Moment about s of a linear-pressure patch of load acting left of s (downward positive load).
function patchMoment(s, si, P, M, len) {
  const zz = s - si;
  if (!(len > 0)) return zz >= 0 ? P * zz - M : 0;
  const a = P / len, b = 12 * M / (len ** 3);
  const t0 = -len / 2, t1 = Math.min(Math.max(zz, -len / 2), len / 2);
  const F = (t) => a * (zz * t - t * t / 2) + b * (zz * t * t / 2 - t ** 3 / 3);
  return F(t1) - F(t0);
}
// Shear of the same patch left of s.
function patchShear(s, si, P, M, len) {
  if (!(len > 0)) return s >= si ? P : 0;
  const zz = s - si, a = P / len, b = 12 * M / (len ** 3);
  const t1 = Math.min(Math.max(zz, -len / 2), len / 2), t0 = -len / 2;
  return a * (t1 - t0) + b * (t1 * t1 - t0 * t0) / 2;
}

export function capBeamAnalysis({ s0, s1, supports, loads = [], weight = 0, n = 2000 }) {
  if (!(s1 > s0)) return { valid: false, note: 'Beam length must be greater than zero.' };
  if (!supports || supports.length < 2) return { valid: false, note: 'At least two pile lines are needed.' };
  const Rsum = supports.reduce((a, r) => a + r.R, 0);
  const Psum = loads.reduce((a, q) => a + q.P, 0) + weight;
  const L = s1 - s0;
  const raw = loads.map(q => ({ ...q, len: q.len || 0, M: q.M || 0 }));
  const momentAt = (s, ls) => supports.reduce((a, r) => (r.s <= s ? a + r.R * (s - r.s) : a), 0)
    - ls.reduce((a, q) => a + patchMoment(s, q.s, q.P, q.M, q.len), 0) - weight * (s - s0) ** 2 / (2 * L);
  const closureMoment = momentAt(s1, raw);               // should be 0 for a beam in equilibrium
  const nb = raw.filter(q => q.balance).length;
  const ls = nb ? raw.map(q => (q.balance ? { ...q, M: q.M - closureMoment / nb } : q)) : raw;
  const shearAt = (s) => supports.reduce((a, r) => (r.s <= s ? a + r.R : a), 0) - ls.reduce((a, q) => a + patchShear(s, q.s, q.P, q.M, q.len), 0) - weight * (s - s0) / L;
  const momentFn = (s) => momentAt(s, ls);
  const ss = Array.from({ length: n + 1 }, (_, k) => s0 + L * k / n), ms = ss.map(momentFn);
  let ip = 0, im = 0;
  ms.forEach((m, k) => { if (m > ms[ip]) ip = k; if (m < ms[im]) im = k; });
  return { valid: true, momentAt: momentFn, shearAt, Mpos: Math.max(ms[ip], 0), sPos: ss[ip], Mneg: Math.max(-ms[im], 0), sNeg: ss[im],
    closureForce: Rsum - Psum, closureMoment, balanceMoments: ls.map(q => q.M), loads: ls };
}

// Crack control by bar spacing, ACI 318M-19 §24.3.2 (Table 24.3.2), steel stress at service fs = 2/3·fy:
//   s1 = 380·(280/fs) − 2.5·cc,  s2 = 300·(280/fs),  s_all = min(s1, s2).  fy, fs in MPa; cc, spacing in mm.
export function crackSpacingCheck({ fy, cc, s, fs = null }) {
  if (!(fy > 0 && cc >= 0 && s > 0)) return { valid: false, note: 'fy, cc and the bar spacing must be given.' };
  const f = fs && fs > 0 ? fs : 2 * fy / 3;
  const s1 = 380 * (280 / f) - 2.5 * cc, s2 = 300 * (280 / f), sAll = Math.min(s1, s2);
  return { valid: true, fs: f, s1, s2, sAll, s, uc: s / sAll, pass: s <= sAll };
}
