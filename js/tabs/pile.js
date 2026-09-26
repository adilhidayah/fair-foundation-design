// 4B — Pile layout + pile group stability (biaxial forces, torsion, group efficiency, lateral p-multipliers,
// spacing / edge-distance check). All formulas live in lib/foundation/shared/pileGroup.js — this module reads the
// inputs, calls the library and renders the preview.
// Moved from app.js — function/const declarations only; event wiring stays in app.js.
import { DEFAULT_P_MULTIPLIERS, evaluatePileGroupCombo, lateralPMultipliers, pileGroupEfficiency, pileLayoutCheck, stdComboVector } from '../../lib/foundation/index.js?v=20260926h';
import { escapeHtml, getRadioVal, num } from '../core/dom.js?v=20260926h';
import { fmt as fmtRaw } from '../core/format.js?v=20260926h';
import { comboState, lastResults, pileList } from '../core/state.js?v=20260926h';
import { comboLabel } from '../core/worksheet.js?v=20260926h';
import { pileDiagramSVG } from '../diagrams/pileDiagram.js?v=20260926h';
import { buildStdComboBase, untypedLoadTypesWarning } from '../tabs/combos.js?v=20260926h';

// A value that rounds to zero prints as 0, never "-0.0" (torsion / eccentricity terms are often exactly zero).
const fmt = (n, dec = 2) => fmtRaw(Math.abs(n) < 0.5 * Math.pow(10, -dec) ? 0 : n, dec);

