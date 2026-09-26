// ==========================================================================
// PILE GROUP CHECKS — layout (spacing / edge), axial group efficiency, lateral p-multipliers,
// and a biaxial per-pile force distribution. Pure functions, SI units (m, kN, kN·m), no DOM.
//
// Coordinates: pile { x, y } in metres, origin = PILE CAP CENTRE. x runs along the cap width B (same axis as
// Fx / Mz), y runs along the cap length L (same axis as Fz / Mx). NOTE: the field is called `y` in code, but it is the
// horizontal PLAN z axis — the app labels the horizontal axes x and z everywhere (y is vertical).
// Sign convention = loadTypeVector() in loadCombinations.js: Mz > 0 puts compression on the +x side, and
// Mx > 0 puts compression on the -y side (Fz > 0 gives Mx < 0, i.e. compression on +y).
//
// Project-specific limits (spacing / edge / efficiency threshold) are ALWAYS parameters — never hard-coded here.
// A limit that is null / undefined / NaN means "not set": the check returns status 'NOT SET', which is not a PASS.
// ==========================================================================

const GRID_TOL = 0.005; // m — piles closer than this along an axis are treated as the same row / column
const EPS = 1e-9;       // tolerance for limit comparisons — 1.2/0.4 must count as exactly 3D, not 2.9999999999999996
const isSet = (v) => v !== null && v !== undefined && Number.isFinite(v) && v > 0;

// Lateral group p-multipliers Pm by centre-to-centre spacing (in pile diameters) in the load direction and by
// row (row 1 = leading row; the last entry applies to every further row). Values: AASHTO LRFD Bridge Design
// Specifications Table 10.7.2.4-1 (after Brown et al. 1988) — VERIFY against the edition / project spec in use;
// the UI lets the user edit this table per project.
export const DEFAULT_P_MULTIPLIERS = {
  source: 'AASHTO LRFD Table 10.7.2.4-1 (Brown et al. 1988) — verify against the edition / project spec in use',
  points: [
    { sD: 3, rows: [0.8, 0.4, 0.3] },
    { sD: 5, rows: [1.0, 0.85, 0.7] }
  ]
};

// Minimum centre-to-centre distance over all pile pairs. Returns null for fewer than two piles.
function minPairSpacing(piles) {
  let best = null;
  for (let i = 0; i < piles.length; i++) {
    for (let j = i + 1; j < piles.length; j++) {
      const s = Math.hypot(piles[i].x - piles[j].x, piles[i].y - piles[j].y);
      if (best === null || s < best.s) best = { s, i: i + 1, j: j + 1 };
    }
  }
  return best;
}

// Sorted cluster centres of one coordinate (values within GRID_TOL share a cluster).
function clusterCoords(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const clusters = [];
  sorted.forEach(v => {
    const last = clusters[clusters.length - 1];
    if (last && Math.abs(v - last.max) <= GRID_TOL) { last.sum += v; last.count += 1; last.max = v; }
    else clusters.push({ sum: v, count: 1, max: v });
  });
  return clusters.map(c => ({ coord: c.sum / c.count, count: c.count }));
}

