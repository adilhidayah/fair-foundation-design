// STAAD -> PILE CAP / PILE GROUP (4B) (batch, Node CLI)
// Reads support reactions per load combination from a STAAD .ANL file (and the combination factors / load types from the .std),
// moves them to the underside of the pile cap exactly as tools/staad-stability.mjs and the app do (P + kD·ΔW, M + H·Δh) and runs the
// 4B checks of the app (calcPile(), js/tabs/pile.js): pile layout (spacing / edge), group efficiency Eg, and per combination the
// pile forces — compression, uplift, lateral (direct shear + torsion, optional p-multipliers). All formulas come from lib/foundation
// (pileLayoutCheck, pileGroupEfficiency, lateralPMultipliers, evaluatePileGroupCombo, foundationSizing) — this file only reads,
// orchestrates and reports. Pile cap structure (5B / chapter 06: flexure, one-way, punching of the pedestal and of the piles) is
// designed from the factored STAAD combinations when criteria.design and "lc_lrfd" are given (pileCapDesignCheck()).
//
//   node tools/staad-pile.mjs <config.json> [--out <report.md>]      (or write a .fnd: node tools/fair-run.mjs <input.fnd>)
//
// Config: the same file as staad-stability.mjs ("project", "std", "anl", "lc", "dead_case", "criteria": { "gc", "gs" }), plus
//   "criteria": { "pile": { "Qc": 600, "Qt": 200, "Ql": 50,          // allowable compression / tension / lateral of ONE pile, kN (ASD)
//                           "D": 400,                                 // pile diameter, mm
//                           "type": "friction",                       // "friction" | "end" (end bearing: Eg = 1)
//                           "efficiency": { "apply": true, "manualEg": 0.9, "sNoReduction": "3D" },   // optional
//                           "lateral": { "pMultipliers": true, "method": "governing" },              // optional ("governing" | "average")
//                           "limits": { "spacingMin": "2.5D", "spacingWarn": "3D", "edgeWarn": 0.4 } } }  // m, or "<n>D" times D
//   "foundations": [ { "name": "PC-1", "node": 1, "support": "pile", "type": "pedestal",   // "pedestal" | "block"
//                      "Bf": 3.0, "Lf": 3.0, "Hf": 1.0, "Df": 1.2, "Bp": 0.5, "Lp": 0.5, "pedGp": 0.3, "OffX": 0, "OffZ": 0,
//                      "piles": [ { "x": -0.6, "y": -0.6 }, ... ] } ]    // x, y = plan x, z from the cap centre (m)
//   "lc_lrfd": "301-400",                                  // factored combinations for the cap structure (optional)
//   "criteria": { "design": { "fc": 21.7, "fy": 420, "cover": 75, "bar": 16, "lambda": 1, "asMin": "slab", "spacingStep": 25 },
//                 "pile": { "shape": "square" } }                     // pile shape for the punching of the piles ("square" | "circular")
//   (Hf = cap thickness; pedestal Bp × Lp, OffX / OffZ = load point; the check is as 5B of the app, one-way / punching "detailed")
//   "design": { "autoThickness": { "from": 0.5, "to": 1.5, "step": 0.05 } }   // optional: smallest cap thickness H that passes 4B + structure
//                                          // (needs "lc_lrfd"; "Dp" on the foundation locks the pedestal depth below grade: Df = Dp + H)
// Units of the .ANL reaction table must be KN / METER. STAAD torsion (MY) is not applied to the pile group (as the app's 4B).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  evaluatePileGroupCombo, lateralPMultipliers, pileGroupEfficiency, pileLayoutCheck, parseStaadLoads, parseStaadReactions,
  reactionToFoundationLoad, primaryFactors, parseCaseList,
  oneWayPileShear, punchingPileShear, pilePunchingCheck, pileCapMomentAxis, flexuralDesign, topLayerDesign, barLayout,
  oneWayShearCheck, twoWayShearCheck, eccentricPunchingStress
} from '../lib/foundation/index.js';
import { footingWeights, loadConfig, resolveFoundation } from './staad-stability.mjs';

const TEMPORARY_TYPE_RE = /wind|seismic/i;
const n = (v, d = 2) => (v === undefined || v === null || Number.isNaN(v) ? '-' : (!Number.isFinite(v) ? '∞' : v.toFixed(d)));
// "2.5D" -> 2.5·D (m); a plain number is metres; empty -> null (NOT SET, as the blank field in the app)
const limitM = (v, D) => {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'number') return v > 0 ? v : null;
  const m = String(v).trim().match(/^([\d.]+)\s*(D)?$/i);
  if (!m) throw new Error(`pile limit "${v}": use metres or "<n>D"`);
  const x = parseFloat(m[1]) * (m[2] ? D : 1);
  return x > 0 ? x : null;
};

