// ==========================================================================
// SHARED — ANCHOR GROUP (ACI 318M-19 Chapter 17)
// Four cast-in headed anchors in a rectangular pattern sx × sz, centred in a rectangular pedestal Bp × Lp (mm), loaded through a
// rigid base plate by P (compression +), Mx, Mz (kN·m, FAIR signs) and the shear Fx, Fz (kN). Concrete cracked (ψc,N = ψc,V = 1.0),
// Condition B φ for concrete. Seismic (SDC C–F): concrete-governed strengths × 0.75 (§17.10.5.4, §17.10.6.4) — the caller amplifies
// the seismic actions (e.g. Ω0) where §17.10.5.3(d) / §17.10.6.3(c) is the option used.
// Optional anchor reinforcement for tension (§17.5.2.1(a), R17.5.2.1): longitudinal bars within 0.5·hef of an anchor in tension,
// developed above the 35° breakout plane by a 90° hook (l_dh, §25.4.3) — replaces the concrete breakout in tension, φ = 0.75.
// Hairpin variant (reinf.hairpin): vertical legs of U-bars (180° bend at the top) placed inside the anchor pattern, same
// rules: legs within 0.5·hef of an anchor in tension, bend developed above the plane (l_dh, ψr = 1.6 conservative), straight
// legs developed below the plane (l_d, §25.4.2.3 for d_b <= 19: fy·ψt·ψe / (2.1·λ·√f'c)·d_b, ψt = ψe = 1.0, spacing >= 2 d_b).
// Pure function, SI units: N, mm, MPa (actions in kN / kN·m, converted inside). No DOM.
// ==========================================================================

// Straight-bar development length in tension (ACI 318M-19 §25.4.2.3, d_b <= 19 mm, clear spacing >= 2 d_b and cover >= d_b)
export function straightDevLength({ fy, fc, db, lambda = 1, psiT = 1, psiE = 1 }) {
  return Math.max(fy * psiT * psiE / (2.1 * lambda * Math.sqrt(fc)) * db, 300);
}

// Hooked-bar development length l_dh (ACI 318M-19 §25.4.3.1): (fy·ψe·ψr·ψo·ψc / (23·λ·√f'c))·d_b^1.5 ≥ max(8 d_b, 150 mm).
// ψc = f'c/105 + 0.6 for f'c < 40 MPa (else 1.0); ψe = 1.0 (uncoated), ψr = 1.0 confined / 1.6, ψo = 1.0 hook in the core / 1.25.
export function hookDevLength({ fy, fc, db, lambda = 1, psiE = 1, psiR = 1, psiO = 1 }) {
  const psiC = fc < 40 ? fc / 105 + 0.6 : 1.0;
  return Math.max(fy * psiE * psiR * psiO * psiC / (23 * lambda * Math.sqrt(fc)) * Math.pow(db, 1.5), 8 * db, 150);
}

export function anchorGroupCheck({ Bp, Lp, sx, sz, da, Ase, futa, hef, Abrg, fc, lambda = 1, seismic = true,
  phi = { sN: 0.75, cN: 0.70, pN: 0.70, sV: 0.65, cV: 0.70, ar: 0.75 }, P = 0, Mx = 0, Mz = 0, Fx = 0, Fz = 0, reinf = null }) {
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
  const Nsb = hef > 2.5 * cmin ? 13 * cmin * Math.sqrt(Abrg) * lambda * Math.sqrt(fc) : Infinity;
  const nEdge = Math.min(2, tens.length || 1);
  const Nsbg = Number.isFinite(Nsb) ? (nEdge > 1 && Math.min(sx, sz) < 6 * cmin ? (1 + Math.min(sx, sz) / (6 * cmin)) : 1) * Nsb : Infinity;
  // ---- anchor reinforcement (optional): bars within 0.5 hef of an anchor in tension, hooked at the top, developed above the plane
  let ar = null;
  if (reinf && tens.length) {
    const hp = reinf.hairpin || null, db = hp ? hp.db : reinf.db;
    const used = (hp ? hp.legs : reinf.bars).filter(([u, v]) => tens.some(a => Math.hypot(u - a.x, v - a.z) <= 0.5 * hef));
    const r = used.length ? Math.min(...used.map(([u, v]) => Math.min(...tens.map(a => Math.hypot(u - a.x, v - a.z))))) : 0;
    const ldh = hookDevLength({ fy: reinf.fy, fc, db, lambda, psiR: reinf.psiR ?? (hp ? 1.6 : 1), psiO: reinf.psiO ?? 1 });
    const cover = reinf.topCover ?? 50;
    const planeDepth = hef - r * Math.tan(35 * Math.PI / 180);                         // depth of the 35° plane at the bar, from the top
    const avail = planeDepth - cover;                                                  // above the 35° plane, below the bend / hook
    const As = used.length * Math.PI / 4 * db * db;
    ar = { n: used.length, As, r, db, ldh, avail, developed: avail >= ldh - 1e-9, phiNn: phi.ar * As * reinf.fy };
    if (hp) {                                                                           // straight legs below the plane
      const ld = straightDevLength({ fy: reinf.fy, fc, db, lambda });
      const legLen = Math.min(Math.ceil((hef + ld) / 50) * 50, hp.maxLen ?? Infinity);   // bottom of the legs, from the top of the pedestal
      Object.assign(ar, { hairpin: true, ld, legLen, availLow: legLen - planeDepth });
      ar.developed = ar.developed && ar.availLow >= ld - 1e-9;
    }
  }
  const T = [
    { name: 'Steel N_sa', uc: Tmax / (phi.sN * Nsa) },
    ar ? { name: 'Anchor reinforcement (§17.5.2.1)', uc: ar.developed && ar.n ? Tgrp / ar.phiNn : Infinity }
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
  const Vm = [
    { name: 'Steel V_sa', uc: (V / 4) / (phi.sV * Vsa) },
    { name: 'Concrete breakout V_cbg', uc: V / (sc * phi.cV * Vcbg) },
    { name: 'Pryout V_cpg', uc: V / (sc * phi.cV * Vcpg) }
  ];
  const gT = T.reduce((a, b) => (b.uc > a.uc ? b : a)), gV = Vm.reduce((a, b) => (b.uc > a.uc ? b : a));
  // interaction (§17.8): both > 0.2 -> Nua/φNn + Vua/φVn ≤ 1.2
  const inter = gT.uc > 0.2 && gV.uc > 0.2 ? (gT.uc + gV.uc) / 1.2 : Math.max(gT.uc, gV.uc);
  const uc = Math.max(gT.uc, gV.uc, inter);
  return { cx, cz, hefE, Nb, ANc, ANco, psiEdN, psiEcN, Ncbg, Nsa, Npn, Nsbg, Vsa, Vcbg, Vcpg, Tmax: Tmax / 1000, Tgrp: Tgrp / 1000,
    V: V / 1000, ar, tension: T, shear: Vm, govT: gT, govV: gV, interaction: inter, uc, pass: uc <= 1.0 };
}
