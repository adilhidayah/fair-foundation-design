// VALIDATION part27 — several load points on one pile cap (lib/foundation/shared/loadPoints.js and its use in pileCapMomentAxis,
// oneWayPileShear, punchingPileShear). Statics checks: the equivalent group load, global equilibrium of pile reactions + point
// loads (+ cap weight) on 400 random layouts, section equilibrium at a section beyond everything, hand-worked sections of a
// 12-pile cap with three vessels (Filter Coalescer layout), and that ONE point reproduces the single-pedestal results.
import { splitCombinationLoad, pointLoadsBeyond, evaluatePileGroupCombo, pileCapMomentAxis, oneWayPileShear, punchingPileShear } from '../index.js';
let pass = 0, fail = 0;
function ok(n, c, x = '') { if (c) { pass++; console.log('PASS ' + n + ' ' + x); } else { fail++; console.log('FAIL ' + n + ' ' + x); } }
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const NO_CAP = { Qc: 1e12, Qt: 1e12, Ql: 1e12 };
let seed = 27102026; const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);

// ---- 1. equivalent group load -----------------------------------------------------------------------------------------
const pts3 = [{ x: 0, y: -3.5, c1: 1.267, c2: 1.267, share: 1 }, { x: 0, y: 0, c1: 1.267, c2: 1.267, share: 1 }, { x: 0, y: 3.5, c1: 1.267, c2: 1.267, share: 1 }];
const sp = splitCombinationLoad(pts3, { P: 900, Pcap: 450, Hx: 30, Hz: 9, Mx: 60, Mz: -120 });
ok('three equal points: P_j = 300 each, shares 1/3', sp.pointLoads.every(q => near(q.P, 300, 1e-12) && near(q.f, 1 / 3, 1e-12)));
ok('group load: P = 900 + 450 cap weight, H unchanged', near(sp.group.P, 1350, 1e-12) && sp.group.Hx === 30 && sp.group.Hz === 9);
ok('symmetric points: group M_z = Σ M_z,j = −120 and M_x = Σ M_x,j − Σ P_j·y_j = 60 (the P_j·y_j cancel)', near(sp.group.Mz, -120, 1e-9) && near(sp.group.Mx, 60, 1e-9), `${sp.group.Mz} ${sp.group.Mx}`);
const ecc = splitCombinationLoad([{ x: 1, y: 2, share: 3 }, { x: -1, y: 0, share: 1 }], { P: 400, Mx: 0, Mz: 0 });
ok('unequal shares 3:1, eccentric points: M_z = 300·1 + 100·(−1) = 200, M_x = −(300·2 + 0) = −600', near(ecc.group.Mz, 200, 1e-9) && near(ecc.group.Mx, -600, 1e-9), `${ecc.group.Mz} ${ecc.group.Mx}`);

// ---- 2. global equilibrium on random layouts ---------------------------------------------------------------------------
let worstG = 0, worstS = 0, n = 0;
for (let k = 0; k < 400; k++) {
  const nx = 2 + Math.floor(rnd() * 3), ny = 2 + Math.floor(rnd() * 4), sx = 1 + rnd(), sy = 1 + rnd();
  const ox = (rnd() - 0.5) * 2, oy = (rnd() - 0.5) * 2; // pile group off the cap centre (non-zero centroid)
  const piles = []; for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) piles.push({ x: (i - (nx - 1) / 2) * sx + ox, y: (j - (ny - 1) / 2) * sy + oy });
  const np = 1 + Math.floor(rnd() * 4);
  const points = Array.from({ length: np }, () => ({ x: (rnd() - 0.5) * nx * sx * 0.8, y: (rnd() - 0.5) * ny * sy * 0.8, c1: 0.3 + rnd(), c2: 0.3 + rnd(), share: 0.5 + rnd() }));
  const vec = { P: 600 + 1500 * rnd(), Pcap: 200 + 300 * rnd(), Hx: 50 * rnd(), Hz: 50 * rnd(), Mx: (rnd() - 0.5) * 400, Mz: (rnd() - 0.5) * 400 };
  const { group, pointLoads } = splitCombinationLoad(points, vec);
  const ev = evaluatePileGroupCombo(piles, group, NO_CAP);
  if (!ev.valid) continue;
  n++;
  const F = ev.pileForces, SF = F.reduce((s, p) => s + p.F, 0), SFx = F.reduce((s, p) => s + p.F * p.x, 0), SFy = F.reduce((s, p) => s + p.F * p.y, 0);
  const SP = pointLoads.reduce((s, q) => s + q.P, 0) + vec.Pcap;
  const SPx = pointLoads.reduce((s, q) => s + q.P * q.x + q.Mz, 0), SPy = pointLoads.reduce((s, q) => s + q.P * q.y - q.Mx, 0);
  worstG = Math.max(worstG, Math.abs(SF - SP), Math.abs(SFx - SPx), Math.abs(SFy - SPy));
  // section beyond everything: the moment of all reactions and all loads (cap weight as a point at the centre) about it must vanish
  const capW = { P: vec.Pcap, Bx: 12, Ly: 12 };                    // cap weight spread uniformly over the cap centred at the origin
  for (const axis of ['x', 'y']) {
    const m = pileCapMomentAxis(F, axis, 0, -1e3, pointLoads, capW);   // sign +1 side, section 1000 m before the cap: everything is beyond
    worstS = Math.max(worstS, Math.abs(m.plus));
  }
}
ok(`${n} random layouts: Σ pile reactions = Σ point loads + cap weight, and both moment equilibria (force, x, y)`, n > 300 && worstG < 1e-6, worstG.toExponential(2));
ok('section equilibrium: net moment of reactions + point loads + distributed cap weight beyond a section before the whole cap = 0 (x and y, couples included)', worstS < 1e-5, worstS.toExponential(2));

