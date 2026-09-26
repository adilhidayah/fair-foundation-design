// ==========================================================================
// SHARED — PEDESTAL CHECK AND REINFORCEMENT
// P-M interaction reinforcement design (ACI 318-19 §22.4) and anchor bolt design
// (ACI 318-19 Chapter 17, single-anchor simplification) — generic across every
// equipment category. Pure functions — no DOM access.
// ==========================================================================

// Sweeps neutral-axis depth c to build a factored P-M interaction curve for a rectangular tied
// section with symmetric 2-layer reinforcement (bars lumped at d' from each face perpendicular to bending).
export function pmInteractionCurve(h, b, dPrime, fc, fy, AsLayer) {
  const Es = 200000, ecu = 0.003;
  const beta1 = fc <= 28 ? 0.85 : Math.max(0.65, 0.85 - 0.05 * (fc - 28) / 7);
  const d1 = dPrime, d2 = h - dPrime;
  const pts = [];
  for (let i = 1; i <= 120; i++) {
    const c = h * i / 20;
    const a = Math.min(beta1 * c, h);
    const Cc = 0.85 * fc * b * a;
    let Pn = Cc, Mn = Cc * (h / 2 - a / 2), epsT = null;
    [d1, d2].forEach(d => {
      const eps = ecu * (c - d) / c;
      let fs = Math.max(-fy, Math.min(fy, eps * Es));
      let force = AsLayer * fs;
      if (d <= a && fs > 0) force -= AsLayer * 0.85 * fc;
      Pn += force;
      Mn += force * (h / 2 - d);
      if (d === d2) epsT = eps;
    });
    const phi = epsT >= 0.005 ? 0.90 : (epsT <= 0.002 ? 0.65 : 0.65 + (epsT - 0.002) * (0.25 / 0.003));
    pts.push({ c, Pn, Mn: Math.abs(Mn), phi });
  }
  const Ag = b * h, Ast = 2 * AsLayer;
  const PnMaxCap = 0.80 * (0.85 * fc * (Ag - Ast) + fy * Ast); // ACI 318-19 §22.4.2.1, tied column
  pts.forEach(p => {
    if (p.Pn > PnMaxCap) p.Pn = PnMaxCap;
    p.phiPn = p.phi * p.Pn;
    p.phiMn = p.phi * p.Mn;
  });
  return pts;
}

// Interpolates the factored curve (sorted by increasing phiPn) to find φMn at a given axial load Pu (N).
export function phiMnAtP(curve, Pu) {
  if (Pu <= curve[0].phiPn) return { phiMn: curve[0].phiMn, outOfRange: false };
  for (let i = 0; i < curve.length - 1; i++) {
    if (Pu >= curve[i].phiPn && Pu <= curve[i + 1].phiPn) {
      const t = (Pu - curve[i].phiPn) / (curve[i + 1].phiPn - curve[i].phiPn);
      return { phiMn: curve[i].phiMn + t * (curve[i + 1].phiMn - curve[i].phiMn), outOfRange: false };
    }
  }
  return { phiMn: curve[curve.length - 1].phiMn, outOfRange: true };
}

// Increases bars-per-face until every combination's (Pu, Mu) falls inside the φ-interaction envelope
// and ρ ≥ 0.01 (ACI 318 §10.6.1.1), up to maxPerFace or ρ > 0.08.
export function searchPedestalBars(h, b, dPrime, fc, fy, barDia, combosData, maxPerFace = 25) {
  const Abar = Math.PI / 4 * barDia * barDia;
  const Ag = b * h;
  for (let n = 1; n <= maxPerFace; n++) {
    const AsLayer = n * Abar;
    const Ast = 2 * AsLayer, rho = Ast / Ag;
    if (rho > 0.08) return { found: false, reason: 'ρ exceeds 0.08 before satisfying demand — increase pedestal size.' };
    const curve = pmInteractionCurve(h, b, dPrime, fc, fy, AsLayer);
    let maxUC = 0, worstCombo = null;
    const perCombo = combosData.map(cd => {
      const PuN = cd.Ptop * 1000, MuNmm = Math.abs(cd.Mtop) * 1e6;
      const res = phiMnAtP(curve, PuN);
      const uc = res.outOfRange ? Infinity : (res.phiMn > 0 ? MuNmm / res.phiMn : (MuNmm > 0 ? Infinity : 0));
      if (uc > maxUC) { maxUC = uc; worstCombo = cd.combo; }
      return { combo: cd.combo, Pu: cd.Ptop, Mu: cd.Mtop, phiMn: res.phiMn / 1e6, uc, outOfRange: res.outOfRange };
    });
    if (maxUC <= 1.0 && rho >= 0.01) {
      return { found: true, n, Abar, AsLayer, Ast, rho, curve, maxUC, worstCombo, perCombo };
    }
  }
  return { found: false, reason: 'Could not satisfy demand and ρ ≥ 0.01 within 25 bars/face — increase pedestal size or bar diameter.' };
}

