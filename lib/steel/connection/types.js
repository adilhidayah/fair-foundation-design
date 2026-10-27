// ==========================================================================
// STEEL CONNECTION — standard connection catalogue (SC-xx)
// Each type = standard detail (drawn by E:\KERJA\TOOLS\Drawing\Sambungan with the same id and parameter names) + its checks.
// A project picks a type per member end, fills the parameters (defaults below are starting values, not design decisions),
// and runs check(params, forces, opts). Units: mm, MPa, kN, kN·m.
//   SC-01 single-plate shear tab (beam / strut web to column or beam)
//   SC-02 single-angle brace bolted to a gusset welded to the support
//   SC-03 tension rod (threaded) through a welded tab plate, nut + washer, optional turnbuckle
//   SC-04 beam seated on a column cap plate (bolted bottom flange)
//   SC-05 bolted flange-plate moment connection (flange plates welded to the column flange) + SC-01 web tab
//   SC-06 purlin cleat (plate welded to the rafter top flange, purlin bolted to it)
// ==========================================================================
import { bolt as mkBolt, steel as mkSteel } from './materials.js';
import * as C from './checks.js';

const HOLE_NET = 2;   // AISC 360-16 B4.3b: hole width + 2 mm for net area

function common(p) {
  const b = mkBolt(p.boltGrade, p.boltD, p.threads || 'N', p.holeType || 'std');
  const pl = mkSteel(p.plateGrade || 'A36-245');
  return { b, pl, dh: b.holeD, dn: b.holeD + HOLE_NET, method: p.method || 'ASD', FEXX: p.FEXX || 480 };
}

// ------------------------------------------------------------------ SC-01
export const SC01 = {
  id: 'SC-01', title: 'SINGLE-PLATE SHEAR TAB',
  desc: 'Beam / strut web bolted to a single plate fillet-welded (both sides) to the supporting column or beam.',
  params: { boltGrade: 'A325', boltD: 16, threads: 'N', n: 2, s: 60, lev: 35, leh: 35, a: 60, tp: 8, hp: null, w: 6,
    plateGrade: 'A36-245', web: { tw: 6, Fy: 245, Fu: 400, leh: 35 } },
  check(p, f) {
    const { b, pl, dh, dn, method, FEXX } = common(p);
    const n = p.n, hp = p.hp || 2 * p.lev + (n - 1) * p.s, V = Math.abs(f.V || 0), T = Math.abs(f.T || 0);
    const out = [];
    // bolt group, single vertical line, eccentricity a (elastic method)
    const ys = Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * p.s), Ip = ys.reduce((s, y) => s + y * y, 0);
    const M = V * p.a, ymax = Math.max(...ys.map(Math.abs));
    const Rb = Math.hypot(T / n + (Ip > 0 ? M * ymax / Ip : 0), V / n);
    out.push(C.boltShear({ V: Rb, n: 1, bolt: b, method }));
    out[out.length - 1].name += ' - most loaded bolt (elastic, e = a)';
    const lc = Math.min(p.lev - dh / 2, p.s - dh, p.leh - dh / 2);
    const brg = (t, Fu, part, lce) => ({ name: `Bolt bearing / tearout on ${part} (t = ${t}, lc = ${lce.toFixed(1)})`, clause: 'AISC 360-16 J3.10(a)',
      demand: Rb, capacity: C.allowable(Math.min(1.2 * lce * t * Fu, 2.4 * b.d * t * Fu) / 1000, 'bolt', method), unit: 'kN', note: 'most loaded bolt, shortest lc' });
    out.push(brg(p.tp, pl.Fu, 'plate', lc));
    out.push(brg(p.web.tw, p.web.Fu, 'supported web', Math.min(p.web.leh - dh / 2, p.s - dh)));
    out.forEach(c => { if (c.uc == null) { c.uc = c.demand / c.capacity; c.pass = c.uc <= 1; } });
    // plate
    out.push(C.shearYield({ V, Agv: hp * p.tp, Fy: pl.Fy, method, part: 'plate' }));
    out.push(C.shearRupture({ V, Anv: (hp - n * dn) * p.tp, Fu: pl.Fu, method, part: 'plate' }));
    out.push(C.blockShear({ P: V, Agv: (hp - p.lev) * p.tp, Anv: (hp - p.lev - (n - 0.5) * dn) * p.tp, Ant: (p.leh - 0.5 * dn) * p.tp,
      Fy: pl.Fy, Fu: pl.Fu, Ubs: 1.0, method, part: 'plate' }));
    out.push(C.plateFlexure({ M: V * p.a / 1000, b: p.tp, t: hp, Fy: pl.Fy, method, part: 'plate at the weld line (M = V·a)' }));
    if (T > 0) {
      out.push(C.tensionYield({ T, Ag: hp * p.tp, Fy: pl.Fy, method, part: 'plate' }));
      out.push(C.tensionRupture({ T, An: (hp - n * dn) * p.tp, Fu: pl.Fu, method, part: 'plate' }));
    }
    // weld, two fillets of length hp, resultant of V and T
    out.push(C.filletWeld({ R: Math.hypot(V, T), w: p.w, L: 2 * hp, FEXX, method, part: 'plate to support (2 sides)' }));
    out.push(C.filletLimits({ w: p.w, tThin: p.tp }));
    // conventional configuration ductility: tp <= d/2 + 2 mm, w >= 5/8 tp (AISC Manual Part 10)
    out.push({ name: `Plate thickness for ductility (tp <= d/2 + 2 = ${b.d / 2 + 2})`, clause: 'AISC Manual Part 10 (conventional shear tab)',
      demand: p.tp, capacity: b.d / 2 + 2, uc: p.tp / (b.d / 2 + 2), unit: 'mm', note: '', pass: p.tp <= b.d / 2 + 2 });
    out.push({ name: `Weld size for plate yielding first (w >= 5/8 tp = ${(0.625 * p.tp).toFixed(1)})`, clause: 'AISC Manual Part 10',
      demand: 0.625 * p.tp, capacity: p.w, uc: 0.625 * p.tp / p.w, unit: 'mm', note: '', pass: p.w >= 0.625 * p.tp });
    out.push(...C.detailing({ bolt: b, holeD: dh, le: Math.min(p.lev, p.leh, p.web.leh), s: n > 1 ? p.s : null }));
    if (p.web.T) out.push({ name: `Plate fits the flat web of the supported member (hp ${hp} <= T ${p.web.T})`, clause: 'detailing (T = d - 2k)',
      demand: hp, capacity: p.web.T, uc: hp / p.web.T, unit: 'mm', note: 'web.T = clear flat web depth of the supported member', pass: hp <= p.web.T });
    return { ...C.summarize(out), geometry: { hp } };
  },
};

