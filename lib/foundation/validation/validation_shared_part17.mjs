// VALIDATION part17 — punching of a shallow footing at an edge / corner (footingPunchingSection / footingPunchingShear /
// footingPunchingStress / footingPunchingCapacity): critical section at d/2 cut by the footing edges (ACI 318M-19 §22.6.4.1),
// α_s 40 / 30 / 20, J_c about the centroid of the section and the moment moved to it (R8.4.4.2.3). Hand calculations below;
// the interior case must reproduce eccentricPunchingStress() (footingCheck.js) exactly.
import { signedSoilPressure, footingPunchingSection, footingPunchingShear, footingPunchingStress, footingPunchingCapacity, eccentricPunchingStress } from '../index.js';
let pass = 0, fail = 0;
function ok(n, c, x = '') { if (c) { pass++; console.log('PASS ' + n + ' ' + x); } else { fail++; console.log('FAIL ' + n + ' ' + x); } }
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const u = signedSoilPressure(2, 2, 400, 0, 0); // q = 100 kPa uniform
const d = 0.3;

// ---- 1. interior = eccentricPunchingStress() ----
const si = footingPunchingSection({ B: 2, L: 2, cx: 0.1, cz: -0.1, c1: 0.5, c2: 0.4, d });
ok('interior: 4 sides, α_s 40, b_o = 2(0.8) + 2(0.7) = 3.0', si.loc === 'interior' && si.alphaS === 40 && near(si.bo, 3.0, 1e-12));
const vi = footingPunchingStress({ sec: si, Vu: 300, Mx: -40, Mz: 60 });
const ei = eccentricPunchingStress({ c1: 500, c2: 400, d: 300, Vu: 300, Mx: -40, Mz: 60 });
ok('interior v_u = eccentricPunchingStress', near(vi.vu, ei.vu, 1e-9), `${vi.vu} / ${ei.vu}`);
ok('interior J_c (Mz) = d·b1³/6 + b1·d³/6 + d·b2·b1²/2', near(vi.terms[0].J * 1e12, ei.terms[0].Jc, 1e-3 * ei.terms[0].Jc));
ok('interior: no moment shift (x̄ = xp)', near(vi.terms[0].Mc, 60, 1e-9) && near(vi.terms[1].Mc, -40, 1e-9));

// ---- 2. edge: pedestal 0.5 at (0.7, 0), d 0.3 -> face at 0.95, edge at 1.0 (0.05 < d/2): side x+ is free ----
// sides: x = 0.3 (l 0.8), z = ±0.4 (l 0.7 each, x 0.3..1.0); b_o = 2.2; x̄ = (0.8·0.3 + 1.4·0.65)/2.2 = 0.522727
const se = footingPunchingSection({ B: 2, L: 2, cx: 0.7, cz: 0, c1: 0.5, c2: 0.5, d });
ok('edge: 3 sides, α_s 30, free x+', se.loc === 'edge' && se.alphaS === 30 && se.free.xp && !se.free.xm);
ok('edge b_o = 2.2', near(se.bo, 2.2, 1e-12), se.bo);
ok('edge x̄ = 0.522727', near(se.xbar, 0.5227272727, 1e-9), se.xbar);
// Jz = 0.8·d·(0.3 − x̄)² + 2·[d·0.7³/12 + 0.7·d³/12 + 0.7·d·(0.65 − x̄)²] = 0.0390091
ok('edge J_z = 0.0390091 m⁴', near(se.Jz, 0.03900909091, 1e-10), se.Jz);
// Jx = d·0.8³/12 + 0.8·d³/12 + 2·0.7·d·0.4² = 0.0818
ok('edge J_x = 0.0818 m⁴', near(se.Jx, 0.0818, 1e-12), se.Jx);
const pe = footingPunchingShear({ pl: u, B: 2, L: 2, cx: 0.7, cz: 0, c1: 0.5, c2: 0.5, d });
ok('edge V_u = 400 − 100·0.7·0.8 = 344', near(pe.Vu, 344, 1e-9), pe.Vu);
// no applied moment: Mz,c = Vu·(0.7 − x̄) = 60.982; γv = 1 − 1/(1 + (2/3)√(0.7/0.8)) = 0.384088
// v = 344/(2.2·0.3)/1000 + γv·Mz,c·(1.0 − x̄)/Jz/1000 = 0.521212 + 0.286571 = 0.807783 MPa (at the free edge)
const ve = footingPunchingStress({ sec: se, Vu: pe.Vu });
ok('edge moment shifted to the section centroid: Mz,c = 60.982', near(ve.terms[0].Mc, 60.98181818, 1e-6), ve.terms[0].Mc);
ok('edge γv = 0.384088', near(ve.terms[0].gv, 0.384088378, 1e-8));
ok('edge v_u = 0.807783 MPa at x = 1.0', near(ve.vu, 0.8077831772, 1e-9) && near(ve.at.x, 1.0, 1e-12), ve.vu);
// capacity f'c 30, λ 1: (c) 0.083(30·300/2200 + 2)√30 = 2.769, (a) 0.33√30 = 1.8075 governs
const ce = footingPunchingCapacity({ sec: se, fc: 30 });
ok('edge v_c = 0.33√30 = 1.8075 (a governs)', near(ce.vc_gov, 0.33 * Math.sqrt(30), 1e-12));
ok('edge (c) = 0.083(α_s d/b_o + 2)√f\'c = 2.7690', near(ce.vc_vals[2].val, 2.768986493, 1e-8), ce.vc_vals[2].val);

