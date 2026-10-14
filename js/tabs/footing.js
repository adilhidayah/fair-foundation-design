// Spread footing (shallow foundation) design from the soil pressure — 5B flexure, and the V_u source "From soil pressure" of the
// one-way / punching shear checks. The contact pressure and the actions at the pedestal live in lib/foundation/shared/spreadFooting.js;
// this file reads the inputs, runs it for every factored (LRFD) combination and renders the tables. Declarations only (wiring in app.js).
import { eccentricPunchingStress, flexuralDesign, footingActions, soilPressure, stdComboVector } from '../../lib/foundation/index.js?v=20261014l';
import { escapeHtml, getRadioVal, num } from '../core/dom.js?v=20261014l';
import { fmt } from '../core/format.js?v=20261014l';
import { comboState, lastResults, state } from '../core/state.js?v=20261014l';
import { comboLabel, numberTables, sectionHeader } from '../core/worksheet.js?v=20261014l';
import { buildPedestalComboBase, buildStdComboBase } from '../tabs/combos.js?v=20261014l';

// Contact pressure of every LRFD combination at the underside of the footing. Loads: the same biaxial vectors as 4A / 5A (Section 03),
// P = total vertical load incl. the self-weight dW; moments about the footing centre = load-point moments + the offset of the column
// load (Mz,c = Mz + P_col·x_p, Mx,c = Mx − P_col·z_p, the sign convention of the pile group model). w = the factored uniform weight of
// footing + backfill (the pedestal weight belongs to the column load): it is carried by the footing itself, so the cantilevers see
// q_net = q − w.
export function soilFootingCases() {
  const B = num('fs-Bf'), L = num('fs-Lf');
  const hasPed = getRadioVal('fs-type') === 'pedestal';
  const at = hasPed ? { x: num('fs-OffX'), z: num('fs-OffZ') } : { x: 0, z: 0 };
  const c1 = num('rb-Bp') / 1000, c2 = num('rb-Lp') / 1000;
  if (!(B > 0 && L > 0)) return { valid: false, note: 'B_f and L_f (Tab 02) must be greater than zero.' };
  if (!(c1 > 0 && c2 > 0)) return { valid: false, note: 'The pedestal / column size B_p × L_p must be greater than zero.' };
  if (comboState.lrfd.length === 0) return { valid: false, note: 'No factored (LRFD) combinations — load them with "Edit LRFD Combinations".' };
  const dW = num('lc-dW'), Wuni = Math.max(dW - (state.pedW || 0), 0);
  const footBase = buildStdComboBase(), pedBase = buildPedestalComboBase();
  const items = comboState.lrfd.map(combo => {
    const v = stdComboVector(combo.f, footBase), vp = stdComboVector(combo.f, pedBase);
    const P = v.P + v.dP, Mx = v.Mx + v.dMx, Mz = v.Mz + v.dMz;
    const fD = dW > 0 ? v.dP / dW : 0, w = fD * Wuni / (B * L), Pcol = P - fD * Wuni;
    const Mzc = Mz + Pcol * at.x, Mxc = Mx - Pcol * at.z;
    const soil = soilPressure({ B, L, P, Mx: Mxc, Mz: Mzc });
    return { combo, P, Pcol, Mx: Mxc, Mz: Mzc, fD, w, soil, pedMx: vp.Mx + vp.dMx, pedMz: vp.Mz + vp.dMz };
  });
  return { valid: true, B, L, at, c1, c2, items, hasPed };
}
const actionsOf = (cs, it, dx, dz, dPunch) => footingActions({ B: cs.B, L: cs.L, plane: it.soil.plane, w: it.w, ped: { cx: cs.at.x, cz: cs.at.z, c1: cs.c1, c2: cs.c2 }, dx, dz, dPunch });