// ------------------------------------------------------------------ SC-02
// angle x̄ (distance from the back of the connected leg to the centroid) for an equal angle b × b × t
const xbarL = (b, t) => (b * b + b * t - t * t) / (2 * (2 * b - t));

export const SC02 = {
  id: 'SC-02', title: 'SINGLE-ANGLE BRACE TO GUSSET',
  desc: 'Single angle bolted through one leg (one bolt line) to a gusset plate; gusset fillet-welded to the column / beam / base plate.',
  params: { boltGrade: 'A325', boltD: 16, threads: 'N', n: 3, s: 60, le: 35, leg: 35, g: null, tg: 10, plateGrade: 'A36-245',
    Lbuck: 150, K: 0.65, Lgw: 300, w: 6, weldFactor: 1.25,
    angle: { b: 100, t: 7, Ag: 1362, Fy: 245, Fu: 400 } },
  check(p, f) {
    const { b, pl, dh, dn, method, FEXX } = common(p);
    const A = p.angle, n = p.n, g = p.g || Math.round(A.b * 0.55);
    const T = Math.abs(f.T || 0), Cc = Math.abs(f.C || 0), P = Math.max(T, Cc);
    const out = [];
    out.push(C.boltShear({ V: P, n, bolt: b, method }));
    out.push(C.boltBearing({ V: P, n, bolt: b, t: A.t, Fu: A.Fu, le: p.le, s: p.s, holeD: dh, method, part: 'angle' }));
    out.push(C.boltBearing({ V: P, n, bolt: b, t: p.tg, Fu: pl.Fu, le: p.leg, s: p.s, holeD: dh, method, part: 'gusset' }));
    // angle tension
    const l = (n - 1) * p.s, xb = xbarL(A.b, A.t);
    const U = Math.max(n > 1 ? 1 - xb / l : 0, n >= 4 ? 0.80 : n === 3 ? 0.60 : 0);
    const An = A.Ag - dn * A.t;
    if (T > 0) {
      out.push(C.tensionYield({ T, Ag: A.Ag, Fy: A.Fy, method, part: 'angle' }));
      out.push(C.tensionRupture({ T, An, Fu: A.Fu, U, method, part: `angle (U = ${U.toFixed(3)}, Table D3.1 case 2/8)` }));
      const Lv = p.le + (n - 1) * p.s;
      out.push(C.blockShear({ P: T, Agv: Lv * A.t, Anv: (Lv - (n - 0.5) * dn) * A.t, Ant: (A.b - g - 0.5 * dn) * A.t,
        Fy: A.Fy, Fu: A.Fu, method, part: 'angle (toe side)' }));
    }
    // gusset: Whitmore section, single bolt line
    const bw = C.whitmoreWidth({ Lconn: l, g: 0 });
    if (T > 0) out.push(C.tensionYield({ T, Ag: bw * p.tg, Fy: pl.Fy, method, part: `gusset Whitmore (bw = ${bw.toFixed(0)})` }));
    if (Cc > 0) out.push(C.compressionPlate({ P: Cc, b: bw, t: p.tg, L: p.Lbuck, K: p.K, Fy: pl.Fy, method, part: `gusset Whitmore (K = ${p.K})` }));
    // gusset to support weld, two fillets Lgw, demand × weld ductility factor (AISC Design Guide 29, 1.25)
    out.push(C.filletWeld({ R: P * (p.weldFactor || 1), w: p.w, L: 2 * p.Lgw, FEXX, method, part: `gusset to support (2 sides, P × ${p.weldFactor || 1})` }));
    out.push(C.filletLimits({ w: p.w, tThin: p.tg }));
    out.push(...C.detailing({ bolt: b, holeD: dh, le: Math.min(p.le, p.leg), s: n > 1 ? p.s : null, part: 'angle / gusset' }));
    out.push({ name: `Bolt gauge on the angle leg (g = ${g}, toe distance ${A.b - g} >= ${b.emin})`, clause: 'AISC 360-16 Table J3.4M',
      demand: b.emin, capacity: A.b - g, uc: b.emin / (A.b - g), unit: 'mm', note: '', pass: A.b - g >= b.emin });
    return { ...C.summarize(out), geometry: { g, bw, U } };
  },
};

