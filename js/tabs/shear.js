// Pile cap / shallow footing one-way and punching shear (tab 5B, report chapter 06, sections 6.1 and 6.2).
// Moved from app.js — function/const declarations only; event wiring stays in app.js.
import { eccentricPunchingStress, evaluatePileGroupCombo, footingOneWayShear, footingOneWayShearPoints, footingPunchingCapacity, footingPunchingPoint, footingPunchingShear, footingPunchingStress, oneWayPileShear, oneWayShearCheck, punchingPileShear, stdComboVector, twoWayShearCheck, pilePunchingCheck } from '../../lib/foundation/index.js?v=20261028c4';
import { escapeHtml, getRadioVal, num } from '../core/dom.js?v=20261028c4';
import { fmt } from '../core/format.js?v=20261028c4';
import { lastResults, pileList } from '../core/state.js?v=20261028c4';
import { chapterHeader, comboLabel, efficiencyBadge, introPara, numberTables, sectionHeader } from '../core/worksheet.js?v=20261028c4';
import { pileComboLoads } from '../tabs/pile.js?v=20261028c4';
import { buildPedestalComboBase } from '../tabs/combos.js?v=20261028c4';
import { renderShearFocus } from '../tabs/shearFocus.js?v=20261028c4';
import { footingLrfdActions, isShallow, renderCh6Limits, soilPressureHtml } from '../tabs/footingSoil.js?v=20261028c4';

// Geometry shared by the 5B Focus Canvas pictures (js/tabs/shearFocus.js): footing (m), pedestal centre / size (m), section depth.
// Values only — read from the same fields the checks use; nothing here feeds a calculation.
function vizBase({ h, cc, Dbar, d }, pt = null) {
  const hasPed = getRadioVal('fs-type') === 'pedestal';
  // pt = the governing load point when several are on the pile cap (Tab 02 "Load points"): the pictures show that point.
  return { B: num('fs-Bf'), L: num('fs-Lf'), H: h / 1000, cc: cc / 1000, db: Dbar / 1000, d: d / 1000, shallow: isShallow(),
    ped: pt ? { x: pt.x, z: pt.y, c1: pt.c1, c2: pt.c2, hasPed: true }
      : { x: hasPed ? num('fs-OffX') : 0, z: hasPed ? num('fs-OffZ') : 0, c1: num('rb-Bp') / 1000, c2: num('rb-Lp') / 1000, hasPed } };
}
const vizPlane = (it) => (it && it.pl ? { a: it.pl.a, b: it.pl.b, c: it.pl.c, qmax: it.pl.qmax } : null);

// The automatic V_u source follows the foundation type (a project file may carry the other one): piles <-> soil.
const autoSrc = (src) => (src === 'manual' ? src : (isShallow() ? 'soil' : 'piles'));

// ----- V_u from the soil pressure of the factored (LRFD) combinations — 5B shallow footing -----
// Net pressure (soil pressure minus factored footing + backfill weight) beyond the critical section, from
// footingLrfdActions() (js/tabs/footingSoil.js) and the lib section integrals (lib/foundation/shared/footingDesign.js).
function oneWayVuFromSoil({ axis, h, cc, Dbar }) {
  const fa = footingLrfdActions();
  if (!fa.valid) return fa;
  const d = (h - cc - Dbar) / 1000;
  if (!(d > 0)) return { valid: false, note: 'Effective depth d must be greater than zero.' };
  const ax = axis === 'x' ? 'x' : 'z';
  if (fa.points) { // several load points: sections at d from the faces of every point, the other points netted; the largest V_u governs
    const perP = fa.items.map(it => ({ combo: it.combo, it, invalid: it.invalid,
      res: it.invalid ? null : footingOneWayShearPoints({ pl: it.pl, w: it.w, B: fa.B, L: fa.L, axis: ax, pointLoads: it.pointLoads, d }) }));
    const govP = governingOf(perP);
    if (!govP) return { valid: false, note: 'No soil pressure for any combination (net uplift or resultant outside the footing).' };
    const pt = fa.points[govP.res.point - 1];
    return { valid: true, soil: true, kind: 'one-way', axis, d, half: (ax === 'x' ? pt.c1 : pt.c2) / 2, center: ax === 'x' ? pt.x : pt.y, per: perP, gov: govP,
      Vu: govP.res.Vu, invalid: perP.filter(p => p.invalid), fa, point: { ...pt, index: govP.res.point }, nPoints: fa.points.length };
  }
  const half = (ax === 'x' ? fa.ped.c1 : fa.ped.c2) / 2, center = ax === 'x' ? fa.ped.x : fa.ped.z;
  const per = fa.items.map(it => ({ combo: it.combo, it, invalid: it.invalid,
    res: it.invalid ? null : footingOneWayShear({ pl: it.pl, w: it.w, B: fa.B, L: fa.L, axis: ax, ref: center, half, d }) }));
  const gov = governingOf(per);
  if (!gov) return { valid: false, note: 'No soil pressure for any combination (net uplift or resultant outside the footing).' };
  return { valid: true, soil: true, kind: 'one-way', axis, d, half, center, per, gov, Vu: gov.res.Vu, invalid: per.filter(p => p.invalid), fa };
}
// Punching V_u per LRFD combination from the soil pressure outside the d/2 perimeter, with that combination's unbalanced moments
// at the base of the pedestal (Section 03 table 3.3.4) — governing = largest combined stress, as for the pile cap.
function punchingVuFromSoil({ c1, c2, h, cc, Dbar, loc }) {
  const fa = footingLrfdActions();
  if (!fa.valid) return fa;
  const d = (h - cc - Dbar) / 1000;
  if (!(d > 0)) return { valid: false, note: 'Effective depth d must be greater than zero.' };
  const pedBase = buildPedestalComboBase();
  if (fa.points) { // several load points: punching at every point (the loads inside its section, the net pressure inside it), worst governs
    let best = null, spanning = 0;
    fa.points.forEach((pt, j) => {
      const perJ = fa.items.map(it => {
        const res = it.invalid ? null : footingPunchingPoint({ pl: it.pl, w: it.w, B: fa.B, L: fa.L, pointLoads: it.pointLoads, j, d });
        const v = stdComboVector(it.combo.f, pedBase);
        const Mx = pt.f * (v.Mx + v.dMx), Mz = pt.f * (v.Mz + v.dMz); // this point's share of the moments at the base of the pedestal
        const ecc = res && res.valid ? footingPunchingStress({ sec: res.sec, Vu: res.Vu, Mx, Mz }) : null;
        return { combo: it.combo, it, invalid: it.invalid || (res && !res.valid ? res.note : null), res, Mx, Mz, ecc };
      });
      const ok = perJ.filter(p => p.res && p.res.valid);
      if (!ok.length) { if (perJ.some(p => p.res && p.res.sec && p.res.sec.free)) spanning++; return; }
      const key = (p) => (p.ecc && p.ecc.valid ? p.ecc.vu : p.res.Vu);
      const gov = ok.reduce((a, b) => (key(b) > key(a) ? b : a));
      if (!best || key(gov) > best.key) best = { key: key(gov), per: perJ, gov, pt: { ...pt, index: j + 1 } };
    });
    if (!best) {
      return spanning === fa.points.length
        ? { valid: false, spanning: true, note: 'At every load point the critical section at d/2 spans the footing between two opposite edges (e.g. a skid runner along the footing) — two-way action does not develop; one-way shear (6.1) governs.' }
        : { valid: false, note: 'No soil pressure for any combination (net uplift or resultant outside the footing).' };
    }
    const { per: perB, gov: govB, pt } = best;
    return { valid: true, soil: true, kind: 'punching', d, c1: pt.c1, c2: pt.c2, center: { x: pt.x, y: pt.y }, per: perB, gov: govB, Vu: govB.res.Vu,
      Mx: govB.Mx, Mz: govB.Mz, invalid: perB.filter(p => p.invalid), fa, point: pt, nPoints: fa.points.length, skipped: spanning };
  }
  const per = fa.items.map(it => {
    const res = it.invalid ? null : footingPunchingShear({ pl: it.pl, w: it.w, B: fa.B, L: fa.L, cx: fa.ped.x, cz: fa.ped.z, c1: c1 / 1000, c2: c2 / 1000, d });
    const v = stdComboVector(it.combo.f, pedBase);
    const Mx = v.Mx + v.dMx, Mz = v.Mz + v.dMz;
    // critical section cut by the footing edges (interior / edge / corner detected from the geometry, not the tw-loc input)
    const ecc = res && res.valid ? footingPunchingStress({ sec: res.sec, Vu: res.Vu, Mx, Mz }) : null;
    return { combo: it.combo, it, invalid: it.invalid || (res && !res.valid ? res.note : null), res, Mx, Mz, ecc };
  });
  const ok = per.filter(p => p.res && p.res.valid);
  if (!ok.length) return { valid: false, note: per.find(p => p.invalid)?.invalid || 'No soil pressure for any combination.' };
  const key = (p) => (p.ecc && p.ecc.valid ? p.ecc.vu : p.res.Vu);
  const gov = ok.reduce((a, b) => (key(b) > key(a) ? b : a));
  return { valid: true, soil: true, kind: 'punching', d, c1: c1 / 1000, c2: c2 / 1000, center: { x: fa.ped.x, y: fa.ped.z }, per, gov, Vu: gov.res.Vu,
    Mx: gov.Mx, Mz: gov.Mz, invalid: per.filter(p => p.invalid), fa };
}
// Preview of the soil-pressure shear: how V_u follows from the pressure (sentence), then the design-pressure table with each
// combination's V_u (report pattern: formulas in the sentence above the table, short caption).
function soilShearHtml(pv) {
  const one = pv.kind === 'one-way', g = pv.gov, cn = one ? (pv.axis === 'x' ? 'x' : 'z') : '';
  const ptTxt = pv.point ? ` ${pv.nPoints} load points (Tab 02) — governing: point ${pv.point.index} at (${fmt(pv.point.x, 2)}, ${fmt(pv.point.y, 2)}) m, ${fmt(pv.point.c1, 2)} × ${fmt(pv.point.c2, 2)} m; the loads of the other points beyond a section are netted against the soil pressure.` : '';
  const lead = pv.point && !one
    ? `V<sub>u</sub> = the loads inside the critical section − the net soil pressure inside it = ${fmt(g.res.Pin, 1)} − (${fmt(g.res.Finside, 1)} − w·${fmt(g.res.Ain, 3)} m²) for the governing combination ${escapeHtml(comboLabel(g.combo))}: V<sub>u</sub> = ${fmt(pv.Vu, 1)} kN${g.res.others ? ` (incl. the part of ${g.res.others} other point(s) inside the section)` : ''}; by equilibrium the same as the net pressure outside for a single point. The moments are this point's share of those at the base of the pedestal (Table 3.3.4); the governing combination is the one with the largest combined stress v<sub>u</sub>.${ptTxt}${pv.skipped ? ` ${pv.skipped} point(s) not checked: their section spans the footing between two opposite edges (one-way shear governs).` : ''}`
    : one
    ? `Critical sections at d from the ${pv.point ? 'faces of the governing load point' : 'pedestal faces'}: ${cn}<sub>±</sub> = ${cn}<sub>p</sub> ± (${pv.axis === 'x' ? 'B' : 'L'}<sub>p</sub>/2 + d) = ${fmt(pv.center, 3)} ± (${fmt(pv.half, 3)} + ${fmt(pv.d, 3)}) = ${fmt(g.res.pos.plus, 3)} / ${fmt(g.res.pos.minus, 3)} m. V = ∫(q − w) dA over the part of the footing beyond the section (full width); V<sub>u</sub> = the larger |V| of the two sides. Governing: ${escapeHtml(comboLabel(g.combo))}, V<sub>u</sub> = ${fmt(pv.Vu, 1)} kN (${g.res.side} side).${ptTxt}`
    : `V<sub>u</sub> = ∫(q − w) dA outside the critical section = (${fmt(g.res.Fall, 1)} − ${fmt(g.res.Finside, 1)}) − w·${fmt(g.res.Aout, 3)} m² for the governing combination ${escapeHtml(comboLabel(g.combo))}: V<sub>u</sub> = ${fmt(pv.Vu, 1)} kN. The governing combination is the one with the largest combined stress v<sub>u</sub>; the moments are those at the base of the pedestal (Table 3.3.4).`;
  const byIt = new Map(pv.per.map(p => [p.it, p]));
  const extra = one
    ? { head: ['V<sub>+</sub> (kN)', 'V<sub>−</sub> (kN)', 'V<sub>u</sub> (kN)'], gov: g.it,
        cells: (it) => { const p = byIt.get(it); return `<td class="num">${fmt(p.res.Vpos, 1)}</td><td class="num">${fmt(p.res.Vneg, 1)}</td><td class="num">${fmt(p.res.Vu, 1)}</td>`; } }
    : { head: ['V<sub>u</sub> (kN)', 'M<sub>x,ped</sub> (kN·m)', 'M<sub>z,ped</sub> (kN·m)', 'v<sub>u</sub> (MPa)'], gov: g.it,
        cells: (it) => { const p = byIt.get(it); return p.res && p.res.valid
          ? `<td class="num">${fmt(p.res.Vu, 1)}</td><td class="num">${fmt(p.Mx, 1)}</td><td class="num">${fmt(p.Mz, 1)}</td><td class="num">${p.ecc && p.ecc.valid ? fmt(p.ecc.vu, 3) : '—'}</td>`
          : `<td colspan="4">${escapeHtml(p.invalid || '—')}</td>`; } };
  return introPara(lead) + soilPressureHtml(pv.fa, extra, one ? 'Soil pressure and one-way shear per load combination' : 'Soil pressure and punching shear per load combination');
}