export function evaluatePileCap(f, crit, loads, reac, lcList, deadCase) {
  const pc = crit.pile;
  if (!pc) throw new Error(`${f.name}: criteria.pile is required (Qc, Qt, Ql, D)`);
  for (const k of ['Qc', 'Qt', 'Ql', 'D']) if (!(pc[k] > 0)) throw new Error(`${f.name}: criteria.pile.${k} must be > 0`);
  const piles = f.piles;
  if (!Array.isArray(piles) || !piles.length) throw new Error(`${f.name}: no piles defined`);
  const D = pc.D / 1000;
  const w = footingWeights(f, crit);
  const hasPed = f.type !== 'block';
  const at = hasPed ? { x: f.OffX || 0, y: f.OffZ || 0 } : { x: 0, y: 0 };
  const cap = { Qc: pc.Qc, Qt: pc.Qt, Ql: pc.Ql };
  const lim = pc.limits || {};
  const layout = pileLayoutCheck(piles, f.Bf, f.Lf, { spacingMin: limitM(lim.spacingMin, D), spacingWarn: limitM(lim.spacingWarn, D), edgeWarn: limitM(lim.edgeWarn, D) });
  const ef = pc.efficiency || {};
  const eff = pileGroupEfficiency({ piles, D, type: pc.type === 'end' ? 'end' : 'friction', sNoReduction: limitM(ef.sNoReduction, D),
    manualEg: Number.isFinite(ef.manualEg) ? ef.manualEg : null, apply: ef.apply !== false });
  const EgOk = eff.valid && Number.isFinite(eff.Eg);
  const lat = pc.lateral || {};
  const latOn = !!lat.pMultipliers, latMethod = lat.method === 'average' ? 'average' : 'governing';
  const dead = deadCase ?? Math.min(...Object.entries(loads.primary).filter(([, p]) => /^dead$/i.test(p.type)).map(([k]) => +k));
  const rows = [], missing = [];
  if (EgOk) for (const lc of lcList) {
    const r = reac[`${f.node}:${lc}`];
    if (!r) { missing.push(lc); continue; }
    const top = reactionToFoundationLoad(r);
    const fac = primaryFactors(loads, lc);
    const kD = Number.isFinite(dead) ? (fac[dead] || 0) : 1;
    const temporary = Object.entries(fac).some(([p, v]) => v !== 0 && TEMPORARY_TYPE_RE.test(loads.primary[p]?.type || ''));
    // to the underside of the cap, as pileComboLoads() (js/tabs/pile.js): P + kD·ΔW, Mz + Fx·Δh, Mx − Fz·Δh; load point = pedestal centre
    const load = { P: top.P + kD * w.dW, Hx: top.Fx, Hz: top.Fz, Mx: top.Mx - top.Fz * w.dh, Mz: top.Mz + top.Fx * w.dh, at };
    const opts = { Eg: eff.Eg, lateralMethod: latMethod };
    if (latOn) {
      opts.latX = lateralPMultipliers({ piles, D, dir: 'x', sign: Math.sign(load.Hx), table: undefined });
      opts.latZ = lateralPMultipliers({ piles, D, dir: 'z', sign: Math.sign(load.Hz), table: undefined });
    }
    rows.push({ lc, title: loads.combos[lc]?.title || loads.primary[lc]?.title || '', temporary, kD, top, load, ...evaluatePileGroupCombo(piles, load, cap, opts) });
  }
  const valid = rows.filter(x => x.valid);
  const pick = (i) => (valid.length ? valid.reduce((a, b) => (b.checks[i].uc > a.checks[i].uc ? b : a)) : null);
  const gov = valid.length ? valid.reduce((a, b) => (b.governingUC > a.governingUC ? b : a)) : null;
  const layoutFail = layout.valid === false || !layout.overallPass;
  const pass = !!gov && EgOk && gov.overallPass && !layoutFail && !missing.length && valid.length === rows.length;
  return { f, w, D, layout, eff, EgOk, latOn, latMethod, dead, rows, missing, gov, comp: pick(0), uplift: pick(1), lateral: pick(2), pass };
}

