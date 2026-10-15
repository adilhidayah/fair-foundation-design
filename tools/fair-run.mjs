// FAIR command input -> shallow foundation stability / design report (Node CLI).
// Reads a STAAD-style text file (.fnd, syntax in lib/foundation/import/fndCommands.js), turns it into the config of
// tools/staad-stability.mjs (same file the existing JSON route uses, written next to the .fnd) and runs it. No formulas here.
// SUPPORT PILE foundations run the 4B pile group check instead (tools/staad-pile.mjs).
//
//   node tools/fair-run.mjs <input.fnd> [--out report.md] [--check]
//     --check   parse only: list syntax errors, print nothing else
import fs from 'node:fs';
import path from 'node:path';
import { parseFndCommands } from '../lib/foundation/index.js';
import { runConfig } from './staad-stability.mjs';
import { runPileConfig } from './staad-pile.mjs';

const args = process.argv.slice(2);
if (!args[0]) { console.error('Usage: node tools/fair-run.mjs <input.fnd> [--out <report.md>] [--check]'); process.exit(2); }
const src = path.resolve(args[0]);
const { config, errors, warnings } = parseFndCommands(fs.readFileSync(src, 'utf8'));
warnings.forEach(w => console.error('warning: ' + w));
if (errors.length) { errors.forEach(e => console.error('error: ' + e)); process.exit(2); }
if (args.includes('--check')) { console.log(`${path.basename(src)}: OK — ${config.foundations.length} foundation(s)`); process.exit(0); }
const base = src.replace(/\.[^.\\/]+$/, '');
const cfgP = base + '.config.json';
fs.writeFileSync(cfgP, JSON.stringify(config, null, 2), 'utf8');
const oi = args.indexOf('--out');
const isPile = config.foundations.some(f => f.support === 'pile');   // SUPPORT PILE -> 4B pile cap (tools/staad-pile.mjs), else shallow
const outP = oi >= 0 ? path.resolve(args[oi + 1]) : base + (isPile ? ' - Pile.md' : ' - Stability.md');
const { results, md } = isPile ? runPileConfig(cfgP) : runConfig(cfgP, outP);
fs.writeFileSync(outP, md, 'utf8');
for (const r of results) {
  const g = r.gov;
  console.log(`${r.f.name}: ${r.pass ? 'PASS' : 'FAIL'}` + (g ? ` — L/C ${g.lc}, UC ${Number(g.governingUC).toFixed(3)}` : ' — no reactions'));
}
console.log(`Report: ${outP}`);
process.exit(results.every(r => r.pass) ? 0 : 1);