// ----- V_u from the pile reactions of the factored (LRFD) combinations — 5B pile cap -----
// The pile forces are those of evaluatePileGroupCombo() (biaxial, incl. the moment of the load point off the group
// centroid); capacities are irrelevant here. The lib does the section geometry and the d_p/2 interpolation
// (lib/foundation/shared/pileCapShear.js) — this only reads the inputs and picks the governing combination.
const NO_CAP = { Qc: 1e12, Qt: 1e12, Ql: 1e12 };
function pileReactionsLrfd() {
  const { at, items, points } = pileComboLoads('lrfd');
  if (pileList.length === 0) return { valid: false, note: 'No piles defined — add piles in 4B.' };
  if (items.length === 0) return { valid: false, note: 'No factored (LRFD) combinations — load them with "Edit LRFD Combinations".' };
  const dp = num('pf-dia') / 1000;
  if (!(dp > 0)) return { valid: false, note: 'Pile diameter D is not set (01 — General Input Data).' };
  const evals = items.map(({ combo, load, pointLoads, Pcap }) => ({ combo, load, pointLoads, Pcap, ev: evaluatePileGroupCombo(pileList, load, NO_CAP) }));
  return { valid: true, at, dp, evals, points };
}
function governingOf(per) {
  const ok = per.filter(p => p.res && p.res.valid);
  if (ok.length === 0) return null;
  return ok.reduce((a, b) => (b.res.Vu > a.res.Vu ? b : a));
}
function oneWayVuFromPiles({ axis, h, cc, Dbar }) {
  const base = pileReactionsLrfd();
  if (!base.valid) return base;
  const d = (h - cc - Dbar) / 1000;
  if (!(d > 0)) return { valid: false, note: 'Effective depth d must be greater than zero.' };
  // Single pedestal: sections at d from its faces. Several load points (base.points): the same at every point, the point loads beyond
  // a section netted against the pile reactions beyond it; the point with the largest V_u governs.
  const runPoint = (center, half, usePoints) => {
    const per = base.evals.map(e => ({ combo: e.combo, invalid: e.ev.valid ? null : e.ev.note,
      res: e.ev.valid ? oneWayPileShear({ pileForces: e.ev.pileForces, axis, center, half, d, dp: base.dp, pointLoads: usePoints ? e.pointLoads : null,
        capWeight: usePoints ? { P: e.Pcap, Bx: num('fs-Bf'), Ly: num('fs-Lf') } : null }) : null }));
    return { per, gov: governingOf(per), center, half };
  };
  let best;
  if (base.points) {
    base.points.forEach((pt, j) => {
      const r = runPoint(axis === 'x' ? pt.x : pt.y, (axis === 'x' ? pt.c1 : pt.c2) / 2, true);
      r.point = { ...pt, index: j + 1 };
      if (r.gov && (!best || !best.gov || r.gov.res.Vu > best.gov.res.Vu)) best = r;
      if (!best) best = r;
    });
  } else {
    best = runPoint(axis === 'x' ? base.at.x : base.at.y, (axis === 'x' ? num('rb-Bp') : num('rb-Lp')) / 2000, false); // pedestal size from 5A, mm -> half-size in m
  }
  const { per, gov, center, half } = best;
  if (!gov) return { valid: false, note: 'Pile force distribution invalid for every combination.' };
  return { valid: true, kind: 'one-way', axis, d, half, center, dp: base.dp, per, gov, Vu: gov.res.Vu, invalid: per.filter(p => p.invalid),
    point: best.point || null, nPoints: base.points ? base.points.length : 1 };
}
// Punching V_u per LRFD combination from the pile reactions, plus that combination's unbalanced moments at the base of the
// pedestal (Section 03 table 3.3.4, incl. H·Hp) for the eccentric shear stress. The governing combination is the one with the
// largest combined stress v_u = V_u/(b_o·d) + Σ γv·M_u·c/J_c (ACI 318M-19 §8.4.4.2), not simply the largest V_u.
function punchingVuFromPiles({ c1, c2, h, cc, Dbar, loc }) {
  const base = pileReactionsLrfd();
  if (!base.valid) return base;
  const d = (h - cc - Dbar) / 1000;
  if (!(d > 0)) return { valid: false, note: 'Effective depth d must be greater than zero.' };
  const pedBase = buildPedestalComboBase();
  // One entry per load point (a single pedestal = one point at base.at with the typed c1 × c2 and the whole load).
  const sites = base.points
    ? base.points.map((pt, j) => ({ x: pt.x, y: pt.y, c1: pt.c1, c2: pt.c2, f: pt.f, index: j + 1 }))
    : [{ x: base.at.x, y: base.at.y, c1: c1 / 1000, c2: c2 / 1000, f: 1, index: 1 }];
  let best = null;
  sites.forEach((st, j) => {
    const per = base.evals.map(e => {
      const Pcol = base.points ? e.pointLoads[j].P + st.f * e.Pcap : null; // this point's load + its share of the cap weight
      const res = e.ev.valid ? punchingPileShear({ pileForces: e.ev.pileForces, cx: st.x, cy: st.y, c1: st.c1, c2: st.c2, d, dp: base.dp, Pcol }) : null;
      const v = stdComboVector(e.combo.f, pedBase);
      const Mx = st.f * (v.Mx + v.dMx), Mz = st.f * (v.Mz + v.dMz);
      const ecc = res && res.valid ? eccentricPunchingStress({ c1: st.c1 * 1000, c2: st.c2 * 1000, d: d * 1000, Vu: res.Vu, Mx, Mz, loc }) : null;
      return { combo: e.combo, invalid: e.ev.valid ? null : e.ev.note, res, Mx, Mz, ecc };
    });
    const ok = per.filter(p => p.res && p.res.valid);
    if (!ok.length) return;
    const key = (p) => (p.ecc && p.ecc.valid ? p.ecc.vu : p.res.Vu);
    const gov = ok.reduce((a2, b2) => (key(b2) > key(a2) ? b2 : a2));
    if (!best || key(gov) > best.key) best = { key: key(gov), per, gov, st };
  });
  if (!best) return { valid: false, note: 'Pile force distribution invalid for every combination.' };
  const { per, gov, st } = best;
  return { valid: true, kind: 'punching', d, c1: st.c1, c2: st.c2, center: { x: st.x, y: st.y }, dp: base.dp, per, gov, Vu: gov.res.Vu,
    Mx: gov.Mx, Mz: gov.Mz, invalid: per.filter(p => p.invalid), point: base.points ? { ...st } : null, nPoints: sites.length };
}
// Punching of each pile through the cap (6.2, below the column punching): V_u = the largest |factored reaction| the pile gets in any LRFD
// combination, section at d/2 from the pile faces cut by the cap edges (lib pilePunchingCheck). The pile section (square / circular) is
// the one chosen in 08B.
function pilePunchingThroughCap({ h, cc, Dbar, fc, lambda }) {
  const base = pileReactionsLrfd();
  if (!base.valid) return base;
  const d = (h - cc - Dbar) / 1000;
  if (!(d > 0)) return { valid: false, note: 'Effective depth d must be greater than zero.' };
  const env = pileList.map((p, k) => ({ i: k + 1, x: p.x, y: p.y, F: 0, combo: null }));
  base.evals.forEach(e => {
    if (!e.ev.valid) return;
    e.ev.pileForces.forEach((pf, k) => { if (!env[k].combo || Math.abs(pf.F) > Math.abs(env[k].F)) { env[k].F = pf.F; env[k].combo = e.combo; } });
  });
  const shape = (document.getElementById('st-pile-shape') || {}).value === 'circular' ? 'circular' : 'square';
  const r = pilePunchingCheck({ piles: env, D: base.dp, shape, B: num('fs-Bf'), L: num('fs-Lf'), d, fc, lambda });
  return { ...r, d, shape, D: base.dp };
}
function pilePunchHtml(pp) {
  const g = pp.gov;
  let html = introPara(`Punching of a pile through the cap: critical section at d/2 from the pile faces (§22.6.4) — ${pp.shape === 'circular' ? 'a circular pile as the square of equal area, side ' + fmt(pp.c, 3) + ' m' : 'square pile ' + fmt(pp.D, 3) + ' m'} — cut by the cap edges (edge pile α<sub>s</sub> = 30, corner pile 20). V<sub>u</sub> = the largest factored reaction of the pile in any LRFD combination (tension piles pull through the same section); no moment from a pinned pile head. φV<sub>c</sub> = φ·v<sub>c</sub>·b<sub>o</sub>·d with v<sub>c</sub> the least of Table 22.6.5.2 (a)–(c), φ = 0.75. Governing: pile ${g.i} (${g.loc || '—'}), V<sub>u</sub> = ${fmt(g.Vu || 0, 1)} kN, UC = ${fmt(pp.governingUC, 3)}.`);
  html += `<div class="overflow-x"><table class="calc-table">
    <caption>Punching of the piles through the pile cap</caption>
    <tr><th>Pile</th><th>x (m)</th><th>z (m)</th><th>Location</th><th>b<sub>o</sub> (mm)</th><th>α<sub>s</sub></th><th>Governing combination</th><th>V<sub>u</sub> (kN)</th><th>φV<sub>c</sub> (kN)</th><th>UC</th></tr>
    ${pp.items.map(it => it.valid
      ? `<tr class="${it === g ? 'governing' : ''}"><td>${it.i}</td><td class="num">${fmt(it.x, 2)}</td><td class="num">${fmt(it.y, 2)}</td><td>${it.loc}</td><td class="num">${fmt(it.bo * 1000, 0)}</td><td class="num">${it.sec.alphaS}</td><td>${escapeHtml(comboLabel(it.combo))}</td><td class="num">${fmt(it.Vu, 1)}</td><td class="num">${fmt(it.phiVc, 1)}</td><td class="num">${fmt(it.uc, 3)}</td></tr>`
      : `<tr><td>${it.i}</td><td class="num">${fmt(it.x, 2)}</td><td class="num">${fmt(it.y, 2)}</td><td colspan="7">${escapeHtml(it.note || 'invalid')}</td></tr>`).join('')}
  </table></div>`;
  return html;
}
// Preview of the pile-reaction shear: how V_u follows from the pile reactions (sentence), the governing combination's piles, then
// every combination's V_u (report pattern: formulas in the sentence above the table, short caption).
function pileShearHtml(pv) {
  const one = pv.kind === 'one-way', g = pv.gov;
  const coordName = one ? (pv.axis === 'x' ? 'x' : 'z') : '';
  const where = one
    ? `Critical sections at d from the pedestal faces: ${coordName}<sub>±</sub> = ${coordName}<sub>p</sub> ± (${pv.axis === 'x' ? 'B' : 'L'}<sub>p</sub>/2 + d) = ${fmt(pv.center, 3)} ± (${fmt(pv.half, 3)} + ${fmt(pv.d, 3)}) = ${fmt(g.res.pos.plus, 3)} / ${fmt(g.res.pos.minus, 3)} m.`
    : `Critical section at d/2 from the pedestal faces: half-sizes h<sub>x</sub> = c<sub>1</sub>/2 + d/2 = ${fmt(pv.c1 / 2, 3)} + ${fmt(pv.d / 2, 3)} = ${fmt(g.res.hx, 3)} m, h<sub>z</sub> = c<sub>2</sub>/2 + d/2 = ${fmt(g.res.hy, 3)} m, centred at (${fmt(pv.center.x, 3)}, ${fmt(pv.center.y, 3)}) m.`;
  let html = introPara(`${where} V<sub>u</sub> = Σ F<sub>i</sub>·share<sub>i</sub>, share = 1 if s ≥ d<sub>p</sub>/2, 0 if s ≤ −d<sub>p</sub>/2, otherwise (s + d<sub>p</sub>/2)/d<sub>p</sub> (s = distance of the pile centre outside the section, d<sub>p</sub> = ${fmt(pv.dp, 3)} m); compression and tension shares are not netted, the larger governs. Governing: ${escapeHtml(comboLabel(g.combo))}, V<sub>u</sub> = ${fmt(pv.Vu, 1)} kN${one ? ` (${g.res.side} side)` : ''}.`);
  html += `<div class="overflow-x"><table class="calc-table">
    <caption>Pile reactions in the governing combination</caption>
    <tr><th>Pile</th><th>x (m)</th><th>z (m)</th><th>F (kN)</th><th>s (m)</th><th>Share</th><th>Share·F (kN)</th></tr>
    ${g.res.perPile.map(p => `<tr class="${p.frac > 0 ? 'governing' : ''}"><td>${p.i}</td><td class="num">${fmt(p.x, 2)}</td><td class="num">${fmt(p.y, 2)}</td><td class="num">${fmt(p.F, 1)}</td><td class="num">${fmt(p.s, 3)}</td><td class="num">${fmt(p.frac, 2)}</td><td class="num">${fmt(p.F * p.frac, 1)}</td></tr>`).join('')}
  </table></div>`;
  html += introPara(one
    ? 'V<sub>u</sub> of both sides for every factored LRFD combination; the larger side governs each combination.'
    : 'V<sub>u</sub> for every factored LRFD combination with that combination\'s moments at the base of the pedestal (Table 3.3.4) and the combined stress v<sub>u</sub> (§8.4.4.2); the governing combination is the one with the largest v<sub>u</sub>.');
  html += `<div class="overflow-x"><table class="calc-table">
    <caption>${one ? 'One-way' : 'Punching'} shear per load combination</caption>
    <tr><th>Combination</th>${one ? '<th>V<sub>+</sub> (kN)</th><th>V<sub>−</sub> (kN)</th>' : ''}<th>V<sub>u</sub> (kN)</th>${one ? '' : '<th>M<sub>x</sub> (kN·m)</th><th>M<sub>z</sub> (kN·m)</th><th>v<sub>u</sub> (MPa)</th>'}</tr>
    ${pv.per.map(p => p.invalid
      ? `<tr><td>${escapeHtml(comboLabel(p.combo))}</td><td colspan="${one ? 3 : 4}">${escapeHtml(p.invalid)}</td></tr>`
      : `<tr class="${p === g ? 'governing' : ''}"><td>${escapeHtml(comboLabel(p.combo))}</td>${one ? `<td class="num">${fmt(p.res.Vpos, 1)}</td><td class="num">${fmt(p.res.Vneg, 1)}</td>` : ''}<td class="num">${fmt(p.res.Vu, 1)}</td>${one ? '' : `<td class="num">${fmt(p.Mx, 1)}</td><td class="num">${fmt(p.Mz, 1)}</td><td class="num">${p.ecc && p.ecc.valid ? fmt(p.ecc.vu, 3) : '—'}</td>`}</tr>`).join('')}
  </table></div>`;
  if (pv.invalid.length) html += `<div class="warn-box"><strong>⚠  Pile force distribution invalid:</strong> ${pv.invalid.map(p => `${escapeHtml(comboLabel(p.combo))}: ${escapeHtml(p.invalid)}`).join('; ')} — not included above.</div>`;
  return html;
}

