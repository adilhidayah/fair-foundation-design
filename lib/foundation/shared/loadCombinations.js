// ==========================================================================
// SHARED — LOAD COMBINATIONS
// ASCE 7-16 §2.4.1 ASD baseline combinations, plus the generic factor-combination
// + top-of-footing-to-bottom-of-footing transfer used by every equipment category.
// Pure functions/data — no DOM access.
// ==========================================================================

// Default ASD combinations (D, L, W, E, T) — the starting point shown in "03 — Loading
// Data"; a project can add, edit or remove rows from there, and can add its own load
// types beyond D/L/W/E/T (combineLoadCombo() below sums over whatever loadTypeCodes it's given).
export function defaultCombos() {
  return [
    { name: 'D + L',                  f: { D: 1.0, L: 1.0,  W: 0,    E: 0,     T: 0 } },
    { name: 'D + L + T',              f: { D: 1.0, L: 1.0,  W: 0,    E: 0,     T: 1.0 } },
    { name: 'D + 0.6W',               f: { D: 1.0, L: 0,    W: 0.6,  E: 0,     T: 0 } },
    { name: 'D + 0.75L + 0.45W',      f: { D: 1.0, L: 0.75, W: 0.45, E: 0,     T: 0 } },
    { name: '0.6D + 0.6W',            f: { D: 0.6, L: 0,    W: 0.6,  E: 0,     T: 0 } },
    { name: 'D + 0.75L + 0.525E',     f: { D: 1.0, L: 0.75, W: 0,    E: 0.525, T: 0 } },
    { name: '0.6D + 0.7E',            f: { D: 0.6, L: 0,    W: 0,    E: 0.7,   T: 0 } }
  ];
}

// combo: { name, f: { <loadTypeCode>: factor, ... } }
// loads: { <loadTypeCode>: { P, H, M }, ... }  (unfactored, top of footing/pedestal)
// loadTypeCodes: array of load type codes to sum over (e.g. ['D','L','W','E','T'], extendable)
// dW: added self-weight (footing + pedestal + backfill), kN. dh: height top-of-footing/pedestal to underside of footing, m.
export function combineLoadCombo(combo, loads, loadTypeCodes, dW, dh) {
  let Ptop = 0, Htop = 0, Mtop = 0;
  loadTypeCodes.forEach(code => {
    const f = combo.f[code] || 0;
    const load = loads[code];
    if (!load) return;
    Ptop += f * load.P;
    Htop += f * load.H;
    Mtop += f * load.M;
  });
  return {
    Ptop, Htop, Mtop,
    Pbot: Ptop + dW,
    Hbot: Htop,
    Mbot: Mtop + Htop * dh
  };
}

