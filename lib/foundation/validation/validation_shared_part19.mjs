// VALIDATION part19 — anchor group, ACI 318M-19 Chapter 17 (anchorGroupCheck, hookDevLength): 4 cast-in headed anchors M16 in a
// 300 × 300 pedestal at 130 × 130, f'c 21.7, hef 300, Abrg 290, cracked, seismic (× 0.75 on concrete), Mz = 5 kN·m only.
import { anchorGroupCheck, hookDevLength } from '../shared/anchorGroup.js';
let pass = 0, fail = 0;
function ok(n, c, x = '') { if (c) { pass++; console.log('PASS ' + n + ' ' + x); } else { fail++; console.log('FAIL ' + n + ' ' + x); } }
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const base = { shearAnchors:4, shearBasis:'Validation vector assumes equal sharing among four anchors', Bp: 300, Lp: 300, sx: 130, sz: 130, da: 16, Ase: 157, futa: 400, hef: 300, Abrg: 290, fc: 21.7, seismic: true };
const r = anchorGroupCheck({ ...base, Mz: 5 });
// anchor forces: F = Mz·x/sx² = 5e6·65/130² = 19 231 N tension on the two anchors at x = −65 (Mz > 0 compresses +x)
ok('T per anchor = 5e6·65/16900 = 19.231 kN', near(r.Tmax, 5e6 * 65 / 16900 / 1000, 1e-9), r.Tmax.toFixed(3));
ok('tension group = 2 anchors = 38.462 kN', near(r.Tgrp, 2 * 5e6 * 65 / 16900 / 1000, 1e-9));
// hef' (§17.6.2.1.2): c_a,max = 85 < 1.5·300 -> max(85/1.5, 130/3) = 56.667
ok("hef' = max(c_a,max/1.5, s/3) = 56.667", near(r.hefE, 85 / 1.5, 1e-9), r.hefE.toFixed(3));
const Nb = 10 * Math.sqrt(21.7) * Math.pow(85 / 1.5, 1.5);
ok('N_b = 10·√f\'c·hef\'^1.5', near(r.Nb, Nb, 1e-6), Nb.toFixed(1));
// A_Nc of the 2 tension anchors: x from −150 to −65 + 85 = 20 (170), z −150..150 (300) -> 51 000; A_Nco = 9·hef'² = 28 900
ok('A_Nc = 170·300 = 51 000, A_Nco = 9 hef\'² = 28 900', near(r.ANc, 51000, 1e-9) && near(r.ANco, 9 * (85 / 1.5) ** 2, 1e-9));
ok('ψ_ed,N = 1.0 (c_a,min = 1.5 hef\'), ψ_ec,N = 1.0', near(r.psiEdN, 1, 1e-12) && near(r.psiEcN, 1, 1e-12));
const Ncbg = 51000 / (9 * (85 / 1.5) ** 2) * Nb;
ok('breakout UC = 38 462 / (0.75·0.70·N_cbg) = 2.09', near(r.tension[1].uc, 2 * 5e6 * 65 / 16900 / (0.75 * 0.7 * Ncbg), 1e-9), r.tension[1].uc.toFixed(3));
ok('pullout UC = 19 231 / (0.75·0.70·8·290·21.7) = 0.728', near(r.tension[2].uc, 5e6 * 65 / 16900 / (0.525 * 8 * 290 * 21.7), 1e-9), r.tension[2].uc.toFixed(3));
// corner factor (§17.6.4.1.1): c_a2 = 85 < 3·85 -> (1 + 85/85)/4 = 0.5 (SP-17M(14) Anchorage Example 18, Step 10)
const Nsb = 0.5 * 13 * 85 * Math.sqrt(290) * Math.sqrt(21.7) * (1 + 130 / (6 * 85));
ok('side-face blowout (hef 300 > 2.5·85): N_sbg = (1 + s/6c)·(1 + c_a2/c_a1)/4·13 c √Abrg √f\'c', near(r.tension[3].uc, 2 * 5e6 * 65 / 16900 / (0.525 * Nsb), 1e-9), r.tension[3].uc.toFixed(3));
ok('steel UC = 19 231 / (0.75·157·400) = 0.408', near(r.tension[0].uc, 5e6 * 65 / 16900 / (0.75 * 157 * 400), 1e-9));
ok('breakout governs, group fails without anchor reinforcement', r.govT.name === 'Concrete breakout N_cbg' && !r.pass);
// anchor reinforcement: D13 corner bars at ±93.5 (cover 40 + tie 10 + 6.5); within 0.5 hef = 150 of the tension anchors: the two at
// x = −93.5 (distance √2·28.5 = 40.3); φN = 0.75·2·132.73·420 = 83.6 kN -> UC 0.46
const bars = [[-93.5, -93.5], [93.5, -93.5], [93.5, 93.5], [-93.5, 93.5]];
const ra = anchorGroupCheck({ ...base, Mz: 5, reinf: { bars, db: 13, fy: 420, topCover: 50 } });
ok('anchor reinforcement: 2 bars, A_s = 265.5', ra.ar.n === 2 && near(ra.ar.As, 2 * Math.PI / 4 * 169, 1e-9));
ok('anchor reinforcement UC = 38.462 / (0.75·A_s·420)', near(ra.tension[1].uc, 38.4615 / (0.75 * 2 * Math.PI / 4 * 169 * 420 / 1000), 1e-3), ra.tension[1].uc.toFixed(3));
// l_dh (§25.4.3.1): ψc = 21.7/105 + 0.6 = 0.8067; 420·0.8067/(23·√21.7)·13^1.5 = 148.2 -> min 150 mm
ok('l_dh D13 = max(148.2, 8·13, 150) = 150', near(hookDevLength({ fy: 420, fc: 21.7, db: 13 }), 150, 1e-9) &&
  near(420 * (21.7 / 105 + 0.6) / (23 * Math.sqrt(21.7)) * Math.pow(13, 1.5), 148.2, 0.1));
ok('available above the 35° plane = 300 − 40.3·tan35° − 50 = 221.8 ≥ 150 -> developed', near(ra.ar.avail, 300 - Math.SQRT2 * 28.5 * Math.tan(35 * Math.PI / 180) - 50, 1e-9) && ra.ar.developed);
ok('with anchor reinforcement side-face blowout governs (1.33, corner factor) -> group fails', !ra.pass && ra.govT.name === 'Side-face blowout N_sbg' && near(ra.uc, 2 * 5e6 * 65 / 16900 / (0.525 * Nsb), 1e-9), ra.uc.toFixed(3));
ok('short anchor hef 150 -> not developed above the plane -> fails', !anchorGroupCheck({ ...base, hef: 150, Mz: 5, reinf: { bars, db: 13, fy: 420, topCover: 50 } }).ar.developed);
// net uplift: P = −20 kN, no moment -> 4 anchors at 5 kN each
const ru = anchorGroupCheck({ ...base, P: -20 });
ok('net uplift P = −20: 4 anchors × 5 kN', near(ru.Tmax, 5, 1e-9) && near(ru.Tgrp, 20, 1e-9));
// shear Fx = 4 kN: steel V/4 / (0.65·0.6·157·400)
const rv = anchorGroupCheck({ ...base, Fx: 4 });
ok('shear steel UC = 1 000 / (0.65·0.6·157·400)', near(rv.shear[0].uc, 1000 / (0.65 * 0.6 * 157 * 400), 1e-9));
console.log(`PART19: ${pass} pass, ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
