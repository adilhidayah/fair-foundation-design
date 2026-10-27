// VALIDATION part31 — pile cap structure from STAAD factored combinations (tools/staad-pile.mjs, pileCapDesignCheck; as 5B).
// Hand calculation, same cap as part30: 3 × 3 piles at 1.2 m (Σ(x − x̄)² = 8.64), D 400 mm, cap 3 × 3 × 1.0 m, pedestal 0.6 × 0.6 at the centre,
// ΔW = 251.424 kN, f'c 25, f_y 420, cover 75, D16 -> d = 1000 − 75 − 16 = 909 mm (x-bars), 893 mm (z-bars).
//   L/C 302 (1.2D + 1.6L): STAAD FY 720, MZ 140, kD = 1.2 -> P = 720 + 1.2·251.424 = 1021.709 kN, Mz = 140
//     pile force at x = ±1.2: F = P/9 ± 140·1.2/8.64 = 113.523 ± 19.444 -> 132.968 / 94.079 kN (three piles in each column)
//   flexure x (section 0.3 m from the centre): M = 3·132.968·(1.2 − 0.3) = 359.01 kN·m
//   one-way x: section at 0.3 + 0.909 = 1.209 m; the piles at x = 1.2 are s = −0.009 m inside: share = (−0.009 + 0.2)/0.4 = 0.4775 -> V_u = 3·132.968·0.4775 = 190.5 kN
//   punching of the pedestal: perimeter half-size 0.3 + 0.4545 = 0.7545 m: the centre pile is inside -> V_u = P − F_centre = 1021.709 − 113.523 = 908.19 kN
//   punching of a pile (corner, F = 132.968): nothing to deduct, V_u = 132.968 kN
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

const FND = ['PROJECT Pile cap structure', 'STD a.std', 'ANL a.ANL', 'LC 101', 'LC LRFD 301 TO 303', 'CONCRETE UNIT WEIGHT 24', 'SOIL UNIT WEIGHT 18',
  'PILE CAPACITY COMPRESSION 600 TENSION 200 LATERAL 50', 'PILE DIAMETER 400', 'PILE SHAPE SQUARE', 'PILE LIMITS MIN 2.5D WARN 3D EDGE 0.3',
  'DESIGN FC 25 FY 420 COVER 75 BAR 16',
  'FOUNDATION PC-1 NODE 1 TYPE PEDESTAL SUPPORT PILE', '  CAP 3 3 1 DEPTH 1.2', '  PEDESTAL 0.6 0.6 TOP 0.3', '  PILE GRID 3 3 SPACING 1.2 1.2', 'FINISH', ''].join('\n');
const r = parseFndCommands(FND);
ok('parser: PILE SHAPE, DESIGN and LC LRFD with SUPPORT PILE', r.errors.length === 0 && r.config.criteria.pile.shape === 'square' && r.config.criteria.design.bar === 16 && r.config.lc_lrfd === '301-303', r.errors.join(' | '));
ok('parser: PILE SHAPE other than SQUARE / CIRCULAR and AUTO THICKNESS OPTIMIZE with piles are errors',
  parseFndCommands('PILE SHAPE OVAL').errors.some(e => /^line 1:.*SQUARE or CIRCULAR/.test(e)) && parseFndCommands(FND.replace('DESIGN FC 25 FY 420 COVER 75 BAR 16', 'DESIGN FC 25 FY 420 COVER 75 BAR 16\nAUTO THICKNESS OPTIMIZE TO 1 STEP 0.1')).errors.some(e => /OPTIMIZE/.test(e)));

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fair-pilecap-'));
fs.writeFileSync(path.join(dir, 'a.std'), ['LOAD 3 LOADTYPE Dead TITLE D', 'JOINT LOAD', '1 FY -10', 'LOAD 5 LOADTYPE Live TITLE L', 'JOINT LOAD', '1 FY -5', 'LOAD 9 LOADTYPE Wind TITLE W', 'JOINT LOAD', '1 FX 1',
  'LOAD 101 D+L', 'REPEAT LOAD', '3 1 5 1', 'LOAD 301 1.4D', 'REPEAT LOAD', '3 1.4', 'LOAD 302 1.2D+1.6L', 'REPEAT LOAD', '3 1.2 5 1.6', 'LOAD 303 1.2D+W', 'REPEAT LOAD', '3 1.2 9 1.0', ''].join('\n'));
fs.writeFileSync(path.join(dir, 'a.ANL'), ['   SUPPORT REACTIONS -UNIT KN   METE    STRUCTURE TYPE = SPACE', '   -----------------', ' JOINT  LOAD   FORCE-X   FORCE-Y   FORCE-Z     MOM-X     MOM-Y     MOM Z',
  '      1  101      0.00    400.00      0.00      0.00      0.00     80.00', '         301      0.00    560.00      0.00      0.00      0.00    112.00', '         302      0.00    720.00      0.00      0.00      0.00    140.00',
  '         303    -30.00    380.00     10.00     20.00      0.00    150.00', ''].join('\n'));
