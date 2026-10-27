// VALIDATION part28 — punching of a pile through the pile cap (pilePunchingCheck), ACI 318M-19 §22.6 / Table 22.6.5.2.
// Hand calculation: 12 square piles 0.30 m in a 4.0 × 11.6 m cap (Filter Coalescer), h = 400 mm, cover 75 mm, D13 -> d = 318.5 mm
// (outer layer), f'c = 19 MPa, φ = 0.75. The source document (C.6.6) obtains φV_c = 797.22 kN for an interior pile.
import { pilePunchingCheck } from '../index.js';
let pass = 0, fail = 0;
function ok(n, c, x = '') { if (c) { pass++; console.log('PASS ' + n + ' ' + x); } else { fail++; console.log('FAIL ' + n + ' ' + x); } }
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const piles = []; let k = 0; for (const x of [1.45, 0, -1.45]) for (const y of [-5.25, -1.75, 1.75, 5.25]) piles.push({ i: ++k, x, y, F: 119.5 });
const r = pilePunchingCheck({ piles, D: 0.3, shape: 'square', B: 4.0, L: 11.6, d: 0.3185, fc: 19 });
const interior = r.items.find(p => p.x === 0 && p.y === -1.75), edge = r.items.find(p => p.x === 1.45 && p.y === -1.75), corner = r.items.find(p => p.x === 1.45 && p.y === -5.25);
ok('valid, 12 piles', r.valid && r.items.length === 12);
// interior pile (x = 0, y = -1.75): b_o = 4·(0.30 + 0.3185) = 2.474 m, α_s = 40, β = 1
ok('interior pile: b_o = 4(D + d) = 2474 mm, α_s = 40', interior.loc === 'interior' && near(interior.bo, 2.474, 1e-9) && interior.sec.alphaS === 40);
// v_c = min( 0.33λs√f'c , 0.17(1+2/β)λs√f'c , 0.083(αs d/bo + 2)λs√f'c ); λs = √(2/(1 + 0.004·318.5)) = 0.9381
const ls = Math.sqrt(2 / (1 + 0.004 * 318.5));
const vcI = Math.min(0.33 * ls * Math.sqrt(19), 0.17 * 3 * ls * Math.sqrt(19), 0.083 * (40 * 318.5 / 2474 + 2) * ls * Math.sqrt(19));
ok('λs = 0.938 (Eq. 22.5.5.1.3) and v_c = 0.33λs√f\'c = 1.349 MPa governs for the interior pile', near(ls, 0.9381, 5e-4) && near(vcI, 0.33 * ls * Math.sqrt(19), 1e-12) && near(interior.cap.vc_gov, vcI, 1e-12), `${ls.toFixed(4)} ${vcI.toFixed(4)}`);
ok('interior pile: φV_c = 0.75·1.349·2474·318.5 = 797 kN (the source document: 797.22 kN)', near(interior.phiVc, 0.75 * vcI * 2474 * 318.5 / 1000, 1e-6) && near(interior.phiVc, 797.2, 1.0), interior.phiVc.toFixed(2));
// edge pile (x = 1.45: 0.55 m from the cap edge; d/2 + D/2 = 0.309 -> the section stays inside the cap on that side? 0.55 > 0.309 yes -> interior). A pile 0.20 m from the edge is an edge pile.
ok('piles 0.55 m from the cap edge are still interior (0.55 > D/2 + d/2 = 0.309 m)', edge.loc === 'interior' && corner.loc === 'interior');
const near_edge = pilePunchingCheck({ piles: [{ i: 1, x: 1.80, y: 0, F: 100 }, { i: 2, x: 1.80, y: 5.5, F: 100 }], D: 0.3, B: 4.0, L: 11.6, d: 0.3185, fc: 19 });
const [pe, pc] = near_edge.items;
// x = 1.80: cap edge at 2.0 -> 0.20 m < 0.309 m: the +x side is free -> edge pile: 3 sides: 2·(0.3 + 0.3185)·... sides along z at x- (length 0.6185) and two along x clipped: x from 1.80-0.309=1.491 to 2.0
const l1 = 0.6185, l2 = 2.0 - (1.80 - 0.30925);
ok('pile 0.20 m from the edge: edge pile, α_s = 30, b_o = 0.6185 + 2·(2.0 − 1.4908) = 1.636 m', pe.loc === 'edge' && pe.sec.alphaS === 30 && near(pe.bo, l1 + 2 * l2, 1e-9), `${pe.bo.toFixed(4)}`);
ok('pile 0.20 m from two edges (x = 1.80, y = 5.5, cap edges at 2.0 and 5.8): corner pile, α_s = 20, two sides', pc.loc === 'corner' && pc.sec.alphaS === 20 && pc.sec.sides.length === 2, `${pc.loc} ${pc.bo.toFixed(4)}`);
ok('an edge or corner pile has less perimeter, so a smaller φV_c than the interior pile', pe.phiVc < interior.phiVc && pc.phiVc < pe.phiVc, `${pe.phiVc.toFixed(1)} ${pc.phiVc.toFixed(1)}`);
// demand and UC
ok('V_u = |F|; UC = V_u / φV_c = 119.5 / 797.2 = 0.150 (interior)', near(interior.Vu, 119.5, 1e-12) && near(interior.uc, 119.5 / interior.phiVc, 1e-12) && near(interior.uc, 0.1499, 5e-4), interior.uc.toFixed(4));
const t = pilePunchingCheck({ piles: [{ i: 1, x: 0, y: 0, F: -90 }], D: 0.3, B: 4, L: 11.6, d: 0.3185, fc: 19 });
ok('a tension pile punches through the same section: V_u = |F| = 90 kN', near(t.items[0].Vu, 90, 1e-12));
ok('governing = the pile with the largest UC (the corner pile with equal reactions)', pilePunchingCheck({ piles: [...piles, { i: 13, x: 1.85, y: 5.55, F: 119.5 }], D: 0.3, B: 4, L: 11.6, d: 0.3185, fc: 19 }).gov.i === 13);
// circular pile: equivalent square of equal area, side D·√π/2
const c = pilePunchingCheck({ piles: [{ i: 1, x: 0, y: 0, F: 100 }], D: 0.4, shape: 'circular', B: 4, L: 11.6, d: 0.3185, fc: 19 });
ok('circular pile D = 0.40 m: equivalent square side 0.3545 m, b_o = 4(0.3545 + 0.3185) = 2.692 m', near(c.c, 0.4 * Math.sqrt(Math.PI) / 2, 1e-12) && near(c.items[0].bo, 4 * (c.c + 0.3185), 1e-9), c.items[0].bo.toFixed(4));
ok('fails when V_u > φV_c', !pilePunchingCheck({ piles: [{ i: 1, x: 0, y: 0, F: 900 }], D: 0.3, B: 4, L: 11.6, d: 0.3185, fc: 19 }).overallPass);
ok('a pile outside the cap or invalid input is rejected', !pilePunchingCheck({ piles: [{ i: 1, x: 3, y: 0, F: 100 }], D: 0.3, B: 4, L: 11.6, d: 0.3185, fc: 19 }).valid && !pilePunchingCheck({ piles: [], D: 0.3, B: 4, L: 11.6, d: 0.3185, fc: 19 }).valid && !pilePunchingCheck({ piles, D: 0.3, B: 4, L: 11.6, d: 0, fc: 19 }).valid);
console.log(`\nPASS ${pass}  FAIL ${fail}`); process.exit(fail ? 1 : 0);