// Report chapter 06 (tab 5B): 6.1 one-way shear (#calc-oneway, with the chapter title), 6.2 punching (#calc-twoway),
// 6.3 flexure (#calc-rebarcap, rebar.js) — then one Limitation box for the chapter (renderCh6Limits(), footingSoil.js).
const OW_HEAD = () => (isShallow()
  ? chapterHeader('06. Footing Check', 'This chapter checks the footing for one-way shear, punching shear and flexure under the factored LRFD combinations (LC201+) of Section 03, with the actions from the net soil pressure (soil pressure minus the factored footing and backfill weight). The status of each check is shown in the Design Status panel.')
  : chapterHeader('06. Pile Cap Check', 'This chapter checks the pile cap for one-way shear, punching shear and flexure under the factored LRFD combinations (LC201+) of Section 03, with the actions from the factored pile reactions. The status of each check is shown in the Design Status panel.'))
  + sectionHeader('6.1', 'One-Way Shear', 'Shear on the section at a distance d from the pedestal face (ACI 318M-19 §22.5).', true);
const TW_HEAD = () => sectionHeader('6.2', 'Punching Shear', 'Two-way shear on the critical section at d/2 from the pedestal faces (ACI 318M-19 §22.6), including the shear stress from the unbalanced moments (§8.4.4.2).', true);
const OW_LIMIT = 'The simplified V<sub>c</sub> (Table 22.5.5.1) requires A<sub>v</sub> ≥ A<sub>v,min</sub> or h ≤ 250 mm (checked from the inputs; a notice is raised otherwise); the detailed expression (Eq. 22.5.5.1.1) governs for thin, lightly reinforced sections. b<sub>w</sub> is an input — it should equal the full width perpendicular to the section.';