// Standard petrochemical vertical-vessel/equipment foundation combination set — 101-126, matching the
// "A.3.2 Loading Combination" report: ASCE 7-16 §2.4.1 basic (ASD) combos for Empty/Operating/Test equipment
// condition, plus §2.4.5 alternative seismic combos using (1±0.14·SDS) and (1+0.105·SDS) near-source factors,
// with the 100%/30% orthogonal seismic combination rule (0.7(EQX(E)+0.3EQZ(E)) etc). Column codes: D, L, Lr,
// E(E)/E(O)/E(T) (equipment condition), WX/WZ (wind, transversal/longitudinal), EQX(E)/EQZ(E) (seismic, empty
// condition), EQX(O)/EQZ(O) (seismic, operating condition). sds: S_DS (g), from the Seismic Load Generator.
export function buildStdCombos(sds) {
  const k1 = 1 + 0.14 * sds;
  const k2 = 1 + 0.105 * sds;
  const k3 = 0.6 - 0.14 * sds;
  return [
    { lc: '101', cond: 'Empty Condition', formula: 'D + E(E)', f: { D: 1, 'E(E)': 1 } },
    { lc: '102', cond: 'Empty Condition', formula: 'D + E(E) + L', f: { D: 1, 'E(E)': 1, L: 1 } },
    { lc: '103', cond: 'Empty Condition', formula: 'D + E(E) + Lr', f: { D: 1, 'E(E)': 1, Lr: 1 } },
    { lc: '104', cond: 'Empty Condition', formula: 'D + E(E) + 0.75L + 0.75Lr', f: { D: 1, 'E(E)': 1, L: 0.75, Lr: 0.75 } },
    { lc: '105', cond: 'Empty Condition', formula: 'D + E(E) + 0.6WX', f: { D: 1, 'E(E)': 1, WX: 0.6 } },
    { lc: '106', cond: 'Empty Condition', formula: 'D + E(E) + 0.6WZ', f: { D: 1, 'E(E)': 1, WZ: 0.6 } },
    { lc: '107', cond: 'Empty Condition', formula: 'D + E(E) + 0.75L + 0.45WX + 0.75Lr', f: { D: 1, 'E(E)': 1, L: 0.75, Lr: 0.75, WX: 0.45 } },
    { lc: '108', cond: 'Empty Condition', formula: 'D + E(E) + 0.75L + 0.45WZ + 0.75Lr', f: { D: 1, 'E(E)': 1, L: 0.75, Lr: 0.75, WZ: 0.45 } },
    { lc: '109', cond: 'Empty Condition', formula: '0.6[D + E(E)] + 0.6WX', f: { D: 0.6, 'E(E)': 0.6, WX: 0.6 } },
    { lc: '110', cond: 'Empty Condition', formula: '0.6[D + E(E)] + 0.6WZ', f: { D: 0.6, 'E(E)': 0.6, WZ: 0.6 } },
    { lc: '111', cond: 'Empty Condition', formula: '(1 + 0.14SDS)[D + E(E)] + 0.7(EQX(E) + 0.3EQZ(E))', f: { D: k1, 'E(E)': k1, 'EQX(E)': 0.7, 'EQZ(E)': 0.21 } },
    { lc: '112', cond: 'Empty Condition', formula: '(1 + 0.14SDS)[D + E(E)] + 0.7(0.3EQX(E) + EQZ(E))', f: { D: k1, 'E(E)': k1, 'EQX(E)': 0.21, 'EQZ(E)': 0.7 } },
    { lc: '113', cond: 'Empty Condition', formula: '(1 + 0.105SDS)[D + E(E)] + 0.75L + 0.525(EQX(E) + 0.3EQZ(E))', f: { D: k2, 'E(E)': k2, L: 0.75, 'EQX(E)': 0.525, 'EQZ(E)': 0.1575 } },
    { lc: '114', cond: 'Empty Condition', formula: '(1 + 0.105SDS)[D + E(E)] + 0.75L + 0.525(0.3EQX(E) + EQZ(E))', f: { D: k2, 'E(E)': k2, L: 0.75, 'EQX(E)': 0.1575, 'EQZ(E)': 0.525 } },
    { lc: '115', cond: 'Empty Condition', formula: '(0.6 - 0.14SDS)[D + E(E)] + 0.7(EQX(E) + 0.3EQZ(E))', f: { D: k3, 'E(E)': k3, 'EQX(E)': 0.7, 'EQZ(E)': 0.21 } },
    { lc: '116', cond: 'Empty Condition', formula: '(0.6 - 0.14SDS)[D + E(E)] + 0.7(0.3EQX(E) + EQZ(E))', f: { D: k3, 'E(E)': k3, 'EQX(E)': 0.21, 'EQZ(E)': 0.7 } },
    { lc: '117', cond: 'Operating Condition', formula: 'D + E(O)', f: { D: 1, 'E(O)': 1 } },
    { lc: '118', cond: 'Operating Condition', formula: 'D + E(O) + L', f: { D: 1, 'E(O)': 1, L: 1 } },
    { lc: '119', cond: 'Operating Condition', formula: 'D + E(O) + 0.75L + 0.45WX', f: { D: 1, 'E(O)': 1, L: 0.75, WX: 0.45 } },
    { lc: '120', cond: 'Operating Condition', formula: 'D + E(O) + 0.75L + 0.45WZ', f: { D: 1, 'E(O)': 1, L: 0.75, WZ: 0.45 } },
    { lc: '121', cond: 'Operating Condition', formula: '(1 + 0.105SDS)[D + E(O)] + 0.75L + 0.525(EQX(O) + 0.3EQZ(O))', f: { D: k2, 'E(O)': k2, L: 0.75, 'EQX(O)': 0.525, 'EQZ(O)': 0.1575 } },
    { lc: '122', cond: 'Operating Condition', formula: '(1 + 0.105SDS)[D + E(O)] + 0.75L + 0.525(0.3EQX(O) + EQZ(O))', f: { D: k2, 'E(O)': k2, L: 0.75, 'EQX(O)': 0.1575, 'EQZ(O)': 0.525 } },
    { lc: '123', cond: 'Operating Condition', formula: 'D + E(O) + L', f: { D: 1, 'E(O)': 1, L: 1 } },
    { lc: '124', cond: 'Test Condition', formula: 'D + E(T)', f: { D: 1, 'E(T)': 1 } },
    { lc: '125', cond: 'Test Condition', formula: 'D + E(T) + 0.75L + 0.45WX', f: { D: 1, 'E(T)': 1, L: 0.75, WX: 0.45 } },
    { lc: '126', cond: 'Test Condition', formula: 'D + E(T) + 0.75L + 0.45WZ', f: { D: 1, 'E(T)': 1, L: 0.75, WZ: 0.45 } }
  ];
}

