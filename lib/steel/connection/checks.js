// ==========================================================================
// STEEL CONNECTION — limit states (AISC 360-16), ASD or LRFD
// Pure functions, units: mm, MPa (N/mm²), forces kN, moments kN·m. No DOM.
// Every check returns { name, clause, demand, capacity, uc, unit, note } where capacity is the allowable (ASD, Rn/Ω) or
// design (LRFD, φRn) strength and uc = demand / capacity (PASS when uc <= 1.0).
// ==========================================================================

// resistance factors by limit-state family (AISC 360-16)
export const FACTORS = {
  tensionYield: { omega: 1.67, phi: 0.90 },   // D2(a), J4.1(a)
  rupture: { omega: 2.00, phi: 0.75 },        // D2(b), J4.1(b), J4.2(b), J4.3
  shearYield: { omega: 1.50, phi: 1.00 },     // J4.2(a)
  compression: { omega: 1.67, phi: 0.90 },    // J4.4, E3
  bolt: { omega: 2.00, phi: 0.75 },           // J3.6, J3.7, J3.10
  weld: { omega: 2.00, phi: 0.75 },           // J2.4
  flexure: { omega: 1.67, phi: 0.90 },        // F11 (plates), J10.1
  webYield: { omega: 1.50, phi: 1.00 },       // J10.2
  webCrippling: { omega: 2.00, phi: 0.75 },   // J10.3
};

export function allowable(Rn, family, method = 'ASD') {
  const f = FACTORS[family];
  if (!f) throw new Error('unknown resistance family ' + family);
  return method === 'LRFD' ? f.phi * Rn : Rn / f.omega;
}

function chk(name, clause, demand, capacity, unit = 'kN', note = '') {
  const d = Math.abs(demand);
  const uc = capacity > 0 ? d / capacity : Infinity;
  return { name, clause, demand: d, capacity, uc, unit, note, pass: uc <= 1.0 };
}

// ---------------------------------------------------------------- bolts
// J3.6 bolt shear, per bolt: Rn = Fnv·Ab·ns (ns = number of shear planes)
export function boltShear({ V, n, bolt, ns = 1, method = 'ASD' }) {
  const Rn = bolt.Fnv * bolt.Ab * ns / 1000 * n;
  return chk(`Bolt shear (${n} × ${bolt.name}, ${ns} plane)`, 'AISC 360-16 J3.6', V, allowable(Rn, 'bolt', method));
}

// J3.6 bolt tension, group
export function boltTension({ T, n, bolt, method = 'ASD' }) {
  const Rn = bolt.Fnt * bolt.Ab / 1000 * n;
  return chk(`Bolt tension (${n} × ${bolt.name})`, 'AISC 360-16 J3.6', T, allowable(Rn, 'bolt', method));
}

// J3.7 combined tension and shear (bearing-type), per bolt: F'nt = 1.3Fnt − (Ω·Fnt/Fnv)·frv ≤ Fnt (ASD)
//                                                           F'nt = 1.3Fnt − (Fnt/(φ·Fnv))·frv ≤ Fnt (LRFD)
export function boltCombined({ T, V, n, bolt, ns = 1, method = 'ASD' }) {
  const frv = V * 1000 / (n * bolt.Ab * ns);
  const f = FACTORS.bolt;
  const k = method === 'LRFD' ? bolt.Fnt / (f.phi * bolt.Fnv) : f.omega * bolt.Fnt / bolt.Fnv;
  const Fnt2 = Math.max(0, Math.min(bolt.Fnt, 1.3 * bolt.Fnt - k * frv));
  const Rn = Fnt2 * bolt.Ab / 1000 * n;
  return chk(`Bolt tension with shear (F'nt = ${Fnt2.toFixed(1)} MPa)`, 'AISC 360-16 J3.7', T, allowable(Rn, 'bolt', method));
}

// J3.10 bearing / tearout at one bolt hole (standard or short-slotted, deformation at service load considered):
// Rn = min(1.2·lc·t·Fu, 2.4·d·t·Fu); lc = clear distance in the direction of force
export function boltBearing({ V, n, bolt, t, Fu, le, s, holeD, method = 'ASD', part = 'plate' }) {
  const lcEdge = le - holeD / 2, lcIn = s - holeD;
  const rEdge = Math.min(1.2 * lcEdge * t * Fu, 2.4 * bolt.d * t * Fu) / 1000;
  const rIn = Math.min(1.2 * lcIn * t * Fu, 2.4 * bolt.d * t * Fu) / 1000;
  const Rn = n > 1 ? rEdge + (n - 1) * rIn : rEdge;
  return chk(`Bolt bearing / tearout on ${part} (t = ${t})`, 'AISC 360-16 J3.10(a)', V, allowable(Rn, 'bolt', method), 'kN',
    `lc edge ${lcEdge.toFixed(1)}, inner ${lcIn.toFixed(1)} mm`);
}