// ---------------- pile cap structure (as 5B / chapter 06: js/tabs/shear.js, rebar.js) ----------------
// LRFD loads at the underside of the cap from the factored STAAD combinations (same statics as the 4B check), pile forces F_i with
// no capacity limits (Eg = 1). Flexure at the pedestal faces (pileCapMomentAxis, bottom and top, both axes), one-way shear at d
// (oneWayPileShear, "detailed" Vc with ρw of the bottom bars), punching of the pedestal at d/2 with the unbalanced moments at the
// pedestal base (punchingPileShear + eccentricPunchingStress) and punching of every pile through the cap (pilePunchingCheck,
// envelope of |F| over the combinations). Cap weight is not deducted from the pile reactions (as the app: conservative at the bottom).
export function pileCapDesignCheck(f, crit, loads, reac, lcList, deadCase) {
  const D = crit.design, pc = crit.pile, w0 = footingWeights(f, crit);
  const B = f.Bf, L = f.Lf, t = f.Hf * 1000, cc = D.cover ?? 75, bar = D.bar ?? 16, fc = D.fc, fy = D.fy, lambda = D.lambda ?? 1;
  const dp = pc.D / 1000, shape = pc.shape === 'circular' ? 'circular' : 'square';
  const hasPed = f.type !== 'block';
  const c1 = (hasPed ? f.Bp : (f.c1 ?? f.Bp)) || 0, c2 = (hasPed ? f.Lp : (f.c2 ?? f.Lp)) || 0;
  const at = { x: hasPed ? f.OffX || 0 : 0, y: hasPed ? f.OffZ || 0 : 0 };
  const dead = deadCase ?? Math.min(...Object.entries(loads.primary).filter(([, p]) => /^dead$/i.test(p.type)).map(([k]) => +k));
  const d = t - cc - bar;                                       // mm, outer layer (x-bars); y (z) bars d − bar
  const out = { f, B, L, t, cc, bar, fc, fy, d, dp, shape, c1, c2, at, asMinRule: D.asMin === 'beam' ? 'beam' : 'slab', spacingStep: D.spacingStep ?? 25, topLayer: { mode: D.topLayer?.mode === 'two' ? 'two' : 'bottom', rhoTop: D.topLayer?.rhoTop ?? 0.0009 },
    items: [], missing: [], checks: [], notes: [] };
  if (!(c1 > 0 && c2 > 0)) { out.notes.push('Pedestal / column size B_p × L_p must be > 0.'); out.pass = false; out.gov = { name: 'input', uc: Infinity }; return out; }
  if (!(d - bar > 0)) { out.notes.push('Invalid section: effective depth d − d_b ≤ 0.'); out.pass = false; out.gov = { name: 'input', uc: Infinity }; return out; }
  const NO_CAP = { Qc: 1e12, Qt: 1e12, Ql: 1e12 };
  for (const lc of lcList) {
    const r = reac[`${f.node}:${lc}`];
    if (!r) { out.missing.push(lc); continue; }
    const top = reactionToFoundationLoad(r), fac = primaryFactors(loads, lc), kD = fac[dead] || 0;
    const load = { P: top.P + kD * w0.dW, Hx: top.Fx, Hz: top.Fz, Mx: top.Mx - top.Fz * w0.dh, Mz: top.Mz + top.Fx * w0.dh, at };
    const ev = evaluatePileGroupCombo(f.piles, load, NO_CAP);
    out.items.push({ lc, title: loads.combos[lc]?.title || '', load, kD, ev, invalid: ev.valid ? null : ev.note,
      Mzped: top.Mz + top.Fx * w0.Hp, Mxped: top.Mx - top.Fz * w0.Hp });          // at the pedestal base (punching)
  }
  const ok = out.items.filter(it => !it.invalid);
  if (!ok.length) { out.notes.push('No valid pile force distribution for any LRFD combination.'); out.pass = false; out.gov = { name: 'no pile forces', uc: Infinity }; return out; }
  ok.forEach(it => {
    it.mx = pileCapMomentAxis(it.ev.pileForces, 'x', at.x, c1 / 2);
    it.my = pileCapMomentAxis(it.ev.pileForces, 'y', at.y, c2 / 2);
  });
  const minClear = Math.max(25, bar), step = out.spacingStep;
  const CASES = [
    { key: 'x-bottom', get: it => it.mx.bottom, b: L * 1000, dEff: d, face: 'bottom' },
    { key: 'z-bottom', get: it => it.my.bottom, b: B * 1000, dEff: d - bar, face: 'bottom' },
    { key: 'x-top', get: it => it.mx.top, b: L * 1000, dEff: d, face: 'top' },
    { key: 'z-top', get: it => it.my.top, b: B * 1000, dEff: d - bar, face: 'top' }
  ].map(c => {
    const gov = ok.reduce((a, b2) => (c.get(b2) > c.get(a) ? b2 : a));
    // bottom layers always; top: where a combination gives hogging, or always with the two-layer option (design.topLayer, topLayerDesign)
    const Mu = c.get(gov);
    const top = c.face === 'top' ? topLayerDesign(Mu, c.b, c.dEff, t, fc, fy, { asMinRule: out.asMinRule, mode: D.topLayer?.mode, rhoTop: D.topLayer?.rhoTop }) : null;
    const required = top ? top.required : true, minOnly = !!(top && top.minOnly);
    const des = top ? top.design : flexuralDesign(Mu, c.b, c.dEff, t, fc, fy, out.asMinRule);
    const lay = des && des.ok ? barLayout(des.As, c.b, bar, t, step, cc) : null;
    const n = lay && lay.valid ? lay.n : null, s = lay && lay.valid ? lay.s : null;
    return { ...c, lc: minOnly ? '-' : gov.lc, Mu: minOnly ? 0 : Mu, required, minOnly, des, n, s, sAct: lay && lay.valid ? lay.sAct : null, AsProv: lay && lay.valid ? lay.AsProv : 0,
      ok: !required || (!!des && des.ok && !!lay && lay.valid && s - bar >= minClear - 1e-9) };
  });
  out.flex = CASES;
  // one-way shear: sections ⟂ x (width L) and ⟂ z (width B), V_u = pile reactions beyond the section, detailed Vc, ρw from the bottom bars
  out.oneway = ['x', 'y'].map(ax => {
    const half = (ax === 'x' ? c1 : c2) / 2, center = ax === 'x' ? at.x : at.y;
    const per = ok.map(it => ({ it, r: oneWayPileShear({ pileForces: it.ev.pileForces, axis: ax, center, half, d: d / 1000, dp }) }));
    const g = per.reduce((a, b2) => (b2.r.Vu > a.r.Vu ? b2 : a));
    const fl = CASES.find(c => c.key === `${ax === 'x' ? 'x' : 'z'}-bottom`), bw = (ax === 'x' ? L : B) * 1000;
    const rho = fl.AsProv > 0 ? fl.AsProv / (bw * d) : 0.0018;
    const chk = oneWayShearCheck({ bw, h: t, cc, Dbar: bar, fc, vu: g.r.Vu, rho, lambda, method: 'detailed', avOk: false });
    return { axis: ax === 'x' ? 'x' : 'z', lc: g.it.lc, Vu: g.r.Vu, bw, rho, chk, uc: chk.valid ? chk.uc : Infinity };
  });
  // punching of the pedestal / column: V_u = pile reactions outside d/2, unbalanced moments at the pedestal base (§8.4.4.2)
  const pp = ok.map(it => {
    const res = punchingPileShear({ pileForces: it.ev.pileForces, cx: at.x, cy: at.y, c1, c2, d: d / 1000, dp });
    const ecc = eccentricPunchingStress({ c1: c1 * 1000, c2: c2 * 1000, d, Vu: res.Vu, Mx: it.Mxped, Mz: it.Mzped, loc: 'interior' });
    return { it, res, ecc };
  });
  const g = pp.reduce((a, b2) => ((b2.ecc.valid ? b2.ecc.vu : b2.res.Vu) > (a.ecc.valid ? a.ecc.vu : a.res.Vu) ? b2 : a));
  const tw = twoWayShearCheck({ c1: c1 * 1000, c2: c2 * 1000, h: t, cc, Dbar: bar, fc, vu: g.res.Vu, lambda, loc: 'interior' });
  out.punch = g.ecc.valid && tw.valid ? { lc: g.it.lc, Vu: g.res.Vu, vu: g.ecc.vu, bo: tw.bo, vc: tw.vc_gov, phiVc: tw.phi * tw.vc_gov, uc: g.ecc.vu / (tw.phi * tw.vc_gov) }
    : { note: g.ecc.note || 'invalid', uc: Infinity };
  // punching of the piles through the cap: largest |F| of each pile over the combinations
  const env = f.piles.map((p, k) => ({ i: k + 1, x: p.x, y: p.y, F: 0, lc: null }));
  ok.forEach(it => it.ev.pileForces.forEach((pf, k) => { if (env[k].lc === null || Math.abs(pf.F) > Math.abs(env[k].F)) { env[k].F = pf.F; env[k].lc = it.lc; } }));
  const pk = pilePunchingCheck({ piles: env, D: dp, shape, B, L, d: d / 1000, fc, lambda });
  out.pilePunch = { ...pk, env };
  out.checks = [
    ...out.oneway.map(o => ({ name: `One-way shear ${o.axis} (§22.5.5)`, uc: o.uc })),
    { name: 'Punching of the pedestal (§22.6)', uc: out.punch.uc },
    { name: 'Punching of the piles (§22.6)', uc: pk.valid ? pk.governingUC : Infinity },
    ...CASES.filter(c => c.required).map(c => ({ name: `Flexure ${c.key}`, uc: c.ok ? (c.des.AsCalc / c.AsProv) : Infinity }))
  ];
  out.gov = out.checks.reduce((a, b2) => (b2.uc > a.uc ? b2 : a));
  out.pass = out.checks.every(c => c.uc <= 1.0) && !out.missing.length && !out.items.some(it => it.invalid);
  return out;
}

