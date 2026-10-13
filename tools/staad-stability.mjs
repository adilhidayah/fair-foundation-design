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
//                           "FSTemp": 2,                                                  //   FS for wind / seismic combos (default FS)
//                           "failure": "general", "beta": 0 },                            //   (bearingCapacityCheck, γ = gs, Df of
//                                                                                         //   each footing) instead of "qa"
//                 "bearMethod": "rigid",                       // "rigid" (no tension) | "meyerhof" (effective area B'×L', q'a recomputed)
//                 "minContact": 0.7,                            // optional: min. share of the base in contact (statics, 4A §4.2), UC = min/ratio
//                 "design": { "fc": 21.7, "fy": 420, "cover": 75, "bar": 13, "lambda": 1,       // optional: footing thickness + bars
//                             "asMin": "slab",                         // "slab" (ACI Table 8.6.1.1) | "beam" (max(0.0018bt, 1.4bd/fy))
//                             "spacingStep": 25,                       // bar spacing rounded down to this multiple (mm)
//                 "pedestal": { "bar": 16, "tie": 10, "legs": 2, "clearCover": 50, "fyt": 420, "rhoMin": 0.01 },  // optional: pedestal
//                                                                          //   "boltBarClearMin": min. clear anchor bolt / bar (mm, default max(25, d_b))
//                                                                          //   "autoSize": { "step": 0.05, "to": 0.8 }: enlarge the pedestal (m) until
//                                                                          //   the bolts are inside the ties and clear of the bars (whole foundation re-run)
//                                                                          //   P-M (5A) + shear with ties, LRFD (fc / fy from "design")
//                             "autoThickness": { "to": 0.8, "step": 0.05 } } },              //   from the LRFD combos ("lc_lrfd")
//   "lc_lrfd": "301-400",                                // factored combinations for the footing design (5B, chapter 06)
//   "drawings": true,                                    // optional: <report> - <foundation>.dxf / .svg (plan, section, pedestal
//                                                        //   section, footing bars); per foundation "baseplate": { "B", "L", "t" }
//                                                        //   (m, m, mm) and "bolts": { "n", "dia", "sx", "sz" } (mm) for the plan
//   "foundations": [ { "name": "PS-1.2 F1", "node": 1, "type": "pedestal",          // "pedestal" | "block"
//                      "Bf": 1.0, "Lf": 1.0, "Hf": 0.3, "Df": 0.9,                    // footing (m), Df = bottom below grade
//                      "Bp": 0.3, "Lp": 0.3, "pedGp": 0.3, "OffX": 0, "OffZ": 0,      // pedestal (m), Gp = top above grade
//                      "groutT": 25,                                                  // mm
//                      "autosize": { "from": 0.6, "to": 2.5, "step": 0.1 } } ]        // optional: smallest square Bf = Lf that passes
// }
// Project-specific inputs can live in a separate file: "extends": "<project>.json" is merged under this config (objects deep-merged,
// this file wins), and a foundation "preset": "<name>" takes its fields from "presets": { "<name>": { ... } } (the foundation wins).
// "Dp" (pedestal height below grade) locks the embedment: Df = Dp + Hf, so changing the footing thickness keeps Dp.
// Units of the .ANL reaction table must be KN / METER (put UNIT METER KN before PRINT SUPPORT REACTION).
// ==========================================================================
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildFoundationDrawing, toDXF, toSVG } from './foundation-drawing.mjs';
import {
  foundationSizing, evaluateFoundationCombo, evaluateBiaxialFooting, biaxialSoilPressure, combineFootingChecks,
  pedestalOffsetMoments, meyerhofEffectiveArea, bearingCapacityCheck, signedSoilPressure, footingFlexureAxis, flexuralDesign,
  footingOneWayShear, oneWayShearCheck, footingPunchingShear, footingPunchingStress, footingPunchingCapacity, barLayout, searchPedestalBars, pedestalShearCheck, parseStaadLoads, primaryFactors, parseStaadReactions, reactionToFoundationLoad, parseCaseList
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
  return { sizing: s, dW: s.totalWeightKN, dh: s.deltaH, Wped: s.hasPed ? (s.Wp + s.Wg) * G : 0, Wsoil: s.Ws * G,
    Wfoot: (s.Wf + (s.hasPed ? 0 : s.Wg)) * G, Hp: s.hasPed ? s.Hp : 0 };
}

// Allowable bearing for a footing B × L (shorter side as the width): Tab 08 formula when criteria.soil is given (as
// allowableBearing() / allowableBearingAt(), js/tabs/bearing.js), else the given criteria.qa (cannot be recomputed).
export function allowableBearingFor(crit, B, L, Df, temporary = false) {
  const s = crit.soil;
  if (!s) return { qa: temporary ? crit.qaTemp ?? crit.qa : crit.qa, recomputed: false };
  const FS = temporary ? s.FSTemp ?? s.FS ?? 3 : s.FS ?? 3;
  const Bs = Math.min(B, L), Ls = Math.max(B, L);
  if (!(Bs > 0)) return { qa: null, recomputed: true };
  const r = bearingCapacityCheck({ c: s.c, phiDeg: s.phi, gamma: s.gamma ?? crit.gs, shape: Math.abs(Bs - Ls) < 1e-9 ? 'square' : 'rectangular',
    B: Bs, L: Ls, Df: s.Df ?? Df, method: s.method || 'meyerhof', FS, failure: s.failure || 'general', beta: s.beta ?? 0 });
  return { qa: r.qa, qu: r.qu, FS, methodNote: r.methodNote, recomputed: true };
}

