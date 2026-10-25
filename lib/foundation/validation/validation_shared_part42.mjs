// VALIDATION part42 — Feld's rule (pileGroupEfficiency method 'feld') and the Reese et al. (2003) lateral row factors (lateralPMultipliers reese:true).
// Expected values worked by hand from the Filter Coalescer foundation calculation (Doc 2512-01GT-90-05J-A0014 Rev B, Table C.13 / C.14):
// 10 piles (2 x 5), D = 0.30 m, spacing 2.3 m (x) and 2.4 m (z), 8D = 2.4 m.
import { pileGroupEfficiency, lateralPMultipliers } from '../index.js';
let pass = 0, fail = 0;
function ok(n, c, x = '') { if (c) { pass++; console.log('PASS ' + n + ' ' + x); } else { fail++; console.log('FAIL ' + n + ' ' + x); } }
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const piles = []; [-4.8, -2.4, 0, 2.4, 4.8].forEach(z => [-1.15, 1.15].forEach(x => piles.push({ x, y: z })));
const D = 0.3;
const f = pileGroupEfficiency({ piles, D, type: 'friction', method: 'feld' });
ok("Feld: 4 corner piles n = 2 (RF 0.8750), 6 edge piles n = 3 (RF 0.8125)", f.counts.filter(c => c === 2).length === 4 && f.counts.filter(c => c === 3).length === 6);
ok('Feld: Eg = (4 × 0.875 + 6 × 0.8125) / 10 = 0.8375 (document Table C.13)', near(f.Eg, 0.8375, 1e-12) && f.method === 'feld', f.Eg);
ok('Converse–Labarre stays the default: 0.893 for the same layout', near(pileGroupEfficiency({ piles, D, type: 'friction' }).Eg, 0.8929, 5e-4));
const irregular = piles.slice(0, 9);
ok('Feld works on a layout that is not a regular grid (CL needs a manual Eg)', Number.isFinite(pileGroupEfficiency({ piles: irregular, D, type: 'friction', method: 'feld' }).Eg) && !Number.isFinite(pileGroupEfficiency({ piles: irregular, D, type: 'friction' }).Eg));
ok('Feld: piles farther apart than 8D are not reduced (Eg = 1)', pileGroupEfficiency({ piles: [{ x: 0, y: 0 }, { x: 2.5, y: 0 }], D, type: 'friction', method: 'feld' }).Eg === 1);
ok('Feld: end-bearing / manual Eg / apply = false still override', pileGroupEfficiency({ piles, D, type: 'end', method: 'feld' }).Eg === 1 && pileGroupEfficiency({ piles, D, type: 'friction', method: 'feld', manualEg: 0.9 }).Eg === 0.9 && pileGroupEfficiency({ piles, D, type: 'friction', method: 'feld', apply: false }).Eg === 1);
const lx = lateralPMultipliers({ piles, D, dir: 'x', reese: true }), lz = lateralPMultipliers({ piles, D, dir: 'z', reese: true });
ok('Reese: s/b = 2.3/0.3 = 7.67 -> leading 1.00 (>= 4), trailing 1.00 (>= 7); Table C.14 factor 1.00', near(lx.sD, 7.6667, 1e-3) && lx.PmMin === 1 && lx.PmAvg === 1);
ok('Reese: s/b = 2.4/0.3 = 8.0 -> no lateral group reduction', near(lz.sD, 8, 1e-9) && lz.PmMin === 1);
const tight = [{ x: 0, y: 0 }, { x: 0.9, y: 0 }, { x: 1.8, y: 0 }];
const lt = lateralPMultipliers({ piles: tight, D, dir: 'x', reese: true, sign: 1 });
ok('Reese: s/b = 3 -> leading 0.7·3^0.26 = 0.932, trailing 0.48·3^0.38 = 0.729', near(lt.rows[0].Pm, 0.7 * Math.pow(3, 0.26), 1e-9) && near(lt.rows[1].Pm, 0.48 * Math.pow(3, 0.38), 1e-9) && near(lt.PmMin, 0.729, 2e-3), lt.rows.map(r => r.Pm.toFixed(3)).join(' '));
ok('Reese: the table mode is unchanged by default (row 2 of the AASHTO table at s/D 7.67 = 0.85)', near(lateralPMultipliers({ piles, D, dir: 'x' }).PmMin, 0.85, 1e-9));
console.log(`\nPASS ${pass}  FAIL ${fail}`); process.exit(fail ? 1 : 0);