// ---------------------------------------------------------------- connecting elements
// J4.1 tension: yield on Ag, rupture on Ae = U·An (An ≤ 0.85 Ag for bolted splice / gusset plates)
export function tensionYield({ T, Ag, Fy, method = 'ASD', part = 'element' }) {
  return chk(`Tension yielding of ${part}`, 'AISC 360-16 J4.1(a) / D2(a)', T, allowable(Fy * Ag / 1000, 'tensionYield', method));
}
export function tensionRupture({ T, An, Fu, U = 1.0, Ag = null, cap085 = false, method = 'ASD', part = 'element' }) {
  let Ae = U * An;
  if (cap085 && Ag) Ae = Math.min(Ae, 0.85 * Ag);
  return chk(`Tension rupture of ${part} (Ae = ${Ae.toFixed(0)} mm²)`, 'AISC 360-16 J4.1(b) / D2(b)', T, allowable(Fu * Ae / 1000, 'rupture', method));
}
// J4.2 shear
export function shearYield({ V, Agv, Fy, method = 'ASD', part = 'element' }) {
  return chk(`Shear yielding of ${part}`, 'AISC 360-16 J4.2(a)', V, allowable(0.6 * Fy * Agv / 1000, 'shearYield', method));
}
export function shearRupture({ V, Anv, Fu, method = 'ASD', part = 'element' }) {
  return chk(`Shear rupture of ${part}`, 'AISC 360-16 J4.2(b)', V, allowable(0.6 * Fu * Anv / 1000, 'rupture', method));
}
// J4.3 block shear: Rn = 0.6FuAnv + UbsFuAnt ≤ 0.6FyAgv + UbsFuAnt
export function blockShear({ P, Agv, Anv, Ant, Fy, Fu, Ubs = 1.0, method = 'ASD', part = 'element' }) {
  const Rn = Math.min(0.6 * Fu * Anv + Ubs * Fu * Ant, 0.6 * Fy * Agv + Ubs * Fu * Ant) / 1000;
  return chk(`Block shear of ${part}`, 'AISC 360-16 J4.3', P, allowable(Rn, 'rupture', method), 'kN',
    `Agv ${Agv.toFixed(0)}, Anv ${Anv.toFixed(0)}, Ant ${Ant.toFixed(0)} mm²`);
}
// J4.4 / Chapter E: compression of a connecting element (rectangular b × t, unbraced length L, effective length factor K)
export function compressionPlate({ P, b, t, L, K, Fy, E = 200000, method = 'ASD', part = 'plate' }) {
  const r = t / Math.sqrt(12), KLr = K * L / r, Ag = b * t;
  let Fcr;
  if (KLr <= 25) Fcr = Fy;                                               // J4.4(a)
  else {
    const Fe = Math.PI ** 2 * E / KLr ** 2;
    Fcr = KLr <= 4.71 * Math.sqrt(E / Fy) ? Math.pow(0.658, Fy / Fe) * Fy : 0.877 * Fe;   // E3
  }
  return chk(`Compression / buckling of ${part} (KL/r = ${KLr.toFixed(1)})`, KLr <= 25 ? 'AISC 360-16 J4.4(a)' : 'AISC 360-16 J4.4(b), E3',
    P, allowable(Fcr * Ag / 1000, 'compression', method));
}
// Whitmore effective width: bw = 2·L·tan30° + g (g = gauge between outer bolt lines, 0 for a single line)
export function whitmoreWidth({ Lconn, g = 0 }) {
  return 2 * Lconn * Math.tan(Math.PI / 6) + g;
}
// plate flexure (F11, rectangular, plastic Mp = Fy·Z ≤ 1.6 Fy S)
export function plateFlexure({ M, b, t, Fy, method = 'ASD', part = 'plate' }) {
  const Z = b * t * t / 4, S = b * t * t / 6;
  const Mn = Math.min(Fy * Z, 1.6 * Fy * S) / 1e6;
  return chk(`Flexure of ${part}`, 'AISC 360-16 F11.1', M, allowable(Mn, 'flexure', method), 'kN·m');
}

