// 09 — Anchor bolt design.
// Moved from app.js — function/const declarations only; event wiring stays in app.js.
import { computeAnchorCapacity, computeGoverningCa1, evaluateAnchorCombo, stdComboVector } from '../../lib/foundation/index.js?v=20261014m';
import { getRadioVal, num } from '../core/dom.js?v=20261014m';
import { fmt } from '../core/format.js?v=20261014m';
import { boltList, comboState, lastResults } from '../core/state.js?v=20261014m';
import { chapterHeader, comboLabel, numberTables, sectionHeader } from '../core/worksheet.js?v=20261014m';
import { anchorDiagramSVG } from '../diagrams/anchorDiagram.js?v=20261014m';
import { buildStdComboBase } from '../tabs/combos.js?v=20261014m';
import { SCOPE_NA_LABEL, inScope } from '../workflow/scope.js?v=20261014m';

export function renderBoltTable() {
  document.getElementById('ab-bolt-body').innerHTML = boltList.map((b, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><input type="number" step="10" class="bolt-input" data-i="${i}" data-f="x" value="${b.x}"></td>
      <td><input type="number" step="10" class="bolt-input" data-i="${i}" data-f="y" value="${b.y}"></td>
      <td><button type="button" class="combo-remove" data-i="${i}" title="Remove bolt">•</button></td>
    </tr>`).join('');
}
// computeGoverningCa1(), computeAnchorCapacity() and evaluateAnchorCombo() live in lib/foundation/shared/pedestalCheck.js.
const AB_HEAD = () => chapterHeader('09. Anchor Bolt Design', 'This chapter checks the anchor bolts at the base plate for tension, shear and their interaction under the factored LRFD combinations (LC201+) of Section 03, at the top of the pedestal — ACI 318M-19 Ch.17 (single-anchor simplification). The status of the check is shown in the Design Status panel.');
export function calcAnchor() {
  // Out of scope (Section 00 → Scope of Work): anchor bolts are designed and supplied by the mechanical vendor — no check here,
  // and nothing from this tab counts toward the governing UC.
  if (!inScope('anchor')) {
    lastResults.anchor = { label: 'Anchor Bolt Design', status: 'NA', metric: SCOPE_NA_LABEL.anchor, detail: 'By mechanical vendor — not checked in this calculation.', notices: [] };
    document.getElementById('calc-anchor').innerHTML = chapterHeader('09. Anchor Bolt Design', 'Anchor bolts are outside the scope of this calculation (Section 00 → Scope of Work).') +
      `<div class="verdict na"><div class="stamp">BY MECHANICAL VENDOR</div><div class="uc"><div class="lbl">Not checked in this calculation</div></div></div>
      <div class="note">Anchor bolt design (tension, shear and their interaction, ACI 318M-19 Ch.17) is by the mechanical vendor. The anchor bolt loads at the top of the pedestal are the factored combinations of Section 03.</div>`;
    return;
  }
  lastResults.anchor = { label: 'Anchor Bolt Design', status: 'ERROR', metric: '—', detail: 'Not yet computed.' };
  if (boltList.length === 0) {
    document.getElementById('calc-anchor').innerHTML = AB_HEAD() + `<div class="warn-box"><strong>⚠  No bolts defined:</strong> add at least one bolt.</div>`;
    lastResults.anchor.detail = 'No bolts defined.';
    return;
  }
  if (comboState.lrfd.length === 0) {
    document.getElementById('calc-anchor').innerHTML = AB_HEAD() + `<div class="warn-box"><strong>⚠  No LRFD load combinations:</strong> load the standard set with "Edit Load Combinations (LRFD)" in "03 — LOADING DATA".</div>`;
    lastResults.anchor.detail = 'No load combinations defined.';
    return;
  }
  const Bp = num('ab-Bp'), Lp = num('ab-Lp');
  const ca1 = computeGoverningCa1(boltList, Bp);
  if (!isFinite(ca1) || ca1 <= 0) {
    document.getElementById('calc-anchor').innerHTML = AB_HEAD() + `<div class="warn-box"><strong>⚠  Invalid layout:</strong> one or more bolts fall outside the pedestal width B<sub>p</sub> (computed edge distance c<sub>a1</sub> ≤ 0). Increase B<sub>p</sub> or move the bolts inward.</div>`;
    lastResults.anchor.detail = 'Invalid layout (bolt outside pedestal width).';
    return;
  }
  const cap = computeAnchorCapacity({
    ca1,
    da: num('ab-da'), Ase: num('ab-Ase'), futa: num('ab-futa'), hef: num('ab-hef'), Abrg: num('ab-Abrg'),
    fc: num('gen-fc'), lambda: num('ab-lambda'),
    anchorType: getRadioVal('ab-type'), cracked: getRadioVal('ab-crack') === 'cracked',
    phiNsa: num('ab-phi-Nsa'), phiNcb: num('ab-phi-Ncb'), phiNpn: num('ab-phi-Npn'),
    phiVsa: num('ab-phi-Vsa'), phiVcb: num('ab-phi-Vcb'), phiVcp: num('ab-phi-Vcp')
  });
  // Anchor design loads: the factored LRFD combinations (LC201+, comboState.lrfd) at the TOP of the pedestal (base plate) —
  // ACI 318M-19 Ch.17 compares φN_n / φV_n with factored actions. Same biaxial vectors as Section 03 table 3.3.3, without any
  // top -> bottom transfer; the bolt group is checked about one axis with the resultants H = √(Fx² + Fz²), M = √(Mx² + Mz²).
  const base = buildStdComboBase();
  // Bolt coordinates are entered in mm, but evaluateAnchorCombo() distributes M (kN·m) with the coordinates in m
  // (F = P/n + M·dx/Σdx²). Passing mm made the moment term 1000× too small — convert here, and convert the returned
  // bolt positions back to mm for the table and the drawing.
  const boltsM = boltList.map(b => ({ x: b.x / 1000, y: b.y / 1000 }));
  const results = comboState.lrfd.map(combo => {
    const v = stdComboVector(combo.f, base);
    const Ptop = v.P, Htop = Math.hypot(v.Fx, v.Fz), Mtop = Math.hypot(v.Mx, v.Mz);
    const r = evaluateAnchorCombo(boltsM, Ptop, Htop, Mtop, cap);
    if (r.boltForces) r.boltForces = r.boltForces.map(bf => ({ ...bf, x: bf.x * 1000, y: bf.y * 1000 }));
    return { combo, P: Ptop, H: Htop, M: Mtop, ...r };
  });
  const governing = results.reduce((a, b) => b.governingUC > a.governingUC ? b : a);
  lastResults.anchor = {
    label: 'Anchor Bolt Design',
    status: !governing.valid ? 'ERROR' : (governing.overallPass ? 'PASS' : 'FAIL'),
    metric: governing.valid ? `UC = ${fmt(governing.governingUC,3)}` : '—',
    detail: governing.valid ? `Governing: ${comboLabel(governing.combo)} — ${governing.governingCheck.name}, n=${boltList.length} bolts` : `${governing.note}`
  };
  lastResults.anchor.notices = [];
  let html = AB_HEAD();
  if (!governing.valid) {
    html += `<div class="warn-box"><strong>⚠  Invalid:</strong> ${governing.note}</div>`;
  }
  if (governing.valid) {
    html += sectionHeader('9.1', 'Bolt Layout', `Bolt group on the pedestal (${fmt(Bp,0)} × ${fmt(Lp,0)} mm) with the bolt tensions of the governing combination (${comboLabel(governing.combo)}).`, true);
    html += anchorDiagramSVG(boltList, governing.boltForces, Bp, Lp);
    html += sectionHeader('9.2', 'Anchor Capacity', 'Design strength of a single anchor in tension and shear for each failure mode; the smallest governs.');
    html += `<div class="overflow-x"><table class="calc-table">
      <caption>Per-anchor capacity (single anchor, ACI 318M-19 Ch.17)</caption>
      <tr><th>Mode</th><th>Nominal</th><th>φ</th><th>φ·Nominal</th></tr>
      <tr><td>Governing edge distance, c<sub>a1</sub> (computed)</td><td class="clause">B<sub>p</sub>/2 - |x - x̅|, min over bolts</td><td class="num" colspan="2">${fmt(ca1,1)} mm</td></tr>
      ${cap.modesN.map(m => `<tr class="${m.name === cap.govNMode ? 'governing' : ''}"><td>${m.name}</td><td class="num">${fmt(m.val/1000,2)} kN</td><td class="num">${fmt(m.phi,2)}</td><td class="num">${fmt(m.phi*m.val/1000,2)} kN</td></tr>`).join('')}
      ${cap.modesV.map(m => `<tr class="${m.name === cap.govVMode ? 'governing' : ''}"><td>${m.name}</td><td class="num">${fmt(m.val/1000,2)} kN</td><td class="num">${fmt(m.phi,2)}</td><td class="num">${fmt(m.phi*m.val/1000,2)} kN</td></tr>`).join('')}
    </table></div>`;
    html += sectionHeader('9.3', 'Bolt Forces and Checks', 'Bolt tension from P and M (linear distribution over the bolt group), shear H/n per bolt, and the tension-shear interaction for every LRFD combination.');
    html += `<div class="overflow-x"><table class="calc-table">
      <caption>Governing combination: ${comboLabel(governing.combo)} — per-bolt tension</caption>
      <tr><th>Bolt</th><th>x (mm)</th><th>z (mm)</th><th>Tension (kN)</th></tr>
      ${governing.boltForces.map(bf => `<tr class="${bf.tension === governing.Tmax && bf.tension > 0 ? 'governing' : ''}"><td>${bf.i}</td><td class="num">${fmt(bf.x,0)}</td><td class="num">${fmt(bf.y,0)}</td><td class="num">${fmt(bf.tension,2)}</td></tr>`).join('')}
    </table></div>`;
    html += `<div class="overflow-x"><table class="calc-table">
      <caption>Anchor checks — governing combination ${comboLabel(governing.combo)}</caption>
      <tr><th>Check</th><th>Demand</th><th>Capacity</th><th>UC</th><th>Status</th></tr>
      <tr class="${governing.governingCheck.name === 'Bolt tension' ? 'governing' : ''}"><td>Max bolt tension</td><td class="num">${fmt(governing.Tmax,2)} kN</td><td class="num">${fmt(cap.phiNn/1000,2)} kN</td><td class="num">${fmt(governing.checks[0].uc,3)}</td><td>${governing.checks[0].uc<=1.0?'OK':'EXCEEDS'}</td></tr>
      <tr class="${governing.governingCheck.name === 'Bolt shear' ? 'governing' : ''}"><td>Bolt shear (H/n)</td><td class="num">${fmt(governing.Hi,2)} kN</td><td class="num">${fmt(cap.phiVn/1000,2)} kN</td><td class="num">${fmt(governing.checks[1].uc,3)}</td><td>${governing.checks[1].uc<=1.0?'OK':'EXCEEDS'}</td></tr>
      <tr class="${governing.governingCheck.name === 'Tension-shear interaction' ? 'governing' : ''}"><td>Combined interaction</td><td class="clause">§17.8</td><td class="clause">linear ≤ 1.2</td><td class="num">${fmt(governing.checks[2].uc,3)}</td><td>${governing.checks[2].uc<=1.0?'OK':'EXCEEDS'}</td></tr>
    </table></div>`;
  }
  html += `<div class="overflow-x"><table class="calc-table">
    <caption>Load combination summary — factored LRFD loads (LC201+) at top of pedestal, H = √(F<sub>x</sub>² + F<sub>z</sub>²), M = √(M<sub>x</sub>² + M<sub>z</sub>²) (see 03, Table 3.3.3) — governing row highlighted</caption>
    <tr><th>Combination</th><th>P (kN)</th><th>H (kN)</th><th>M (kN·m)</th><th>Governing UC</th><th>Status</th></tr>
    ${results.map(r => `<tr class="${r === governing ? 'governing' : ''}"><td>${comboLabel(r.combo)}</td><td class="num">${fmt(r.P,1)}</td><td class="num">${fmt(r.H,1)}</td><td class="num">${fmt(r.M,1)}</td><td class="num">${r.valid ? fmt(r.governingUC,3) : '—'}</td><td>${r.valid ? (r.overallPass ? 'OK' : 'EXCEEDS') : (r.note || 'INVALID')}</td></tr>`).join('')}
  </table></div>`;
  html += `<div class="limits-box">
    <strong>Limitation:</strong> Single-anchor simplification per ACI 318-19 Chapter 17 — no anchor-group projected-area effects (A<sub>nc</sub>/A<sub>nco</sub>, A<sub>vc</sub>/A<sub>vco</sub>), no side-face blowout check, and headed cast-in pullout formula only (not hooked bolts or post-installed adhesive bond strength). Edge distance c<sub>a1</sub> is computed only toward the pedestal edge in the shear/moment direction (x, using B<sub>p</sub>) — the perpendicular edge (L<sub>p</sub>) and corner/two-edge interaction effects are not checked; verify the governing bolt's edge condition against the actual pedestal drawing. Base plate bearing/grout capacity on the compression side is not checked. This chapter is complex and error-prone by hand — verify independently against the full ACI 318-19 Chapter 17 or dedicated anchor design software before final design.
  </div>`;
  document.getElementById('calc-anchor').innerHTML = numberTables(html, '9');
}
