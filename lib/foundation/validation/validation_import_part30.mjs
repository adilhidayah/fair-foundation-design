// VALIDATION part30 — FAIR command input for a pile cap (SUPPORT PILE): parser + tools/staad-pile.mjs (4B from STAAD reactions).
// Hand calculation: 3 × 3 piles at 1.2 m, D = 400 mm, cap 3 × 3 × 1.0 m (Df 1.2), pedestal 0.6 × 0.6 (0.3 m above grade), γc 24, γs 18.
//   ΔW = cap 3·3·1·24 = 216 + pedestal 0.36·(0.2 + 0.3)·24 = 4.32 + backfill (9 − 0.36)·0.2·18 = 31.104 -> 251.424 kN; Δh = 0.5 + 1.0 = 1.5 m
//   Eg (Converse–Labarre) = 1 − θ[(n−1)m + (m−1)n]/(90mn), θ = atan(0.4/1.2) = 18.435° -> 1 − 18.435·12/810 = 0.7269
//   L/C 101: STAAD FY 400, MZ 80 -> P = 651.424, Mz = 80;  Σ(x − x̄)² = 6·1.44 = 8.64;  F = P/9 ± Mz·1.2/8.64 = 72.380 ± 11.111
//   L/C 102: FX −30, FY 300, FZ 10, MX 20, MZ 120 -> Hx = +30, Hz = −10, P = 551.424, Mz = 120 + 30·1.5 = 165, Mx = 20 − (−10)·1.5 = 35
//            pile 3 (x 1.2, z −1.2): F = 61.269 + 165·1.2/8.64 − 35·(−1.2)/8.64 = 61.269 + 22.917 + 4.861 = 89.047 kN
//            lateral V_x = 30/9 = 3.333, V_z = −10/9 = −1.111 -> V = 3.514 kN
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseFndCommands } from '../index.js';
import { runPileConfig } from '../../../tools/staad-pile.mjs';
let pass = 0, fail = 0;
function ok(n, c, x = '') { if (c) { pass++; console.log('PASS ' + n + ' ' + x); } else { fail++; console.log('FAIL ' + n + ' ' + x); } }
const near = (a, b, tol) => Math.abs(a - b) <= tol;

const FND = ['PROJECT Pile test', 'STD a.std', 'ANL a.ANL', 'LC 101 TO 102', 'CONCRETE UNIT WEIGHT 24', 'SOIL UNIT WEIGHT 18',
  'PILE CAPACITY COMPRESSION 600 TENSION 200 LATERAL 50', 'PILE DIAMETER 400', 'PILE TYPE FRICTION', 'PILE LIMITS MIN 2.5D WARN 3D EDGE 0.4',
  'PILE EFFICIENCY AUTO NOREDUCTION 4D', 'PILE LATERAL PMULT ON AVERAGE',
  'FOUNDATION PC-1 NODE 1 TYPE PEDESTAL SUPPORT PILE', '  CAP 3 3 1 DEPTH 1.2', '  PEDESTAL 0.6 0.6 TOP 0.3', '  PILE GRID 3 3 SPACING 1.2 1.2', 'FINISH', ''].join('\n');

