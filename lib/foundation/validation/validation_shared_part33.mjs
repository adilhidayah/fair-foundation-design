// VALIDATION part33 — several load points on a pile cap WITH a pedestal under each point (5A / 09 per pedestal):
// foundationSizing(pedAreas), splitCombinationLoad(pedFrac), pedestalBaseActions(), foundationGeometryCheck(pedList).
// Hand calculation (cap 6.4 × 3.2 × 1.0 m, Df 1.5 m, Gp 0.3 m -> Dp = 0.5, Hp = 0.8 m; γc 24, γs 18 kN/m³; three pedestals at
// (−2, 0) 0.8 × 0.8, (0, 0.3) 0.9 × 0.7, (2, −0.2) 0.8 × 0.8; shares 1 : 2 : 1):
//   cap 6.4·3.2·1·24 = 491.52 kN;  pedestals gc·A·Hp: 24·0.64·0.8 = 12.288, 24·0.63·0.8 = 12.096, 12.288 -> 36.672 kN;
//   backfill (20.48 − 1.91)·0.5·18 = 167.13 kN;  ΔW = 695.322 kN
//   combination 1.4D: P = 1.4·800 = 1120, Pcap = 1.4·695.322 = 973.451;  point P_j = share·1120 + 1.4·W_ped,j: 297.203, 576.934, 297.203
//   rest of the cap weight at the centre: 973.451 − 1.4·36.672 = 922.110
//   group M_x = Σ(M_x,j − P_j·y_j) = M_x − (576.934·0.3 − 297.203·0.2) = M_x − 113.639
import { foundationSizing, foundationGeometryCheck, splitCombinationLoad, pedestalBaseActions, evaluatePileGroupCombo, pileCapMomentAxis } from '../index.js';
let pass = 0, fail = 0;
function ok(n, c, x = '') { if (c) { pass++; console.log('PASS ' + n + ' ' + x); } else { fail++; console.log('FAIL ' + n + ' ' + x); } }
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const G = 9.80665;
let seed = 33102026; const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);

// ---- 1. foundationSizing with one pedestal per point ----
const pts = [{ x: -2, y: 0, c1: 0.8, c2: 0.8, share: 1 }, { x: 0, y: 0.3, c1: 0.9, c2: 0.7, share: 2 }, { x: 2, y: -0.2, c1: 0.8, c2: 0.8, share: 1 }];
const base = { type: 'pedestal', Bf: 6.4, Lf: 3.2, Hf: 1.0, Df: 1.5, gc: 24 / G, gs: 18 / G, Bp: 0.5, Lp: 0.5, pedGp: 0.3, OffX: 0, OffZ: 0, blockGp: 0 };
const s = foundationSizing({ ...base, pedAreas: pts.map(p => p.c1 * p.c2) });
ok('Σ pedestal area = 1.91 m², Hp = 0.8 m', near(s.Ap, 1.91, 1e-12) && near(s.Hp, 0.8, 1e-12), `${s.Ap} ${s.Hp}`);
ok('ΔW = 491.52 + 36.672 + 167.13 = 695.322 kN (Bp × Lp of the single pedestal not used)', near(s.totalWeightKN, 695.322, 1e-6), s.totalWeightKN.toFixed(4));
const s1 = foundationSizing({ ...base }), s1b = foundationSizing({ ...base, pedAreas: [0.25] }), s1c = foundationSizing({ ...base, pedAreas: null });
ok('without pedAreas (or one area = Bp·Lp) the single-pedestal result is unchanged', s1.totalWeightKN === s1b.totalWeightKN && s1.totalWeightKN === s1c.totalWeightKN && near(s1.Ap, 0.25, 1e-12));