// One foundation over the listed combinations. loads = parseStaadLoads(std), reac = parseStaadReactions(anl).reactions.
export function evaluateStaadFoundation(f, crit, loads, reac, lcList, deadCase) {
  const w = footingWeights(f, crit);
  const B = f.Bf, L = f.Lf, Ap = (f.type === 'block' ? 0 : (f.Bp || 0) * (f.Lp || 0));
  const OffX = f.type === 'block' ? 0 : (f.OffX || 0), OffZ = f.type === 'block' ? 0 : (f.OffZ || 0);
  const eSel = eccRatio(crit.ecc ?? '1/6'), eccLimit = eSel > 0, eccRatioAllow = eccLimit ? eSel : 1 / 6;
  const qa0 = allowableBearingFor(crit, B, L, f.Df), qaT0 = allowableBearingFor(crit, B, L, f.Df, true);
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
    const qa = (temporary ? qaT0 : qa0).qa;
    const uni = evaluateFoundationCombo(B, L, P, H, M, qa, crit.mu, eccRatioAllow, fsSlideMin, fsOTMin);
    const bi = evaluateBiaxialFooting(B, L, P, Mx, Mz, eccRatioAllow, fsOTMin);
    const bp = P > 0 ? biaxialSoilPressure(B, L, P, Mz / P, Mx / P) : { valid: false, qmax: Infinity, qmin: 0, contactRatio: 0, note: 'P ≤ 0' };
    // bearing beyond the kern: rigid footing (no tension) or Meyerhof effective area with q'a for B' × L' (as calcFoundation())
    let qBear = bp.qmax, qaBear = qa, meyUsed = false, mey = null;
    if (bearMey && P > 0 && !(bp.valid && bp.fullContact)) {
      mey = meyerhofEffectiveArea(B, L, P, Mz / P, Mx / P);
      if (mey.valid) { qBear = mey.qeff; qaBear = allowableBearingFor(crit, mey.Beff, mey.Leff, f.Df, temporary).qa ?? 0; meyUsed = true; }
      else qBear = Infinity;
    }
    const ucBearingBiaxial = Number.isFinite(qBear) && qaBear > 0 ? qBear / qaBear : Infinity;
    let comb = combineFootingChecks(uni, bi, { eccLimit, ucBearingBiaxial });
    // minimum contact area (project criterion): share of the base still pressed, rigid footing without tension (4A §4.2)
    if (crit.minContact > 0 && comb && comb.checks) {
      const ratio = bp.valid ? bp.contactRatio : 0;
      const checks = [...comb.checks, { name: `Contact area (min ${n(crit.minContact * 100, 0)} %)`, uc: ratio > 0 ? crit.minContact / ratio : Infinity }];
      const governingCheck = checks.reduce((a, b) => (b.uc > a.uc ? b : a));
      comb = { checks, governingCheck, governingUC: governingCheck.uc, overallPass: checks.every(c => c.uc <= 1.0) };
    }
    // statics of a rigid footing on soil that cannot pull (biaxialSoilPressure): none = full contact (inside the kern),
    // partial = part of the base lifts off (outside the kern), net = P ≤ 0 (whole footing pulled up),
    // separation = P > 0 but the resultant at / outside the base edge (no equilibrium -> overturns)
    const uplift = !(P > 0) ? 'net' : !bp.valid ? 'separation' : bp.fullContact ? 'none' : 'partial';
    rows.push({ lc, uplift, eccRatioAllowUsed: eccRatioAllow, title: loads.combos[lc]?.title || loads.primary[lc]?.title || '', temporary, kD, top, P, H, Mx, Mz, M,
      fsSlideMin, fsOTMin, bp, qBear, qaBear, meyUsed, mey, ...uni, ...bi, ...comb, valid: uni.valid, note: uni.note });
  }
  const gov = rows.length ? rows.reduce((a, b) => ((b.governingUC ?? Infinity) > (a.governingUC ?? Infinity) ? b : a)) : null;
  const upl = { partial: rows.filter(x => x.uplift === 'partial'), net: rows.filter(x => x.uplift === 'net'),
    sep: rows.filter(x => x.uplift === 'separation') };
  upl.minContact = rows.filter(x => x.uplift !== 'net').reduce((m, x) => Math.min(m, x.bp.contactRatio ?? 1), 1);
  upl.worst = upl.net[0] || upl.partial.reduce((a, b) => ((b.bp.contactRatio ?? 1) < (a?.bp.contactRatio ?? 2) ? b : a), null);
  return { f, w, B, L, qa0, qaT0, bearMey, upl, eccLimit, eccRatioAllow, dead, rows, missing, gov, pass: !!gov && gov.valid && gov.overallPass && !missing.length };
}

const n = (v, d = 2) => (v === undefined || v === null || Number.isNaN(v) ? '-' : (!Number.isFinite(v) ? '∞' : v.toFixed(d)));

function upliftText(u) {
  if (u.net.length) return `NET UPLIFT P ≤ 0 (${u.net.length} L/C, e.g. ${u.net[0].lc})`;
  if (u.sep.length) return `base separation, resultant outside the base (${u.sep.length} L/C, e.g. ${u.sep[0].lc})`;
  if (u.partial.length) return `Partial uplift in ${u.partial.length} L/C, min ${n(u.minContact * 100, 0)} % in contact (L/C ${u.worst.lc})`;
  return 'Full contact';
}

