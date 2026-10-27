// VALIDATION — steel connection library vs hand calculation (AISC 360-16 / 341-16)
// Run: node lib/steel/validation/validation_connection_part1.mjs
import { bolt, steel, boltShear, boltTension, boltCombined, boltBearing, blockShear, filletWeld, compressionPlate, whitmoreWidth,
  flangeLocalBending, webLocalYielding, connectionDemand, checkConnection, CATALOGUE, allowable,
  capacityTable, variantCapacity, pickVariant, VARIANTS } from '../connection/index.js';

let pass = 0, fail = 0;
function eq(name, got, exp, tol = 1e-6) {
  const okk = Math.abs(got - exp) <= tol;
  if (okk) { pass++; console.log('PASS ' + name + ' got=' + got); }
  else { fail++; console.log('FAIL ' + name + ' got=' + got + ' exp=' + exp); }
}
function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log('PASS ' + name + ' ' + extra); }
  else { fail++; console.log('FAIL ' + name + ' ' + extra); }
}

// --- bolts (Table J3.2): M20 A325-N, Ab = 314.159 mm²
const b20 = bolt('A325', 20, 'N');
eq('M20 Ab', b20.Ab, 314.1593, 1e-3);
eq('M20 A325-N shear ASD (Rn/2)', boltShear({ V: 1, n: 1, bolt: b20 }).capacity, 372 * 314.1593 / 1000 / 2, 1e-3);   // 58.434
eq('M20 A325-N shear LRFD (0.75Rn)', boltShear({ V: 1, n: 1, bolt: b20, method: 'LRFD' }).capacity, 0.75 * 372 * 314.1593 / 1000, 1e-3);
const a307 = bolt('A307', 20);
eq('M20 A307 tension ASD', boltTension({ T: 1, n: 1, bolt: a307 }).capacity, 310 * 314.1593 / 1000 / 2, 1e-3);     // 48.695 (ATT F)
// combined (J3.7): frv = 8220/(4·314.16) = 6.541 MPa -> F'nt = 403 − 2·310/188·6.541 = 381.4 -> capped at Fnt = 310
eq('A307 combined capped at Fnt', boltCombined({ T: 1, V: 8.22, n: 4, bolt: a307 }).capacity, 310 * 314.1593 * 4 / 1000 / 2, 1e-3);
// combined, high shear: frv = 150 MPa -> F'nt = 806 − 2·620/372·150 = 306 MPa (A325-N)
eq('A325 combined F\'nt reduced', boltCombined({ T: 1, V: 150 * 314.1593 / 1000, n: 1, bolt: b20 }).capacity, 306 * 314.1593 / 1000 / 2, 1e-2);
eq('M20 std hole 22 / emin 26', b20.holeD * 100 + b20.emin, 2226, 0);

// --- bearing (J3.10): t 10, Fu 400, le 35, s 60, hole 22, 2 bolts -> 115.2 + 182.4 = 297.6 kN, ASD 148.8
eq('bearing 2 bolts ASD', boltBearing({ V: 1, n: 2, bolt: b20, t: 10, Fu: 400, le: 35, s: 60, holeD: 22 }).capacity, 148.8, 1e-9);
// --- block shear (J4.3): Agv 1000, Anv 800, Ant 300, Fy 250, Fu 400 -> min(312, 270) = 270 kN, ASD 135
eq('block shear ASD', blockShear({ P: 1, Agv: 1000, Anv: 800, Ant: 300, Fy: 250, Fu: 400 }).capacity, 135, 1e-9);
// --- fillet weld (J2.4): 0.6·480·0.707·6·100 = 122.17 kN, ASD 61.08
eq('fillet weld ASD', filletWeld({ R: 1, w: 6, L: 100 }).capacity, 0.6 * 480 * 0.707 * 6 * 100 / 1000 / 2, 1e-9);
eq('fillet weld directional 90°', filletWeld({ R: 1, w: 6, L: 100, theta: 90, useDirection: true }).capacity, 1.5 * 61.0848, 1e-3);
// --- plate compression: b 100, t 10, L 100, K 0.65 -> KL/r 22.5 <= 25 -> FyAg/1.67 = 149.70
eq('plate compression J4.4(a)', compressionPlate({ P: 1, b: 100, t: 10, L: 100, K: 0.65, Fy: 250 }).capacity, 250 * 1000 / 1000 / 1.67, 1e-6);
// L 500, K 1 -> KL/r 173.2 > 133.2 -> Fcr = 0.877 Fe = 0.877·65.797 = 57.70 MPa -> 57.70 kN /1.67 = 34.55
eq('plate compression E3 elastic', compressionPlate({ P: 1, b: 100, t: 10, L: 500, K: 1, Fy: 250 }).capacity, 0.877 * Math.PI ** 2 * 200000 / (500 / (10 / Math.sqrt(12))) ** 2 * 1000 / 1000 / 1.67, 1e-6);
eq('Whitmore width L 120', whitmoreWidth({ Lconn: 120 }), 138.564, 1e-3);
// --- J10
eq('flange local bending tf 11 Fy 245', flangeLocalBending({ F: 1, tf: 11, Fyf: 245 }).capacity, 6.25 * 245 * 121 / 1000 / 1.67, 1e-6);
eq('web local yielding interior', webLocalYielding({ F: 1, tw: 7.5, k: 24, lb: 28, Fyw: 245 }).capacity, 245 * 7.5 * 148 / 1000 / 1.5, 1e-6);
eq('allowable LRFD shear yield phi 1.0', allowable(100, 'shearYield', 'LRFD'), 100, 0);

