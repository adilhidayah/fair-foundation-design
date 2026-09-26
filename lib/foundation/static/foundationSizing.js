// ==========================================================================
// STATIC EQUIPMENT (vessel, tank, heat exchanger, generic) — FOUNDATION SIZING
// Footing/pedestal (or slab-only block) geometry and self-weight. Pure function —
// no DOM access.
//
// This is the first equipment category built out (per the "start with static
// equipment" rollout plan). Rotating/reciprocating/pipe-rack/skid-mounted
// equipment will each need their own foundationSizing.js once their sizing
// approach is defined (e.g. piperack is per-pier and iterative; reciprocating
// is often a large block foundation sized differently) — those don't exist yet,
// so those files aren't created until there's real logic to put in them.
// ==========================================================================
//
// type 'block' (UI: "Footing Only" / "Pile Cap Only"): footing/pile cap of input thickness Hf, no pedestal,
// top at depth hs = Df - Hf below ground with soil backfill over its full plan area (hs = 0 -> flush with
// grade). Replaces the former slab model (Hf = Df + blockGp, no backfill); blockGp is no longer used.
// Hf > Df is allowed (user decision, 26 Sep 2026): the top then projects Gp = Hf - Df above grade with no
// backfill; the only requirement is that the bottom is not above grade (Df >= 0). The pedestal type keeps Df >= Hf.
//
// groutT (m, default 0): grout layer on the top concrete surface, unit weight gc. Its weight is reported
// separately as Wg (grouting) — Wf / Wp are concrete only — but the geometry still includes it:
//  - pedestal: part of the pedestal height, Hp = Gp + Dp + groutT (full pedestal area);
//    Wp = gc·Ap·(Gp + Dp), Wg = gc·Ap·groutT, deltaH = Hp + Hf.
//  - block: part of the footing / pile cap height, HfTot = Hf + groutT (full footing area);
//    Wf = gc·Af·Hf, Wg = gc·Af·groutT, backfill hs = max(Df - HfTot, 0) (grout may stand above grade), deltaH = HfTot.
// Geometry consistency of the foundation (all lengths in m). Returns { valid, issues: [{ code, text }], overallPass }.
// Checked: positive plan size / height, Df >= Hf with a pedestal (Df >= 0 without one: it may project above grade), pedestal (incl. offset) inside the footing / pile cap in both directions,
// and — for piles — the embedded pile length h below the cap thickness Hf. A pedestal edge flush with the footing edge is
// allowed (tolerance 1e-9 m). Nothing is corrected silently; the UI reports the issues.
export function foundationGeometryCheck({ Bf, Lf, Hf, Df, hasPed = false, Bp = 0, Lp = 0, OffX = 0, OffZ = 0, isPile = false, hEmbed = 0 }) {
  const EPS = 1e-9;
  const issues = [];
  if (!(Bf > 0 && Lf > 0 && Hf > 0)) issues.push({ code: 'size', text: 'Bf, Lf and Hf must be greater than zero.' });
  if (hasPed && !(Df >= Hf - EPS)) issues.push({ code: 'depth', text: `Df = ${Df.toFixed(3)} m is less than Hf = ${Hf.toFixed(3)} m — with a pedestal the footing must fit within the embedment depth.` });
  if (!hasPed && !(Df >= -EPS)) issues.push({ code: 'depth', text: `Df = ${Df.toFixed(3)} m is negative — the bottom of the footing / pile cap would be above the ground.` });
  if (hasPed) {
    if (!(Bp > 0 && Lp > 0)) issues.push({ code: 'pedSize', text: 'Pedestal Bp and Lp must be greater than zero.' });
    const outX = Math.abs(OffX) + Bp / 2 - Bf / 2, outZ = Math.abs(OffZ) + Lp / 2 - Lf / 2;
    if (outX > EPS) issues.push({ code: 'pedX', text: `Pedestal extends ${outX.toFixed(3)} m beyond the footing in x: |OffX| + Bp/2 = ${(Math.abs(OffX) + Bp / 2).toFixed(3)} m > Bf/2 = ${(Bf / 2).toFixed(3)} m.` });
    if (outZ > EPS) issues.push({ code: 'pedZ', text: `Pedestal extends ${outZ.toFixed(3)} m beyond the footing in z: |OffZ| + Lp/2 = ${(Math.abs(OffZ) + Lp / 2).toFixed(3)} m > Lf/2 = ${(Lf / 2).toFixed(3)} m.` });
  }
  if (isPile && Hf > 0 && !(hEmbed < Hf - EPS)) {
    issues.push({ code: 'embed', text: `Embedded pile length h = ${hEmbed.toFixed(3)} m is not less than the pile cap thickness Hf = ${Hf.toFixed(3)} m.` });
  }
  return { valid: true, issues, overallPass: issues.length === 0 };
}

export function foundationSizing({ type, Bf, Lf, Hf, Df, gc, gs, Bp, Lp, pedGp, OffX, OffZ, blockGp, leanProj = 0, leanT = 0, gl = 0, groutT = 0 }) {
  const hasPed = type === 'pedestal';
  const isBlock = type === 'block';
  const HfEff = Hf;
  let Gp = 0, OffXOut = 0, OffZOut = 0, Dp = 0, Hp = 0, Ap = 0, Wp = 0, Wg = 0, Ws = 0, hs = 0, tg = 0;
  if (Bf <= 0 || Lf <= 0 || HfEff <= 0 || !(Df >= 0) || (hasPed && Df < HfEff)) {
    return { valid: false };
  }
  const Af = Bf * Lf;
  if (isBlock) tg = Math.max(groutT, 0);
  const HfTot = HfEff + (isBlock ? tg : 0); // footing / pile cap height incl. grout (block mode)
  const Wf = gc * Af * HfEff;
  const Wl = gl * (Bf + 2 * leanProj) * (Lf + 2 * leanProj) * leanT;
  if (hasPed) {
    Gp = pedGp; OffXOut = OffX; OffZOut = OffZ;
    Dp = Df - HfEff;
    tg = Math.max(groutT, 0);
    Hp = Gp + Dp + tg;
    Ap = Bp * Lp;
    Wp = gc * Ap * (Gp + Dp);
    Wg = gc * Ap * tg;
    hs = Dp;
    Ws = gs * Math.max(Af - Ap, 0) * Dp;
  } else if (isBlock) {
    Wg = gc * Af * tg;
    hs = Math.max(Df - HfTot, 0);   // backfill depth above footing / pile cap (incl. grout)
    Ws = gs * Af * hs;
    Gp = Math.max(HfEff - Df, 0);   // concrete projecting above grade (0 when the top is at or below grade)
  }
  const totalWeightTon = Wf + Wl + Wp + Wg + Ws;
  const totalWeightKN = totalWeightTon * 9.80665;
  const deltaH = hasPed ? (Hp + HfEff) : HfTot; // top of pedestal / footing (incl. grout) to underside of footing
  return {
    valid: true, hasPed, isBlock, Hf: HfEff, HfTot, Df, Af, Wf, Wl, Gp, Dp, Hp, Ap, Wp, Wg, Ws, hs, groutT: tg,
    OffX: OffXOut, OffZ: OffZOut, totalWeightTon, totalWeightKN, deltaH
  };
}
