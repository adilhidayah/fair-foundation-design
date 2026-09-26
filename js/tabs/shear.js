// Pile cap one-way and punching shear (5B).
// Moved from app.js — function/const declarations only; event wiring stays in app.js.
import { eccentricPunchingStress, evaluatePileGroupCombo, oneWayPileShear, oneWayShearCheck, punchingPileShear, stdComboVector, twoWayShearCheck } from '../../lib/foundation/index.js?v=20260927b';
import { escapeHtml, getRadioVal, num } from '../core/dom.js?v=20260927b';
import { fmt } from '../core/format.js?v=20260927b';
import { lastResults, pileList } from '../core/state.js?v=20260927b';
import { chapterHeader, comboLabel, efficiencyBadge, numberTables, sectionHeader } from '../core/worksheet.js?v=20260927b';
import { pileComboLoads } from '../tabs/pile.js?v=20260927b';
import { buildPedestalComboBase } from '../tabs/combos.js?v=20260927b';

// ----- V_u from the pile reactions of the factored (LRFD) combinations — 5B pile cap -----
// The pile forces are those of evaluatePileGroupCombo() (biaxial, incl. the moment of the load point off the group
// centroid); capacities are irrelevant here. The lib does the section geometry and the d_p/2 interpolation
// (lib/foundation/shared/pileCapShear.js) — this only reads the inputs and picks the governing combination.
const NO_CAP = { Qc: 1e12, Qt: 1e12, Ql: 1e12 };
function pileReactionsLrfd() {
  const { at, items } = pileComboLoads('lrfd');
  if (pileList.length === 0) return { valid: false, note: 'No piles defined — add piles in 4B.' };
  if (items.length === 0) return { valid: false, note: 'No factored (LRFD) combinations — load them with "Edit LRFD Combinations".' };
  const dp = num('pf-dia') / 1000;
  if (!(dp > 0)) return { valid: false, note: 'Pile diameter D is not set (01 — General Input Data).' };
  const evals = items.map(({ combo, load }) => ({ combo, load, ev: evaluatePileGroupCombo(pileList, load, NO_CAP) }));
  return { valid: true, at, dp, evals };
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
  const half = (axis === 'x' ? num('rb-Bp') : num('rb-Lp')) / 2000; // pedestal size from 5A, mm -> half-size in m
  const center = axis === 'x' ? base.at.x : base.at.y;
  const per = base.evals.map(e => ({ combo: e.combo, invalid: e.ev.valid ? null : e.ev.note,
    res: e.ev.valid ? oneWayPileShear({ pileForces: e.ev.pileForces, axis, center, half, d, dp: base.dp }) : null }));
  const gov = governingOf(per);
  if (!gov) return { valid: false, note: 'Pile force distribution invalid for every combination.' };
  return { valid: true, kind: 'one-way', axis, d, half, center, dp: base.dp, per, gov, Vu: gov.res.Vu, invalid: per.filter(p => p.invalid) };
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
  const per = base.evals.map(e => {
    const res = e.ev.valid ? punchingPileShear({ pileForces: e.ev.pileForces, cx: base.at.x, cy: base.at.y, c1: c1 / 1000, c2: c2 / 1000, d, dp: base.dp }) : null;
    const v = stdComboVector(e.combo.f, pedBase);
    const Mx = v.Mx + v.dMx, Mz = v.Mz + v.dMz;
    const ecc = res && res.valid ? eccentricPunchingStress({ c1, c2, d: d * 1000, Vu: res.Vu, Mx, Mz, loc }) : null;
    return { combo: e.combo, invalid: e.ev.valid ? null : e.ev.note, res, Mx, Mz, ecc };
  });
  const ok = per.filter(p => p.res && p.res.valid);
  if (!ok.length) return { valid: false, note: 'Pile force distribution invalid for every combination.' };
  const key = (p) => (p.ecc && p.ecc.valid ? p.ecc.vu : p.res.Vu);
  const gov = ok.reduce((a, b) => (key(b) > key(a) ? b : a));
  return { valid: true, kind: 'punching', d, c1: c1 / 1000, c2: c2 / 1000, center: base.at, dp: base.dp, per, gov, Vu: gov.res.Vu,
    Mx: gov.Mx, Mz: gov.Mz, invalid: per.filter(p => p.invalid) };
}
// Preview of the pile-reaction shear: formula + governing-combination pile table + every combination's V_u.
function pileShearHtml(pv) {
  const one = pv.kind === 'one-way', g = pv.gov;
  const coordName = one ? (pv.axis === 'x' ? 'x' : 'z') : '';
  let html = `<div class="lc-formula">
    <div class="lc-formula-title">V<sub>u</sub> from pile reactions — factored (LRFD) combinations, governing ${escapeHtml(comboLabel(g.combo))}</div>`;
  if (one) {
    html += `Critical sections at d from the pedestal face: ${coordName}<sub>±</sub> = ${coordName}<sub>p</sub> ± (${pv.axis === 'x' ? 'B' : 'L'}<sub>p</sub>/2 + d) = ${fmt(pv.center, 3)} ± (${fmt(pv.half, 3)} + ${fmt(pv.d, 3)}) → ${fmt(g.res.pos.plus, 3)} m / ${fmt(g.res.pos.minus, 3)} m<br>`;
  } else {
    html += `Critical perimeter at d/2 from the pedestal faces: half-sizes h<sub>x</sub> = c<sub>1</sub>/2 + d/2 = ${fmt(pv.c1 / 2, 3)} + ${fmt(pv.d / 2, 3)} = ${fmt(g.res.hx, 3)} m, h<sub>z</sub> = c<sub>2</sub>/2 + d/2 = ${fmt(g.res.hy, 3)} m, centred at (${fmt(pv.center.x, 3)}, ${fmt(pv.center.y, 3)}) m<br>`;
  }
  html += `V<sub>u</sub> = Σ F<sub>i</sub>·share<sub>i</sub>,  share = 1 if s ≥ d<sub>p</sub>/2, 0 if s ≤ −d<sub>p</sub>/2, else (s + d<sub>p</sub>/2)/d<sub>p</sub> — s = distance of the pile centre outside the section, d<sub>p</sub> = ${fmt(pv.dp, 3)} m<br>
    → V<sub>u</sub> = <strong>${fmt(pv.Vu, 1)} kN</strong>${one ? ` (${g.res.side} side)` : ''}
    <div class="lc-formula-where">Compression shares and tension shares are not netted; the larger governs. Pile reaction shares follow ACI 318M-19 Ch.13 (pile cap shear — verify the clause number for your edition). ${one ? '' : 'Unbalanced-moment shear stress is not included.'}</div>
  </div>`;
  html += `<div class="overflow-x"><table class="calc-table">
    <caption>${one ? 'One-way' : 'Punching'} shear — pile reactions in the governing combination ${escapeHtml(comboLabel(g.combo))}</caption>
    <tr><th>Pile</th><th>x (m)</th><th>z (m)</th><th>F (kN)</th><th>s (m)</th><th>Share</th><th>Share·F (kN)</th></tr>
    ${g.res.perPile.map(p => `<tr class="${p.frac > 0 ? 'governing' : ''}"><td>${p.i}</td><td class="num">${fmt(p.x, 2)}</td><td class="num">${fmt(p.y, 2)}</td><td class="num">${fmt(p.F, 1)}</td><td class="num">${fmt(p.s, 3)}</td><td class="num">${fmt(p.frac, 2)}</td><td class="num">${fmt(p.F * p.frac, 1)}</td></tr>`).join('')}
  </table></div>`;
  html += `<div class="overflow-x"><table class="calc-table">
    <caption>V<sub>u</sub> per LRFD combination${one ? '' : ' — with the unbalanced moments at the base of the pedestal and the combined stress v<sub>u</sub> (§8.4.4.2); governing = largest v<sub>u</sub>'}</caption>
    <tr><th>Combination</th>${one ? '<th>V<sub>+</sub> (kN)</th><th>V<sub>−</sub> (kN)</th>' : ''}<th>V<sub>u</sub> (kN)</th>${one ? '' : '<th>M<sub>x</sub> (kN·m)</th><th>M<sub>z</sub> (kN·m)</th><th>v<sub>u</sub> (MPa)</th>'}</tr>
    ${pv.per.map(p => p.invalid
      ? `<tr><td>${escapeHtml(comboLabel(p.combo))}</td><td colspan="${one ? 3 : 4}">${escapeHtml(p.invalid)}</td></tr>`
      : `<tr class="${p === g ? 'governing' : ''}"><td>${escapeHtml(comboLabel(p.combo))}</td>${one ? `<td class="num">${fmt(p.res.Vpos, 1)}</td><td class="num">${fmt(p.res.Vneg, 1)}</td>` : ''}<td class="num">${fmt(p.res.Vu, 1)}</td>${one ? '' : `<td class="num">${fmt(p.Mx, 1)}</td><td class="num">${fmt(p.Mz, 1)}</td><td class="num">${p.ecc && p.ecc.valid ? fmt(p.ecc.vu, 3) : '—'}</td>`}</tr>`).join('')}
  </table></div>`;
  if (pv.invalid.length) html += `<div class="warn-box"><strong>⚠  Pile force distribution invalid:</strong> ${pv.invalid.map(p => `${escapeHtml(comboLabel(p.combo))}: ${escapeHtml(p.invalid)}`).join('; ')} — not included above.</div>`;
  return html;
}

