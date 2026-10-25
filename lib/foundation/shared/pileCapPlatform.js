// ==========================================================================
// PILE CAP UNDER EQUIPMENT AND A PLATFORM — section forces of ONE load combination, for the cap design of the Filter Coalescer type:
// several vessels (base rings) and a platform whose columns stand on the cap at their own positions, on a rigid pile group.
// Pure functions, SI units (m, kN, kN·m), no DOM. Same frame as pileGroup.js (x along B, y along L = the "z" of the UI); FAIR signs:
// Mz > 0 puts more load towards +x, Mx > 0 towards −y.
//
// What it returns (all of them factored, ACI 318M-19 as in Doc 2512-01GT-90-05J-A0014 Rev B, C.6.3 to C.6.4):
//   face      moment at the faces of the equipment footprint, pile reactions beyond the face less the column loads beyond it
//   beamX/Z   moment and shear of the cap as a beam between the pile rows (x) / pile lines (z) — capBeamAnalysis
//   design    design moments: bottom = larger of face and beam sagging, top = hogging of the beam (face hogging when piles pull)
//   shear     one-way shear at d from the faces of the footprint: x from the pile reactions beyond the section, z from the beam along z
// The design over all combinations is the envelope of these per-combination results (the caller loops, as for the pile check).
// ==========================================================================
import { capBeamAnalysis } from './pileCapBeam.js';
import { oneWayPileShear, pileShearFraction } from './pileCapShear.js';
import { pileCapMomentAxis } from './footingCheck.js';

const EPS = 1e-6;
function lines(pileForces, axis) {       // piles on the same coordinate along `axis` = one line; R = sum of their forces
  const m = [];
  pileForces.forEach(p => {
    const c = axis === 'x' ? p.x : p.y;
    const l = m.find(q => Math.abs(q.s - c) < EPS);
    if (l) l.R += p.F; else m.push({ s: c, R: p.F });
  });
  return m.sort((a, b) => a.s - b.s);
}

// cap: { B, L, W (factored cap weight of the combination, kN), dx, dz (effective depths of the x / z bars, m) }
// pileForces: [{ x, y, F }] of the combination, dp: pile width (m)
// vessels: [{ x, y, P, Mx, Mz }] factored load on each base ring (kN, kN·m, FAIR signs), ringD: base ring diameter (m)
// columns: [{ x, y, P, c1, c2 }] factored platform column loads (kN, down +), c1 × c2 = base plate (m)
export function pileCapPlatformCombo({ cap, pileForces, dp, vessels, ringD, columns = [] }) {
  if (!pileForces || pileForces.length < 2) return { valid: false, note: 'Pile forces are missing.' };
  if (!vessels || vessels.length === 0 || !(ringD > 0)) return { valid: false, note: 'At least one vessel with its base ring diameter is needed.' };
  const { B, L, W = 0, dx, dz } = cap;
  const half = ringD / 2;
  const x0 = Math.min(...vessels.map(v => v.x)) - half, x1 = Math.max(...vessels.map(v => v.x)) + half;
  const y0 = Math.min(...vessels.map(v => v.y)) - half, y1 = Math.max(...vessels.map(v => v.y)) + half;
  const xc = (x0 + x1) / 2, yc = (y0 + y1) / 2, hx = (x1 - x0) / 2, hy = (y1 - y0) / 2;
  const pts = [...vessels.map(v => ({ x: v.x, y: v.y, c1: ringD, c2: ringD, P: v.P, Mx: v.Mx || 0, Mz: v.Mz || 0 })),
    ...columns.map(c => ({ x: c.x, y: c.y, c1: c.c1 || 0, c2: c.c2 || 0, P: c.P, Mx: c.Mx || 0, Mz: c.Mz || 0 }))];
  // moment at the faces of the footprint (the vessels lie inside the section, so only the columns beyond it count)
  const fx = pileCapMomentAxis(pileForces, 'x', xc, hx, pts), fy = pileCapMomentAxis(pileForces, 'y', yc, hy, pts);
  // beams: along x between the pile rows (width L), along z between the pile lines (width B)
  const beamX = capBeamAnalysis({ s0: -B / 2, s1: B / 2, weight: W, supports: lines(pileForces, 'x'),
    loads: [...vessels.map(v => ({ s: v.x, P: v.P, len: ringD, M: v.Mz || 0, balance: true })), ...columns.map(c => ({ s: c.x, P: c.P }))] });
  const beamZ = capBeamAnalysis({ s0: -L / 2, s1: L / 2, weight: W, supports: lines(pileForces, 'y'),
    loads: [...vessels.map(v => ({ s: v.y, P: v.P, len: ringD, M: -(v.Mx || 0), balance: true })), ...columns.map(c => ({ s: c.y, P: c.P }))] });
  if (!beamX.valid || !beamZ.valid) return { valid: false, note: beamX.note || beamZ.note };
  const design = {
    xBottom: Math.max(fx.bottom, beamX.Mpos), zBottom: Math.max(fy.bottom, beamZ.Mpos),
    xTop: Math.max(fx.top, beamX.Mneg), zTop: Math.max(fy.top, beamZ.Mneg)
  };
  // one-way shear at d from the faces: x from the reactions beyond the section, z at each base ring from the beam along z
  const sx = oneWayPileShear({ pileForces, axis: 'x', center: xc, half: hx, d: dx, dp, pointLoads: pts });
  let Vz = 0, sVz = null;
  vessels.forEach(v => [v.y - half - dz, v.y + half + dz].forEach(s => { const V = Math.abs(beamZ.shearAt(s)); if (V > Vz) { Vz = V; sVz = s; } }));
  return { valid: true, footprint: { Bp: x1 - x0, Lp: y1 - y0, xc, yc }, face: { x: fx, y: fy }, beamX, beamZ, design,
    shear: { x: { Vu: sx.valid ? sx.Vu : NaN, bw: L }, z: { Vu: Vz, s: sVz, bw: B } }, pileShearFraction };
}
