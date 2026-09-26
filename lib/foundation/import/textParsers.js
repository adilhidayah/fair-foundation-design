// ==========================================================================
// TEXT PARSERS — OCR / pasted text -> plain data candidates for user review.
// Extraction only: no calculation, no unit conversion (ton -> kN stays in the
// UI per AGENTS.md §4), no DOM. Every result is shown to the user for
// verification before it is applied.
// ==========================================================================

// --- Load types: "1. Dead Load D" / "a. Empty Load E(E)" -> [{code, label}] ---
// Tracks a running "category" from bare heading lines (e.g. "Equipment Load", "Pipe Load") and folds it into
// short sub-item labels like "Empty Load" / "Operating Load" / "Test Load" so E(E)/P(E) etc. don't read as
// the same thing.
const LT_SYMBOL_RE = /^[A-Za-z]{1,4}(\([A-Za-z]{1,2}\))?$/;
const LT_SYMBOL_BLACKLIST = /^(load|force|forces|device|pressure|impact|symbol|pulling)$/i;
export function parseLoadTypeText(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const results = [];
  let category = '';
  lines.forEach(raw => {
    const line = raw.replace(/^\(?\s*(?:\d{1,2}|[a-cA-C])\)?[.)]?\s+/, '').trim();
    if (!line) return;
    if (/^no\.?$/i.test(line) || /^load and forces?$/i.test(line) || /^symbol$/i.test(line)) return;
    const parts = line.split(/\s+/);
    const last = parts[parts.length - 1];
    if (parts.length >= 2 && LT_SYMBOL_RE.test(last) && !LT_SYMBOL_BLACKLIST.test(last)) {
      let label = parts.slice(0, -1).join(' ');
      if (category && /^(empty|operating|test)\s+load$/i.test(label)) label = category + ' ' + label;
      results.push({ code: last, label });
    } else if (parts.length <= 3 && /load$/i.test(line)) {
      category = line.replace(/\s+load$/i, '');
    }
  });
  return results;
}

// --- Equipment weights: datasheet text -> raw {value, unit} per condition ---
// Scans line-by-line for the first line matching each keyword (empty/operating/test) and pulls the first
// number on that line plus its unit token. Unit defaults to 'ton' when unmarked (datasheet weights are
// normally given as mass). The caller converts to kN.
const EQUIPMENT_WEIGHT_KEYWORDS = [
  { cond: 'empty', re: /empty/i },
  { cond: 'operating', re: /operat/i },
  { cond: 'test', re: /\btest\b/i }
];
export function parseEquipmentWeightText(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  return EQUIPMENT_WEIGHT_KEYWORDS.map(({ cond, re }) => {
    const line = lines.find(l => re.test(l));
    if (!line) return { cond, found: false };
    const numMatch = line.match(/-?\d+\.?\d*/);
    if (!numMatch) return { cond, found: false, line };
    const unitMatch = line.match(/\b(tonne|ton|kg|kn|lbs|lb)\b/i);
    return { cond, found: true, line, value: parseFloat(numMatch[0]), unit: unitMatch ? unitMatch[0].toLowerCase() : 'ton' };
  });
}