// Strength-design (LRFD) counterpart of buildStdCombos() — used for pile cap flexure and shear (ACI 318M-19 expects
// factored actions), never for the ASD checks (pile capacity, stability, bearing). Numbered 201+ so they cannot be
// confused with the ASD set 101-126. ASCE 7-22 §2.3.1 basic combinations (1: 1.4D; 2: 1.2D + 1.6L + 0.5Lr;
// 3: 1.2D + 1.6Lr + (L or 0.5W); 4: 1.2D + 1.0W + L + 0.5Lr; 6: 0.9D + 1.0W) and §2.3.6 / §12.4.2.3 for seismic with the
// vertical seismic effect Ev = 0.2·SDS·D ((1.2 + 0.2SDS)D + E + L; (0.9 − 0.2SDS)D + E) and the 100%/30% orthogonal
// rule. W and E are the strength-level values (the same load types the ASD set scales by 0.6 / 0.7). ρ (redundancy)
// is taken as 1.0 and L as 1.0 in wind / seismic combinations (ASCE 7 allows 0.5 only for low live loads) — every
// factor stays editable in the UI. Dead-type group per equipment condition: D + E(E) / D + E(O) / D + E(T).
export function buildLrfdCombos(sds) {
  const kHi = 1.2 + 0.2 * sds, kLo = 0.9 - 0.2 * sds;
  const out = [];
  let n = 200;
  const add = (cond, formula, f) => { n += 1; out.push({ lc: String(n), cond, formula, f }); };
  const cases = [
    { cond: 'Empty Condition', g: 'E(E)', eqx: 'EQX(E)', eqz: 'EQZ(E)', full: true },
    { cond: 'Operating Condition', g: 'E(O)', eqx: 'EQX(O)', eqz: 'EQZ(O)', full: false },
    { cond: 'Test Condition', g: 'E(T)', eqx: null, eqz: null, full: false }
  ];
  cases.forEach(c => {
    const G = `[D + ${c.g}]`, dead = (k) => ({ D: k, [c.g]: k });
    add(c.cond, `1.4${G}`, dead(1.4));
    add(c.cond, `1.2${G} + 1.6L${c.full ? ' + 0.5Lr' : ''}`, { ...dead(1.2), L: 1.6, ...(c.full ? { Lr: 0.5 } : {}) });
    if (c.full) {
      add(c.cond, `1.2${G} + 1.6Lr + L`, { ...dead(1.2), Lr: 1.6, L: 1 });
      add(c.cond, `1.2${G} + 1.6Lr + 0.5WX`, { ...dead(1.2), Lr: 1.6, WX: 0.5 });
      add(c.cond, `1.2${G} + 1.6Lr + 0.5WZ`, { ...dead(1.2), Lr: 1.6, WZ: 0.5 });
    }
    add(c.cond, `1.2${G} + 1.0WX + L${c.full ? ' + 0.5Lr' : ''}`, { ...dead(1.2), WX: 1, L: 1, ...(c.full ? { Lr: 0.5 } : {}) });
    add(c.cond, `1.2${G} + 1.0WZ + L${c.full ? ' + 0.5Lr' : ''}`, { ...dead(1.2), WZ: 1, L: 1, ...(c.full ? { Lr: 0.5 } : {}) });
    if (c.full || c.eqx) {
      add(c.cond, `0.9${G} + 1.0WX`, { ...dead(0.9), WX: 1 });
      add(c.cond, `0.9${G} + 1.0WZ`, { ...dead(0.9), WZ: 1 });
    }
    if (c.eqx) {
      add(c.cond, `(1.2 + 0.2SDS)${G} + 1.0(${c.eqx} + 0.3${c.eqz}) + L`, { ...dead(kHi), [c.eqx]: 1, [c.eqz]: 0.3, L: 1 });
      add(c.cond, `(1.2 + 0.2SDS)${G} + 1.0(0.3${c.eqx} + ${c.eqz}) + L`, { ...dead(kHi), [c.eqx]: 0.3, [c.eqz]: 1, L: 1 });
      add(c.cond, `(0.9 − 0.2SDS)${G} + 1.0(${c.eqx} + 0.3${c.eqz})`, { ...dead(kLo), [c.eqx]: 1, [c.eqz]: 0.3 });
      add(c.cond, `(0.9 − 0.2SDS)${G} + 1.0(0.3${c.eqx} + ${c.eqz})`, { ...dead(kLo), [c.eqx]: 0.3, [c.eqz]: 1 });
    }
  });
  return out;
}