export function renderReport(cfg, results) {
  const c = cfg.criteria;
  const out = [`# Foundation stability from STAAD reactions${cfg.project ? ' — ' + cfg.project : ''}`, '',
    `Generated by tools/staad-stability.mjs (FAIR Foundation Design lib, same checks as 4A). Combinations: ${cfg.lc}.`, '',
    `Criteria: q_a = ${c.soil ? 'from soil (' + (c.soil.method || 'meyerhof') + ', c = ' + c.soil.c + ' kPa, φ = ' + c.soil.phi + '°, γ = ' + (c.soil.gamma ?? c.gs) + ' kN/m³, FS ' + (c.soil.FS ?? 3) + ' permanent / ' + (c.soil.FSTemp ?? c.soil.FS ?? 3) + ' temporary), per footing' : c.qa + ' kPa (given)'}, ` +
    `bearing beyond the kern: ${String(c.bearMethod || 'rigid').toLowerCase() === 'meyerhof' ? "Meyerhof effective area B' × L', q'a " + (c.soil ? 'recomputed for B′ × L′' : 'as given') : 'rigid footing, linear pressure, no tension'}, μ = ${c.mu}, e/B allowable ${eccRatio(c.ecc ?? '1/6') > 0 ? c.ecc ?? '1/6' : 'none (partial uplift accepted)'}, ` +
    `FS sliding ${c.fsSlidePerm} / ${c.fsSlideTemp ?? c.fsSlidePerm} (permanent / temporary), FS overturning ${c.fsOTPerm} / ${c.fsOTTemp ?? c.fsOTPerm}; ` +
    `γc = ${c.gc} kN/m³, γs = ${c.gs} kN/m³. Temporary = combination containing a STAAD LOADTYPE Wind or Seismic case.`, '',
    'Sign convention (FAIR): P downward +, Fx = −FX, Fz = −FZ of the STAAD reaction; Mz = +MZ, Mx = +MX (Mz > 0 compresses +x, ' +
    'Mx > 0 compresses −z). Moved to the underside of the footing: P + kD·ΔW, Mz + Fx·Δh, Mx − Fz·Δh (+ pedestal offset). ' +
    'Torsion MY is not part of the shallow-footing checks.', '',
    '## Summary', '', '| Foundation | Node | B × L × H (m) | ΔW (kN) | Δh (m) | q_a (kPa) | Governing L/C | Check | UC | Uplift (statics) | Footing design | Pedestal | Status |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const r of results) {
    const g = r.gov;
    const dz = r.design ? `${r.design.pass ? 'OK' : 'NOT OK'} — ${r.design.gov.name}, UC ${n(r.design.gov.uc, 3)}` : '-';
    out.push(`| ${r.f.name} | ${r.f.node} | ${n(r.B)} × ${n(r.L)} × ${n(r.w.sizing.Hf)} | ${n(r.w.dW, 2)} | ${n(r.w.dh, 3)} | ${n(r.qa0.qa, 1)} | ${g ? g.lc + ' ' + g.title : '-'} | ` +
      `${g ? (g.valid ? g.governingCheck.name : g.note) : 'no reactions'} | ${g ? n(g.governingUC, 3) : '-'} | ${upliftText(r.upl)} | ${dz} | ${pedText(r.pedestal)} | ${r.pass ? 'PASS' : 'FAIL'} |`);
  }
  for (const r of results) {
    const f = r.f, s = r.w.sizing;
    out.push('', `## ${f.name} (STAAD node ${f.node})${f.preset ? ' — preset ' + f.preset : ''}`, '',
      `Footing ${f.type === 'block' ? 'block' : 'with pedestal'}: B × L × H = ${n(f.Bf)} × ${n(f.Lf)} × ${n(f.Hf)} m, Df = ${n(f.Df)} m` +
      (f.type === 'block' ? '' : `, pedestal ${n(f.Bp)} × ${n(f.Lp)} m, top ${n(f.pedGp, 3)} m above grade, ${n(f.Df - f.Hf, 3)} m below grade${f.Dp !== undefined ? ' (locked)' : ''}, offset (${n(f.OffX || 0)}, ${n(f.OffZ || 0)}) m`) +
      `, grout ${f.groutT || 0} mm. Self-weight ΔW = ${n(r.w.dW)} kN (footing ${n(s.Wf * G)}, pedestal + grout ${n(r.w.Wped)}, ` +
      `backfill ${n(r.w.Wsoil)} kN), Δh = ${n(r.w.dh, 3)} m (top of pedestal to underside of footing). kD = factor of STAAD case ${r.dead}. ` +
      (r.qa0.recomputed ? `q_a = q_u/FS = ${n(r.qa0.qu, 1)}/${r.qa0.FS} = ${n(r.qa0.qa, 1)} kPa (permanent), ${n(r.qaT0.qu, 1)}/${r.qaT0.FS} = ${n(r.qaT0.qa, 1)} kPa (temporary) — ` +
        `${r.qa0.methodNote}, B × L = ${n(Math.min(r.B, r.L))} × ${n(Math.max(r.B, r.L))} m, Df = ${n(c.soil.Df ?? f.Df)} m.`
        : `q_a = ${n(r.qa0.qa, 1)} kPa (permanent), ${n(r.qaT0.qa, 1)} kPa (temporary), given.`));
    if (r.trials) out.push('', `Auto-size (square, ${f.autosize.from}–${f.autosize.to} m, step ${f.autosize.step} m): ` +
      (r.autosizeFailed ? `**no size in the range passes** — results shown for ${n(f.autosize.to)} m.` : `smallest passing size **${n(r.B)} × ${n(r.L)} m**.`), '',
      '| B = L (m) | Governing L/C | Check | UC | Status |', '|---|---|---|---|---|',
      ...r.trials.map(t => `| ${n(t.B)} | ${t.lc ?? '-'} | ${t.check} | ${n(t.uc, 3)} | ${t.pass ? 'PASS' : 'FAIL'} |`));
    out.push('', `Eccentricity and contact area (as 4A §4.2): ${upliftText(r.upl)}. Kern ratio 6e_x/B + 6e_z/L ≤ 1 → full contact; ` +
      `> 1 → partial uplift (rigid footing, soil without tension, biaxialSoilPressure()); ${c.minContact > 0 ? `minimum contact ${n(c.minContact * 100, 0)} % of the base (check, UC = ${c.minContact} / contact ratio); ` : ''}${r.eccLimit ? 'kern limit e/B = ' + n(r.eccRatioAllow, 3) + ' checked' : 'no eccentricity limit (project criterion), information only'}. ` +
      'Net uplift (P ≤ 0) or a resultant outside the base fails.');
    if (r.missing.length) out.push('', `**No reaction in the .ANL for L/C ${r.missing.join(', ')} — not checked (status FAIL until printed).**`);
    out.push('', '| L/C | Combination | T/P | kD | P (kN) | Hx (kN) | Hz (kN) | Mx (kN·m) | Mz (kN·m) | e_x (m) | e_z (m) | Kern ratio | Contact | q (kPa) | q_a (kPa) | FS slide (min) | FS OT (min) | UC | Governing | Status |',
      '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const x of r.rows) {
      if (!x.valid) { out.push(`| ${x.lc} | ${x.title} | ${x.temporary ? 'T' : 'P'} | ${n(x.kD, 3)} | ${n(x.P)} | ${n(x.top.Fx)} | ${n(x.top.Fz)} | ${n(x.Mx)} | ${n(x.Mz)} | - | - | - | ${x.uplift === 'net' ? 'Net uplift (P ≤ 0)' : 'Resultant outside the base'} | - | - | - | - | ∞ | ${x.note} | FAIL |`); continue; }
      const fsOT = Math.min(x.SF1 ?? Infinity, x.SF2 ?? Infinity);
      out.push(`| ${x.lc}${x === r.gov ? ' ◄' : ''} | ${x.title} | ${x.temporary ? 'T' : 'P'} | ${n(x.kD, 3)} | ${n(x.P)} | ${n(x.top.Fx)} | ${n(x.top.Fz)} | ${n(x.Mx)} | ${n(x.Mz)} | ` +
        `${n(x.ex, 3)} | ${n(x.ez, 3)} | ${n(x.ucKernBiaxial * x.eccRatioAllowUsed * 6, 3)} | ${x.uplift === 'none' ? 'Full contact' : `Partial uplift (${n((x.bp.contactRatio ?? 0) * 100, 0)} % in contact)`} | ` +
        `${n(x.qBear, 1)}${x.meyUsed ? ` (B' ${n(x.mey.Beff)} × L' ${n(x.mey.Leff)})` : ''} | ${n(x.qaBear, 1)} | ${n(x.fsSliding)} (${x.fsSlideMin}) | ${n(fsOT)} (${x.fsOTMin}) | ` +
        `${n(x.governingUC, 3)} | ${x.governingCheck.name} | ${x.overallPass ? 'PASS' : 'FAIL'} |`);
    }
  }
  out.push('', '## Summary per foundation (report format)');
  for (const r of results) out.push(...reportTables(r));
  for (const r of results) if (r.design) out.push(...designReport(r));
  for (const r of results) if (r.pedestal) out.push(...pedestalReport(r));
  return out.join('\n') + '\n';
}

// Summary in the format of the calculation report (concrete design + foundation stability, permanent / temporary).
function reportTables(r) {
  const o = [], f = r.f, s = r.w.sizing, D = r.design, P = r.pedestal, ok = (b) => (b ? 'Safe' : 'Not Safe');
  const fl = D && D.flex ? Object.fromEntries(D.flex.map(c => [c.key, c])) : {};
  const bars = (k) => (fl[k] && fl[k].required && fl[k].s ? `D${D.bar}-${fl[k].s}` : '-');
  o.push('', `### ${f.name} — summary (report format)`, '', '| Description | Value | Unit |', '|---|---|---|', '| **Footing** | | |',
    `| Width (x) | ${n(r.B)} | m |`, `| Length (z) | ${n(r.L)} | m |`, `| Thickness | ${n(s.Hf)} | m |`, `| Depth (FGL to bottom) | ${n(s.Df)} | m |`,
    `| Reinforcement bottom (x / z) | ${bars('x-bottom')} / ${bars('z-bottom')} | - |`,
    `| Reinforcement top (x / z) | ${bars('x-top')} / ${bars('z-top')} | - |`);
  if (P && P.pm && P.pm.found) o.push('| **Pedestal** | | |', `| Width | ${n(f.Bp)} | m |`, `| Length | ${n(f.Lp)} | m |`,
    `| Height (below + above grade) | ${n(s.Dp + (f.pedGp || 0))} | m |`, `| Flexural reinforcement | ${P.pm.n * 2} D${P.bar} | - |`,
    `| Stirrups | Ø${P.tie}-${P.tieS}${P.topTies ? ` + ${P.topTies.n} Ø${P.topTies.dia} within ${P.topTies.within} mm of top` : ''} | - |`);
  const rows = r.rows.filter(x => x.valid), grp = (tmp) => rows.filter(x => x.temporary === tmp);
  const line = (label, tmp, val, lim, good, unit = '') => {
    const g = grp(tmp);
    if (!g.length) return `| ${label} | N/A | - | - |`;
    const v = val(g), L = lim(g);
    return `| ${label} | ${n(v, 2)}${unit} | ${n(L, 2)}${unit} | ${ok(good(v, L))} |`;
  };
  const maxQ = (g) => Math.max(...g.map(x => x.qBear)), qaOf = (g) => Math.min(...g.map(x => x.qaBear));
  const bearUC = (g) => Math.max(...g.map(x => x.qBear / x.qaBear));
  const minOT = (g) => Math.min(...g.map(x => Math.min(x.SF1 ?? Infinity, x.SF2 ?? Infinity, x.fsOT ?? Infinity)));
  const minSl = (g) => Math.min(...g.map(x => x.fsSliding));
  const c = r.crit;
  o.push('', '| Parameter | Actual | Allowable / required | Remarks |', '|---|---|---|---|',
    line('Bearing pressure, permanent (kN/m²)', false, maxQ, qaOf, (v, L) => grp(false).length && bearUC(grp(false)) <= 1),
    line('Bearing pressure, temporary (kN/m²)', true, maxQ, qaOf, (v, L) => grp(true).length && bearUC(grp(true)) <= 1),
    line('Overturning SF, permanent', false, minOT, () => c.fsOTPerm, (v, L) => v >= L),
    line('Overturning SF, temporary', true, minOT, () => c.fsOTTemp ?? c.fsOTPerm, (v, L) => v >= L),
    line('Sliding SF, permanent', false, minSl, () => c.fsSlidePerm, (v, L) => v >= L),
    line('Sliding SF, temporary', true, minSl, () => c.fsSlideTemp ?? c.fsSlidePerm, (v, L) => v >= L));
  if (c.minContact > 0) o.push(`| Minimum contact area | ${n(r.upl.minContact * 100, 1)} % | ${n(c.minContact * 100, 0)} % | ${ok(r.upl.minContact >= c.minContact - 1e-9)} |`);
  if (r.upl.net.length || r.upl.sep.length) o.push(`| Net uplift / base separation | ${r.upl.net.length + r.upl.sep.length} L/C | 0 | Not Safe |`);
  o.push('', 'Bearing: q (rigid footing / Meyerhof effective area beyond the kern) against q_a of that combination; settlement is not part of this check.');
  if (r.drawing) o.push('', `![${f.name}](${encodeURI(r.drawing.svg)})`, '', `Drawing for the drafter: \`${r.drawing.dxf}\` (DXF R12, mm; layers CONCRETE, REBAR, DIM, TEXT, AXIS, HIDDEN, STEEL).`);
  return o;
}