// ---- 3. hand-worked sections: 12 piles (x = ±1.45, 0 ; y = ±5.25, ±1.75), three vessels c = 1.267 m at y = −3.5, 0, 3.5, P_j = 300 kN ----
const piles = []; for (const x of [1.45, 0, -1.45]) for (const y of [-5.25, -1.75, 1.75, 5.25]) piles.push({ x, y });
const base = splitCombinationLoad(pts3, { P: 900, Pcap: 0 });
const ev = evaluatePileGroupCombo(piles, base.group, NO_CAP), F = ev.pileForces;
ok('uniform reactions: F = 900/12 = 75 kN', F.every(p => near(p.F, 75, 1e-9)));
// section at the +y face of the middle vessel: y = 0.6335. piles beyond: y = 1.75 and 5.25 (6 piles); vessel at y = 3.5 beyond.
const half = 1.267 / 2;
const m = pileCapMomentAxis(F, 'y', 0, half, base.pointLoads);
// M+ = 3·75·[(1.75 − 0.6335) + (5.25 − 0.6335)] − 300·(3.5 − 0.6335) = 225·5.733 − 859.95 = 1289.925 − 859.95 = 429.975 kN·m
ok('flexure at the middle vessel face: M+ = 429.975 kN·m (piles 1289.925 − vessel 859.95); M− mirrors it', near(m.plus, 429.975, 1e-6) && near(m.minus, 429.975, 1e-6), `${m.plus.toFixed(3)} ${m.minus.toFixed(3)}`);
ok('...whereas the single-load-point formula (piles only) would give 1289.925 kN·m', near(pileCapMomentAxis(F, 'y', 0, half).plus, 1289.925, 1e-6));
// outer vessel (y = 3.5): outer face section at y = 4.1335 -> 3 piles at 5.25, no vessel beyond; inner face section at y = 2.8665 ->
// piles at 1.75, −1.75, −5.25 (3 each) minus the middle vessel (arm 2.8665) and the left vessel (arm 6.3665)
const mo = pileCapMomentAxis(F, 'y', 3.5, half, base.pointLoads);
const sI = 3.5 - half, innerPiles = 225 * ((sI - 1.75) + (sI + 1.75) + (sI + 5.25)), innerLoads = 300 * sI + 300 * (sI + 3.5);
ok('outer vessel: outer face M = 3·75·(5.25 − 4.1335) = 251.2 kN·m; inner face M = piles 3127.4 − vessels (2.8665 + 6.3665 m arms) = 346.2 kN·m',
  near(mo.plus, 3 * 75 * (5.25 - (3.5 + half)), 1e-6) && near(mo.minus, innerPiles - innerLoads, 1e-6), `${mo.plus.toFixed(3)} ${mo.minus.toFixed(3)} (${(innerPiles - innerLoads).toFixed(3)})`);
