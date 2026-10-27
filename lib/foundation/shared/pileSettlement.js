// ==========================================================================
// SHARED — PILE SETTLEMENT (Vesic 1977 semi-empirical method, as in Das, Principles of Foundation Engineering, §11.18)
// Single pile under working load Q_w = Q_wp (tip) + Q_ws (shaft):
//   S1 = (Q_wp + ξ·Q_ws)·L / (A_p·E_p)                    elastic shortening of the pile
//   S2 = q_wp·D·(1 − μs²)·I_wp / E_s,  q_wp = Q_wp / A_p  settlement from the load at the pile tip
//   S3 = (Q_ws / (p·L))·(D / E_s)·(1 − μs²)·I_ws,  I_ws = 2 + 0.35·√(L/D)   settlement from the load along the shaft
//   S_e = S1 + S2 + S3
// Group (Vesic): S_g = S_e · √(B_g / D), B_g = width of the pile group (shorter side, outer face to outer face).
// Units: kN, m, kPa. Empirical — E_s must come from the geotechnical report. Pure function (no DOM).
// ==========================================================================
export function pileSettlementVesic({ Qw, shaftFraction = 2 / 3, xi = 0.67, L, D, shape = 'square', Ep_kPa, Es_kPa, mu = 0.3, Iwp = 0.85, Bg, allow_mm = 25 }) {
  const bad = (note) => ({ valid: false, note });
  if (!(Qw > 0)) return bad('Working load per pile must be greater than zero.');
  if (!(L > 0 && D > 0)) return bad('Pile length L and width D must be greater than zero.');
  if (!(Ep_kPa > 0 && Es_kPa > 0)) return bad('E_p and E_s must be greater than zero.');
  if (!(shaftFraction >= 0 && shaftFraction <= 1)) return bad('Shaft share of the working load must be between 0 and 1.');
  if (!(mu >= 0 && mu < 0.5)) return bad('Poisson ratio μs must be in [0, 0.5).');
  if (!(Bg > 0)) return bad('Group width B_g must be greater than zero.');
  const Ap = shape === 'circular' ? Math.PI * D * D / 4 : D * D;
  const p = shape === 'circular' ? Math.PI * D : 4 * D;
  const Qws = shaftFraction * Qw, Qwp = Qw - Qws;
  const qwp = Qwp / Ap;
  const Iws = 2 + 0.35 * Math.sqrt(L / D);
  const k = 1 - mu * mu;
  const S1 = (Qwp + xi * Qws) * L / (Ap * Ep_kPa) * 1000;      // mm
  const S2 = qwp * D * k * Iwp / Es_kPa * 1000;
  const S3 = (Qws / (p * L)) * (D / Es_kPa) * k * Iws * 1000;
  const Se = S1 + S2 + S3;
  const Fg = Math.sqrt(Bg / D);
  const Sg = Fg * Se;
  const uc = allow_mm > 0 ? Sg / allow_mm : Infinity;
  return { valid: true, Ap, p, Qwp, Qws, qwp, Iws, S1, S2, S3, Se, Fg, Sg, allow_mm, uc, governingUC: uc, overallPass: uc <= 1 };
}