// Load type "kind" — what a load type IS, independent of the code/notation an engineer uses for it (e.g. a
// seismic load written as "V" is kind 'eqX'). The kind decides how its P/H/M enter the biaxial vector:
//   dir 'V' -> P vertical, plus its own biaxial H/M if any: H -> Fx, M -> Mz, Hz -> Fz, Mx -> Mx
//              (Mx entered as the signed component, not a magnitude; Fz transfers as dMx = -Fz·dh)
//   dir 'X' -> Fx = H, Mz = M            (transversal)
//   dir 'Z' -> Fz = H, Mx = -M           (longitudinal, sign convention of the Design Load Summary)
// temporary: wind/seismic -> the lower "Temporary" minimum FS applies to combos that include it.
export const LOAD_KINDS = {
  dead:      { label: 'Dead load',                 dir: 'V', temporary: false },
  live:      { label: 'Live load',                 dir: 'V', temporary: false },
  roofLive:  { label: 'Roof live load',            dir: 'V', temporary: false },
  equipment: { label: 'Equipment load',            dir: 'V', temporary: false },
  windX:     { label: 'Wind — X-direction',        dir: 'X', temporary: true },
  windZ:     { label: 'Wind — Z-direction',        dir: 'Z', temporary: true },
  eqX:       { label: 'Earthquake — X-direction',  dir: 'X', temporary: true },
  eqZ:       { label: 'Earthquake — Z-direction',  dir: 'Z', temporary: true },
  otherV:    { label: 'Other — vertical',          dir: 'V', temporary: false },
  otherX:    { label: 'Other — lateral X',         dir: 'X', temporary: false },
  otherZ:    { label: 'Other — lateral Z',         dir: 'Z', temporary: false }
};
// Kinds of the built-in / legacy codes (legacy generic W/E are treated as X-direction, T as a lateral-X load).
export const DEFAULT_KIND_BY_CODE = {
  D: 'dead', L: 'live', Lr: 'roofLive',
  'E(E)': 'equipment', 'E(O)': 'equipment', 'E(T)': 'equipment',
  WX: 'windX', WZ: 'windZ',
  'EQX(E)': 'eqX', 'EQZ(E)': 'eqZ', 'EQX(O)': 'eqX', 'EQZ(O)': 'eqZ',
  W: 'windX', E: 'eqX', T: 'otherX'
};