// ---- 1. parser ----
const r = parseFndCommands(FND), pl = r.config.criteria.pile, f = r.config.foundations[0];
ok('no errors', r.errors.length === 0, r.errors.join(' | '));
ok('pile criteria', pl.Qc === 600 && pl.Qt === 200 && pl.Ql === 50 && pl.D === 400 && pl.type === 'friction');
ok('limits keep "<n>D" as text, edge in m', pl.limits.spacingMin === '2.5D' && pl.limits.spacingWarn === '3D' && pl.limits.edgeWarn === 0.4);
ok('efficiency AUTO NOREDUCTION 4D; lateral p-multipliers average', pl.efficiency.sNoReduction === '4D' && pl.lateral.pMultipliers === true && pl.lateral.method === 'average');
ok('SUPPORT PILE + CAP = FOOTING', f.support === 'pile' && f.Bf === 3 && f.Lf === 3 && f.Hf === 1 && f.Df === 1.2);
ok('PILE GRID 3 3 SPACING 1.2 1.2: 9 piles centred on the cap', f.piles.length === 9 && f.piles[0].x === -1.2 && f.piles[0].y === -1.2 && f.piles[8].x === 1.2 && f.piles[8].y === 1.2 && f.piles[4].x === 0 && f.piles[4].y === 0);
const one = parseFndCommands(FND.replace('  PILE GRID 3 3 SPACING 1.2 1.2', '  PILE 1 -0.6 -0.6\n  PILE 2 0.6 0.6')).config.foundations[0].piles;
ok('PILE n x z, one per line', one.length === 2 && one[1].x === 0.6 && one[1].y === 0.6);
ok('PILE EFFICIENCY MANUAL / OFF', parseFndCommands('PILE EFFICIENCY MANUAL 0.9').config.criteria.pile.efficiency.manualEg === 0.9 && parseFndCommands('PILE EFFICIENCY OFF').config.criteria.pile.efficiency.apply === false);
const bad = parseFndCommands('LC 1\nSTD a\nANL b\nCONCRETE UNIT WEIGHT 24\nSOIL UNIT WEIGHT 18\nPILE LIMITS MIN abc\nPILE TYPE X\nFOUNDATION F NODE 1 SUPPORT PILE\n PILE GRID 0 3 SPACING 1 1\n');
ok('bad pile lines reported by line number; missing capacity / diameter / piles reported',
  bad.errors.filter(e => /^line (6|7|9):/.test(e)).length === 3 && bad.errors.some(e => /PILE CAPACITY COMPRESSION/.test(e)) && bad.errors.some(e => /PILE DIAMETER/.test(e)) && bad.errors.some(e => /no piles/.test(e)), bad.errors.join(' | '));
ok('pile and shallow foundations in one file are refused', parseFndCommands(FND.replace('FINISH', 'FOUNDATION S1 NODE 2\n FOOTING 1 1 0.3 DEPTH 0.8\nFINISH')).errors.some(e => /cannot be mixed/.test(e)));

// ---- 2. tools/staad-pile.mjs against the hand calculation ----
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fair-pile-'));
fs.writeFileSync(path.join(dir, 'a.std'), ['LOAD 3 LOADTYPE Dead TITLE D', 'JOINT LOAD', '1 FY -10', 'LOAD 5 LOADTYPE Live TITLE L', 'JOINT LOAD', '1 FY -5', 'LOAD 9 LOADTYPE Wind TITLE W', 'JOINT LOAD', '1 FX 1',
  'LOAD 101 D+L', 'REPEAT LOAD', '3 1 5 1', 'LOAD 102 D+W', 'REPEAT LOAD', '3 1 9 1', ''].join('\n'));
fs.writeFileSync(path.join(dir, 'a.ANL'), ['   SUPPORT REACTIONS -UNIT KN   METE    STRUCTURE TYPE = SPACE', '   -----------------', ' JOINT  LOAD   FORCE-X   FORCE-Y   FORCE-Z     MOM-X     MOM-Y     MOM Z',
  '      1  101      0.00    400.00      0.00      0.00      0.00     80.00', '         102     -30.00    300.00     10.00     20.00      0.00    120.00', ''].join('\n'));
