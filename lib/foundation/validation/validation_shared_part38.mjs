// VALIDATION part38 — hairpin anchor reinforcement (anchorGroupCheck reinf.type 'hairpin', ACI 318M-19 §17.5.2.1(a) tension /
// §17.5.2.1(b) shear, l_dh §25.4.3.1, l_d §25.4.2.3), the CLI mapping (anchorReinf) and the .fnd commands (REINFORCEMENT HAIRPIN,
// HAIRPIN ...). Same group as part19: 4 M16 in a 300 × 300 pedestal at 130 × 130, f'c 21.7, hef 300, Abrg 290, seismic.
import { anchorGroupCheck, hookDevLength, straightDevLength } from '../shared/anchorGroup.js';
import { anchorReinf } from '../../../tools/staad-stability.mjs';
import { parseFndCommands } from '../import/fndCommands.js';
let pass = 0, fail = 0;
function ok(n, c, x = '') { if (c) { pass++; console.log('PASS ' + n + ' ' + x); } else { fail++; console.log('FAIL ' + n + ' ' + x); } }
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const base = { Bp: 300, Lp: 300, sx: 130, sz: 130, da: 16, Ase: 157, futa: 400, hef: 300, Abrg: 290, fc: 21.7, seismic: true };
const A13 = Math.PI / 4 * 169;
const hp = { type: 'hairpin', db: 13, fy: 420 };

// ---- tension: Mz = 5 -> 2 anchors in tension, 38.462 kN group (part19)
const t = anchorGroupCheck({ ...base, Mz: 5, reinf: hp });
ok('default leg offset r = d_a/2 + d_b/2 = 14.5 mm (in contact)', near(t.ar.r, 14.5, 1e-12));
ok('tension hairpins: 2 anchors × 1 hairpin × 2 legs = 4 legs, A_s = 4·132.7 = 530.9', t.ar.n === 4 && t.ar.hairpins === 2 && near(t.ar.As, 4 * A13, 1e-9));
ok('above the 35° plane: 300 − 14.5·tan35° − 50 = 239.8 ≥ l_dh 150 -> developed', near(t.ar.avail, 300 - 14.5 * Math.tan(35 * Math.PI / 180) - 50, 1e-9) && t.ar.developed && near(t.ar.ldh, 150, 1e-9));
const ucT = 2 * 5e6 * 65 / 16900 / (0.75 * 4 * A13 * 420);
ok('hairpin tension UC = 38 462 / (0.75·530.9·420) = 0.230, replaces N_cbg', near(t.tension[1].uc, ucT, 1e-9) && /hairpins/.test(t.tension[1].name), t.tension[1].uc.toFixed(4));
ok('with tension hairpins side-face blowout governs (1.33, corner factor)', t.govT.name === 'Side-face blowout N_sbg' && !t.pass, t.uc.toFixed(3));
ok('hairpin strength is steel: same UC with seismic off (no × 0.75)', near(anchorGroupCheck({ ...base, seismic: false, Mz: 5, reinf: hp }).tension[1].uc, ucT, 1e-12));
ok('2 hairpins per anchor -> 8 legs, half the UC', near(anchorGroupCheck({ ...base, Mz: 5, reinf: { ...hp, n: 2 } }).tension[1].uc, ucT / 2, 1e-12));
const far = anchorGroupCheck({ ...base, Mz: 5, reinf: { ...hp, r: 160 } });
ok('legs at r = 160 > 0.5·hef = 150 do not count -> UC ∞', far.ar.n === 0 && !far.ar.within && far.tension[1].uc === Infinity);
ok('short anchor hef 150: 150 − 10.2 − 50 < 150 -> not developed -> UC ∞', anchorGroupCheck({ ...base, hef: 150, Mz: 5, reinf: hp }).tension[1].uc === Infinity);
ok('tension off -> concrete breakout N_cbg is checked again', anchorGroupCheck({ ...base, Mz: 5, reinf: { ...hp, tension: false } }).tension[1].name === 'Concrete breakout N_cbg');
// l_d below the plane (§25.4.2.3, ψt = 1.0): 420/(1.4·√21.7)·13 = 837.4 mm
ok('length below the plane l_d = 420·13/(1.4·√21.7) = 837 mm (reported)', near(t.ar.ldBelow, 420 * 13 / (1.4 * Math.sqrt(21.7)), 1e-9), t.ar.ldBelow.toFixed(1));

