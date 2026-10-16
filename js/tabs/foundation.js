// 4A — Shallow foundation stability.
// Moved from app.js — function/const declarations only; event wiring stays in app.js.
import { LOAD_KINDS, biaxialSoilPressure, combineFootingChecks, evaluateBiaxialFooting, evaluateFoundationCombo, meyerhofEffectiveArea, footingPointLoads, normalisePoints, pedestalOffsetMoments, stdComboVector } from '../../lib/foundation/index.js?v=20261016b';
import { escapeHtml, getRadioVal, num } from '../core/dom.js?v=20261016b';
import { fmt } from '../core/format.js?v=20261016b';
import { comboState, lastResults, state } from '../core/state.js?v=20261016b';
import { chapterHeader, comboLabel, numberTables, sectionHeader } from '../core/worksheet.js?v=20261016b';
import { foundationDiagramSVG } from '../diagrams/foundationDiagram.js?v=20261016b';
import { buildStdComboBase, untypedLoadTypesWarning } from '../tabs/combos.js?v=20261016b';
import { foundationFocusHTML, stabilityAlertHTML } from '../tabs/stabilityFocus.js?v=20261016b';
import { allowableBearing, allowableBearingAt } from '../tabs/bearing.js?v=20261016b';
import { activeLoadPoints } from '../tabs/loadPoints.js?v=20261016b';

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
  // Allowable bearing capacity is taken fresh from "08 — BEARING CAPACITY (SOIL)" (allowableBearing(): the same
  // bearingCapacityCheck() call calcBearing() makes, or the geotechnical-report value when bearing is out of scope in
  // Section 00) rather than a duplicate manual field or a stale one-time "Send q_a" copy — always current.
  const qaSrc = allowableBearing();
  const qa = qaSrc.qa ?? 0;
  const qaRef = qaSrc.given ? 'given, geotechnical report' : 'Section 08';
  const mu = num('fd-mu');
  // Allowable e/B: 1/6, 1/4, or 0 = no eccentricity limit (project criterion — partial uplift accepted, bearing pressure from
  // biaxialSoilPressure() and overturning govern). Without a limit the kern values are still computed against 1/6, as the
  // full-contact indicator (UC ≤ 1 = whole base in contact), but they are not checks.
  const eccSel = parseFloat(getRadioVal('fd-ecc'));
  const eccLimit = eccSel > 0;
  const eccRatioAllow = eccLimit ? eccSel : 1 / 6;
  // Minimum contact area (project criterion, % of the base; empty = not checked): UC = min / contact ratio, part of the governing UC
  // (combineFootingChecks(), lib). Net uplift / resultant outside the base = no contact = UC ∞.
  const minC = num('fd-mincontact') > 0 ? num('fd-mincontact') / 100 : 0;
  const contactName = minC > 0 ? `Contact area (min ${fmt(minC * 100, 0)} %)` : null;
  // Bearing pressure beyond the kern (partial uplift): 'rigid' = rigid footing, linear pressure, no tension (biaxialSoilPressure());
  // 'meyerhof' = effective area B′ × L′ with a uniform pressure, q_a recomputed for B′ × L′ (meyerhofEffectiveArea() +
  // allowableBearingAt()). In full contact both use q = (P/BL)(1 ± 6ex/B ± 6ez/L) against q_a.
  const bearMeyerhof = getRadioVal('fd-bearmeth') === 'meyerhof';
  const fsDistinguish = document.getElementById('fd-fsDistinguish').checked;
  const fsSlidePerm = num('fd-fsSlide-perm'), fsSlideTemp = fsDistinguish ? num('fd-fsSlide-temp') : fsSlidePerm;
  const fsOTPerm = num('fd-fsOT-perm'), fsOTTemp = fsDistinguish ? num('fd-fsOT-temp') : fsOTPerm;
  lastResults.foundation = { label: 'Foundation Stability', status: 'ERROR', metric: '—', detail: 'Not yet computed.' };
  const focusAlert = (msg) => { document.getElementById('focus-foundation').innerHTML = stabilityAlertHTML('4A · Foundation Stability', 'Not computed', msg); };
  if (B <= 0 || L <= 0) {
    document.getElementById('calc-foundation').innerHTML = `<div class="warn-box"><strong>⚠  Invalid input:</strong> B<sub>f</sub> and L<sub>f</sub> (footing width/length, set in "02 — FOUNDATION DIMENSION") must be greater than zero.</div>`;
    lastResults.foundation.detail = 'Invalid input (B, L must be > 0).';
    focusAlert('B<sub>f</sub> and L<sub>f</sub> (set in "02 — FOUNDATION DIMENSION") must be greater than zero.');
    return;
  }
  if (comboState.lc.length === 0) {
    document.getElementById('calc-foundation').innerHTML = `<div class="warn-box"><strong>⚠  No load combinations:</strong> add at least one combination in the "03 — LOADING DATA" tab.</div>`;
    lastResults.foundation.detail = 'No load combinations defined.';
    focusAlert('No load combinations — add at least one in "03 — LOADING DATA".');
    return;
  }
  // A given q_a that was never entered is NOT SET — pending, not a bearing failure.
  if (qaSrc.given && qaSrc.qa === null) {
    document.getElementById('calc-foundation').innerHTML = `<div class="warn-box"><strong>⚠  q<sub>a</sub> NOT SET:</strong> soil bearing capacity is out of scope (Section 00 → Scope of Work) — enter the allowable bearing capacity from the geotechnical report in "08 — BEARING CAPACITY (SOIL)".</div>`;
    lastResults.foundation.detail = 'Given q_a not set (Tab 08).';
    focusAlert('q<sub>a</sub> NOT SET — enter the allowable bearing capacity from the geotechnical report in "08 — BEARING CAPACITY (SOIL)".');
    return;
  }
  // P/H/M per combination come from the same biaxial Fx/Fz/Mx/Mz vectors as the "Load at bottom of footing"
  // table (03 — Loading Data) — H and M are the resultant magnitudes (sqrt(Fx²+Fz²), sqrt(Mx²+Mz²)) rather
  // than a naive scalar sum of unrelated axes, then fed into the existing uniaxial stability formulas below.
  // Still a simplification (see the Limitation note), but now numerically consistent for the same combo.
  const base = buildStdComboBase();
  const B1 = B / 2, B2 = L / 2; // overturning lever arms — B1 resists M_z (transversal), B2 resists M_x (longitudinal)
  // Pedestal offset from the footing centre (Tab 02): the loads at the top of the pedestal, the pedestal + grout weight and the
  // backfill centroid are eccentric to the footing — their moments about the footing centroid are added to Mx / Mz
  // (pedestalOffsetMoments(), lib). The self-weight parts take the combination's dead-load factor kD = dP / ΔW.
  // Several load points (Tab 02 "Load points", activeLoadPoints()): the superstructure load is shared out to the points and the moments
  // of the point loads (and of the pedestal under each, with "Footing + Pedestal") about the footing centroid replace the single
  // pedestal offset (footingPointLoads(), lib — one point with share 1 gives the offset moments exactly, validation part40).
  const pts = activeLoadPoints();
  const OffX = hasPed && !pts ? num('fs-OffX') : 0, OffZ = hasPed && !pts ? num('fs-OffZ') : 0;
  const hasOffset = Math.abs(OffX) > 1e-9 || Math.abs(OffZ) > 1e-9;
  const dWfoot = num('lc-dW');
  const ptPedW = pts && hasPed && state.pedPointW.length === pts.length ? state.pedPointW : null;
  const ptPedA = pts && hasPed ? pts.map(p => p.c1 * p.c2) : null;
  const results = comboState.lc.map(combo => {
    const v = stdComboVector(combo.f, base);
    const kD = dWfoot > 0 ? v.dP / dWfoot : 0;
    let off = { dMx: 0, dMz: 0 };
    if (pts) {
      const fp = footingPointLoads(pts, { P: v.P, Mx: v.Mx + v.dMx, Mz: v.Mz + v.dMz, kD, dW: dWfoot, Wped: ptPedW, pedAreas: ptPedA, Wsoil: hasPed ? state.footSoilW : 0, Af: B * L });
      off = { dMx: fp.group.Mx - (v.Mx + v.dMx), dMz: fp.group.Mz - (v.Mz + v.dMz) };
    } else if (hasOffset) {
      off = pedestalOffsetMoments({ Ptop: v.P, kD, Wped: state.pedW, Wsoil: state.footSoilW, OffX, OffZ, Af: B * L, Ap: Bp * Lp });
    }
    const Pbot = v.P + v.dP, Mx = v.Mx + v.dMx + off.dMx, Mz = v.Mz + v.dMz + off.dMz;
    const Hbot = Math.sqrt(v.Fx * v.Fx + v.Fz * v.Fz);
    const Mbot = Math.sqrt(Mx * Mx + Mz * Mz);
    // Biaxial kern (ex/ez) and overturning (OM1/2, SF1/2) checks — evaluateBiaxialFooting(), lib/foundation/
    // shared/stabilityCheck.js — supplement evaluateFoundationCombo()'s uniaxial (resultant-M) versions below.
    // Which minimum FS applies is decided per combination (Permanent vs Temporary), not a single project-wide
    // value — see isTemporaryCombo() above.
    const temporary = isTemporaryCombo(combo);
    const fsSlideMin = temporary ? fsSlideTemp : fsSlidePerm;
    const fsOTMin = temporary ? fsOTTemp : fsOTPerm;
    const uni = evaluateFoundationCombo(B, L, Pbot, Hbot, Mbot, qa, mu, eccRatioAllow, fsSlideMin, fsOTMin);
    const bi = evaluateBiaxialFooting(B, L, Pbot, Mx, Mz, eccRatioAllow, fsOTMin);
    // Soil pressure with both moments at once and no tension (biaxialSoilPressure(), lib) — its own bearing check.
    const bp = Pbot > 0 ? biaxialSoilPressure(B, L, Pbot, Mz / Pbot, Mx / Pbot) : { valid: false, qmax: Infinity, qmin: 0, contactRatio: 0, note: 'P ≤ 0' };
    let qBear = bp.qmax, qaBear = qa, bearNote = bp.note || '', meyUsed = false;
    if (bearMeyerhof && Pbot > 0 && !(bp.valid && bp.fullContact)) {
      const mey = meyerhofEffectiveArea(B, L, Pbot, Mz / Pbot, Mx / Pbot);
      bearNote = mey.note;
      if (mey.valid) {
        const qaE = allowableBearingAt(mey.Beff, mey.Leff);
        qBear = mey.qeff; qaBear = qaE.qa ?? 0; meyUsed = true;
        bearNote += qaE.recomputed ? `; q′a recomputed for ${mey.Bshort.toFixed(3)} × ${mey.Llong.toFixed(3)} m (Section 08 soil, formula and FS)` : '; q_a as given (geotechnical report — not recomputed)';
      } else { qBear = Infinity; }
    }
    const ucBearingBiaxial = Number.isFinite(qBear) && qaBear > 0 ? qBear / qaBear : Infinity;
    // Governing check / UC / pass cover the biaxial kern (unless there is no e limit), overturning and bearing (combineFootingChecks(), lib).
    return {
      combo, P: Pbot, H: Hbot, M: Mbot, Mx, Mz, temporary, fsSlideMin, fsOTMin, Ptop: v.P, kD, offMx: off.dMx, offMz: off.dMz,
      qmaxBi: bp.qmax, qminBi: bp.qmin, contactRatio: bp.contactRatio, bpNote: bp.note, bpValid: bp.valid, qBear, qaBear, bearNote, meyUsed,
      ...uni, ...bi, ...combineFootingChecks(uni, bi, { eccLimit, ucBearingBiaxial, minContact: minC, contactRatio: bp.valid ? bp.contactRatio : 0 })
    };
  });
  // The status / UC of this chapter covers every check printed in 4.2-4.5: the four uniaxial checks of the lib
  // (evaluateFoundationCombo) plus the biaxial kern and overturning checks (evaluateBiaxialFooting). A combination that
  // could not be evaluated keeps governingUC = Infinity.
  results.forEach(r => {
    if (!r.valid) { r.ucAll = r.governingUC; return; }
    // the kern only with an eccentricity limit — with "No limit" it is information, never part of the governing UC
    r.allChecks = [...r.checks, ...(eccLimit ? [{ name: 'Eccentricity (biaxial kern)', uc: r.ucKernBiaxial }] : []), { name: 'Overturning (biaxial)', uc: r.ucOTBiaxial }];
    r.governingAll = r.allChecks.reduce((a, b) => b.uc > a.uc ? b : a);
    r.ucAll = r.governingAll.uc;
  });
  const governing = results.reduce((a, b) => b.ucAll > a.ucAll ? b : a);
  lastResults.foundation = {
    label: 'Foundation Stability',
    // A combination the lib cannot evaluate (net uplift P ≤ 0, or e > B/2 = complete base separation) is a stability
    // failure, not a pending / input error — report FAIL so the Design Status panel does not show it as PENDING.
    status: !governing.valid ? 'FAIL' : (governing.ucAll <= 1.0 ? 'PASS' : 'FAIL'),
    metric: governing.valid ? `UC = ${fmt(governing.ucAll,3)}` : 'UC = ∞ (base separation)',
    detail: governing.valid ? `Governing: ${comboLabel(governing.combo)} — ${governing.governingAll.name}, B=${fmt(B,2)}m, L=${fmt(L,2)}m` : `${comboLabel(governing.combo)}: ${governing.note}`
  };
  // Preview follows the chapter pattern of 02 / 04 (pile) / 5A / 5B / 09: chapter title, numbered sub-sections, "Table 4.n.m"
  // captions, no verdict box (the status is in the Design Status panel). A combination that cannot be evaluated (net uplift
  // or complete base separation) fails the check (governingUC = Infinity above); it is reported as a notice in the Design
  // Status panel and in its table rows, and 4.1 shows the worst of the combinations that could be evaluated.
  const validResults = results.filter(r => r.valid);
  const invalidResults = results.filter(r => !r.valid);
  const shown = validResults.length ? validResults.reduce((a, b) => b.ucAll > a.ucAll ? b : a) : null;
  lastResults.foundation.notices = invalidResults.map(r => ({
    title: `${comboLabel(r.combo)} — not evaluated`,
    text: `${r.note} This combination fails the stability check; review its factors / loads or enlarge the footing.`
  }));
  const okNg = (uc) => (uc <= 1.0 ? 'OK' : 'NG');
  // Row for a combination that could not be evaluated: the reason spans the data columns, status NG.
  const invalidRow = (r, nData) => `<tr><td class="lc-no">${escapeHtml(r.combo.lc || '')}</td><td>${escapeHtml(r.combo.name)}</td><td colspan="${nData}" class="clause">${escapeHtml(r.note || 'Not evaluated.')}</td><td>NG</td></tr>`;
  let html = chapterHeader('04. Foundation Stability',
    `This chapter checks the shallow footing (B<sub>f</sub> × L<sub>f</sub> = ${fmt(B,2)} × ${fmt(L,2)} m, Section 02) under the ASD load combinations of Section 03: ${eccLimit ? 'eccentricity (kern), ' : 'contact area (no eccentricity limit — partial uplift accepted for this project), '}bearing pressure against q<sub>a</sub> = ${fmt(qa,1)} kPa (${qaRef}), sliding and overturning. Loads are taken at the bottom of the footing, including the footing / pedestal self-weight ΔW and H·Δh${hasOffset ? `, and the moments from the pedestal offset (Off<sub>X</sub> = ${fmt(OffX,2)} m, Off<sub>Z</sub> = ${fmt(OffZ,2)} m — see the offset table in 4.1)` : ''}${pts ? `, and the moments of the ${pts.length} load points of Tab 02 about the footing centroid (see the load-point table in 4.1)` : ''}. The governing check covers the uniaxial (resultant) and the biaxial ${eccLimit ? 'kern, ' : ''}bearing and overturning checks.`);
  html += untypedLoadTypesWarning();
  html += sectionHeader('4.1', 'Governing Load Combination', shown
    ? `Combination with the highest utilization${invalidResults.length ? ' among those that could be evaluated' : ''}: ${escapeHtml(comboLabel(shown.combo))}, governed by ${shown.governingAll.name.toLowerCase()}.${invalidResults.length ? ` ${invalidResults.length} combination(s) could not be evaluated (${invalidResults.map(r => escapeHtml(r.combo.lc || r.combo.name)).join(', ')}) and fail the check — see the tables below and the Design Status panel.` : ''}`
    : 'No combination could be evaluated — see the tables below and the Design Status panel.', true);
  let shownSvg = '';
  if (shown) {
    shownSvg = foundationDiagramSVG(B, L, pts ? 0 : Bp, pts ? 0 : Lp, t, pts ? 0 : hp, shown.Habs, shown.Mabs, shown.e, shown.qmaxBi, shown.qminBi,
      { OffX, OffZ, Mx: shown.Mx, Mz: shown.Mz, P: shown.P, eccRatio: eccRatioAllow }); // pedestal offset, biaxial resultant, kern diamond
    html += shownSvg;
    html += `<div class="overflow-x"><table class="calc-table">
      <caption>${escapeHtml(comboLabel(shown.combo))} — eccentricity and bearing pressure</caption>
      <tr><th>Parameter</th><th>Expression</th><th>Value</th></tr>
      <tr><td>P, H, M at bottom of footing</td><td class="clause">Σ factor·load, + ΔW, + H·Δh${hasOffset ? ', + pedestal offset' : ''}${pts ? ', + load points' : ''}</td><td class="num">${fmt(shown.P,1)} kN, ${fmt(shown.H,1)} kN, ${fmt(shown.M,1)} kN·m</td></tr>
      <tr><td>Eccentricity, e</td><td class="clause">|M| / P</td><td class="num">${fmt(shown.e,3)} m</td></tr>
      <tr><td>Kern limit, B/6</td><td class="clause">—</td><td class="num">${fmt(shown.kernLimit,3)} m</td></tr>
      <tr><td>Allowable eccentricity, e<sub>allow</sub></td><td class="clause">${eccLimit ? '(e/B)<sub>allow</sub> · B' : 'no limit (project criterion) — partial uplift accepted'}</td><td class="num">${eccLimit ? fmt(shown.eAllow,3) + ' m' : '—'}</td></tr>
      <tr><td>Bearing method (resultant)</td><td class="clause">${shown.bearingNote}</td><td class="num">—</td></tr>
      <tr><td>q<sub>max</sub> / q<sub>min</sub> (resultant)</td><td class="clause">—</td><td class="num">${fmt(shown.qmax,1)} / ${fmt(shown.qmin,1)} kPa</td></tr>
      <tr><td>e<sub>x</sub>, e<sub>z</sub></td><td class="clause">|M<sub>z</sub>| / P, |M<sub>x</sub>| / P</td><td class="num">${fmt(shown.ex,3)} m, ${fmt(shown.ez,3)} m</td></tr>
      <tr><td>Contact (rigid footing, no tension)</td><td class="clause">${escapeHtml(shown.bpNote || '')}</td><td class="num">${fmt(shown.contactRatio * 100,1)} %</td></tr>
      <tr class="governing"><td>Bearing method (biaxial)</td><td class="clause">${escapeHtml(shown.bearNote || '')}</td><td class="num">—</td></tr>
      <tr class="governing"><td>${shown.meyUsed ? 'q′ = P/(B′L′) / q′<sub>a</sub>' : 'q<sub>max</sub> (biaxial corner) / q<sub>a</sub>'}</td><td class="clause">${shown.meyUsed ? 'Meyerhof effective area' : 'rigid footing, no tension'}</td><td class="num">${fmt(shown.qBear,1)} / ${fmt(shown.qaBear,1)} kPa</td></tr>
      <tr><td>q<sub>a</sub> (allowable)</td><td class="clause">${qaRef}</td><td class="num">${fmt(qa,1)} kPa</td></tr>
    </table></div>`;
    html += `<div class="overflow-x"><table class="calc-table">
      <caption>${escapeHtml(comboLabel(shown.combo))} — utilization per check</caption>
      <tr><th>Check</th><th>UC</th><th>Status</th></tr>
      ${shown.allChecks.map(c => `<tr class="${c === shown.governingAll ? 'governing' : ''}"><td>${c.name}</td><td class="num">${fmt(c.uc,3)}</td><td>${okNg(c.uc)}</td></tr>`).join('')}
    </table></div>`;
  }
  if (pts) {
    // Several load points — statics of the point loads about the footing centroid (footingPointLoads(), lib).
    const np = normalisePoints(pts);
    html += `<div class="lc-formula">
      <div class="lc-formula-title">Load points — moments about the footing centroid</div>
      The superstructure load of each combination (P<sub>top</sub>, and its moments at the underside incl. H·Δh) is shared out to the ${np.length} load points of Tab 02 by their shares: ${np.map((p, j) => `point ${j + 1} at (x, z) = (${fmt(p.x,2)}, ${fmt(p.y,2)}) m, ${fmt(p.c1,2)} × ${fmt(p.c2,2)} m, ${fmt(100 * p.f,1)} %`).join('; ')}. ${hasPed ? `A pedestal under each point (weights ${state.pedPointW.map(w => fmt(w,2)).join(' / ')} kN) acts at its point, less the backfill that is not over it; the` : 'The'} footing ${hasPed ? 'and the rest of the backfill act' : 'weight acts'} uniformly about the footing centre. The self-weight terms take the dead-load factor k<sub>D</sub> of the combination.<br>
      P<sub>j</sub> = f<sub>j</sub>·P<sub>top</sub>${hasPed ? ' + k<sub>D</sub>·(W<sub>ped,j</sub> − w<sub>s</sub>·A<sub>p,j</sub>)' : ''};&nbsp; ΔM<sub>z,pts</sub> = Σ P<sub>j</sub>·x<sub>j</sub>;&nbsp; ΔM<sub>x,pts</sub> = −Σ P<sub>j</sub>·z<sub>j</sub>
      <div class="lc-formula-where">Sign: M<sub>z</sub> &gt; 0 compresses the +x side, M<sub>x</sub> &gt; 0 compresses the −z side (same as the load vectors of Section 03). These moments are added to the bottom-of-footing moments of Section 03 (Table 3.3.2) for every check of this chapter.</div>
    </div>`;
    html += `<div class="overflow-x"><table class="calc-table">
      <caption>Moments from the load points per load combination</caption>
      <tr><th class="lc-no">No.</th><th>Combination</th><th>P<sub>top</sub> (kN)</th><th>k<sub>D</sub></th><th>ΔM<sub>x,pts</sub> (kN·m)</th><th>ΔM<sub>z,pts</sub> (kN·m)</th><th>M<sub>x</sub> (kN·m)</th><th>M<sub>z</sub> (kN·m)</th></tr>
      ${results.map(r => `<tr><td class="lc-no">${escapeHtml(r.combo.lc || '')}</td><td>${escapeHtml(r.combo.name)}</td><td class="num">${fmt(r.Ptop,2)}</td><td class="num">${fmt(r.kD,3)}</td><td class="num">${fmt(r.offMx,3)}</td><td class="num">${fmt(r.offMz,3)}</td><td class="num">${fmt(r.Mx,3)}</td><td class="num">${fmt(r.Mz,3)}</td></tr>`).join('')}
    </table></div>`;
  }
  if (hasOffset) {
    // Pedestal offset — statics of the vertical loads about the footing centroid (pedestalOffsetMoments(), lib).
    const Ap = Bp * Lp, Af = B * L, share = Af > Ap && Ap > 0 ? Ap / (Af - Ap) : 0;
    html += `<div class="lc-formula">
      <div class="lc-formula-title">Pedestal offset — moments about the footing centroid</div>
      The pedestal centre is at Off<sub>X</sub> = ${fmt(OffX,2)} m, Off<sub>Z</sub> = ${fmt(OffZ,2)} m from the footing centre. The loads at the top of the pedestal (P<sub>top</sub>) and the pedestal + grout weight W<sub>P</sub> + W<sub>G</sub> = ${fmt(state.pedW,2)} kN act there; the footing weight acts at the footing centre; the backfill above the footing, W<sub>soil</sub> = ${fmt(state.footSoilW,2)} kN, acts at its own centroid x<sub>s</sub> = −Off<sub>X</sub>·A<sub>p</sub>/(A<sub>f</sub> − A<sub>p</sub>) = ${fmt(-OffX * share + 0,4)} m, z<sub>s</sub> = −Off<sub>Z</sub>·A<sub>p</sub>/(A<sub>f</sub> − A<sub>p</sub>) = ${fmt(-OffZ * share + 0,4)} m. The self-weight terms take the dead-load factor k<sub>D</sub> of the combination.<br>
      ΔM<sub>z,off</sub> = (P<sub>top</sub> + k<sub>D</sub>·(W<sub>P</sub> + W<sub>G</sub>))·Off<sub>X</sub> + k<sub>D</sub>·W<sub>soil</sub>·x<sub>s</sub><br>
      ΔM<sub>x,off</sub> = −[(P<sub>top</sub> + k<sub>D</sub>·(W<sub>P</sub> + W<sub>G</sub>))·Off<sub>Z</sub> + k<sub>D</sub>·W<sub>soil</sub>·z<sub>s</sub>]
      <div class="lc-formula-where">Sign: M<sub>z</sub> &gt; 0 compresses the +x side, M<sub>x</sub> &gt; 0 compresses the −z side (same as the load vectors of Section 03). These moments are added to the bottom-of-footing moments of Section 03 (Table 3.3.2) for every check of this chapter.</div>
    </div>`;
    html += `<div class="overflow-x"><table class="calc-table">
      <caption>Moments from the pedestal offset per load combination</caption>
      <tr><th class="lc-no">No.</th><th>Combination</th><th>P<sub>top</sub> (kN)</th><th>k<sub>D</sub></th><th>ΔM<sub>x,off</sub> (kN·m)</th><th>ΔM<sub>z,off</sub> (kN·m)</th><th>M<sub>x</sub> (kN·m)</th><th>M<sub>z</sub> (kN·m)</th></tr>
      ${results.map(r => `<tr><td class="lc-no">${escapeHtml(r.combo.lc || '')}</td><td>${escapeHtml(r.combo.name)}</td><td class="num">${fmt(r.Ptop,2)}</td><td class="num">${fmt(r.kD,3)}</td><td class="num">${fmt(r.offMx,3)}</td><td class="num">${fmt(r.offMz,3)}</td><td class="num">${fmt(r.Mx,3)}</td><td class="num">${fmt(r.Mz,3)}</td></tr>`).join('')}
    </table></div>`;
  }
  // Kern (eccentricity), bearing pressure, sliding and overturning, each per load combination with its own governing
  // row. Kern comes first: e ≤ B/6 (or the seismic e/B limit) decides full contact or partial uplift, which the bearing
  // pressure formula (q_max / q_min) is built on. q_a comes from Section 08.
  const kernGov = validResults.length ? validResults.reduce((a, b) => b.ucKernBiaxial > a.ucKernBiaxial ? b : a) : null;
  const ucOf = (r, name) => (r.checks.find(c => c.name === name) || { uc: 0 }).uc;
  // Bearing: the larger of the resultant (uniaxial) and the biaxial no-tension pressure.
  const bearUC = (r) => Math.max(ucOf(r, 'Bearing pressure'), ucOf(r, 'Bearing pressure (biaxial)'));
  const bearingGov = validResults.length ? validResults.reduce((a, b) => bearUC(b) > bearUC(a) ? b : a) : null;
  const pct = (r) => `${fmt(r.contactRatio * 100, 0)} %`;
  const slidingGov = validResults.length ? validResults.reduce((a, b) => ucOf(b, 'Sliding') > ucOf(a, 'Sliding') ? b : a) : null;
  const otGov = validResults.length ? validResults.reduce((a, b) => b.ucOTBiaxial > a.ucOTBiaxial ? b : a) : null;
  // Every check of this chapter with its governing combination (same UC / LC as the 4.2-4.5 tables) — the Design Status
  // panel lists them under the Foundation Stability card (renderLiveBar()). Empty when no combination could be evaluated.
  // smallest share of the base in contact (rigid footing, no tension) — the governing row of the minimum-contact criterion
  const lowContact = validResults.length ? validResults.reduce((a, b) => (b.contactRatio < a.contactRatio ? b : a)) : null;
  const contactUC = (r) => (minC > 0 ? ucOf(r, contactName) : 0);
  lastResults.foundation.checks = validResults.length ? [
    // No eccentricity limit (project criterion): the kern is information only — not a UC, never NG (it is not part of the governing UC).
    eccLimit ? { name: 'Eccentricity (kern)', uc: kernGov.ucKernBiaxial, lc: kernGov.combo.lc || kernGov.combo.name }
      : minC > 0 ? null
      : { name: 'Contact area (kern, information)', uc: kernGov.ucKernBiaxial, lc: lowContact.combo.lc || lowContact.combo.name, info: true,
        text: lowContact.contactRatio >= 1 - 1e-9 ? 'full contact' : `min ${pct(lowContact)} in contact` },
    // minimum contact area (project criterion): a check with its UC
    minC > 0 ? { name: contactName, uc: contactUC(lowContact), lc: lowContact.combo.lc || lowContact.combo.name } : null,
    { name: 'Bearing pressure', uc: ucOf(bearingGov, 'Bearing pressure'), lc: bearingGov.combo.lc || bearingGov.combo.name },
    { name: 'Sliding', uc: ucOf(slidingGov, 'Sliding'), lc: slidingGov.combo.lc || slidingGov.combo.name },
    { name: 'Overturning', uc: otGov.ucOTBiaxial, lc: otGov.combo.lc || otGov.combo.name }
  ].filter(Boolean) : [];
  const ratioTxt = fmt(1 / eccRatioAllow, 2);
  html += sectionHeader('4.2', eccLimit ? 'Eccentricity (Kern) Check' : 'Eccentricity and Contact Area',
    (minC > 0 ? `Minimum contact area (project criterion): at least ${fmt(minC * 100, 0)} % of the base in contact, UC = ${fmt(minC, 2)} / contact ratio (rigid footing, soil without tension); net uplift or a resultant outside the base = no contact (UC ∞). ` : '') +
    (eccLimit
      ? `The resultant must stay inside the kern so the whole base remains in contact (q<sub>min</sub> ≥ 0). Both directions are checked together (biaxial): e<sub>x</sub> from the x-direction moments (WX, EQX), e<sub>z</sub> from the z-direction moments (WZ, EQZ).`
      : `No eccentricity limit applies to this project (Section 04 input): the resultant may leave the kern and part of the base may lift off. The eccentricities are reported for information — the kern ratio 6e<sub>x</sub>/B + 6e<sub>z</sub>/L ≤ 1 tells whether the whole base is in contact. Bearing pressure with the reduced contact area (4.3) and overturning (4.5) govern.`));
  html += `<div class="overflow-x"><table class="calc-table">
    <caption>Kern check — formula and criterion</caption>
    <tr><th>Parameter</th><th>Expression</th></tr>
    <tr><td>Eccentricity, x-direction (along B)</td><td class="clause">e<sub>x</sub> = |M<sub>z</sub>| / P</td></tr>
    <tr><td>Eccentricity, z-direction (along L)</td><td class="clause">e<sub>z</sub> = |M<sub>x</sub>| / P</td></tr>
    <tr><td>Kern limits (allowable ratio = 1/${ratioTxt})</td><td class="clause">e<sub>x,allow</sub> = B/${ratioTxt} = ${fmt(B*eccRatioAllow,3)} m, e<sub>z,allow</sub> = L/${ratioTxt} = ${fmt(L*eccRatioAllow,3)} m</td></tr>
    <tr><td>Biaxial kern utilization</td><td class="clause">UC = (e<sub>x</sub>/B + e<sub>z</sub>/L) / ${fmt(eccRatioAllow,4)}</td></tr>
    <tr class="governing"><td>Criterion</td><td class="clause">UC ≤ 1.0 → <strong>full contact</strong> (resultant inside the kern, q<sub>min</sub> ≥ 0) &nbsp;|&nbsp; UC &gt; 1.0 → <strong>partial uplift</strong> (base separates over part of the footing)${eccLimit ? '' : ' — accepted (no eccentricity limit), information only'}</td></tr>
  </table></div>
  <div class="overflow-x"><table class="calc-table">
    <caption>Kern check per load combination</caption>
    <tr><th class="lc-no">No.</th><th>Combination</th><th>P (kN)</th><th>e<sub>x</sub> (m)</th><th>e<sub>z</sub> (m)</th><th>Contact</th><th>${eccLimit ? 'UC' : 'Kern ratio'}</th>${minC > 0 ? `<th>UC contact (min ${fmt(minC * 100, 0)} %)</th>` : ''}<th>Status</th></tr>
    ${results.map(r => {
      if (!r.valid) return invalidRow(r, 5);
      const contact = r.ucKernBiaxial <= 1.0 ? 'Full contact' : `Partial uplift (${pct(r)} in contact)`;
      return `<tr class="${r === (minC > 0 && !eccLimit ? lowContact : kernGov) ? 'governing' : ''}"><td class="lc-no">${escapeHtml(r.combo.lc || '')}</td><td>${escapeHtml(r.combo.name)}</td><td class="num">${fmt(r.P,1)}</td><td class="num">${fmt(r.ex,3)}</td><td class="num">${fmt(r.ez,3)}</td><td>${contact}</td><td class="num">${fmt(r.ucKernBiaxial,3)}</td>${minC > 0 ? `<td class="num">${fmt(contactUC(r),3)}</td>` : ''}<td>${eccLimit ? (minC > 0 ? okNg(Math.max(r.ucKernBiaxial, contactUC(r))) : okNg(r.ucKernBiaxial)) : (minC > 0 ? okNg(contactUC(r)) : 'Info')}</td></tr>`;
    }).join('')}
  </table></div>`;
  html += sectionHeader('4.3', 'Bearing Pressure Check',
    `Maximum soil pressure under the footing against the allowable bearing capacity: UC = q<sub>max</sub> / q<sub>a</sub>, q<sub>a</sub> = ${fmt(qa,1)} kPa (${qaRef}). Two pressures are computed and the larger governs: (1) the resultant e = M/P as a uniaxial case (full contact q = (P/BL)(1 ± 6e/B); partial uplift: effective width B′ = B − 2e), and (2) the biaxial pressure with M<sub>x</sub> and M<sub>z</sub> at once and no tension — rigid footing, linear pressure over the contact zone only, solved from the three equilibrium equations (ΣV = P, ΣM about both axes); full contact gives q = (P/BL)(1 ± 6e<sub>x</sub>/B ± 6e<sub>z</sub>/L).${bearMeyerhof ? ` For partial uplift (e beyond the kern) the biaxial check uses the <strong>Meyerhof effective area</strong> instead: B′ = B − 2e<sub>x</sub>, L′ = L − 2e<sub>z</sub>, uniform q′ = P/(B′L′), against q′<sub>a</sub> recomputed with B′ × L′ (shorter side as the width) from the Section 08 soil data, formula and FS.` : ''}`);
  html += `<div class="overflow-x"><table class="calc-table">
    <caption>Bearing pressure check per load combination</caption>
    <tr><th class="lc-no">No.</th><th>Combination</th><th>P (kN)</th><th>e<sub>x</sub> (m)</th><th>e<sub>z</sub> (m)</th><th>Contact</th><th>q<sub>max</sub> resultant (kPa)</th><th>q biaxial (kPa)</th><th>q<sub>a</sub> used (kPa)</th><th>UC</th><th>Status</th></tr>
    ${results.map(r => {
      if (!r.valid) return invalidRow(r, 8);
      const uc = bearUC(r);
      return `<tr class="${r === bearingGov ? 'governing' : ''}"><td class="lc-no">${escapeHtml(r.combo.lc || '')}</td><td>${escapeHtml(r.combo.name)}</td><td class="num">${fmt(r.P,1)}</td><td class="num">${fmt(r.ex,3)}</td><td class="num">${fmt(r.ez,3)}</td><td class="num">${pct(r)}</td><td class="num">${fmt(r.qmax,1)}</td><td class="num">${Number.isFinite(r.qBear) ? fmt(r.qBear,1) + (r.meyUsed ? ' (B′L′)' : '') : '∞'}</td><td class="num">${fmt(r.qaBear,1)}</td><td class="num">${fmt(uc,3)}</td><td>${okNg(uc)}</td></tr>`;
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
    <strong>Limitation:</strong> The kern, bearing (no-tension, rigid footing, linear pressure) and overturning checks are biaxial; the bearing pressure is also checked with the resultant, and sliding uses the resultant H = √(F<sub>x</sub>² + F<sub>z</sub>²) and M = √(M<sub>x</sub>² + M<sub>z</sub>²) as a uniaxial case. No passive soil resistance, no buoyancy / uplift from groundwater, and no seismic pseudo-static (k<sub>h</sub>/k<sub>v</sub>) reduction. P, H and M include the top → bottom transfer (ΔW, Δh) of Section 03. The Permanent / Temporary case of each combination is detected from its load types (wind / seismic kinds, or "wind" / "seismic" in the label) — verify it against the project design basis for custom load types.
  </div>`;
  document.getElementById('calc-foundation').innerHTML = numberTables(html, '4');
  // Focus Canvas view of the same results (js/tabs/stabilityFocus.js) — shown instead of the report sheet in that mode.
  const lcOf = (r) => (r ? (r.combo.lc || r.combo.name) : null);
  // Focus tiles / table: kern and overturning as the larger of the uniaxial (resultant) and biaxial checks — both count in the
  // governing UC (combineFootingChecks()), so the tile never shows less than what governs.
  const kernUC = (r) => Math.max(ucOf(r, 'Eccentricity'), r.ucKernBiaxial);
  // No eccentricity limit: the kern tile / column shows the smallest contact area instead of a UC.
  const minContact = validResults.length ? validResults.reduce((a, b) => (b.contactRatio < a.contactRatio ? b : a)) : null;
  const otUC = (r) => Math.max(ucOf(r, 'Overturning'), r.ucOTBiaxial);
  const pick = (fn) => (validResults.length ? validResults.reduce((a, b) => (fn(b) > fn(a) ? b : a)) : null);
  const kernF = pick(kernUC), otF = pick(otUC);
  const sfTxt = (v) => (Number.isFinite(v) ? fmt(v, 2) : '∞');
  document.getElementById('focus-foundation').innerHTML = foundationFocusHTML({
    B, L, status: lastResults.foundation.status, nCombos: results.length, qaText: `${fmt(qa, 1)} kPa`,
    checks: [
      eccLimit
        ? { name: 'Eccentricity (kern)', uc: kernF ? kernUC(kernF) : null, lc: lcOf(kernF),
            sub: kernF ? `<span class="fz-nb">e<sub>x</sub> = ${fmt(kernF.ex, 3)} m</span> · <span class="fz-nb">e<sub>z</sub> = ${fmt(kernF.ez, 3)} m</span>` : '' }
        : minC > 0
          ? { name: contactName, uc: minContact ? contactUC(minContact) : null, lc: lcOf(minContact),
              sub: minContact ? `<span class="fz-nb">min ${pct(minContact)} in contact</span> vs <span class="fz-nb">${fmt(minC * 100, 0)} %</span>` : '' }
          : { name: 'Contact area (no e limit)', uc: minContact ? pct(minContact) : null, lc: lcOf(minContact),
            sub: minContact ? `<span class="fz-nb">e<sub>x</sub> = ${fmt(minContact.ex, 3)} m</span> · <span class="fz-nb">e<sub>z</sub> = ${fmt(minContact.ez, 3)} m</span>` : '' },
      { name: 'Bearing pressure', uc: bearingGov ? bearUC(bearingGov) : null, lc: lcOf(bearingGov),
        sub: bearingGov ? `<span class="fz-nb">q = ${fmt(bearingGov.qBear, 1)}</span> / <span class="fz-nb">q<sub>a</sub> = ${fmt(bearingGov.qaBear, 1)} kPa</span>${bearingGov.meyUsed ? ' <span class="fz-nb">(Meyerhof B′L′)</span>' : ''}` : '' },
      { name: 'Sliding', uc: slidingGov ? ucOf(slidingGov, 'Sliding') : null, lc: lcOf(slidingGov),
        sub: slidingGov ? `<span class="fz-nb">SF = ${sfTxt(slidingGov.fsSliding)}</span> vs <span class="fz-nb">min ${fmt(slidingGov.fsSlideMin, 2)}</span>` : '' },
      { name: 'Overturning', uc: otF ? otUC(otF) : null, lc: lcOf(otF),
        sub: otF ? `<span class="fz-nb">SF = ${sfTxt(otF.fsOTMin / otUC(otF))}</span> vs <span class="fz-nb">min ${fmt(otF.fsOTMin, 2)}</span>` : '' }
    ],
    rows: results.map((r) => (r.valid
      ? { lc: lcOf(r), name: r.combo.name, temporary: r.temporary, kern: eccLimit ? kernUC(r) : (minC > 0 ? contactUC(r) : pct(r)), bearing: bearUC(r), sliding: ucOf(r, 'Sliding'),
          ot: otUC(r), govKern: eccLimit ? r === kernF : r === minContact, govBearing: r === bearingGov, govSliding: r === slidingGov, govOt: r === otF }
      : { lc: lcOf(r), name: r.combo.name, invalid: r.note || 'Not evaluated.' })),
    // Own marker ids: the report copy of this diagram is hidden in this mode (a marker in a hidden SVG does not render elsewhere).
    svg: shownSvg.replaceAll('fdn-arrow', 'fz4a-arrow'), shownLc: lcOf(shown)
  });
}