const FND2 = FND.replace('PILE EFFICIENCY AUTO NOREDUCTION 4D\n', '').replace('PILE LATERAL PMULT ON AVERAGE\n', '');
fs.writeFileSync(path.join(dir, 'p.fnd'), FND2);
const cfg = parseFndCommands(FND2).config;
fs.writeFileSync(path.join(dir, 'p.config.json'), JSON.stringify(cfg));
const res = runPileConfig(path.join(dir, 'p.config.json')).results[0];
ok('ΔW = 251.424 kN, Δh = 1.5 m', near(res.w.dW, 251.424, 1e-9) && near(res.w.dh, 1.5, 1e-12), res.w.dW.toFixed(4));
ok('Eg = 0.7269 (Converse–Labarre, 3 × 3 at 1.2 m, D 0.4)', near(res.eff.Eg, 1 - Math.atan(0.4 / 1.2) * 180 / Math.PI * 12 / 810, 1e-12) && near(res.eff.Eg, 0.7269, 5e-5), res.eff.Eg.toFixed(5));
const a = res.rows.find(x => x.lc === 101), b = res.rows.find(x => x.lc === 102);
ok('101: P = 651.424, Mz = 80', near(a.load.P, 651.424, 1e-9) && near(a.load.Mz, 80, 1e-12) && near(a.load.Mx, 0, 1e-12));
ok('101: F_max = 72.380 + 11.111 = 83.491 kN, F_min = 61.269 kN', near(a.Fmax, 651.424 / 9 + 80 * 1.2 / 8.64, 1e-9) && near(a.Fmax, 83.491, 1e-3) && near(a.Fmin, 61.269, 1e-3), a.Fmax.toFixed(4));
ok('102: Hx = 30, Hz = −10, Mz = 165, Mx = 35', near(b.load.Hx, 30, 1e-12) && near(b.load.Hz, -10, 1e-12) && near(b.load.Mz, 165, 1e-12) && near(b.load.Mx, 35, 1e-12));
ok('102: pile 3 force 89.047 kN is the maximum', b.FmaxPile.i === 3 && near(b.Fmax, 551.424 / 9 + 165 * 1.2 / 8.64 + 35 * 1.2 / 8.64, 1e-9) && near(b.Fmax, 89.047, 5e-4), b.Fmax.toFixed(4));
ok('102: lateral V = √(3.333² + 1.111²) = 3.514 kN', near(b.Vmax, Math.hypot(30 / 9, 10 / 9), 1e-9) && near(b.Vmax, 3.514, 5e-4));
ok('102 DCR_c = 89.047 / (0.7269·600) = 0.2042 governs; Wind combination flagged temporary', near(b.checks[0].uc, 89.047 / (res.eff.Eg * 600), 1e-4) && res.gov.lc === 102 && b.temporary && !a.temporary, b.checks[0].uc.toFixed(4));
ok('layout: spacing 1.2 ≥ 2.5D = 1.0 OK, edge 0.30 < 0.40 WARNING (still PASS)', res.layout.spacing.status === 'OK' && res.layout.edge.status === 'WARNING' && res.pass);

// ---- 3. fair-run CLI = the tool, and a missing limit fails like the app ("NOT SET") ----
const tool = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../tools/fair-run.mjs');
const cli = spawnSync(process.execPath, [tool, path.join(dir, 'p.fnd')], { encoding: 'utf8' });
const mdCli = fs.existsSync(path.join(dir, 'p - Pile.md')) ? fs.readFileSync(path.join(dir, 'p - Pile.md'), 'utf8') : '';
ok('CLI exit 0, report "p - Pile.md" identical to runPileConfig()', cli.status === 0 && mdCli.length > 200 && mdCli === runPileConfig(path.join(dir, 'p.config.json')).md, (cli.stderr || cli.stdout).split('\n')[0]);
fs.writeFileSync(path.join(dir, 'q.fnd'), FND2.replace('PILE LIMITS MIN 2.5D WARN 3D EDGE 0.4\n', ''));
const q = spawnSync(process.execPath, [tool, path.join(dir, 'q.fnd')], { encoding: 'utf8' });
ok('no PILE LIMITS: NOT SET -> FAIL (exit 1), as the app', q.status === 1 && /FAIL/.test(q.stdout), q.stdout.split('\n')[0]);
fs.rmSync(dir, { recursive: true, force: true });
console.log(`\nPASS ${pass}  FAIL ${fail}`); process.exit(fail ? 1 : 0);