function pedText(p) {
  if (!p) return '-';
  if (!p.pm || !p.pm.found) return `NOT OK — ${p.note || 'no bars found'}`;
  return `${p.pass ? 'OK' : 'NOT OK'} — ${p.pm.n * 2} D${p.bar}, ties D${p.tie} @ ${p.tieS}${p.topTies ? ` + ${p.topTies.n} at top` : ''}; ${p.gov.name} UC ${n(p.gov.uc, 3)}`;
}

function pedestalReport(r) {
  const P = r.pedestal, f = r.f, o = [];
  o.push('', `## ${f.name} — pedestal reinforcement (LRFD, as 5A + shear)`, '',
    `Pedestal ${n(P.Bp, 0)} × ${n(P.Lp, 0)} mm, height H_p = ${n(P.Hp, 3)} m (incl. grout), self-weight ${n(P.Wped, 2)} kN; bars D${P.bar}, ties ` +
    `D${P.tie} (${P.legs} legs), d′ = clear cover + tie + d_b/2 = ${n(P.dPrime, 0)} mm; f'c = ${P.fc} MPa, f_y = ${P.fy} MPa, f_yt = ${P.fyt} MPa. ` +
    `Critical section at the base: P_u = R_Y + kD·W_ped, M = M_top + H·H_p, M_u = √(M_x² + M_z²) on a symmetric 2-layer section ` +
    `(pmInteractionCurve, ACI 318M-19 §22.4), ρ ≥ ${P.rhoMin} and ≤ 0.08. Shear (§22.5.5.1, Table 22.5.5.1 Eq. c with N_u/(6A_g), ` +
    `λ_s; ties if V_u > φV_c, §22.5.8.5.3; minimum ties if V_u > 0.5φV_c, §10.6.2.1; tie spacing ≤ min(16d_b, 48d_tie, least ` +
    `dimension), §25.7.2.1), spacing rounded down to 25 mm.`);
  if (P.missing.length) o.push('', `**No reaction for L/C ${P.missing.join(', ')}.**`);
  if (!P.pm || !P.pm.found) { o.push('', `**${P.note}**`); return o; }
  const pm = P.pm, g = pm.perCombo.reduce((a, b) => (b.uc > a.uc ? b : a));
  o.push('', '| Check | L/C | Demand | Capacity | UC | Status |', '|---|---|---|---|---|---|',
    `| P-M, ${pm.n * 2} D${P.bar} (${pm.n} per face), ρ = ${n(pm.rho * 100, 2)} % | ${g.combo.lc} | P_u ${n(g.Pu, 1)} kN, M_u ${n(g.Mu, 2)} kN·m | ` +
    `φM_n ${n(g.phiMn, 2)} kN·m | ${n(pm.maxUC, 3)} | ${pm.maxUC <= 1 ? 'OK' : 'NOT OK'} |`);
  for (const s of P.shear) {
    const c = s.govUC.s;
    o.push(`| Shear ${s.axis} (b_w ${n(s.bw, 0)}, d ${n(c.d, 0)} mm) | ${s.govUC.x.lc} | V_u ${n(Math.abs(s.axis === 'x' ? s.govUC.x.top.Fx : s.govUC.x.top.Fz), 2)} kN | ` +
      `φV_n = φ(V_c + V_s) = ${n(c.phiVn / 1000, 1)} kN (φV_c ${n(c.phiVc / 1000, 1)} kN${c.needTies ? ', ties required' : ''}) | ${n(c.uc, 3)} | ${c.sectionOk && c.uc <= 1 ? 'OK' : 'NOT OK'} |`);
  }
  o.push(`| Bar clear spacing along the face | - | ${P.barSpacing.clear === null ? '-' : n(P.barSpacing.clear, 0) + ' mm'} | ≥ ${n(P.barSpacing.minClear, 0)} mm | - | ${P.barSpacing.ok ? 'OK' : 'NOT OK'} |`);
  if (P.topTies) {
    const T = P.topTies;
    o.push(`| Anchor bolts ${T.bolts} inside the ties | - | bolt edge ${n(T.reach, 0)} mm from centre | tie inner face ${n(T.tieIn, 0)} mm | - | ${T.enclosed ? 'OK' : 'NOT OK'} |`,
      `| Clear distance anchor bolt / longitudinal bar | - | ${n(T.clear, 0)} mm | ≥ ${n(T.minClear, 0)} mm | - | ${T.clearOk ? 'OK' : 'NOT OK'} |`);
  }
  const sx = P.shear.map(s => `${s.axis}: shear ${Number.isFinite(s.gov.s.sShear) ? n(s.gov.s.sShear, 0) : '—'}, minimum ${Number.isFinite(s.gov.s.sMin) ? n(s.gov.s.sMin, 0) : '—'}, detailing ${n(s.gov.s.sDetail, 0)} mm`).join('; ');
  if (r.pedTrials) o.push('', `Pedestal size steps (anchor bolts inside the ties and clear distance to the bars ≥ ${n(P.topTies.minClear, 0)} mm): ` +
    r.pedTrials.map(t => `${n(t.Bp * 1000, 0)} × ${n(t.Lp * 1000, 0)} → clear ${n(t.clear, 0)} mm${t.enclosed ? '' : ', bolts outside the ties'} ${t.ok ? 'OK' : 'NOT OK'}`).join('; ') + '.');
  if (P.topTies) o.push('', `Top ties (anchor bolts in the top of the pedestal, ACI 318M-19 §10.7.6.1.6): **${P.topTies.n} × Ø${P.topTies.dia} within ` +
    `${P.topTies.within} mm of the top**, enclosing the anchor bolts and the longitudinal bars (at least 2 × D13 or 3 × D10).`);
  o.push('', `Ties: D${P.tie} (${P.legs} legs) @ **${P.tieS} mm** (governing of ${sx}). Longitudinal: **${pm.n * 2} D${P.bar}** ` +
    `(A_st ${n(pm.Ast, 0)} mm²). Pedestal: **${P.pass ? 'OK' : 'NOT OK'}** — governing ${P.gov.name}, UC ${n(P.gov.uc, 3)}.`);
  return o;
}