// ---- 3. corner: pedestal 0.5 at (0.7, 0.7) -> sides x = 0.3 and z = 0.3 (l 0.7 each), b_o 1.4, x̄ = z̄ = 0.475 ----
const sc = footingPunchingSection({ B: 2, L: 2, cx: 0.7, cz: 0.7, c1: 0.5, c2: 0.5, d });
ok('corner: 2 sides, α_s 20', sc.loc === 'corner' && sc.alphaS === 20 && near(sc.bo, 1.4, 1e-12));
ok('corner centroid (0.475, 0.475)', near(sc.xbar, 0.475, 1e-12) && near(sc.zbar, 0.475, 1e-12));
ok('corner J_z = 0.0230125 m⁴', near(sc.Jz, 0.0230125, 1e-12), sc.Jz);
const pc = footingPunchingShear({ pl: u, B: 2, L: 2, cx: 0.7, cz: 0.7, c1: 0.5, c2: 0.5, d });
ok('corner V_u = 400 − 100·0.7² = 351', near(pc.Vu, 351, 1e-9), pc.Vu);
const vcn = footingPunchingStress({ sec: sc, Vu: pc.Vu });
ok('corner Mz,c = 351·0.225 = 78.975, Mx,c = −78.975', near(vcn.terms[0].Mc, 78.975, 1e-9) && near(vcn.terms[1].Mc, -78.975, 1e-9));
ok('corner v_u = 1.316171 MPa', near(vcn.vu, 1.316170559, 1e-8), vcn.vu);
ok('corner (c) = 0.083(20·300/1400 + 2)√30 = 2.8575', near(footingPunchingCapacity({ sec: sc, fc: 30 }).vc_vals[2].val, 2.857546829, 1e-8));

// ---- 4. limits ----
ok('section spanning two opposite edges -> invalid', !footingPunchingSection({ B: 0.7, L: 2, cx: 0, cz: 0, c1: 0.5, c2: 0.5, d }).valid);
ok('pedestal outside the footing -> invalid', !footingPunchingSection({ B: 2, L: 2, cx: 0.9, cz: 0, c1: 0.5, c2: 0.5, d }).valid);
ok('face exactly d/2 from the edge -> side kept as free (edge)', footingPunchingSection({ B: 2, L: 2, cx: 0.6, cz: 0, c1: 0.5, c2: 0.5, d }).loc === 'edge');
ok('face more than d/2 from the edge -> interior', footingPunchingSection({ B: 2, L: 2, cx: 0.5, cz: 0, c1: 0.5, c2: 0.5, d }).loc === 'interior');

console.log(`\npart17: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