// --- seismic demand modes
let d = connectionDemand({ mode: 'ocbf-brace', member: { Ag: 1362, Fy: 245, Ry: 1.5 } });
eq('OCBF RyFyAg/1.5 (ASD)', d.T, 1.5 * 245 * 1362 / 1000 / 1.5, 1e-9);                            // 333.69 kN
d = connectionDemand({ mode: 'ocbf-brace', member: { Ag: 1362, Fy: 245, Ry: 1.5 }, omega0: { T: 20 } });
eq('OCBF lesser with overstrength', d.T, 20, 1e-12);
const Z250 = 125 * 9 * (250 - 9) + 6 * (250 - 18) ** 2 / 4;                                          // 351 861 mm³
d = connectionDemand({ mode: 'omf-moment', member: { Z: Z250, Fy: 245, Ry: 1.5 } });
eq('OMF 1.1RyMp/1.5 (ASD)', d.M, 1.1 * 1.5 * 245 * Z250 / 1e6 / 1.5, 1e-9);                       // 94.83 kN·m
// seismic requirement is additional to the non-seismic combinations (AISC 341-16 A1): never below the analysis demand
d = connectionDemand({ mode: 'ocbf-brace', member: { Ag: 1362, Fy: 245, Ry: 1.5 }, analysis: { T: 5.36 }, omega0: { T: 3.75 } });
eq('OCBF T = max(analysis 5.36, lesser(333.69, 3.75))', d.T, 5.36, 1e-12);
d = connectionDemand({ mode: 'ocbf-brace', member: { Ag: 1362, Fy: 245, Ry: 1.5 }, analysis: { T: 5.36 }, omega0: { T: 20 } });
eq('OCBF T = overstrength 20 when > analysis', d.T, 20, 1e-12);
d = connectionDemand({ mode: 'omf-moment', member: { Z: Z250, Fy: 245, Ry: 1.5, Lh: 4825, Vgrav: 0.94 }, analysis: { M: 12, V: 4.34, P: 3.31 }, omega0: { M: 10.22, V: 7.76, P: 2.15 } });
eq('OMF M = max(analysis 12, lesser(94.83, 10.22))', d.M, 12, 1e-12);
eq('OMF V = max(4.34, lesser(2·94.83/4.825 + 0.94, 7.76))', d.V, 7.76, 1e-12);
eq('OMF P = max(analysis 3.31, overstrength 2.15)', d.P, 3.31, 1e-12);
d = connectionDemand({ mode: 'omega0', analysis: { T: 5.49 }, omega0: { T: 3.64 } });
eq('omega0 mode T = max(analysis 5.49, overstrength 3.64)', d.T, 5.49, 1e-12);
let thrown = false; try { connectionDemand({ mode: 'omega0' }); } catch (e) { thrown = true; }
ok('omega0 without forces throws', thrown);

