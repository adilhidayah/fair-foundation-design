// ==========================================================================
// SHARED — PUNCHING OF A PILE THROUGH THE PILE CAP (two-way shear around each pile), ACI 318M-19 §22.6.4 / Table 22.6.5.2.
// Critical section at d/2 from the pile faces (a circular pile as the square of equal area, side D·√π/2), cut by the cap edges:
// an edge pile has three sides and α_s = 30, a corner pile two sides and α_s = 20 (footingPunchingSection). V_u = the pile reaction
// (compression pushes up through the cap, a tension pile pulls it down — the section and the strength are the same, |F| governs);
// a pile carries no moment (pinned head), so there is no unbalanced-moment term. φ = 0.75, v_c = min of Table 22.6.5.2 (a)–(c) with λs.
// Pure functions, kN / m / MPa.
// ==========================================================================
import { footingPunchingCapacity, footingPunchingSection } from './footingDesign.js';

// piles: [{ i, x, y, F }] — F = the governing (largest |F|) factored reaction of the pile; D = pile width / diameter (m);
// B × L = cap (x, y) centred on the origin (m); d = effective depth of the cap (m); fc in MPa.
export function pilePunchingCheck({ piles, D, shape = 'square', B, L, d, fc, lambda = 1 }) {
  if (!piles || piles.length === 0) return { valid: false, note: 'No piles defined.' };
  if (!(D > 0 && B > 0 && L > 0 && d > 0 && fc > 0)) return { valid: false, note: 'Pile width, cap size, effective depth and f\'c must be greater than zero.' };
  const c = shape === 'circular' ? D * Math.sqrt(Math.PI) / 2 : D;
  const items = piles.map(p => {
    const sec = footingPunchingSection({ B, L, cx: p.x, cz: p.y, c1: c, c2: c, d });
    if (!sec.valid) return { ...p, valid: false, note: sec.note, uc: Infinity };
    const cap = footingPunchingCapacity({ sec, fc, lambda });
    const Vu = Math.abs(p.F);
    return { ...p, valid: true, sec, cap, Vu, loc: sec.loc, bo: sec.bo, phiVc: cap.phiVc, uc: Vu / cap.phiVc };
  });
  const gov = items.reduce((a, b) => (b.uc > a.uc ? b : a));
  const invalid = items.filter(it => !it.valid);
  return { valid: invalid.length === 0, note: invalid.length ? invalid[0].note : '', c, items, gov, governingUC: gov.uc, overallPass: invalid.length === 0 && gov.uc <= 1 };
}