// --- Foundation dimensions (Tab 02): free text / OCR -> [{key, value, unit, src}] + support / type keywords ---
// Keys: Bf, Lf, Hf, Df, Bp, Lp, Gp, OffX, OffZ (lengths), tGrout (grout thickness), hEmbed (pile embedment in cap).
// Two forms: labelled values ("Df 1.5 m", "Bp=1250mm", "Off X: -0.2") and size groups after a keyword
// ("footing 2.4 x 2.4 x 0.8" -> Bf, Lf, Hf; "pedestal 1.25 x 1.25" -> Bp, Lp). The value and its unit token
// ('mm' | 'cm' | 'm' | null) are returned raw — the UI converts to the field unit. The first occurrence of a key
// wins; a later, different value is reported in `conflicts`. Decimal comma is accepted ("2,4"); a comma followed
// by exactly three digits is a thousands separator ("1,250" = 1250).
const FD_NUM = '(-?\\d+(?:[.,]\\d+)?)';
const FD_UNIT = '(?:\\s*(mm|cm|m)\\b)?';
const FD_LABELS = [
  { key: 'Bf', re: 'B_?f' }, { key: 'Lf', re: 'L_?f' }, { key: 'Hf', re: 'H_?f' }, { key: 'Df', re: 'D_?f|(?:foundation\\s+)?(?<!embedment\\s)depth' },
  { key: 'Bp', re: 'B_?p' }, { key: 'Lp', re: 'L_?p' }, { key: 'Gp', re: 'G_?p' },
  { key: 'OffX', re: 'off(?:set)?[\\s_]*x|e_?x' }, { key: 'OffZ', re: 'off(?:set)?[\\s_]*z|e_?z' },
  { key: 'tGrout', re: 'grout(?:ing)?(?:\\s+thickness)?|t_?g(?:rout)?' },
  { key: 'hEmbed', re: '(?:pile\\s+)?embed(?:ment|ded)?(?:\\s+length)?|h_?embed' }
];
function fdNum(s) {
  return Number(/^-?\d+,\d{3}$/.test(s) ? s.replace(',', '') : s.replace(',', '.'));
}
export function parseFoundationDimText(text) {
  const t = String(text || '');
  const found = []; // {key, value, unit, src, at}
  FD_LABELS.forEach(({ key, re }) => {
    const rx = new RegExp(`\\b(?:${re})\\b\\s*[=:]?\\s*${FD_NUM}${FD_UNIT}`, 'gi');
    for (const m of t.matchAll(rx)) found.push({ key, value: fdNum(m[1]), unit: m[2] ? m[2].toLowerCase() : null, src: m[0].trim(), at: m.index });
  });
  const ignored = [];
  const X = '\\s*[x×*]\\s*';
  const grp = new RegExp(`\\b(footing|pile\\s*cap|cap|pedestal|ped)\\b[^0-9\\n-]{0,20}?${FD_NUM}${FD_UNIT}${X}${FD_NUM}${FD_UNIT}(?:${X}${FD_NUM}${FD_UNIT})?`, 'gi');
  for (const m of t.matchAll(grp)) {
    const isPed = /^ped/i.test(m[1]);
    const vals = [[m[2], m[3]], [m[4], m[5]], [m[6], m[7]]].filter(v => v[0] !== undefined);
    const lastUnit = [...vals].reverse().find(v => v[1])?.[1] || null; // "2.4 x 2.4 x 0.8 m": one unit for the group
    const keys = isPed ? ['Bp', 'Lp'] : ['Bf', 'Lf', 'Hf'];
    vals.forEach(([v, u], i) => {
      if (!keys[i]) { ignored.push(`${m[0].trim()} (third pedestal value: height is entered as Gp)`); return; }
      found.push({ key: keys[i], value: fdNum(v), unit: (u || lastUnit || null)?.toLowerCase() ?? null, src: m[0].trim(), at: m.index + i / 10 });
    });
  }
  found.sort((a, b) => a.at - b.at);
  const fields = [], conflicts = [];
  found.forEach(f => {
    const first = fields.find(x => x.key === f.key);
    if (!first) fields.push({ key: f.key, value: f.value, unit: f.unit, src: f.src });
    else if (first.value !== f.value || first.unit !== f.unit) conflicts.push({ key: f.key, value: f.value, unit: f.unit, src: f.src });
  });
  const isPile = /\bpile(?:s|d)?\b/i.test(t), isShallow = /\b(?:shallow|spread\s+footing|isolated\s+footing)\b/i.test(t);
  const support = isPile && !isShallow ? 'pile' : (isShallow && !isPile ? 'shallow' : null);
  const isBlock = /\b(?:no|without)\s+pedestal\b|\b(?:footing|cap)\s+only\b/i.test(t);
  const type = isBlock ? 'block' : (/\bpedestal\b/i.test(t) ? 'pedestal' : null);
  return { fields, conflicts, ignored, support, type };
}

