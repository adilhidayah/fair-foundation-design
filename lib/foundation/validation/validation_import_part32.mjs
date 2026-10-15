// VALIDATION part32 — auto-thickness of a pile cap (AUTO THICKNESS ... with SUPPORT PILE, tools/staad-pile.mjs).
// Hand calculation, the cap of part31 (3 × 3 piles at 1.2 m, D 400, pedestal 0.6 × 0.6, f'c 25, f_y 420, cover 75, D16), thickness H = 0.30 m,
// pedestal depth below grade locked Dp = 0.2 m (Df = 0.5 m):
//   ΔW = cap 3·3·0.3·24 = 64.8 + pedestal 0.36·(0.2 + 0.3)·24 = 4.32 + backfill (9 − 0.36)·0.2·18 = 31.104 -> 100.224 kN;  d = 300 − 75 − 16 = 209 mm
//   L/C 302: P = 720 + 1.2·100.224 = 840.269 kN, Mz = 140 (Hp = 0.5 m, Fx = 0), pedestal-base moment Mz = 140;  V_u = P − F_centre = P·8/9 = 746.906 kN
//   b_o = 4·(600 + 209) = 3236 mm;  v_direct = 746906/(3236·209) = 1.1043 MPa;  b1 = b2 = 809 mm: γ_v = 1 − 1/(1 + 2/3) = 0.4,
//   J_c = d·b1³/6 + b1·d³/6 + d·b2·b1²/2 = 7.500e10 mm⁴;  v_Mz = 0.4·140e6·404.5/J_c = 0.3020 MPa;  v_u = 1.4063 MPa
//   φv_c: λ_s = min(1, √(2/(1 + 0.004·209))) = 1; v_c = min(0.33, 0.17·3, 0.083(40·209/3236 + 2))·√25 = 1.65 MPa; φv_c = 1.2375 MPa;  UC = 1.136
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

const FND = ['PROJECT Auto thickness', 'STD a.std', 'ANL a.ANL', 'LC 101', 'LC LRFD 301 TO 303', 'CONCRETE UNIT WEIGHT 24', 'SOIL UNIT WEIGHT 18',
  'PILE CAPACITY COMPRESSION 600 TENSION 200 LATERAL 50', 'PILE DIAMETER 400', 'PILE LIMITS MIN 2.5D WARN 3D EDGE 0.3',
  'DESIGN FC 25 FY 420 COVER 75 BAR 16', 'AUTO THICKNESS FROM 0.3 TO 1.2 STEP 0.05',
  'FOUNDATION PC-1 NODE 1 TYPE PEDESTAL SUPPORT PILE', '  CAP 3 3 0.3', '  DP 0.2', '  PEDESTAL 0.6 0.6 TOP 0.3', '  PILE GRID 3 3 SPACING 1.2 1.2', 'FINISH', ''].join('\n');
const r = parseFndCommands(FND);
ok('parser: AUTO THICKNESS FROM / TO / STEP with SUPPORT PILE accepted', r.errors.length === 0 && r.config.criteria.design.autoThickness.from === 0.3 && r.config.criteria.design.autoThickness.to === 1.2 && r.config.criteria.design.autoThickness.step === 0.05, r.errors.join(' | '));
ok('parser: missing TO, missing LC LRFD, missing DESIGN are errors',
  parseFndCommands(FND.replace('TO 1.2 ', '')).errors.some(e => /needs TO/.test(e)) && parseFndCommands(FND.replace('LC LRFD 301 TO 303\n', '')).errors.some(e => /needs LC LRFD/.test(e))
  && parseFndCommands(FND.replace('DESIGN FC 25 FY 420 COVER 75 BAR 16\n', '')).errors.some(e => /needs DESIGN/.test(e)));

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fair-autoth-'));
fs.writeFileSync(path.join(dir, 'a.std'), ['LOAD 3 LOADTYPE Dead TITLE D', 'JOINT LOAD', '1 FY -10', 'LOAD 5 LOADTYPE Live TITLE L', 'JOINT LOAD', '1 FY -5', 'LOAD 9 LOADTYPE Wind TITLE W', 'JOINT LOAD', '1 FX 1',
  'LOAD 101 D+L', 'REPEAT LOAD', '3 1 5 1', 'LOAD 301 1.4D', 'REPEAT LOAD', '3 1.4', 'LOAD 302 1.2D+1.6L', 'REPEAT LOAD', '3 1.2 5 1.6', 'LOAD 303 1.2D+W', 'REPEAT LOAD', '3 1.2 9 1.0', ''].join('\n'));
fs.writeFileSync(path.join(dir, 'a.ANL'), ['   SUPPORT REACTIONS -UNIT KN   METE    STRUCTURE TYPE = SPACE', '   -----------------', ' JOINT  LOAD   FORCE-X   FORCE-Y   FORCE-Z     MOM-X     MOM-Y     MOM Z',
  '      1  101      0.00    400.00      0.00      0.00      0.00     80.00', '         301      0.00    560.00      0.00      0.00      0.00    112.00', '         302      0.00    720.00      0.00      0.00      0.00    140.00',
  '         303    -30.00    380.00     10.00     20.00      0.00    150.00', ''].join('\n'));
