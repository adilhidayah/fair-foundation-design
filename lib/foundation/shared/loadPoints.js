// ==========================================================================
// SHARED — SEVERAL LOAD POINTS ON ONE PILE CAP (e.g. three vessels on one cap, no pedestal).
// A load point is a column / base plate / skid footprint { x, y, c1, c2, share } on the cap (m, cap-centre frame as pileGroup.js:
// x along B, y along L = the "z" of the UI). Every combination's superstructure load vector (P, Hx, Hz, Mx, Mz — loads transferred
// to the underside of the cap, FAIR sign convention: Mz > 0 compresses +x, Mx > 0 compresses −y) is shared out to the points
// by `share` (normalised to 1); the cap weight P_cap acts at the cap centre.
//
// Pile group:  the points are replaced by their statically equivalent load at the cap centre (what evaluatePileGroupCombo takes)
//   P  = Σ P_j + P_cap,   Mz = Σ (Mz_j + P_j·x_j),   Mx = Σ (Mx_j − P_j·y_j),   Hx, Hz = Σ.
// Cap sections (flexure, shear, punching): pileCapMomentAxis / oneWayPileShear / punchingPileShear take `pointLoads` and net the
// load points beyond the section against the pile reactions beyond it — free body of the cap beyond the section, so the sum of
// pile reactions and point loads is in equilibrium (validation part27 checks exactly that). Pure functions, kN / m / kN·m.
// ==========================================================================
export function normalisePoints(points) {
  const list = (points || []).filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.y));
  if (list.length === 0) return [];
  let s = list.reduce((a, p) => a + (p.share > 0 ? p.share : 0), 0);
  const equal = !(s > 0);
  if (equal) s = list.length;
  return list.map(p => ({ ...p, c1: p.c1 > 0 ? p.c1 : 0, c2: p.c2 > 0 ? p.c2 : 0, f: equal ? 1 / s : (p.share > 0 ? p.share : 0) / s }));
}

// vec = { P (superstructure, without cap weight), Pcap, Hx, Hz, Mx, Mz, pedFrac? }. Returns { group, pointLoads, Pcap }.
// pedFrac (optional, one fraction per point): a pedestal under every load point — the share pedFrac_j of the weight Pcap is the weight of
// pedestal j and acts at its point (added to P_j); the rest of Pcap (cap + backfill) stays at the cap centre. Returned `Pcap` is that rest.
export function splitCombinationLoad(points, vec) {
  const pts = normalisePoints(points);
  const { P = 0, Pcap: PcapAll = 0, Hx = 0, Hz = 0, Mx = 0, Mz = 0, pedFrac = null } = vec;
  const fr = pts.map((_, j) => (Array.isArray(pedFrac) && pedFrac[j] > 0 ? pedFrac[j] : 0));
  const sumFr = Math.min(fr.reduce((s, a) => s + a, 0), 1), k = fr.reduce((s, a) => s + a, 0) > 1 ? 1 / fr.reduce((s, a) => s + a, 0) : 1;
  const Pcap = PcapAll * (1 - sumFr);
  const pointLoads = pts.map((p, j) => ({ x: p.x, y: p.y, c1: p.c1, c2: p.c2, f: p.f, P: p.f * P + PcapAll * fr[j] * k, Pped: PcapAll * fr[j] * k, Hx: p.f * Hx, Hz: p.f * Hz, Mx: p.f * Mx, Mz: p.f * Mz }));
  const group = {
    P: P + PcapAll, Hx, Hz,
    Mx: pointLoads.reduce((s, q) => s + q.Mx - q.P * q.y, 0),
    Mz: pointLoads.reduce((s, q) => s + q.Mz + q.P * q.x, 0),
    at: { x: 0, y: 0 }
  };
  return { group, pointLoads, Pcap };
}

// Actions at the BASE of every pedestal (one under each load point) of one combination, for the P-M design (5A) and the anchor bolts.
// vec = the superstructure load of the combination at the top of the pedestals { P, Fx, Fz, Mx, Mz } (FAIR signs, kN, kN·m, without any
// self-weight), kD = the dead-load factor of that combination (the pedestal self-weight is dead load), Hp = pedestal height (m, lever arm
// of the horizontal force, as dMz = Fx·Hp / dMx = −Fz·Hp of loadTypeVector), Wped = self-weight of each pedestal (kN, concrete + grout).
// Point j takes the share f_j of the superstructure load: P = f·P + kD·W_j; Mz = f·(Mz + Fx·Hp); Mx = f·(Mx − Fz·Hp).
// Returns [{ x, y, c1, c2, f, Ptop, P, Fx, Fz, Mx, Mz }] (Ptop = f·P, the load at the top = what the anchor bolts take).
export function pedestalBaseActions(points, vec, kD, Hp, Wped) {
  const pts = normalisePoints(points);
  const { P = 0, Fx = 0, Fz = 0, Mx = 0, Mz = 0 } = vec;
  return pts.map((p, j) => ({ x: p.x, y: p.y, c1: p.c1, c2: p.c2, f: p.f, Ptop: p.f * P,
    P: p.f * P + kD * ((Wped && Wped[j]) || 0), Fx: p.f * Fx, Fz: p.f * Fz, Mx: p.f * (Mx - Fz * Hp), Mz: p.f * (Mz + Fx * Hp),
    MxTop: p.f * Mx, MzTop: p.f * Mz }));
}

// Share (0..1) of a point load that lies beyond a section: s = signed distance of the point centre beyond the section (m,
// negative = before it), w = the point's width across the section.
export function pointShare(s, w) {
  const half = (w || 0) / 2;
  if (s >= half) return 1;
  if (s <= -half) return 0;
  return (s + half) / (2 * half);
}

// Net effect of the point loads beyond a section on one side ('sign' = +1 / −1 along `axis` 'x' | 'y') at distance `crit` from `ref`:
// { V, M } to SUBTRACT from the pile-reaction shear / moment of that side. Couples: Mz about z acts across x, Mx across y.
// capWeight (optional) = { P, Bx, Ly }: the cap weight P spread uniformly over the cap Bx × Ly centred on the origin — the part beyond
// the section is netted too (with several points the arms are long and the weight is no longer negligible).
export function pointLoadsBeyond(pointLoads, axis, ref, crit, sign, capWeight = null) {
  let V = 0, M = 0;
  if (capWeight && capWeight.P > 0) {
    const h = (axis === 'x' ? capWeight.Bx : capWeight.Ly) / 2;
    if (h > 0) {
      const s = ref + sign * crit;
      const lo = sign > 0 ? Math.max(s, -h) : -h, hi = sign > 0 ? h : Math.min(s, h);
      if (hi > lo) {
        const Wb = capWeight.P * (hi - lo) / (2 * h);
        V += Wb;
        M += Wb * (sign > 0 ? (lo + hi) / 2 - s : s - (lo + hi) / 2);
      }
    }
  }
  (pointLoads || []).forEach(q => {
    const c = (axis === 'x' ? q.x : q.y) - ref;
    const w = axis === 'x' ? q.c1 : q.c2;
    const arm = sign * c - crit;
    const sh = pointShare(arm, w);
    if (sh <= 0) return;
    const couple = axis === 'x' ? sign * q.Mz : -sign * q.Mx;
    V += sh * q.P;
    M += sh * (q.P * arm + couple);
  });
  return { V, M };
}