// ---- 2. load split with pedestal weights at the points ----
const dW = s.totalWeightKN, Wped = pts.map(p => 24 * p.c1 * p.c2 * 0.8);
ok('pedestal weights 12.288 / 12.096 / 12.288 kN', near(Wped[0], 12.288, 1e-12) && near(Wped[1], 12.096, 1e-12));
const vec = { P: 1120, Pcap: 1.4 * dW, Hx: -5.6, Hz: 4.2, Mx: 20.44, Mz: 84, pedFrac: Wped.map(w => w / dW) };
const sp = splitCombinationLoad(pts, vec);
ok('point loads: 280 + 1.4·W_ped = 297.203 / 576.934 / 297.203 kN', near(sp.pointLoads[0].P, 297.2032, 5e-4) && near(sp.pointLoads[1].P, 576.9344, 5e-4) && near(sp.pointLoads[2].P, 297.2032, 5e-4), sp.pointLoads.map(q => q.P.toFixed(4)).join(' '));
ok('rest of the cap weight at the centre = 973.451 − 1.4·36.672 = 922.110 kN', near(sp.Pcap, 1.4 * dW - 1.4 * 36.672, 1e-9) && near(sp.Pcap, 922.110, 2e-3), sp.Pcap.toFixed(4));
ok('group P = 1120 + 973.451 (unchanged by where the weight acts)', near(sp.group.P, 1120 + 1.4 * dW, 1e-9));
ok('group M_x = 20.44 − (576.934·0.3 − 297.203·0.2) = −93.199 kN·m, M_z = 84 (the ±2 m points cancel)', near(sp.group.Mx, 20.44 - (576.9344 * 0.3 - 297.2032 * 0.2), 1e-9) && near(sp.group.Mx, -93.199, 1e-3) && near(sp.group.Mz, 84, 1e-9), `${sp.group.Mx.toFixed(4)} ${sp.group.Mz.toFixed(4)}`);
const noPed = splitCombinationLoad(pts, { ...vec, pedFrac: null });
ok('without pedFrac the split is the previous one (all the weight at the centre)', near(noPed.Pcap, vec.Pcap, 1e-12) && near(noPed.pointLoads[1].P, 560, 1e-12) && noPed.pointLoads[0].Pped === 0);

// ---- 3. equilibrium on random layouts, with pedestal weights at the points ----
const NO_CAP = { Qc: 1e12, Qt: 1e12, Ql: 1e12 };
let worstG = 0, worstS = 0, n = 0;
for (let k = 0; k < 400; k++) {
  const nx = 2 + Math.floor(rnd() * 3), ny = 2 + Math.floor(rnd() * 4), sx = 1 + rnd(), sy = 1 + rnd();
  const ox = (rnd() - 0.5) * 2, oy = (rnd() - 0.5) * 2; // regular grid, the whole group off the cap centre (the pile model has no product-of-inertia term)
  const piles = []; for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) piles.push({ x: (i - (nx - 1) / 2) * sx + ox, y: (j - (ny - 1) / 2) * sy + oy });
  const np = 1 + Math.floor(rnd() * 4);
  const points = Array.from({ length: np }, () => ({ x: (rnd() - 0.5) * nx * sx * 0.8, y: (rnd() - 0.5) * ny * sy * 0.8, c1: 0.3 + rnd(), c2: 0.3 + rnd(), share: 0.5 + rnd() }));
  const Pcap = 200 + 300 * rnd(), fr = points.map(() => 0.02 + 0.05 * rnd());
  const v = { P: 600 + 1500 * rnd(), Pcap, Hx: 50 * rnd(), Hz: 50 * rnd(), Mx: (rnd() - 0.5) * 400, Mz: (rnd() - 0.5) * 400, pedFrac: fr };
  const { group, pointLoads, Pcap: rest } = splitCombinationLoad(points, v);
  const ev = evaluatePileGroupCombo(piles, group, NO_CAP);
  if (!ev.valid) continue;
  n++;
  const F = ev.pileForces, SF = F.reduce((a, p) => a + p.F, 0), SFx = F.reduce((a, p) => a + p.F * p.x, 0), SFy = F.reduce((a, p) => a + p.F * p.y, 0);
  const SP = pointLoads.reduce((a, q) => a + q.P, 0) + rest;
  const SPx = pointLoads.reduce((a, q) => a + q.P * q.x + q.Mz, 0), SPy = pointLoads.reduce((a, q) => a + q.P * q.y - q.Mx, 0);
  worstG = Math.max(worstG, Math.abs(SF - SP), Math.abs(SFx - SPx), Math.abs(SFy - SPy));
  const capW = { P: rest, Bx: 12, Ly: 12 };
  for (const axis of ['x', 'y']) worstS = Math.max(worstS, Math.abs(pileCapMomentAxis(F, axis, 0, -1e3, pointLoads, capW).plus));
}
ok(`${n} random layouts with pedestal weights: Σ reactions = Σ point loads (incl. pedestals) + rest of the cap weight, both moments`, n > 300 && worstG < 1e-6, worstG.toExponential(2));
ok('section equilibrium beyond the whole cap (reactions, point loads, couples, distributed cap weight) = 0', worstS < 1e-5, worstS.toExponential(2));