// --- Load combinations: Excel paste / OCR text -> factor rows ---
// Maps columns by a REQUIRED header row whose cells are registered load type codes (`codes`), so factors
// always land on codes the calculations actually read (a header not in `codes` is reported, never used).
// Tab-separated text (Excel copy) maps cells by column position; other text (OCR) is split on whitespace / "|"
// and its trailing numeric tokens are mapped right-aligned onto the code columns.
const normCode = s => String(s || '').trim().replace(/\s+/g, '').toUpperCase();
export function parseFactorCell(s) {
  const t = String(s ?? '').trim();
  if (t === '' || t === '-' || t === '—') return 0;
  const v = Number(/^-?\d+,\d+$/.test(t) ? t.replace(',', '.') : t); // "1,112" = decimal comma
  return isFinite(v) ? v : NaN;
}
export function parseComboImport(text, codes) {
  const lines = String(text || '').split(/\r?\n/).filter(l => l.trim() !== '');
  const tabbed = lines.some(l => l.includes('\t'));
  const split = l => tabbed ? l.split('\t').map(c => c.trim()) : l.trim().split(/\s*\|\s*|\s+/).filter(Boolean);
  const codeByNorm = new Map(codes.map(code => [normCode(code), code]));
  const isCodeish = h => /^(D|L|LR|T|W[XZ]?|E(\([EOT]\))?|EQ[XZ]?(\([EO]\))?|EQE[XZ]|[A-Z]{1,3}\([A-Z]\))$/.test(normCode(h));
  // Header = first line with at least two registered codes.
  const hIdx = lines.findIndex(l => split(l).filter(c => codeByNorm.has(normCode(c))).length >= 2);
  if (hIdx < 0) return { ok: false, reason: 'no-header' };
  const header = split(lines[hIdx]);
  const cols = header.map((h, i) => ({ i, h, code: codeByNorm.get(normCode(h)) || null }));
  const codeCols = cols.filter(c => c.code);
  const unknown = cols.filter(c => !c.code && isCodeish(c.h)).map(c => c.h);
  const noCol = cols.find(c => !c.code && /^(no\.?|lc|lc\s*no\.?|nr\.?)$/i.test(c.h));
  const nameCol = cols.find(c => !c.code && /comb|desc|formula|name|kombinasi/i.test(c.h));
  const rows = [];
  lines.slice(hIdx + 1).forEach(line => {
    const cells = split(line);
    const f = {}; let bad = false, lc = '', name = '';
    if (tabbed) {
      codeCols.forEach(c => { const v = parseFactorCell(cells[c.i]); if (Number.isNaN(v)) bad = true; else if (v) f[c.code] = v; });
      lc = noCol ? (cells[noCol.i] || '') : '';
      name = nameCol ? (cells[nameCol.i] || '') : '';
    } else {
      let k = cells.length; // trailing numeric tokens, right-aligned onto the code columns
      while (k > 0 && !Number.isNaN(parseFactorCell(cells[k - 1])) && cells[k - 1] !== '') k--;
      const nums = cells.slice(k).slice(-codeCols.length), lead = cells.slice(0, k);
      if (!nums.length) return; // text-only line (group row, title)
      const offset = codeCols.length - nums.length;
      nums.forEach((t, j) => { const v = parseFactorCell(t); if (v) f[codeCols[offset + j].code] = v; });
      if (nums.length < codeCols.length) bad = true; // fewer numbers than code columns -> alignment is a guess
      if (lead.length && /^\d{1,4}$/.test(lead[0])) lc = lead.shift();
      name = lead.join(' ');
    }
    const hasNumbers = Object.keys(f).length > 0;
    if (!hasNumbers && !bad) return; // group rows ("Empty Condition"), blank separators
    if (!name) name = Object.entries(f).map(([c, v]) => `${v === 1 ? '' : +v.toFixed(3)}${c}`).join(' + ');
    rows.push({ lc: String(lc).trim(), name: name.trim(), f, bad });
  });
  return { ok: true, rows, codes: codeCols.map(c => c.code), unknown, tabbed };
}