function designReport(r) {
  const D = r.design, f = r.f, o = [];
  o.push('', `## ${f.name} — pile cap thickness and reinforcement (LRFD, as 5B / chapter 06)`, '',
    `Cap ${n(D.B)} × ${n(D.L)} m, H = ${n(D.t, 0)} mm, cover ${D.cc} mm, bars D${D.bar}: d = H − cover − d_b = ${n(D.d, 0)} mm (x-bars), ${n(D.d - D.bar, 0)} mm (z-bars); ` +
    `f'c = ${D.fc} MPa, f_y = ${D.fy} MPa. Pedestal ${n(D.c1)} × ${n(D.c2)} m at (${n(D.at.x, 3)}, ${n(D.at.y, 3)}) m. Pile forces from the factored combinations (rigid cap, ` +
    `E_g = 1, cap weight not deducted). ACI 318M-19: flexure at the pedestal faces §13.2.7.1, ${D.asMinRule === 'beam' ? 'A_s,min = max(0.0018·b·h, 1.4·b·d/f_y) (project criterion)' : 'A_s,min per Table 8.6.1.1'}, ` +
    `spacing rounded down to ${D.spacingStep} mm, s ≤ min(3h, 450) mm, clear ≥ max(25 mm, d_b); one-way shear at d §22.5 (Eq. c, ρ_w of the bottom bars, λ_s); punching of the pedestal at d/2 §22.6 ` +
    `with the unbalanced moments at the pedestal base (§8.4.4.2); punching of every pile through the cap (${D.shape} pile, section at d/2 cut by the cap edges).`);
  if (D.missing.length) o.push('', `**No reaction for L/C ${D.missing.join(', ')} — not checked.**`);
  const inv = D.items.filter(it => it.invalid);
  if (inv.length) o.push('', `**No pile force distribution: ${inv.map(it => it.lc + ' (' + it.invalid + ')').join('; ')}.**`);
  o.push('', '| Check | L/C | Demand | Capacity | UC | Status |', '|---|---|---|---|---|---|');
  for (const w of D.oneway || []) {
    const c = w.chk;
    o.push(`| One-way shear, sections ⟂ ${w.axis} (b_w ${n(w.bw, 0)} mm, ρ_w ${n(w.rho * 100, 3)} %) | ${w.lc} | V_u = ${n(w.Vu, 1)} kN | φV_c = ${c.valid ? n(c.phiVc / 1000, 1) : '-'} kN | ${n(w.uc, 3)} | ${w.uc <= 1 ? 'OK' : 'NOT OK'} |`);
  }
  if (D.punch) o.push(D.punch.vu !== undefined
    ? `| Punching of the pedestal (b_o ${n(D.punch.bo, 0)} mm) | ${D.punch.lc} | v_u = ${n(D.punch.vu, 3)} MPa (V_u ${n(D.punch.Vu, 1)} kN) | φv_c = ${n(D.punch.phiVc, 3)} MPa (0.75·${n(D.punch.vc, 3)}) | ${n(D.punch.uc, 3)} | ${D.punch.uc <= 1 ? 'OK' : 'NOT OK'} |`
    : `| Punching of the pedestal | - | ${D.punch.note} | - | - | - |`);
  const pk = D.pilePunch;
  if (pk && pk.gov) o.push(`| Punching of the piles (pile ${pk.gov.i}, ${pk.gov.loc}, b_o ${n(pk.gov.bo * 1000, 0)} mm) | ${D.pilePunch.env[pk.gov.i - 1].lc} | V_u = ${n(pk.gov.Vu, 1)} kN | φV_c = ${n(pk.gov.phiVc, 1)} kN | ${n(pk.governingUC, 3)} | ${pk.overallPass ? 'OK' : 'NOT OK'} |`);
  o.push('', '| Reinforcement | L/C | M_u (kN·m) | b (mm) | d (mm) | A_s,req (mm²) | A_s,min (mm²) | Bars | A_s,prov (mm²) | Status |',
    '|---|---|---|---|---|---|---|---|---|---|');
  for (const c of D.flex || []) {
    if (!c.required) { o.push(`| ${c.key} | - | 0 (no hogging) | ${n(c.b, 0)} | ${n(c.dEff, 0)} | - | - | not required (detailing) | - | - |`); continue; }
    if (!c.des || !c.des.ok) { o.push(`| ${c.key} | ${c.lc} | ${n(c.Mu, 2)} | ${n(c.b, 0)} | ${n(c.dEff, 0)} | section too small | - | - | - | NOT OK |`); continue; }
    o.push(`| ${c.key} | ${c.lc} | ${c.minOnly ? `0 (minimum top mat, ρ_top ${D.topLayer.rhoTop ?? 0.0009})` : n(c.Mu, 2)} | ${n(c.b, 0)} | ${n(c.dEff, 0)} | ${n(c.des.AsCalc, 0)} | ${n(c.des.AsMin, 0)} | ` +
      `${c.s ? `D${D.bar} @ ${n(c.s, 0)} (${c.n} bars)` : 'spacing < step'} | ${n(c.AsProv, 0)} | ${c.ok ? 'OK' : 'NOT OK'} |`);
  }
  if (r.thTrials) o.push('', `Auto-thickness (H ${n(r.thTrials[0].Hf)}–${n(r.thTrials[r.thTrials.length - 1].Hf)} m, each thickness re-runs 4B and the structure; the smallest passing H is kept): ` +
      (r.thFound ? `**H = ${n(f.Hf)} m**.` : '**no thickness in the range passes** — results shown for the last one.'), '',
    '| H (m) | 4B governing UC | Structure governing | Structure UC | Status |', '|---|---|---|---|---|',
    ...r.thTrials.map(t => t.note ? `| ${n(t.Hf)} | - | ${t.note} | - | FAIL |` : `| ${n(t.Hf)}${t.pass ? ' ◄' : ''} | ${n(t.gov4B, 3)} | ${t.desGov} | ${n(t.desUC, 3)} | ${t.pass ? 'PASS' : 'FAIL'} |`));
  if (D.notes.length) o.push('', ...D.notes.map(x => `**${x}**`));
  o.push('', `Pile cap design: **${D.pass ? 'OK' : 'NOT OK'}** — governing ${D.gov.name}, UC ${n(D.gov.uc, 3)}.`);
  return o;
}