// ------------------------------------------------------------------ SC-03
export const SC03 = {
  id: 'SC-03', title: 'TENSION ROD TO TAB PLATE',
  desc: 'Threaded round rod passing through a hole in a tab plate welded to the member, nut + washer on the far side; turnbuckle in the rod.',
  params: { rodD: 16, rodGrade: 'A36-245', tp: 10, bt: 70, et: 40, Lt: 80, w: 6, plateGrade: 'A36-245', turnbuckleSWL: null },
  check(p, f) {
    const rod = mkSteel(p.rodGrade), pl = mkSteel(p.plateGrade), method = p.method || 'ASD', FEXX = p.FEXX || 480;
    const T = Math.abs(f.T || 0), d = p.rodD, Ab = Math.PI * d * d / 4, dh = d + 2;
    const out = [];
    out.push(C.tensionYield({ T, Ag: Ab, Fy: rod.Fy, method, part: `rod D${d} (gross)` }));
    out.push({ ...C.tensionRupture({ T, An: Ab, Fu: 0.75 * rod.Fu, method, part: `rod D${d} threaded (Fnt = 0.75Fu)` }),
      clause: 'AISC 360-16 J3.6, Table J3.2 (threaded parts)' });
    // tab plate: net section across the hole, bearing / tearout of the rod on the tab
    out.push(C.tensionYield({ T, Ag: p.bt * p.tp, Fy: pl.Fy, method, part: 'tab plate' }));
    out.push(C.tensionRupture({ T, An: (p.bt - dh - HOLE_NET) * p.tp, Fu: pl.Fu, method, part: 'tab plate (net)' }));
    const lc = p.et - dh / 2;
    const Rn = Math.min(1.2 * lc * p.tp * pl.Fu, 2.4 * d * p.tp * pl.Fu) / 1000;
    out.push({ name: `Rod bearing / tearout on tab (lc = ${lc.toFixed(1)})`, clause: 'AISC 360-16 J3.10(a)', demand: T,
      capacity: C.allowable(Rn, 'bolt', method), unit: 'kN', note: '' });
    out[out.length - 1].uc = T / out[out.length - 1].capacity; out[out.length - 1].pass = out[out.length - 1].uc <= 1;
    out.push(C.filletWeld({ R: T, w: p.w, L: 2 * p.Lt, FEXX, method, part: 'tab to member (2 sides)' }));
    out.push(C.filletLimits({ w: p.w, tThin: p.tp }));
    if (p.turnbuckleSWL != null) out.push({ name: 'Turnbuckle safe working load (supplier)', clause: 'supplier data', demand: T,
      capacity: p.turnbuckleSWL, uc: T / p.turnbuckleSWL, unit: 'kN', note: '', pass: T <= p.turnbuckleSWL });
    else out.push({ name: 'Turnbuckle capacity not given', clause: 'supplier data', demand: T, capacity: NaN, uc: 0, unit: 'kN',
      note: 'select turnbuckle with SWL >= demand (supplier catalogue)', pass: true, info: true });
    return C.summarize(out);
  },
};

