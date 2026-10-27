// VALIDATION part35 — top reinforcement option of a footing / pile cap: topLayerDesign() (lib), TOP MAT of the .fnd, and the CLI tables.
//   'bottom' (default): a top layer only where a combination gives hogging (designed as flexuralDesign: A_s = max(A_s,req, A_s,min)).
//   'two': a top mat always, A_s = max(hogging design, ρ_top·b·t), ρ_top default 0.0009.
// Hand values: b = 2400 mm, t = 500 mm, d = 409 mm, f'c 25, f_y 420 -> ρ_top·b·t = 0.0009·2400·500 = 1080 mm²; A_s,min (slab) = 0.0018·2400·500 = 2160 mm².
//   bars D16 (201.06 mm²): s_req = 201.06·2400/1080 = 446.8 -> 425 mm (25 mm steps, ≤ min(3t, 450)), n = ⌈(2400 − 2·75 − 16)/425⌉ + 1 = 7, A_s,prov = 1407 mm²
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { topLayerDesign, flexuralDesign, barLayout, parseFndCommands } from '../index.js';
let pass = 0, fail = 0;
function ok(n, c, x = '') { if (c) { pass++; console.log('PASS ' + n + ' ' + x); } else { fail++; console.log('FAIL ' + n + ' ' + x); } }
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// ---- 1. topLayerDesign ----
const b = 2400, t = 500, d = 409, fc = 25, fy = 420;
ok("'bottom', no hogging: no top layer (previous behaviour)", topLayerDesign(0, b, d, t, fc, fy).required === false && topLayerDesign(0, b, d, t, fc, fy, { mode: 'bottom' }).design === null);
const m = topLayerDesign(0, b, d, t, fc, fy, { mode: 'two' });
ok("'two', no hogging: minimum top mat 0.0009·2400·500 = 1080 mm², A_s,req 0, flagged minOnly", m.required && m.minOnly && near(m.design.As, 1080, 1e-9) && m.design.AsCalc === 0 && m.design.ok);
ok("'two' with ρ_top = 0.0012: 1440 mm²", near(topLayerDesign(0, b, d, t, fc, fy, { mode: 'two', rhoTop: 0.0012 }).design.As, 1440, 1e-9));
const hog = 300, ref = flexuralDesign(hog, b, d, t, fc, fy, 'slab');
const h1 = topLayerDesign(hog, b, d, t, fc, fy, { mode: 'bottom' }), h2 = topLayerDesign(hog, b, d, t, fc, fy, { mode: 'two' });
ok("hogging 300 kN·m, 'bottom': the same as flexuralDesign (A_s = max(A_s,req, 2160))", h1.required && !h1.minOnly && h1.design.As === ref.As && h1.design.AsCalc === ref.AsCalc && near(ref.AsMin, 2160, 1e-9));
ok("hogging 300 kN·m, 'two': max(flexural design, 1080) = the flexural design (2160 governs)", h2.design.As === Math.max(ref.As, 1080) && near(h2.design.As, 2160, 1e-9));
const hb = topLayerDesign(50, b, d, t, fc, fy, { mode: 'two', rhoTop: 0.002, asMinRule: 'slab' });
ok("small hogging with ρ_top = 0.002 (2400 mm² > 2160): the top ratio governs", near(hb.design.As, 0.002 * b * t, 1e-9) && hb.design.AsCalc === flexuralDesign(50, b, d, t, fc, fy).AsCalc);
ok('a hogging moment too large for the section is reported (ok: false)', topLayerDesign(1e5, b, d, t, fc, fy, { mode: 'two' }).design.ok === false);
const lay = barLayout(1080, b, 16, t, 25, 75);
ok('bars for 1080 mm²: D16 @ 425, 7 bars, 1407 mm²', lay.s === 425 && lay.n === 7 && near(lay.AsProv, 7 * Math.PI / 4 * 256, 1e-6), `${lay.s} ${lay.n} ${lay.AsProv.toFixed(1)}`);

// ---- 2. TOP MAT command ----
ok('TOP MAT ON RHO 0.0012 -> design.topLayer { two, 0.0012 }; TOP MAT ON (default ρ); TOP MAT OFF',
  JSON.stringify(parseFndCommands('TOP MAT ON RHO 0.0012').config.criteria.design.topLayer) === '{"mode":"two","rhoTop":0.0012}'
  && JSON.stringify(parseFndCommands('TOP MAT ON').config.criteria.design.topLayer) === '{"mode":"two"}'
  && parseFndCommands('TOP MAT OFF').config.criteria.design.topLayer.mode === 'bottom');
ok('TOP MAT without ON / OFF is a line error', parseFndCommands('TOP MAT').errors.some(e => /^line 1:.*TOP MAT ON/.test(e)));

