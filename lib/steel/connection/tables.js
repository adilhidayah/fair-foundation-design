// ==========================================================================
// STEEL CONNECTION — standard variant tables (capacity tables per SC type)
// Each type has a list of pre-detailed variants (bolt count / size, plate, weld). The allowable (ASD) or design (LRFD)
// capacity of a variant for one load key is the largest force for which every check of the type passes, found by
// bisection on checkConnection() — so the table always follows the same limit states as the project check.
// A project picks the lightest variant with capacity >= demand, then runs the full check with its own forces and
// members (the table assumes the supported/supporting members stated in `basis`).
// ==========================================================================
import { checkConnection } from './types.js';

// JIS G 3192 equal angles: gross area (mm²)
const ANG = { 65: { t: 6, Ag: 752.7 }, 75: { t: 6, Ag: 872.7 }, 90: { t: 7, Ag: 1222 }, 100: { t: 7, Ag: 1362 } };

export const LOAD_KEYS = {
  'SC-01': ['V'], 'SC-02': ['T', 'C'], 'SC-03': ['T'], 'SC-04': ['P', 'T', 'V'], 'SC-05': ['M'], 'SC-06': ['V', 'H'],
};
export const LOAD_LABEL = { V: 'V (kN)', T: 'T (kN)', C: 'C (kN)', P: 'P (kN)', M: 'M (kN-m)', H: 'H (kN)' };

const sc01 = (d, n) => {
  const tp = d === 16 ? 8 : 10, w = d === 16 ? 6 : 8, lev = d === 16 ? 35 : 40, s = d === 16 ? 60 : 70;
  const hp = 2 * lev + (n - 1) * s;
  return { kode: `SC01-${d}-${n}`, param: { boltD: d, n, s, lev, leh: lev, a: 60, tp, w },
    uraian: `${n}-M${d}, PL ${tp}x${60 + lev}x${hp}, ${w} FW` };
};
const sc02 = (b, n, d = 16) => {
  const A = ANG[b], s = d === 16 ? 60 : 70, le = d === 16 ? 35 : 40, Lgw = Math.max(200, 120 + n * s);
  return { kode: `SC02-L${b}-${n}`, param: { boltD: d, n, s, le, leg: le, tg: 10, Lgw, w: 6, angle: { b, t: A.t, Ag: A.Ag, Fy: 245, Fu: 400 } },
    uraian: `L${b}x${b}x${A.t}, ${n}-M${d}, GUSSET PL 10, 6 FW L=${Lgw}` };
};
const sc03 = (d) => {
  const g = { 12: [8, 60, 35, 80], 16: [10, 70, 40, 80], 20: [12, 80, 45, 100], 24: [12, 90, 50, 120] }[d];
  return { kode: `SC03-D${d}`, param: { rodD: d, tp: g[0], bt: g[1], et: g[2], Lt: g[3], w: 6 },
    uraian: `ROD D${d}, TAB PL ${g[0]}x${g[3]}x${g[1]}, 6 FW` };
};
const sc04 = (d) => {
  const tc = d === 16 ? 12 : 16;
  return { kode: `SC04-${d}`, param: { boltD: d, n: 4, tc, w: 6 }, uraian: `4-M${d}, CAP PL ${tc}x200x250, 6 FW ALL AROUND` };
};
const sc05 = (d, nRow) => {
  const tfp = d === 16 ? 12 : 16, w = d === 16 ? 8 : 10, s = d === 16 ? 60 : 70, le = d === 16 ? 35 : 40;
  return { kode: `SC05-${d}-${nRow}`, param: { boltD: d, nRow, s, le, tfp, w, cekKolom: false },
    uraian: `${2 * nRow}-M${d}/FLANGE, PL ${tfp}x125, ${w} FW` };
};
const sc06 = (d) => ({ kode: `SC06-${d}`, param: { boltD: d, n: 2, tp: d === 12 ? 8 : 10, w: 5 },
  uraian: `2-M${d}, CLEAT PL ${d === 12 ? 8 : 10}x100x120, 5 FW` });

export const VARIANTS = {
  'SC-01': { basis: 'supported web tw >= 6 mm (A36), A325-N bolts, standard holes', list: [16, 20].flatMap(d => [2, 3, 4, 5].map(n => sc01(d, n))) },
  'SC-02': { basis: 'JIS equal angle A36 (fy 245), A325-N M16, gusset PL 10, Lbuck 150, K 0.65, weld x1.25',
    list: [65, 75, 90, 100].flatMap(b => [2, 3, 4].map(n => sc02(b, n))) },
  'SC-03': { basis: 'threaded rod A36 (fy 245), turnbuckle SWL by supplier', list: [12, 16, 20, 24].map(sc03) },
  'SC-04': { basis: 'column H175X175X7.5X11, beam H250X125X6X9; other members: recheck', list: [16, 20].map(sc04) },
  'SC-05': { basis: 'beam H250X125X6X9, connection only (bolts, plates, welds, beam flange); column flange / web / panel zone (J10) checked per project',
    list: [16, 20].flatMap(d => [2, 3, 4].map(n => sc05(d, n))) },
  'SC-06': { basis: 'cold-formed purlin t 3.2 (bearing per AISI S100 to be confirmed)', list: [12, 16].map(sc06) },
};

// largest force (load key) for which all checks pass
export function variantCapacity({ type, params, key, method = 'ASD' }) {
  const run = x => checkConnection({ type, params, forces: { [key]: x }, method });
  const r0 = run(1e-6);
  if (!r0.overallPass) return { cap: 0, governing: 'detailing / geometry: ' + r0.governing };
  let lo = 0, hi = 1;
  while (run(hi).overallPass && hi < 1e6) { lo = hi; hi *= 2; }
  for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (run(m).overallPass) lo = m; else hi = m; }
  return { cap: lo, governing: run(hi).governing };
}

export function capacityTable(type, method = 'ASD') {
  const V = VARIANTS[type];
  if (!V) throw new Error('no variant table for ' + type);
  return {
    type, method, basis: V.basis, keys: LOAD_KEYS[type],
    rows: V.list.map(v => {
      const cap = {}, gov = {};
      for (const k of LOAD_KEYS[type]) { const r = variantCapacity({ type, params: v.param, key: k, method }); cap[k] = r.cap; gov[k] = r.governing; }
      return { kode: v.kode, uraian: v.uraian, param: v.param, cap, gov };
    }),
  };
}

// lightest variant (table order) whose capacity covers every given demand, e.g. pickVariant('SC-02', { T: 40, C: 25 })
export function pickVariant(type, demand, method = 'ASD') {
  const t = capacityTable(type, method);
  return t.rows.find(r => Object.entries(demand).every(([k, v]) => r.cap[k] == null || r.cap[k] >= Math.abs(v))) || null;
}
