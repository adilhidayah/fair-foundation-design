// ==========================================================================
// STAAD OUTPUT — STAAD.Pro text files -> plain data for the foundation checks.
// .std (input): primary load cases (LOAD n LOADTYPE t TITLE x) and combination factors (REPEAT LOAD / LOAD COMB),
// .ANL (output): SUPPORT REACTIONS tables. Extraction and statics only — no fs, no DOM, no code clause involved.
// ==========================================================================

// Joins STAAD continuation lines (a record ending with " -" continues on the next line).
function staadRecords(text) {
  const out = [];
  let buf = '';
  for (const raw of text.split(/\r?\n/)) {
    const s = raw.replace(/\t/g, ' ');
    if (/\s-\s*$/.test(s)) { buf += s.replace(/-\s*$/, ' '); continue; }
    out.push((buf + s).trim());
    buf = '';
  }
  if (buf) out.push(buf.trim());
  return out;
}

// Load cases of a .std file. Returns { primary: { n: { type, title } }, combos: { n: { title, kind, factors: { case: f } } } }.
// kind 'repeat' = REPEAT LOAD (combined before the analysis), 'comb' = LOAD COMB (algebraic sum of results). Reference loads
// (LOAD R1 ... inside DEFINE REFERENCE LOADS) are not load cases and are skipped. A LOAD n without REPEAT LOAD is a primary case
// (type '' when no LOADTYPE is given).
export function parseStaadLoads(text) {
  const recs = staadRecords(text);
  const primary = {}, combos = {};
  let cur = null, readingFactors = false;
  const pairs = (s) => {
    const t = s.split(/\s+/).filter(Boolean);
    if (!t.length || t.length % 2 || !t.every(x => /^-?\d*\.?\d+(E[-+]?\d+)?$/i.test(x))) return null;
    const f = [];
    for (let i = 0; i < t.length; i += 2) f.push([parseInt(t[i], 10), parseFloat(t[i + 1])]);
    return f;
  };
  for (const s of recs) {
    let m;
    if ((m = s.match(/^LOAD\s+COMB(?:INATION)?\s+(\d+)\s*(.*)$/i))) {
      cur = { no: +m[1], title: m[2].trim(), kind: 'comb', factors: {} };
      combos[cur.no] = cur; readingFactors = true; continue;
    }
    if ((m = s.match(/^LOAD\s+(\d+)\b(.*)$/i))) {
      const rest = m[2];
      const lt = rest.match(/LOADTYPE\s+(\S+)/i);
      const tt = rest.match(/TITLE\s+(.*)$/i);
      cur = { no: +m[1], type: lt ? lt[1] : '', title: (tt ? tt[1] : rest.replace(/LOADTYPE\s+\S+(\s+REDUCIBLE)?/i, '')).trim() };
      primary[cur.no] = { type: cur.type, title: cur.title };
      readingFactors = false; continue;
    }
    if (/^LOAD\s+R/i.test(s)) { cur = null; readingFactors = false; continue; }
    if (cur && /^REPEAT\s+LOAD\b/i.test(s)) {
      // the LOAD n just opened is a combination, not a primary case
      delete primary[cur.no];
      cur = { no: cur.no, title: cur.title, kind: 'repeat', factors: {} };
      combos[cur.no] = cur; readingFactors = true; continue;
    }
    if (readingFactors && cur) {
      const f = pairs(s);
      if (f) { f.forEach(([c, v]) => { cur.factors[c] = (cur.factors[c] || 0) + v; }); continue; }
      readingFactors = false;
    }
  }
  return { primary, combos };
}

// Factors of a combination expanded down to primary cases (a REPEAT LOAD may reference another REPEAT LOAD).
export function primaryFactors(loads, no, depth = 0) {
  const c = loads.combos[no];
  if (!c) return loads.primary[no] ? { [no]: 1 } : {};
  if (depth > 20) throw new Error(`Combination ${no}: nesting too deep`);
  const out = {};
  for (const [k, f] of Object.entries(c.factors)) {
    const sub = primaryFactors(loads, +k, depth + 1);
    for (const [p, g] of Object.entries(sub)) out[p] = (out[p] || 0) + f * g;
  }
  return out;
}

// SUPPORT REACTIONS of a .ANL file. Returns { units: [force, length] of the last table, unitOk, reactions: { 'node:lc': [FX, FY,
// FZ, MX, MY, MZ] } } — a later table (later analysis) overwrites an earlier one for the same node and case. Tables continue on
// the next page under a new header without the joint number, so the node carries over.
export function parseStaadReactions(text) {
  const L = text.split(/\r?\n/);
  const reactions = {};
  let units = null, unitOk = true, inTab = false, node = null;
  const num = '\\s+(-?[\\d.]+(?:E[-+]?\\d+)?)';
  const r2 = new RegExp('^\\s+(\\d+)\\s+(\\d+)' + num.repeat(6) + '\\s*$', 'i');
  const r3 = new RegExp('^\\s{8,}(\\d+)' + num.repeat(6) + '\\s*$', 'i');
  for (const t of L) {
    const h = t.match(/SUPPORT REACTIONS\s*-UNIT\s+(\S+)\s+(\S+)/i);
    if (h) {
      units = [h[1].toUpperCase(), h[2].toUpperCase()];
      if (units[0] !== 'KN' || !units[1].startsWith('MET')) unitOk = false;
      inTab = true; continue;
    }
    if (!inTab) continue;
    if (/END OF LATEST|\*{5,}|MEMBER END FORCES|JOINT DISPLACEMENT/i.test(t)) { inTab = false; continue; }
    let m;
    if ((m = t.match(r2))) { node = +m[1]; reactions[`${node}:${+m[2]}`] = m.slice(3, 9).map(Number); }
    else if ((m = t.match(r3)) && node !== null) { reactions[`${node}:${+m[1]}`] = m.slice(2, 8).map(Number); }
  }
  return { units, unitOk, reactions };
}

// STAAD support reaction (force of the support ON the structure, global axes, Y up) -> load the structure puts on the top of the
// foundation, in the FAIR sign convention of lib/foundation/shared/loadCombinations.js (x = STAAD X, z = STAAD Z):
//   P  = +FY (downward load positive)          Fx = −FX, Fz = −FZ
//   Mz = +MZ, Mx = +MX  — FAIR moments are the negative of the right-hand moment of the load (Mz > 0 compresses the +x side,
//   Mx > 0 compresses the −z side, as loadTypeVector(): Fx at height h gives Mz = +Fx·h, Fz gives Mx = −Fz·h); the load's
//   right-hand moment is −M_reaction, so the two sign changes cancel.  T = −MY (torsion, not used by the shallow-footing checks).
export function reactionToFoundationLoad(r) {
  const [FX, FY, FZ, MX, MY, MZ] = r;
  return { P: FY, Fx: -FX, Fz: -FZ, Mx: MX, Mz: MZ, T: -MY };
}

// "101-164, 170, 180-182" -> [101, ..., 164, 170, 180, 181, 182]; arrays pass through.
export function parseCaseList(spec) {
  if (Array.isArray(spec)) return spec.map(Number);
  const out = [];
  String(spec || '').split(/[,\s]+/).filter(Boolean).forEach(p => {
    const m = p.match(/^(\d+)(?:-(\d+))?$/);
    if (!m) throw new Error(`Bad load case list item "${p}"`);
    const a = +m[1], b = m[2] ? +m[2] : a;
    for (let i = a; i <= b; i++) out.push(i);
  });
  return out;
}