// ---- 3. CLI: shallow footing and pile cap, with and without TOP MAT ----
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fair-top-'));
fs.writeFileSync(path.join(dir, 'a.std'), ['LOAD 3 LOADTYPE Dead TITLE D', 'JOINT LOAD', '1 FY -10', 'LOAD 5 LOADTYPE Live TITLE L', 'JOINT LOAD', '1 FY -5',
  'LOAD 101 D+L', 'REPEAT LOAD', '3 1 5 1', 'LOAD 301 1.2D+1.6L', 'REPEAT LOAD', '3 1.2 5 1.6', ''].join('\n'));
fs.writeFileSync(path.join(dir, 'a.ANL'), ['   SUPPORT REACTIONS -UNIT KN   METE    STRUCTURE TYPE = SPACE', '   -----------------', ' JOINT  LOAD   FORCE-X   FORCE-Y   FORCE-Z     MOM-X     MOM-Y     MOM Z',
  '      1  101      0.00    300.00      0.00      0.00      0.00     20.00', '         301      0.00    420.00      0.00      0.00      0.00     28.00', ''].join('\n'));
const common = ['STD a.std', 'ANL a.ANL', 'LC 101', 'LC LRFD 301', 'CONCRETE UNIT WEIGHT 24', 'SOIL UNIT WEIGHT 18', 'DESIGN FC 25 FY 420 COVER 75 BAR 16'];
const shallow = [...common, 'ALLOWABLE BEARING 150', 'FRICTION 0.4', 'ECCENTRICITY NONE', 'FS SLIDING 1.5', 'FS OVERTURNING 1.5', 'FOUNDATION F1 NODE 1 TYPE PEDESTAL', ' FOOTING 2.4 2.4 0.5 DEPTH 1.2', ' PEDESTAL 0.6 0.6 TOP 0.3', 'FINISH'];
const pile = [...common, 'PILE CAPACITY COMPRESSION 600 TENSION 200 LATERAL 50', 'PILE DIAMETER 400', 'PILE LIMITS MIN 2.5D WARN 3D EDGE 0.3',
  'FOUNDATION PC NODE 1 TYPE PEDESTAL SUPPORT PILE', ' CAP 3 3 0.5 DEPTH 1.0', ' PEDESTAL 0.6 0.6 TOP 0.3', ' PILE GRID 3 3 SPACING 1.2 1.2', 'FINISH'];
const tool = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../tools/fair-run.mjs');
const runFnd = (name, lines, out) => { fs.writeFileSync(path.join(dir, name + '.fnd'), lines.join('\n') + '\n'); spawnSync(process.execPath, [tool, path.join(dir, name + '.fnd'), '--no-html'], { encoding: 'utf8' }); return fs.readFileSync(path.join(dir, `${name} - ${out}.md`), 'utf8'); };
const row = (md, key) => (md.split('\n').find(l => l.startsWith(`| ${key} |`)) || '');
const s0 = runFnd('s0', shallow, 'Stability'), s1 = runFnd('s1', [...shallow.slice(0, 7), 'TOP MAT ON', ...shallow.slice(7)], 'Stability');
ok('shallow, no TOP MAT: top layers "not required" (unchanged)', /not required/.test(row(s0, 'x-top')) && /not required/.test(row(s0, 'z-top')), row(s0, 'x-top'));
ok('shallow, TOP MAT ON: x-top = minimum mat 1080 mm², D16 @ 425 (7 bars), 1407 mm²', /minimum top mat/.test(row(s1, 'x-top')) && /\| 0 \| 1080 \| D16 @ 425 \(7 bars\) \| 1407 \| OK \|/.test(row(s1, 'x-top')), row(s1, 'x-top'));
ok('shallow, TOP MAT ON: the bottom layers are the same as without it', row(s0, 'x-bottom') === row(s1, 'x-bottom') && row(s0, 'z-bottom') === row(s1, 'z-bottom'));
const p0 = runFnd('p0', pile, 'Pile'), p1 = runFnd('p1', [...pile.slice(0, 7), 'TOP MAT ON RHO 0.0012', ...pile.slice(7)], 'Pile');
ok('pile cap, TOP MAT ON RHO 0.0012: top mat 0.0012·3000·500 = 1800 mm² in both directions', /\| 0 \| 1800 \|/.test(row(p1, 'x-top')) && /\| 0 \| 1800 \|/.test(row(p1, 'z-top')) && /not required/.test(row(p0, 'x-top')), row(p1, 'x-top'));
ok('pile cap: the bottom layers and the checks do not change with TOP MAT', row(p0, 'x-bottom') === row(p1, 'x-bottom') && /One-way shear x/.test(p1));
fs.rmSync(dir, { recursive: true, force: true });
console.log(`\nPASS ${pass}  FAIL ${fail}`); process.exit(fail ? 1 : 0);
