// ==========================================================================
// STAAD -> SHALLOW FOUNDATION STABILITY (batch, Node CLI)
// Reads support reactions per load combination from a STAAD .ANL file (and the combination factors / load types from the
// .std), moves them to the underside of each footing and runs the same 4A checks as the app (calcFoundation(),
// js/tabs/foundation.js): eccentricity / kern, bearing pressure (rigid footing, no tension, biaxial), sliding and overturning
// (uniaxial + biaxial). All formulas come from lib/foundation (foundationSizing, evaluateFoundationCombo, evaluateBiaxialFooting,
// biaxialSoilPressure, combineFootingChecks, pedestalOffsetMoments) — this file only reads, orchestrates and reports.
//
//   node tools/staad-stability.mjs <config.json> [--out <report.md>]
//
// Config (paths relative to the config file):
// {
//   "project": "Pipe support PT TIP",
//   "std": "PS-1.2.std", "anl": "PS-1.2.ANL",          // default for every foundation (may be overridden per foundation)
//   "lc": "101-164",                                     // ASD (service) combinations to check
//   "dead_case": 3,                                      // primary case that carries the footing self-weight factor kD
//                                                        //   (default: lowest-numbered LOADTYPE Dead primary case)
//   "criteria": { "gc": 24, "gs": 18, "qa": 100, "mu": 0.4, "ecc": "1/6",           // kN/m3, kPa; ecc "1/6" | "1/4" | 0 (no limit)
//                 "fsSlidePerm": 1.5, "fsSlideTemp": 1.5, "fsOTPerm": 1.5, "fsOTTemp": 1.5,
//                 "soil": { "c": 6.865, "phi": 18.81, "method": "meyerhof", "FS": 3,       // optional: q_a from Tab 08 formula
//                           "failure": "general", "beta": 0 },                            //   (bearingCapacityCheck, γ = gs, Df of
//                                                                                         //   each footing) instead of "qa"
//                 "bearMethod": "rigid" },                     // "rigid" (no tension) | "meyerhof" (effective area B'×L', q'a recomputed)
//   "foundations": [ { "name": "PS-1.2 F1", "node": 1, "type": "pedestal",          // "pedestal" | "block"
//                      "Bf": 1.0, "Lf": 1.0, "Hf": 0.3, "Df": 0.9,                    // footing (m), Df = bottom below grade
//                      "Bp": 0.3, "Lp": 0.3, "pedGp": 0.3, "OffX": 0, "OffZ": 0,      // pedestal (m), Gp = top above grade
//                      "groutT": 25 } ]                                               // mm
// }
// Units of the .ANL reaction table must be KN / METER (put UNIT METER KN before PRINT SUPPORT REACTION).
// ==========================================================================
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  foundationSizing, evaluateFoundationCombo, evaluateBiaxialFooting, biaxialSoilPressure, combineFootingChecks,
  pedestalOffsetMoments, meyerhofEffectiveArea, bearingCapacityCheck, parseStaadLoads, primaryFactors, parseStaadReactions, reactionToFoundationLoad, parseCaseList
} from '../lib/foundation/index.js';

const G = 9.80665;
const TEMPORARY_TYPE_RE = /wind|seismic/i;   // STAAD LOADTYPE Wind / Seismic-H / Seismic-V -> Temporary (lower FS may apply)

function eccRatio(spec) {
  if (spec === 0 || spec === '0' || spec === null || spec === false) return 0;
  if (typeof spec === 'number') return spec;
  const m = String(spec).match(/^\s*(\d+)\s*\/\s*(\d+)\s*$/);
  return m ? +m[1] / +m[2] : parseFloat(spec);
}

// Footing self-weight and lever arm from lib foundationSizing() (same as Tab 02): gc, gs in kN/m3 -> t/m3 as the UI does.
export function footingWeights(f, crit) {
  const s = foundationSizing({
    type: f.type === 'block' ? 'block' : 'pedestal', Bf: f.Bf, Lf: f.Lf, Hf: f.Hf, Df: f.Df,
    gc: crit.gc / G, gs: crit.gs / G, Bp: f.Bp || 0, Lp: f.Lp || 0, pedGp: f.pedGp || 0,
    OffX: f.OffX || 0, OffZ: f.OffZ || 0, blockGp: 0, groutT: (f.groutT || 0) / 1000
  });
  if (!s.valid) throw new Error(`${f.name}: invalid footing geometry (B, L, H > 0, Df ≥ 0, with a pedestal Df ≥ Hf)`);
  return { sizing: s, dW: s.totalWeightKN, dh: s.deltaH, Wped: s.hasPed ? (s.Wp + s.Wg) * G : 0, Wsoil: s.Ws * G };
}

