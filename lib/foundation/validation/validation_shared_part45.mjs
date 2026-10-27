// VALIDATION part45 — integration of local positional hairpins / STAAD drawings with GitHub anchor models.
// ACI 318M-19 §17.5.2.1(a), §25.4.3.1, §25.4.2.3. Legacy geometry and its 2.1 development denominator are preserved;
// the GitHub per-anchor model retains the "other cases" denominator 1.4 and its existing part38/39 vectors.
import { anchorGroupCheck, parseStaadLoads } from '../index.js';
import { footingWeights, footingDesignCheck, pedestalDesignCheck } from '../../../tools/staad-stability.mjs';
import { buildFoundationDrawing, toSVG } from '../../../tools/foundation-drawing.mjs';
let pass = 0, fail = 0;
function ok(name, condition) { console.log(`${condition ? 'PASS' : 'FAIL'} ${name}`); condition ? pass++ : fail++; }
const near = (a,b) => Math.abs(a-b) < 1e-8;
const base = { Bp: 300, Lp: 300, sx: 130, sz: 130, da: 16, Ase: 157, futa: 400, hef: 300, Abrg: 290, fc: 21.7, seismic: true };
const legs = [[-30,-30],[30,-30],[30,30],[-30,30]];
const reinf = { hairpin: { legs, db: 10, maxLen: 900 }, fy: 420, topCover: 50 };
const r = anchorGroupCheck({ ...base, Mz: 5, reinf });
const ld = Math.max(420 * 10 / (2.1 * Math.sqrt(21.7)), 300);
const plane = 300 - Math.SQRT2 * 35 * Math.tan(35 * Math.PI / 180);
const ldh = Math.max(420 * 1.6 * (21.7 / 105 + 0.6) * 10 ** 1.5 / (23 * Math.sqrt(21.7)), 80, 150);
ok('local detail counts the four actual legs, not per-anchor duplicates', r.ar.hairpin && r.ar.n === 4 && near(r.ar.As, 100 * Math.PI));
ok('local straight development = 429.339 mm, same pre-merge 2.1 formula', near(r.ar.ld, ld));
ok('local hook development retains psiR 1.6 and minimum 150 mm', near(r.ar.ldh, ldh));
ok('35 degree plane and available development retained', near(r.ar.r, Math.SQRT2 * 35) && near(r.ar.avail, plane - 50));
ok('local legs rounded to 50 mm and checked below the plane', near(r.ar.legLen, 750) && near(r.ar.availLow, 750 - plane) && r.ar.developed);
ok('local reinforcement UC = 38.461538 / (0.75 * 314.159 * 420 / 1000)', near(r.tension[1].uc, (5e6 / 130) / (0.75 * 100 * Math.PI * 420)));
const short = anchorGroupCheck({ ...base, Mz: 5, reinf: { ...reinf, hairpin: { ...reinf.hairpin, maxLen: 500 } } });
ok('insufficient local leg length still fails, UC Infinity', !short.ar.developed && short.tension[1].uc === Infinity);
const native = anchorGroupCheck({ ...base, Mz: 5, reinf: { type: 'hairpin', db: 10, fy: 420 } });
ok('GitHub per-anchor detail remains distinct with its own development formula', native.ar.type === 'hairpin' && near(native.ar.ldBelow, 420 * 10 / (1.4 * Math.sqrt(21.7))) && !native.ar.hairpin);
const loads = parseStaadLoads('LOAD 3 LOADTYPE Dead TITLE D\nSELFWEIGHT Y -1\nLOAD 301 1.2D\nREPEAT LOAD\n3 1.2\n');
const f = { name: 'Integration', node: 7, type: 'pedestal', Bf: 1.2, Lf: 1.2, Hf: 0.3, Df: 0.95, Bp: 0.4, Lp: 0.4, pedGp: 0.275, groutT: 25,
  bolts: { n: 4, dia: 16, sx: 130, sz: 130 }, column: { name: 'C100', shape: 'C', h: 100, b: 50, tw: 6, tf: 8, cy: 15 } };
const crit = { gc: 24, gs: 18, qa: 100, mu: 0.4, ecc: 0, fsSlidePerm: 1.5, fsSlideTemp: 1.5, fsOTPerm: 1.5, fsOTTemp: 1.5,
  design: { fc: 21.7, fy: 420, cover: 75, bar: 13, sameBothWays: true, topLayer: { mode: 'two' } },
  pedestal: { bar: 13, tie: 10, legs: 2, clearCover: 40, fyt: 280, rhoMin: 0.005,
    anchor: { ...base, reinforcement: true, hairpin: { db: 10, n: 2 } } } };
const uplift = { '7:301': [0,-20,0,0,0,0] };
const legacyP = pedestalDesignCheck(f, crit, loads, uplift, [301]);
ok('CLI boolean reinforcement with hairpin retains the local geometry model', legacyP.anchor?.hairpin?.legs.length === 4 && legacyP.anchor.res.ar.hairpin);
const nativeCrit = { ...crit, pedestal: { ...crit.pedestal, anchor: { ...crit.pedestal.anchor, reinforcement: 'hairpin' } } };
const nativeP = pedestalDesignCheck(f, nativeCrit, loads, uplift, [301]);
ok('CLI string reinforcement hairpin retains GitHub per-anchor model', nativeP.anchor?.hairpin === null && nativeP.anchor.res.ar.type === 'hairpin');
const comp = { '7:301': [0,50,0,0,0,0] };
const design = footingDesignCheck(f, crit, loads, comp, [301]);
ok('local sameBothWays and GitHub two-layer option work together', design.flex.length === 4 && design.flex.every(c => c.required && c.same));
for (const [name, pedestal] of [['local', legacyP], ['GitHub', nativeP]]) {
  const entities = buildFoundationDrawing({ f, B: f.Bf, L: f.Lf, w: footingWeights(f,crit), design, pedestal });
  ok(`${name} detail keeps the steel column and anchor drawing`, entities.some(e => e.s === 'COLUMN C100') && entities.some(e => e.t === 'text' && /hairpin/i.test(e.s)));
  ok(`${name} SVG has no NaN or undefined coordinates`, !/NaN|undefined/.test(toSVG(entities)));
}
console.log(`PART45: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
