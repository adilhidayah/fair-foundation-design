// ==========================================================================
// STEEL CONNECTION — material and bolt data (SI)
// Bolts: AISC 360-16 Table J3.2 (nominal stresses), Table J3.3M (hole sizes), Table J3.4M (minimum edge distance).
// Expected-strength factors Ry / Rt: AISC 341-16 Table A3.1.
// ==========================================================================

// nominal stresses, MPa. 'N' = threads included in the shear plane, 'X' = excluded.
export const BOLT_GRADES = {
  'A307': { Fnt: 310, Fnv: { N: 188, X: 188 } },
  'A325': { Fnt: 620, Fnv: { N: 372, X: 469 } },       // ASTM F3125 Grade A325 (Group A)
  'A490': { Fnt: 780, Fnv: { N: 457, X: 579 } },       // ASTM F3125 Grade A490 (Group B)
  '8.8': { Fnt: 620, Fnv: { N: 372, X: 469 } },        // ISO 898-1 8.8 taken as Group A (equivalent assumption, flag in report)
};

// Table J3.3M hole sizes (mm): standard, oversized; Table J3.4M minimum edge distance (mm)
export const BOLT_SIZES = {
  12: { std: 14, ovs: 16, emin: 18 },   // not in Table J3.3M/J3.4M (starts at M16): purlin bolts, values per common practice, flag in report
  16: { std: 18, ovs: 20, emin: 22 },
  20: { std: 22, ovs: 24, emin: 26 },
  22: { std: 24, ovs: 28, emin: 28 },
  24: { std: 27, ovs: 30, emin: 30 },
  27: { std: 30, ovs: 35, emin: 34 },
  30: { std: 33, ovs: 38, emin: 38 },
};

export function bolt(grade, d, threads = 'N', hole = 'std') {
  const g = BOLT_GRADES[grade], sz = BOLT_SIZES[d];
  if (!g) throw new Error('unknown bolt grade ' + grade);
  if (!sz) throw new Error('unknown bolt size M' + d);
  return { name: `M${d} ${grade}-${threads}`, grade, d, Ab: Math.PI * d * d / 4, Fnt: g.Fnt, Fnv: g.Fnv[threads],
    holeD: sz[hole], holeType: hole, emin: sz.emin };
}

// structural steel grades (MPa); Ry/Rt per AISC 341-16 Table A3.1 (rolled shapes / plates)
export const STEEL = {
  'A36': { Fy: 250, Fu: 400, Ry: 1.5, Rt: 1.2, RyPlate: 1.3, RtPlate: 1.2 },
  'A36-245': { Fy: 245, Fu: 400, Ry: 1.5, Rt: 1.2, RyPlate: 1.3, RtPlate: 1.2 },   // design-basis fy 245 MPa projects
  'A572-50': { Fy: 345, Fu: 450, Ry: 1.1, Rt: 1.1, RyPlate: 1.1, RtPlate: 1.2 },
  'A992': { Fy: 345, Fu: 450, Ry: 1.1, Rt: 1.1, RyPlate: 1.1, RtPlate: 1.2 },
  'SS400': { Fy: 245, Fu: 400, Ry: null, Rt: null, RyPlate: null, RtPlate: null },  // JIS: Ry not tabulated in AISC 341 -> user input
};
export function steel(grade, override = {}) {
  const s = STEEL[grade];
  if (!s) throw new Error('unknown steel grade ' + grade);
  return { grade, ...s, ...override };
}

export const WELD = { E70: 480, E60: 415 };