// ---------------------------------------------------------------- welds
// J2.4 fillet weld: Rn = 0.60·FEXX·(1 + 0.5 sin^1.5 θ)·0.707·w·L (θ = 0 conservative unless useDirection)
export function filletWeld({ R, w, L, FEXX = 480, theta = 0, useDirection = false, method = 'ASD', part = 'weld' }) {
  const kds = useDirection ? 1 + 0.5 * Math.pow(Math.sin(theta * Math.PI / 180), 1.5) : 1.0;
  const Rn = 0.6 * FEXX * kds * 0.707 * w * L / 1000;
  return chk(`Fillet weld ${part} (w = ${w}, L = ${L.toFixed(0)})`, 'AISC 360-16 J2.4', R, allowable(Rn, 'weld', method));
}
// Table J2.4 minimum fillet size (thinner part joined), J2.2b maximum along an edge
export function filletLimits({ w, tThin, tEdge = null }) {
  const wmin = tThin <= 6 ? 3 : tThin <= 13 ? 5 : tThin <= 19 ? 6 : 8;
  const wmax = tEdge == null ? Infinity : tEdge < 6 ? tEdge : tEdge - 2;
  return { name: `Fillet size limits (min ${wmin}, max ${wmax === Infinity ? '-' : wmax})`, clause: 'AISC 360-16 Table J2.4, J2.2b',
    demand: w, capacity: wmax, uc: w < wmin ? Infinity : (wmax === Infinity ? 0 : w / wmax), unit: 'mm', note: '',
    pass: w >= wmin && w <= wmax };
}
// fillet weld base metal shear rupture is checked by the caller where relevant (J4.2 on the thinner element)

// ---------------------------------------------------------------- concentrated forces on members (J10)
// J10.1 flange local bending: Rn = 6.25·Fyf·tf²
export function flangeLocalBending({ F, tf, Fyf, method = 'ASD', part = 'column flange' }) {
  return chk(`Flange local bending of ${part}`, 'AISC 360-16 J10.1', F, allowable(6.25 * Fyf * tf * tf / 1000, 'flexure', method));
}
// J10.2 web local yielding: Rn = Fyw·tw·(5k + lb) (interior, distance > d) or Fyw·tw·(2.5k + lb) (at member end)
export function webLocalYielding({ F, tw, k, lb, Fyw, atEnd = false, method = 'ASD', part = 'web' }) {
  const Rn = Fyw * tw * ((atEnd ? 2.5 : 5) * k + lb) / 1000;
  return chk(`Web local yielding of ${part}`, 'AISC 360-16 J10.2', F, allowable(Rn, 'webYield', method));
}
// J10.3 web local crippling (bearing length lb, member depth d)
export function webCrippling({ F, tw, tf, d, lb, Fyw, E = 200000, atEnd = false, method = 'ASD', part = 'web' }) {
  const base = 0.80 * tw * tw * Math.sqrt(E * Fyw * tf / tw);
  let Rn;
  if (!atEnd) Rn = base * (1 + 3 * (lb / d) * Math.pow(tw / tf, 1.5));
  else if (lb / d <= 0.2) Rn = 0.40 / 0.80 * base * (1 + 3 * (lb / d) * Math.pow(tw / tf, 1.5));
  else Rn = 0.40 / 0.80 * base * (1 + (4 * lb / d - 0.2) * Math.pow(tw / tf, 1.5));
  return chk(`Web local crippling of ${part}`, 'AISC 360-16 J10.3', F, allowable(Rn / 1000, 'webCrippling', method));
}

// ---------------------------------------------------------------- detailing (geometry, not strength)
export function detailing({ bolt, holeD, le, s, part = 'plate' }) {
  const out = [];
  out.push({ name: `Edge distance on ${part} (min ${bolt.emin})`, clause: 'AISC 360-16 Table J3.4M', demand: bolt.emin, capacity: le,
    uc: bolt.emin / le, unit: 'mm', note: '', pass: le >= bolt.emin });
  if (s != null) out.push({ name: `Bolt spacing (min 3d = ${3 * bolt.d})`, clause: 'AISC 360-16 J3.3', demand: 3 * bolt.d, capacity: s,
    uc: 3 * bolt.d / s, unit: 'mm', note: '2 2/3 d absolute minimum, 3d preferred', pass: s >= 3 * bolt.d });
  return out;
}

// governing summary
// detailing / geometry ratios (unit 'mm': edge distance, spacing, weld size, fit) are reported apart from the strength UC,
// so a connection governed by a minimum edge distance is not read as "nearly fully stressed"
export const isDetailing = c => c.unit === 'mm' || c.detailing === true;
export function summarize(checks) {
  const top = list => list.reduce((a, c) => (c.uc > (a ? a.uc : -1) ? c : a), null);
  const g = top(checks), gs = top(checks.filter(c => !isDetailing(c) && !c.info));
  return { checks, governingUC: g ? g.uc : 0, governing: g ? g.name : '',
    strengthUC: gs ? gs.uc : 0, strengthGoverning: gs ? gs.name : '', overallPass: checks.every(c => c.pass) };
}
