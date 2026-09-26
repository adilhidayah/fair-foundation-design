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