// ------------------------------------------------------------------ SC-04
export const SC04 = {
  id: 'SC-04', title: 'BEAM ON COLUMN CAP PLATE',
  desc: 'Beam (rafter) seated on a cap plate fillet-welded all around the column top; beam bottom flange bolted to the cap plate (4 bolts).',
  params: { boltGrade: 'A325', boltD: 16, threads: 'N', n: 4, gx: 70, gz: 100, tc: 12, Bc: 200, Lc: 250, w: 6, plateGrade: 'A36-245',
    column: { d: 175, bf: 175, tw: 7.5, tf: 11 }, beam: { d: 250, bf: 125, tw: 6, tf: 9, k: 22, Fy: 245, Fu: 400 } },
  check(p, f) {
    const { b, pl, dh, method, FEXX } = common(p);
    const P = Math.abs(f.P || 0), T = Math.abs(f.T || 0), V = Math.abs(f.V || 0);
    const out = [];
    out.push(C.boltShear({ V, n: p.n, bolt: b, method }));
    if (T > 0) out.push(C.boltCombined({ T, V, n: p.n, bolt: b, method }));
    out.push(C.boltBearing({ V: V / p.n, n: 1, bolt: b, t: Math.min(p.tc, p.beam.tf), Fu: Math.min(pl.Fu, p.beam.Fu),
      le: (p.beam.bf - p.gx) / 2, s: null, holeD: dh, method, part: 'beam flange / cap plate' }));
    // cap plate bending under uplift: bolts outside the column flange face (lever arm from bolt line to the flange face)
    const lever = Math.max(0, p.gz / 2 - p.column.d / 2 + p.column.tf / 2);
    if (T > 0 && lever > 0) out.push(C.plateFlexure({ M: T / 2 * lever / 1000, b: p.Bc, t: p.tc, Fy: pl.Fy, method, part: 'cap plate (uplift, cantilever from flange)' }));
    // beam web at the bearing (lb = column depth, interior)
    if (P > 0) {
      out.push(C.webLocalYielding({ F: P, tw: p.beam.tw, k: p.beam.k, lb: p.column.d, Fyw: p.beam.Fy, method, part: 'beam over the column' }));
      out.push(C.webCrippling({ F: P, tw: p.beam.tw, tf: p.beam.tf, d: p.beam.d, lb: p.column.d, Fyw: p.beam.Fy, method, part: 'beam over the column' }));
    }
    // column-to-cap-plate weld all around the H outline (flanges both faces + web both faces)
    const Lw = 2 * (2 * p.column.bf - p.column.tw) + 2 * (p.column.d - 2 * p.column.tf);
    out.push(C.filletWeld({ R: Math.hypot(T, V), w: p.w, L: Lw, FEXX, method, part: 'column to cap plate (all around)' }));
    out.push(C.filletLimits({ w: p.w, tThin: Math.min(p.tc, p.column.tf) }));
    out.push(...C.detailing({ bolt: b, holeD: dh, le: Math.min((p.Bc - p.gx) / 2, (p.Lc - p.gz) / 2, (p.beam.bf - p.gx) / 2), s: p.gx, part: 'cap plate / beam flange' }));
    return C.summarize(out);
  },
};