export function renderPileReport(cfg, results) {
  const c = cfg.criteria, pc = c.pile;
  const out = [`# Pile cap stability (4B) from STAAD reactions${cfg.project ? ' — ' + cfg.project : ''}`, '',
    `Generated by tools/staad-pile.mjs (FAIR Foundation Design lib, same checks as 4B). Combinations: ${cfg.lc}.`, '',
    `Pile: D = ${pc.D} mm, allowable per pile (ASD, no increase for temporary combinations): compression ${pc.Qc} kN, tension ${pc.Qt} kN, lateral ${pc.Ql} kN. ` +
    `γc = ${c.gc} kN/m³, γs = ${c.gs} kN/m³. Temporary = combination containing a STAAD LOADTYPE Wind or Seismic case (flagged only).`, '',
    'Sign convention (FAIR): P downward +, Fx = −FX, Fz = −FZ of the STAAD reaction; Mz = +MZ, Mx = +MX. Moved to the underside of the cap: ' +
    'P + kD·ΔW, Mz + Fx·Δh, Mx − Fz·Δh; the load point is the pedestal centre. Pile force F_i = P/n + Mz,c·(x_i − x̄)/Σ(x − x̄)² − Mx,c·(z_i − z̄)/Σ(z − z̄)²; ' +
    'lateral = H/n plus torsion from the load-point eccentricity. STAAD torsion (MY) is not applied.', '',
    '## Summary', '', '| Foundation | Node | Cap B × L × H (m) | Piles | E_g | ΔW (kN) | Compression | Uplift | Lateral | Layout | Governing L/C | UC | Cap structure | Status |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|'];
  const uc = (x, i) => (x ? n(x.checks[i].uc, 3) + ' (LC ' + x.lc + ')' : '-');
  for (const r of results) {
    const g = r.gov, L = r.layout;
    out.push(`| ${r.f.name} | ${r.f.node} | ${n(r.f.Bf)} × ${n(r.f.Lf)} × ${n(r.f.Hf)} | ${r.f.piles.length} | ${r.EgOk ? n(r.eff.Eg, 4) : 'n/a'} | ${n(r.w.dW)} | ${uc(r.comp, 0)} | ${uc(r.uplift, 1)} | ${uc(r.lateral, 2)} | ` +
      `${L.valid === false ? L.note : (L.overallPass ? 'OK' : 'FAIL / NOT SET')} | ${g ? g.lc + ' ' + g.title : '-'} | ${g ? n(g.governingUC, 3) : '-'} | ${r.design ? `${r.design.pass ? 'OK' : 'NOT OK'} — ${r.design.gov.name}, UC ${n(r.design.gov.uc, 3)}` : '-'} | ${r.pass ? 'PASS' : 'FAIL'} |`);
  }
  for (const r of results) {
    const f = r.f, L = r.layout, g = r.gov;
    out.push('', `## ${f.name} (STAAD node ${f.node})`, '',
      `Pile cap ${f.type === 'block' ? 'block' : 'with pedestal'}: ${n(f.Bf)} × ${n(f.Lf)} × ${n(f.Hf)} m, Df = ${n(f.Df)} m` +
      (f.type === 'block' ? '' : `, pedestal ${n(f.Bp)} × ${n(f.Lp)} m, offset (${n(f.OffX || 0, 3)}, ${n(f.OffZ || 0, 3)}) m`) +
      `. Cap + pedestal + backfill ΔW = ${n(r.w.dW)} kN, Δh = ${n(r.w.dh, 3)} m; kD = factor of STAAD case ${r.dead}.`, '',
      '| Pile | x (m) | z (m) |', '|---|---|---|', ...f.piles.map((p, k) => `| ${k + 1} | ${n(p.x, 3)} | ${n(p.y, 3)} |`), '');
    if (L.valid === false) out.push(`**Layout:** ${L.note}`);
    else {
      out.push(`**Layout (spacing / edge):** minimum spacing ${n(L.spacing.actual, 3)} m (piles ${L.spacing.pair ? L.spacing.pair.join('-') : '-'}), limit ${n(L.spacing.limit, 3)} m → ${L.spacing.status}; ` +
        `smallest edge distance ${n(L.edge.actual, 3)} m (pile ${L.edge.pile}), warning limit ${n(L.edge.warnLimit, 3)} m → ${L.edge.status}.`);
      L.warnings.forEach(x => out.push('', `- Warning: ${x}`));
      if (L.notSet.length) out.push('', `**Not set: ${L.notSet.join(', ')} — status FAIL until given (as the app).**`);
    }
    out.push('', r.EgOk ? `**Group efficiency:** E_g = ${n(r.eff.Eg, 4)} — ${r.eff.method}${r.eff.thetaDeg !== undefined ? ` (θ = ${n(r.eff.thetaDeg, 2)}°, ${r.eff.m} × ${r.eff.n} grid, s = ${n(r.eff.s, 3)} m)` : ''}; ${r.eff.reason} ` +
      `P_all,g = ${n(r.eff.Eg * cfg.criteria.pile.Qc, 1)} kN, T_all,g = ${n(r.eff.Eg * cfg.criteria.pile.Qt, 1)} kN.`
      : `**Group efficiency not available:** ${r.eff.reason || r.eff.note} Give \`PILE EFFICIENCY MANUAL <Eg>\` (or OFF).`);
    if (r.latOn) out.push('', `Lateral: p-multipliers (AASHTO LRFD Table 10.7.2.4-1, Brown et al. 1988 — verify against the project spec), method ${r.latMethod}.`);
    if (r.missing.length) out.push('', `**No reaction in the .ANL for L/C ${r.missing.join(', ')} — not checked (status FAIL until printed).**`);
    out.push('', '| L/C | Combination | T/P | kD | P (kN) | Hx (kN) | Hz (kN) | Mx (kN·m) | Mz (kN·m) | F_max (kN) | Pile | F_min (kN) | Pile | V_max (kN) | Pile | DCR_c | DCR_t | DCR_l | UC | Status |',
      '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const x of r.rows) {
      if (!x.valid) { out.push(`| ${x.lc} | ${x.title} | ${x.temporary ? 'T' : 'P'} | ${n(x.kD, 3)} | ${n(x.load.P)} | ${n(x.load.Hx)} | ${n(x.load.Hz)} | ${n(x.load.Mx)} | ${n(x.load.Mz)} | ${x.note} | | | | | | | | | ∞ | FAIL |`); continue; }
      out.push(`| ${x.lc}${x === g ? ' ◄' : ''} | ${x.title} | ${x.temporary ? 'T' : 'P'} | ${n(x.kD, 3)} | ${n(x.load.P)} | ${n(x.load.Hx)} | ${n(x.load.Hz)} | ${n(x.load.Mx)} | ${n(x.load.Mz)} | ` +
        `${n(x.Fmax)} | ${x.FmaxPile.i} | ${n(x.Fmin)} | ${x.FminPile.i} | ${n(x.Vmax)} | ${x.VmaxPile.i} | ${n(x.checks[0].uc, 3)} | ${n(x.checks[1].uc, 3)} | ${n(x.checks[2].uc, 3)} | ` +
        `${n(x.governingUC, 3)} | ${x.overallPass ? 'PASS' : 'FAIL'} |`);
    }
  }
  for (const r of results) if (r.design) out.push(...designReport(r));
  return out.join('\n') + '\n';
}