// with the cap weight (464 kN over the 4.0 × 11.6 m cap, reactions F = (900 + 464)/12 = 113.667 kN) netted too: beyond y = 0.6335 the weight is
// 464·(5.8 − 0.6335)/11.6 = 206.67 kN with its centroid (0.6335 + 5.8)/2 = 3.2168 m, i.e. an arm of 2.5833 m
const baseW = splitCombinationLoad(pts3, { P: 900, Pcap: 464 });
const FW = evaluatePileGroupCombo(piles, baseW.group, NO_CAP).pileForces;
const mw = pileCapMomentAxis(FW, 'y', 0, half, baseW.pointLoads, { P: 464, Bx: 4.0, Ly: 11.6 });
const expW = 3 * (1364 / 12) * ((1.75 - half) + (5.25 - half)) - 300 * (3.5 - half) - 464 * (5.8 - half) / 11.6 * ((half + 5.8) / 2 - half);
ok('flexure with the cap weight netted: M+ = 3·113.667·5.733 − 859.95 − 206.67·2.5833 = 561.1 kN·m', near(mw.plus, expW, 1e-6) && near(expW, 561.15, 0.01), `${mw.plus.toFixed(3)} (${expW.toFixed(3)})`);
const ow2 = oneWayPileShear({ pileForces: FW, axis: 'y', center: 0, half, d: 0.31, dp: 0.3, pointLoads: baseW.pointLoads, capWeight: { P: 464, Bx: 4.0, Ly: 11.6 } });
const sPos = half + 0.31;
ok('one-way shear with the cap weight netted: V = 6·113.667 − 300 − 464·(5.8 − 0.9435)/11.6 = 187.4 kN', near(ow2.Vu, 6 * (1364 / 12) - 300 - 464 * (5.8 - sPos) / 11.6, 1e-6), ow2.Vu.toFixed(3));
// one-way shear at d = 0.31 m from the middle vessel's +y face: s = 0.6335 + 0.31 = 0.9435; piles beyond: 6 × 75 = 450; vessel y = 3.5 beyond: 300 -> V = 150
const ow = oneWayPileShear({ pileForces: F, axis: 'y', center: 0, half, d: 0.31, dp: 0.3, pointLoads: base.pointLoads });
ok('one-way shear at d from the middle vessel face: V = 450 − 300 = 150 kN (single-point formula: 450)', near(ow.Vu, 150, 1e-9) && near(oneWayPileShear({ pileForces: F, axis: 'y', center: 0, half, d: 0.31, dp: 0.3 }).Vu, 450, 1e-9), ow.Vu);
// punching of the middle vessel: perimeter (1.267 + 0.31)² around (0, 0): piles inside? hx = hy = 0.7885 -> nearest piles at y = ±1.75: outside -> V = P_col − inside = 300
const pu = punchingPileShear({ pileForces: F, cx: 0, cy: 0, c1: 1.267, c2: 1.267, d: 0.31, dp: 0.3, Pcol: 300 });
ok('punching of the middle vessel: no pile inside the perimeter -> V_u = P_col = 300 kN', near(pu.Vu, 300, 1e-9) && near(pu.inside, 0, 1e-9), pu.Vu);

// ---- 4. one point reproduces the single-pedestal results ---------------------------------------------------------------
const one = [{ x: 0.2, y: -0.3, c1: 1.25, c2: 1.25, share: 1 }];
let maxDiff = 0;
for (let k = 0; k < 50; k++) {
  const vec = { P: 500 + 800 * rnd(), Pcap: 0, Hx: 0, Hz: 0, Mx: (rnd() - 0.5) * 300, Mz: (rnd() - 0.5) * 300 };
  const sp1 = splitCombinationLoad(one, vec);
  const legacy = { P: vec.P, Hx: 0, Hz: 0, Mx: vec.Mx, Mz: vec.Mz, at: { x: 0.2, y: -0.3 } };
  const pl = [{ x: -1.5, y: -2 }, { x: 1.5, y: -2 }, { x: -1.5, y: 2 }, { x: 1.5, y: 2 }, { x: 0, y: 0 }];
  const e1 = evaluatePileGroupCombo(pl, sp1.group, NO_CAP), e2 = evaluatePileGroupCombo(pl, legacy, NO_CAP);
  maxDiff = Math.max(maxDiff, ...e1.pileForces.map((p, i) => Math.abs(p.F - e2.pileForces[i].F)));
  for (const axis of ['x', 'y']) {
    const ref = axis === 'x' ? 0.2 : -0.3;
    const a = pileCapMomentAxis(e1.pileForces, axis, ref, 0.625, sp1.pointLoads), b = pileCapMomentAxis(e2.pileForces, axis, ref, 0.625);
    maxDiff = Math.max(maxDiff, Math.abs(a.plus - b.plus), Math.abs(a.minus - b.minus));
    const s1 = oneWayPileShear({ pileForces: e1.pileForces, axis, center: ref, half: 0.625, d: 0.4, dp: 0.3, pointLoads: sp1.pointLoads }), s2 = oneWayPileShear({ pileForces: e2.pileForces, axis, center: ref, half: 0.625, d: 0.4, dp: 0.3 });
    maxDiff = Math.max(maxDiff, Math.abs(s1.Vu - s2.Vu));
  }
  const p1 = punchingPileShear({ pileForces: e1.pileForces, cx: 0.2, cy: -0.3, c1: 1.25, c2: 1.25, d: 0.4, dp: 0.3, Pcol: vec.P });
  const p2 = punchingPileShear({ pileForces: e2.pileForces, cx: 0.2, cy: -0.3, c1: 1.25, c2: 1.25, d: 0.4, dp: 0.3 });
  maxDiff = Math.max(maxDiff, Math.abs(p1.Vu - p2.Vu));
}
ok('one load point = the single-pedestal model: pile forces, flexure, one-way shear and punching agree (50 random cases, 5 piles)', maxDiff < 1e-8, maxDiff.toExponential(2));
ok('pointLoadsBeyond: a point fully before the section contributes nothing, fully beyond contributes P and P·arm', (() => { const q = [{ x: 0, y: 5, c1: 1, c2: 1, P: 100, Mx: 0, Mz: 0 }]; const a = pointLoadsBeyond(q, 'y', 0, 1, 1), b = pointLoadsBeyond(q, 'y', 0, 1, -1); return near(a.V, 100, 1e-12) && near(a.M, 400, 1e-12) && b.V === 0 && b.M === 0; })());
console.log(`\nPASS ${pass}  FAIL ${fail}`); process.exit(fail ? 1 : 0);
