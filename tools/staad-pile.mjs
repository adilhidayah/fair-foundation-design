// STAAD -> PILE CAP / PILE GROUP (4B) (batch, Node CLI)
// Reads support reactions per load combination from a STAAD .ANL file (and the combination factors / load types from the .std),
// moves them to the underside of the pile cap exactly as tools/staad-stability.mjs and the app do (P + kD·ΔW, M + H·Δh) and runs the
// 4B checks of the app (calcPile(), js/tabs/pile.js): pile layout (spacing / edge), group efficiency Eg, and per combination the
// pile forces — compression, uplift, lateral (direct shear + torsion, optional p-multipliers). All formulas come from lib/foundation
// (pileLayoutCheck, pileGroupEfficiency, lateralPMultipliers, evaluatePileGroupCombo, foundationSizing) — this file only reads,
// orchestrates and reports. Pile cap structure (5B: one-way, punching, flexure) is not in this tool yet.
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
// Units of the .ANL reaction table must be KN / METER. STAAD torsion (MY) is not applied to the pile group (as the app's 4B).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  evaluatePileGroupCombo, lateralPMultipliers, pileGroupEfficiency, pileLayoutCheck, parseStaadLoads, parseStaadReactions,
  reactionToFoundationLoad, primaryFactors, parseCaseList
} from '../lib/foundation/index.js';
import { footingWeights, loadConfig } from './staad-stability.mjs';

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

export function renderPileReport(cfg, results) {
  const c = cfg.criteria, pc = c.pile;
  const out = [`# Pile cap stability (4B) from STAAD reactions${cfg.project ? ' — ' + cfg.project : ''}`, '',
    `Generated by tools/staad-pile.mjs (FAIR Foundation Design lib, same checks as 4B). Combinations: ${cfg.lc}.`, '',
    `Pile: D = ${pc.D} mm, allowable per pile (ASD, no increase for temporary combinations): compression ${pc.Qc} kN, tension ${pc.Qt} kN, lateral ${pc.Ql} kN. ` +
    `γc = ${c.gc} kN/m³, γs = ${c.gs} kN/m³. Temporary = combination containing a STAAD LOADTYPE Wind or Seismic case (flagged only).`, '',
    'Sign convention (FAIR): P downward +, Fx = −FX, Fz = −FZ of the STAAD reaction; Mz = +MZ, Mx = +MX. Moved to the underside of the cap: ' +
    'P + kD·ΔW, Mz + Fx·Δh, Mx − Fz·Δh; the load point is the pedestal centre. Pile force F_i = P/n + Mz,c·(x_i − x̄)/Σ(x − x̄)² − Mx,c·(z_i − z̄)/Σ(z − z̄)²; ' +
    'lateral = H/n plus torsion from the load-point eccentricity. STAAD torsion (MY) is not applied.', '',
    '## Summary', '', '| Foundation | Node | Cap B × L × H (m) | Piles | E_g | ΔW (kN) | Compression | Uplift | Lateral | Layout | Governing L/C | UC | Status |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|'];
  const uc = (x, i) => (x ? n(x.checks[i].uc, 3) + ' (LC ' + x.lc + ')' : '-');
  for (const r of results) {
    const g = r.gov, L = r.layout;
    out.push(`| ${r.f.name} | ${r.f.node} | ${n(r.f.Bf)} × ${n(r.f.Lf)} × ${n(r.f.Hf)} | ${r.f.piles.length} | ${r.EgOk ? n(r.eff.Eg, 4) : 'n/a'} | ${n(r.w.dW)} | ${uc(r.comp, 0)} | ${uc(r.uplift, 1)} | ${uc(r.lateral, 2)} | ` +
      `${L.valid === false ? L.note : (L.overallPass ? 'OK' : 'FAIL / NOT SET')} | ${g ? g.lc + ' ' + g.title : '-'} | ${g ? n(g.governingUC, 3) : '-'} | ${r.pass ? 'PASS' : 'FAIL'} |`);
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
    return evaluatePileCap(f, cfg.criteria, loads, reac, f.lc ? parseCaseList(f.lc) : lcList, f.dead_case ?? cfg.dead_case);
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