// Layout check: minimum pile spacing and pile-to-cap-edge distance against project limits (all in metres).
// limits: { spacingMin, spacingWarn, edgeWarn }.
//   spacing: uc = spacingMin / s_actual > 1 -> FAIL; s_actual < spacingWarn -> WARNING (still passes).
//   edge:    no FAIL limit — only a WARNING below edgeWarn — except a pile centre outside the cap, which always FAILs.
// Status: 'OK' | 'WARNING' | 'FAIL' | 'NOT SET' | 'N/A'. overallPass is false while anything is NOT SET.
export function pileLayoutCheck(piles, capB, capL, limits = {}) {
  const n = piles ? piles.length : 0;
  if (n === 0) return { valid: false, note: 'No piles defined.', overallPass: false };
  const { spacingMin, spacingWarn, edgeWarn } = limits;
  const warnings = [], notSet = [];

  // Spacing
  const sp = minPairSpacing(piles);
  const spacing = { actual: sp ? sp.s : null, pair: sp ? [sp.i, sp.j] : null, limit: isSet(spacingMin) ? spacingMin : null,
    warnLimit: isSet(spacingWarn) ? spacingWarn : null, uc: null, status: 'N/A' };
  if (sp) {
    if (spacing.limit === null) { spacing.status = 'NOT SET'; notSet.push('minimum pile spacing'); }
    else {
      spacing.uc = sp.s > 1e-9 ? spacing.limit / sp.s : Infinity;
      if (spacing.uc > 1.0 + EPS) spacing.status = 'FAIL';
      else if (spacing.warnLimit !== null && sp.s < spacing.warnLimit - EPS) {
        spacing.status = 'WARNING';
        warnings.push(`Pile spacing ${sp.s.toFixed(3)} m (piles ${sp.i}-${sp.j}) < recommended ${spacing.warnLimit.toFixed(3)} m.`);
      } else spacing.status = 'OK';
    }
    if (spacing.limit !== null && spacing.warnLimit !== null && spacing.warnLimit < spacing.limit) {
      warnings.push('Recommended spacing is smaller than the minimum spacing — check the limits.');
    }
  }

  // Edge distance (cap centred on the origin)
  const capOk = isSet(capB) && isSet(capL);
  const edges = piles.map((p, k) => ({ i: k + 1, x: p.x, y: p.y,
    e: capOk ? Math.min(capB / 2 - Math.abs(p.x), capL / 2 - Math.abs(p.y)) : NaN }));
  const eMinRec = capOk ? edges.reduce((a, b) => (b.e < a.e ? b : a)) : null;
  const inside = capOk ? eMinRec.e >= 0 : null;
  const edge = { actual: capOk ? eMinRec.e : null, pile: capOk ? eMinRec.i : null,
    warnLimit: isSet(edgeWarn) ? edgeWarn : null, status: 'N/A' };
  if (!capOk) { edge.status = 'NOT SET'; notSet.push('pile cap size (Bf, Lf)'); }
  else if (!inside) {
    edge.status = 'FAIL';
    warnings.push(`Pile ${eMinRec.i} centre lies outside the pile cap (edge distance ${eMinRec.e.toFixed(3)} m).`);
  } else if (edge.warnLimit === null) { edge.status = 'NOT SET'; notSet.push('edge distance warning limit'); }
  else if (eMinRec.e < edge.warnLimit - EPS) {
    edge.status = 'WARNING';
    warnings.push(`Edge distance ${eMinRec.e.toFixed(3)} m (pile ${eMinRec.i}) < ${edge.warnLimit.toFixed(3)} m.`);
  } else edge.status = 'OK';

  const bad = (s) => s === 'FAIL' || s === 'NOT SET';
  return { valid: true, n, spacing, edge, edges, inside, warnings, notSet,
    overallPass: !bad(spacing.status) && !bad(edge.status) };
}

// Is the layout a regular m (columns, x) x n (rows, y) grid — one pile in every cell? Needed by Converse–Labarre.
export function pileGridInfo(piles) {
  const cols = clusterCoords(piles.map(p => p.x)), rows = clusterCoords(piles.map(p => p.y));
  const m = cols.length, n = rows.length;
  let regular = m * n === piles.length;
  if (regular) {
    const nearest = (list, v) => list.reduce((a, b) => (Math.abs(b.coord - v) < Math.abs(a.coord - v) ? b : a));
    const seen = new Set();
    piles.forEach(p => seen.add(cols.indexOf(nearest(cols, p.x)) + ',' + rows.indexOf(nearest(rows, p.y))));
    regular = seen.size === piles.length;
  }
  return { regular, m, n };
}

