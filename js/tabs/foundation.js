// 4A — Shallow foundation stability.
// Moved from app.js — function/const declarations only; event wiring stays in app.js.
import { LOAD_KINDS, bearingCapacityCheck, evaluateBiaxialFooting, evaluateFoundationCombo, stdComboVector } from '../../lib/foundation/index.js?v=20260926r';
import { escapeHtml, getRadioVal, num } from '../core/dom.js?v=20260926r';
import { fmt } from '../core/format.js?v=20260926r';
import { comboState, lastResults, state } from '../core/state.js?v=20260926r';
import { comboLabel, verdictHTML } from '../core/worksheet.js?v=20260926r';
import { foundationDiagramSVG } from '../diagrams/foundationDiagram.js?v=20260926r';
import { buildStdComboBase, untypedLoadTypesWarning } from '../tabs/combos.js?v=20260926r';

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
    status: !governing.valid ? 'ERROR' : (governing.overallPass ? 'PASS' : 'FAIL'),
    metric: governing.valid ? `UC = ${fmt(governing.governingUC,3)}` : '—',
    detail: governing.valid ? `Governing: ${comboLabel(governing.combo)} — ${governing.governingCheck.name}, B=${fmt(B,2)}m, L=${fmt(L,2)}m` : `${comboLabel(governing.combo)}: ${governing.note}`
  };
  let html = '';
  if (!governing.valid) {
    html += `<div class="warn-box"><strong>⚠  ${comboLabel(governing.combo)}:</strong> ${governing.note} Review this combination's factors/loads before proceeding — stability cannot be confirmed.</div>`;
  }
  html += verdictHTML(governing.governingUC, governing.valid && governing.overallPass, 'FOUNDATION STABILITY',
    governing.valid ? `GOVERNING: ${comboLabel(governing.combo).toUpperCase()} — ${governing.governingCheck.name.toUpperCase()}` : `GOVERNING: ${comboLabel(governing.combo).toUpperCase()} — INVALID`);
  if (governing.valid) {
    html += foundationDiagramSVG(B, L, Bp, Lp, t, hp, governing.Habs, governing.Mabs, governing.e, governing.qmax, governing.qmin);
    html += `<div class="overflow-x"><table class="calc-table">
      <caption>Governing combination: ${comboLabel(governing.combo)} — Eccentricity &amp; bearing pressure</caption>
      <tr><th>Parameter</th><th>Expression</th><th>Value</th></tr>
      <tr><td>P, H, M at bottom of footing</td><td class="clause">Σ factor·load, + ΔW, + H·Δh</td><td class="num">${fmt(governing.P,1)} kN, ${fmt(governing.H,1)} kN, ${fmt(governing.M,1)} kN·m</td></tr>
      <tr><td>Eccentricity, e</td><td class="clause">|M| / P</td><td class="num">${fmt(governing.e,3)} m</td></tr>
      <tr><td>Kern limit, B/6</td><td class="clause">—</td><td class="num">${fmt(governing.kernLimit,3)} m</td></tr>
      <tr><td>Allowable eccentricity, e<sub>allow</sub></td><td class="clause">(e/B)<sub>allow</sub> · B</td><td class="num">${fmt(governing.eAllow,3)} m</td></tr>
      <tr class="${governing.effWidthUsed ? 'governing' : ''}"><td>Bearing method</td><td class="clause">${governing.bearingNote}</td><td class="num">—</td></tr>
      <tr><td>q<sub>max</sub></td><td class="clause">—</td><td class="num">${fmt(governing.qmax,1)} kPa</td></tr>
      <tr><td>q<sub>min</sub></td><td class="clause">—</td><td class="num">${fmt(governing.qmin,1)} kPa</td></tr>
      <tr><td>q<sub>a</sub> (allowable)</td><td class="clause">from "08 — Bearing Capacity"</td><td class="num">${fmt(qa,1)} kPa</td></tr>
    </table></div>`;
    html += `<div class="overflow-x"><table class="calc-table">
      <caption>Governing combination — check breakdown</caption>
      <tr><th>Check</th><th>UC</th><th>Status</th></tr>
      ${governing.checks.map(c => `<tr class="${c === governing.governingCheck ? 'governing' : ''}"><td>${c.name}</td><td class="num">${fmt(c.uc,3)}</td><td>${c.uc <= 1.0 ? 'OK' : 'EXCEEDS'}</td></tr>`).join('')}
    </table></div>`;
  }
  // Kern (eccentricity), bearing pressure, sliding and overturning, each per load combination — isolates every
  // check across all combos (its own governing row per check), not just the one overall-governing combo shown
  // above. Kern comes first: e ≤ B/6 (or the seismic e/B limit) decides whether the footing has full contact or
  // partial uplift, which is what the bearing-pressure formula (q_max/q_min) below is actually built on. q_a
  // comes from "08 — Bearing Capacity (Soil)"; that tab only shows the capacity calc itself now, not a duplicate
  // of this per-combo demand table.
  const validResults = results.filter(r => r.valid);
  const kernGov = validResults.length ? validResults.reduce((a, b) => b.ucKernBiaxial > a.ucKernBiaxial ? b : a) : null;
  const bearingGov = validResults.length ? validResults.reduce((a, b) => b.checks.find(c => c.name === 'Bearing pressure').uc > a.checks.find(c => c.name === 'Bearing pressure').uc ? b : a) : null;
  const slidingGov = validResults.length ? validResults.reduce((a, b) => b.checks.find(c => c.name === 'Sliding').uc > a.checks.find(c => c.name === 'Sliding').uc ? b : a) : null;
  const otGov = validResults.length ? validResults.reduce((a, b) => b.ucOTBiaxial > a.ucOTBiaxial ? b : a) : null;
  html += `<div class="overflow-x"><table class="calc-table">
    <caption>Kern check — formula &amp; criteria</caption>
    <tr><th>Parameter</th><th>Expression</th></tr>
    <tr><td>Eccentricity, B-direction</td><td class="clause">e<sub>x</sub> = |M<sub>z</sub>| / P</td></tr>
    <tr><td>Eccentricity, L-direction</td><td class="clause">e<sub>z</sub> = |M<sub>x</sub>| / P</td></tr>
    <tr><td>Kern limits (allowable ratio = 1/${fmt(1/eccRatioAllow,2)})</td><td class="clause">e<sub>x,allow</sub> = B/${fmt(1/eccRatioAllow,2)} = ${fmt(B*eccRatioAllow,3)} m, e<sub>z,allow</sub> = L/${fmt(1/eccRatioAllow,2)} = ${fmt(L*eccRatioAllow,3)} m</td></tr>
    <tr><td>Biaxial kern utilization</td><td class="clause">UC = (e<sub>x</sub>/B + e<sub>z</sub>/L) / ${fmt(eccRatioAllow,4)}</td></tr>
    <tr class="governing"><td>Criterion</td><td class="clause">UC ≤ 1.0 → <strong>full contact</strong> (resultant stays inside the kern, q<sub>min</sub> ≥ 0, no uplift) &nbsp;|&nbsp; UC &gt; 1.0 → <strong>partial uplift</strong> (resultant falls outside the kern, base separates over part of the footing)</td></tr>
  </table></div>
  <div class="overflow-x"><table class="calc-table">
    <caption>Kern (eccentricity) check per load combination — biaxial, B=${fmt(B,2)}m, L=${fmt(L,2)}m, allowable ratio=1/${fmt(1/eccRatioAllow,2)}</caption>
    <tr><th>No.</th><th>Combination</th><th>P (kN)</th><th>e<sub>x</sub> = |M<sub>z</sub>|/P (m)</th><th>e<sub>z</sub> = |M<sub>x</sub>|/P (m)</th><th>Contact</th><th>UC = (e<sub>x</sub>/B + e<sub>z</sub>/L) / ratio</th><th>Status</th></tr>
    ${results.map(r => {
      if (!r.valid) return `<tr><td>${escapeHtml(r.combo.lc || '')}</td><td>${escapeHtml(r.combo.name)}</td><td colspan="4" class="num">—</td><td>${r.note || 'INVALID'}</td></tr>`;
      return `<tr class="${r === kernGov ? 'governing' : ''}"><td>${escapeHtml(r.combo.lc || '')}</td><td>${escapeHtml(r.combo.name)}</td><td class="num">${fmt(r.P,1)}</td><td class="num">${fmt(r.ex,3)}</td><td class="num">${fmt(r.ez,3)}</td><td>${r.ucKernBiaxial <= 1.0 ? 'Full contact' : 'Partial uplift'}</td><td class="num">${fmt(r.ucKernBiaxial,3)}</td><td>${r.ucKernBiaxial <= 1.0 ? 'OK' : 'EXCEEDS'}</td></tr>`;
    }).join('')}
  </table></div>
  <div class="note">e<sub>x</sub> comes from X-direction moments (WX/EQX(E)/EQX(O)), e<sub>z</sub> from Z-direction moments (WZ/EQZ(E)/EQZ(O)) — checked together rather than as one resultant magnitude. The bearing-pressure, sliding and overturning checks below still use the uniaxial resultant H/M (see the app-wide Limitation note) — this table alone reports the full two-way kern check.</div>`;
  html += `<div class="overflow-x"><table class="calc-table">
    <caption>Bearing pressure check per load combination — q<sub>a</sub>=${fmt(qa,1)} kPa (from "08 — Bearing Capacity")</caption>
    <tr><th>No.</th><th>Combination</th><th>P (kN)</th><th>e (m)</th><th>q<sub>max</sub> (kPa)</th><th>q<sub>min</sub> (kPa)</th><th>UC</th><th>Status</th></tr>
    ${results.map(r => {
      if (!r.valid) return `<tr><td>${escapeHtml(r.combo.lc || '')}</td><td>${escapeHtml(r.combo.name)}</td><td colspan="4" class="num">—</td><td>${r.note || 'INVALID'}</td></tr>`;
      const c = r.checks.find(ch => ch.name === 'Bearing pressure');
      return `<tr class="${r === bearingGov ? 'governing' : ''}"><td>${escapeHtml(r.combo.lc || '')}</td><td>${escapeHtml(r.combo.name)}</td><td class="num">${fmt(r.P,1)}</td><td class="num">${fmt(r.e,3)}</td><td class="num">${fmt(r.qmax,1)}</td><td class="num">${fmt(r.qmin,1)}</td><td class="num">${fmt(c.uc,3)}</td><td>${c.uc <= 1.0 ? 'OK' : 'EXCEEDS'}</td></tr>`;
    }).join('')}
  </table></div>`;
  html += `<div class="note">
    <strong>4.3 Sliding Stability Check</strong><br>
    Friction coefficient between soil and concrete, μ&nbsp;&nbsp;=&nbsp;&nbsp;${fmt(mu,2)}<br>
    Sliding force, F<sub>sl</sub>&nbsp;&nbsp;=&nbsp;&nbsp;V (horizontal shear, |H|, at bottom of footing)<br>
    Sliding resistance, F<sub>r</sub>&nbsp;&nbsp;=&nbsp;&nbsp;μ × P<br>
    SF&nbsp;&nbsp;=&nbsp;&nbsp;F<sub>r</sub> / F<sub>sl</sub>&nbsp;&nbsp;&gt;&nbsp;&nbsp;FS<sub>sliding,perm</sub> = ${fmt(fsSlidePerm,2)} (Permanent) or FS<sub>sliding,temp</sub> = ${fmt(fsSlideTemp,2)} (Temporary) — whichever applies to that combination
  </div>`;
  html += `<div class="overflow-x"><table class="calc-table">
    <caption>Sliding check per load combination</caption>
    <tr><th>No.</th><th>L. Comb</th><th>Case</th><th>V (kN)</th><th>F<sub>r</sub> (kN)</th><th>Min. FS</th><th>SF</th><th>Check</th></tr>
    ${results.map(r => {
      if (!r.valid) return `<tr><td>${escapeHtml(r.combo.lc || '')}</td><td>${escapeHtml(r.combo.name)}</td><td colspan="4" class="num">—</td><td>${r.note || 'INVALID'}</td></tr>`;
      const c = r.checks.find(ch => ch.name === 'Sliding');
      return `<tr class="${r === slidingGov ? 'governing' : ''}"><td>${escapeHtml(r.combo.lc || '')}</td><td>${escapeHtml(r.combo.name)}</td><td>${r.temporary ? 'Temporary' : 'Permanent'}</td><td class="num">${fmt(r.Habs,1)}</td><td class="num">${fmt(mu*r.P,1)}</td><td class="num">${fmt(r.fsSlideMin,2)}</td><td class="num">${isFinite(r.fsSliding) ? fmt(r.fsSliding,2) : '∞'}</td><td>${c.uc <= 1.0 ? 'OK' : 'NG'}</td></tr>`;
    }).join('')}
  </table></div>`;
  html += `<div class="note">
    <strong>4.4 Overturning Stability Check</strong><br>
    Overturning Moment (OM)&nbsp;&nbsp;=&nbsp;&nbsp;M<sub>v</sub> (|M<sub>z</sub>| about the B edge; |M<sub>x</sub>| about the L edge)<br>
    Resistant Moment (RM)&nbsp;&nbsp;=&nbsp;&nbsp;P × B1 (X-direction) or P × B2 (Z-direction)<br>
    SF = RM / OM&nbsp;&nbsp;=&nbsp;&nbsp;(P × B1) / M<sub>z</sub>&nbsp;&nbsp;or&nbsp;&nbsp;(P × B2) / M<sub>x</sub>&nbsp;&nbsp;&gt;&nbsp;&nbsp;FS<sub>OT,perm</sub> = ${fmt(fsOTPerm,2)} (Permanent) or FS<sub>OT,temp</sub> = ${fmt(fsOTTemp,2)} (Temporary) — whichever applies to that combination<br>
    B1 = B<sub>f</sub> / 2 = ${fmt(B1,2)} m<br>
    B2 = L<sub>f</sub> / 2 = ${fmt(B2,2)} m
  </div>`;
  html += `<div class="overflow-x"><table class="calc-table">
    <caption>Overturning check per load combination — biaxial</caption>
    <tr><th>No.</th><th>L. Comb</th><th>Case</th><th>OM<sub>1</sub>=|M<sub>z</sub>| (kN·m)</th><th>SF<sub>1</sub></th><th>OM<sub>2</sub>=|M<sub>x</sub>| (kN·m)</th><th>SF<sub>2</sub></th><th>Min. FS</th><th>Check</th></tr>
    ${results.map(r => {
      if (!r.valid) return `<tr><td>${escapeHtml(r.combo.lc || '')}</td><td>${escapeHtml(r.combo.name)}</td><td colspan="5" class="num">—</td><td>${r.note || 'INVALID'}</td></tr>`;
      return `<tr class="${r === otGov ? 'governing' : ''}"><td>${escapeHtml(r.combo.lc || '')}</td><td>${escapeHtml(r.combo.name)}</td><td>${r.temporary ? 'Temporary' : 'Permanent'}</td><td class="num">${fmt(r.OM1,1)}</td><td class="num">${isFinite(r.SF1) ? fmt(r.SF1,2) : '∞'}</td><td class="num">${fmt(r.OM2,1)}</td><td class="num">${isFinite(r.SF2) ? fmt(r.SF2,2) : '∞'}</td><td class="num">${fmt(r.fsOTMin,2)}</td><td>${r.ucOTBiaxial <= 1.0 ? 'OK' : 'NG'}</td></tr>`;
    }).join('')}
  </table></div>`;
  html += `<div class="limits-box">
    <strong>Limitation:</strong> Each combination is evaluated as a uniaxial load case (P, H, M) — no biaxial moment, no passive soil resistance, no buoyancy/uplift from groundwater, and no seismic pseudo-static (k<sub>h</sub>/k<sub>v</sub>) reduction. P/H/M shown here already include the top→bottom transfer (ΔW, Δh) set in the "03 — LOADING DATA" tab. Verify the combination set and factors against the full geotechnical report and project design basis. The Permanent/Temporary "Case" per combination (Sliding/Overturning tables above) is auto-detected from its load-type factors (wind/seismic codes or "wind"/"seismic" in the label) — verify it against the project design basis for any custom load type.
  </div>`;
  document.getElementById('calc-foundation').innerHTML = untypedLoadTypesWarning() + html;
}