// ----- V_u for the one-way / punching checks -----
export function soilOneWay({ axis, h, cc, Dbar }) { // axis 'x' | 'y' (y = z)
  const cs = soilFootingCases();
  if (!cs.valid) return { valid: false, note: cs.note };
  const d = (h - cc - Dbar) / 1000;
  if (!(d > 0)) return { valid: false, note: 'Effective depth d must be greater than zero.' };
  const ax = axis === 'x' ? 'x' : 'z';
  const per = cs.items.map(it => ({ combo: it.combo, item: it, invalid: it.soil.valid ? null : it.soil.note,
    res: it.soil.valid ? { Vu: actionsOf(cs, it, d, d, d)[ax].Vu } : null }));
  const ok = per.filter(p => p.res);
  if (!ok.length) return { valid: false, note: 'No combination keeps contact with the soil — see 4A.' };
  const gov = ok.reduce((a, b) => (b.res.Vu > a.res.Vu ? b : a));
  return { valid: true, source: 'soil', kind: 'one-way', axis, d, per, gov, Vu: gov.res.Vu, invalid: per.filter(p => p.invalid), cs };
}
export function soilPunching({ c1, c2, h, cc, Dbar, loc }) { // c1, c2 in mm
  const cs = soilFootingCases();
  if (!cs.valid) return { valid: false, note: cs.note };
  const d = (h - cc - Dbar) / 1000;
  if (!(d > 0)) return { valid: false, note: 'Effective depth d must be greater than zero.' };
  const per = cs.items.map(it => {
    if (!it.soil.valid) return { combo: it.combo, item: it, invalid: it.soil.note, res: null, Mx: it.pedMx, Mz: it.pedMz, ecc: null };
    const Vu = actionsOf(cs, it, d, d, d).punch.Vu;
    const ecc = eccentricPunchingStress({ c1, c2, d: d * 1000, Vu, Mx: it.pedMx, Mz: it.pedMz, loc });
    return { combo: it.combo, item: it, invalid: null, res: { Vu, valid: true }, Mx: it.pedMx, Mz: it.pedMz, ecc };
  });
  const ok = per.filter(p => p.res);
  if (!ok.length) return { valid: false, note: 'No combination keeps contact with the soil — see 4A.' };
  const key = (p) => (p.ecc && p.ecc.valid ? p.ecc.vu : p.res.Vu);
  const gov = ok.reduce((a, b) => (key(b) > key(a) ? b : a));
  return { valid: true, source: 'soil', kind: 'punching', d, c1: c1 / 1000, c2: c2 / 1000, per, gov, Vu: gov.res.Vu, Mx: gov.Mx, Mz: gov.Mz, invalid: per.filter(p => p.invalid), cs };
}
// Table of the contact pressure and V_u of every combination (shown under the one-way / punching results).
export function soilShearHtml(pv) {
  const one = pv.kind === 'one-way', g = pv.gov, cs = pv.cs;
  const sec = one ? `at d = ${fmt(pv.d * 1000, 0)} mm from the pedestal face (${pv.axis === 'x' ? 'sections ⟂ x' : 'sections ⟂ z'}, whole footing width)` : `inside the perimeter at d/2 = ${fmt(pv.d * 500, 0)} mm from the pedestal faces`;
  let html = `<div class="lc-formula">
    <div class="lc-formula-title">V<sub>u</sub> from the soil pressure — factored (LRFD) combinations, governing ${escapeHtml(comboLabel(g.combo))}</div>
    Contact pressure q under the rigid footing from P and the biaxial moments at the underside (no tension: partial contact is solved), net of the factored footing + backfill weight w: q<sub>net</sub> = q − w.<br>
    ${one ? 'V<sub>u</sub> = ∫ q<sub>net</sub> dA over the footing beyond the section ' + sec : 'V<sub>u</sub> = (P − w·B<sub>f</sub>·L<sub>f</sub>) − ∫ q<sub>net</sub> dA ' + sec}<br>
    → V<sub>u</sub> = <strong>${fmt(pv.Vu, 1)} kN</strong>
    <div class="lc-formula-where">The pedestal weight is part of the column load. Footing size B<sub>f</sub> × L<sub>f</sub> = ${fmt(cs.B, 2)} × ${fmt(cs.L, 2)} m, pedestal ${fmt(cs.c1 * 1000, 0)} × ${fmt(cs.c2 * 1000, 0)} mm at (${fmt(cs.at.x, 2)}, ${fmt(cs.at.z, 2)}) m.${one ? '' : ' The unbalanced moments are those at the base of the pedestal (Section 03).'}</div>
  </div>`;
  html += `<div class="overflow-x"><table class="calc-table">
    <caption>V<sub>u</sub> per LRFD combination — contact pressure at the underside${one ? '' : ' and the combined stress v<sub>u</sub> (§8.4.4.2); governing = largest v<sub>u</sub>'}</caption>
    <tr><th>Combination</th><th>P (kN)</th><th>e<sub>x</sub> (m)</th><th>e<sub>z</sub> (m)</th><th>q<sub>max</sub> (kPa)</th><th>Contact</th><th>V<sub>u</sub> (kN)</th>${one ? '' : '<th>M<sub>x</sub> (kN·m)</th><th>M<sub>z</sub> (kN·m)</th><th>v<sub>u</sub> (MPa)</th>'}</tr>
    ${pv.per.map(p => p.invalid
      ? `<tr><td>${escapeHtml(comboLabel(p.combo))}</td><td class="num">${fmt(p.item.P, 1)}</td><td colspan="${one ? 5 : 8}">${escapeHtml(p.invalid)}</td></tr>`
      : `<tr class="${p === g ? 'governing' : ''}"><td>${escapeHtml(comboLabel(p.combo))}</td><td class="num">${fmt(p.item.P, 1)}</td><td class="num">${fmt(p.item.soil.ex, 3)}</td><td class="num">${fmt(p.item.soil.ez, 3)}</td><td class="num">${fmt(p.item.soil.qmax, 1)}</td><td class="num">${fmt(p.item.soil.contactFraction * 100, 0)} %</td><td class="num">${fmt(p.res.Vu, 1)}</td>${one ? '' : `<td class="num">${fmt(p.Mx, 1)}</td><td class="num">${fmt(p.Mz, 1)}</td><td class="num">${p.ecc && p.ecc.valid ? fmt(p.ecc.vu, 3) : '—'}</td>`}</tr>`).join('')}
  </table></div>`;
  if (pv.invalid.length) html += `<div class="warn-box"><strong>⚠  Combination(s) without a contact-pressure solution:</strong> ${pv.invalid.map(p => `${escapeHtml(comboLabel(p.combo))}: ${escapeHtml(p.invalid)}`).join('; ')} — not included above; the check cannot be PASS until the footing keeps contact (enlarge it, see 4A).</div>`;
  return html;
}