export function renderPileTable() {
  document.getElementById('pf-pile-body').innerHTML = pileList.map((p, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><input type="number" step="0.1" class="pile-input" data-i="${i}" data-f="x" value="${p.x}"></td>
      <td><input type="number" step="0.1" class="pile-input" data-i="${i}" data-f="y" value="${p.y}"></td>
      <td><button type="button" class="combo-remove" data-i="${i}" title="Remove pile">•</button></td>
    </tr>`).join('');
}
// Replaces the pile layout with a regular nx x ny grid centred on the pile cap centre (the origin).
export function generatePileGrid() {
  const nx = Math.max(1, Math.round(num('pf-gen-nx'))), ny = Math.max(1, Math.round(num('pf-gen-ny')));
  if (nx * ny > 200) return false;
  const sx = num('pf-gen-sx'), sy = num('pf-gen-sy');
  pileList.length = 0;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      pileList.push({ x: +((i - (nx - 1) / 2) * sx).toFixed(4), y: +((j - (ny - 1) / 2) * sy).toFixed(4) });
    }
  }
  return true;
}
// Sets the pile cap plan size in Tab 02 from the pile layout: the cap is centred on the origin, so
//   Bf = 2·(largest |x| + e),  Lf = 2·(largest |y| + e),  rounded up to 50 mm,   e = edge distance (pile centre to edge).
// e comes from the "Fit cap size" field, or — when blank — from the edge-distance warning limit; never a built-in value.
// Returns { ok, msg }; on success the caller re-runs Tab 02 (fs-Bf / fs-Lf are updated here).
export function fitCapToPiles() {
  if (pileList.length === 0) return { ok: false, msg: 'No piles defined.' };
  const D = num('pf-dia') / 1000;
  let e = limitToM('pf-fit-edge', D), src = 'the field above';
  if (!(e > 0)) { e = limitToM('pf-lim-ewarn', D); src = 'the edge-distance warning limit'; }
  if (!(e > 0)) return { ok: false, msg: 'Enter the edge distance to use (× D needs the pile diameter D in Tab 01) — or fill in the edge-distance warning limit.' };
  const ax = Math.max(...pileList.map(p => Math.abs(p.x))), ay = Math.max(...pileList.map(p => Math.abs(p.y)));
  const up50 = (v) => Math.ceil(v / 0.05 - 1e-9) * 0.05;
  const Bf = up50(2 * (ax + e)), Lf = up50(2 * (ay + e));
  document.getElementById('fs-Bf').value = Bf.toFixed(2);
  document.getElementById('fs-Lf').value = Lf.toFixed(2);
  return { ok: true, msg: `Cap set to ${Bf.toFixed(2)} × ${Lf.toFixed(2)} m in Tab 02 — edge distance ${e.toFixed(3)} m${D > 0 ? ` (${(e / D).toFixed(2)}D)` : ''} from ${src}, rounded up to 50 mm.` };
}
// Restores the default (editable) p-multiplier table into its inputs.
export function resetPMultiplierInputs() {
  DEFAULT_P_MULTIPLIERS.points.forEach((pt, k) => {
    ['s', 'a', 'b', 'c'].forEach((f, j) => { document.getElementById(`pm-${f}${k + 1}`).value = j === 0 ? pt.sD : pt.rows[j - 1]; });
  });
}

// ----- input readers (UI units -> SI metres for lib/) -----
const limitToM = (id, D) => {
  const v = num(id);
  if (!(v > 0)) return null;
  return document.getElementById(id + '-u').value === 'D' ? v * D : v / 1000;
};
function readPMultiplierTable() {
  const pts = [1, 2].map(k => {
    const v = ['s', 'a', 'b', 'c'].map(f => parseFloat(document.getElementById(`pm-${f}${k}`).value));
    return v.every(x => isFinite(x) && x > 0) ? { sD: v[0], rows: v.slice(1) } : null;
  }).filter(Boolean).sort((a, b) => a.sD - b.sD);
  if (pts.length < 2 || pts[0].sD === pts[1].sD) return { table: DEFAULT_P_MULTIPLIERS, invalid: true };
  const same = pts.every((pt, k) => pt.sD === DEFAULT_P_MULTIPLIERS.points[k].sD && pt.rows.every((r, j) => r === DEFAULT_P_MULTIPLIERS.points[k].rows[j]));
  // A source typed by the user replaces the built-in "verify" wording — it is the reference the checker will read.
  const typed = document.getElementById('pf-pm-src').value.trim();
  const source = typed ? `Source: ${typed}` : (same ? DEFAULT_P_MULTIPLIERS.source : 'Project-specific table (edited by the user) — source not stated');
  return { table: { source, points: pts }, invalid: false };
}

const stTxt = (s) => `<span class="${s === 'FAIL' ? 'pf-st-fail' : (s === 'WARNING' ? 'pf-st-warn' : (s === 'NOT SET' ? 'pf-st-ns' : ''))}">${s}</span>`;
const paren = (v, d) => (v < 0 ? `(${fmt(v, d)})` : fmt(v, d));
const inD = (m, D) => `${fmt(m, 3)} m (${fmt(m / D, 2)}D)`;
// Preview structure follows the other chapters (01 General, 02 Foundation Dimension): a chapter title, numbered
// sub-sections with a short introduction, and captions "Table 4.n." numbered in the order they appear.
const CHAPTER_TITLE = '<div class="report-header"><h2>04. Pile Foundation Stability</h2></div>';
const introP = (t) => `<p style="margin:0 0 10px; font-size:13px; color:var(--ink-soft); line-height:1.5;">${t}</p>`;

// Loads at the underside of the pile cap for every combination, in the form evaluatePileGroupCombo() takes — the same
// biaxial vectors as 4A / the "Load at bottom of footing" table (P incl. ΔW, moments incl. H·Δh). `at` is the load
// point: the pedestal centre (Off X / Off Z from Tab 02), or the cap centre when there is no pedestal. Shared by 4B
// and the 5B pile cap flexure so both read the same pile forces.
// set: 'lc' (ASD — 4B pile capacity checks) or 'lrfd' (factored — 5B pile cap flexure / shear).
export function pileComboLoads(set = 'lc') {
  const hasPed = getRadioVal('fs-type') === 'pedestal';
  const at = hasPed ? { x: num('fs-OffX'), y: num('fs-OffZ') } : { x: 0, y: 0 };
  const base = buildStdComboBase();
  const items = comboState[set].map(combo => {
    const v = stdComboVector(combo.f, base);
    return { combo, load: { P: v.P + v.dP, Hx: v.Fx, Hz: v.Fz, Mx: v.Mx + v.dMx, Mz: v.Mz + v.dMz, at } };
  });
  return { at, items };
}

export function calcPile() {
  const Qc = num('pf-Qc'), Qt = num('pf-Qt'), Ql = num('pf-Ql');
  const D = num('pf-dia') / 1000; // mm -> m
  const Bf = num('fs-Bf'), Lf = num('fs-Lf');
  const { at, items } = pileComboLoads();
  const out = document.getElementById('calc-pile');
  lastResults.pile = { label: 'Pile Foundation Stability', status: 'ERROR', metric: '—', detail: 'Not yet computed.' };
  if (pileList.length === 0) {
    out.innerHTML = CHAPTER_TITLE + `<div class="warn-box"><strong>⚠  No piles defined:</strong> add at least one pile.</div>`;
    lastResults.pile.detail = 'No piles defined.';
    return;
  }
  if (comboState.lc.length === 0) {
    out.innerHTML = CHAPTER_TITLE + `<div class="warn-box"><strong>⚠  No load combinations:</strong> add at least one combination in the "03 — LOADING DATA" tab.</div>`;
    lastResults.pile.detail = 'No load combinations defined.';
    return;
  }
  if (!(D > 0)) {
    out.innerHTML = CHAPTER_TITLE + `<div class="warn-box"><strong>⚠  Pile diameter missing:</strong> enter the pile diameter D in "01 — GENERAL INPUT DATA" (Deep Foundation) — spacing limits, group efficiency and p-multipliers are all based on D.</div>`;
    lastResults.pile.detail = 'Pile diameter D not set.';
    return;
  }

  // ---- layout (spacing / edge) ----
  const limits = { spacingMin: limitToM('pf-lim-smin', D), spacingWarn: limitToM('pf-lim-swarn', D), edgeWarn: limitToM('pf-lim-ewarn', D) };
  const layout = pileLayoutCheck(pileList, Bf, Lf, limits);
  const limSource = document.getElementById('pf-lim-src').value.trim();

  // ---- axial group efficiency ----
  const effType = document.getElementById('pf-eff-type').value;
  const manualEg = parseFloat(document.getElementById('pf-eff-manual').value);
  const eff = pileGroupEfficiency({ piles: pileList, D, type: effType, sNoReduction: limitToM('pf-eff-thr', D),
    manualEg: isFinite(manualEg) ? manualEg : null });
  const EgOk = eff.valid && Number.isFinite(eff.Eg);

  // ---- lateral p-multipliers ----
  const latOn = document.getElementById('pf-lat-on').checked;
  const latMethod = document.getElementById('pf-lat-method').value;
  const pm = readPMultiplierTable();
  const latInfoX = latOn ? lateralPMultipliers({ piles: pileList, D, dir: 'x', table: pm.table }) : null;
  const latInfoZ = latOn ? lateralPMultipliers({ piles: pileList, D, dir: 'z', table: pm.table }) : null;

  // ---- per-combination pile forces (same biaxial vectors as 4A / the "Load at bottom of footing" table) ----
  let results = [];
  if (EgOk) {
    results = items.map(({ combo, load }) => {
      const opts = { Eg: eff.Eg, lateralMethod: latMethod };
      if (latOn) {
        opts.latX = lateralPMultipliers({ piles: pileList, D, dir: 'x', sign: Math.sign(load.Hx), table: pm.table });
        opts.latZ = lateralPMultipliers({ piles: pileList, D, dir: 'z', sign: Math.sign(load.Hz), table: pm.table });
      }
      return { combo, load, ...evaluatePileGroupCombo(pileList, load, { Qc, Qt, Ql }, opts) };
    });
  }
  const valid = results.filter(r => r.valid);
  const governing = valid.length ? valid.reduce((a, b) => (b.governingUC > a.governingUC ? b : a)) : null;
  const compGov = valid.length ? valid.reduce((a, b) => (b.checks[0].uc > a.checks[0].uc ? b : a)) : null;
  const tensGov = valid.length ? valid.reduce((a, b) => (b.checks[1].uc > a.checks[1].uc ? b : a)) : null;
  const latGov = valid.length ? valid.reduce((a, b) => (b.checks[2].uc > a.checks[2].uc ? b : a)) : null;

  // ---- overall status: FAIL beats incomplete (NOT SET); NOT SET is never PASS ----
  const layoutFail = layout.spacing.status === 'FAIL' || layout.edge.status === 'FAIL';
  const forcesFail = governing ? !governing.overallPass : false;
  const incomplete = layout.notSet.length > 0 || !EgOk || !governing;
  const status = (layoutFail || forcesFail) ? 'FAIL' : (incomplete ? 'ERROR' : 'PASS');
  const warnCount = layout.warnings.length + (latOn && latInfoX && latInfoX.belowRange ? 1 : 0) + (latOn && latInfoZ && latInfoZ.belowRange ? 1 : 0);
  const ucForces = governing ? governing.governingUC : 0;
  const spacingGoverns = layout.spacing.uc !== null && layout.spacing.uc > ucForces;
  const ucTop = Math.max(ucForces, layout.spacing.uc || 0);
  lastResults.pile = {
    label: 'Pile Foundation Stability',
    status,
    metric: governing ? `UC = ${fmt(ucTop, 3)}` : '—',
    detail: (governing
      ? (spacingGoverns
        ? `Governing: minimum pile spacing (s=${fmt(layout.spacing.actual, 2)} m), n=${pileList.length} piles, E_g=${fmt(eff.Eg, 3)}`
        : `Governing: ${comboLabel(governing.combo)} — ${governing.governingCheck.name}, n=${pileList.length} piles, E_g=${fmt(eff.Eg, 3)}`)
      : (!EgOk ? (eff.note || eff.reason || 'Group efficiency not determined.') : 'Invalid pile group.'))
      + (layout.notSet.length ? ` | NOT SET: ${layout.notSet.join(', ')}` : '')
      + (layoutFail ? ' | layout FAIL' : '')
      + (warnCount ? ` | ⚠ ${warnCount} warning(s)` : '')
  };

  // ================= render =================
  let sec = 0;
  const section = (title, intro) => { sec += 1; return `<div class="section-label"${sec > 1 ? ' style="margin-top:20px;"' : ''}>4.${sec} ${title}</div>${intro ? introP(intro) : ''}`; };
  let html = CHAPTER_TITLE + introP('This chapter checks the pile group under the ASD load combinations of Section 03: the pile layout against the pile cap and the project limits, the axial force on each pile (compression and uplift), and the lateral force on each pile including torsion from the eccentricity of the load point. Pile capacities are the single-pile allowable values of Section 01.') + untypedLoadTypesWarning();
  if (!EgOk) {
    html += `<div class="warn-box"><strong>⚠  Group efficiency not determined:</strong> ${escapeHtml(eff.note || eff.reason || '')} (input panel → Group Efficiency)</div>`;
  } else if (!governing) {
    const bad = results.find(r => !r.valid);
    html += `<div class="warn-box"><strong>⚠  Invalid:</strong> ${bad ? escapeHtml(comboLabel(bad.combo) + ': ' + bad.note) : 'no valid combination.'}</div>`;
  }
  // No verdict box here: the PASS / FAIL / INCOMPLETE status, the governing UC and the governing combination are shown in
  // the Live Design panel (from lastResults.pile above), and the DCR summary table (4.5) repeats them per check.
  // Notifications (NOT SET limits, layout warnings, p-multiplier warnings) are not printed in the preview: they are handed
  // to the Design Status panel on the right (renderLiveBar() reads lastResults.pile.notices). Plain text — the panel escapes it.
  const notices = [];
  if (layout.notSet.length) notices.push({ title: 'NOT SET — not counted as PASS', text: `${layout.notSet.join(', ')}. Enter the project limits in the input panel ("Spacing & Edge Limits").` });
  layout.warnings.forEach(w => notices.push({ title: 'Warning', text: w }));
  if (latOn && ((latInfoX && latInfoX.belowRange) || (latInfoZ && latInfoZ.belowRange))) {
    notices.push({ title: 'Warning', text: `Row spacing in the load direction is below the first p-multiplier table point — Pm held at that point's values. Enter a project-specific table if a value for the actual spacing is available.` });
  }
  if (pm.invalid && latOn) notices.push({ title: 'p-multiplier table incomplete', text: 'The default table is used until both spacing points are filled in.' });
  lastResults.pile.notices = notices;

  // Diagram — governing combination's axial forces on the real cap outline.
  const diagramInfo = { at, spacingPair: layout.spacing.pair, spacing: layout.spacing.actual, edgePile: layout.edge.pile, edge: layout.edge.actual };
  const diagramOpts = { coords: document.getElementById('pf-show-coords').checked, dims: document.getElementById('pf-show-dims').checked,
    marks: document.getElementById('pf-show-marks').checked };
  // Per-pile status for the colours: axial UC against the group compression / tension capacity, and the pile's own lateral
  // UC (with torsion) — a pile is drawn red as soon as either exceeds 1.0. Blue = compression, yellow = tension otherwise.
  const forcesForDiagram = governing ? governing.pileForces.map((pf, k) => {
    const cap = pf.F < 0 ? governing.QtG : governing.QcG;
    const ucAxial = Math.abs(pf.F) < 1e-9 ? 0 : (cap > 0 ? Math.abs(pf.F) / cap : Infinity);
    const ucLat = governing.latPiles[k].uc;
    return { ...pf, ucAxial, ucLat, fail: ucAxial > 1 + 1e-9 || ucLat > 1 + 1e-9 };
  }) : null; // no forces yet -> pile numbers only
  html += section('Pile Layout', `Plan of the pile group on the pile cap (${fmt(Bf, 2)} × ${fmt(Lf, 2)} m from Section 02), with the minimum spacing and edge distance checked against the project limits. Coordinates are measured from the pile cap centre; pile colours show the axial state in the governing combination.`);
  html += pileDiagramSVG(pileList, Bf, Lf, D, forcesForDiagram, diagramInfo, diagramOpts);

  // 1) Layout check
  const sp = layout.spacing, ed = layout.edge;
  const spActual = sp.actual === null ? '—' : inD(sp.actual, D) + (sp.pair ? ` (piles ${sp.pair[0]}–${sp.pair[1]})` : '');
  const warnStatus = sp.warnLimit === null ? 'N/A' : (sp.actual !== null && sp.actual < sp.warnLimit - 1e-9 ? 'WARNING' : 'OK');
  html += `<div class="overflow-x"><table class="calc-table">
    <caption>Pile layout check — spacing and edge distance (limits are project-specific inputs${limSource ? ` — per ${escapeHtml(limSource)}` : ''})</caption>
    <tr><th>Check</th><th>Expression</th><th>Actual</th><th>Limit</th><th>UC</th><th>Status</th></tr>
    <tr><td>Minimum spacing, s<sub>min</sub></td><td class="clause">min √(Δx² + Δy²), all pairs; UC = s<sub>lim</sub> / s</td><td class="num">${spActual}</td><td class="num">${sp.limit === null ? 'not set' : '≥ ' + inD(sp.limit, D)}</td><td class="num">${sp.uc === null ? '—' : fmt(sp.uc, 3)}</td><td>${stTxt(sp.status)}</td></tr>
    <tr><td>Recommended spacing (warning)</td><td class="clause">s<sub>min</sub> ≥ s<sub>rec</sub></td><td class="num">${sp.actual === null ? '—' : inD(sp.actual, D)}</td><td class="num">${sp.warnLimit === null ? 'not set' : '≥ ' + inD(sp.warnLimit, D)}</td><td class="num">—</td><td>${stTxt(warnStatus)}</td></tr>
    <tr><td>Minimum edge distance, e<sub>min</sub></td><td class="clause">min[B<sub>f</sub>/2 − |x|, L<sub>f</sub>/2 − |y|], pile centre to cap edge</td><td class="num">${ed.actual === null ? '—' : inD(ed.actual, D) + ` (pile ${ed.pile})`}</td><td class="num">${ed.warnLimit === null ? 'not set' : '≥ ' + inD(ed.warnLimit, D) + ' (warning only)'}</td><td class="num">—</td><td>${stTxt(ed.status)}</td></tr>
    <tr><td>Pile centres inside the cap</td><td class="clause">e<sub>min</sub> ≥ 0 (B<sub>f</sub> = ${fmt(Bf, 2)} m, L<sub>f</sub> = ${fmt(Lf, 2)} m)</td><td class="num">${ed.actual === null ? '—' : fmt(ed.actual, 3) + ' m'}</td><td class="num">≥ 0</td><td class="num">—</td><td>${stTxt(layout.inside === null ? 'NOT SET' : (layout.inside ? 'OK' : 'FAIL'))}</td></tr>
  </table></div>`;

  // 2) Axial group efficiency — shown only when a reduction is actually applied (spacing below the project's "no
  //    reduction" threshold, or a manual E_g < 1), or when E_g could not be determined (the table then says why).
  //    With spacing at / above the threshold, end-bearing piles, a single pile or a manual E_g = 1 there is no
  //    reduction, so the section is left out and the full P_all / T_all are used.
  if (eff.valid && (eff.applied || !EgOk)) {
    const rows = [];
    rows.push(`<tr><td>Pile type</td><td class="clause">input</td><td class="num">${effType === 'end' ? 'End-bearing / rock socket' : 'Friction (cohesive soil)'}</td></tr>`);
    if (eff.s !== undefined) rows.push(`<tr><td>Minimum spacing, s</td><td class="clause">min c/c</td><td class="num">${inD(eff.s, D)}</td></tr>`);
    if (eff.m !== undefined) rows.push(`<tr><td>Grid, m × n</td><td class="clause">columns × rows</td><td class="num">${eff.m} × ${eff.n}</td></tr>`);
    if (eff.thetaDeg !== undefined) {
      rows.push(`<tr><td>θ</td><td class="clause">arctan(D / s) = arctan(${fmt(D, 3)} / ${fmt(eff.s, 3)})</td><td class="num">${fmt(eff.thetaDeg, 3)}°</td></tr>`);
      rows.push(`<tr><td>Group efficiency, E<sub>g</sub></td><td class="clause">1 − θ[(n−1)m + (m−1)n] / (90·m·n) = 1 − ${fmt(eff.thetaDeg, 3)}·[(${eff.n}−1)·${eff.m} + (${eff.m}−1)·${eff.n}] / (90·${eff.m}·${eff.n})</td><td class="num">${fmt(eff.Eg, 4)}</td></tr>`);
    }
    rows.push(`<tr class="governing"><td>E<sub>g</sub> used</td><td class="clause">${eff.method === 'converse-labarre' ? 'Converse–Labarre — geotechnical practice, not an ACI/ASCE clause' : escapeHtml(eff.reason || '')}</td><td class="num">${EgOk ? fmt(eff.Eg, 4) : '—'}</td></tr>`);
    if (EgOk) {
      rows.push(`<tr><td>Group compression capacity, P<sub>all,g</sub></td><td class="clause">E<sub>g</sub> · P<sub>all</sub> = ${fmt(eff.Eg, 4)} · ${fmt(Qc, 1)}</td><td class="num">${fmt(eff.Eg * Qc, 1)} kN</td></tr>`);
      rows.push(`<tr><td>Group tension capacity, T<sub>all,g</sub></td><td class="clause">E<sub>g</sub> · T<sub>all</sub> = ${fmt(eff.Eg, 4)} · ${fmt(Qt, 1)}</td><td class="num">${fmt(eff.Eg * Qt, 1)} kN</td></tr>`);
    }
    html += section('Axial Group Efficiency', 'Pile spacing below the project threshold reduces the compression and tension capacity of each pile by the group efficiency E<sub>g</sub> (Converse–Labarre, geotechnical practice). It is not applied to the lateral capacity.');
    html += `<div class="overflow-x"><table class="calc-table">
      <caption>Axial group efficiency — applied to P<sub>all</sub> and T<sub>all</sub> only</caption>
      <tr><th>Parameter</th><th>Expression</th><th>Value</th></tr>
      ${rows.join('')}
    </table></div>`;
  }

  // 3) Lateral p-multipliers
  if (latOn) {
    const dirRows = (info, label) => {
      if (!info || info.valid === false) return `<tr><td>${label}</td><td colspan="4">—</td></tr>`;
      if (!info.applied) return `<tr><td>${label}</td><td class="num" colspan="3">${escapeHtml(info.reason)}</td><td class="num">1.000</td></tr>`;
      return `<tr><td>${label}</td><td class="num">${fmt(info.rowSpacing, 3)} m (${fmt(info.sD, 2)}D)</td>
        <td class="num">${info.rows.map(r => `row ${r.row}: ${fmt(r.Pm, 3)} ×${r.count}`).join('; ')}</td>
        <td class="num">avg ${fmt(info.PmAvg, 3)} / min ${fmt(info.PmMin, 3)}</td>
        <td class="num">${fmt(latMethod === 'average' ? info.PmAvg : info.PmMin, 3)}</td></tr>`;
    };
    html += section('Lateral Group Reduction', 'The lateral capacity of each pile is reduced by row in the load direction with p-multipliers P<sub>m</sub>. The single-pile lateral capacity H<sub>all</sub> must not already include group effects.');
    html += `<div class="overflow-x"><table class="calc-table">
      <caption>Lateral group reduction — p-multipliers P<sub>m</sub> (H<sub>all</sub>,row = P<sub>m</sub> · H<sub>all</sub>), ${latMethod === 'average' ? 'average of rows' : 'governing (minimum) row'} used — ${escapeHtml(pm.table.source)}</caption>
      <tr><th>Load direction</th><th>Row spacing</th><th>P<sub>m</sub> by row (leading row first, worse sign shown)</th><th>Summary</th><th>P<sub>m</sub> used</th></tr>
      ${dirRows(latInfoX, 'along x (H<sub>x</sub>)')}
      ${dirRows(latInfoZ, 'along y (H<sub>z</sub>)')}
    </table></div>`;
  }

  if (governing) {
    // 4) Governing combination detail
    const g = governing, L = g.load;
    const ax = g.at.x - g.xbar, ay = g.at.y - g.ybar;
    html += section('Design Loads and Pile Forces', `Loads at the underside of the pile cap for the governing combination (${escapeHtml(comboLabel(g.combo))}), transferred to the centroid of the pile group, and the resulting axial and lateral force on each pile. The eccentricity of the load point from the centroid produces the moments M<sub>z,c</sub>, M<sub>x,c</sub> and the torsion T.`);
    html += `<div class="overflow-x"><table class="calc-table">
      <caption>Governing combination: ${escapeHtml(comboLabel(g.combo))} — loads at pile cap underside and transfer to the pile-group centroid</caption>
      <tr><th>Parameter</th><th>Expression</th><th>Value</th></tr>
      <tr><td>Vertical load, P (incl. ΔW)</td><td class="clause">Tab 03</td><td class="num">${fmt(L.P, 1)} kN</td></tr>
      <tr><td>Lateral, H<sub>x</sub> / H<sub>z</sub></td><td class="clause">Tab 03</td><td class="num">${fmt(L.Hx, 1)} / ${fmt(L.Hz, 1)} kN</td></tr>
      <tr><td>Moments, M<sub>x</sub> / M<sub>z</sub> (incl. H·Δh)</td><td class="clause">Tab 03</td><td class="num">${fmt(L.Mx, 1)} / ${fmt(L.Mz, 1)} kN·m</td></tr>
      <tr><td>Load point (pedestal centre)</td><td class="clause">(Off<sub>X</sub>, Off<sub>Z</sub>) from the cap centre</td><td class="num">(${fmt(g.at.x, 3)}, ${fmt(g.at.y, 3)}) m</td></tr>
      <tr><td>Pile-group centroid (centre of rigidity)</td><td class="clause">x̅ = Σx/n, ȳ = Σy/n</td><td class="num">(${fmt(g.xbar, 3)}, ${fmt(g.ybar, 3)}) m</td></tr>
      <tr><td>Eccentricity of load point, a</td><td class="clause">a = load point − centroid</td><td class="num">(${fmt(ax, 3)}, ${fmt(ay, 3)}) m</td></tr>
      <tr><td>Moments about the centroid</td><td class="clause">M<sub>z,c</sub> = M<sub>z</sub> + P·a<sub>x</sub>;  M<sub>x,c</sub> = M<sub>x</sub> − P·a<sub>y</sub></td><td class="num">${fmt(g.Mzc, 1)} / ${fmt(g.Mxc, 1)} kN·m</td></tr>
      <tr><td>Torsion about the vertical axis, T</td><td class="clause">T = a<sub>y</sub>·H<sub>x</sub> − a<sub>x</sub>·H<sub>z</sub></td><td class="num">${fmt(g.T, 1)} kN·m</td></tr>
      <tr><td>Polar moment of the pile group, J</td><td class="clause">Σ[(x−x̅)² + (y−ȳ)²] = ${fmt(g.Sxx, 3)} + ${fmt(g.Syy, 3)}</td><td class="num">${fmt(g.J, 3)} m²</td></tr>
    </table></div>`;
    html += `<div class="overflow-x"><table class="calc-table">
      <caption>Governing combination: ${escapeHtml(comboLabel(g.combo))} — force on each pile</caption>
      <tr><th>Pile</th><th>x (m)</th><th>y (m)</th><th>Axial F (kN)</th><th>Axial check</th><th>V<sub>x</sub> (kN)</th><th>V<sub>z</sub> (kN)</th><th>V (kN)</th><th>UC<sub>l</sub></th></tr>
      ${g.pileForces.map((pf, k) => {
        const lp = g.latPiles[k];
        const cap = pf.F < 0 ? g.QtG : g.QcG;
        const ucA = cap > 0 ? Math.abs(pf.F) / cap : Infinity;
        const axial = pf.F < 0 ? (ucA <= 1 ? 'OK (tension)' : 'EXCEEDS (tension)') : (ucA <= 1 ? 'OK' : 'EXCEEDS');
        const isGov = pf.i === g.FmaxPile.i || pf.i === g.FminPile.i || pf.i === g.VmaxPile.i;
        return `<tr class="${isGov ? 'governing' : ''}"><td>${pf.i}</td><td class="num">${fmt(pf.x, 2)}</td><td class="num">${fmt(pf.y, 2)}</td><td class="num">${fmt(pf.F, 1)}</td><td>${axial}</td><td class="num">${fmt(lp.Vx, 1)}</td><td class="num">${fmt(lp.Vz, 1)}</td><td class="num">${fmt(lp.V, 1)}</td><td class="num">${fmt(lp.uc, 3)}</td></tr>`;
      }).join('')}
    </table></div>`;

    // 5) DCR per check. Compression, tension and lateral are governed by different combinations (and different piles), so each
    //    check has its own summary row, its own table, and its own governing row — never one combined "governing" row.
    const pileCells = (p) => (p ? `<td class="num">#${p.i}</td><td class="num">(${fmt(p.x, 2)}, ${fmt(p.y, 2)})</td>` : '<td class="num">—</td><td class="num">—</td>');
    const okTxt = (uc) => (uc <= 1.0 + 1e-9 ? 'OK' : stTxt('FAIL'));
    const invalidRow = (r, cols) => `<tr><td>${escapeHtml(r.combo.lc || '')}</td><td>${escapeHtml(r.combo.name)}</td><td colspan="${cols}" class="num">${escapeHtml(r.note || 'INVALID')}</td><td>INVALID</td></tr>`;
    const tensDemand = (r) => Math.max(-r.Fmin, 0), compDemand = (r) => Math.max(r.Fmax, 0);
    html += section('Demand / Capacity Ratio (DCR)', 'Compression, tension and lateral are checked separately for every load combination; each check is governed by its own combination and pile, highlighted in its table. DCR = demand / capacity, and the check is satisfied when DCR ≤ 1.0.');
    const summaryRows = [];
    if (compGov) summaryRows.push({ name: 'Compression (max pile)', demand: `${fmt(compDemand(compGov), 1)} kN`, cap: `P<sub>all,g</sub> = ${fmt(g.QcG, 1)} kN`, uc: compGov.checks[0].uc, combo: compGov.combo, pile: compDemand(compGov) > 0 ? compGov.FmaxPile : null });
    if (tensGov) summaryRows.push({ name: 'Tension / uplift (min pile)', demand: `${fmt(tensDemand(tensGov), 1)} kN`, cap: `T<sub>all,g</sub> = ${fmt(g.QtG, 1)} kN`, uc: tensGov.checks[1].uc, combo: tensGov.combo, pile: tensDemand(tensGov) > 0 ? tensGov.FminPile : null });
    if (latGov) summaryRows.push({ name: 'Lateral (max pile, incl. torsion)', demand: `${fmt(latGov.Vmax, 1)} kN`, cap: `H<sub>all</sub> = ${fmt(Ql, 1)} kN${latOn ? ` (P<sub>m,x</sub> = ${fmt(latGov.PmX, 2)}, P<sub>m,z</sub> = ${fmt(latGov.PmZ, 2)})` : ''}`, uc: latGov.checks[2].uc, combo: latGov.combo, pile: latGov.Vmax > 0 ? latGov.VmaxPile : null });
    if (layout.spacing.uc !== null && layout.spacing.actual !== null) summaryRows.push({ name: 'Minimum pile spacing', demand: `${fmt(layout.spacing.limit, 3)} m (required)`, cap: `${fmt(layout.spacing.actual, 3)} m (actual)`, uc: layout.spacing.uc, combo: null, pile: null });
    const ucMax = Math.max(...summaryRows.map(x => x.uc));
    html += `<div class="overflow-x"><table class="calc-table">
      <caption>Demand / capacity ratio (DCR) per check — each check with its own governing load combination (ASD)</caption>
      <tr><th>Check</th><th>Demand</th><th>Capacity</th><th>DCR</th><th>Governing combination</th><th>Pile</th><th>(x, y) m</th><th>Status</th></tr>
      ${summaryRows.map(x => `<tr class="${x.uc === ucMax ? 'governing' : ''}"><td>${x.name}</td><td class="num">${x.demand}</td><td class="num">${x.cap}</td><td class="num">${fmt(x.uc, 3)}</td><td>${x.combo ? escapeHtml(comboLabel(x.combo)) : '—'}</td>${pileCells(x.pile)}<td>${okTxt(x.uc)}</td></tr>`).join('')}
    </table></div>`;

    html += `<div class="overflow-x"><table class="calc-table">
      <caption>Compression per load combination — DCR<sub>c</sub> = F<sub>max</sub> / P<sub>all,g</sub>, P<sub>all,g</sub> = E<sub>g</sub>·P<sub>all</sub> = ${fmt(g.QcG, 1)} kN${compGov ? ` — governing ${escapeHtml(comboLabel(compGov.combo))}` : ''}</caption>
      <tr><th>No.</th><th>L. Comb</th><th>P (kN)</th><th>F<sub>max</sub> (kN)</th><th>Pile</th><th>(x, y) m</th><th>DCR<sub>c</sub></th><th>Check</th></tr>
      ${results.map(r => {
        if (!r.valid) return invalidRow(r, 6);
        return `<tr class="${r === compGov ? 'governing' : ''}"><td>${escapeHtml(r.combo.lc || '')}</td><td>${escapeHtml(r.combo.name)}</td><td class="num">${fmt(r.load.P, 1)}</td><td class="num">${fmt(compDemand(r), 1)}</td>${pileCells(compDemand(r) > 0 ? r.FmaxPile : null)}<td class="num">${fmt(r.checks[0].uc, 3)}</td><td>${okTxt(r.checks[0].uc)}</td></tr>`;
      }).join('')}
    </table></div>`;

    html += `<div class="overflow-x"><table class="calc-table">
      <caption>Tension (uplift) per load combination — DCR<sub>t</sub> = |F<sub>min</sub>| / T<sub>all,g</sub>, T<sub>all,g</sub> = E<sub>g</sub>·T<sub>all</sub> = ${fmt(g.QtG, 1)} kN${tensGov && tensDemand(tensGov) > 0 ? ` — governing ${escapeHtml(comboLabel(tensGov.combo))}` : ' — no pile in tension in any combination'}</caption>
      <tr><th>No.</th><th>L. Comb</th><th>P (kN)</th><th>T<sub>max</sub> (kN)</th><th>Pile</th><th>(x, y) m</th><th>DCR<sub>t</sub></th><th>Check</th></tr>
      ${results.map(r => {
        if (!r.valid) return invalidRow(r, 6);
        return `<tr class="${r === tensGov && tensDemand(r) > 0 ? 'governing' : ''}"><td>${escapeHtml(r.combo.lc || '')}</td><td>${escapeHtml(r.combo.name)}</td><td class="num">${fmt(r.load.P, 1)}</td><td class="num">${fmt(tensDemand(r), 1)}</td>${pileCells(tensDemand(r) > 0 ? r.FminPile : null)}<td class="num">${fmt(r.checks[1].uc, 3)}</td><td>${okTxt(r.checks[1].uc)}</td></tr>`;
      }).join('')}
    </table></div>`;

    html += `<div class="overflow-x"><table class="calc-table">
      <caption>Lateral per load combination — DCR<sub>l</sub> = √[(V<sub>x</sub>/(P<sub>m,x</sub>·H<sub>all</sub>))² + (V<sub>z</sub>/(P<sub>m,z</sub>·H<sub>all</sub>))²] on the most loaded pile (direct H/n plus torsion), H<sub>all</sub> = ${fmt(Ql, 1)} kN${latGov ? ` — governing ${escapeHtml(comboLabel(latGov.combo))}` : ''}</caption>
      <tr><th>No.</th><th>L. Comb</th><th>P (kN)</th><th>V<sub>max</sub> (kN)</th><th>Pile</th><th>(x, y) m</th><th>DCR<sub>l</sub></th><th>Check</th></tr>
      ${results.map(r => {
        if (!r.valid) return invalidRow(r, 6);
        return `<tr class="${r === latGov ? 'governing' : ''}"><td>${escapeHtml(r.combo.lc || '')}</td><td>${escapeHtml(r.combo.name)}</td><td class="num">${fmt(r.load.P, 1)}</td><td class="num">${fmt(r.Vmax, 1)}</td>${pileCells(r.Vmax > 0 ? r.VmaxPile : null)}<td class="num">${fmt(r.checks[2].uc, 3)}</td><td>${okTxt(r.checks[2].uc)}</td></tr>`;
      }).join('')}
    </table></div>`;

    // 6) Formulas with substitution — each from the governing combination of its OWN check
    html += section('Calculation Formulas', 'Formulas with the numbers substituted for the governing pile of each check.');
    const axialFormula = (r, pileRef, title, ucText) => {
      const p = r.pileForces[pileRef.i - 1], dx = p.x - r.xbar, dy = p.y - r.ybar;
      const tz = r.Sxx > 1e-9 ? r.Mzc * dx / r.Sxx : 0, tx = r.Syy > 1e-9 ? r.Mxc * dy / r.Syy : 0;
      return `<div class="lc-formula">
        <div class="lc-formula-title">${title} — pile ${p.i}, governing combination ${escapeHtml(comboLabel(r.combo))}</div>
        F<sub>i</sub> = P/n + M<sub>z,c</sub>·(x<sub>i</sub> − x̅)/Σ(x − x̅)² − M<sub>x,c</sub>·(y<sub>i</sub> − ȳ)/Σ(y − ȳ)²<br>
        F<sub>${p.i}</sub> = ${fmt(r.load.P, 1)}/${r.n} + ${paren(r.Mzc, 1)}·${paren(dx, 3)}/${fmt(r.Sxx, 3)} − ${paren(r.Mxc, 1)}·${paren(dy, 3)}/${fmt(r.Syy, 3)}
        = ${fmt(r.load.P / r.n, 1)} + ${paren(tz, 1)} − ${paren(tx, 1)} = <strong>${fmt(p.F, 1)} kN</strong><br>
        ${ucText}
      </div>`;
    };
    if (compGov && compDemand(compGov) > 0) {
      html += axialFormula(compGov, compGov.FmaxPile, 'Compression',
        `DCR<sub>c</sub> = F<sub>max</sub>/(E<sub>g</sub>·P<sub>all</sub>) = ${fmt(compDemand(compGov), 1)}/(${fmt(g.Eg, 4)}·${fmt(Qc, 1)}) = <strong>${fmt(compGov.checks[0].uc, 3)}</strong>
        <div class="lc-formula-where">Moment sign: M<sub>z</sub> &gt; 0 compresses the +x side, M<sub>x</sub> &gt; 0 compresses the −y side (same as the load vectors of Tab 03). Compression positive.</div>`);
    }
    if (tensGov && tensDemand(tensGov) > 0) {
      html += axialFormula(tensGov, tensGov.FminPile, 'Tension (uplift)',
        `DCR<sub>t</sub> = |F<sub>min</sub>|/(E<sub>g</sub>·T<sub>all</sub>) = ${fmt(tensDemand(tensGov), 1)}/(${fmt(g.Eg, 4)}·${fmt(Qt, 1)}) = <strong>${fmt(tensGov.checks[1].uc, 3)}</strong>`);
    }
    if (latGov) {
      const lr = latGov, lp = lr.latPiles[lr.VmaxPile.i - 1];
      const lax = lr.at.x - lr.xbar, lay = lr.at.y - lr.ybar, ldx = lp.x - lr.xbar, ldy = lp.y - lr.ybar;
      html += `<div class="lc-formula">
        <div class="lc-formula-title">Lateral — pile ${lp.i}, governing combination ${escapeHtml(comboLabel(lr.combo))} — direct shear plus torsion from the load-point eccentricity</div>
        T = a<sub>y</sub>·H<sub>x</sub> − a<sub>x</sub>·H<sub>z</sub> = ${paren(lay, 3)}·${paren(lr.load.Hx, 1)} − ${paren(lax, 3)}·${paren(lr.load.Hz, 1)} = ${fmt(lr.T, 1)} kN·m,  J = ${fmt(lr.J, 3)} m²<br>
        V<sub>x</sub> = H<sub>x</sub>/n + T·(y − ȳ)/J = ${fmt(lr.load.Hx / lr.n, 1)} + ${paren(lr.T, 1)}·${paren(ldy, 3)}/${fmt(lr.J, 3)} = ${fmt(lp.Vx, 1)} kN<br>
        V<sub>z</sub> = H<sub>z</sub>/n − T·(x − x̅)/J = ${fmt(lr.load.Hz / lr.n, 1)} − ${paren(lr.T, 1)}·${paren(ldx, 3)}/${fmt(lr.J, 3)} = ${fmt(lp.Vz, 1)} kN<br>
        DCR<sub>l</sub> = √[(V<sub>x</sub>/(P<sub>m,x</sub>·H<sub>all</sub>))² + (V<sub>z</sub>/(P<sub>m,z</sub>·H<sub>all</sub>))²] = √[(${fmt(Math.abs(lp.Vx), 1)}/(${fmt(lr.PmX, 3)}·${fmt(Ql, 1)}))² + (${fmt(Math.abs(lp.Vz), 1)}/(${fmt(lr.PmZ, 3)}·${fmt(Ql, 1)}))²] = <strong>${fmt(lp.uc, 3)}</strong>
        <div class="lc-formula-where">Equal lateral stiffness for every pile, so the centre of rigidity is the pile-group centroid. T = 0 when the load point coincides with the centroid; then V<sub>i</sub> = H/n for all piles.</div>
      </div>`;
    }
  }

  html += `<div class="limits-box">
    <strong>Limitation:</strong> Rigid pile cap with equal pile stiffness (centre of rigidity = pile-group centroid); axial forces by linear distribution, lateral force = H/n plus torsion from the eccentricity between the load point (pedestal centre, Tab 02) and the centroid — no p-y stiffness analysis, no pile-head deflection check, no batter piles, and pile installation tolerance is not included. Group efficiency (Converse–Labarre, regular m × n grids only) applies to P<sub>all</sub> and T<sub>all</sub>; p-multipliers (AASHTO LRFD Table 10.7.2.4-1 unless edited) apply to H<sub>all</sub> — both are valid only if P<sub>all</sub>, T<sub>all</sub> and H<sub>all</sub> are <em>single-pile</em> allowable values, not values that already include group effects. Capacities are ASD allowables checked against ASD load combinations; no allowable increase is applied for wind or seismic combinations (ASCE 7 ASD load combinations already carry the 0.6W / 0.7E factors). Spacing and edge limits are project-specific inputs. P/H/M include the top→bottom transfer (ΔW, Δh) set in "03 — LOADING DATA". Verify against the geotechnical report and pile load test data.
  </div>`;
  // Number the table captions "Table 4.<sub-section>.<n>." in the order they appear (the sub-sections present depend on
  // the inputs, so the numbers are assigned here, after the whole preview has been built).
  let curSec = 0, tn = 0;
  html = html.replace(/(<div class="section-label"[^>]*>4\.(\d+) )|<caption>/g, (m, lbl, secNo) => {
    if (lbl) { curSec = +secNo; tn = 0; return m; }
    tn += 1;
    return `<caption>Table 4.${curSec}.${tn}. `;
  });
  out.innerHTML = html;
}