// oneWayShearCheck() and its bisectMinX() helper now live in lib/foundation/shared/footingCheck.js.
// Public entry points: the check itself, then the 5B Focus Canvas (also after an error, so it never shows a stale picture).
export function calcOneWay() { calcOneWayCore(); renderShearFocus(); }
export function calcTwoWay() { calcTwoWayCore(); renderShearFocus(); }
function calcOneWayCore() {
  const bw = num('ow-bw'), h = num('ow-h'), cc = num('ow-cc'), Dbar = num('ow-D'), fc = num('gen-fc');
  let vu = num('ow-vu');
  // V_u source: typed in, or from the pile reactions of the factored LRFD combinations (written back into the field).
  // ... or from the soil pressure (shallow footing). Only the source matching the foundation type is offered (setup.js).
  const src = autoSrc(getRadioVal('ow-vu-src'));
  const fromPiles = src === 'piles', fromSoil = src === 'soil';
  document.getElementById('ow-vu').readOnly = fromPiles || fromSoil;
  document.getElementById('ow-vu-piles-fields').style.display = (fromPiles || fromSoil) ? 'block' : 'none';
  const capW = (getRadioVal('ow-dir') === 'x' ? num('fs-Lf') : num('fs-Bf')) * 1000; // cap width ⟂ the section, mm
  document.getElementById('ow-bw-hint').textContent = fmt(capW, 0);
  const pv = fromPiles ? oneWayVuFromPiles({ axis: getRadioVal('ow-dir'), h, cc, Dbar })
    : fromSoil ? oneWayVuFromSoil({ axis: getRadioVal('ow-dir'), h, cc, Dbar }) : null;
  const srcName = fromSoil ? 'soil pressure' : 'pile reactions';
  if (pv && pv.valid) { vu = pv.Vu; document.getElementById('ow-vu').value = vu.toFixed(1); }
  const srcTxt = fromSoil ? 'soil pressure' : 'pile reactions';
  // ρw from the designed bottom steel of the footing flexure (5B.3) when V_u comes from the soil pressure.
  const rhoEl = document.getElementById('ow-rho');
  let rho = num('ow-rho') / 100;
  rhoEl.readOnly = false;
  if (fromSoil) {
    const des = lastResults.pileCapRebar && lastResults.pileCapRebar.design;
    const sd = des && (getRadioVal('ow-dir') === 'x' ? des.x : des.z);
    const dmm = h - cc - Dbar;
    if (sd && dmm > 0 && bw > 0) { rho = sd.As / (bw * dmm); rhoEl.value = (rho * 100).toFixed(3); rhoEl.readOnly = true; }
  }
  const lambda = parseFloat(getRadioVal('ow-lambda'));
  const method = getRadioVal('ow-method');
  const avOk = document.getElementById('ow-avmin').checked;
  document.getElementById('ow-rho-field').style.display = (method === 'detailed') ? 'block' : 'none';
  const r = oneWayShearCheck({ bw, h, cc, Dbar, fc, vu, rho, lambda, method, avOk });
  document.getElementById('ow-d-out').textContent = fmt(r.d, 0);
  if (!r.valid) {
    document.getElementById('calc-oneway').innerHTML = OW_HEAD() + `<div class="warn-box">
      <strong>⚠  Invalid geometry:</strong> effective depth d = h - cc - D = ${fmt(r.d,0)} mm is zero or negative. Increase h or reduce cover/bar diameter.
    </div>`;
    document.getElementById('opt-oneway').innerHTML = '';
    lastResults.oneway = { label: 'One-Way Shear', status: 'ERROR', metric: '—', detail: 'Invalid geometry (d ≤ 0).' };
    return;
  }
  if (pv && !pv.valid) {
    document.getElementById('calc-oneway').innerHTML = OW_HEAD() + `<div class="warn-box"><strong>⚠  V<sub>u</sub> from ${srcName} not available:</strong> ${escapeHtml(pv.note)} Switch V<sub>u</sub> to "Manual" or fix the cause.</div>`;
    document.getElementById('opt-oneway').innerHTML = '';
    lastResults.oneway = { label: 'One-Way Shear', status: 'ERROR', metric: '—', detail: `V_u from ${srcName} not available: ` + pv.note };
    return;
  }
  const { d, sqrtfc, vc_lower, vc_upper, vc, lambdaS, useFloor, detail, phiVc, uc, pass, simplifiedAllowed, hMinRounded } = r;
  lastResults.oneway = { label: 'One-Way Shear', status: pass ? 'PASS' : 'FAIL', metric: `UC = ${fmt(uc,3)}`,
    detail: `b_w=${fmt(bw,0)}mm, d=${fmt(d,0)}mm, V_u=${fmt(vu,1)}kN${pv ? ` (${pv.soil ? 'soil' : 'piles'}, ${comboLabel(pv.gov.combo)})` : ''}, ${method}` };
  let suggestHtml = '';
  if (pass && hMinRounded !== null && h - hMinRounded >= 50) {
    suggestHtml = `<div class="suggest-box">
      <strong>Depth reduction potential:</strong> minimum h for UC ≤ 1.00, rounded up to the nearest 50 mm, is <strong>${fmt(hMinRounded,0)} mm</strong> (current h = ${fmt(h,0)} mm) — a potential reduction of <strong>${fmt(h - hMinRounded,0)} mm</strong>, holding b<sub>w</sub>, cc, D, f'c, λ and ρ<sub>w</sub> constant. This rounded value still has some margin above the exact zero-margin limit; re-verify flexure, deflection, crack control, and bar/stirrup detailing before finalizing — those usually govern h before shear does.
    </div>`;
  }
  // Notices go to the Design Status panel (renderLiveBar reads lastResults.oneway.notices), not into the preview.
  const notices = [];
  if (method === 'simplified' && !simplifiedAllowed) {
    notices.push({ title: 'One-way shear: method not permitted', text: 'Table 22.5.5.1 allows the simplified Vc = 0.17λ√f\'c·bw·d only with Av ≥ Av,min or h ≤ 250 mm — neither is met, so the result may be non-conservative. Use the Detailed method or confirm Av ≥ Av,min.' });
  }
  if (pv && Math.abs(bw - capW) > 1) {
    notices.push({ title: 'One-way shear: web width', text: `bw = ${fmt(bw,0)} mm differs from the ${pv.soil ? 'footing' : 'pile cap'} width perpendicular to the section (${fmt(capW,0)} mm, Tab 02) — the capacity is for bw while Vu is the whole-width shear.` });
  }
  lastResults.oneway.notices = notices;
  let html = OW_HEAD();
  html += introPara(`Capacity of the section b<sub>w</sub> × d = ${fmt(bw,0)} × ${fmt(d,0)} mm, ${method === 'detailed' ? 'detailed expression (Eq. 22.5.5.1.1) bounded by 0.17λ√f\'c·b<sub>w</sub>·d and 0.42λ√f\'c·b<sub>w</sub>·d' : 'simplified V<sub>c</sub> = 0.17λ√f\'c·b<sub>w</sub>·d (Table 22.5.5.1)'}, φ = 0.75: φV<sub>c</sub> = ${fmt(phiVc/1000,1)} kN. V<sub>u</sub> = ${fmt(vu,1)} kN (${pv ? `from the ${srcName}, factored LRFD combinations` : 'input'}), UC = V<sub>u</sub> / φV<sub>c</sub> = ${fmt(uc,3)}.`);
  html += `<div class="overflow-x"><table class="calc-table">
    <caption>One-way shear capacity</caption>
    <tr><th>Parameter</th><th>Expression</th><th>Value</th></tr>
    <tr><td>Effective depth, d</td><td class="clause">h - cc - D</td><td class="num">${fmt(d,0)} mm</td></tr>
    <tr><td>√f'c</td><td class="clause">—</td><td class="num">${fmt(sqrtfc,3)} MPa<sup>0.5</sup></td></tr>`;
  if (method === 'detailed') {
    const rhoCube = Math.pow(Math.max(rho,0.0001),1/3);
    if (lambdaS !== null) html += `<tr><td>Size effect factor, λ<sub>s</sub></td><td class="clause">Eq. 22.5.5.1.3 (applies with A<sub>v</sub> &lt; A<sub>v,min</sub>)</td><td class="num">${fmt(lambdaS,3)}</td></tr>`;
    html += `<tr><td>ρ<sub>w</sub></td><td class="clause">input</td><td class="num">${fmt(rho*100,3)}%</td></tr>
      <tr><td>V<sub>c</sub>, ${lambdaS !== null ? 'Eq. (c)' : 'Eq. (b)'}</td><td class="clause">${lambdaS !== null ? '0.66λ<sub>s</sub>λ(ρ<sub>w</sub>)<sup>1/3</sup>√f\'c·b<sub>w</sub>·d' : '0.66λ(ρ<sub>w</sub>)<sup>1/3</sup>√f\'c·b<sub>w</sub>·d'}</td><td class="num">${fmt(0.66 * (lambdaS !== null ? lambdaS : 1) * lambda * rhoCube * sqrtfc * bw * d / 1000,1)} kN</td></tr>`;
  }
  // The 0.17 lower bound (Eq. a) exists only with A_v ≥ A_v,min (or the simplified method); with A_v < A_v,min Eq. (c) has no floor.
  html += `${useFloor ? `<tr><td>V<sub>c</sub>, Eq. (a)</td><td class="clause">0.17λ√f'c·b<sub>w</sub>·d</td><td class="num">${fmt(vc_lower/1000,1)} kN</td></tr>` : ''}
    <tr><td>V<sub>c,max</sub></td><td class="clause">0.42λ√f'c·b<sub>w</sub>·d</td><td class="num">${fmt(vc_upper/1000,1)} kN</td></tr>
    <tr class="governing"><td>V<sub>c</sub>, governing</td><td class="clause">${detail}</td><td class="num">${fmt(vc/1000,1)} kN</td></tr>
    <tr><td>φV<sub>c</sub></td><td class="clause">φ = 0.75</td><td class="num">${fmt(phiVc/1000,1)} kN</td></tr>
    <tr><td>V<sub>u</sub></td><td class="clause">${pv ? `from ${srcName}, LRFD` : 'input'}</td><td class="num">${fmt(vu,1)} kN</td></tr>
    <tr class="governing"><td>UC</td><td class="clause">V<sub>u</sub> / φV<sub>c</sub></td><td class="num">${fmt(uc,3)}</td></tr>
  </table></div>`;
  if (pv) html += pv.soil ? soilShearHtml(pv) : pileShearHtml(pv);
  lastResults.oneway.limit = OW_LIMIT;
  lastResults.oneway.viz = { ...vizBase({ h, cc, Dbar, d }, pv && pv.point), kind: 'oneway', src: pv ? (pv.soil ? 'soil' : 'piles') : 'manual',
    axis: getRadioVal('ow-dir') === 'x' ? 'x' : 'z', side: pv ? pv.gov.res.side : null, Vu: vu, phiVc: phiVc / 1000, uc, pass,
    combo: pv ? comboLabel(pv.gov.combo) : null, plane: pv && pv.soil ? vizPlane(pv.gov.it) : null, w: pv && pv.soil ? pv.gov.it.w : 0,
    piles: pv && !pv.soil ? pv.gov.res.perPile : null, dp: pv && !pv.soil ? pv.dp : 0, method, bw };
  const effHtml = efficiencyBadge(uc, pass);
  document.getElementById('opt-oneway').innerHTML = (effHtml || suggestHtml)
    ? `<div class="section-label">Optimization Notes</div>${effHtml}${suggestHtml}`
    : '';
  document.getElementById('calc-oneway').innerHTML = numberTables(html, '6');
  renderCh6Limits();
}
// twoWayShearCheck() lives in lib/foundation/shared/footingCheck.js.
function calcTwoWayCore() {
  let c1 = num('tw-c1'), c2 = num('tw-c2');
  const h = num('tw-h'), cc = num('tw-cc'), Dbar = num('tw-D'), fc = num('gen-fc');
  let vu = num('tw-vu');
  const src = autoSrc(getRadioVal('tw-vu-src'));
  const fromPiles = src === 'piles', fromSoil = src === 'soil', auto = fromPiles || fromSoil;
  document.getElementById('tw-vu').readOnly = auto;
  document.getElementById('tw-vu-piles-fields').style.display = auto ? 'block' : 'none';
  const loc = getRadioVal('tw-loc');
  const pv = fromPiles ? punchingVuFromPiles({ c1, c2, h, cc, Dbar, loc }) : fromSoil ? punchingVuFromSoil({ c1, c2, h, cc, Dbar, loc }) : null;
  const srcName = fromSoil ? 'soil pressure' : 'pile reactions';
  // Unbalanced moments for the eccentric shear stress: from the governing LRFD combination at the pedestal base (piles mode,
  // written back into the fields) or typed in (manual mode).
  let Mx = num('tw-mux'), Mz = num('tw-muz');
  document.getElementById('tw-mux').readOnly = auto; document.getElementById('tw-muz').readOnly = auto;
  if (pv && pv.valid) {
    vu = pv.Vu; Mx = pv.Mx; Mz = pv.Mz;
    if (pv.point) { // several load points: the capacity is that of the governing point's perimeter
      c1 = Math.round(pv.c1 * 1000); c2 = Math.round(pv.c2 * 1000);
      document.getElementById('tw-c1').value = c1; document.getElementById('tw-c2').value = c2;
    }
    document.getElementById('tw-vu').value = vu.toFixed(1);
    document.getElementById('tw-mux').value = Mx.toFixed(1); document.getElementById('tw-muz').value = Mz.toFixed(1);
  }
  const lambda = parseFloat(getRadioVal('tw-lambda'));
  const r = twoWayShearCheck({ c1, c2, h, cc, Dbar, fc, vu, lambda, loc });
  document.getElementById('tw-d-out').textContent = fmt(r.d, 0);
  if (!r.valid) {
    document.getElementById('calc-twoway').innerHTML = TW_HEAD() + `<div class="warn-box">
      <strong>⚠  Invalid geometry:</strong> effective depth d = h - cc - D = ${fmt(r.d,0)} mm is zero or negative. Increase h or reduce cover/bar diameter.
    </div>`;
    document.getElementById('opt-twoway').innerHTML = '';
    lastResults.twoway = { label: 'Two-Way (Punching) Shear', status: 'ERROR', metric: '—', detail: 'Invalid geometry (d ≤ 0).' };
    return;
  }
  if (pv && !pv.valid && pv.spanning) { // several load points, none a two-way case (e.g. skid runners along the footing): not applicable
    document.getElementById('calc-twoway').innerHTML = TW_HEAD() + `<div class="note"><strong>Not applicable:</strong> ${escapeHtml(pv.note)}</div>`;
    document.getElementById('opt-twoway').innerHTML = '';
    lastResults.twoway = { label: 'Two-Way (Punching) Shear', status: 'NA', metric: 'N/A (one-way governs)', detail: pv.note, limit: 'Several load points whose critical sections all span the footing — one-way shear (6.1) governs.' };
    renderCh6Limits();
    return;
  }
  if (pv && !pv.valid) {
    document.getElementById('calc-twoway').innerHTML = TW_HEAD() + `<div class="warn-box"><strong>⚠  V<sub>u</sub> from ${srcName} not available:</strong> ${escapeHtml(pv.note)} Switch V<sub>u</sub> to "Manual" or fix the cause.</div>`;
    document.getElementById('opt-twoway').innerHTML = '';
    lastResults.twoway = { label: 'Two-Way (Punching) Shear', status: 'ERROR', metric: '—', detail: `V_u from ${srcName} not available: ` + pv.note };
    return;
  }
  if (pv && pv.soil) return renderTwoWaySoil(pv, { fc, lambda });
  const { d, alphaS, bo, boFormula, beta, sqrtfc, vc_vals, vc_gov, Vc, phiVc, hMinRounded, phi } = r;
  // Combined stress with the unbalanced moments — ACI 318M-19 §8.4.4.2 (interior pedestal); UC = v_u / (φ·v_c).
  const ecc = eccentricPunchingStress({ c1, c2, d, Vu: vu, Mx, Mz, loc });
  if (!ecc.valid) {
    document.getElementById('calc-twoway').innerHTML = TW_HEAD() + `<div class="warn-box"><strong>⚠  Unbalanced-moment shear not available:</strong> ${escapeHtml(ecc.note)} Use "Interior" for a pedestal away from the ${isShallow() ? 'footing' : 'pile cap'} edges.</div>`;
    document.getElementById('opt-twoway').innerHTML = '';
    lastResults.twoway = { label: 'Two-Way (Punching) Shear', status: 'ERROR', metric: '—', detail: ecc.note };
    return;
  }
  const phiVcStress = phi * vc_gov;
  const uc = ecc.vu / phiVcStress, pass = uc <= 1.0;
  const hasMoment = ecc.terms.some(t => t.v > 0);
  lastResults.twoway = { label: 'Two-Way (Punching) Shear', status: pass ? 'PASS' : 'FAIL', metric: `UC = ${fmt(uc,3)}`,
    detail: `b_o=${fmt(bo,0)}mm, d=${fmt(d,0)}mm, V_u=${fmt(vu,1)}kN, M_ux=${fmt(Mx,1)}, M_uz=${fmt(Mz,1)}kN·m, v_u=${fmt(ecc.vu,3)}MPa${pv ? ` (${pv.soil ? 'soil' : 'piles'}, ${comboLabel(pv.gov.combo)})` : ''}, ${loc}` };
  let suggestHtml = '';
  if (pass && !hasMoment && hMinRounded !== null && h - hMinRounded >= 50) { // the depth search ignores the moment term
    suggestHtml = `<div class="suggest-box">
      <strong>Depth reduction potential:</strong> minimum h for UC ≤ 1.00, rounded up to the nearest 50 mm, is <strong>${fmt(hMinRounded,0)} mm</strong> (current h = ${fmt(h,0)} mm) — a potential reduction of <strong>${fmt(h - hMinRounded,0)} mm</strong>, holding c<sub>1</sub>, c<sub>2</sub>, cc, D, f'c and λ constant. This ignores unbalanced moment transfer (γ<sub>v</sub>M<sub>u</sub>c/J<sub>c</sub>, §8.4.4.2) and the slab's flexural/deflection requirements — re-check those before reducing h.
    </div>`;
  }
  // Piles: the pile punching through the cap joins the column punching in the status (worst UC governs).
  const pp = isShallow() ? null : pilePunchingThroughCap({ h, cc, Dbar, fc, lambda });
  if (pp && !pp.valid) {
    lastResults.twoway.status = 'ERROR'; lastResults.twoway.metric = '—'; lastResults.twoway.detail = 'Pile punching: ' + pp.note;
  } else if (pp) {
    const ucAll = Math.max(uc, pp.governingUC);
    lastResults.twoway.status = pass && pp.overallPass ? 'PASS' : 'FAIL';
    lastResults.twoway.metric = `UC = ${fmt(ucAll, 3)}`;
    lastResults.twoway.detail += ` | pile punching UC=${fmt(pp.governingUC, 3)} (pile ${pp.gov.i}, ${pp.gov.loc})`;
  }
  lastResults.twoway.notices = [];
  let html = TW_HEAD();
  html += introPara(`Critical section at d/2 from the pedestal faces (§22.6.4), ${loc} location (α<sub>s</sub> = ${alphaS}, §22.6.5.3): b<sub>o</sub> = ${boFormula} = ${fmt(bo,0)} mm with d = ${fmt(d,0)} mm.`);
  html += `<div class="overflow-x"><table class="calc-table">
    <caption>Critical section</caption>
    <tr><th>Parameter</th><th>Expression</th><th>Value</th></tr>
    <tr><td>Effective depth, d</td><td class="clause">h - cc - D</td><td class="num">${fmt(d,0)} mm</td></tr>
    <tr><td>α<sub>s</sub></td><td class="clause">§22.6.5.3 (location)</td><td class="num">${alphaS}</td></tr>
    <tr><td>β (long/short side)</td><td class="clause">max(c₁,c₂)/min(c₁,c₂)</td><td class="num">${fmt(beta,3)}</td></tr>
    <tr><td>Size effect factor, λ<sub>s</sub></td><td class="clause">√(2/(1 + 0.004d)) ≤ 1 — §22.5.5.1.3, Table 22.6.5.2</td><td class="num">${fmt(r.lambdaS,3)}</td></tr>
    <tr><td>Critical perimeter, b<sub>o</sub></td><td class="clause">${boFormula}</td><td class="num">${fmt(bo,0)} mm</td></tr>
  </table></div>`;
  html += introPara(`Two-way shear strength v<sub>c</sub> = the least of the three expressions of Table 22.6.5.2, with the size effect factor λ<sub>s</sub> = ${fmt(r.lambdaS,3)}: v<sub>c</sub> = ${fmt(vc_gov,3)} MPa, V<sub>c</sub> = v<sub>c</sub>·b<sub>o</sub>·d = ${fmt(Vc/1000,1)} kN, φV<sub>c</sub> = ${fmt(phiVc/1000,1)} kN (φ = 0.75).`);
  html += `<div class="overflow-x"><table class="calc-table">
    <caption>Two-way shear strength</caption>
    <tr><th>Equation</th><th>Clause</th><th>v<sub>c</sub> (MPa)</th></tr>`;
  vc_vals.forEach(v => {
    const isGov = Math.abs(v.val - vc_gov) < 1e-9;
    html += `<tr class="${isGov ? 'governing' : ''}"><td>${v.label}</td><td class="clause">${v.clause}</td><td class="num">${fmt(v.val,3)}</td></tr>`;
  });
  html += `</table></div>`;
  html += `<div class="overflow-x"><table class="calc-table">
    <caption>Punching shear capacity</caption>
    <tr><th>Parameter</th><th>Expression</th><th>Value</th></tr>
    <tr><td>V<sub>c</sub></td><td class="clause">v<sub>c,gov</sub> · b<sub>o</sub> · d</td><td class="num">${fmt(Vc/1000,1)} kN</td></tr>
    <tr><td>φV<sub>c</sub></td><td class="clause">φ = 0.75</td><td class="num">${fmt(phiVc/1000,1)} kN</td></tr>
    <tr><td>V<sub>u</sub></td><td class="clause">${pv ? `from ${srcName}, LRFD` : 'input'}</td><td class="num">${fmt(vu,1)} kN</td></tr>
  </table></div>`;
  const [tz, tx] = ecc.terms;
  const termRows = (t, name, Mname) => `
    <tr><td>${Mname}</td><td class="clause">${pv ? 'base of pedestal, same LRFD combination (03, Table 3.3.4)' : 'input'}</td><td class="num">${fmt(t.M,1)} kN·m</td></tr>
    <tr><td>b<sub>1</sub>, b<sub>2</sub> (${name})</td><td class="clause">${name === 'M<sub>z</sub>' ? 'c<sub>1</sub> + d, c<sub>2</sub> + d' : 'c<sub>2</sub> + d, c<sub>1</sub> + d'}</td><td class="num">${fmt(t.b1,0)}, ${fmt(t.b2,0)} mm</td></tr>
    <tr><td>γ<sub>v</sub> (${name})</td><td class="clause">1 − 1/(1 + (2/3)√(b<sub>1</sub>/b<sub>2</sub>)) — §8.4.2.2.2</td><td class="num">${fmt(t.gv,3)}</td></tr>
    <tr><td>J<sub>c</sub> (${name})</td><td class="clause">d·b<sub>1</sub>³/6 + b<sub>1</sub>·d³/6 + d·b<sub>2</sub>·b<sub>1</sub>²/2</td><td class="num">${fmt(t.Jc/1e9,3)} ×10⁹ mm⁴</td></tr>
    <tr><td>γ<sub>v</sub>·M<sub>u</sub>·c<sub>AB</sub>/J<sub>c</sub> (${name})</td><td class="clause">c<sub>AB</sub> = b<sub>1</sub>/2 = ${fmt(t.c,0)} mm</td><td class="num">${fmt(t.v,3)} MPa</td></tr>`;
  html += introPara(`Combined shear stress with the unbalanced moments (eccentric shear stress model, §8.4.4.2), both directions added at the most stressed corner: v<sub>u</sub> = V<sub>u</sub>/(b<sub>o</sub>·d) + Σ γ<sub>v</sub>·M<sub>u</sub>·c<sub>AB</sub>/J<sub>c</sub> = ${fmt(ecc.vu,3)} MPa; UC = v<sub>u</sub> / (φ·v<sub>c</sub>) = ${fmt(ecc.vu,3)} / ${fmt(phiVcStress,3)} = ${fmt(uc,3)}.`);
  html += `<div class="overflow-x"><table class="calc-table">
    <caption>Combined shear stress</caption>
    <tr><th>Parameter</th><th>Expression</th><th>Value</th></tr>
    <tr><td>Direct shear stress</td><td class="clause">V<sub>u</sub>/(b<sub>o</sub>·d) = ${fmt(vu,1)}·10³/(${fmt(bo,0)}·${fmt(d,0)})</td><td class="num">${fmt(ecc.vDirect,3)} MPa</td></tr>
    ${termRows(tz, 'M<sub>z</sub>', 'M<sub>uz</sub> (bending along x)')}
    ${termRows(tx, 'M<sub>x</sub>', 'M<sub>ux</sub> (bending along z)')}
    <tr class="governing"><td>Combined stress, v<sub>u</sub></td><td class="clause">V<sub>u</sub>/(b<sub>o</sub>d) + Σ γ<sub>v</sub>M<sub>u</sub>c<sub>AB</sub>/J<sub>c</sub></td><td class="num">${fmt(ecc.vu,3)} MPa</td></tr>
    <tr><td>φ·v<sub>c</sub></td><td class="clause">0.75 × ${fmt(vc_gov,3)}</td><td class="num">${fmt(phiVcStress,3)} MPa</td></tr>
    <tr class="governing"><td>UC</td><td class="clause">v<sub>u</sub> / (φ·v<sub>c</sub>)</td><td class="num">${fmt(uc,3)}</td></tr>
  </table></div>`;
  if (pv) html += pv.soil ? soilShearHtml(pv) : pileShearHtml(pv);
  if (pp && pp.valid) html += pilePunchHtml(pp);
  else if (pp) html += `<div class="warn-box"><strong>⚠  Pile punching not available:</strong> ${escapeHtml(pp.note)}</div>`;
  {
    const base = vizBase({ h, cc, Dbar, d }, pv && pv.point);
    const hx = base.ped.c1 / 2 + base.d / 2, hz = base.ped.c2 / 2 + base.d / 2;
    lastResults.twoway.viz = { ...base, kind: 'twoway', src: pv ? 'piles' : 'manual', loc, alphaS, bo: bo / 1000, boFormula,
      rect: { X1: base.ped.x - hx, X2: base.ped.x + hx, Z1: base.ped.z - hz, Z2: base.ped.z + hz }, free: null,
      Vu: vu, phiVc: phiVc / 1000, vu: ecc.vu, phiVcStress, uc, pass, combo: pv ? comboLabel(pv.gov.combo) : null,
      plane: null, w: 0, piles: pv ? pv.gov.res.perPile : null, dp: pv ? pv.dp : 0 };
  }
  lastResults.twoway.limit = 'The unbalanced-moment shear (eccentric shear stress model, §8.4.4.2) is included with the terms of both directions added at the most stressed corner (conservative); for a pile cap or a typed-in V<sub>u</sub> the unbalanced-moment terms are implemented for an interior pedestal only. With V<sub>u</sub> from the pile reactions, V<sub>u</sub> and the moments come from the same LRFD combination (moments at the base of the pedestal, incl. H·H<sub>p</sub>), and the governing combination is the one with the largest combined stress.';
  const effHtml = efficiencyBadge(uc, pass);
  document.getElementById('opt-twoway').innerHTML = (effHtml || suggestHtml)
    ? `<div class="section-label">Optimization Notes</div>${effHtml}${suggestHtml}`
    : '';
  document.getElementById('calc-twoway').innerHTML = numberTables(html, '6');
  renderCh6Limits();
}

// 6.2 for a shallow footing with V_u from the soil pressure: the critical section is cut by the footing edges (interior / edge /
// corner from the geometry — footingPunchingSection()), α_s and b_o follow the actual sides, and the unbalanced moments are moved
// to the centroid of the section (footingPunchingStress()). Governing combination = largest combined stress (same v_c for all).
function renderTwoWaySoil(pv, { fc, lambda }) {
  const g = pv.gov, sec = g.res.sec, ecc = g.ecc;
  const cap = footingPunchingCapacity({ sec, fc, lambda });
  const uc = ecc.vu / cap.phiVc_stress, pass = uc <= 1.0;
  const dmm = sec.d * 1000;
  const freeTxt = ['xm', 'xp', 'zm', 'zp'].filter(k => sec.free[k]).map(k => ({ xm: 'x−', xp: 'x+', zm: 'z−', zp: 'z+' }[k]));
  lastResults.twoway = { label: 'Two-Way (Punching) Shear', status: pass ? 'PASS' : 'FAIL', metric: `UC = ${fmt(uc,3)}`,
    detail: `${sec.loc}, b_o=${fmt(sec.bo * 1000,0)}mm, d=${fmt(dmm,0)}mm, V_u=${fmt(g.res.Vu,1)}kN, v_u=${fmt(ecc.vu,3)}MPa (soil, ${comboLabel(g.combo)})` };
  lastResults.twoway.notices = sec.loc !== 'interior' ? [{ title: 'Punching: ' + sec.loc + ' pedestal',
    text: `The critical section reaches the footing edge on side ${freeTxt.join(', ')} (less than d/2 from the pedestal face) — ${sec.loc} section with α_s = ${sec.alphaS}, detected from Tab 02; the "Column location" input is not used with V_u from the soil pressure.` }] : [];
  const sideRows = sec.sides.map(sd => `<tr><td>Side ${sd.name}</td><td class="clause">${sd.dir === 'z' ? `x = ${fmt(sd.x,3)} m, z ${fmt(sd.z1,3)} … ${fmt(sd.z2,3)} m` : `z = ${fmt(sd.z,3)} m, x ${fmt(sd.x1,3)} … ${fmt(sd.x2,3)} m`}</td><td class="num">${fmt(sd.l * 1000,0)} mm</td></tr>`).join('');
  let html = TW_HEAD();
  html += introPara(`Critical section at d/2 from the pedestal faces, cut by the footing edges (§22.6.4.1): a side closer than d/2 to the footing edge is dropped and the section runs out to the edge — ${sec.loc} section (α<sub>s</sub> = ${sec.alphaS}), b<sub>o</sub> = ${fmt(sec.bo * 1000,0)} mm with d = ${fmt(dmm,0)} mm.`);
  html += `<div class="overflow-x"><table class="calc-table">
    <caption>Critical section</caption>
    <tr><th>Parameter</th><th>Expression</th><th>Value</th></tr>
    <tr><td>Effective depth, d</td><td class="clause">h − cc − D</td><td class="num">${fmt(dmm,0)} mm</td></tr>
    <tr><td>Location</td><td class="clause">${freeTxt.length ? `free side(s) ${freeTxt.join(', ')}: pedestal face less than d/2 from the footing edge` : 'all faces at least d/2 from the footing edges'}</td><td class="num">${sec.loc}</td></tr>
    ${sideRows}
    <tr><td>Critical perimeter, b<sub>o</sub></td><td class="clause">Σ sides</td><td class="num">${fmt(sec.bo * 1000,0)} mm</td></tr>
    <tr><td>α<sub>s</sub></td><td class="clause">§22.6.5.3 (${sec.loc})</td><td class="num">${sec.alphaS}</td></tr>
    <tr><td>β (long/short side)</td><td class="clause">max(c₁,c₂)/min(c₁,c₂)</td><td class="num">${fmt(cap.beta,3)}</td></tr>
    <tr><td>Size effect factor, λ<sub>s</sub></td><td class="clause">√(2/(1 + 0.004d)) ≤ 1 — §22.5.5.1.3, Table 22.6.5.2</td><td class="num">${fmt(cap.lambdaS,3)}</td></tr>
    <tr><td>Centroid of the section, (x̄, z̄)</td><td class="clause">Σ l·(x, z) / b<sub>o</sub></td><td class="num">(${fmt(sec.xbar,3)}, ${fmt(sec.zbar,3)}) m</td></tr>
  </table></div>`;
  html += introPara(`Two-way shear strength v<sub>c</sub> = the least of the three expressions of Table 22.6.5.2 with α<sub>s</sub> and b<sub>o</sub> of this section and λ<sub>s</sub> = ${fmt(cap.lambdaS,3)}: v<sub>c</sub> = ${fmt(cap.vc_gov,3)} MPa, φ·v<sub>c</sub> = ${fmt(cap.phiVc_stress,3)} MPa (φ = 0.75).`);
  html += `<div class="overflow-x"><table class="calc-table">
    <caption>Two-way shear strength</caption>
    <tr><th>Equation</th><th>Clause</th><th>v<sub>c</sub> (MPa)</th></tr>
    ${cap.vc_vals.map(v => `<tr class="${Math.abs(v.val - cap.vc_gov) < 1e-9 ? 'governing' : ''}"><td>${v.label}</td><td class="clause">${v.clause}</td><td class="num">${fmt(v.val,3)}</td></tr>`).join('')}
  </table></div>`;
  const termRows = (t, name, Mname, sym) => `
    <tr><td>${Mname}</td><td class="clause">base of pedestal, same LRFD combination (03, Table 3.3.4)</td><td class="num">${fmt(t.M,1)} kN·m</td></tr>
    <tr><td>${Mname} at the section centroid</td><td class="clause">${sym === 'z' ? `M<sub>z</sub> + V<sub>u</sub>·(x<sub>p</sub> − x̄) = ${fmt(t.M,1)} + ${fmt(g.res.Vu,1)}·(${fmt(sec.cx,3)} − ${fmt(sec.xbar,3)})` : `M<sub>x</sub> − V<sub>u</sub>·(z<sub>p</sub> − z̄) = ${fmt(t.M,1)} − ${fmt(g.res.Vu,1)}·(${fmt(sec.cz,3)} − ${fmt(sec.zbar,3)})`} — R8.4.4.2.3</td><td class="num">${fmt(t.Mc,1)} kN·m</td></tr>
    <tr><td>b<sub>1</sub>, b<sub>2</sub> (${name})</td><td class="clause">section extent ${sym === 'z' ? 'along x, along z' : 'along z, along x'}</td><td class="num">${fmt(t.b1 * 1000,0)}, ${fmt(t.b2 * 1000,0)} mm</td></tr>
    <tr><td>γ<sub>v</sub> (${name})</td><td class="clause">1 − 1/(1 + (2/3)√(b<sub>1</sub>/b<sub>2</sub>)) — §8.4.2.2.2</td><td class="num">${fmt(t.gv,3)}</td></tr>
    <tr><td>J<sub>c</sub> (${name})</td><td class="clause">Σ sides about the centroid (R8.4.4.2.3)</td><td class="num">${fmt(t.J * 1e12 / 1e9,3)} ×10⁹ mm⁴</td></tr>
    <tr><td>γ<sub>v</sub>·M<sub>c</sub>·c/J<sub>c</sub> (${name})</td><td class="clause">c = ${fmt(t.c * 1000,0)} mm to the governing point</td><td class="num">${fmt(t.v,3)} MPa</td></tr>`;
  html += introPara(`Combined shear stress (§8.4.4.2): the moments at the base of the pedestal are moved to the centroid of the critical section (Commentary R8.4.4.2.3), v = V<sub>u</sub>/(b<sub>o</sub>·d) + γ<sub>v</sub>·M<sub>z,c</sub>·(x − x̄)/J<sub>z</sub> − γ<sub>v</sub>·M<sub>x,c</sub>·(z − z̄)/J<sub>x</sub>, checked at the ends of every side. Governing point (${fmt(ecc.at.x,3)}, ${fmt(ecc.at.z,3)}) m: v<sub>u</sub> = ${fmt(ecc.vu,3)} MPa; UC = v<sub>u</sub> / (φ·v<sub>c</sub>) = ${fmt(uc,3)}.`);
  html += `<div class="overflow-x"><table class="calc-table">
    <caption>Combined shear stress</caption>
    <tr><th>Parameter</th><th>Expression</th><th>Value</th></tr>
    <tr><td>V<sub>u</sub></td><td class="clause">from soil pressure, LRFD</td><td class="num">${fmt(g.res.Vu,1)} kN</td></tr>
    <tr><td>Direct shear stress</td><td class="clause">V<sub>u</sub>/(b<sub>o</sub>·d)</td><td class="num">${fmt(ecc.vDirect,3)} MPa</td></tr>
    ${termRows(ecc.terms[0], 'M<sub>z</sub>', 'M<sub>uz</sub>', 'z')}
    ${termRows(ecc.terms[1], 'M<sub>x</sub>', 'M<sub>ux</sub>', 'x')}
    <tr class="governing"><td>Combined stress, v<sub>u</sub></td><td class="clause">max over the ends of the sides</td><td class="num">${fmt(ecc.vu,3)} MPa</td></tr>
    <tr><td>φ·v<sub>c</sub></td><td class="clause">0.75 × ${fmt(cap.vc_gov,3)}</td><td class="num">${fmt(cap.phiVc_stress,3)} MPa</td></tr>
    <tr class="governing"><td>UC</td><td class="clause">v<sub>u</sub> / (φ·v<sub>c</sub>)</td><td class="num">${fmt(uc,3)}</td></tr>
  </table></div>`;
  html += soilShearHtml(pv);
  lastResults.twoway.viz = { ...vizBase({ h: num('tw-h'), cc: num('tw-cc'), Dbar: num('tw-D'), d: dmm }, pv.point), kind: 'twoway', src: 'soil',
    loc: sec.loc, alphaS: sec.alphaS, bo: sec.bo, boFormula: null, rect: sec.rect, free: sec.free,
    Vu: g.res.Vu, phiVc: cap.phiVc, vu: ecc.vu, phiVcStress: cap.phiVc_stress, uc, pass, combo: comboLabel(g.combo),
    plane: vizPlane(g.it), w: g.it.w, piles: null, dp: 0 };
  lastResults.twoway.limit = 'Critical section at d/2 from the pedestal faces; a side closer than d/2 to the footing edge is dropped (edge = 3 sides, corner = 2 sides, α<sub>s</sub> 30 / 20). The unbalanced moments are moved to the centroid of the critical section and the stress is checked at the ends of every side; γ<sub>f</sub> is not increased per §8.4.2.2.4. V<sub>u</sub> = net soil pressure outside the section. A section spanning two opposite edges is not a two-way case — one-way shear governs.' + (pv.point ? ' Several load points: each point load is spread uniformly over its footprint; V<sub>u</sub> = the loads inside the section − the net pressure inside it, the moments shared out by the point shares.' : '');
  const effHtml = efficiencyBadge(uc, pass);
  document.getElementById('opt-twoway').innerHTML = effHtml ? `<div class="section-label">Optimization Notes</div>${effHtml}` : '';
  document.getElementById('calc-twoway').innerHTML = numberTables(html, '6');
  renderCh6Limits();
}