// ---- shear: Fx = 4 kN -> front row along x
const v = anchorGroupCheck({ ...base, Fx: 4, reinf: hp });
ok('shear hairpins along x: 2 front anchors × 1 hairpin × 2 legs = 4 legs', v.arV.axis === 'x' && v.arV.n === 4 && v.arV.anchors === 2);
ok('leg length = Bp/2 + sx/2 − side cover 40 = 175 ≥ l_dh 150 -> developed', near(v.arV.legAvail, 175, 1e-12) && v.arV.developed && near(v.arV.ldReq, hookDevLength({ fy: 420, fc: 21.7, db: 13 }), 1e-12));
ok('hairpin shear UC = 4 000 / (0.75·4·132.7·420), replaces V_cbg', near(v.shear[1].uc, 4000 / (0.75 * 4 * A13 * 420), 1e-9) && /hairpins/.test(v.shear[1].name), v.shear[1].uc.toFixed(4));
const ld = 420 * 1.3 / (1.4 * Math.sqrt(21.7)) * 13;
ok('l_d straight (§25.4.2.3, ψt 1.3) = 420·1.3·13/(1.4·√21.7) = 1089 mm', near(straightDevLength({ fy: 420, fc: 21.7, db: 13 }), ld, 1e-9), ld.toFixed(1));
ok('l_d ≥ 300 mm and × 1.15 for Grade 520; 1.1 for d_b > 19', near(straightDevLength({ fy: 420, fc: 60, db: 6, psiT: 1 }), 300, 1e-12) &&
  near(straightDevLength({ fy: 520, fc: 21.7, db: 13 }), 520 * 1.3 * 1.15 / (1.4 * Math.sqrt(21.7)) * 13, 1e-9) &&
  near(straightDevLength({ fy: 420, fc: 21.7, db: 22 }), 420 * 1.3 / (1.1 * Math.sqrt(21.7)) * 22, 1e-9));
ok('straight legs 175 < l_d 1089 -> not developed -> shear UC ∞', anchorGroupCheck({ ...base, Fx: 4, reinf: { ...hp, legEnd: 'straight' } }).shear[1].uc === Infinity);
const vz = anchorGroupCheck({ ...base, Bp: 400, Fz: -3, Fx: 1, reinf: { ...hp, sideCover: 50 } });
ok('Fz dominant -> along z, leg = Lp/2 + sz/2 − 50 = 165', vz.arV.axis === 'z' && near(vz.arV.legAvail, 165, 1e-12));
ok('shear off -> concrete breakout V_cbg is checked again', anchorGroupCheck({ ...base, Fx: 4, reinf: { ...hp, shear: false } }).shear[1].name === 'Concrete breakout V_cbg');
ok('no shear -> no shear hairpin result', anchorGroupCheck({ ...base, Mz: 5, reinf: hp }).arV === null);

// ---- pedestal bars (type 'bars', part19) unchanged; per-anchor forces returned
const bars = [[-93.5, -93.5], [93.5, -93.5], [93.5, 93.5], [-93.5, 93.5]];
const rb = anchorGroupCheck({ ...base, Mz: 5, reinf: { bars, db: 13, fy: 420, topCover: 50 } });
ok('pedestal bars: type "bars", same UC as part19', rb.ar.type === 'bars' && near(rb.tension[1].uc, 38.4615 / (0.75 * 2 * A13 * 420 / 1000), 1e-3) && rb.arV === null);
ok('anchors[]: tensions add up to the group tension', near(t.anchors.reduce((s, a) => s + a.T, 0), t.Tgrp, 1e-9) && t.anchors.length === 4);

// ---- CLI mapping (tools/staad-stability.mjs anchorReinf)
const ctx = { bars, bar: 13, fy: 420, clearCover: 40 };
ok('CLI: reinforcement true / "bars" -> the pedestal bars', anchorReinf({ reinforcement: true }, ctx).bars === bars && anchorReinf({ reinforcement: 'bars' }, ctx).db === 13);
const cm = anchorReinf({ reinforcement: 'hairpin', hairpin: { db: 10, shear: false } }, ctx);
ok('CLI: "hairpin" -> D10, n 1, tension only, hooked, side cover = pedestal clear cover', cm.type === 'hairpin' && cm.db === 10 && cm.n === 1 && cm.tension && !cm.shear && cm.legEnd === 'hook' && cm.sideCover === 40 && cm.r === undefined);
ok('CLI: no reinforcement -> null', anchorReinf({}, ctx) === null);

// ---- .fnd
const f = parseFndCommands('ANCHOR ASE 157 FUTA 400 HEF 300 ABRG 290 REINFORCEMENT HAIRPIN SPACING 130\nHAIRPIN BAR 10 N 2 R 20 COVER 45 SHEAR OFF STRAIGHT').config.criteria.pedestal.anchor;
ok('.fnd: REINFORCEMENT HAIRPIN + HAIRPIN BAR 10 N 2 R 20 COVER 45 SHEAR OFF STRAIGHT', f.reinforcement === 'hairpin' && f.spacings[0] === 130 && f.hairpin.db === 10 &&
  f.hairpin.n === 2 && f.hairpin.r === 20 && f.hairpin.sideCover === 45 && f.hairpin.shear === false && f.hairpin.legEnd === 'straight');
ok('.fnd: REINFORCEMENT alone stays the pedestal bars', parseFndCommands('ANCHOR ASE 157 REINFORCEMENT').config.criteria.pedestal.anchor.reinforcement === true);
ok('.fnd: TENSION needs ON / OFF', parseFndCommands('HAIRPIN TENSION MAYBE').errors.some(e => /TENSION needs ON or OFF/.test(e)));

console.log(`PART38: ${pass} pass, ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
