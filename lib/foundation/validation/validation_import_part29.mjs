// VALIDATION part29 — FAIR command input (.fnd, STAAD style): parseFndCommands() -> staad-stability config, and tools/fair-run.mjs.
// The parser has no formulas: the checks are (1) every command lands in the config field the JSON route documents, (2) bad input is
// reported with its line, (3) the CLI gives exactly the same results as the JSON route for the same project.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseFndCommands } from '../index.js';
import { runConfig } from '../../../tools/staad-stability.mjs';
let pass = 0, fail = 0;
function ok(n, c, x = '') { if (c) { pass++; console.log('PASS ' + n + ' ' + x); } else { fail++; console.log('FAIL ' + n + ' ' + x); } }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---- 1. mapping of commands to config fields ----
const FND = [
  '* header comment', 'FAIR FOUNDATION', 'PROJECT Pipe support PT TIP', 'STD a.std', 'ANL a.anl', 'UNIT METER KN',
  'LC 101 TO 110 120', 'LC LRFD 301 TO 310', 'DEAD CASE 3',
  'CONCRETE UNIT WEIGHT 24', 'SOIL UNIT WEIGHT 18', 'ALLOWABLE BEARING 100', 'FRICTION 0.4', 'ECCENTRICITY 1/6',
  'FS SLIDING 1.5 1.2', 'FS OVERTURNING 2', 'BEARING METHOD MEYERHOF', 'MIN CONTACT 0.7',
  'SOIL C 6.8 PHI 18.8 METHOD MEYERHOF FS 3 FSTEMP 2',
  'DESIGN FC 21.7 FY 420 COVER 75 BAR 13 ASMIN BEAM', 'AUTO THICKNESS TO 0.8 STEP 0.05 OPTIMIZE',
  'PEDESTAL DESIGN BAR 16 TIE 10 LEGS 2 -', '   CLEARCOVER_IGNORED_BELOW', 'PEDESTAL AUTOSIZE TO 0.8 STEP 0.05',
  'ANCHOR ASE 157 FUTA 400 HEF 300 ABRG 400 REINFORCEMENT SPACING 100 150', 'DRAWINGS ON',
  'FOUNDATION "PS-1.2 F1" NODE 1 TYPE PEDESTAL', '  FOOTING 1.0 1.0 0.3 DEPTH 0.9', '  PEDESTAL 0.3 0.3 TOP 0.3', '  OFFSET 0.05 -0.05', '  GROUT 25',
  '  BASEPLATE 0.4 0.4 25', '  BOLTS 4 DIA 24 SX 200 SZ 200', '  AUTOSIZE 0.6 2.5 0.1',
  'FOUNDATION F2 NODE 2 TYPE BLOCK', '  FOOTING 2 2 0.5', '  DP 0.6', '  LC 101', '  DEAD CASE 5', 'FINISH'
].map(l => l.replace('   CLEARCOVER_IGNORED_BELOW', '   COVER 50 FYT 420 RHOMIN 0.01')).join('\n');
const r = parseFndCommands(FND), c = r.config, k = c.criteria;
ok('no errors', r.errors.length === 0, r.errors.join(' | '));
ok('project / files', c.project === 'Pipe support PT TIP' && c.std === 'a.std' && c.anl === 'a.anl');
ok('"101 TO 110 120" -> "101-110,120"; LRFD "301-310"; dead case 3', c.lc === '101-110,120' && c.lc_lrfd === '301-310' && c.dead_case === 3);
ok('criteria gc / gs / qa / mu / ecc', k.gc === 24 && k.gs === 18 && k.qa === 100 && k.mu === 0.4 && k.ecc === '1/6');
ok('FS sliding permanent + temporary; FS overturning one value used for both', k.fsSlidePerm === 1.5 && k.fsSlideTemp === 1.2 && k.fsOTPerm === 2 && k.fsOTTemp === 2);
ok('bearing method, min contact', k.bearMethod === 'meyerhof' && k.minContact === 0.7);
ok('soil block', same(k.soil, { c: 6.8, phi: 18.8, FS: 3, FSTemp: 2, method: 'meyerhof' }));
ok('design + auto thickness', same(k.design, { fc: 21.7, fy: 420, cover: 75, bar: 13, asMin: 'beam', autoThickness: { to: 0.8, step: 0.05, optimize: true } }));
ok('pedestal design (line continued with "-") + autosize', k.pedestal.bar === 16 && k.pedestal.tie === 10 && k.pedestal.legs === 2 && k.pedestal.clearCover === 50 && k.pedestal.fyt === 420 && k.pedestal.rhoMin === 0.01 && same(k.pedestal.autoSize, { step: 0.05, to: 0.8 }));
ok('anchor + spacing list', same(k.pedestal.anchor, { spacings: [100, 150], Ase: 157, futa: 400, hef: 300, Abrg: 400, reinforcement: true }));
ok('drawings', c.drawings === true);
const [f1, f2] = c.foundations;
ok('F1 (quoted name with space)', f1.name === 'PS-1.2 F1' && f1.node === 1 && f1.type === 'pedestal' && f1.Bf === 1 && f1.Lf === 1 && f1.Hf === 0.3 && f1.Df === 0.9);
ok('F1 pedestal, offset, grout, base plate, bolts, autosize', f1.Bp === 0.3 && f1.Lp === 0.3 && f1.pedGp === 0.3 && f1.OffX === 0.05 && f1.OffZ === -0.05 && f1.groutT === 25
  && same(f1.baseplate, { B: 0.4, L: 0.4, t: 25 }) && same(f1.bolts, { n: 4, dia: 24, sx: 200, sz: 200 }) && same(f1.autosize, { from: 0.6, to: 2.5, step: 0.1 }));