// ---------- Anchor bolt design (ACI 318-19 Chapter 17, single-anchor simplification) ----------

// Governing (smallest) edge distance toward the pedestal edge in the shear/moment direction (x), across all bolts.
export function computeGoverningCa1(bolts, Bp) {
  const xbar = bolts.reduce((s, b) => s + b.x, 0) / bolts.length;
  return bolts.reduce((min, b) => Math.min(min, Bp / 2 - Math.abs(b.x - xbar)), Infinity);
}

// Single-anchor capacities per ACI 318-19 Ch.17 (no group/edge/eccentricity projected-area factors beyond ca1).
export function computeAnchorCapacity({ ca1, da, Ase, futa, hef, Abrg, fc, lambda, anchorType, cracked, phiNsa, phiNcb, phiNpn, phiVsa, phiVcb, phiVcp }) {
  const kc = anchorType === 'cast-in' ? 10 : 7; // SI, §17.6.2.2.1
  const psiCN = cracked ? 1.0 : 1.25;
  const psiCP = cracked ? 1.0 : 1.4;
  const psiCV = cracked ? 1.0 : 1.4;
  const Nsa = Ase * futa; // N
  const Vsa = 0.6 * Ase * futa; // N
  const Nb = kc * lambda * Math.sqrt(fc) * Math.pow(hef, 1.5); // N
  const Ncb = psiCN * Nb;
  const Np = 8 * Abrg * fc; // N (cast-in headed anchor)
  const Npn = psiCP * Np;
  const le = Math.min(hef, 8 * da);
  const Vb = 7 * Math.pow(le / da, 0.2) * Math.sqrt(da) * lambda * Math.sqrt(fc) * Math.pow(ca1, 1.5); // N
  const Vcb = psiCV * Vb;
  const kcp = hef < 65 ? 1.0 : 2.0;
  const Vcp = kcp * Ncb;
  const modesN = [
    { name: 'Steel, N_sa', val: Nsa, phi: phiNsa },
    { name: 'Concrete breakout, N_cb', val: Ncb, phi: phiNcb },
    { name: 'Pullout, N_pn', val: Npn, phi: phiNpn }
  ];
  const modesV = [
    { name: 'Steel, V_sa', val: Vsa, phi: phiVsa },
    { name: 'Concrete breakout, V_cb', val: Vcb, phi: phiVcb },
    { name: 'Pryout, V_cp', val: Vcp, phi: phiVcp }
  ];
  const govN = modesN.reduce((a, b) => (b.phi * b.val) < (a.phi * a.val) ? b : a);
  const govV = modesV.reduce((a, b) => (b.phi * b.val) < (a.phi * a.val) ? b : a);
  return {
    modesN, modesV,
    phiNn: govN.phi * govN.val, govNMode: govN.name,
    phiVn: govV.phi * govV.val, govVMode: govV.name
  };
}

// Distributes Ptop, Mtop across the bolt group (rigid base plate); only net-uplift positions engage bolt tension.
export function evaluateAnchorCombo(bolts, Ptop, Htop, Mtop, cap) {
  const n = bolts.length;
  if (n === 0) return { valid: false, note: 'No bolts defined.', governingUC: Infinity };
  const xbar = bolts.reduce((s, b) => s + b.x, 0) / n;
  const sumX2 = bolts.reduce((s, b) => s + Math.pow(b.x - xbar, 2), 0);
  const boltForces = bolts.map((b, i) => {
    const dx = b.x - xbar;
    const F = Ptop / n + (sumX2 > 1e-9 ? (Mtop * dx / sumX2) : 0); // + compression side, - uplift demand
    return { i: i + 1, x: b.x, y: b.y, tension: Math.max(0, -F) };
  });
  const Tmax = Math.max(...boltForces.map(b => b.tension));
  const Hi = Math.abs(Htop) / n;
  const NuN = Tmax * 1000, VuN = Hi * 1000; // kN -> N
  const ucTension = cap.phiNn > 0 ? NuN / cap.phiNn : (NuN > 0 ? Infinity : 0);
  const ucShear = cap.phiVn > 0 ? VuN / cap.phiVn : (VuN > 0 ? Infinity : 0);
  let ucInteraction;
  if (ucShear <= 0.2) ucInteraction = ucTension;
  else if (ucTension <= 0.2) ucInteraction = ucShear;
  else ucInteraction = (NuN / cap.phiNn + VuN / cap.phiVn) / 1.2;
  const checks = [
    { name: 'Bolt tension', uc: ucTension },
    { name: 'Bolt shear', uc: ucShear },
    { name: 'Tension-shear interaction', uc: ucInteraction }
  ];
  const governingCheck = checks.reduce((a, b) => b.uc > a.uc ? b : a);
  return {
    valid: true, boltForces, Tmax, Hi, n,
    checks, governingCheck, governingUC: governingCheck.uc,
    overallPass: checks.every(c => c.uc <= 1.0)
  };
}