// Axial group efficiency — Converse–Labarre (geotechnical practice, not an ACI/ASCE clause):
//   theta = arctan(D/s) [deg],  Eg = 1 - theta * [(n-1)m + (m-1)n] / (90 m n)
// with s = minimum centre-to-centre spacing (conservative). Applied to compression and tension capacity only.
// type: 'end' (end-bearing / rock socket -> Eg = 1) | 'friction'.  sNoReduction: project spacing at or above
// which no reduction is applied (optional; if not set the formula is always applied).  manualEg overrides all.
// Not a regular grid and no manualEg -> applicable false, Eg NaN (caller must ask for a manual Eg).
// apply = false (user choice, 26 Sep 2026): the group efficiency is not used at all — Eg = 1.0, full single-pile capacity.
export function pileGroupEfficiency({ piles, D, type, sNoReduction, manualEg, apply = true }) {
  const n0 = piles ? piles.length : 0;
  if (n0 === 0) return { valid: false, note: 'No piles defined.', Eg: NaN };
  if (!(D > 0)) return { valid: false, note: 'Pile diameter D must be greater than zero.', Eg: NaN };
  const one = (Eg, applied, method, reason, extra = {}) => ({ valid: true, Eg, applied, method, reason, ...extra });
  if (apply === false) return one(1, false, 'off', 'Group efficiency not applied (project choice) — Eg = 1.0.');
  if (manualEg !== null && manualEg !== undefined && Number.isFinite(manualEg) && manualEg > 0 && manualEg <= 1) {
    return one(manualEg, manualEg < 1, 'manual', 'Eg entered manually.');
  }
  if (n0 === 1) return one(1, false, 'none', 'Single pile — no group effect.');
  if (type === 'end') return one(1, false, 'none', 'End-bearing piles — Eg = 1.0, not reduced.');
  const grid = pileGridInfo(piles);
  const s = minPairSpacing(piles).s;
  if (isSet(sNoReduction) && s >= sNoReduction - EPS) {
    return one(1, false, 'none', `s = ${s.toFixed(3)} m >= ${sNoReduction.toFixed(3)} m — no efficiency reduction.`, { s, m: grid.m, n: grid.n });
  }
  if (!grid.regular) {
    return { valid: true, Eg: NaN, applied: false, method: 'none', s, m: grid.m, n: grid.n,
      reason: 'Layout is not a regular m x n grid — Converse–Labarre does not apply; enter Eg manually.' };
  }
  const { m, n } = grid;
  const thetaDeg = Math.atan(D / s) * 180 / Math.PI;
  const Eg = Math.max(0, 1 - thetaDeg * ((n - 1) * m + (m - 1) * n) / (90 * m * n));
  return one(Eg, true, 'converse-labarre', 'Converse–Labarre (practice).', { s, m, n, thetaDeg });
}

// Row p-multiplier at spacing ratio sD (= s / D) from the (editable) table. Linear interpolation between table
// points, clamped at both ends. belowRange = sD is under the first table point (values held at that point).
function multiplierAt(table, sD, rowIdx) {
  const pts = table.points;
  const rowVal = (pt) => pt.rows[Math.min(rowIdx, pt.rows.length - 1)];
  if (sD <= pts[0].sD + EPS) return { Pm: rowVal(pts[0]), belowRange: sD < pts[0].sD - EPS };
  if (sD >= pts[pts.length - 1].sD - EPS) return { Pm: rowVal(pts[pts.length - 1]), belowRange: false };
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k], b = pts[k + 1];
    if (sD >= a.sD && sD <= b.sD) {
      const t = (sD - a.sD) / (b.sD - a.sD);
      return { Pm: rowVal(a) + t * (rowVal(b) - rowVal(a)), belowRange: false };
    }
  }
  return { Pm: 1, belowRange: false };
}

// Lateral group reduction by p-multipliers for a load acting along dir ('x' | 'z'; z = the pile y axis).
// Rows are the piles sharing a coordinate along dir; row spacing = smallest gap between adjacent rows (conservative).
// sign: +1 / -1 = load toward + / - (leading row = the far end in that direction); 0 = evaluate both, keep the worse.
// Returns per-row Pm plus PmAvg (pile-count-weighted mean) and PmMin. One row only -> Pm = 1, applied false.
export function lateralPMultipliers({ piles, D, dir, sign = 0, table = DEFAULT_P_MULTIPLIERS }) {
  if (!piles || piles.length === 0) return { valid: false, note: 'No piles defined.' };
  if (!(D > 0)) return { valid: false, note: 'Pile diameter D must be greater than zero.' };
  const axis = dir === 'x' ? 'x' : 'y';
  const rowsAsc = clusterCoords(piles.map(p => p[axis]));
  if (rowsAsc.length < 2) {
    return { valid: true, applied: false, dir, rows: rowsAsc.map(r => ({ row: 1, coord: r.coord, count: r.count, Pm: 1 })),
      PmAvg: 1, PmMin: 1, rowSpacing: null, sD: null, belowRange: false, reason: 'Single row in the load direction — no reduction.' };
  }
  let gap = Infinity;
  for (let k = 1; k < rowsAsc.length; k++) gap = Math.min(gap, rowsAsc[k].coord - rowsAsc[k - 1].coord);
  const sD = gap / D;
  const evalSign = (sg) => {
    const ordered = sg >= 0 ? [...rowsAsc].reverse() : rowsAsc; // leading row first
    let belowRange = false;
    const rows = ordered.map((r, idx) => {
      const mult = multiplierAt(table, sD, idx);
      if (mult.belowRange) belowRange = true;
      return { row: idx + 1, coord: r.coord, count: r.count, Pm: mult.Pm };
    });
    const total = rows.reduce((s, r) => s + r.count, 0);
    return { rows, belowRange, PmAvg: rows.reduce((s, r) => s + r.Pm * r.count, 0) / total, PmMin: Math.min(...rows.map(r => r.Pm)) };
  };
  let res;
  if (sign === 0) {
    const a = evalSign(1), b = evalSign(-1);
    res = (b.PmAvg < a.PmAvg || (b.PmAvg === a.PmAvg && b.PmMin < a.PmMin)) ? b : a;
  } else res = evalSign(sign);
  return { valid: true, applied: true, dir, rowSpacing: gap, sD, ...res, source: table.source,
    reason: res.belowRange ? `s/D = ${sD.toFixed(2)} is below the table range — Pm held at the ${table.points[0].sD}D values (conservative extrapolation not available).` : 'p-multipliers by row.' };
}