function designReport(r) {
  const D = r.design, f = r.f, o = [];
  o.push('', `## ${f.name} — footing thickness and reinforcement (LRFD, as 5B / chapter 06)`, '',
    `Footing ${n(D.B)} × ${n(D.L)} m, H = ${n(D.t, 0)} mm, cover ${D.cc} mm, bars D${D.bar}: d = H − cover − d_b = ${n(D.d, 0)} mm (x-bars), ` +
    `${n(D.d - D.bar, 0)} mm (z-bars); f'c = ${D.fc} MPa, f_y = ${D.fy} MPa. Pedestal ${n(f.Bp)} × ${n(f.Lp)} m. Net design pressure q − w, ` +
    `w = kD × ${n(D.wUnit, 2)} kPa (footing + backfill). Rigid footing, linear pressure, no tension. ACI 318M-19: flexure at the pedestal ` +
    `faces §13.2.7.1, ${r.f && D.asMinRule === 'beam' ? 'A_s,min = max(0.0018·b·h, 1.4·b·d/f_y) (project criterion)' : `A_s,min = ρ_min·b·h (§13.3 → Table 8.6.1.1, ρ_min ${D.fy < 420 ? '0.0020' : n(Math.max(0.0018 * 420 / D.fy, 0.0014), 4)})`}, ` +
    `spacing rounded down to ${D.spacingStep} mm (written), bar count rounded up over the width between the covers (drawn, A_s,prov = n·A_bar), s ≤ min(3h, 450) mm, clear ≥ max(25 mm, d_b); one-way shear at d §22.5.5.1 ` +
    `(Eq. c, ρ_w of the bottom bars, λ_s); punching at d/2 §22.6 with the unbalanced moments at the pedestal base (§8.4.4.2).`);
  if (r.thTrials) o.push('', 'Thickness trials (each with its own stability auto-size, pedestal depth below grade locked):', '',
    '| H (m) | B = L (m) | Stability UC | Design governing | Design UC | Status |', '|---|---|---|---|---|---|',
    ...r.thTrials.map(t => `| ${n(t.Hf)} | ${n(t.B)} | ${n(t.stabUC, 3)} | ${t.desGov} | ${n(t.desUC, 3)} | ${t.pass ? 'PASS' : 'FAIL'} |`));
  if (D.missing.length) o.push('', `**No reaction for L/C ${D.missing.join(', ')} — not checked.**`);
  const inv = D.items.filter(it => it.invalid);
  if (inv.length) o.push('', `**No soil pressure: ${inv.map(it => it.lc + ' (' + it.invalid + ')').join('; ')}.**`);
  o.push('', '| Check | L/C | Demand | Capacity | UC | Status |', '|---|---|---|---|---|---|');
  o.push(`| Min. depth (§13.3.1.2) | - | d = ${n(D.d, 0)} mm | 150 mm | ${n(150 / D.d, 3)} | ${D.d >= 150 ? 'OK' : 'NOT OK'} |`);
  for (const w of D.oneway || []) {
    const c = w.chk;
    o.push(`| One-way shear, sections ⟂ ${w.axis} (b_w ${n(w.bw, 0)} mm, ρ_w ${n(w.rho * 100, 3)} %) | ${w.lc} | V_u = ${n(w.Vu, 1)} kN | ` +
      `φV_c = ${c.valid ? n(c.phiVc / 1000, 1) : '-'} kN | ${n(w.uc, 3)} | ${w.uc <= 1 ? 'OK' : 'NOT OK'} |`);
  }
  if (D.punch) o.push(D.punch.vu !== undefined
    ? `| Punching (${D.punch.loc}, b_o ${n(D.punch.bo * 1000, 0)} mm) | ${D.punch.lc} | v_u = ${n(D.punch.vu, 3)} MPa (V_u ${n(D.punch.Vu, 1)} kN) | ` +
      `φv_c = ${n(D.punch.cap.phiVc_stress, 3)} MPa | ${n(D.punch.uc, 3)} | ${D.punch.uc <= 1 ? 'OK' : 'NOT OK'} |`
    : `| Punching | - | ${D.punch.note} | - | - | - |`);
  o.push('', '| Reinforcement | L/C | M_u (kN·m) | b (mm) | d (mm) | A_s,req (mm²) | A_s,min (mm²) | Bars | A_s,prov (mm²) | Status |',
    '|---|---|---|---|---|---|---|---|---|---|');
  for (const c of D.flex || []) {
    if (!c.required) { o.push(`| ${c.key} | - | 0 (no hogging) | ${n(c.b, 0)} | ${n(c.dEff, 0)} | - | - | not required (detailing) | - | - |`); continue; }
    if (!c.des || !c.des.ok) { o.push(`| ${c.key} | ${c.lc} | ${n(c.Mu, 2)} | ${n(c.b, 0)} | ${n(c.dEff, 0)} | section too small | - | - | - | NOT OK |`); continue; }
    o.push(`| ${c.key} | ${c.lc} | ${n(c.Mu, 2)} | ${n(c.b, 0)} | ${n(c.dEff, 0)} | ${n(c.des.AsCalc, 0)} | ${n(c.des.AsMin, 0)} | ` +
      `${c.s ? `D${D.bar} @ ${n(c.s, 0)} (${c.n} bars)` : 'spacing < step'} | ${n(c.AsProv, 0)} | ${c.ok ? 'OK' : 'NOT OK'} |`);
  }
  o.push('', `Footing design: **${D.pass ? 'OK' : 'NOT OK'}** — governing ${D.gov.name}, UC ${n(D.gov.uc, 3)}.`);
  return o;
}

