// ==========================================================================
// STAAD support reactions per combination -> the load model of the app (Tab 03), pure function (no DOM, no files).
// The reactions of ONE support node for every listed combination become the factors of five unit load types typed in the
// "STAAD support reactions (Y up)" sign mode (staadReactionToFair converts them, as for any typed reaction):
//   FY (P = 1), FX (H = 1), FZ (Hz = 1), MX (Mx = 1), MZ (Mz = 1)  — kind 'otherV' (vertical type: all five components),
// so combination k = { D: kD, FY: FY_k, FX: FX_k, FZ: FZ_k, MX: MX_k, MZ: MZ_k [, TMP: 1] }:
//   P = FY, Fx = −FX, Fz = −FZ, Mx = MX, Mz = MZ at the top of the pedestal (same as reactionToFoundationLoad of the CLI);
//   D carries no load of its own, only the foundation self-weight ΔW of Tab 02 with the factor kD = the factor of the first
//   LOADTYPE Dead primary case in that combination (primaryFactors, REPEAT LOAD expanded);
//   TMP (kind windX, no load) marks a temporary combination = one that contains a LOADTYPE Wind / Seismic primary case.
// Five load types instead of one per combination keep the app light with 164 combinations. The reaction table read is the LAST
// one in the .ANL (parseStaadReactions: a later analysis overwrites an earlier one); units must be KN / METER.
// ==========================================================================
import { parseStaadLoads, parseStaadReactions, primaryFactors, parseCaseList } from './staadOutput.js';

export const STAAD_IMPORT_TYPES = [
  { code: 'D', label: 'Dead load — foundation self-weight only (STAAD reactions are in FY … MZ)', kind: 'dead', values: {} },
  { code: 'FY', label: 'STAAD support reaction FY (factor = FY of the combination)', kind: 'otherV', values: { P: 1 } },
  { code: 'FX', label: 'STAAD support reaction FX (factor = FX)', kind: 'otherV', values: { H: 1 } },
  { code: 'FZ', label: 'STAAD support reaction FZ (factor = FZ)', kind: 'otherV', values: { Hz: 1 } },
  { code: 'MX', label: 'STAAD support reaction MX (factor = MX)', kind: 'otherV', values: { Mx: 1 } },
  { code: 'MZ', label: 'STAAD support reaction MZ (factor = MZ)', kind: 'otherV', values: { M: 1 } },
  { code: 'TMP', label: 'Temporary marker — combination with a STAAD Wind / Seismic case (no load)', kind: 'windX', values: {} }
];
const TEMPORARY_RE = /wind|seismic/i;

// std, anl: file texts; node: support node (default the first node with reactions); lcAsd, lcLrfd: lists ("101-164", "301 TO 400" or
// arrays); deadCase: primary case of the dead load (default the lowest-numbered LOADTYPE Dead case).
export function staadReactionCombos({ std, anl, node = null, lcAsd = '', lcLrfd = '', deadCase = null }) {
  const reac = parseStaadReactions(String(anl || ''));
  if (!reac.unitOk) return { ok: false, error: `Reaction units ${reac.units && reac.units.length ? reac.units.join(' / ') : 'not found'} — print the support reactions in KN / METER (UNIT METER KN before PRINT SUPPORT REACTION).` };
  const keys = Object.keys(reac.reactions);
  if (!keys.length) return { ok: false, error: 'No SUPPORT REACTIONS table in the .ANL file.' };
  const nodes = [...new Set(keys.map(k => +k.split(':')[0]))].sort((a, b) => a - b);
  const nd = node === null || node === undefined || node === '' ? nodes[0] : +node;
  if (!nodes.includes(nd)) return { ok: false, error: `Node ${node} has no reactions in the .ANL (nodes: ${nodes.join(', ')}).`, nodes };
  const loads = parseStaadLoads(String(std || ''));
  const deadCases = Object.entries(loads.primary).filter(([, p]) => /^dead$/i.test(p.type)).map(([n]) => +n);
  const dead = deadCase ?? (deadCases.length ? Math.min(...deadCases) : null);
  const norm = (spec) => parseCaseList(String(spec || '').replace(/\s+TO\s+/gi, '-'));
  const build = (list) => {
    const out = [], missing = [];
    for (const lc of list) {
      const r = reac.reactions[`${nd}:${lc}`];
      if (!r) { missing.push(lc); continue; }
      const fac = primaryFactors(loads, lc);
      const kD = dead !== null ? (fac[dead] || 0) : 0;
      const temporary = Object.entries(fac).some(([p, v]) => v !== 0 && TEMPORARY_RE.test(loads.primary[p]?.type || ''));
      const title = loads.combos[lc]?.title || loads.primary[lc]?.title || `LC ${lc}`;
      const [FX, FY, FZ, MX, , MZ] = r;
      out.push({ lc: String(lc), name: title, temporary, kD,
        f: { D: kD, FY, FX, FZ, MX, MZ, ...(temporary ? { TMP: 1 } : {}) } });
    }
    return { combos: out, missing };
  };
  let asd, lrfd;
  try { asd = build(norm(lcAsd)); lrfd = build(norm(lcLrfd)); } catch (e) { return { ok: false, error: e.message, nodes }; }
  return { ok: true, node: nd, nodes, dead, units: reac.units, loadTypes: STAAD_IMPORT_TYPES, lc: asd.combos, lrfd: lrfd.combos,
    missing: { asd: asd.missing, lrfd: lrfd.missing } };
}