ok('F2 block: Dp, own LC and dead case (do not leak to F1)', f2.type === 'block' && f2.Dp === 0.6 && f2.lc === '101' && f2.dead_case === 5 && f1.lc === undefined && f1.dead_case === undefined && c.dead_case === 3);
ok('ANCHOR SPACING STEP', parseFndCommands('ANCHOR ASE 1 SPACING STEP 10 SMIN 100').config.criteria.pedestal.anchor.spacingStep === 10);
ok('case-insensitive keywords, tab separators', parseFndCommands('lc\t5\tto\t8').config.lc === '5-8');

// ---- 2. errors carry the line number ----
const bad = parseFndCommands('PROJECT x\nFRICTION abc\nFOOTING 1 1 1\nFLY 3\nLC 101 TO\nFOUNDATION F1\n  FOOTING 1 1\n');
ok('bad number, FOOTING outside FOUNDATION, unknown command, open TO, short FOOTING -> 5 line errors',
  bad.errors.filter(e => /^line \d+:/.test(e)).map(e => e.match(/^line (\d+)/)[1]).join(',') === '2,3,4,5,7', bad.errors.join(' | '));
ok('missing STD / ANL / LC reported', bad.errors.some(e => /STD and ANL/.test(e)) && bad.errors.some(e => /LC .* required/.test(e)));
ok('no FOUNDATION reported', parseFndCommands('LC 1').errors.some(e => /no FOUNDATION/.test(e)));

// ---- 3. CLI = JSON route (same project, same results) ----
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fair-fnd-'));
fs.writeFileSync(path.join(dir, 'a.std'), ['LOAD 3 LOADTYPE Dead TITLE D', 'JOINT LOAD', '1 FY -10', 'LOAD 5 LOADTYPE Live TITLE L', 'JOINT LOAD', '1 FY -5', 'LOAD 101 D+L', 'REPEAT LOAD', '3 1 5 1', ''].join('\n'));
fs.writeFileSync(path.join(dir, 'a.ANL'), ['   SUPPORT REACTIONS -UNIT KN   METE    STRUCTURE TYPE = SPACE', '   -----------------', ' JOINT  LOAD   FORCE-X   FORCE-Y   FORCE-Z     MOM-X     MOM-Y     MOM Z', '      1  101      1.00     15.00      0.00      0.00      0.00      1.50', ''].join('\n'));
const FND2 = ['PROJECT T', 'STD a.std', 'ANL a.ANL', 'LC 101', 'CONCRETE UNIT WEIGHT 24', 'SOIL UNIT WEIGHT 18', 'ALLOWABLE BEARING 100', 'FRICTION 0.4', 'ECCENTRICITY NONE',
  'FS SLIDING 1.5', 'FS OVERTURNING 1.5', 'FOUNDATION F1 NODE 1 TYPE PEDESTAL', ' FOOTING 1.2 1.2 0.3 DEPTH 0.8', ' PEDESTAL 0.3 0.3 TOP 0.3', ' GROUT 25', 'FINISH', ''].join('\n');
fs.writeFileSync(path.join(dir, 't.fnd'), FND2);
fs.writeFileSync(path.join(dir, 'j.json'), JSON.stringify({ project: 'T', std: 'a.std', anl: 'a.ANL', lc: '101',
  criteria: { gc: 24, gs: 18, qa: 100, mu: 0.4, ecc: 0, fsSlidePerm: 1.5, fsSlideTemp: 1.5, fsOTPerm: 1.5, fsOTTemp: 1.5 },
  foundations: [{ name: 'F1', node: 1, type: 'pedestal', Bf: 1.2, Lf: 1.2, Hf: 0.3, Df: 0.8, Bp: 0.3, Lp: 0.3, pedGp: 0.3, groutT: 25 }] }));
const viaJson = runConfig(path.join(dir, 'j.json'));
const tool = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../tools/fair-run.mjs');
const cli = spawnSync(process.execPath, [tool, path.join(dir, 't.fnd')], { encoding: 'utf8' });
const mdCli = fs.existsSync(path.join(dir, 't - Stability.md')) ? fs.readFileSync(path.join(dir, 't - Stability.md'), 'utf8') : '';
ok('CLI ran (exit 0 = PASS, 1 = FAIL are both normal)', cli.status === 0 || cli.status === 1, (cli.stderr || '').slice(0, 200));
ok('config written next to the .fnd', fs.existsSync(path.join(dir, 't.config.json')));
ok('CLI report = JSON-route report (project name aside)', mdCli.length > 100 && mdCli === viaJson.md, `${mdCli.length} / ${viaJson.md.length}`);
ok('CLI verdict line agrees with the JSON route', new RegExp('F1: ' + (viaJson.results[0].pass ? 'PASS' : 'FAIL')).test(cli.stdout), cli.stdout.split('\n')[0]);
ok('--check on a bad file exits 2 with the line', spawnSync(process.execPath, [tool, path.join(dir, 'x.fnd')], { encoding: 'utf8' }).status !== 0
  && (fs.writeFileSync(path.join(dir, 'x.fnd'), 'LC 101\nFLY\n'), (() => { const q = spawnSync(process.execPath, [tool, path.join(dir, 'x.fnd'), '--check'], { encoding: 'utf8' }); return q.status === 2 && /line 2/.test(q.stderr); })()));
fs.rmSync(dir, { recursive: true, force: true });
console.log(`\nPASS ${pass}  FAIL ${fail}`); process.exit(fail ? 1 : 0);