// ---------------- footing thickness and reinforcement (as 5B shallow: js/tabs/footingSoil.js, shear.js, rebar.js) ----------------
// LRFD loads at the underside of the footing (same statics as the stability check), no-tension pressure plane under each, net
// design pressure q − w with w = kD·(W_f/A_f + W_s/(A_f − A_p)). Flexure at the pedestal faces, one-way shear at d, punching at
// d/2 (edge / corner cut by the footing edges, unbalanced moments at the pedestal base). ACI 318M-19 §13.2.7, §22.5, §22.6.
export function footingDesignCheck(f, crit, loads, reac, lcList, deadCase) {
  const D = crit.design, w0 = footingWeights(f, crit);
  const B = f.Bf, L = f.Lf, t = f.Hf * 1000, cc = D.cover ?? 75, bar = D.bar ?? 13, fc = D.fc, fy = D.fy, lambda = D.lambda ?? 1;
  const hasPed = f.type !== 'block';
  const c1 = (hasPed ? f.Bp : (f.c1 ?? f.Bp)) || 0, c2 = (hasPed ? f.Lp : (f.c2 ?? f.Lp)) || 0;
  const ped = { x: hasPed ? f.OffX || 0 : 0, z: hasPed ? f.OffZ || 0 : 0, c1, c2 };
  const Af = B * L, Ap = hasPed ? c1 * c2 : 0;
  const wUnit = w0.Wfoot / Af + (Af - Ap > 1e-9 ? w0.Wsoil / (Af - Ap) : 0);
  const dead = deadCase ?? Math.min(...Object.entries(loads.primary).filter(([, p]) => /^dead$/i.test(p.type)).map(([n]) => +n));
  const d = t - cc - bar;                                       // mm, outer layer (x-bars); z-bars d − bar
  const out = { f, B, L, t, cc, bar, fc, fy, d, wUnit, asMinRule: D.asMin === 'beam' ? 'beam' : 'slab', spacingStep: D.spacingStep ?? 25,
    items: [], missing: [], checks: [], notes: [] };
  if (!(c1 > 0 && c2 > 0)) { out.notes.push('Pedestal / column size B_p × L_p must be > 0.'); out.pass = false; out.gov = { name: 'input', uc: Infinity }; return out; }
  for (const lc of lcList) {
    const r = reac[`${f.node}:${lc}`];
    if (!r) { out.missing.push(lc); continue; }
    const top = reactionToFoundationLoad(r), fac = primaryFactors(loads, lc), kD = fac[dead] || 0;
    const off = (ped.x || ped.z) ? pedestalOffsetMoments({ Ptop: top.P, kD, Wped: w0.Wped, Wsoil: w0.Wsoil, OffX: ped.x, OffZ: ped.z, Af, Ap }) : { dMx: 0, dMz: 0 };
    const Pu = top.P + kD * w0.dW, Mz = top.Mz + top.Fx * w0.dh + off.dMz, Mx = top.Mx - top.Fz * w0.dh + off.dMx;
    const it = { lc, title: loads.combos[lc]?.title || '', Pu, Mx, Mz, kD, w: kD * wUnit,
      Mzped: top.Mz + top.Fx * w0.Hp, Mxped: top.Mx - top.Fz * w0.Hp };          // at the pedestal base (punching)
    if (!(Pu > 0)) it.invalid = 'Net uplift (P_u ≤ 0) — no soil pressure.';
    else {
      const pl = signedSoilPressure(B, L, Pu, Mz / Pu, -Mx / Pu);
      if (!pl.valid) it.invalid = pl.note || 'Resultant outside the footing.'; else it.pl = pl;
    }
    out.items.push(it);
  }
  const ok = out.items.filter(it => !it.invalid);
  if (!ok.length) { out.notes.push('No soil pressure for any LRFD combination.'); out.pass = false; out.gov = { name: 'no soil pressure', uc: Infinity }; return out; }
  // flexure: x-sections (bars along x, width L, outer layer d), z-sections (bars along z, width B, inner layer d − bar)
  ok.forEach(it => {
    it.mx = footingFlexureAxis({ pl: it.pl, w: it.w, B, L, axis: 'x', ref: ped.x, half: c1 / 2 });
    it.mz = footingFlexureAxis({ pl: it.pl, w: it.w, B, L, axis: 'z', ref: ped.z, half: c2 / 2 });
  });
  const minClear = Math.max(25, bar), step = D.spacingStep ?? 25, rule = D.asMin === 'beam' ? 'beam' : 'slab';
  const CASES = [
    { key: 'x-bottom', get: it => it.mx.bottom, b: L * 1000, dEff: d, face: 'bottom' },
    { key: 'z-bottom', get: it => it.mz.bottom, b: B * 1000, dEff: d - bar, face: 'bottom' },
    { key: 'x-top', get: it => it.mx.top, b: L * 1000, dEff: d, face: 'top' },
    { key: 'z-top', get: it => it.mz.top, b: B * 1000, dEff: d - bar, face: 'top' }
  ].map(c => {
    const gov = ok.reduce((a, b2) => (c.get(b2) > c.get(a) ? b2 : a));
    const Mu = c.get(gov), required = c.face === 'bottom' || Mu > 1e-6;   // top steel only where a combination gives hogging
    const des = required ? flexuralDesign(Mu, c.b, c.dEff, t, fc, fy, rule) : null;
    // spacing in `step` mm steps, rounded down, ≤ min(3t, 450) (barLayout(), as the app's 5B)
    const lay = des && des.ok ? barLayout(des.As, c.b, bar, t, step, cc) : null;   // count rounded up over b − 2·cover, nominal s
    const n = lay && lay.valid ? lay.n : null, s = lay && lay.valid ? lay.s : null;
    return { ...c, lc: gov.lc, Mu, required, des, n, s, sAct: lay && lay.valid ? lay.sAct : null, AsProv: lay && lay.valid ? lay.AsProv : 0,
      ok: !required || (!!des && des.ok && !!lay && lay.valid && s - bar >= minClear - 1e-9) };
  });
  out.flex = CASES;
  // one-way shear, detailed Eq. 22.5.5.1(c) (no Av,min in a footing): ρw from the bottom bars of that direction
  out.oneway = ['x', 'z'].map(ax => {
    const per = ok.map(it => ({ it, r: footingOneWayShear({ pl: it.pl, w: it.w, B, L, axis: ax, ref: ax === 'x' ? ped.x : ped.z,
      half: (ax === 'x' ? c1 : c2) / 2, d: d / 1000 }) }));
    const g = per.reduce((a, b2) => (b2.r.Vu > a.r.Vu ? b2 : a));
    const fl = CASES.find(c => c.key === `${ax}-bottom`), bw = (ax === 'x' ? L : B) * 1000;
    const rho = fl.AsProv > 0 ? fl.AsProv / (bw * d) : 0.0018;
    const chk = oneWayShearCheck({ bw, h: t, cc, Dbar: bar, fc, vu: g.r.Vu, rho, lambda, method: 'detailed', avOk: false });
    return { axis: ax, lc: g.it.lc, Vu: g.r.Vu, bw, rho, chk, uc: chk.valid ? chk.uc : Infinity };
  });
  // punching with the unbalanced moments at the pedestal base; governing = largest combined stress
  const pp = ok.map(it => {
    const res = footingPunchingShear({ pl: it.pl, w: it.w, B, L, cx: ped.x, cz: ped.z, c1, c2, d: d / 1000 });
    const st = res.valid ? footingPunchingStress({ sec: res.sec, Vu: res.Vu, Mx: it.Mxped, Mz: it.Mzped }) : null;
    return { it, res, st };
  });
  const pv = pp.filter(p => p.res.valid);
  if (pv.length) {
    const g = pv.reduce((a, b2) => (b2.st.vu > a.st.vu ? b2 : a)), cap = footingPunchingCapacity({ sec: g.res.sec, fc, lambda });
    out.punch = { lc: g.it.lc, Vu: g.res.Vu, vu: g.st.vu, loc: g.res.sec.loc, bo: g.res.sec.bo, cap, uc: g.st.vu / cap.phiVc_stress };
  } else out.punch = { note: pp[0] ? pp[0].res.note : 'not evaluated', uc: 0 };   // section spans the footing -> one-way governs
  out.checks = [
    { name: 'Min. depth d ≥ 150 mm (§13.3.1.2)', uc: 150 / Math.max(d, 1e-9) },
    ...out.oneway.map(o => ({ name: `One-way shear ${o.axis} (§22.5.5)`, uc: o.uc })),
    { name: 'Punching shear (§22.6)', uc: out.punch.uc },
    ...CASES.filter(c => c.required).map(c => ({ name: `Flexure ${c.key}`, uc: c.ok ? (c.des.AsCalc / c.AsProv) : Infinity }))
  ];
  out.gov = out.checks.reduce((a, b2) => (b2.uc > a.uc ? b2 : a));
  out.pass = out.checks.every(c => c.uc <= 1.0) && !out.missing.length && !out.items.some(it => it.invalid);
  return out;
}

