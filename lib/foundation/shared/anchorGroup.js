// ==========================================================================
// SHARED — ANCHOR GROUP (ACI 318M-19 Chapter 17)
// Four cast-in headed anchors in a rectangular pattern sx × sz, centred in a rectangular pedestal Bp × Lp (mm), loaded through a
// rigid base plate by P (compression +), Mx, Mz (kN·m, FAIR signs) and the shear Fx, Fz (kN). Concrete cracked (ψc,N = ψc,V = 1.0),
// Condition B φ for concrete. Seismic (SDC C–F): concrete-governed strengths × 0.75 (§17.10.5.4, §17.10.6.4) — the caller amplifies
// the seismic actions (e.g. Ω0) where §17.10.5.3(d) / §17.10.6.3(c) is the option used.
// Optional anchor reinforcement for tension (§17.5.2.1(a), R17.5.2.1): longitudinal bars within 0.5·hef of an anchor in tension,
// developed above the 35° breakout plane by a 90° hook (l_dh, §25.4.3) — replaces the concrete breakout in tension, φ = 0.75.
//   reinf = { bars: [[x, z], ...], db, fy, topCover }            the pedestal longitudinal bars (type 'bars', the default), or
//   reinf = { type: 'hairpin', db, fy, n = 1, r, tension = true, shear = true, topCover = 50, sideCover = 40, legEnd = 'hook' }:
//   n hairpins per anchor, legs at r (mm, default d_a/2 + d_b/2 = in contact) from the anchor axis.
//   Tension (§17.5.2.1(a)): vertical hairpins, 2 legs each, hooked at the top, closed end below the anchor head; only legs within
//     0.5·hef count; developed above the 35° plane: hef − r·tan35° − topCover ≥ l_dh. φN = 0.75·Σ A_s·f_y over the anchors in
//     tension, in place of N_cbg. The length below the plane (closed end) is a detailing item: ≥ l_d, reported as ldBelow.
//   Shear (§17.5.2.1(b), R17.5.2.1(b)): horizontal hairpins near the top, wrapped around the anchors of the front row (nearest the
//     edge in the shear direction), legs running back into the pedestal; leg length from the anchor to the far face − sideCover
//     ≥ l_dh (legEnd 'hook') or l_d (§25.4.2.3, 'straight'). φV = 0.75·Σ A_s·f_y (2 legs per hairpin), in place of V_cbg.
//   Verify the hairpin detail (contact with the anchor, position near the top) against the drawing.
// Pure function, SI units: N, mm, MPa (actions in kN / kN·m, converted inside). No DOM.
// ==========================================================================

// Hooked-bar development length l_dh (ACI 318M-19 §25.4.3.1): (fy·ψe·ψr·ψo·ψc / (23·λ·√f'c))·d_b^1.5 ≥ max(8 d_b, 150 mm).
// ψc = f'c/105 + 0.6 for f'c < 40 MPa (else 1.0); ψe = 1.0 (uncoated), ψr = 1.0 confined / 1.6, ψo = 1.0 hook in the core / 1.25.
export function hookDevLength({ fy, fc, db, lambda = 1, psiE = 1, psiR = 1, psiO = 1 }) {
  const psiC = fc < 40 ? fc / 105 + 0.6 : 1.0;
  return Math.max(fy * psiE * psiR * psiO * psiC / (23 * lambda * Math.sqrt(fc)) * Math.pow(db, 1.5), 8 * db, 150);
}

// Straight-bar development length l_d, simplified ACI 318M-19 §25.4.2.3 ("other cases" row, no cover / spacing / tie credit):
// (fy·ψt·ψe·ψg / (1.4·λ·√f'c))·d_b for d_b ≤ 19 (1.1 for larger bars) ≥ 300 mm. ψt = 1.3 top bar (default: hairpin near the top
// with more than 300 mm of concrete below), ψg = 1.0 Grade 420 / 1.15 Grade 520 (§25.4.2.5).
export function straightDevLength({ fy, fc, db, lambda = 1, psiT = 1.3, psiE = 1 }) {
  const psiG = fy > 420 + 1e-9 ? 1.15 : 1.0;
  return Math.max(fy * psiT * psiE * psiG / ((db <= 19 ? 1.4 : 1.1) * lambda * Math.sqrt(fc)) * db, 300);
}