// ------------------------------------------------------------------ SC-05
export const SC05 = {
  id: 'SC-05', title: 'BOLTED FLANGE-PLATE MOMENT CONNECTION',
  desc: 'Top and bottom flange plates fillet-welded to the column flange and bolted to the beam flanges (2 bolt lines); web on SC-01 shear tab.',
  params: { boltGrade: 'A325', boltD: 16, threads: 'N', nRow: 3, s: 60, le: 35, gf: 70, tfp: 12, bfp: 125, setback: 15, w: 8, plateGrade: 'A36-245',
    beam: { d: 250, bf: 125, tw: 6, tf: 9, Fy: 245, Fu: 400 }, column: { d: 175, bf: 175, tw: 7.5, tf: 11, k: 24, Fy: 245 }, web: null,
    cekKolom: true },   // false = connection only (variant tables); column J10.1-J10.3 / J10.6 then checked per project
  check(p, f) {
    const { b, pl, dh, dn, method, FEXX } = common(p);
    const M = Math.abs(f.M || 0), Pa = Math.abs(f.P || 0), V = Math.abs(f.V || 0);
    const Ff = M * 1000 / (p.beam.d + p.tfp) + Pa / 2;                    // flange force, kN
    const nb = 2 * p.nRow, out = [];
    out.push(C.boltShear({ V: Ff, n: nb, bolt: b, method }));
    out.push(C.boltBearing({ V: Ff, n: p.nRow, bolt: b, t: p.beam.tf, Fu: p.beam.Fu, le: p.le, s: p.s, holeD: dh, method, part: 'beam flange (per line)' }));
    out[out.length - 1].demand = Ff / 2; out[out.length - 1].uc = Ff / 2 / out[out.length - 1].capacity; out[out.length - 1].pass = out[out.length - 1].uc <= 1;
    out.push(C.boltBearing({ V: Ff / 2, n: p.nRow, bolt: b, t: p.tfp, Fu: pl.Fu, le: p.le, s: p.s, holeD: dh, method, part: 'flange plate (per line)' }));
    out.push(C.tensionYield({ T: Ff, Ag: p.bfp * p.tfp, Fy: pl.Fy, method, part: 'flange plate' }));
    out.push(C.tensionRupture({ T: Ff, An: (p.bfp - 2 * dn) * p.tfp, Ag: p.bfp * p.tfp, cap085: true, Fu: pl.Fu, method, part: 'flange plate' }));
    out.push(C.compressionPlate({ P: Ff, b: p.bfp, t: p.tfp, L: p.setback + p.le, K: 0.65, Fy: pl.Fy, method, part: 'flange plate (setback + le)' }));
    const Lv = p.le + (p.nRow - 1) * p.s;
    // block shear of the plate: outer blocks (two shear planes along the bolt lines to the plate edges)
    out.push(C.blockShear({ P: Ff, Agv: 2 * Lv * p.tfp, Anv: 2 * (Lv - (p.nRow - 0.5) * dn) * p.tfp, Ant: (p.bfp - p.gf - dn) * p.tfp,
      Fy: pl.Fy, Fu: pl.Fu, method, part: 'flange plate (outer)' }));
    out.push(C.blockShear({ P: Ff, Agv: 2 * Lv * p.beam.tf, Anv: 2 * (Lv - (p.nRow - 0.5) * dn) * p.beam.tf, Ant: (p.gf - dn) * p.beam.tf,
      Fy: p.beam.Fy, Fu: p.beam.Fu, method, part: 'beam flange (inner)' }));
    out.push(C.filletWeld({ R: Ff, w: p.w, L: 2 * p.bfp, FEXX, method, part: 'flange plate to column (2 sides)' }));
    out.push(C.filletLimits({ w: p.w, tThin: Math.min(p.tfp, p.column.tf) }));
    // column under the flange forces (skipped for the variant tables: depends on the project column / stiffeners)
    if (p.cekKolom !== false) {
    out.push(C.flangeLocalBending({ F: Ff, tf: p.column.tf, Fyf: p.column.Fy, method }));
    out.push(C.webLocalYielding({ F: Ff, tw: p.column.tw, k: p.column.k, lb: p.tfp + 2 * p.w, Fyw: p.column.Fy, method, part: 'column' }));
    out.push(C.webCrippling({ F: Ff, tw: p.column.tw, tf: p.column.tf, d: p.column.d, lb: p.tfp + 2 * p.w, Fyw: p.column.Fy, method, part: 'column' }));
    // panel zone (J10.6, Pr <= 0.4Pc): Rn = 0.60·Fy·dc·tw
    const Rv = 0.6 * p.column.Fy * p.column.d * p.column.tw / 1000;
    const Fopp = f.Mopp ? Math.abs(f.Mopp) * 1000 / (p.beam.d + p.tfp) : 0;     // beam on the opposite flange, moments adding
    out.push({ name: `Column panel-zone web shear${Fopp ? ' (beams both sides)' : ''}`, clause: 'AISC 360-16 J10.6(a) (Pr <= 0.4Pc)', demand: Ff + Fopp - (f.Vcol || 0),
      capacity: C.allowable(Rv, 'webYield', method), unit: 'kN', note: 'Ω = 1.67 / φ = 0.90 per J10.6' });
    const pz = out[out.length - 1];
    pz.capacity = method === 'LRFD' ? 0.9 * Rv : Rv / 1.67; pz.uc = pz.demand / pz.capacity; pz.pass = pz.uc <= 1;
    }
    out.push(...C.detailing({ bolt: b, holeD: dh, le: Math.min(p.le, (p.bfp - p.gf) / 2, (p.beam.bf - p.gf) / 2), s: p.s, part: 'flange plate / beam flange' }));
    const res = C.summarize(out);
    if (p.web) { const wv = SC01.check({ ...p.web, method }, { V }); res.checks.push(...wv.checks.map(c => ({ ...c, name: 'web tab: ' + c.name }))); Object.assign(res, C.summarize(res.checks)); }
    return { ...res, geometry: { Ff } };
  },
};