// ---------------- pedestal: longitudinal bars (P-M, as 5A) and shear with ties (ACI 318M-19 §22.5) ----------------
// LRFD actions at the BASE of the pedestal (critical section, as 5A): P = R_Y + kD·W_ped (concrete + grout), M = M_top + H·H_p
// (both axes, resultant Mu for the 2-layer P-M design as searchPedestalBars()). Shear per direction: V = |F_x| (section depth
// B_p, width L_p) and |F_z| (depth L_p, width B_p), axial N_u = P at the top (less compression -> lower V_c, conservative).
export function pedestalDesignCheck(f, crit, loads, reac, lcList, deadCase) {
  const P0 = crit.pedestal || {}, D = crit.design || {};
  const fc = P0.fc ?? D.fc, fy = P0.fy ?? D.fy, bar = P0.bar ?? 16, tie = P0.tie ?? 10, legs = P0.legs ?? 2;
  const fyt = P0.fyt ?? fy, rhoMin = P0.rhoMin ?? 0.01, step = P0.spacingStep ?? D.spacingStep ?? 25, lambda = P0.lambda ?? D.lambda ?? 1;
  const dPrime = (P0.clearCover ?? 50) + tie + bar / 2;                     // mm, cover to the bar centre
  const Bp = f.Bp * 1000, Lp = f.Lp * 1000, w0 = footingWeights(f, crit);
  const dead = deadCase ?? Math.min(...Object.entries(loads.primary).filter(([, p]) => /^dead$/i.test(p.type)).map(([n]) => +n));
  const out = { f, Bp, Lp, dPrime, bar, tie, legs, fc, fy, fyt, rhoMin, Hp: w0.Hp, Wped: w0.Wped, rows: [], missing: [] };
  for (const lc of lcList) {
    const r = reac[`${f.node}:${lc}`];
    if (!r) { out.missing.push(lc); continue; }
    const top = reactionToFoundationLoad(r), kD = primaryFactors(loads, lc)[dead] || 0;
    const Pu = top.P + kD * w0.Wped, Mx = top.Mx - top.Fz * w0.Hp, Mz = top.Mz + top.Fx * w0.Hp;
    out.rows.push({ lc, title: loads.combos[lc]?.title || '', Pu, Mx, Mz, Mu: Math.hypot(Mx, Mz), top });
  }
  if (!out.rows.length) { out.pass = false; out.note = 'No reactions.'; return out; }
  const pm = searchPedestalBars(Bp, Lp, dPrime, fc, fy, bar, out.rows.map(x => ({ combo: x, Ptop: x.Pu, Mtop: x.Mu })), 25, rhoMin);
  out.pm = pm;
  if (!pm.found) { out.pass = false; out.note = pm.reason; return out; }
  const sFace = pm.n > 1 ? (Lp - 2 * dPrime) / (pm.n - 1) : null, minClear = Math.max(1.5 * bar, 40);
  out.barSpacing = { s: sFace, clear: sFace === null ? null : sFace - bar, minClear, ok: sFace === null || sFace - bar >= minClear - 1e-9 };
  // shear per direction and combination; governing tie spacing over all of them
  out.shear = ['x', 'z'].map(ax => {
    const bw = ax === 'x' ? Lp : Bp, h = ax === 'x' ? Bp : Lp;
    const per = out.rows.map(x => ({ x, s: pedestalShearCheck({ bw, h, dPrime, fc, AsLayer: pm.AsLayer, Nu: x.top.P, Vu: ax === 'x' ? x.top.Fx : x.top.Fz,
      lambda, tieDia: tie, legs, fyt, barDia: bar }) }));
    const g = per.reduce((a, b) => (b.s.sReq < a.s.sReq || (b.s.sReq === a.s.sReq && b.s.ucConcrete > a.s.ucConcrete) ? b : a));
    const gUC = per.reduce((a, b) => (b.s.uc > a.s.uc ? b : a));
    return { axis: ax, bw, h, gov: g, govUC: gUC, sReq: g.s.sReq };
  });
  const sReq = Math.min(...out.shear.map(s => s.sReq));
  out.tieS = Math.floor(sReq / step + 1e-9) * step;                          // ties at a spacing rounded down to `step`
  // anchor bolts in the top of the pedestal (ACI 318M-19 §10.7.6.1.6): ties enclosing the bolts and >= 4 longitudinal bars,
  // within 125 mm of the top, at least 2 × D13 or 3 × D10 (D13 and larger: 2, smaller: 3). Bolt positions from f.bolts (mm).
  const bo = f.bolts;
  if (bo) {
    const nTop = tie >= 13 ? 2 : 3;
    const tieIn = (Math.min(Bp, Lp) / 2) - (P0.clearCover ?? 50) - tie;            // inner face of the ties from the centre
    const bolts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].slice(0, bo.n || 4).map(([a, b]) => [a * bo.sx / 2, b * bo.sz / 2]);
    const bars = [];
    for (const xs of [-Bp / 2 + dPrime, Bp / 2 - dPrime]) for (let i = 0; i < pm.n; i++) bars.push([xs, pm.n > 1 ? -Lp / 2 + dPrime + i * (Lp - 2 * dPrime) / (pm.n - 1) : 0]);
    const reach = Math.max(...bolts.map(([x, z]) => Math.max(Math.abs(x), Math.abs(z)) + bo.dia / 2));
    const clear = Math.min(...bolts.flatMap(([x, z]) => bars.map(([u, v]) => Math.hypot(x - u, z - v) - (bo.dia + bar) / 2)));
    const minClear = P0.boltBarClearMin ?? Math.max(25, bar, bo.dia);            // clear bar / bolt: default as §25.2.1, project option
    out.topTies = { n: nTop, dia: tie, within: 125, enclosed: reach <= tieIn + 1e-9, reach, tieIn, clear, minClear,
      clearOk: clear >= minClear - 1e-9, bolts: `${bo.n || 4}-M${bo.dia} @ ${bo.sx} × ${bo.sz}` };
  }
  out.checks = [
    { name: 'P-M (5A, resultant moment)', uc: pm.maxUC },
    ...out.shear.map(s => ({ name: `Shear ${s.axis} (§22.5)`, uc: s.govUC.s.sectionOk ? s.govUC.s.uc : Infinity })),
    { name: 'Bar clear spacing (§25.2.3)', uc: out.barSpacing.ok ? 0 : Infinity },
    { name: `Tie spacing ≥ ${step} mm`, uc: out.tieS >= step ? 0 : Infinity },
    ...(out.topTies ? [{ name: 'Anchor bolts inside the ties (§10.7.6.1.6)', uc: out.topTies.enclosed ? 0 : Infinity },
      { name: 'Clear distance anchor bolt / bar', uc: out.topTies.clearOk ? 0 : Infinity }] : [])
  ];
  out.gov = out.checks.reduce((a, b) => (b.uc > a.uc ? b : a));
  out.pass = out.checks.every(c => c.uc <= 1) && !out.missing.length;
  return out;
}