// Allowable bearing for a footing B × L (shorter side as the width): Tab 08 formula when criteria.soil is given (as
// allowableBearing() / allowableBearingAt(), js/tabs/bearing.js), else the given criteria.qa (cannot be recomputed).
export function allowableBearingFor(crit, B, L, Df) {
  const s = crit.soil;
  if (!s) return { qa: crit.qa, recomputed: false };
  const Bs = Math.min(B, L), Ls = Math.max(B, L);
  if (!(Bs > 0)) return { qa: null, recomputed: true };
  const r = bearingCapacityCheck({ c: s.c, phiDeg: s.phi, gamma: s.gamma ?? crit.gs, shape: Math.abs(Bs - Ls) < 1e-9 ? 'square' : 'rectangular',
    B: Bs, L: Ls, Df: s.Df ?? Df, method: s.method || 'meyerhof', FS: s.FS ?? 3, failure: s.failure || 'general', beta: s.beta ?? 0 });
  return { qa: r.qa, qu: r.qu, methodNote: r.methodNote, recomputed: true };
}

// One foundation over the listed combinations. loads = parseStaadLoads(std), reac = parseStaadReactions(anl).reactions.
export function evaluateStaadFoundation(f, crit, loads, reac, lcList, deadCase) {
  const w = footingWeights(f, crit);
  const B = f.Bf, L = f.Lf, Ap = (f.type === 'block' ? 0 : (f.Bp || 0) * (f.Lp || 0));
  const OffX = f.type === 'block' ? 0 : (f.OffX || 0), OffZ = f.type === 'block' ? 0 : (f.OffZ || 0);
  const eSel = eccRatio(crit.ecc ?? '1/6'), eccLimit = eSel > 0, eccRatioAllow = eccLimit ? eSel : 1 / 6;
  const qa0 = allowableBearingFor(crit, B, L, f.Df), qa = qa0.qa;
  const bearMey = String(crit.bearMethod || 'rigid').toLowerCase() === 'meyerhof';
  const dead = deadCase ?? Math.min(...Object.entries(loads.primary).filter(([, p]) => /^dead$/i.test(p.type)).map(([n]) => +n));
  const rows = [], missing = [];
  for (const lc of lcList) {
    const r = reac[`${f.node}:${lc}`];
    if (!r) { missing.push(lc); continue; }
    const top = reactionToFoundationLoad(r);
    const fac = primaryFactors(loads, lc);
    const kD = Number.isFinite(dead) ? (fac[dead] || 0) : 1;
    const temporary = Object.entries(fac).some(([p, v]) => v !== 0 && TEMPORARY_TYPE_RE.test(loads.primary[p]?.type || ''));
    const off = (OffX || OffZ)
      ? pedestalOffsetMoments({ Ptop: top.P, kD, Wped: w.Wped, Wsoil: w.Wsoil, OffX, OffZ, Af: B * L, Ap })
      : { dMx: 0, dMz: 0 };
    // to the underside of the footing (loadTypeVector(): dP = ΔW, dMz = Fx·Δh, dMx = −Fz·Δh)
    const P = top.P + kD * w.dW;
    const Mz = top.Mz + top.Fx * w.dh + off.dMz;
    const Mx = top.Mx - top.Fz * w.dh + off.dMx;
    const H = Math.hypot(top.Fx, top.Fz), M = Math.hypot(Mx, Mz);
    const fsSlideMin = temporary ? crit.fsSlideTemp ?? crit.fsSlidePerm : crit.fsSlidePerm;
    const fsOTMin = temporary ? crit.fsOTTemp ?? crit.fsOTPerm : crit.fsOTPerm;
    const uni = evaluateFoundationCombo(B, L, P, H, M, qa, crit.mu, eccRatioAllow, fsSlideMin, fsOTMin);
    const bi = evaluateBiaxialFooting(B, L, P, Mx, Mz, eccRatioAllow, fsOTMin);
    const bp = P > 0 ? biaxialSoilPressure(B, L, P, Mz / P, Mx / P) : { valid: false, qmax: Infinity, qmin: 0, contactRatio: 0, note: 'P ≤ 0' };
    // bearing beyond the kern: rigid footing (no tension) or Meyerhof effective area with q'a for B' × L' (as calcFoundation())
    let qBear = bp.qmax, qaBear = qa, meyUsed = false, mey = null;
    if (bearMey && P > 0 && !(bp.valid && bp.fullContact)) {
      mey = meyerhofEffectiveArea(B, L, P, Mz / P, Mx / P);
      if (mey.valid) { qBear = mey.qeff; qaBear = allowableBearingFor(crit, mey.Beff, mey.Leff, f.Df).qa ?? 0; meyUsed = true; }
      else qBear = Infinity;
    }
    const ucBearingBiaxial = Number.isFinite(qBear) && qaBear > 0 ? qBear / qaBear : Infinity;
    const comb = combineFootingChecks(uni, bi, { eccLimit, ucBearingBiaxial });
    rows.push({ lc, title: loads.combos[lc]?.title || loads.primary[lc]?.title || '', temporary, kD, top, P, H, Mx, Mz, M,
      fsSlideMin, fsOTMin, bp, qBear, qaBear, meyUsed, mey, ...uni, ...bi, ...comb, valid: uni.valid, note: uni.note });
  }
  const gov = rows.length ? rows.reduce((a, b) => ((b.governingUC ?? Infinity) > (a.governingUC ?? Infinity) ? b : a)) : null;
  return { f, w, B, L, qa0, bearMey, eccLimit, eccRatioAllow, dead, rows, missing, gov, pass: !!gov && gov.valid && gov.overallPass && !missing.length };
}