fs.writeFileSync(path.join(dir, 'p.fnd'), FND);
fs.writeFileSync(path.join(dir, 'p.config.json'), JSON.stringify(r.config));
const res = runPileConfig(path.join(dir, 'p.config.json')).results[0], D = res.design;
const it302 = D.items.find(x => x.lc === 302);
ok('302: P = 1021.709 kN, Mz = 140', near(it302.load.P, 720 + 1.2 * 251.424, 1e-9) && near(it302.load.Mz, 140, 1e-12), it302.load.P.toFixed(4));
const F = 1021.709 / 9 + 140 * 1.2 / 8.64;
ok('302: pile force at x = +1.2 is 132.968 kN', near(it302.ev.Fmax, F, 1e-3) && near(F, 132.968, 5e-4), it302.ev.Fmax.toFixed(4));
const fx = D.flex.find(c => c.key === 'x-bottom');
ok('flexure x-bottom: M_u = 3·132.968·0.9 = 359.01 kN·m governed by L/C 302', near(fx.Mu, 3 * F * 0.9, 1e-2) && near(fx.Mu, 359.01, 2e-2) && fx.lc === 302, fx.Mu.toFixed(3));
// A_s: φ = 0.9, b = 3000, d = 909: ρ = 0.85f'c/fy·(1 − √(1 − 2Ru/(0.85f'c))), Ru = Mu/(φ b d²)
const Ru = fx.Mu * 1e6 / (0.9 * 3000 * 909 ** 2), rho = 0.85 * 25 / 420 * (1 - Math.sqrt(1 - 2 * Ru / (0.85 * 25)));
ok('flexure x-bottom: A_s,req = ρ·b·d = 1048 mm² (hand), A_s,min = 0.0018·3000·1000 = 5400 governs', near(fx.des.AsCalc, rho * 3000 * 909, 1e-6) && near(fx.des.AsCalc, 1048, 2) && near(fx.des.AsMin, 5400, 1e-9) && near(fx.des.As, 5400, 1e-9), fx.des.AsCalc.toFixed(2));
ok('bars: spacing from A_s = 5400 over 3000 mm, D16 (201.06 mm²): s_req = 111.7 -> 100 mm (25 mm steps), 30 bars between covers', fx.s === 100 && fx.n === 30 && fx.ok, `${fx.s} ${fx.n}`);
ok('no hogging: top layers not required', D.flex.filter(c => c.face === 'top').every(c => !c.required));
const ow = D.oneway.find(o => o.axis === 'x');
ok('one-way x: V_u = 3·132.968·0.4775 = 190.5 kN', near(ow.Vu, 3 * F * (0.2 - 0.009) / 0.4, 5e-2) && near(ow.Vu, 190.5, 0.1) && ow.lc === 302, ow.Vu.toFixed(3));
ok('punching of the pedestal: V_u = P − F_centre = 908.19 kN', near(D.punch.Vu, 1021.709 - 1021.709 / 9, 1e-2) && near(D.punch.Vu, 908.19, 1e-2), D.punch.Vu.toFixed(3));
ok('punching of the pedestal: b_o = 4·(600 + 909) = 6036 mm, v_u ≥ V_u/(b_o d) = 0.1655 MPa', near(D.punch.bo, 6036, 1e-9) && D.punch.vu >= 908190 / (6036 * 909) - 1e-9 && near(D.punch.vu, 0.184, 2e-3), D.punch.vu.toFixed(4));
const pk = D.pilePunch.gov;
ok('punching of the piles: corner pile, V_u = 132.968 kN (largest |F|), α_s = 20', pk.loc === 'corner' && near(pk.Vu, F, 1e-3) && pk.sec.alphaS === 20, `${pk.loc} ${pk.Vu.toFixed(3)}`);
ok('all checks pass, overall design OK; summary line in the report', D.pass && res.pass && /Cap structure/.test(runPileConfig(path.join(dir, 'p.config.json')).md));
// a thin cap fails: H = 0.4 m -> one-way / flexure UC > 1 or section too small
const thin = JSON.parse(JSON.stringify(r.config)); thin.foundations[0].Hf = 0.4; thin.foundations[0].Df = 0.6;
fs.writeFileSync(path.join(dir, 'thin.json'), JSON.stringify(thin));
const rt = runPileConfig(path.join(dir, 'thin.json')).results[0];
ok('a 0.4 m cap fails the structural check (UC > 1)', rt.design && !rt.design.pass && rt.design.gov.uc > 1 && !rt.pass, rt.design.gov.name + ' ' + rt.design.gov.uc.toFixed(3));
ok('missing LRFD reaction is reported, never silently skipped', (() => { const m = JSON.parse(JSON.stringify(r.config)); m.lc_lrfd = '301-304'; fs.writeFileSync(path.join(dir, 'm.json'), JSON.stringify(m)); const x = runPileConfig(path.join(dir, 'm.json')).results[0]; return x.design.missing.includes(304) && !x.design.pass; })());
const tool = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../tools/fair-run.mjs');
const cli = spawnSync(process.execPath, [tool, path.join(dir, 'p.fnd')], { encoding: 'utf8' });
ok('fair-run: exit 0, report contains the cap structure section', cli.status === 0 && /pile cap thickness and reinforcement/.test(fs.readFileSync(path.join(dir, 'p - Pile.md'), 'utf8')), (cli.stderr || cli.stdout).split('\n')[0]);
fs.rmSync(dir, { recursive: true, force: true });
console.log(`\nPASS ${pass}  FAIL ${fail}`); process.exit(fail ? 1 : 0);