// --- catalogue
ok('catalogue SC-01..SC-06', Object.keys(CATALOGUE).join() === 'SC-01,SC-02,SC-03,SC-04,SC-05,SC-06');
// SC-02 hand calc: L100x100x7, 3-M16 A325-N, s 60, P = 40 kN tension
let r = checkConnection({ type: 'SC-02', forces: { T: 40 } });
const bs = r.checks.find(c => c.clause === 'AISC 360-16 J3.6');
eq('SC-02 bolt shear capacity 3-M16', bs.capacity, 3 * 372 * Math.PI * 64 / 1000 / 2, 1e-6);       // 112.19 kN
const xb = (100 * 100 + 100 * 7 - 49) / (2 * 193), U = 1 - xb / 120;
eq('SC-02 shear lag U', r.geometry.U, U, 1e-9);                                                    // 0.770
const rup = r.checks.find(c => c.name.startsWith('Tension rupture of angle'));
eq('SC-02 angle rupture', rup.capacity, 400 * U * (1362 - 20 * 7) / 1000 / 2, 1e-6);
ok('SC-02 passes at 40 kN', r.overallPass, 'UC ' + r.governingUC.toFixed(3) + ' ' + r.governing);
r = checkConnection({ type: 'SC-02', forces: { T: 200 } });
ok('SC-02 fails at 200 kN', !r.overallPass, 'UC ' + r.governingUC.toFixed(3) + ' ' + r.governing);
// SC-01: 2-M16, V 20 kN, e = 60 -> Ip = 2·30² = 1800, Rb = hypot(20·60·30/1800, 10) = 22.36 kN
r = checkConnection({ type: 'SC-01', forces: { V: 20 } });
eq('SC-01 most loaded bolt (elastic)', r.checks[0].demand, Math.hypot(20 * 60 * 30 / 1800, 10), 1e-9);
ok('SC-01 runs', r.checks.length > 8, 'UC ' + r.governingUC.toFixed(3));
for (const t of ['SC-03', 'SC-04', 'SC-05', 'SC-06']) {
  r = checkConnection({ type: t, forces: { T: 10, V: 5, P: 20, M: 10 } });
  ok(t + ' runs, finite UC', r.checks.length > 3 && Number.isFinite(r.governingUC), 'UC ' + r.governingUC.toFixed(3) + ' ' + r.governing);
}
// SC-03 rod D16 A36-245: threaded 0.75·400·201.06/2 = 30.16 kN
r = checkConnection({ type: 'SC-03', forces: { T: 10 } });
eq('SC-03 rod threaded rupture', r.checks[1].capacity, 0.75 * 400 * Math.PI * 64 / 1000 / 2, 1e-6);

// --- variant tables (capacity = largest force with every check passing)
let tb = capacityTable('SC-03');
eq('SC03-D16 capacity = rod yield FyAg/1.67', tb.rows.find(r => r.kode === 'SC03-D16').cap.T, 245 * Math.PI * 64 / 1000 / 1.67, 1e-6);
tb = capacityTable('SC-02');
eq('SC02-L100-3 T = 3-M16 bolt shear', tb.rows.find(r => r.kode === 'SC02-L100-3').cap.T, 3 * 372 * Math.PI * 64 / 1000 / 2, 1e-6);
for (const t of Object.keys(VARIANTS)) {
  const T = capacityTable(t);
  ok(t + ' table: every variant has capacity > 0', T.rows.every(r => Object.values(r.cap).every(v => v > 0)),
    T.rows.map(r => r.kode + ' ' + Object.values(r.cap).map(v => v.toFixed(1)).join('/')).join('; '));
  const r0 = T.rows[0], k = T.keys[0];
  const at = checkConnection({ type: t, params: r0.param, forces: { [k]: r0.cap[k] } });
  eq(t + ' governing UC at capacity = 1', at.governingUC, 1, 1e-6);
}
const pv = pickVariant('SC-01', { V: 50 });
ok('pickVariant SC-01 V 50 -> SC01-16-3', pv && pv.kode === 'SC01-16-3', pv && pv.kode);

// --- strength UC apart from detailing ratios; SC-01 web fit; SC-05 panel zone with beams both sides (26-10-2026)
r = checkConnection({ type: 'SC-01', forces: { V: 1 } });
ok('SC-01 small V: governing = detailing, strengthUC small', r.governingUC > r.strengthUC && r.strengthUC < 0.1,
  `UC ${r.governingUC.toFixed(3)} (${r.governing}) / strength ${r.strengthUC.toFixed(3)} (${r.strengthGoverning})`);
r = checkConnection({ type: 'SC-01', params: { web: { T: 87 } }, forces: { V: 5 } });
ok('SC-01 2-M16 hp 130 does not fit web T 87', !r.overallPass && r.governing.startsWith('Plate fits'), r.governing);
r = checkConnection({ type: 'SC-01', params: { n: 1, web: { T: 87 } }, forces: { V: 5 } });
ok('SC-01 1-M16 hp 70 fits web T 87', r.checks.find(c => c.name.startsWith('Plate fits')).pass);
// panel zone: Ff = 10·1000/(250+12) = 38.17 kN; + opposite 5 kN·m -> 19.08; total 57.25 kN
r = checkConnection({ type: 'SC-05', forces: { M: 10, Mopp: 5 } });
eq('SC-05 panel zone demand both sides', r.checks.find(c => c.name.startsWith('Column panel-zone')).demand, 15 * 1000 / 262, 1e-9);

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
