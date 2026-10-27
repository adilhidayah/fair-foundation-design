// VALIDATION part25 — pile group of a real equipment foundation (Filter Coalescer 101-F-2201 A/B/C, doc 2512-01GT-90-05J-A0014 Rev B):
// 12 square piles 0.30 m, x = 1.45, 0, -1.45 m (across the 4.0 m cap) and z = ±5.25, ±1.75 m (along the 11.6 m cap).
// Pile reactions F = P/n + Mz·x/Σx² + Mx·z/Σz² (each moment with the lever arm of the axis it acts across), Σx² = 16.82, Σz² = 183.75.
// The document pairs the lever arms the other way round (Mz·z_max/Σx², Mx·x_max/Σz²) and reports 158.10 kN / 232.0 kN; the same loads
// give 93.44 kN (service) / 119.5 kN (factored) with the correct pairing. The swapped pairing is kept below as a negative control.
import { evaluatePileGroupCombo, pileGroupEfficiency } from '../index.js';
let pass = 0, fail = 0;
function ok(n, c, x = '') { if (c) { pass++; console.log('PASS ' + n + ' ' + x); } else { fail++; console.log('FAIL ' + n + ' ' + x); } }
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const piles = []; for (const x of [1.45, 0, -1.45]) for (const y of [-5.25, -1.75, 1.75, 5.25]) piles.push({ x, y });
const Sx = 8 * 1.45 ** 2, Sz = 3 * (2 * 5.25 ** 2 + 2 * 1.75 ** 2);
ok('Σx² = 16.82, Σz² = 183.75', near(Sx, 16.82, 5e-3) && near(Sz, 183.75, 1e-9), `${Sx.toFixed(3)} ${Sz}`);
const cap = { Qc: 196.2, Qt: 98.1, Ql: 98.1 };
const Fmax = (load) => Math.max(...evaluatePileGroupCombo(piles, load, cap, { Eg: 1 }).pileForces.map(p => p.F));
const Fmin = (load) => Math.min(...evaluatePileGroupCombo(piles, load, cap, { Eg: 1 }).pileForces.map(p => p.F));
const hand = ({ P, Mx, Mz }) => P / 12 + Math.abs(Mz) * 1.45 / Sx + Math.abs(Mx) * 5.25 / Sz;
const swapped = ({ P, Mx, Mz }) => P / 12 + Math.abs(Mz) * 5.25 / Sx + Math.abs(Mx) * 1.45 / Sz;
// service combinations at the underside of the cap (document Table C.6)
const svc = { 111: { P: 791.4, Hx: 73.9, Hz: 22.2, Mx: 87.0, Mz: -290.1 }, 112: { P: 791.4, Hx: 22.2, Hz: 73.9, Mx: 290.1, Mz: -87.0 },
  121: { P: 783.3, Hx: 75.2, Hz: 22.5, Mx: 88.5, Mz: -295.2 }, 117: { P: 840.1, Hx: 0, Hz: 0, Mx: 0, Mz: 0 }, 109: { P: 440.4, Hx: 8.7, Hz: 0, Mx: 0, Mz: -34.1 } };
for (const [lc, l] of Object.entries(svc)) {
  for (const sg of [1, -1]) ok(`LC${lc} service, moments ${sg > 0 ? '+' : '−'}: F_max = hand formula`, near(Fmax({ ...l, Mx: sg * l.Mx, Mz: sg * l.Mz }), hand(l), 1e-9), hand(l).toFixed(2));
}
ok('governing service F_max = 93.44 kN (LC111), not the 158.10 kN of the document', near(Math.max(...Object.values(svc).map(Fmax)), 93.44, 0.01));
ok('negative control: the swapped lever-arm pairing reproduces the document (157.18 kN at LC111, 158.11 kN at LC121)', near(swapped(svc[111]), 157.18, 0.01) && near(swapped(svc[121]), 158.11, 0.02));
// factored combinations (document Table C.7)
const ult = { 208: { P: 962.8, Hx: 105.5, Hz: 31.7, Mx: 124.3, Mz: -414.4 }, 219: { P: 662.3, Hx: 143.2, Hz: 42.9, Mx: 168.7, Mz: -562.2 }, 222: { P: 1145.7, Hx: 0, Hz: 0, Mx: 0, Mz: 0 } };
ok('factored F_max: LC208 = 119.5 kN (document 210.6), LC219 = 108.5 kN (document 232.0), LC222 = 95.5 kN', near(Fmax(ult[208]), 119.5, 0.05) && near(Fmax(ult[219]), 108.5, 0.05) && near(Fmax(ult[222]), 95.475, 0.01));
ok('negative control: swapped pairing gives the document\'s 232.0 kN at LC219', near(swapped(ult[219]), 232.0, 0.05));
ok('no uplift in any of these combinations (F_min > 0)', Math.min(...Object.values(svc).map(Fmin)) > 0, Math.min(...Object.values(svc).map(Fmin)).toFixed(2));
// lateral: H/n per pile (torsion about the group centre is zero for a symmetric group and no Mt)
const lat = evaluatePileGroupCombo(piles, svc[121], cap, { Eg: 1 }).latPiles;
ok('lateral per pile = √(Hx² + Hz²)/12 = 6.54 kN', near(Math.max(...lat.map(p => p.V)), Math.hypot(75.2, 22.5) / 12, 1e-9), Math.max(...lat.map(p => p.V)).toFixed(3));
// group efficiency: the document uses Feld (0.9375); FAIR's default is Converse–Labarre, and a manual Eg overrides it
const cl = pileGroupEfficiency({ piles, D: 0.3, type: 'friction' });
ok('Converse–Labarre for 3 × 4 piles, s = 1.45 m, D = 0.30 m: Eg = 0.816', cl.method === 'converse-labarre' && near(cl.Eg, 0.816, 5e-4), cl.Eg.toFixed(4));
const man = pileGroupEfficiency({ piles, D: 0.3, type: 'friction', manualEg: 0.9375 });
ok('manual Eg = 0.9375 -> Qc,all = 183.94 kN, Qt,all = 91.97 kN (document)', man.method === 'manual' && near(man.Eg * 196.2, 183.94, 5e-3) && near(man.Eg * 98.1, 91.97, 5e-3));
const withEg = evaluatePileGroupCombo(piles, svc[111], cap, { Eg: 0.9375 });
ok('UC compression LC111 with Eg = 0.9375: 93.44 / 183.94 = 0.508', near(withEg.checks[0].uc, 93.44 / 183.9375, 5e-4), withEg.checks[0].uc.toFixed(4));
console.log(`\nPASS ${pass}  FAIL ${fail}`); process.exit(fail ? 1 : 0);