export function runPileConfig(cfgPath) {
  const cfg = loadConfig(cfgPath);
  const dir = path.dirname(path.resolve(cfgPath));
  const rd = (p) => fs.readFileSync(path.resolve(dir, p), 'latin1');
  const lcList = parseCaseList(cfg.lc);
  const cache = {};
  const results = cfg.foundations.map(f => {
    const stdP = f.std || cfg.std, anlP = f.anl || cfg.anl;
    if (!stdP || !anlP) throw new Error(`${f.name}: "std" and "anl" are required`);
    const key = stdP + '|' + anlP;
    if (!cache[key]) {
      const reac = parseStaadReactions(rd(anlP));
      if (!reac.unitOk) throw new Error(`${anlP}: reaction units ${reac.units} — print them in KN / METER`);
      cache[key] = { loads: parseStaadLoads(rd(stdP)), reac: reac.reactions };
    }
    const { loads, reac } = cache[key];
    const lrfd = f.lc_lrfd || cfg.lc_lrfd, dc = f.dead_case ?? cfg.dead_case, lcs = f.lc ? parseCaseList(f.lc) : lcList;
    // 4B + cap structure for one thickness
    const evalOne = (g) => {
      const r = evaluatePileCap(g, cfg.criteria, loads, reac, lcs, dc);
      if (cfg.criteria.design && lrfd) {
        r.design = pileCapDesignCheck(g, cfg.criteria, loads, reac, parseCaseList(lrfd), dc);
        r.pass = r.pass && r.design.pass;
      }
      return r;
    };
    const at = cfg.criteria.design && cfg.criteria.design.autoThickness;
    if (!at || !lrfd) return evalOne(f);
    // auto-thickness: the cap thickness H goes up in steps from `from` (default the given Hf) to `to`; every H re-runs the whole
    // foundation (the cap weight ΔW changes the pile forces) and the smallest H that passes 4B and the structure is kept. B × L are
    // fixed by the pile layout, so the smallest H is also the smallest volume. With "Dp" the pedestal depth below grade is locked
    // (Df = Dp + H, as the shallow auto-thickness); without it Df stays and H cannot exceed it.
    const step = at.step ?? 0.05, to = at.to ?? 1.0, trials = [];
    let best = null, last = null;
    for (let h = at.from ?? f.Hf; h <= to + 1e-9; h = Math.round((h + step) * 1000) / 1000) {
      const g = resolveFoundation(cfg)({ ...f, Hf: h, Df: f.Dp != null ? undefined : f.Df });
      let r;
      try { r = evalOne(g); } catch (e) { trials.push({ Hf: h, note: e.message, pass: false }); break; }
      const d = r.design;
      trials.push({ Hf: h, gov4B: r.gov ? r.gov.governingUC : Infinity, desGov: d.gov.name, desUC: d.gov.uc, pass: r.pass });
      last = r;
      if (r.pass) { best = r; break; }
    }
    const res = best || last || evalOne(f);
    res.thTrials = trials; res.thFound = !!best;
    return res;
  });
  return { cfg, results, md: renderPileReport(cfg, results) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (!args[0]) { console.error('Usage: node tools/staad-pile.mjs <config.json> [--out <report.md>]'); process.exit(2); }
  const oi = args.indexOf('--out');
  const outP = oi >= 0 ? args[oi + 1] : args[0].replace(/\.json$/i, '') + ' - Pile.md';
  const { results, md } = runPileConfig(args[0]);
  fs.writeFileSync(outP, md, 'utf8');
  for (const r of results) console.log(`${r.f.name}: ${r.pass ? 'PASS' : 'FAIL'}` + (r.gov ? ` — L/C ${r.gov.lc}, UC ${n(r.gov.governingUC, 3)}` : ' — no result'));
  console.log(`Report: ${outP}`);
  process.exit(results.every(r => r.pass) ? 0 : 1);
}