// ----- 5B.3 footing flexure (bottom AND top steel, both directions) -----
// Result lastResults.pileCapRebar (key kept for the status panel / report) with label "Footing Reinforcement"; .design = the steel per
// direction (read back by the one-way shear check for ρw), .invalidCombos = combinations that lose contact entirely.
export function calcFootingFlexure({ fc, fy, Bp, Lp }) {
  let html = sectionHeader('5B.3', 'Footing Flexure', 'Bottom and top reinforcement in both directions from the soil pressure of the factored combinations at the pedestal faces — ACI 318M-19 §13.2.7.1 (critical section at the face of the pedestal / column).', true);
  const Lcap = num('rb-Lcap'), Bcap = num('rb-Bcap'), t = num('rb-t'), cc = num('rb-cc'), capBar = num('rb-capbar');
  const d = t - cc - capBar;
  lastResults.pileCapRebar = { label: 'Footing Reinforcement', status: 'ERROR', metric: '—', detail: 'Not yet computed.', invalidCombos: 0, design: null };
  const fail = (box, detail) => { lastResults.pileCapRebar.detail = detail; document.getElementById('calc-rebarcap').innerHTML = numberTables(html + box, '5B'); };
  if (d - capBar <= 0) return fail(`<div class="warn-box"><strong>⚠  Invalid section:</strong> effective depth d = t − cc − d<sub>b</sub> = ${fmt(d, 0)} mm (z-direction inner layer ${fmt(d - capBar, 0)} mm) is zero or negative.</div>`, 'Invalid section (d ≤ 0).');
  if (Bp <= 0 || Lp <= 0 || Lcap <= 0 || Bcap <= 0) return fail(`<div class="warn-box"><strong>⚠  Invalid input:</strong> the pedestal size and the footing size (from "02 — FOUNDATION DIMENSION") must be greater than zero.</div>`, 'Invalid input (pedestal / footing size must be > 0).');
  const cs = soilFootingCases();
  if (!cs.valid) return fail(`<div class="warn-box"><strong>⚠  ${escapeHtml(cs.note)}</strong></div>`, cs.note);
  const results = cs.items.map(it => {
    if (!it.soil.valid) return { it, name: comboLabel(it.combo), invalid: it.soil.note, m: { xb: 0, xt: 0, yb: 0, yt: 0 } };
    const a = actionsOf(cs, it, 0, 0, 0);
    return { it, name: comboLabel(it.combo), invalid: null, m: { xb: a.x.bottom, xt: a.x.top, yb: a.z.bottom, yt: a.z.top } };
  });
  const invalid = results.filter(r => r.invalid);
  if (invalid.length) html += `<div class="warn-box"><strong>⚠  Combination(s) without a contact-pressure solution:</strong> ${invalid.map(r => `${escapeHtml(r.name)}: ${escapeHtml(r.invalid)}`).join('; ')} — they are not designed here; the footing loses contact (enlarge it, see 4A), so this check cannot be PASS.</div>`;
  const valid = results.filter(r => !r.invalid);
  const CASES = [
    { key: 'xb', lbl: 'x', face: 'bottom', title: 'x-direction — bottom', b: Lcap, dEff: d },
    { key: 'yb', lbl: 'z', face: 'bottom', title: 'z-direction — bottom', b: Bcap, dEff: d - capBar },
    { key: 'xt', lbl: 'x', face: 'top', title: 'x-direction — top', b: Lcap, dEff: d },
    { key: 'yt', lbl: 'z', face: 'top', title: 'z-direction — top', b: Bcap, dEff: d - capBar }
  ];
  const Abar = Math.PI / 4 * capBar * capBar;
  CASES.forEach(c => {
    c.gov = valid.length ? valid.reduce((a, b2) => (b2.m[c.key] > a.m[c.key] ? b2 : a)) : { name: '—', m: { [c.key]: 0 } };
    c.Mu = c.gov.m[c.key];
    c.required = c.face === 'bottom' || c.Mu > 1e-6;
    c.design = c.required ? flexuralDesign(c.Mu, c.b, c.dEff, t, fc, fy) : null;
    if (c.design && c.design.ok) { c.n = Math.ceil(c.design.As / Abar); c.spacing = c.b / (c.n + 1); }
  });
  const tooSmall = CASES.filter(c => c.design && !c.design.ok);
  tooSmall.forEach(c => { html += `<div class="warn-box"><strong>⚠  Section too small (${c.title}):</strong> M<sub>u</sub> = ${fmt(c.Mu, 1)} kN·m exceeds what this thickness / width can resist even over-reinforced — increase H<sub>f</sub> (Tab 02).</div>`; });
  const status = tooSmall.length ? 'FAIL' : (invalid.length || !valid.length ? 'ERROR' : 'PASS');
  const barTxt = (c) => (c.design && c.design.ok ? `${c.n} — D${fmt(capBar, 0)} @ ~${fmt(c.spacing, 0)}mm` : '—');
  const topCases = CASES.filter(c => c.face === 'top' && c.required);
  lastResults.pileCapRebar = {
    label: 'Footing Reinforcement', status, invalidCombos: invalid.length,
    design: { x: CASES[0].design && CASES[0].design.ok ? { As: CASES[0].design.As, b: Lcap } : null, z: CASES[1].design && CASES[1].design.ok ? { As: CASES[1].design.As, b: Bcap } : null },
    metric: tooSmall.length ? 'SECTION TOO SMALL' : `x ${barTxt(CASES[0])}; z ${barTxt(CASES[1])}${topCases.length ? '; top ' + topCases.map(c => `${c.lbl} ${barTxt(c)}`).join(', ') : ''}`,
    detail: CASES.filter(c => c.design && c.design.ok).map(c => `${c.lbl}-${c.face}: M_u=${fmt(c.Mu, 1)}kN·m (${c.gov.name}), A_s=${fmt(c.design.As, 0)}mm²`).join(' | ')
      + (invalid.length ? ` | ${invalid.length} combination(s) lose contact` : '') + (tooSmall.length ? ' | section too small: ' + tooSmall.map(c => c.title).join(', ') : '')
  };
  const minClear = Math.max(25, capBar);
  const tight = CASES.filter(c => c.required && c.design && c.design.ok && (c.spacing - capBar) < minClear - 1e-9);
  lastResults.pileCapRebar.notices = tight.length ? [{ title: 'Footing bar spacing', text: `Clear spacing < ${fmt(minClear, 0)} mm = max(25 mm, d_b) (ACI 318M-19 §25.2.1): ${tight.map(c => `${c.title} ${fmt(c.spacing - capBar, 0)} mm (${c.n} × D${fmt(capBar, 0)})`).join('; ')} — use a larger bar or a second layer.` }] : [];

  html += `<div class="lc-formula">
    <div class="lc-formula-title">Flexure at the pedestal faces</div>
    Contact pressure q from P and the biaxial moments at the underside (rigid footing, no tension — partial contact is solved), net of the factored footing + backfill weight w: q<sub>net</sub> = q − w.<br>
    M<sub>u</sub> = ∫ q<sub>net</sub>·(distance to the face) dA over the cantilever beyond the face of the pedestal (B<sub>p</sub>/2 = ${fmt(cs.c1 / 2, 3)} m in x, L<sub>p</sub>/2 = ${fmt(cs.c2 / 2, 3)} m in z, from the pedestal centre at (${fmt(cs.at.x, 2)}, ${fmt(cs.at.z, 2)}) m), over the full footing width;
    net &gt; 0 → sagging, bottom steel; net &lt; 0 → hogging, top steel.  A<sub>s</sub> from R<sub>u</sub> = M<sub>u</sub>/(π·b·d²), π = 0.9, A<sub>s,min</sub> = max(0.0018·b·t, 1.4·b·d/f<sub>y</sub>)
    <div class="lc-formula-where">d = t − cc − d<sub>b</sub> = ${fmt(d, 0)} mm (x-direction, outer layer); z-direction bars are the inner layer, d − d<sub>b</sub> = ${fmt(d - capBar, 0)} mm. b = footing width perpendicular to the bending (L<sub>f</sub> for x, B<sub>f</sub> for z).</div>
  </div>`;
  html += `<div class="overflow-x"><table class="calc-table">
    <caption>Contact pressure of the factored combinations (P = total load at the underside incl. the self-weight; moments about the footing centre incl. the pedestal offset)</caption>
    <tr><th>Combination</th><th>P (kN)</th><th>e<sub>x</sub> (m)</th><th>e<sub>z</sub> (m)</th><th>q<sub>max</sub> (kPa)</th><th>Contact</th><th>w (kPa)</th></tr>
    ${results.map(r => r.invalid ? `<tr><td>${escapeHtml(r.name)}</td><td class="num">${fmt(r.it.P, 1)}</td><td colspan="5">${escapeHtml(r.invalid)}</td></tr>`
      : `<tr><td>${escapeHtml(r.name)}</td><td class="num">${fmt(r.it.P, 1)}</td><td class="num">${fmt(r.it.soil.ex, 3)}</td><td class="num">${fmt(r.it.soil.ez, 3)}</td><td class="num">${fmt(r.it.soil.qmax, 1)}</td><td class="num">${fmt(r.it.soil.contactFraction * 100, 0)} %</td><td class="num">${fmt(r.it.w, 1)}</td></tr>`).join('')}
  </table></div>`;
  html += `<div class="overflow-x"><table class="calc-table">
    <caption>Recommended footing flexural reinforcement (M<sub>u</sub> factored, LRFD)</caption>
    <tr><th>Section</th><th>Governing combination</th><th>M<sub>u</sub> (kN·m)</th><th>b (mm)</th><th>d (mm)</th><th>A<sub>s</sub> req. (mm²)</th><th>A<sub>s,min</sub> (mm²)</th><th>A<sub>s</sub> gov. (mm²)</th><th>Bars</th></tr>
    ${CASES.map(c => {
      if (!c.required) return `<tr><td>${c.title}</td><td colspan="8">Not required — the net pressure never produces hogging beyond the pedestal face. Provide the minimum / detailing top steel per the project.</td></tr>`;
      if (!c.design.ok) return `<tr class="governing"><td>${c.title}</td><td>${escapeHtml(c.gov.name)}</td><td class="num">${fmt(c.Mu, 1)}</td><td class="num">${fmt(c.b, 0)}</td><td class="num">${fmt(c.dEff, 0)}</td><td colspan="4">SECTION TOO SMALL</td></tr>`;
      return `<tr class="governing"><td>${c.title}</td><td>${escapeHtml(c.gov.name)}</td><td class="num">${fmt(c.Mu, 1)}</td><td class="num">${fmt(c.b, 0)}</td><td class="num">${fmt(c.dEff, 0)}</td><td class="num">${fmt(c.design.AsCalc, 0)}</td><td class="num">${fmt(Math.max(c.design.AsMinTS, c.design.AsMinFlex), 0)}</td><td class="num">${fmt(c.design.As, 0)}</td><td class="num">${barTxt(c)}</td></tr>`;
    }).join('')}
  </table></div>`;
  html += `<div class="overflow-x"><table class="calc-table">
    <caption>Footing factored moment per LRFD combination (kN·m)</caption>
    <tr><th>Combination</th>${CASES.map(c => `<th>${c.title.replace(' — ', '<br>')}</th>`).join('')}</tr>
    ${results.map(r => `<tr><td>${escapeHtml(r.name)}</td>${CASES.map(c => `<td class="num">${r.invalid ? '—' : (r.m[c.key] > 1e-6 || c.face === 'bottom' ? (r === c.gov && c.required ? `<strong>${fmt(r.m[c.key], 1)}</strong>` : fmt(r.m[c.key], 1)) : '—')}</td>`).join('')}</tr>`).join('')}
  </table></div>`;
  html += `<div class="limits-box">
    <strong>Limitation:</strong> Rigid footing on a linear contact pressure (no soil springs); the pressure uses the factored loads of Section 03 at the underside including the factored self-weight, so it is an ultimate-level distribution — the allowable bearing pressure is checked in 4A at service level. Critical sections are the pedestal faces (full width, one bar layer); cap self-weight and backfill are deducted as a uniform pressure w (the pedestal weight is a column load). Both directions use x-direction bars as the outer layer and z-direction bars as the inner layer (d − d<sub>b</sub>). Top steel is designed only where the net pressure produces hogging; minimum top steel for crack control is not added. The minimum steel is max(0.0018·b·t, 1.4·b·d/f<sub>y</sub>) — check it against the project requirement for footings. Check bar spacing, development length and the edge cover in the detailing. One-way and punching shear of the footing are checked separately in this tab, with V<sub>u</sub> from the same pressure.
  </div>`;
  document.getElementById('calc-rebarcap').innerHTML = numberTables(html, '5B');
}