// ------------------------------------------------------------------ SC-06
export const SC06 = {
  id: 'SC-06', title: 'PURLIN CLEAT',
  desc: 'Cold-formed C / Z purlin web bolted to a plate cleat fillet-welded to the rafter top flange. V = reaction in the plane '
    + 'of the cleat (gravity / uplift normal to the roof), P = purlin axial, H = load along the roof slope (out of the cleat plane).',
  params: { boltGrade: 'A325', boltD: 12, threads: 'N', n: 2, s: 60, lev: 30, tp: 8, hp: 120, bp: 100, w: 5, plateGrade: 'A36-245',
    purlin: { t: 3.2, Fu: 400 } },
  check(p, f) {
    const { b, pl, dh, method, FEXX } = common(p);
    const V = Math.abs(f.V || 0), P = Math.abs(f.P || 0), H = Math.abs(f.H || 0), out = [];
    const Rs = Math.hypot(V, P);                                   // in-plane: bolts in shear
    const e = p.lev + (p.n - 1) * p.s / 2;                         // bolt-group height above the flange
    out.push(C.boltShear({ V: Rs, n: p.n, bolt: b, method }));
    if (H > 0) out.push(C.boltCombined({ T: H, V: Rs, n: p.n, bolt: b, method }));   // H taken as bolt tension, prying neglected
    const brg = C.boltBearing({ V: Rs, n: p.n, bolt: b, t: p.purlin.t, Fu: p.purlin.Fu, le: p.lev, s: p.s, holeD: dh, method, part: 'purlin web' });
    brg.note += '; cold-formed bearing per AISI S100 E3.3 to be confirmed (AISC J3.10 shown as indication)';
    out.push(brg);
    out.push(C.shearYield({ V, Agv: p.bp * p.tp, Fy: pl.Fy, method, part: 'cleat (in plane)' }));
    if (H > 0) out.push(C.plateFlexure({ M: H * e / 1000, b: p.bp, t: p.tp, Fy: pl.Fy, method, part: `cleat out of plane (H × ${e.toFixed(0)})` }));
    out.push(C.filletWeld({ R: Math.hypot(V, P, H), w: p.w, L: 2 * p.bp, FEXX, method, part: 'cleat to rafter flange (2 sides)' }));
    out.push(C.filletLimits({ w: p.w, tThin: p.tp }));
    out.push(...C.detailing({ bolt: b, holeD: dh, le: p.lev, s: p.n > 1 ? p.s : null, part: 'cleat' }));
    return C.summarize(out);
  },
};

export const CATALOGUE = { 'SC-01': SC01, 'SC-02': SC02, 'SC-03': SC03, 'SC-04': SC04, 'SC-05': SC05, 'SC-06': SC06 };

// run one connection: { type, params (merged over the defaults), forces, method }
export function checkConnection({ type, params = {}, forces = {}, method = 'ASD' }) {
  const T = CATALOGUE[type];
  if (!T) throw new Error('unknown connection type ' + type);
  const merge = (a, b) => { const o = { ...a }; for (const k of Object.keys(b || {})) o[k] = (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k]) ? merge(a[k], b[k]) : b[k]; return o; };
  const p = merge(T.params, { ...params, method });
  return { type, title: T.title, params: p, forces, method, ...T.check(p, forces) };
}