// Smallest square footing (Bf = Lf, from..to by step) that passes every check; the trials are kept for the report.
export function autosizeFoundation(f, crit, loads, reac, lcList, deadCase) {
  const a = f.autosize, trials = [];
  for (let B = a.from; B <= a.to + 1e-9; B = Math.round((B + a.step) * 1000) / 1000) {
    const r = evaluateStaadFoundation({ ...f, Bf: B, Lf: B }, crit, loads, reac, lcList, deadCase);
    trials.push({ B, uc: r.gov ? r.gov.governingUC : Infinity, check: r.gov ? (r.gov.valid ? r.gov.governingCheck.name : r.gov.note) : '-', lc: r.gov?.lc, pass: r.pass });
    if (r.pass) return { ...r, trials };
  }
  const last = evaluateStaadFoundation({ ...f, Bf: a.to, Lf: a.to }, crit, loads, reac, lcList, deadCase);
  return { ...last, trials, autosizeFailed: true };
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
export function deepMerge(base, over) {
  const out = { ...base };
  for (const [k, v] of Object.entries(over || {})) out[k] = isObj(v) && isObj(base?.[k]) ? deepMerge(base[k], v) : v;
  return out;
}
// Config with "extends" (chain allowed, paths relative to the file that names them) and foundation presets resolved.
export function loadConfig(cfgPath, depth = 0) {
  if (depth > 10) throw new Error('extends: chain too deep');
  const p = path.resolve(cfgPath);
  let cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (cfg.extends) {
    const baseP = path.resolve(path.dirname(p), cfg.extends);
    const base = loadConfig(baseP, depth + 1);
    // relative std / anl in the base file are relative to the base file
    for (const k of ['std', 'anl']) if (base[k] && !path.isAbsolute(base[k])) base[k] = path.resolve(path.dirname(baseP), base[k]);
    cfg = deepMerge(base, cfg);
  }
  if (depth === 0 && Array.isArray(cfg.foundations)) cfg.foundations = cfg.foundations.map(resolveFoundation(cfg));
  return cfg;
}
export const resolveFoundation = (cfg) => (f) => {
  let g = f;
  if (f.preset) {
    const pr = cfg.presets?.[f.preset];
    if (!pr) throw new Error(`${f.name}: preset "${f.preset}" not found`);
    g = { ...pr, ...f };
  }
  if (g.Dp !== undefined && g.Dp !== null) g = { ...g, Df: g.Dp + g.Hf };   // pedestal below grade locked
  return g;
};

const safeName = (s) => String(s).replace(/[\\/:*?"<>|]+/g, '-').trim();

export function runConfig(cfgPath, outP = null) {
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
    const lcs = f.lc ? parseCaseList(f.lc) : lcList, dc = f.dead_case ?? cfg.dead_case;
    const crit = cfg.criteria;
    const stab = (g) => (g.autosize ? autosizeFoundation(g, crit, loads, reac, lcs, dc) : evaluateStaadFoundation(g, crit, loads, reac, lcs, dc));
    if (!(crit.design && cfg.lc_lrfd)) return stab(f);
    const lcU = parseCaseList(f.lc_lrfd || cfg.lc_lrfd), at = crit.design.autoThickness;
    // whole foundation for one pedestal size: stability (+ auto-size), footing design (+ thickness steps), pedestal
    const evalAll = (f0) => {
    const thTrials = [];
    let g = f0, r, des;
    for (;;) {
      r = stab(g);
      des = footingDesignCheck({ ...g, Bf: r.B, Lf: r.L }, crit, loads, reac, lcU, dc);
      thTrials.push({ Hf: g.Hf, B: r.B, stabUC: r.gov ? r.gov.governingUC : Infinity, stabPass: r.pass, desUC: des.gov.uc, desGov: des.gov.name, pass: r.pass && des.pass });
      if ((r.pass && des.pass) || !at) break;
      const Hn = Math.round((g.Hf + (at.step ?? 0.05)) * 1000) / 1000;
      if (Hn > (at.to ?? 1.0) + 1e-9) break;
      g = resolveFoundation(cfg)({ ...g, Hf: Hn, Df: g.Dp != null ? undefined : g.Df });
    }
    const ped = crit.pedestal && g.type !== 'block' ? pedestalDesignCheck({ ...g, Bf: r.B, Lf: r.L }, crit, loads, reac, lcU, dc) : null;
    return { ...r, design: des, pedestal: ped, thTrials: at ? thTrials : null, pass: r.pass && des.pass && (!ped || ped.pass) };
    };
    // pedestal size steps (project option pedestal.autoSize { step, to }, m): enlarge Bp = Lp while the anchor bolts are not inside
    // the ties or their clear distance to the bars is below the limit; every size re-runs the whole foundation
    const pa = crit.pedestal && crit.pedestal.autoSize;
    let fc = f, res = evalAll(fc);
    const pedTrials = [];
    const bad = (x) => x.pedestal && x.pedestal.topTies && !(x.pedestal.topTies.enclosed && x.pedestal.topTies.clearOk);
    for (;;) {
      if (res.pedestal && res.pedestal.topTies) pedTrials.push({ Bp: fc.Bp, Lp: fc.Lp, clear: res.pedestal.topTies.clear, enclosed: res.pedestal.topTies.enclosed, ok: !bad(res) });
      if (!pa || !bad(res)) break;
      const Bn = Math.round((fc.Bp + (pa.step ?? 0.05)) * 1000) / 1000, Ln = Math.round((fc.Lp + (pa.step ?? 0.05)) * 1000) / 1000;
      if (Bn > (pa.to ?? 0.8) + 1e-9) break;
      fc = { ...fc, Bp: Bn, Lp: Ln };
      res = evalAll(fc);
    }
    return { ...res, pedTrials: pa && pedTrials.length > 1 ? pedTrials : null };
  });
  results.forEach(r => { r.crit = cfg.criteria; });
  if (cfg.drawings && outP) results.forEach(r => {
    const base = outP.replace(/\.md$/i, '') + ' - ' + safeName(r.f.name);
    const E = buildFoundationDrawing(r);
    fs.writeFileSync(base + '.dxf', toDXF(E, r.f.name), 'latin1');
    fs.writeFileSync(base + '.svg', toSVG(E, r.f.name), 'utf8');
    r.drawing = { dxf: path.basename(base + '.dxf'), svg: path.basename(base + '.svg') };
  });
  return { cfg, results, md: renderReport(cfg, results) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (!args[0]) { console.error('Usage: node tools/staad-stability.mjs <config.json> [--out <report.md>]'); process.exit(2); }
  const oi = args.indexOf('--out');
  const outP = oi >= 0 ? args[oi + 1] : args[0].replace(/\.json$/i, '') + ' - Stability.md';
  const { results, md } = runConfig(args[0], outP);
  fs.writeFileSync(outP, md, 'utf8');
  for (const r of results) {
    const g = r.gov;
    console.log(`${r.f.name}: ${r.pass ? 'PASS' : 'FAIL'}` + (g ? ` — L/C ${g.lc}, ${g.valid ? g.governingCheck.name : g.note}, UC ${n(g.governingUC, 3)}` : ' — no reactions') +
      ` — uplift: ${upliftText(r.upl)}` + (r.pedestal ? ` — pedestal: ${pedText(r.pedestal)}` : '') + (r.design ? ` — footing ${n(r.B)} × ${n(r.L)} × ${n(r.w.sizing.Hf)} m: ${r.design.pass ? 'OK' : 'NOT OK'} (${r.design.gov.name}, UC ${n(r.design.gov.uc, 3)})` : '') + (r.missing.length ? ` (missing L/C ${r.missing.join(',')})` : ''));
  }
  console.log(`Report: ${outP}`);
  process.exit(results.every(r => r.pass) ? 0 : 1);
}