const run = (cfg, name) => { fs.writeFileSync(path.join(dir, name), JSON.stringify(cfg)); return runPileConfig(path.join(dir, name)).results[0]; };
const res = run(r.config, 'auto.json');
const t = res.thTrials;
const t30 = t[0];
ok('first trial H = 0.30 m fails on the punching of the pedestal, UC = 1.136 (hand 1.4063/1.2375)', t30.Hf === 0.3 && !t30.pass && /Punching of the pedestal/.test(t30.desGov) && near(t30.desUC, 1.4063 / 1.2375, 2e-3), `${t30.desGov} ${t30.desUC.toFixed(4)}`);
// reproduce the H = 0.30 m trial on its own: ΔW = 100.224 kN, d = 209 mm
const one = JSON.parse(JSON.stringify(r.config)); delete one.criteria.design.autoThickness;
const r30 = run(one, 'one.json');
ok('single run at H = 0.30: ΔW = 100.224 kN (Df = Dp + H = 0.5 m), d = 209 mm', near(r30.w.dW, 100.224, 1e-9) && near(r30.f.Df, 0.5, 1e-12) && r30.design.d === 209, `${r30.w.dW.toFixed(4)} ${r30.f.Df}`);
const it302 = r30.design.items.find(x => x.lc === 302);
ok('302 at H = 0.30: P = 840.269 kN; V_u (pedestal) = P·8/9 = 746.906 kN', near(it302.load.P, 720 + 1.2 * 100.224, 1e-9) && near(r30.design.punch.Vu, 840.2688 * 8 / 9, 5e-3) && r30.design.punch.lc === 302, r30.design.punch.Vu.toFixed(3));
ok('trials go up in 0.05 m steps and stop at the first passing H', t.every((x, k) => k === 0 || near(x.Hf - t[k - 1].Hf, 0.05, 1e-9)) && t.slice(0, -1).every(x => !x.pass) && t[t.length - 1].pass && res.thFound);
ok('the kept thickness is the last trial, in the foundation of the report', near(res.f.Hf, t[t.length - 1].Hf, 1e-12) && res.pass && res.design.pass);
// the smallest passing H: the trial before it fails when run alone, the chosen one passes when run alone
const alone = (h) => { const c = JSON.parse(JSON.stringify(one)); c.foundations[0].Hf = h; return run(c, 'h' + h + '.json'); };
const hSel = res.f.Hf, rSel = alone(hSel), rPrev = alone(Math.round((hSel - 0.05) * 1000) / 1000);
ok('H chosen passes alone, H − 0.05 fails alone (smallest passing step)', rSel.pass && !rPrev.pass, `H ${hSel}: ${rSel.design.gov.uc.toFixed(3)}; prev UC ${rPrev.design.gov.uc.toFixed(3)}`);
ok('the cap weight grows with H (ΔW), so every trial re-runs 4B: ΔW(H) = 64.8·(H/0.3) + 35.424', near(rSel.w.dW, 216 * hSel + 4.32 + 31.104, 1e-9), rSel.w.dW.toFixed(3));
// no thickness passes in a short range: the last one is reported as failing
const short = JSON.parse(JSON.stringify(r.config)); short.criteria.design.autoThickness = { from: 0.3, to: 0.4, step: 0.05 };
const rs = run(short, 'short.json');
ok('no passing H in 0.30–0.40: thFound false, last trial shown, status FAIL', rs.thFound === false && rs.thTrials.length === 3 && near(rs.f.Hf, 0.4, 1e-12) && !rs.pass);
// without Dp: Df stays 0.5 and H cannot exceed it (pedestal needs Df ≥ H) -> the trial that does not fit is reported, loop stops
const noDp = JSON.parse(JSON.stringify(r.config)); delete noDp.foundations[0].Dp; noDp.foundations[0].Df = 0.45; noDp.criteria.design.autoThickness = { from: 0.3, to: 0.8, step: 0.05 };
const rn = run(noDp, 'nodp.json');
ok('without DP, Df fixed at 0.45: H = 0.50 > Df is reported as an invalid trial and the search stops', rn.thTrials.some(x => x.note && x.Hf === 0.5) && !rn.thFound, rn.thTrials.map(x => x.Hf + (x.note ? '!' : '')).join(','));
// CLI
fs.writeFileSync(path.join(dir, 'p.fnd'), FND);
const tool = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../tools/fair-run.mjs');
const cli = spawnSync(process.execPath, [tool, path.join(dir, 'p.fnd')], { encoding: 'utf8' });
const md = fs.existsSync(path.join(dir, 'p - Pile.md')) ? fs.readFileSync(path.join(dir, 'p - Pile.md'), 'utf8') : '';
ok('fair-run: exit 0, report has the Auto-thickness table with the chosen H marked', cli.status === 0 && /Auto-thickness \(H 0\.30/.test(md) && /\| 0\.\d\d ◄ \|/.test(md), (cli.stderr || cli.stdout).split('\n')[0]);
fs.rmSync(dir, { recursive: true, force: true });
console.log(`\nPASS ${pass}  FAIL ${fail}`); process.exit(fail ? 1 : 0);