// Unfactored biaxial vector of one load type from its kind. load: { P, H, M, Hz, Mx } (kN, kN·m, top of
// pedestal) — Hz / Mx only used by vertical kinds (a lateral kind's direction is fixed by the kind itself).
// dh: top of pedestal -> underside of footing (m). Returns null for an unknown/missing kind (caller decides
// how to report it — never silently treated as some default direction).
export function loadTypeVector(kind, load, dh) {
  const k = LOAD_KINDS[kind];
  if (!k) return null;
  const P = load.P || 0, H = load.H || 0, M = load.M || 0;
  const v = { P: 0, Fx: 0, Fz: 0, Mx: 0, Mz: 0, dP: 0, dMz: 0, dMx: 0 };
  if (k.dir === 'Z') { v.Fz = H; v.Mx = -M; v.dMx = -(H * dh); }
  else { v.P = k.dir === 'V' ? P : 0; v.Fx = H; v.Mz = M; v.dMz = H * dh; }
  if (k.dir === 'V') {
    const Hz = load.Hz || 0;
    v.Fz = Hz; v.Mx = load.Mx || 0; v.dMx = -(Hz * dh);
  }
  return v;
}

// Per-code base for stdComboVector(). items: [{ code, kind, P, H, M }]. The foundation self-weight dW is added
// once, as dP of code 'D' if present, else of the first 'dead'-kind item. Items with an unknown kind are left
// out of base and listed in `untyped` so the UI can warn instead of silently counting them as zero.
export function buildComboBase(items, dh, dW) {
  const base = {}, untyped = [];
  items.forEach(it => {
    const v = loadTypeVector(it.kind, it, dh);
    if (v) base[it.code] = v; else untyped.push(it.code);
  });
  const deadCode = base.D && items.some(it => it.code === 'D' && it.kind === 'dead') ? 'D'
    : (items.find(it => it.kind === 'dead' && base[it.code]) || {}).code;
  if (deadCode) base[deadCode].dP = dW;
  return { base, untyped, dWOn: deadCode || null };
}

// Biaxial version of combineLoadCombo() — sums a combo's factors over per-code Fx/Fz/Mx/Mz/P vectors (plus
// dP/dMz/dMx top->bottom transfer terms) instead of a single scalar H/M, for a code set that's already
// direction-resolved (WX/WZ, EQX(E)/EQZ(E), EQX(O)/EQZ(O)) rather than one generic W/E. base: { <code>: {P,Fx,Fz,Mx,Mz,dP,
// dMz,dMx}, ... } — a code missing from base contributes nothing (e.g. a legacy generic code not covered by the
// direction-resolved set, which still works through combineLoadCombo() instead).
export function stdComboVector(f, base) {
  const v = { P: 0, Fx: 0, Fz: 0, Mx: 0, Mz: 0, dP: 0, dMz: 0, dMx: 0 };
  Object.keys(f).forEach(k => {
    const b = base[k], factor = f[k];
    if (!b) return;
    v.P += b.P * factor; v.Fx += b.Fx * factor; v.Fz += b.Fz * factor;
    v.Mx += b.Mx * factor; v.Mz += b.Mz * factor;
    v.dP += b.dP * factor; v.dMz += b.dMz * factor; v.dMx += b.dMx * factor;
  });
  return v;
}