// ---- 4. actions at the base of every pedestal ----
const act = pedestalBaseActions(pts, { P: 1120, Fx: -5.6, Fz: 4.2, Mx: 28, Mz: 84 }, 1.4, 0.8, Wped);
ok('pedestal 2 (share 0.5): P = 560 + 1.4·12.096 = 576.934 kN, top load 560', near(act[1].P, 576.9344, 1e-9) && near(act[1].Ptop, 560, 1e-12) && near(act[1].f, 0.5, 1e-12));
ok('pedestal 2: M_z = 0.5·(84 + (−5.6)·0.8) = 39.76, M_x = 0.5·(28 − 4.2·0.8) = 12.32 kN·m', near(act[1].Mz, 39.76, 1e-9) && near(act[1].Mx, 12.32, 1e-9), `${act[1].Mz} ${act[1].Mx}`);
ok('Σ of the shares: Σ M_z (base) = 84 − 5.6·0.8 = 79.52 and Σ P (top) = 1120', near(act.reduce((a, q) => a + q.Mz, 0), 79.52, 1e-9) && near(act.reduce((a, q) => a + q.Ptop, 0), 1120, 1e-9));
ok('pedestals 1 and 3 (share 0.25): top P = 280, M_z(top) 21', near(act[0].Ptop, 280, 1e-12) && near(act[2].MzTop, 21, 1e-12));
const a0 = pedestalBaseActions(pts, { P: 100, Mx: 5, Mz: 7 }, 0, 0, null);
ok('no weights / zero factor: P = share·P, no lever arm without H', near(a0[1].P, 50, 1e-12) && near(a0[1].Mz, 3.5, 1e-12));

// ---- 5. geometry of the pedestals on the cap ----
const gOk = foundationGeometryCheck({ Bf: 6.4, Lf: 3.2, Hf: 1.0, Df: 1.5, hasPed: true, pedList: pts, isPile: true, hEmbed: 0.1 });
ok('three pedestals inside the cap: overallPass', gOk.overallPass, gOk.issues.map(i => i.text).join('|'));
const gOut = foundationGeometryCheck({ Bf: 6.4, Lf: 3.2, Hf: 1.0, Df: 1.5, hasPed: true, pedList: [...pts.slice(0, 2), { x: 2.9, y: 0, c1: 0.8, c2: 0.8 }], isPile: true, hEmbed: 0.1 });
ok('a pedestal beyond the cap edge in x (|2.9| + 0.4 = 3.3 > 3.2) is reported with its number', !gOut.overallPass && gOut.issues.some(i => i.code === 'pedX' && /Pedestal 3/.test(i.text)), gOut.issues.map(i => i.text).join('|'));
const gOv = foundationGeometryCheck({ Bf: 6.4, Lf: 3.2, Hf: 1.0, Df: 1.5, hasPed: true, pedList: [pts[0], { x: -1.5, y: 0, c1: 0.8, c2: 0.8 }], isPile: true, hEmbed: 0.1 });
ok('overlapping pedestals are reported', gOv.issues.some(i => i.code === 'pedOverlap'));
const gOld = foundationGeometryCheck({ Bf: 3, Lf: 3, Hf: 1, Df: 1.5, hasPed: true, Bp: 0.6, Lp: 0.6, OffX: 1.0, OffZ: 0 });
ok('without pedList the single pedestal check is the previous one', gOld.overallPass);
console.log(`\nPASS ${pass}  FAIL ${fail}`); process.exit(fail ? 1 : 0);
