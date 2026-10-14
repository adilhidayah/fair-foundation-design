// 4A — Shallow foundation stability.
// Moved from app.js — function/const declarations only; event wiring stays in app.js.
import { LOAD_KINDS, bearingCapacityCheck, evaluateBiaxialFooting, evaluateFoundationCombo, stdComboVector } from '../../lib/foundation/index.js?v=20261014b';
import { escapeHtml, getRadioVal, num } from '../core/dom.js?v=20261014b';
import { fmt } from '../core/format.js?v=20261014b';
import { comboState, lastResults, state } from '../core/state.js?v=20261014b';
import { chapterHeader, comboLabel, numberTables, sectionHeader } from '../core/worksheet.js?v=20261014b';
import { foundationDiagramSVG } from '../diagrams/foundationDiagram.js?v=20261014b';
import { buildStdComboBase, untypedLoadTypesWarning } from '../tabs/combos.js?v=20261014b';

// Classifies a load combination as "Temporary" (wind/seismic — a lower minimum FS is conventionally accepted)
// or "Permanent" (static/gravity — the full minimum FS applies), by checking whether any load type with a
// nonzero factor in that combo looks like wind or seismic: known default codes (WX/WZ/EQX(E)/EQZ(E)/EQX(O)/EQZ(O), plus the
// legacy generic W/E used by the Vessel/Tank/Pipe Rack quick generators), or a custom code/label containing
// "wind"/"seismic". This is a heuristic, not a load-type registry field — a custom load type meant to be
// transient but named/labelled without "wind"/"seismic" will be classified Permanent; verify against the
// project design basis before relying on it, per the note in "4A — Foundation Stability".
export const TEMPORARY_LOAD_CODE_RE = /^(W[XZ]?|EQ[XZ]?(\([EO]\))?|V[XZ]|E)$/i;
export const TEMPORARY_LOAD_LABEL_RE = /wind|seismic/i;
export function isTemporaryCombo(combo) {
  return state.lcLoadTypes.some(lt => {
    if (!combo.f[lt.code]) return false;
    // The load type's chosen kind decides (wind/earthquake = temporary); code/label heuristics only for untyped.
    if (LOAD_KINDS[lt.kind]) return LOAD_KINDS[lt.kind].temporary;
    return TEMPORARY_LOAD_CODE_RE.test(lt.code) || TEMPORARY_LOAD_LABEL_RE.test(lt.label);
  });
}
// evaluateFoundationCombo() lives in lib/foundation/shared/stabilityCheck.js.
export function calcFoundation() {
  // Footing/pedestal geometry now comes straight from "02 — FOUNDATION DIMENSION" (fs-Bf/fs-Lf/fs-Hf/fs-Bp/
  // fs-Lp/fs-Gp) instead of its own duplicate input dialog — B/L drive the stability calc below, Bp/Lp/t/hp
  // are still visualization-only, matching Dp/Hp's derivation in foundationSizing()/calcFoundSize().
  const B = num('fs-Bf'), L = num('fs-Lf');
  const hasPed = getRadioVal('fs-type') === 'pedestal';
  const t = num('fs-Hf');
  const Bp = hasPed ? num('fs-Bp') : 0, Lp = hasPed ? num('fs-Lp') : 0;
  const hp = hasPed ? (num('fs-Gp') + (num('fs-Df') - t)) : 0;
  // Allowable bearing capacity is computed fresh from "08 — BEARING CAPACITY (SOIL)" inputs (same call
  // calcBearing() makes) rather than read from a duplicate manual field or a stale one-time "Send q_a" copy —
  // always current, and correct even before that tab has been opened this session.
  const bcShape = getRadioVal('bc-shape');
  const bcB = num('bc-B'), bcL = (bcShape === 'square' || bcShape === 'circular') ? bcB : num('bc-L');
  const qa = bcB > 0 ? bearingCapacityCheck({
    c: num('bc-c'), phiDeg: num('bc-phi'), gamma: num('gen-gs'), shape: bcShape, B: bcB, L: bcL, Df: num('bc-Df'),
    method: getRadioVal('bc-method'), FS: num('bc-FS'), failure: getRadioVal('bc-failure'), beta: num('bc-beta')
  }).qa : 0;
  const mu = num('fd-mu');
  const eccRatioAllow = parseFloat(getRadioVal('fd-ecc'));
  const fsDistinguish = document.getElementById('fd-fsDistinguish').checked;
  const fsSlidePerm = num('fd-fsSlide-perm'), fsSlideTemp = fsDistinguish ? num('fd-fsSlide-temp') : fsSlidePerm;
  const fsOTPerm = num('fd-fsOT-perm'), fsOTTemp = fsDistinguish ? num('fd-fsOT-temp') : fsOTPerm;
  lastResults.foundation = { label: 'Foundation Stability', status: 'ERROR', metric: '—', detail: 'Not yet computed.' };
  if (B <= 0 || L <= 0) {
    document.getElementById('calc-foundation').innerHTML = `<div class="warn-box"><strong>⚠  Invalid input:</strong> B<sub>f</sub> and L<sub>f</sub> (footing width/length, set in "02 — FOUNDATION DIMENSION") must be greater than zero.</div>`;
    lastResults.foundation.detail = 'Invalid input (B, L must be > 0).';
    return;
  }
  if (comboState.lc.length === 0) {
    document.getElementById('calc-foundation').innerHTML = `<div class="warn-box"><strong>⚠  No load combinations:</strong> add at least one combination in the "03 — LOADING DATA" tab.</div>`;
    lastResults.foundation.detail = 'No load combinations defined.';
    return;
  }
  // P/H/M per combination come from the same biaxial Fx/Fz/Mx/Mz vectors as the "Load at bottom of footing"
  // table (03 — Loading Data) — H and M are the resultant magnitudes (sqrt(Fx²+Fz²), sqrt(Mx²+Mz²)) rather
  // than a naive scalar sum of unrelated axes, then fed into the existing uniaxial stability formulas below.
  // Still a simplification (see the Limitation note), but now numerically consistent for the same combo.
  const base = buildStdComboBase();
  const B1 = B / 2, B2 = L / 2; // overturning lever arms — B1 resists M_z (transversal), B2 resists M_x (longitudinal)
  const results = comboState.lc.map(combo => {
    const v = stdComboVector(combo.f, base);
    const Pbot = v.P + v.dP, Mx = v.Mx + v.dMx, Mz = v.Mz + v.dMz;
    const Hbot = Math.sqrt(v.Fx * v.Fx + v.Fz * v.Fz);
    const Mbot = Math.sqrt(Mx * Mx + Mz * Mz);
    // Biaxial kern (ex/ez) and overturning (OM1/2, SF1/2) checks — evaluateBiaxialFooting(), lib/foundation/
    // shared/stabilityCheck.js — supplement evaluateFoundationCombo()'s uniaxial (resultant-M) versions below.
    // Which minimum FS applies is decided per combination (Permanent vs Temporary), not a single project-wide
    // value — see isTemporaryCombo() above.
    const temporary = isTemporaryCombo(combo);
    const fsSlideMin = temporary ? fsSlideTemp : fsSlidePerm;
    const fsOTMin = temporary ? fsOTTemp : fsOTPerm;
    return {
      combo, P: Pbot, H: Hbot, M: Mbot, Mx, Mz, temporary, fsSlideMin, fsOTMin,
      ...evaluateFoundationCombo(B, L, Pbot, Hbot, Mbot, qa, mu, eccRatioAllow, fsSlideMin, fsOTMin),
      ...evaluateBiaxialFooting(B, L, Pbot, Mx, Mz, eccRatioAllow, fsOTMin)
    };
  });
  const governing = results.reduce((a, b) => b.governingUC > a.governingUC ? b : a);
  lastResults.foundation = {
    label: 'Foundation Stability',
    // A combination the lib cannot evaluate (net uplift P ≤ 0, or e > B/2 = complete base separation) is a stability
    // failure, not a pending / input error — report FAIL so the Design Status panel does not show it as PENDING.
    status: !governing.valid ? 'FAIL' : (governing.overallPass ? 'PASS' : 'FAIL'),
    metric: governing.valid ? `UC = ${fmt(governing.governingUC,3)}` : 'UC = ∞ (base separation)',
    detail: governing.valid ? `Governing: ${comboLabel(governing.combo)} — ${governing.governingCheck.name}, B=${fmt(B,2)}m, L=${fmt(L,2)}m` : `${comboLabel(governing.combo)}: ${governing.note}`
  };
  // Preview follows the chapter pattern of 02 / 04 (pile) / 5A / 5B / 09: chapter title, numbered sub-sections, "Table 4.n.m"
  // captions, no verdict box (the status is in the Design Status panel). A combination that cannot be evaluated (net uplift
  // or complete base separation) fails the check (governingUC = Infinity above); it is reported as a notice in the Design
  // Status panel and in its table rows, and 4.1 shows the worst of the combinations that could be evaluated.
  const validResults = results.filter(r => r.valid);
  const invalidResults = results.filter(r => !r.valid);
  const shown = validResults.length ? validResults.reduce((a, b) => b.governingUC > a.governingUC ? b : a) : null;
  lastResults.foundation.notices = invalidResults.map(r => ({
    title: `${comboLabel(r.combo)} — not evaluated`,
    text: `${r.note} This combination fails the stability check; review its factors / loads or enlarge the footing.`
  }));
  const okNg = (uc) => (uc <= 1.0 ? 'OK' : 'NG');
  // Row for a combination that could not be evaluated: the reason spans the data columns, status NG.
  const invalidRow = (r, nData) => `<tr><td class="lc-no">${escapeHtml(r.combo.lc || '')}</td><td>${escapeHtml(r.combo.name)}</td><td colspan="${nData}" class="clause">${escapeHtml(r.note || 'Not evaluated.')}</td><td>NG</td></tr>`;
  let html = chapterHeader('04. Foundation Stability',
    `This chapter checks the shallow footing (B<sub>f</sub> × L<sub>f</sub> = ${fmt(B,2)} × ${fmt(L,2)} m, Section 02) under the ASD load combinations of Section 03: eccentricity (kern), bearing pressure against q<sub>a</sub> = ${fmt(qa,1)} kPa (Section 08), sliding and overturning. Loads are taken at the bottom of the footing, including the footing / pedestal self-weight ΔW and H·Δh.`);
  html += untypedLoadTypesWarning();
  html += sectionHeader('4.1', 'Governing Load Combination', shown
    ? `Combination with the highest utilization${invalidResults.length ? ' among those that could be evaluated' : ''}: ${escapeHtml(comboLabel(shown.combo))}, governed by ${shown.governingCheck.name.toLowerCase()}.${invalidResults.length ? ` ${invalidResults.length} combination(s) could not be evaluated (${invalidResults.map(r => escapeHtml(r.combo.lc || r.combo.name)).join(', ')}) and fail the check — see the tables below and the Design Status panel.` : ''}`
    : 'No combination could be evaluated — see the tables below and the Design Status panel.', true);
  if (shown) {
    html += foundationDiagramSVG(B, L, Bp, Lp, t, hp, shown.Habs, shown.Mabs, shown.e, shown.qmax, shown.qmin);
    html += `<div class="overflow-x"><table class="calc-table">
      <caption>${escapeHtml(comboLabel(shown.combo))} — eccentricity and bearing pressure</caption>
      <tr><th>Parameter</th><th>Expression</th><th>Value</th></tr>
      <tr><td>P, H, M at bottom of footing</td><td class="clause">Σ factor·load, + ΔW, + H·Δh</td><td class="num">${fmt(shown.P,1)} kN, ${fmt(shown.H,1)} kN, ${fmt(shown.M,1)} kN·m</td></tr>
      <tr><td>Eccentricity, e</td><td class="clause">|M| / P</td><td class="num">${fmt(shown.e,3)} m</td></tr>
      <tr><td>Kern limit, B/6</td><td class="clause">—</td><td class="num">${fmt(shown.kernLimit,3)} m</td></tr>
      <tr><td>Allowable eccentricity, e<sub>allow</sub></td><td class="clause">(e/B)<sub>allow</sub> · B</td><td class="num">${fmt(shown.eAllow,3)} m</td></tr>
      <tr class="${shown.effWidthUsed ? 'governing' : ''}"><td>Bearing method</td><td class="clause">${shown.bearingNote}</td><td class="num">—</td></tr>
      <tr><td>q<sub>max</sub></td><td class="clause">—</td><td class="num">${fmt(shown.qmax,1)} kPa</td></tr>
      <tr><td>q<sub>min</sub></td><td class="clause">—</td><td class="num">${fmt(shown.qmin,1)} kPa</td></tr>
      <tr><td>q<sub>a</sub> (allowable)</td><td class="clause">Section 08</td><td class="num">${fmt(qa,1)} kPa</td></tr>
    </table></div>`;
    html += `<div class="overflow-x"><table class="calc-table">
      <caption>${escapeHtml(comboLabel(shown.combo))} — utilization per check</caption>
      <tr><th>Check</th><th>UC</th><th>Status</th></tr>
      ${shown.checks.map(c => `<tr class="${c === shown.governingCheck ? 'governing' : ''}"><td>${c.name}</td><td class="num">${fmt(c.uc,3)}</td><td>${okNg(c.uc)}</td></tr>`).join('')}
    </table></div>`;
  }
  // Kern (eccentricity), bearing pressure, sliding and overturning, each per load combination with its own governing
  // row. Kern comes first: e ≤ B/6 (or the seismic e/B limit) decides full contact or partial uplift, which the bearing
  // pressure formula (q_max / q_min) is built on. q_a comes from Section 08.
  const kernGov = validResults.length ? validResults.reduce((a, b) => b.ucKernBiaxial > a.ucKernBiaxial ? b : a) : null;
  const ucOf = (r, name) => r.checks.find(c => c.name === name).uc;
  const bearingGov = validResults.length ? validResults.reduce((a, b) => ucOf(b, 'Bearing pressure') > ucOf(a, 'Bearing pressure') ? b : a) : null;
  const slidingGov = validResults.length ? validResults.reduce((a, b) => ucOf(b, 'Sliding') > ucOf(a, 'Sliding') ? b : a) : null;
  const otGov = validResults.length ? validResults.reduce((a, b) => b.ucOTBiaxial > a.ucOTBiaxial ? b : a) : null;
  // Every check of this chapter with its governing combination (same UC / LC as the 4.2-4.5 tables) — the Design Status
  // panel lists them under the Foundation Stability card (renderLiveBar()). Empty when no combination could be evaluated.
  lastResults.foundation.checks = validResults.length ? [
    { name: 'Eccentricity (kern)', uc: kernGov.ucKernBiaxial, lc: kernGov.combo.lc || kernGov.combo.name },
    { name: 'Bearing pressure', uc: ucOf(bearingGov, 'Bearing pressure'), lc: bearingGov.combo.lc || bearingGov.combo.name },
    { name: 'Sliding', uc: ucOf(slidingGov, 'Sliding'), lc: slidingGov.combo.lc || slidingGov.combo.name },
    { name: 'Overturning', uc: otGov.ucOTBiaxial, lc: otGov.combo.lc || otGov.combo.name }
  ] : [];
  const ratioTxt = fmt(1 / eccRatioAllow, 2);
  html += sectionHeader('4.2', 'Eccentricity (Kern) Check',
    `The resultant must stay inside the kern so the whole base remains in contact (q<sub>min</sub> ≥ 0). Both directions are checked together (biaxial): e<sub>x</sub> from the x-direction moments (WX, EQX), e<sub>z</sub> from the z-direction moments (WZ, EQZ).`);
  html += `<div class="overflow-x"><table class="calc-table">
    <caption>Kern check — formula and criterion</caption>
    <tr><th>Parameter</th><th>Expression</th></tr>
    <tr><td>Eccentricity, x-direction (along B)</td><td class="clause">e<sub>x</sub> = |M<sub>z</sub>| / P</td></tr>
    <tr><td>Eccentricity, z-direction (along L)</td><td class="clause">e<sub>z</sub> = |M<sub>x</sub>| / P</td></tr>
    <tr><td>Kern limits (allowable ratio = 1/${ratioTxt})</td><td class="clause">e<sub>x,allow</sub> = B/${ratioTxt} = ${fmt(B*eccRatioAllow,3)} m, e<sub>z,allow</sub> = L/${ratioTxt} = ${fmt(L*eccRatioAllow,3)} m</td></tr>
    <tr><td>Biaxial kern utilization</td><td class="clause">UC = (e<sub>x</sub>/B + e<sub>z</sub>/L) / ${fmt(eccRatioAllow,4)}</td></tr>
    <tr class="governing"><td>Criterion</td><td class="clause">UC ≤ 1.0 → <strong>full contact</strong> (resultant inside the kern, q<sub>min</sub> ≥ 0) &nbsp;|&nbsp; UC &gt; 1.0 → <strong>partial uplift</strong> (base separates over part of the footing)</td></tr>
  </table></div>
  <div class="overflow-x"><table class="calc-table">
    <caption>Kern check per load combination</caption>
    <tr><th class="lc-no">No.</th><th>Combination</th><th>P (kN)</th><th>e<sub>x</sub> (m)</th><th>e<sub>z</sub> (m)</th><th>Contact</th><th>UC</th><th>Status</th></tr>
    ${results.map(r => {
      if (!r.valid) return invalidRow(r, 5);
      return `<tr class="${r === kernGov ? 'governing' : ''}"><td class="lc-no">${escapeHtml(r.combo.lc || '')}</td><td>${escapeHtml(r.combo.name)}</td><td class="num">${fmt(r.P,1)}</td><td class="num">${fmt(r.ex,3)}</td><td class="num">${fmt(r.ez,3)}</td><td>${r.ucKernBiaxial <= 1.0 ? 'Full contact' : 'Partial uplift'}</td><td class="num">${fmt(r.ucKernBiaxial,3)}</td><td>${okNg(r.ucKernBiaxial)}</td></tr>`;
    }).join('')}
  </table></div>`;
  html += sectionHeader('4.3', 'Bearing Pressure Check',
    `Maximum soil pressure under the footing against the allowable bearing capacity: UC = q<sub>max</sub> / q<sub>a</sub>, q<sub>a</sub> = ${fmt(qa,1)} kPa (Section 08). With partial uplift the effective contact width is used.`);
  html += `<div class="overflow-x"><table class="calc-table">
    <caption>Bearing pressure check per load combination</caption>
    <tr><th class="lc-no">No.</th><th>Combination</th><th>P (kN)</th><th>e (m)</th><th>q<sub>max</sub> (kPa)</th><th>q<sub>min</sub> (kPa)</th><th>UC</th><th>Status</th></tr>
    ${results.map(r => {
      if (!r.valid) return invalidRow(r, 5);
      const uc = ucOf(r, 'Bearing pressure');
      return `<tr class="${r === bearingGov ? 'governing' : ''}"><td class="lc-no">${escapeHtml(r.combo.lc || '')}</td><td>${escapeHtml(r.combo.name)}</td><td class="num">${fmt(r.P,1)}</td><td class="num">${fmt(r.e,3)}</td><td class="num">${fmt(r.qmax,1)}</td><td class="num">${fmt(r.qmin,1)}</td><td class="num">${fmt(uc,3)}</td><td>${okNg(uc)}</td></tr>`;
    }).join('')}
  </table></div>`;
  html += sectionHeader('4.4', 'Sliding Check',
    `Friction between soil and concrete, μ = ${fmt(mu,2)}. Sliding force F<sub>sl</sub> = V (horizontal shear |H| at the bottom of the footing); resistance F<sub>r</sub> = μ·P; SF = F<sub>r</sub> / F<sub>sl</sub> ≥ FS<sub>sliding</sub> = ${fmt(fsSlidePerm,2)} (permanent) or ${fmt(fsSlideTemp,2)} (temporary, wind / seismic), whichever applies to the combination.`);
  html += `<div class="overflow-x"><table class="calc-table">
    <caption>Sliding check per load combination</caption>
    <tr><th class="lc-no">No.</th><th>Combination</th><th>Case</th><th>V (kN)</th><th>F<sub>r</sub> (kN)</th><th>Min. FS</th><th>SF</th><th>Status</th></tr>
    ${results.map(r => {
      if (!r.valid) return invalidRow(r, 5);
      const uc = ucOf(r, 'Sliding');
      return `<tr class="${r === slidingGov ? 'governing' : ''}"><td class="lc-no">${escapeHtml(r.combo.lc || '')}</td><td>${escapeHtml(r.combo.name)}</td><td>${r.temporary ? 'Temporary' : 'Permanent'}</td><td class="num">${fmt(r.Habs,1)}</td><td class="num">${fmt(mu*r.P,1)}</td><td class="num">${fmt(r.fsSlideMin,2)}</td><td class="num">${isFinite(r.fsSliding) ? fmt(r.fsSliding,2) : '∞'}</td><td>${okNg(uc)}</td></tr>`;
    }).join('')}
  </table></div>`;
  html += sectionHeader('4.5', 'Overturning Check',
    `Checked about both footing edges (biaxial). Overturning moment OM<sub>1</sub> = |M<sub>z</sub>| (x-direction) and OM<sub>2</sub> = |M<sub>x</sub>| (z-direction); resisting moment RM = P·B1 or P·B2 with B1 = B<sub>f</sub>/2 = ${fmt(B1,2)} m and B2 = L<sub>f</sub>/2 = ${fmt(B2,2)} m; SF = RM / OM ≥ FS<sub>OT</sub> = ${fmt(fsOTPerm,2)} (permanent) or ${fmt(fsOTTemp,2)} (temporary), whichever applies to the combination.`);
  html += `<div class="overflow-x"><table class="calc-table">
    <caption>Overturning check per load combination — biaxial</caption>
    <tr><th class="lc-no">No.</th><th>Combination</th><th>Case</th><th>OM<sub>1</sub> (kN·m)</th><th>SF<sub>1</sub></th><th>OM<sub>2</sub> (kN·m)</th><th>SF<sub>2</sub></th><th>Min. FS</th><th>Status</th></tr>
    ${results.map(r => {
      if (!r.valid) return invalidRow(r, 6);
      return `<tr class="${r === otGov ? 'governing' : ''}"><td class="lc-no">${escapeHtml(r.combo.lc || '')}</td><td>${escapeHtml(r.combo.name)}</td><td>${r.temporary ? 'Temporary' : 'Permanent'}</td><td class="num">${fmt(r.OM1,1)}</td><td class="num">${isFinite(r.SF1) ? fmt(r.SF1,2) : '∞'}</td><td class="num">${fmt(r.OM2,1)}</td><td class="num">${isFinite(r.SF2) ? fmt(r.SF2,2) : '∞'}</td><td class="num">${fmt(r.fsOTMin,2)}</td><td>${okNg(r.ucOTBiaxial)}</td></tr>`;
    }).join('')}
  </table></div>`;
  html += `<div class="limits-box">
    <strong>Limitation:</strong> The kern and overturning checks are biaxial (M<sub>x</sub> and M<sub>z</sub> separately); the bearing pressure and sliding checks use the resultant H = √(F<sub>x</sub>² + F<sub>z</sub>²) and M = √(M<sub>x</sub>² + M<sub>z</sub>²) as a uniaxial case. No passive soil resistance, no buoyancy / uplift from groundwater, and no seismic pseudo-static (k<sub>h</sub>/k<sub>v</sub>) reduction. P, H and M include the top → bottom transfer (ΔW, Δh) of Section 03. The Permanent / Temporary case of each combination is detected from its load types (wind / seismic kinds, or "wind" / "seismic" in the label) — verify it against the project design basis for custom load types.
  </div>`;
  document.getElementById('calc-foundation').innerHTML = numberTables(html, '4');
}
