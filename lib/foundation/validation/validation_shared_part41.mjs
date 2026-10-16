// VALIDATION part41 — skid support reactions -> equipment loads + load points (skidSupportLoads(), skidMounted/loadingData.js).
// Hand calculation — rectangular skid tank (E(E) = 88.3 kN, E(O) = 587.4 kN, E(T) = 792 kN) on four base plates 0.3 × 0.3 m at
// x = ±1.0 m, z = ±5.0 m from the footing centre; vendor reactions per support:
//   empty 22.075 kN each (Σ 88.3);  operating 150.0 (z = +5) / 143.7 (z = −5) kN (Σ 587.4);  test 198 kN each (Σ 792)
//   operating centroid z̄ = (2·150·5 − 2·143.7·5)/587.4 = 63/587.4 = 0.10725 m, x̄ = 0;  empty / test centroid (0, 0) -> shift 0.10725 m
//   shares = operating reactions -> f = 150/587.4 = 0.25536, 143.7/587.4 = 0.24464
//   footingPointLoads with P = E(O) = 587.4 kN (no self-weight): M_x = −Σ P_j·z_j = −(300·5 − 287.4·5) = −63.0 kN·m, M_z = 0
import { skidSupportLoads, footingPointLoads } from '../index.js';
let pass = 0, fail = 0;
function ok(n, c, x = '') { if (c) { pass++; console.log('PASS ' + n + ' ' + x); } else { fail++; console.log('FAIL ' + n + ' ' + x); } }
const near = (a, b, tol) => Math.abs(a - b) <= tol;

const sup = [
  { x: -1, z: 5, c1: 0.3, c2: 0.3, PE: 22.075, PO: 150, PT: 198 },
  { x: 1, z: 5, c1: 0.3, c2: 0.3, PE: 22.075, PO: 150, PT: 198 },
  { x: -1, z: -5, c1: 0.3, c2: 0.3, PE: 22.075, PO: 143.7, PT: 198 },
  { x: 1, z: -5, c1: 0.3, c2: 0.3, PE: 22.075, PO: 143.7, PT: 198 }
];
const r = skidSupportLoads(sup);
ok('Σ reactions: E(E) = 88.3, E(O) = 587.4, E(T) = 792 kN', r.valid && near(r.EE, 88.3, 1e-9) && near(r.EO, 587.4, 1e-9) && near(r.ET, 792, 1e-9), `${r.EE} ${r.EO} ${r.ET}`);
ok('basis = operating, shares = operating reactions, points in the footing frame (y = z)', r.basis === 'O' && r.points[0].share === 150 && r.points[2].share === 143.7 && r.points[2].y === -5 && r.points[1].x === 1 && r.points[0].c1 === 0.3);
ok('operating centroid (0, 0.10725) m', near(r.centroid.x, 0, 1e-12) && near(r.centroid.z, 63 / 587.4, 1e-12) && near(r.centroid.z, 0.10725, 1e-5), r.centroid.z.toFixed(6));
ok('empty / test centroid at (0, 0): shift 0.10725 m; operating shift 0', near(r.cond.E.shift, 0.10725, 1e-5) && near(r.cond.T.shift, 0.10725, 1e-5) && r.cond.O.shift === 0, r.cond.E.shift.toFixed(6));
ok('no issues for positive reactions', r.issues.length === 0, JSON.stringify(r.issues));
const fp = footingPointLoads(r.points, { P: r.EO, kD: 0, dW: 0, Af: 3 * 12.1 });
ok('load points with P = E(O): point loads 150 / 150 / 143.7 / 143.7 kN', near(fp.pointLoads[0].P, 150, 1e-9) && near(fp.pointLoads[3].P, 143.7, 1e-9), fp.pointLoads.map(q => q.P.toFixed(3)).join(' '));
ok('group M_x = −63.0 kN·m, M_z = 0 (the reaction centroid off the footing centre)', near(fp.group.Mx, -63, 1e-9) && near(fp.group.Mz, 0, 1e-9), `${fp.group.Mx} ${fp.group.Mz}`);

// fallbacks and uplift
const r0 = skidSupportLoads(sup.map(s => ({ ...s, PO: 0 })));
ok('no operating column -> shares from the empty reactions (equal here), issue reported', r0.basis === 'E' && r0.points.every(p => p.share === 22.075) && r0.issues.length === 1);
const rz = skidSupportLoads(sup.map(s => ({ ...s, PE: 0, PO: 0, PT: 0 })));
ok('all zero -> equal shares, issue reported', rz.basis === null && rz.points.every(p => p.share === 1) && rz.issues.length === 1 && rz.EO === 0);
const ru = skidSupportLoads([{ x: -1, z: 0, c1: 0.3, c2: 0.3, PE: 10, PO: 300, PT: 0 }, { x: 1, z: 0, c1: 0.3, c2: 0.3, PE: 10, PO: -20, PT: 0 }]);
ok('uplift support: share 0, Σ E(O) = 280 kN (net), issue names support 2', ru.points[1].share === 0 && near(ru.EO, 280, 1e-12) && ru.issues.some(t => t.startsWith('Support 2: operating')), JSON.stringify(ru.issues));
ok('no supports -> invalid', skidSupportLoads([]).valid === false && skidSupportLoads(null).valid === false);

console.log(`\npart41: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