// Preview structure of chapter 5B (shared by the three 5B panels: one-way, punching, flexure — see rebar.js for 5B.3).
const OW_HEAD = () => chapterHeader('5B. Pile Cap Check', 'This chapter checks the pile cap for one-way shear, punching shear and flexure under the factored LRFD combinations (LC201+) of Section 03, with the shear from the pile reactions where selected. The status of each check is shown in the Design Status panel.')
  + sectionHeader('5B.1', 'One-Way Shear', 'Shear at a distance d from the pedestal face — ACI 318M-19 §22.5.', true);
const TW_HEAD = () => sectionHeader('5B.2', 'Punching Shear', 'Two-way shear on the critical perimeter at d/2 from the pedestal faces, including the unbalanced-moment shear stress — ACI 318M-19 §22.6 and §8.4.4.2.', true);

// oneWayShearCheck() and its bisectMinX() helper now live in lib/foundation/shared/footingCheck.js.
export function calcOneWay() {
  const bw = num('ow-bw'), h = num('ow-h'), cc = num('ow-cc'), Dbar = num('ow-D'), fc = num('gen-fc');
  let vu = num('ow-vu');
  // V_u source: typed in, or from the pile reactions of the factored LRFD combinations (written back into the field).
  const fromPiles = getRadioVal('ow-vu-src') === 'piles';
  document.getElementById('ow-vu').readOnly = fromPiles;
  document.getElementById('ow-vu-piles-fields').style.display = fromPiles ? 'block' : 'none';
  const capW = (getRadioVal('ow-dir') === 'x' ? num('fs-Lf') : num('fs-Bf')) * 1000; // cap width ⟂ the section, mm
  document.getElementById('ow-bw-hint').textContent = fmt(capW, 0);
  const pv = fromPiles ? oneWayVuFromPiles({ axis: getRadioVal('ow-dir'), h, cc, Dbar }) : null;
  if (pv && pv.valid) { vu = pv.Vu; document.getElementById('ow-vu').value = vu.toFixed(1); }
  const rho = num('ow-rho') / 100;
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
    document.getElementById('calc-oneway').innerHTML = OW_HEAD() + `<div class="warn-box"><strong>⚠  V<sub>u</sub> from pile reactions not available:</strong> ${escapeHtml(pv.note)} Switch V<sub>u</sub> to "Manual" or fix the cause.</div>`;
    document.getElementById('opt-oneway').innerHTML = '';
    lastResults.oneway = { label: 'One-Way Shear', status: 'ERROR', metric: '—', detail: 'V_u from pile reactions not available: ' + pv.note };
    return;
  }
  const { d, sqrtfc, vc_lower, vc_upper, vc, lambdaS, detail, phiVc, uc, pass, simplifiedAllowed, hMinRounded } = r;
  lastResults.oneway = { label: 'One-Way Shear', status: pass ? 'PASS' : 'FAIL', metric: `UC = ${fmt(uc,3)}`,
    detail: `b_w=${fmt(bw,0)}mm, d=${fmt(d,0)}mm, V_u=${fmt(vu,1)}kN${pv ? ` (piles, ${comboLabel(pv.gov.combo)})` : ''}, ${method}` };
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
    notices.push({ title: 'One-way shear: web width', text: `bw = ${fmt(bw,0)} mm differs from the pile cap width perpendicular to the section (${fmt(capW,0)} mm, Tab 02) — the capacity is for bw while Vu is the whole-cap shear.` });
  }
  lastResults.oneway.notices = notices;
  let html = OW_HEAD();
  html += `<div class="overflow-x"><table class="calc-table">
    <caption>Calculation — §22.5.5</caption>
    <tr><th>Parameter</th><th>Expression</th><th>Value</th></tr>
    <tr><td>Effective depth, d</td><td class="clause">h - cc - D</td><td class="num">${fmt(d,0)} mm</td></tr>
    <tr><td>↓f'c</td><td class="clause">—</td><td class="num">${fmt(sqrtfc,3)} MPa<sup>0.5</sup></td></tr>`;
  if (method === 'detailed') {
    html += `<tr><td>Size effect factor, λ<sub>s</sub></td><td class="clause">Eq. 22.5.5.1.3</td><td class="num">${fmt(lambdaS,3)}</td></tr>
      <tr><td>ρ<sub>w</sub></td><td class="clause">input</td><td class="num">${fmt(rho*100,3)}%</td></tr>
      <tr><td>V<sub>c</sub>, unbounded</td><td class="clause">0.66λ<sub>s</sub>λ(ρ<sub>w</sub>)<sup>1/3</sup>↓f'c·b<sub>w</sub>·d</td><td class="num">${fmt(0.66 * lambdaS * lambda * Math.pow(Math.max(rho,0.0001),1/3) * sqrtfc * bw * d / 1000,1)} kN</td></tr>`;
  }
  html += `<tr><td>V<sub>c,min</sub></td><td class="clause">0.17λ↓f'c·b<sub>w</sub>·d</td><td class="num">${fmt(vc_lower/1000,1)} kN</td></tr>
    <tr><td>V<sub>c,max</sub></td><td class="clause">0.42λ↓f'c·b<sub>w</sub>·d</td><td class="num">${fmt(vc_upper/1000,1)} kN</td></tr>
    <tr class="governing"><td>V<sub>c</sub>, governing</td><td class="clause">${detail}</td><td class="num">${fmt(vc/1000,1)} kN</td></tr>
    <tr><td>π V<sub>c</sub></td><td class="clause">π  = 0.75</td><td class="num">${fmt(phiVc/1000,1)} kN</td></tr>
    <tr><td>V<sub>u</sub></td><td class="clause">${pv ? 'from pile reactions, LRFD' : 'input'}</td><td class="num">${fmt(vu,1)} kN</td></tr>
  </table></div>`;
  if (pv) html += pileShearHtml(pv);
  html += `<div class="limits-box">
    <strong>Applicability:</strong> Simplified method requires A<sub>v</sub> ≥ A<sub>v,min</sub> provided or overall height h ≤ 250 mm, per Table 22.5.5.1 (checked automatically above from the "Geometry" and "Method" inputs). Detailed method (22.5.5.1.1) governs for shallow, lightly-reinforced sections typical of thin slabs/mats where the simplified V<sub>c</sub> is unconservative.
  </div>`;
  const effHtml = efficiencyBadge(uc, pass);
  document.getElementById('opt-oneway').innerHTML = (effHtml || suggestHtml)
    ? `<div class="section-label">Optimization Notes</div>${effHtml}${suggestHtml}`
    : '';
  document.getElementById('calc-oneway').innerHTML = numberTables(html, '5B');
}
// twoWayShearCheck() lives in lib/foundation/shared/footingCheck.js.
export function calcTwoWay() {
  const c1 = num('tw-c1'), c2 = num('tw-c2'), h = num('tw-h'), cc = num('tw-cc'), Dbar = num('tw-D'), fc = num('gen-fc');
  let vu = num('tw-vu');
  const fromPiles = getRadioVal('tw-vu-src') === 'piles';
  document.getElementById('tw-vu').readOnly = fromPiles;
  document.getElementById('tw-vu-piles-fields').style.display = fromPiles ? 'block' : 'none';
  const loc = getRadioVal('tw-loc');
  const pv = fromPiles ? punchingVuFromPiles({ c1, c2, h, cc, Dbar, loc }) : null;
  // Unbalanced moments for the eccentric shear stress: from the governing LRFD combination at the pedestal base (piles mode,
  // written back into the fields) or typed in (manual mode).
  let Mx = num('tw-mux'), Mz = num('tw-muz');
  document.getElementById('tw-mux').readOnly = fromPiles; document.getElementById('tw-muz').readOnly = fromPiles;
  if (pv && pv.valid) {
    vu = pv.Vu; Mx = pv.Mx; Mz = pv.Mz;
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
  if (pv && !pv.valid) {
    document.getElementById('calc-twoway').innerHTML = TW_HEAD() + `<div class="warn-box"><strong>⚠  V<sub>u</sub> from pile reactions not available:</strong> ${escapeHtml(pv.note)} Switch V<sub>u</sub> to "Manual" or fix the cause.</div>`;
    document.getElementById('opt-twoway').innerHTML = '';
    lastResults.twoway = { label: 'Two-Way (Punching) Shear', status: 'ERROR', metric: '—', detail: 'V_u from pile reactions not available: ' + pv.note };
    return;
  }
  const { d, alphaS, bo, boFormula, beta, sqrtfc, vc_vals, vc_gov, Vc, phiVc, hMinRounded, phi } = r;
  // Combined stress with the unbalanced moments — ACI 318M-19 §8.4.4.2 (interior pedestal); UC = v_u / (φ·v_c).
  const ecc = eccentricPunchingStress({ c1, c2, d, Vu: vu, Mx, Mz, loc });
  if (!ecc.valid) {
    document.getElementById('calc-twoway').innerHTML = TW_HEAD() + `<div class="warn-box"><strong>⚠  Unbalanced-moment shear not available:</strong> ${escapeHtml(ecc.note)} Use "Interior" for a pedestal on a pile cap.</div>`;
    document.getElementById('opt-twoway').innerHTML = '';
    lastResults.twoway = { label: 'Two-Way (Punching) Shear', status: 'ERROR', metric: '—', detail: ecc.note };
    return;
  }
  const phiVcStress = phi * vc_gov;
  const uc = ecc.vu / phiVcStress, pass = uc <= 1.0;
  const hasMoment = ecc.terms.some(t => t.v > 0);
  lastResults.twoway = { label: 'Two-Way (Punching) Shear', status: pass ? 'PASS' : 'FAIL', metric: `UC = ${fmt(uc,3)}`,
    detail: `b_o=${fmt(bo,0)}mm, d=${fmt(d,0)}mm, V_u=${fmt(vu,1)}kN, M_ux=${fmt(Mx,1)}, M_uz=${fmt(Mz,1)}kN·m, v_u=${fmt(ecc.vu,3)}MPa${pv ? ` (piles, ${comboLabel(pv.gov.combo)})` : ''}, ${loc}` };
  let suggestHtml = '';
  if (pass && !hasMoment && hMinRounded !== null && h - hMinRounded >= 50) { // the depth search ignores the moment term
    suggestHtml = `<div class="suggest-box">
      <strong>Depth reduction potential:</strong> minimum h for UC ≤ 1.00, rounded up to the nearest 50 mm, is <strong>${fmt(hMinRounded,0)} mm</strong> (current h = ${fmt(h,0)} mm) — a potential reduction of <strong>${fmt(h - hMinRounded,0)} mm</strong>, holding c<sub>1</sub>, c<sub>2</sub>, cc, D, f'c and λ constant. This ignores unbalanced moment transfer (γ<sub>v</sub>M<sub>u</sub>c/J<sub>c</sub>, §8.4.4.2) and the slab's flexural/deflection requirements — re-check those before reducing h.
    </div>`;
  }
  lastResults.twoway.notices = [];
  let html = TW_HEAD();
  html += `<div class="overflow-x"><table class="calc-table">
    <caption>Critical section geometry — §22.6.4</caption>
    <tr><th>Parameter</th><th>Expression</th><th>Value</th></tr>
    <tr><td>Effective depth, d</td><td class="clause">h - cc - D</td><td class="num">${fmt(d,0)} mm</td></tr>
    <tr><td>α<sub>s</sub></td><td class="clause">§22.6.5.3 (location)</td><td class="num">${alphaS}</td></tr>
    <tr><td>β (long/short side)</td><td class="clause">max(c₁,c₂)/min(c₁,c₂)</td><td class="num">${fmt(beta,3)}</td></tr>
    <tr><td>Critical perimeter, b<sub>o</sub></td><td class="clause">${boFormula}</td><td class="num">${fmt(bo,0)} mm</td></tr>
  </table></div>`;
  html += `<div class="overflow-x"><table class="calc-table">
    <caption>Governing shear stress — Table 22.6.5.2</caption>
    <tr><th>Equation</th><th>Clause</th><th>v<sub>c</sub> (MPa)</th></tr>`;
  vc_vals.forEach(v => {
    const isGov = Math.abs(v.val - vc_gov) < 1e-9;
    html += `<tr class="${isGov ? 'governing' : ''}"><td>${v.label}</td><td class="clause">${v.clause}</td><td class="num">${fmt(v.val,3)}</td></tr>`;
  });
  html += `</table></div>`;
  html += `<div class="overflow-x"><table class="calc-table">
    <caption>Capacity check</caption>
    <tr><th>Parameter</th><th>Expression</th><th>Value</th></tr>
    <tr><td>V<sub>c</sub></td><td class="clause">v<sub>c,gov</sub> · b<sub>o</sub> · d</td><td class="num">${fmt(Vc/1000,1)} kN</td></tr>
    <tr><td>π V<sub>c</sub></td><td class="clause">π  = 0.75</td><td class="num">${fmt(phiVc/1000,1)} kN</td></tr>
    <tr><td>V<sub>u</sub></td><td class="clause">${pv ? 'from pile reactions, LRFD' : 'input'}</td><td class="num">${fmt(vu,1)} kN</td></tr>
  </table></div>`;
  const [tz, tx] = ecc.terms;
  const termRows = (t, name, Mname) => `
    <tr><td>${Mname}</td><td class="clause">${pv ? 'base of pedestal, same LRFD combination (03, Table 3.3.4)' : 'input'}</td><td class="num">${fmt(t.M,1)} kN·m</td></tr>
    <tr><td>b<sub>1</sub>, b<sub>2</sub> (${name})</td><td class="clause">${name === 'M<sub>z</sub>' ? 'c<sub>1</sub> + d, c<sub>2</sub> + d' : 'c<sub>2</sub> + d, c<sub>1</sub> + d'}</td><td class="num">${fmt(t.b1,0)}, ${fmt(t.b2,0)} mm</td></tr>
    <tr><td>γ<sub>v</sub> (${name})</td><td class="clause">1 − 1/(1 + (2/3)√(b<sub>1</sub>/b<sub>2</sub>)) — §8.4.2.2.2</td><td class="num">${fmt(t.gv,3)}</td></tr>
    <tr><td>J<sub>c</sub> (${name})</td><td class="clause">d·b<sub>1</sub>³/6 + b<sub>1</sub>·d³/6 + d·b<sub>2</sub>·b<sub>1</sub>²/2</td><td class="num">${fmt(t.Jc/1e9,3)} ×10⁹ mm⁴</td></tr>
    <tr><td>γ<sub>v</sub>·M<sub>u</sub>·c<sub>AB</sub>/J<sub>c</sub> (${name})</td><td class="clause">c<sub>AB</sub> = b<sub>1</sub>/2 = ${fmt(t.c,0)} mm</td><td class="num">${fmt(t.v,3)} MPa</td></tr>`;
  html += `<div class="overflow-x"><table class="calc-table">
    <caption>Combined shear stress with unbalanced moment — ACI 318M-19 §8.4.4.2 (interior pedestal, both directions added at the corner)</caption>
    <tr><th>Parameter</th><th>Expression</th><th>Value</th></tr>
    <tr><td>Direct shear stress</td><td class="clause">V<sub>u</sub>/(b<sub>o</sub>·d) = ${fmt(vu,1)}·10³/(${fmt(bo,0)}·${fmt(d,0)})</td><td class="num">${fmt(ecc.vDirect,3)} MPa</td></tr>
    ${termRows(tz, 'M<sub>z</sub>', 'M<sub>uz</sub> (bending along x)')}
    ${termRows(tx, 'M<sub>x</sub>', 'M<sub>ux</sub> (bending along z)')}
    <tr class="governing"><td>Combined stress, v<sub>u</sub></td><td class="clause">V<sub>u</sub>/(b<sub>o</sub>d) + Σ γ<sub>v</sub>M<sub>u</sub>c<sub>AB</sub>/J<sub>c</sub></td><td class="num">${fmt(ecc.vu,3)} MPa</td></tr>
    <tr><td>φ·v<sub>c</sub></td><td class="clause">0.75 × ${fmt(vc_gov,3)}</td><td class="num">${fmt(phiVcStress,3)} MPa</td></tr>
    <tr class="governing"><td>UC</td><td class="clause">v<sub>u</sub> / (φ·v<sub>c</sub>)</td><td class="num">${fmt(uc,3)}</td></tr>
  </table></div>`;
  if (pv) html += pileShearHtml(pv);
  html += `<div class="limits-box">
    <strong>Limitation:</strong> The unbalanced-moment shear (eccentric shear stress model, §8.4.4.2) is included for an interior pedestal, with the terms of both directions added at the most stressed corner (conservative). Edge and corner pedestal geometries are not implemented. With V<sub>u</sub> from the pile reactions, V<sub>u</sub> and the moments are taken from the same LRFD combination (moments at the base of the pedestal, incl. H·H<sub>p</sub>), and the governing combination is the one with the largest combined stress.
  </div>`;
  const effHtml = efficiencyBadge(uc, pass);
  document.getElementById('opt-twoway').innerHTML = (effHtml || suggestHtml)
    ? `<div class="section-label">Optimization Notes</div>${effHtml}${suggestHtml}`
    : '';
  document.getElementById('calc-twoway').innerHTML = numberTables(html, '5B');
}