const n = (v, d = 2) => (v === undefined || v === null || Number.isNaN(v) ? '-' : (!Number.isFinite(v) ? '∞' : v.toFixed(d)));

export function renderReport(cfg, results) {
  const c = cfg.criteria;
  const out = [`# Foundation stability from STAAD reactions${cfg.project ? ' — ' + cfg.project : ''}`, '',
    `Generated by tools/staad-stability.mjs (FAIR Foundation Design lib, same checks as 4A). Combinations: ${cfg.lc}.`, '',
    `Criteria: q_a = ${c.soil ? 'from soil (' + (c.soil.method || 'meyerhof') + ', c = ' + c.soil.c + ' kPa, φ = ' + c.soil.phi + '°, FS ' + (c.soil.FS ?? 3) + '), per footing' : c.qa + ' kPa (given)'}, ` +
    `bearing beyond the kern: ${String(c.bearMethod || 'rigid').toLowerCase() === 'meyerhof' ? "Meyerhof effective area B' × L', q'a " + (c.soil ? 'recomputed for B′ × L′' : 'as given') : 'rigid footing, linear pressure, no tension'}, μ = ${c.mu}, e/B allowable ${eccRatio(c.ecc ?? '1/6') > 0 ? c.ecc ?? '1/6' : 'none (partial uplift accepted)'}, ` +
    `FS sliding ${c.fsSlidePerm} / ${c.fsSlideTemp ?? c.fsSlidePerm} (permanent / temporary), FS overturning ${c.fsOTPerm} / ${c.fsOTTemp ?? c.fsOTPerm}; ` +
    `γc = ${c.gc} kN/m³, γs = ${c.gs} kN/m³. Temporary = combination containing a STAAD LOADTYPE Wind or Seismic case.`, '',
    'Sign convention (FAIR): P downward +, Fx = −FX, Fz = −FZ of the STAAD reaction; Mz = +MZ, Mx = +MX (Mz > 0 compresses +x, ' +
    'Mx > 0 compresses −z). Moved to the underside of the footing: P + kD·ΔW, Mz + Fx·Δh, Mx − Fz·Δh (+ pedestal offset). ' +
    'Torsion MY is not part of the shallow-footing checks.', '',
    '## Summary', '', '| Foundation | Node | B × L (m) | ΔW (kN) | Δh (m) | q_a (kPa) | Governing L/C | Check | UC | Status |', '|---|---|---|---|---|---|---|---|---|---|'];
  for (const r of results) {
    const g = r.gov;
    out.push(`| ${r.f.name} | ${r.f.node} | ${n(r.B)} × ${n(r.L)} | ${n(r.w.dW, 2)} | ${n(r.w.dh, 3)} | ${n(r.qa0.qa, 1)} | ${g ? g.lc + ' ' + g.title : '-'} | ` +
      `${g ? (g.valid ? g.governingCheck.name : g.note) : 'no reactions'} | ${g ? n(g.governingUC, 3) : '-'} | ${r.pass ? 'PASS' : 'FAIL'} |`);
  }
  for (const r of results) {
    const f = r.f, s = r.w.sizing;
    out.push('', `## ${f.name} (STAAD node ${f.node})`, '',
      `Footing ${f.type === 'block' ? 'block' : 'with pedestal'}: B × L × H = ${n(f.Bf)} × ${n(f.Lf)} × ${n(f.Hf)} m, Df = ${n(f.Df)} m` +
      (f.type === 'block' ? '' : `, pedestal ${n(f.Bp)} × ${n(f.Lp)} m, top ${n(f.pedGp)} m above grade, offset (${n(f.OffX || 0)}, ${n(f.OffZ || 0)}) m`) +
      `, grout ${f.groutT || 0} mm. Self-weight ΔW = ${n(r.w.dW)} kN (footing ${n(s.Wf * G)}, pedestal + grout ${n(r.w.Wped)}, ` +
      `backfill ${n(r.w.Wsoil)} kN), Δh = ${n(r.w.dh, 3)} m (top of pedestal to underside of footing). kD = factor of STAAD case ${r.dead}. ` +
      (r.qa0.recomputed ? `q_a = q_u/FS = ${n(r.qa0.qu, 1)}/${c.soil.FS ?? 3} = ${n(r.qa0.qa, 1)} kPa — ${r.qa0.methodNote}, B × L = ${n(Math.min(r.B, r.L))} × ${n(Math.max(r.B, r.L))} m, Df = ${n(c.soil.Df ?? f.Df)} m.`
        : `q_a = ${n(r.qa0.qa, 1)} kPa (given).`));
    if (r.missing.length) out.push('', `**No reaction in the .ANL for L/C ${r.missing.join(', ')} — not checked (status FAIL until printed).**`);
    out.push('', '| L/C | Combination | T/P | kD | P (kN) | Hx (kN) | Hz (kN) | Mx (kN·m) | Mz (kN·m) | e_x (m) | e_z (m) | q (kPa) | q_a (kPa) | Contact | FS slide (min) | FS OT (min) | UC | Governing | Status |',
      '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const x of r.rows) {
      if (!x.valid) { out.push(`| ${x.lc} | ${x.title} | ${x.temporary ? 'T' : 'P'} | ${n(x.kD, 3)} | ${n(x.P)} | ${n(x.top.Fx)} | ${n(x.top.Fz)} | ${n(x.Mx)} | ${n(x.Mz)} | - | - | - | - | - | - | - | ∞ | ${x.note} | FAIL |`); continue; }
      const fsOT = Math.min(x.SF1 ?? Infinity, x.SF2 ?? Infinity);
      out.push(`| ${x.lc}${x === r.gov ? ' ◄' : ''} | ${x.title} | ${x.temporary ? 'T' : 'P'} | ${n(x.kD, 3)} | ${n(x.P)} | ${n(x.top.Fx)} | ${n(x.top.Fz)} | ${n(x.Mx)} | ${n(x.Mz)} | ` +
        `${n(x.ex, 3)} | ${n(x.ez, 3)} | ${n(x.qBear, 1)}${x.meyUsed ? " (B'L')" : ''} | ${n(x.qaBear, 1)} | ${x.meyUsed ? `B' ${n(x.mey.Beff)} × L' ${n(x.mey.Leff)}` : n((x.bp.contactRatio ?? 0) * 100, 0) + '%'} | ${n(x.fsSliding)} (${x.fsSlideMin}) | ${n(fsOT)} (${x.fsOTMin}) | ` +
        `${n(x.governingUC, 3)} | ${x.governingCheck.name} | ${x.overallPass ? 'PASS' : 'FAIL'} |`);
    }
  }
  return out.join('\n') + '\n';
}

export function runConfig(cfgPath) {
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
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
    return evaluateStaadFoundation(f, cfg.criteria, loads, reac, f.lc ? parseCaseList(f.lc) : lcList, f.dead_case ?? cfg.dead_case);
  });
  return { cfg, results, md: renderReport(cfg, results) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (!args[0]) { console.error('Usage: node tools/staad-stability.mjs <config.json> [--out <report.md>]'); process.exit(2); }
  const oi = args.indexOf('--out');
  const outP = oi >= 0 ? args[oi + 1] : args[0].replace(/\.json$/i, '') + ' - Stability.md';
  const { results, md } = runConfig(args[0]);
  fs.writeFileSync(outP, md, 'utf8');
  for (const r of results) {
    const g = r.gov;
    console.log(`${r.f.name}: ${r.pass ? 'PASS' : 'FAIL'}` + (g ? ` — L/C ${g.lc}, ${g.valid ? g.governingCheck.name : g.note}, UC ${n(g.governingUC, 3)}` : ' — no reactions') +
      (r.missing.length ? ` (missing L/C ${r.missing.join(',')})` : ''));
  }
  console.log(`Report: ${outP}`);
  process.exit(results.every(r => r.pass) ? 0 : 1);
}