// Biaxial pile-group distribution for one load combination (rigid cap, equal pile stiffness, so the centre of
// rigidity is the pile-group centroid (x̄, ȳ)).
// load: { P, Hx, Hz, Mx, Mz, Mt, at } at the underside of the cap (down +, same signs as loadTypeVector()).
//   at = { x, y }: plan point (cap coordinates) where P / Hx / Hz act and where Mx / Mz are defined — the pedestal
//   centre, default the cap centre (0, 0). Mt = extra torque about the vertical axis (kN·m, default 0).
// Vertical — moments are first moved to the centroid (P acting off-centroid gives moment):
//   Mz,c = Mz + P·(at.x - x̄),  Mx,c = Mx - P·(at.y - ȳ)
//   F_i = P/n + Mz,c·(x_i - x̄)/Σ(x - x̄)²  -  Mx,c·(y_i - ȳ)/Σ(y - ȳ)²
// Lateral — H shared equally plus torsion from the eccentricity of H about the centroid (a = at - centroid):
//   T = a_y·Hx - a_x·Hz + Mt,   J = Σ[(x_i - x̄)² + (y_i - ȳ)²]
//   Vx_i = Hx/n + T·(y_i - ȳ)/J,   Vz_i = Hz/n - T·(x_i - x̄)/J,   V_i = √(Vx_i² + Vz_i²)
//   UC_l,i = √[(Vx_i/(Pm,x·Ql))² + (Vz_i/(Pm,z·Ql))²], governing = the most loaded pile (y axis = plan z).
// cap: { Qc, Qt, Ql } allowable compression / tension / lateral of ONE pile, kN (ASD — compare against ASD combos;
// no allowable-capacity increase is applied here).
// opts: { Eg (default 1) — scales Qc and Qt;  latX, latZ: lateralPMultipliers() results (default Pm = 1);
//         lateralMethod: 'governing' (Pm,min — default) | 'average' (Pm,avg) — same Pm for every pile }.
// UC = demand / capacity; PASS when every UC <= 1.0. With at = (0,0) on a layout centred on the origin and
// Mx = Hz = Mt = 0, Eg = 1 and no Pm it reproduces evaluatePileCombo() (uniaxial) exactly. A single pile carries
// its own torsion, so T is not distributed (torsionIgnored = true).
export function evaluatePileGroupCombo(piles, load, cap, opts = {}) {
  const n = piles ? piles.length : 0;
  if (n === 0) return { valid: false, note: 'No piles defined.', governingUC: Infinity };
  const { P = 0, Hx = 0, Hz = 0, Mx = 0, Mz = 0, Mt = 0, at } = load;
  const px = at && Number.isFinite(at.x) ? at.x : 0, py = at && Number.isFinite(at.y) ? at.y : 0;
  const { Qc, Qt, Ql } = cap;
  const Eg = opts.Eg === undefined || opts.Eg === null ? 1 : opts.Eg;
  if (!(Eg > 0 && Eg <= 1)) return { valid: false, note: 'Group efficiency Eg must be in (0, 1].', governingUC: Infinity };
  const xbar = piles.reduce((s, p) => s + p.x, 0) / n, ybar = piles.reduce((s, p) => s + p.y, 0) / n;
  const Sxx = piles.reduce((s, p) => s + (p.x - xbar) ** 2, 0), Syy = piles.reduce((s, p) => s + (p.y - ybar) ** 2, 0);
  const Mzc = Mz + P * (px - xbar), Mxc = Mx - P * (py - ybar);
  if (Math.abs(Mzc) > 1e-9 && Sxx <= 1e-9) {
    return { valid: false, note: 'Moment about the z axis cannot be resisted — all piles lie on one line parallel to the z axis.', governingUC: Infinity };
  }
  if (Math.abs(Mxc) > 1e-9 && Syy <= 1e-9) {
    return { valid: false, note: 'Moment about the x axis cannot be resisted — all piles lie on one line parallel to the x axis.', governingUC: Infinity };
  }
  const pileForces = piles.map((p, k) => ({ i: k + 1, x: p.x, y: p.y,
    F: P / n + (Sxx > 1e-9 ? Mzc * (p.x - xbar) / Sxx : 0) - (Syy > 1e-9 ? Mxc * (p.y - ybar) / Syy : 0) }));
  const maxPile = pileForces.reduce((a, b) => (b.F > a.F ? b : a));
  const minPile = pileForces.reduce((a, b) => (b.F < a.F ? b : a));
  const Fmax = maxPile.F, Fmin = minPile.F;
  const QcG = Eg * Qc, QtG = Eg * Qt;
  const ucCompression = Fmax > 0 ? (QcG > 0 ? Fmax / QcG : Infinity) : 0;
  const ucUplift = Fmin < 0 ? (QtG > 0 ? -Fmin / QtG : Infinity) : 0;

  const avg = opts.lateralMethod === 'average';
  const pmOf = (lat) => (lat && lat.valid !== false ? (avg ? lat.PmAvg : lat.PmMin) : 1);
  const PmX = pmOf(opts.latX), PmZ = pmOf(opts.latZ);
  const Hix = Math.abs(Hx) / n, Hiz = Math.abs(Hz) / n;
  const J = Sxx + Syy;
  const T = (py - ybar) * Hx - (px - xbar) * Hz + Mt;
  const torsionIgnored = n === 1 && Math.abs(T) > 1e-9;
  const useT = J > 1e-9 ? T : 0;
  const ucDir = (Vi, Pm) => (Vi > 0 ? (Ql > 0 && Pm > 0 ? Vi / (Pm * Ql) : Infinity) : 0);
  const latPiles = piles.map((p, k) => {
    const Vx = Hx / n + (J > 1e-9 ? useT * (p.y - ybar) / J : 0);
    const Vz = Hz / n - (J > 1e-9 ? useT * (p.x - xbar) / J : 0);
    const ucx = ucDir(Math.abs(Vx), PmX), ucz = ucDir(Math.abs(Vz), PmZ);
    return { i: k + 1, x: p.x, y: p.y, Vx, Vz, V: Math.hypot(Vx, Vz), ucx, ucz, uc: Math.hypot(ucx, ucz) };
  });
  const latGov = latPiles.reduce((a, b) => (b.uc > a.uc ? b : a));
  const ucLateral = latGov.uc;

  const checks = [
    { name: 'Compression', uc: ucCompression },
    { name: 'Uplift', uc: ucUplift },
    { name: 'Lateral', uc: ucLateral }
  ];
  const governingCheck = checks.reduce((a, b) => (b.uc > a.uc ? b : a));
  return {
    valid: true, n, xbar, ybar, Sxx, Syy, pileForces,
    Fmax, FmaxPile: { i: maxPile.i, x: maxPile.x, y: maxPile.y },
    Fmin, FminPile: { i: minPile.i, x: minPile.x, y: minPile.y },
    Mzc, Mxc, at: { x: px, y: py }, T, J, torsionIgnored,
    Hix, Hiz, Hi: Math.hypot(Hix, Hiz), latPiles, Vmax: latGov.V, VmaxPile: { i: latGov.i, x: latGov.x, y: latGov.y },
    Eg, QcG, QtG, PmX, PmZ, ucLx: latGov.ucx, ucLz: latGov.ucz,
    checks, governingCheck, governingUC: governingCheck.uc,
    overallPass: checks.every(c => c.uc <= 1.0)
  };
}