export function anchorGroupCheck({ Bp, Lp, sx, sz, da, Ase, futa, hef, Abrg, fc, lambda = 1, seismic = true,
  phi = { sN: 0.75, cN: 0.70, pN: 0.70, sV: 0.65, cV: 0.70, ar: 0.75 }, P = 0, Mx = 0, Mz = 0, Fx = 0, Fz = 0, reinf = null, shearReinf = null }) {
  const sc = seismic ? 0.75 : 1.0;
  const cx = Bp / 2 - sx / 2, cz = Lp / 2 - sz / 2;            // edge distances (x faces, z faces)
  const cmin = Math.min(cx, cz), cmax = Math.max(cx, cz);
  // ---- anchor forces (rigid plate): F_i = P/4 + Mz·x_i/Σx² − Mx·z_i/Σz² (Mz > 0 compresses +x, Mx > 0 compresses −z)
  const anchors = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => {
    const x = a * sx / 2, z = b * sz / 2;
    const F = P * 1000 / 4 + Mz * 1e6 * x / (sx * sx) - Mx * 1e6 * z / (sz * sz);   // N, + compression
    return { x, z, T: Math.max(0, -F) };
  });
  const tens = anchors.filter(a => a.T > 1e-6);
  const Tmax = Math.max(0, ...anchors.map(a => a.T)), Tgrp = tens.reduce((s, a) => s + a.T, 0);
  // ---- tension: steel
  const Nsa = Ase * futa;
  // ---- concrete breakout of the anchors in tension (§17.6.2): hef' when 3+ edges are within 1.5 hef (§17.6.2.1.2)
  const hefE = cmax < 1.5 * hef ? Math.min(hef, Math.max(cmax / 1.5, Math.max(sx, sz) / 3)) : hef;
  const Nb = 10 * lambda * Math.sqrt(fc) * Math.pow(hefE, 1.5);   // kc = 10 cast-in (SI)
  const ANco = 9 * hefE * hefE;
  let ANc = 0;
  if (tens.length) {   // projected area of the tension anchors: rectangle around them, 1.5 hef' each way, clipped to the pedestal
    const xs = tens.map(a => a.x), zs = tens.map(a => a.z), h = 1.5 * hefE;
    const w = Math.min(Math.max(...xs) + h, Bp / 2) - Math.max(Math.min(...xs) - h, -Bp / 2);
    const l = Math.min(Math.max(...zs) + h, Lp / 2) - Math.max(Math.min(...zs) - h, -Lp / 2);
    ANc = w * l;
  }
  const psiEdN = cmin < 1.5 * hefE ? 0.7 + 0.3 * cmin / (1.5 * hefE) : 1.0;
  // eccentricity of the tension resultant from the centroid of the tension anchors (§17.6.2.3)
  const exN = tens.length ? Math.abs(tens.reduce((s, a) => s + a.T * a.x, 0) / Tgrp - tens.reduce((s, a) => s + a.x, 0) / tens.length) : 0;
  const ezN = tens.length ? Math.abs(tens.reduce((s, a) => s + a.T * a.z, 0) / Tgrp - tens.reduce((s, a) => s + a.z, 0) / tens.length) : 0;
  const psiEcN = 1 / (1 + exN / (1.5 * hefE)) * 1 / (1 + ezN / (1.5 * hefE));
  const Ncbg = ANco > 0 ? Math.min(ANc / ANco, tens.length) * psiEcN * psiEdN * Nb : 0;
  // ---- pullout (§17.6.3), side-face blowout (§17.6.4) where hef > 2.5 ca1
  const Npn = 8 * Abrg * fc;
  // corner (§17.6.4.1.1): c_a2 < 3·c_a1 -> N_sb × (1 + c_a2/c_a1)/4, 1 ≤ c_a2/c_a1 ≤ 3 (the anchors of the pattern are all corner anchors)
  const psiCornerSb = cmax < 3 * cmin ? (1 + Math.min(Math.max(cmax / cmin, 1), 3)) / 4 : 1;
  const Nsb = hef > 2.5 * cmin ? psiCornerSb * 13 * cmin * Math.sqrt(Abrg) * lambda * Math.sqrt(fc) : Infinity;
  const nEdge = Math.min(2, tens.length || 1);
  const Nsbg = Number.isFinite(Nsb) ? (nEdge > 1 && Math.min(sx, sz) < 6 * cmin ? (1 + Math.min(sx, sz) / (6 * cmin)) : 1) * Nsb : Infinity;
  // ---- anchor reinforcement (optional): bars within 0.5 hef of an anchor in tension, hooked at the top, developed above the plane
  let ar = null, arV = null;
  const hp = reinf && reinf.type === 'hairpin' ? { n: 1, r: da / 2 + reinf.db / 2, tension: true, shear: true, topCover: 50, sideCover: 40, legEnd: 'hook', ...reinf } : null;
  const As1 = reinf ? Math.PI / 4 * reinf.db * reinf.db : 0;
  if (hp && hp.tension && tens.length) {
    const within = hp.r <= 0.5 * hef + 1e-9;
    const nLegs = within ? tens.length * hp.n * 2 : 0;
    const ldh = hookDevLength({ fy: hp.fy, fc, db: hp.db, lambda, psiR: hp.psiR ?? 1, psiO: hp.psiO ?? 1 });
    const avail = hef - hp.r * Math.tan(35 * Math.PI / 180) - hp.topCover;
    ar = { type: 'hairpin', n: nLegs, hairpins: tens.length * hp.n, As: nLegs * As1, r: hp.r, within, ldh, avail, developed: avail >= ldh - 1e-9,
      ldBelow: straightDevLength({ fy: hp.fy, fc, db: hp.db, lambda, psiT: 1 }), phiNn: phi.ar * nLegs * As1 * hp.fy };
  } else if (reinf && !hp && tens.length) {
    const used = reinf.bars.filter(([u, v]) => tens.some(a => Math.hypot(u - a.x, v - a.z) <= 0.5 * hef));
    const r = used.length ? Math.min(...used.map(([u, v]) => Math.min(...tens.map(a => Math.hypot(u - a.x, v - a.z))))) : 0;
    const ldh = hookDevLength({ fy: reinf.fy, fc, db: reinf.db, lambda, psiR: reinf.psiR ?? 1, psiO: reinf.psiO ?? 1 });
    const avail = hef - r * Math.tan(35 * Math.PI / 180) - (reinf.topCover ?? 50);   // above the 35° plane, below the hook
    const As = used.length * Math.PI / 4 * reinf.db * reinf.db;
    ar = { type: 'bars', n: used.length, As, r, ldh, avail, developed: avail >= ldh - 1e-9, phiNn: phi.ar * As * reinf.fy };
  }
  const T = [
    { name: 'Steel N_sa', uc: Tmax / (phi.sN * Nsa) },
    ar ? { name: ar.type === 'hairpin' ? 'Anchor reinforcement, hairpins (§17.5.2.1(a))' : 'Anchor reinforcement (§17.5.2.1)', uc: ar.developed && ar.n ? Tgrp / ar.phiNn : Infinity }
       : { name: 'Concrete breakout N_cbg', uc: Tgrp / (sc * phi.cN * Ncbg) },
    { name: 'Pullout N_pn', uc: Tmax / (sc * phi.pN * Npn) },
    { name: 'Side-face blowout N_sbg', uc: Number.isFinite(Nsbg) ? (Tgrp / Math.max(1, Math.ceil(tens.length / 2))) / (sc * phi.cN * Nsbg) : 0 }
  ];
  // ---- shear: steel per anchor (V/4), breakout of the front row toward the edge in the shear direction, pryout
  const V = Math.hypot(Fx, Fz) * 1000;
  const Vsa = 0.6 * Ase * futa;
  const ca1 = Math.abs(Fx) >= Math.abs(Fz) ? cx : cz, sPar = Math.abs(Fx) >= Math.abs(Fz) ? sz : sx, wPar = Math.abs(Fx) >= Math.abs(Fz) ? Lp : Bp;
  const le = Math.min(hef, 8 * da);
  const Vb = Math.min(0.6 * Math.pow(le / da, 0.2) * Math.sqrt(da) * lambda * Math.sqrt(fc) * Math.pow(ca1, 1.5), 3.7 * lambda * Math.sqrt(fc) * Math.pow(ca1, 1.5));
  const AVc = Math.min(sPar + 3 * ca1, wPar) * 1.5 * ca1, AVco = 4.5 * ca1 * ca1;
  const ca2 = (wPar - sPar) / 2;
  const psiEdV = ca2 < 1.5 * ca1 ? 0.7 + 0.3 * ca2 / (1.5 * ca1) : 1.0;
  const Vcbg = (AVc / AVco) * psiEdV * Vb;
  const Ncbg4 = Math.min((Math.min(sx + 3 * hefE, Bp) * Math.min(sz + 3 * hefE, Lp)) / ANco, 4) * psiEdN * Nb;
  const Vcpg = (hef < 65 ? 1 : 2) * Ncbg4;
  // ---- shear anchor reinforcement (hairpins, optional): the front-row anchors (2) carry V through their hairpins
  // shear reinforcement given separately (shearReinf): hairpins (same model) or the ties in the top 125 mm (strut-and-tie, below)
  const hpV = shearReinf && shearReinf.type === 'hairpin' ? { n: 1, sideCover: 40, legEnd: 'hook', ...shearReinf } : (shearReinf ? null : (hp && hp.shear ? hp : null));
  const As1V = hpV ? Math.PI / 4 * hpV.db * hpV.db : 0;
  if (hpV && V > 1e-6) {
    const alongX = Math.abs(Fx) >= Math.abs(Fz), depth = alongX ? Bp : Lp, s = alongX ? sx : sz;
    const legAvail = depth / 2 + s / 2 - hpV.sideCover;         // from a front anchor back to the far face, less the cover
    const ldReq = hpV.legEnd === 'straight' ? straightDevLength({ fy: hpV.fy, fc, db: hpV.db, lambda })
      : hookDevLength({ fy: hpV.fy, fc, db: hpV.db, lambda, psiR: hpV.psiR ?? 1, psiO: hpV.psiO ?? 1 });
    const nLegs = 2 * hpV.n * 2;
    arV = { type: 'hairpin', axis: alongX ? 'x' : 'z', anchors: 2, hairpins: 2 * hpV.n, n: nLegs, As: nLegs * As1V, legAvail, ldReq, legEnd: hpV.legEnd,
      developed: legAvail >= ldReq - 1e-9, phiVn: phi.ar * nLegs * As1V * hpV.fy };
  }
  // ties in the top 125 mm (SP-17M(14) Anchorage Example 18, Steps 17b / 17c; §17.5.2.1(b), §10.7.6.1.6): the shear of an anchor V_a is
  // carried by a strut at α = 45° to the corner bar and a tie leg along the face, T = V_a / tan α = V_a; Case 2 (two anchors take all
  // of V): V_a = V/2; Case 1 (oversized holes, V shared by 4): V/4. φT_n = 0.75·n·A_b·f_y (one leg of each tie per anchor). At least
  // 2 × D13 or 3 × D10 ties in the top 125 mm (§10.7.6.1.6). Diamond ties (Fig. E18.16) resolve the alternate strut to the middle
  // bars (Fig. E18.14) — a detailing flag, no strength added.
  if (shearReinf && shearReinf.type === 'ties') {
    const t = { n: 2, db: 13, case: 2, diamond: false, ...shearReinf };
    const Ab = Math.PI / 4 * t.db * t.db, share = t.case === 1 ? 4 : 2;
    const nMin = t.db >= 12.5 ? 2 : 3;                           // No. 13 (12.7 mm) / D13 and larger: 2, smaller: 3
    arV = { type: 'ties', n: t.n, db: t.db, case: t.case, diamond: !!t.diamond, Va: V / share / 1000, T: V / share / 1000, As: t.n * Ab, nMin,
      minOk: t.n >= nMin, developed: true, phiVn: phi.ar * t.n * Ab * t.fy * share };   // phiVn: group V that the ties carry
  }
  const Vm = [
    { name: 'Steel V_sa', uc: (V / 4) / (phi.sV * Vsa) },
    arV ? { name: arV.type === 'ties' ? `Anchor reinforcement, ties in the top 125 mm (§17.5.2.1(b), Case ${arV.case})` : 'Anchor reinforcement, hairpins (§17.5.2.1(b))',
      uc: arV.developed && (arV.type !== 'ties' || arV.minOk) ? V / arV.phiVn : Infinity }
        : { name: 'Concrete breakout V_cbg', uc: V / (sc * phi.cV * Vcbg) },
    { name: 'Pryout V_cpg', uc: V / (sc * phi.cV * Vcpg) }
  ];
  const gT = T.reduce((a, b) => (b.uc > a.uc ? b : a)), gV = Vm.reduce((a, b) => (b.uc > a.uc ? b : a));
  // interaction (§17.8): both > 0.2 -> Nua/φNn + Vua/φVn ≤ 1.2
  const inter = gT.uc > 0.2 && gV.uc > 0.2 ? (gT.uc + gV.uc) / 1.2 : Math.max(gT.uc, gV.uc);
  const uc = Math.max(gT.uc, gV.uc, inter);
  return { cx, cz, hefE, Nb, ANc, ANco, psiEdN, psiEcN, Ncbg, Nsa, Npn, Nsbg, psiCornerSb, Vsa, Vcbg, Vcpg, Tmax: Tmax / 1000, Tgrp: Tgrp / 1000,
    anchors: anchors.map(a => ({ x: a.x, z: a.z, T: a.T / 1000 })), V: V / 1000, ar, arV, tension: T, shear: Vm, govT: gT, govV: gV, interaction: inter, uc, pass: uc <= 1.0 };
}
