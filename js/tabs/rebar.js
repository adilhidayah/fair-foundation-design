// 5A pedestal P-M reinforcement + 5B pile cap / shallow footing flexure.
// Moved from app.js — function/const declarations only; event wiring stays in app.js.
import { barLayout, evaluatePileGroupCombo, flexuralDesign, topLayerDesign, footingFlexureAxis, footingFlexurePoints, pedestalBaseActions, pileCapMomentAxis, searchPedestalBars, slabMinSteelRatio, stdComboVector } from '../../lib/foundation/index.js?v=20261028s1';
import { escapeHtml, getRadioVal, num } from '../core/dom.js?v=20261028s1';
import { fmt } from '../core/format.js?v=20261028s1';
import { comboState, lastResults, pileList, state } from '../core/state.js?v=20261028s1';
import { chapterHeader, comboLabel, introPara, numberTables, sectionHeader } from '../core/worksheet.js?v=20261028s1';
import { pmDiagramSVG } from '../diagrams/pmDiagram.js?v=20261028s1';
import { pedestalSectionSVG, pileCapRebarPlanSVG, pileCapRebarSectionSVG } from '../diagrams/rebarDiagram.js?v=20261028s1';
import { buildPedestalComboBase, buildStdComboBase } from '../tabs/combos.js?v=20261028s1';
import { activeLoadPoints, loadPointsPedestals } from '../tabs/loadPoints.js?v=20261028s1';
import { pileComboLoads } from '../tabs/pile.js?v=20261028s1';
import { footingLrfdActions, isShallow, renderCh6Limits, soilPressureHtml } from '../tabs/footingSoil.js?v=20261028s1';

// pmInteractionCurve(), phiMnAtP() and searchPedestalBars() live in lib/foundation/shared/pedestalCheck.js.
// pileCapMomentAxis() and flexuralDesign() live in lib/foundation/shared/footingCheck.js.
// Minimum reinforcement rule of the pile cap / footing (select rb-asmin): 'slab' = ACI Table 8.6.1.1, 'beam' = project criterion.
const asMinRule = () => (document.getElementById('rb-asmin')?.value === 'beam' ? 'beam' : 'slab');
// Top layer (select rb-toplayer): 'bottom' = a top layer only where a combination gives hogging; 'two' = always a top mat, at least
// rb-rhotop·b·t (topLayerDesign(), lib). Bottom layers are always designed.
const topOpts = () => ({ asMinRule: asMinRule(), mode: document.getElementById('rb-toplayer')?.value === 'two' ? 'two' : 'bottom', rhoTop: parseFloat(document.getElementById('rb-rhotop')?.value) || 0.0009 });
// One section: the bottom layer by flexuralDesign(), the top layer by topLayerDesign().
function designCase(c, t, fc, fy) {
  if (c.face === 'bottom') { c.required = true; c.minOnly = false; c.design = flexuralDesign(c.Mu, c.b, c.dEff, t, fc, fy, asMinRule()); return; }
  const r = topLayerDesign(c.Mu, c.b, c.dEff, t, fc, fy, topOpts());
  c.required = r.required; c.minOnly = r.minOnly; c.design = r.design;
}
const govCell = (c) => (c.minOnly ? `— (minimum top mat, ρ<sub>top</sub> = ${topOpts().rhoTop})` : `${c.gov.name}${c.ptTxt || ''}`);
const asMinText = (fy) => (asMinRule() === 'beam'
  ? 'A<sub>s,min</sub> = max(0.0018·b·t, 1.4·b·d/f<sub>y</sub>) (project criterion; 1.4·b·d/f<sub>y</sub> is the beam minimum of ACI 318M-19 §9.6.1.2)'
  : `A<sub>s,min</sub> = ρ<sub>min</sub>·b·t, ρ<sub>min</sub> = ${fmt(slabMinSteelRatio(fy), 4)} (ACI 318M-19 §13.3 → Table 8.6.1.1: 0.0020 for f<sub>y</sub> &lt; 420 MPa, max(0.0018·420/f<sub>y</sub>, 0.0014) for f<sub>y</sub> ≥ 420 MPa)`);
// Bars for a design: spacing in 25 mm steps, ≤ min(3t, 450) (barLayout(), lib) -> c.n, c.spacing, c.AsProv.
function layBars(c, bar, t) {
  const lay = barLayout(c.design.As, c.b, bar, t);
  if (lay.valid) { c.n = lay.n; c.spacing = lay.s; c.AsProv = lay.AsProv; } else { c.n = 0; c.spacing = 0; c.AsProv = 0; }
}
export function calcRebar() {
  lastResults.pedestalRebar = { label: 'Pedestal Reinforcement', status: 'ERROR', metric: '—', detail: 'Not yet computed.' };
  lastResults.pileCapRebar = { label: 'Pile Cap Reinforcement', status: 'ERROR', metric: '—', detail: 'Not yet computed.' };
  // "Footing Only" (Tab 02, no pedestal): there is no pedestal to design — 5A is not applicable (NA: listed, not counted, tab
  // hidden by syncPedestalTab()). The 5B flexure still runs, through the column / base-plate size of rb-Bp × rb-Lp.
  if (getRadioVal('fs-type') !== 'pedestal') {
    lastResults.pedestalRebar = { label: 'Pedestal Reinforcement', status: 'NA', metric: 'N/A (NO PEDESTAL)', detail: 'Footing only — no pedestal in 02 Foundation Dimension.' };
    document.getElementById('calc-rebar').innerHTML = chapterHeader('05. Pedestal Check') + `<div class="note">Not applicable — "Footing Only" is selected in "02 — FOUNDATION DIMENSION", so there is no pedestal to design.</div>`;
    calcPileCapFlexure({ fc: num('gen-fc'), fy: num('gen-fy'), Bp: num('rb-Bp'), Lp: num('rb-Lp') });
    return;
  }
  if (comboState.lc.length === 0) {
    const noCombo = `<div class="warn-box"><strong>⚠  No load combinations:</strong> add at least one combination in the "03 — LOADING DATA" tab.</div>`;
    document.getElementById('calc-rebar').innerHTML = chapterHeader('05. Pedestal Check') + noCombo;
    document.getElementById('calc-rebarcap').innerHTML = sectionHeader('6.3', 'Flexure', '', true) + noCombo;
    lastResults.pedestalRebar.detail = 'No load combinations defined.';
    lastResults.pileCapRebar.detail = 'No load combinations defined.';
    return;
  }
  // 5A pedestal design loads: factored (LRFD, comboState.lrfd) at the BASE of the pedestal — ACI 318 compares φ·Mn with
  // strength-level actions, and the base is the critical section: M includes H × pedestal height Hp (dMx / dMz of the
  // shared load vectors) and P includes the pedestal self-weight. Mu is the resultant of the two moment components,
  // as in 4A (uniaxial design in the resultant direction). Fields keep the names Ptop / Mtop that searchPedestalBars() reads.
  const pedBase = buildPedestalComboBase();
  let combosTop = comboState.lrfd.map(combo => {
    const v = stdComboVector(combo.f, pedBase);
    const Mx = v.Mx + v.dMx, Mz = v.Mz + v.dMz;
    return { combo, Ptop: v.P + v.dP, Mtop: Math.hypot(Mx, Mz), Mx, Mz };
  });
  let html = chapterHeader('05. Pedestal Check', 'This chapter designs the longitudinal reinforcement of the pedestal for axial load and bending (P-M interaction) under the factored LRFD combinations (LC201+) of Section 03, at the base of the pedestal. The status of the check is shown in the Design Status panel.');
  if (combosTop.length === 0) {
    html += `<div class="warn-box"><strong>⚠  No factored (LRFD) combinations:</strong> load the standard set with "Edit LRFD Combinations" in the 5B input panel — the pedestal is designed for factored loads.</div>`;
  }
  let Bp = num('rb-Bp'), Lp = num('rb-Lp');
  const dPrime = num('rb-cover');
  const fc = num('gen-fc'), fy = num('gen-fy'), barDia = num('rb-bar');
  // Pile cap with SEVERAL load points and a pedestal under each: every pedestal (c1 × c2 of its point) is designed for its own share of the
  // factored loads at its base (pedestalBaseActions, lib); the governing one (a failing one first, else the most bars, then the highest
  // UC) is detailed below, all of them are listed in 5.0. Status = the worst pedestal.
  let multiPeds = null;
  if (loadPointsPedestals() && comboState.lrfd.length) {
    const pts = activeLoadPoints(), base = buildStdComboBase(), dW = num('lc-dW');
    const per = comboState.lrfd.map(combo => {
      const v = stdComboVector(combo.f, base);
      return { combo, acts: pedestalBaseActions(pts, { P: v.P, Fx: v.Fx, Fz: v.Fz, Mx: v.Mx, Mz: v.Mz }, dW > 0 ? v.dP / dW : 0, state.pedHp, state.pedPointW) };
    });
    multiPeds = pts.map((p, j) => {
      const ct = per.map(it => { const a = it.acts[j]; return { combo: it.combo, Ptop: a.P, Mtop: Math.hypot(a.Mx, a.Mz), Mx: a.Mx, Mz: a.Mz }; });
      const B = Math.round(p.c1 * 1000), L = Math.round(p.c2 * 1000);
      return { idx: j + 1, p: { ...p, f: per[0].acts[j].f }, Bp: B, Lp: L, combosTop: ct, search: B > 0 && L > 0 && dPrime * 2 < Math.min(B, L) ? searchPedestalBars(B, L, dPrime, fc, fy, barDia, ct) : { found: false, reason: 'Invalid pedestal section (check c1, c2 and the cover d′).' } };
    });
    const bad = multiPeds.find(m => !m.search.found);
    const gov = bad || multiPeds.reduce((a, b) => (b.search.n > a.search.n || (b.search.n === a.search.n && b.search.maxUC > a.search.maxUC) ? b : a));
    multiPeds.gov = gov;
    Bp = gov.Bp; Lp = gov.Lp; combosTop = gov.combosTop;
    html += sectionHeader('5.0', 'Pedestals (one per load point)', `${multiPeds.length} pedestals, each designed for its share of the factored loads at its base (P = share·P + kD·W<sub>ped</sub>, M = share·(M + H·H<sub>p</sub>)). The governing pedestal (${gov.idx}) is detailed below.`, true);
    html += `<div class="overflow-x"><table class="calc-table">
      <caption>Pedestal design per load point</caption>
      <tr><th>Pedestal</th><th>x, z (m)</th><th>c<sub>1</sub> × c<sub>2</sub> (mm)</th><th>Share</th><th>Reinforcement</th><th>ρ</th><th>Governing UC</th><th>Governing combination</th><th>Status</th></tr>
      ${multiPeds.map(m => m.search.found
        ? `<tr class="${m === gov ? 'governing' : ''}"><td>${m.idx}</td><td class="num">${fmt(m.p.x,2)}, ${fmt(m.p.y,2)}</td><td class="num">${fmt(m.Bp,0)} × ${fmt(m.Lp,0)}</td><td class="num">${fmt(m.p.f*100,1)}%</td><td class="num">${m.search.n*2} — D${fmt(barDia,0)}</td><td class="num">${fmt(m.search.rho*100,2)}%</td><td class="num">${fmt(m.search.maxUC,3)}</td><td>${m.search.worstCombo ? comboLabel(m.search.worstCombo) : '—'}</td><td>${m.search.maxUC <= 1 ? 'PASS' : 'FAIL'}</td></tr>`
        : `<tr class="governing"><td>${m.idx}</td><td class="num">${fmt(m.p.x,2)}, ${fmt(m.p.y,2)}</td><td class="num">${fmt(m.Bp,0)} × ${fmt(m.Lp,0)}</td><td class="num">${fmt(m.p.f*100,1)}%</td><td colspan="5">${escapeHtml(m.search.reason || 'No adequate reinforcement')}</td></tr>`).join('')}
    </table></div>`;
  }
  if (Bp <= 0 || Lp <= 0 || dPrime * 2 >= Bp) {
    html += `<div class="warn-box"><strong>⚠  Invalid pedestal section:</strong> check B<sub>p</sub>, L<sub>p</sub> and cover d′ (2·d′ must be less than B<sub>p</sub>).</div>`;
    lastResults.pedestalRebar.detail = 'Invalid pedestal section.';
  } else {
    const search = searchPedestalBars(Bp, Lp, dPrime, fc, fy, barDia, combosTop);
    if (!search.found) {
      html += `<div class="warn-box"><strong>⚠  No adequate reinforcement found:</strong> ${search.reason}</div>`;
      lastResults.pedestalRebar.detail = search.reason;
    } else {
      // worstCombo stays null when every combination has UC = 0 (all pedestal loads zero) — fall back to the first one
      // instead of throwing, since recalcAll() now runs this on every load change.
      if (!search.worstCombo) search.worstCombo = search.perCombo.length ? search.perCombo[0].combo : { name: '—' };
      lastResults.pedestalRebar = {
        label: 'Pedestal Reinforcement',
        status: 'PASS',
        metric: multiPeds ? multiPeds.map(m => m.search.found ? `P${m.idx} ${m.search.n*2}—D${fmt(barDia,0)}` : `P${m.idx} none`).join(', ') : `${search.n*2} — D${fmt(barDia,0)}`,
        detail: `ρ=${fmt(search.rho*100,2)}%, governing UC=${fmt(search.maxUC,3)} (${comboLabel(search.worstCombo)})`,
        // bar layout for Tab 09 (anchor reinforcement = pedestal bars): n bars on each x face at d′ from the faces, spread along z
        layout: multiPeds ? null : { n: search.n, dPrime, barDia, Bp, Lp }
      };
      // Detailing check on the bars just designed: clear spacing along the face ≥ max(1.5·db, 40 mm) — ACI 318M-19 §25.2.3
      // (columns / pedestals). Reported in the table and the drawing; a failure is raised as a notice in the Design Status panel.
      const pedSpacing = search.n > 1 ? (Lp - 2 * dPrime) / (search.n - 1) : null;
      const pedClear = pedSpacing === null ? null : pedSpacing - barDia;
      const pedMinClear = Math.max(1.5 * barDia, 40);
      const pedClearOk = pedClear === null || pedClear >= pedMinClear - 1e-9;
      lastResults.pedestalRebar.notices = pedClearOk ? [] : [{ title: 'Pedestal bar spacing', text: `Clear spacing ${fmt(pedClear, 0)} mm < ${fmt(pedMinClear, 0)} mm = max(1.5·d_b, 40) (ACI 318M-19 §25.2.3) with ${search.n} × D${fmt(barDia, 0)} per face — increase the pedestal size in Tab 02 or use a smaller bar.` }];
      const reinfTable = `<div class="overflow-x"><table class="calc-table">
        <caption>Recommended pedestal reinforcement</caption>
        <tr><th>Parameter</th><th>Expression</th><th>Value</th></tr>
        <tr class="governing"><td>Bars per face</td><td class="clause">2 faces, symmetric</td><td class="num">${search.n} — D${fmt(barDia,0)}</td></tr>
        <tr><td>Total bars / total A<sub>st</sub></td><td class="clause">2 — n — A<sub>bar</sub></td><td class="num">${search.n*2} bars, ${fmt(search.Ast,0)} mm²</td></tr>
        <tr><td>Reinforcement ratio, ρ</td><td class="clause">A<sub>st</sub> / (B<sub>p</sub>·L<sub>p</sub>)</td><td class="num">${fmt(search.rho*100,2)}% (limits 1.0–8.0%)</td></tr>
        ${pedSpacing === null ? '' : `<tr><td>Bar spacing along the face</td><td class="clause">s = (L<sub>p</sub> − 2d′)/(n − 1); clear = s − d<sub>b</sub> ≥ max(1.5d<sub>b</sub>, 40 mm) — §25.2.3</td><td class="num">s = ${fmt(pedSpacing,0)} mm, clear = ${fmt(pedClear,0)} mm ${pedClearOk ? '(OK)' : '(TOO SMALL)'}</td></tr>`}
        <tr class="governing"><td>Governing combination</td><td class="clause">${comboLabel(search.worstCombo)}</td><td class="num">UC = ${fmt(search.maxUC,3)}</td></tr>
      </table></div>`;
      // 5.1 design loads -> 5.2 P-M interaction -> 5.3 reinforcement (report pattern: formulas in the sentence above each table)
      html += sectionHeader('5.1', 'Design Loads', `Critical section at the base of the pedestal (top of footing): pedestal height H<sub>p</sub> = ${fmt(state.pedHp, 3)} m, self-weight W<sub>ped</sub> = ${fmt(state.pedW, 1)} kN (concrete + grout). For every factored LRFD combination (ASCE 7-22 §2.3, LC201+, factors f, dead-load factor f<sub>D</sub>): P<sub>u</sub> = Σ f·P + f<sub>D</sub>·W<sub>ped</sub>, M<sub>x</sub> = Σ f·M<sub>x</sub> − Σ f·H<sub>z</sub>·H<sub>p</sub>, M<sub>z</sub> = Σ f·M<sub>z</sub> + Σ f·H<sub>x</sub>·H<sub>p</sub>, M<sub>u</sub> = √(M<sub>x</sub>² + M<sub>z</sub>²).`, true);
      html += introPara(`Utilization UC = M<sub>u</sub> / φM<sub>n</sub>, with φM<sub>n</sub> read from the interaction diagram of the selected reinforcement at P<sub>u</sub> (5.2). Governing: ${comboLabel(search.worstCombo)}, UC = ${fmt(search.maxUC, 3)}.`);
      html += `<div class="overflow-x"><table class="calc-table">
        <caption>Pedestal check per load combination</caption>
        <tr><th>Combination</th><th>P<sub>u</sub> (kN)</th><th>M<sub>u</sub> (kN·m)</th><th>φM<sub>n</sub> at P<sub>u</sub> (kN·m)</th><th>UC</th><th>Status</th></tr>
        ${search.perCombo.map(r => `<tr class="${r.combo === search.worstCombo ? 'governing' : ''}"><td>${comboLabel(r.combo)}</td><td class="num">${fmt(r.Pu,1)}</td><td class="num">${fmt(r.Mu,1)}</td><td class="num">${r.outOfRange ? '—' : fmt(r.phiMn,1)}</td><td class="num">${isFinite(r.uc) ? fmt(r.uc,3) : '—'}</td><td>${r.outOfRange ? 'P OUT OF RANGE' : (r.uc<=1.0?'OK':'EXCEEDS')}</td></tr>`).join('')}
      </table></div>`;
      html += sectionHeader('5.2', 'P-M Interaction', 'Design interaction diagram (φP<sub>n</sub>, φM<sub>n</sub>) of the selected reinforcement, with every combination plotted as a point.');
      html += pmDiagramSVG(search.curve, search.perCombo);
      html += sectionHeader('5.3', 'Reinforcement', `Smallest symmetric bar arrangement with UC ≤ 1.0 and 1 % ≤ ρ ≤ 8 %: ${search.n} — D${fmt(barDia, 0)} per face, ρ = ${fmt(search.rho * 100, 2)} %.`);
      html += pedestalSectionSVG({ Bp, Lp, dPrime, barDia, n: search.n, Ast: search.Ast, rho: search.rho });
      html += reinfTable;
    }
  }
  html += `<div class="limits-box">
    <strong>Limitation:</strong> Simplified 2-layer symmetric section (bars lumped at d′ from the two faces perpendicular to bending) rather than a full 4-side bar distribution — reasonably common for preliminary design but verify with a proper section tool for final design. Uniaxial bending only (no biaxial P-M-M check): the design moment is the resultant of M<sub>x</sub> and M<sub>z</sub> at the pedestal base, taken about the B<sub>p</sub> direction. Loads are the factored LRFD combinations at the pedestal base, including H × pedestal height and the pedestal self-weight; shear and ties of the pedestal are not designed here. Slenderness/second-order (P-Δ) effects are not evaluated — check per ACI 318-19 §6.2.5/§6.6.4 if the pedestal is slender.
  </div>`;
  // Pedestal part -> chapter 05 (#calc-rebar, tab 5A); pile cap / footing part -> chapter 06 section 6.3 (#calc-rebarcap, tab 5B).
  document.getElementById('calc-rebar').innerHTML = numberTables(html, '5');
  calcPileCapFlexure({ fc, fy, Bp, Lp });
}

// 5B pile cap flexure — both axes, bottom AND top face, from the pile reactions of the factored (LRFD) combinations.
// Pile forces come from the same biaxial group model as 4B (evaluatePileGroupCombo — includes the moment from the load
// point (pedestal centre) sitting off the pile-group centroid) but for comboState.lrfd: ACI 318M-19 flexure needs
// strength-level actions, not the ASD service set used by 4B. Critical sections are at the pedestal faces, measured from
// the pedestal centre (Off X / Off Z), with the pedestal size and the cap widths taken from Tab 02 (see calcFoundSize()).
// Units: pedestal / cap sizes are in mm (inputs), pile coordinates in m -> half-sizes are converted to m first, and
// pileCapMomentAxis() then returns kN·m directly. Bars: x-direction bars are taken as the outer layer (d), z-direction (internal field y)
// bars as the inner layer (d − d_b), for both faces.
function calcPileCapFlexure({ fc, fy, Bp, Lp }) {
  if (isShallow()) return calcFootingFlexure({ fc, fy });
  let html = sectionHeader('6.3', 'Flexure', 'Bottom and top reinforcement in both directions at the pedestal faces (ACI 318M-19 §13.2.7.1) from the factored pile reactions beyond the faces.', true);
  const Lcap = num('rb-Lcap'), Bcap = num('rb-Bcap'), t = num('rb-t'), cc = num('rb-cc'), capBar = num('rb-capbar');
  const d = t - cc - capBar;
  const fail = (box, detail) => {
    lastResults.pileCapRebar.detail = detail;
    document.getElementById('calc-rebarcap').innerHTML = html + box;
  };
  if (pileList.length === 0) return fail(`<div class="warn-box"><strong>⚠  No piles defined:</strong> add piles in the "4B — PILE FOUNDATION STABILITY" tab first.</div>`, 'No piles defined.');
  if (d - capBar <= 0) return fail(`<div class="warn-box"><strong>⚠  Invalid section:</strong> effective depth d = t - cc - d<sub>b,cap</sub> = ${fmt(d,0)} mm (z-direction inner layer ${fmt(d - capBar,0)} mm) is zero or negative.</div>`, 'Invalid section (d ≤ 0).');
  if (Bp <= 0 || Lp <= 0 || Lcap <= 0 || Bcap <= 0) return fail(`<div class="warn-box"><strong>⚠  Invalid input:</strong> the pedestal size B<sub>p</sub> × L<sub>p</sub> and the cap size B<sub>f</sub> × L<sub>f</sub> (both from "02 — FOUNDATION DIMENSION") must be greater than zero.</div>`, 'Invalid input (pedestal / cap size must be > 0).');

  const halfX = Bp / 2000, halfY = Lp / 2000;
  const { at, items, points } = pileComboLoads('lrfd'); // points = several load points on the cap (Tab 02), null for the single pedestal / plate
  if (items.length === 0) html += `<div class="warn-box"><strong>⚠  No factored (LRFD) combinations:</strong> load the standard set with "Edit LRFD Combinations" in the input panel.</div>`;
  const capResults = items.map(({ combo, load, pointLoads, Pcap }) => {
    const ev = evaluatePileGroupCombo(pileList, load, { Qc: 1e12, Qt: 1e12, Ql: 1e12 }); // capacities irrelevant here, only need pileForces
    if (!ev.valid) return { name: comboLabel(combo), invalid: ev.note, pileForces: null, m: { xb: 0, xt: 0, yb: 0, yt: 0 } };
    if (points) { // several load points: sections at the faces of every point, the other points' loads netted; the worst point governs each case
      const m = { xb: 0, xt: 0, yb: 0, yt: 0 }, ptIdx = { xb: 0, xt: 0, yb: 0, yt: 0 };
      points.forEach((pt, j) => {
        const capW = { P: Pcap, Bx: Bcap / 1000, Ly: Lcap / 1000 }; // cap weight over the cap (rb-Bcap along x, rb-Lcap along z), mm -> m
        const mx = pileCapMomentAxis(ev.pileForces, 'x', pt.x, pt.c1 / 2, pointLoads, capW), my = pileCapMomentAxis(ev.pileForces, 'y', pt.y, pt.c2 / 2, pointLoads, capW);
        [['xb', mx.bottom], ['xt', mx.top], ['yb', my.bottom], ['yt', my.top]].forEach(([k, v]) => { if (ptIdx[k] === 0 || v > m[k]) { m[k] = v; ptIdx[k] = j + 1; } });
      });
      return { name: comboLabel(combo), invalid: null, pileForces: ev.pileForces, m, ptIdx };
    }
    const mx = pileCapMomentAxis(ev.pileForces, 'x', at.x, halfX), my = pileCapMomentAxis(ev.pileForces, 'y', at.y, halfY);
    return { name: comboLabel(combo), invalid: null, pileForces: ev.pileForces, m: { xb: mx.bottom, xt: mx.top, yb: my.bottom, yt: my.top } };
  });
  const invalidCap = capResults.filter(r => r.invalid);
  if (invalidCap.length) {
    html += `<div class="warn-box"><strong>⚠  Pile force distribution invalid:</strong> ${invalidCap.map(r => `${r.name}: ${r.invalid}`).join('; ')} — the moments for these combinations are not included below.</div>`;
  }

  const CASES = [
    { key: 'xb', axis: 'x', lbl: 'x', face: 'bottom', title: 'x-direction — bottom', b: Lcap, dEff: d, half: halfX, ref: at.x, bName: 'L<sub>cap</sub>' },
    { key: 'yb', axis: 'y', lbl: 'z', face: 'bottom', title: 'z-direction — bottom', b: Bcap, dEff: d - capBar, half: halfY, ref: at.y, bName: 'B<sub>cap</sub>' },
    { key: 'xt', axis: 'x', lbl: 'x', face: 'top', title: 'x-direction — top', b: Lcap, dEff: d, half: halfX, ref: at.x, bName: 'L<sub>cap</sub>' },
    { key: 'yt', axis: 'y', lbl: 'z', face: 'top', title: 'z-direction — top', b: Bcap, dEff: d - capBar, half: halfY, ref: at.y, bName: 'B<sub>cap</sub>' }
  ];
  CASES.forEach(c => {
    c.gov = capResults.length ? capResults.reduce((a, b2) => (b2.m[c.key] > a.m[c.key] ? b2 : a)) : { name: '—', m: { [c.key]: 0 }, pileForces: null };
    c.Mu = c.gov.m[c.key];
    c.ptTxt = c.gov.ptIdx && c.gov.ptIdx[c.key] ? ` (point ${c.gov.ptIdx[c.key]})` : '';
    designCase(c, t, fc, fy); // top steel: where the combinations produce hogging, or always (two-layer option)
    if (c.design && c.design.ok) layBars(c, capBar, t);
  });
  const tooSmall = CASES.filter(c => c.design && !c.design.ok);
  tooSmall.forEach(c => {
    html += `<div class="warn-box"><strong>⚠  Section too small (${c.title}):</strong> M<sub>u</sub> = ${fmt(c.Mu,1)} kN·m exceeds what this thickness/width can resist even over-reinforced — increase t or the cap width.</div>`;
  });

  const status = tooSmall.length ? 'FAIL' : (invalidCap.length || items.length === 0 ? 'ERROR' : 'PASS'); // an undistributable combination is never silently dropped
  const barTxt = (c) => (c.design && c.design.ok ? (c.spacing > 0 ? `D${fmt(capBar,0)} @ ${fmt(c.spacing,0)} mm (${c.n} bars)` : `D${fmt(capBar,0)}: spacing < 25 mm`) : '—');
  const topCases = CASES.filter(c => c.face === 'top' && c.required);
  lastResults.pileCapRebar = {
    label: 'Pile Cap Reinforcement',
    status,
    metric: tooSmall.length ? 'SECTION TOO SMALL' : `x ${barTxt(CASES[0])}; z ${barTxt(CASES[1])}${topCases.length ? '; top ' + topCases.map(c => `${c.lbl} ${barTxt(c)}`).join(', ') : ''}`,
    detail: CASES.filter(c => c.design && c.design.ok).map(c => `${c.lbl}-${c.face}: M_u=${fmt(c.Mu,1)}kN·m (${c.gov.name}${c.ptTxt || ''}), A_s=${fmt(c.design.As,0)}mm²`).join(' | ')
      + (invalidCap.length ? ` | ${invalidCap.length} combination(s) invalid` : '') + (tooSmall.length ? ' | section too small: ' + tooSmall.map(c => c.title).join(', ') : '')
  };

  html += introPara(`M<sub>u</sub> = Σ F<sub>i</sub>·(|c<sub>i</sub> − c<sub>p</sub>| − h<sub>p</sub>) over the piles beyond each pedestal face (c = x: h<sub>p</sub> = B<sub>p</sub>/2 = ${fmt(halfX,3)} m, c<sub>p</sub> = ${fmt(at.x,3)} m; c = z: h<sub>p</sub> = L<sub>p</sub>/2 = ${fmt(halfY,3)} m, c<sub>p</sub> = ${fmt(at.y,3)} m); net &gt; 0 = sagging (bottom steel), net &lt; 0 = hogging from uplift piles (top steel). A<sub>s</sub> from R<sub>u</sub> = M<sub>u</sub>/(φ·b·d²), φ = 0.9, with ${asMinText(fy)}; bars at a spacing rounded down to a multiple of 25 mm, s ≤ min(3t, 450 mm) (§7.7.2.3); b = cap width perpendicular to the bending, d = t − cc − d<sub>b</sub> = ${fmt(d,0)} mm (x-direction, outer layer) and ${fmt(d - capBar,0)} mm (z-direction, inner layer).`);
  html += `<div class="overflow-x"><table class="calc-table">
    <caption>Recommended reinforcement</caption>
    <tr><th>Section</th><th>Governing combination</th><th>M<sub>u</sub> (kN·m)</th><th>b (mm)</th><th>d (mm)</th><th>A<sub>s</sub> req. (mm²)</th><th>A<sub>s,min</sub> (mm²)</th><th>A<sub>s</sub> gov. (mm²)</th><th>Bars</th></tr>
    ${CASES.map(c => {
      if (!c.required) return `<tr><td>${c.title}</td><td colspan="8">Not required by the LRFD combinations — no hogging moment (no net uplift beyond the pedestal face). Provide the minimum / detailing top steel per the project.</td></tr>`;
      if (!c.design.ok) return `<tr class="governing"><td>${c.title}</td><td>${c.gov.name}${c.ptTxt || ''}</td><td class="num">${fmt(c.Mu,1)}</td><td class="num">${fmt(c.b,0)}</td><td class="num">${fmt(c.dEff,0)}</td><td colspan="4">SECTION TOO SMALL</td></tr>`;
      return `<tr class="governing"><td>${c.title}</td><td>${govCell(c)}</td><td class="num">${fmt(c.minOnly ? 0 : c.Mu,1)}</td><td class="num">${fmt(c.b,0)}</td><td class="num">${fmt(c.dEff,0)}</td><td class="num">${fmt(c.design.AsCalc,0)}</td><td class="num">${fmt(c.design.AsMin,0)}</td><td class="num">${fmt(c.design.As,0)}</td><td class="num">${barTxt(c)}</td></tr>`;
    }).join('')}
  </table></div>`;
  // Reinforcement drawings of what was designed above (only the layers that have a valid design), and the bar-spacing check:
  // clear spacing between parallel bars ≥ max(25 mm, d_b) — ACI 318M-19 §25.2.1; raised as a notice in the Design Status panel.
  const drawLayers = {};
  CASES.forEach(c => { if (c.required && c.design && c.design.ok) drawLayers[c.key] = { n: c.n, label: barTxt(c) }; });
  if (Object.keys(drawLayers).length && !tooSmall.length) {
    const pedDraw = { x: at.x, y: at.y, Bp, Lp };
    const dPile = num('pf-dia') / 1000;
    html += pileCapRebarPlanSVG({ Bf: num('fs-Bf'), Lf: num('fs-Lf'), cc, db: capBar, piles: pileList, D: dPile, ped: pedDraw, layers: drawLayers });
    html += pileCapRebarSectionSVG({ Bf: num('fs-Bf'), t, cc, db: capBar, piles: pileList, D: dPile, ped: pedDraw, layers: drawLayers });
  }
  const minCapClear = Math.max(25, capBar);
  const tightCap = CASES.filter(c => c.required && c.design && c.design.ok && (c.spacing - capBar) < minCapClear - 1e-9);
  lastResults.pileCapRebar.notices = tightCap.length ? [{ title: 'Pile cap bar spacing',
    text: `Clear spacing < ${fmt(minCapClear, 0)} mm = max(25 mm, d_b) (ACI 318M-19 §25.2.1): ${tightCap.map(c => `${c.title} ${fmt(c.spacing - capBar, 0)} mm (${c.n} × D${fmt(capBar, 0)})`).join('; ')} — use a larger bar or a second layer.` }] : [];

  // Substitution behind each governing M_u: the piles beyond the face on the governing side, with their lever arms.
  CASES.filter(c => c.required && c.Mu > 1e-6 && c.gov.pileForces).forEach(c => {
    const coord = (p) => (c.axis === 'x' ? p.x : p.y) - c.ref;
    const side = (sign) => c.gov.pileForces.filter(p => sign * coord(p) > c.half).map(p => ({ ...p, arm: sign * coord(p) - c.half })).map(p => ({ ...p, M: p.F * p.arm }));
    const sp = side(1), sn = side(-1);
    const sum = (a) => a.reduce((s, p) => s + p.M, 0);
    const gov = c.face === 'bottom' ? (sum(sp) >= sum(sn) ? sp : sn) : (sum(sp) <= sum(sn) ? sp : sn);
    if (!gov.length) return;
    html += introPara(`${c.title}: piles beyond the pedestal face (${c.lbl}<sub>p</sub> = ${fmt(c.ref,3)} m, h<sub>p</sub> = ${fmt(c.half,3)} m) in the governing combination ${c.gov.name}${c.ptTxt || ''}.`);
    html += `<div class="overflow-x"><table class="calc-table">
      <caption>Piles beyond the pedestal face, ${c.title}</caption>
      <tr><th>Pile</th><th>${c.lbl} (m)</th><th>F<sub>i</sub> (kN)</th><th>Arm (m)</th><th>F<sub>i</sub>·arm (kN·m)</th></tr>
      ${gov.map(p => `<tr><td>${p.i}</td><td class="num">${fmt(c.axis === 'x' ? p.x : p.y,2)}</td><td class="num">${fmt(p.F,1)}</td><td class="num">${fmt(p.arm,3)}</td><td class="num">${fmt(p.M,1)}</td></tr>`).join('')}
      <tr class="calc-total"><td colspan="4">net M = Σ F<sub>i</sub>·arm</td><td class="num">${fmt(sum(gov),1)}</td></tr>
    </table></div>`;
  });

  html += introPara('Moments at the pedestal faces for every factored LRFD combination (kN·m); the governing value of each section is in bold.');
  html += `<div class="overflow-x"><table class="calc-table">
    <caption>Factored moment per load combination</caption>
    <tr><th>Combination</th>${CASES.map(c => `<th>${c.title.replace(' — ', '<br>')}</th>`).join('')}</tr>
    ${capResults.map(r => `<tr><td>${r.name}</td>${CASES.map(c => `<td class="num">${r.invalid ? '—' : (r.m[c.key] > 1e-6 || c.face === 'bottom' ? (r === c.gov && c.required ? `<strong>${fmt(r.m[c.key],1)}</strong>` : fmt(r.m[c.key],1)) : '—')}</td>`).join('')}</tr>`).join('')}
  </table></div>`;
  lastResults.pileCapRebar.limit = 'Critical sections at the pedestal faces (simplified — no shift per §13.2.7.2 for non-square pedestals). Pile reactions from the 4B group model (biaxial, incl. the moment of an off-centroid load point) for the factored LRFD combinations (ASCE 7-22 §2.3, LC201+). x-direction bars outer layer, z-direction inner (d − d<sub>b</sub>) — swap in the detailing if the opposite layering is used. Top steel only where uplift piles produce hogging; minimum top steel for crack control is not added. Cap self-weight and soil over the cap are not deducted. One bar layer across the full cap width — check spacing, development length and edge cover in the detailing.';
  html += '<div class="ch6-limits"></div>';
  document.getElementById('calc-rebarcap').innerHTML = numberTables(html, '6');
  renderCh6Limits();
}
// 5B shallow footing flexure — both axes, bottom AND top face, from the net soil pressure of the factored (LRFD) combinations
// (footingLrfdActions(), js/tabs/footingSoil.js): M at each pedestal face = ∫(q − w)·arm dA over the part of the footing beyond
// it, full width (footingFlexureAxis(), lib/foundation/shared/footingDesign.js) — ACI 318M-19 §13.2.7.1 (face of the pedestal).
// Positive = sagging (bottom steel); negative = hogging (top steel), which happens on the uplift side of a partly lifted
// footing where the footing + backfill weight is not carried by soil pressure. Bar layers as for the pile cap.
function calcFootingFlexure({ fc, fy }) {
  let html = sectionHeader('6.3', 'Flexure', 'Bottom and top reinforcement in both directions at the pedestal faces (ACI 318M-19 §13.2.7.1) from the net soil pressure (factored, minus the footing and backfill weight) beyond the faces.', true);
  lastResults.pileCapRebar.label = 'Footing Reinforcement';
  const t = num('rb-t'), cc = num('rb-cc'), bar = num('rb-capbar');
  const d = t - cc - bar;
  const fail = (box, detail) => {
    lastResults.pileCapRebar.detail = detail;
    document.getElementById('calc-rebarcap').innerHTML = html + box;
  };
  if (d - bar <= 0) return fail(`<div class="warn-box"><strong>⚠  Invalid section:</strong> effective depth d = t − cc − d<sub>b</sub> = ${fmt(d,0)} mm (z-direction inner layer ${fmt(d - bar,0)} mm) is zero or negative.</div>`, 'Invalid section (d ≤ 0).');
  const fa = footingLrfdActions();
  if (!fa.valid) return fail(`<div class="warn-box"><strong>⚠  Soil pressure not available:</strong> ${fa.note}</div>`, fa.note);
  const { B, L, ped } = fa;
  const multi = !!fa.points; // several load points (Tab 02): sections at every point face and across the spans, the other points netted
  const where = (at, lbl) => (at ? ` (${at.kind === 'face' ? `face of point ${at.point}` : 'span'}, ${lbl} = ${fmt(at.s, 2)} m)` : '');
  const res = fa.items.map(it => {
    if (it.invalid) return { it, name: comboLabel(it.combo), invalid: it.invalid, m: { xb: 0, xt: 0, yb: 0, yt: 0 } };
    if (multi) {
      const mx = footingFlexurePoints({ pl: it.pl, w: it.w, B, L, axis: 'x', pointLoads: it.pointLoads });
      const mz = footingFlexurePoints({ pl: it.pl, w: it.w, B, L, axis: 'z', pointLoads: it.pointLoads });
      return { it, name: comboLabel(it.combo), invalid: null, mx, mz, m: { xb: mx.bottom, xt: mx.top, yb: mz.bottom, yt: mz.top },
        at: { xb: where(mx.atBottom, 'x'), xt: where(mx.atTop, 'x'), yb: where(mz.atBottom, 'z'), yt: where(mz.atTop, 'z') } };
    }
    const mx = footingFlexureAxis({ pl: it.pl, w: it.w, B, L, axis: 'x', ref: ped.x, half: ped.c1 / 2 });
    const mz = footingFlexureAxis({ pl: it.pl, w: it.w, B, L, axis: 'z', ref: ped.z, half: ped.c2 / 2 });
    return { it, name: comboLabel(it.combo), invalid: null, mx, mz, m: { xb: mx.bottom, xt: mx.top, yb: mz.bottom, yt: mz.top } };
  });
  const invalid = res.filter(r => r.invalid);
  if (invalid.length) html += `<div class="warn-box"><strong>⚠  No soil pressure:</strong> ${invalid.map(r => `${r.name}: ${r.invalid}`).join('; ')} — these combinations are not included below (net uplift / overturning is checked in 4A).</div>`;
  const CASES = [
    { key: 'xb', lbl: 'x', face: 'bottom', title: 'x-direction — bottom', b: L * 1000, dEff: d },
    { key: 'yb', lbl: 'z', face: 'bottom', title: 'z-direction — bottom', b: B * 1000, dEff: d - bar },
    { key: 'xt', lbl: 'x', face: 'top', title: 'x-direction — top', b: L * 1000, dEff: d },
    { key: 'yt', lbl: 'z', face: 'top', title: 'z-direction — top', b: B * 1000, dEff: d - bar }
  ];
  const okRes = res.filter(r => !r.invalid);
  CASES.forEach(c => {
    c.gov = okRes.length ? okRes.reduce((a, b2) => (b2.m[c.key] > a.m[c.key] ? b2 : a)) : { name: '—', m: { [c.key]: 0 } };
    c.Mu = c.gov.m[c.key];
    c.ptTxt = c.gov.at ? c.gov.at[c.key] : '';
    designCase(c, t, fc, fy); // top steel: where a combination produces hogging, or always (two-layer option)
    if (c.design && c.design.ok) layBars(c, bar, t);
  });
  const tooSmall = CASES.filter(c => c.design && !c.design.ok);
  tooSmall.forEach(c => {
    html += `<div class="warn-box"><strong>⚠  Section too small (${c.title}):</strong> M<sub>u</sub> = ${fmt(c.Mu,1)} kN·m exceeds what this thickness/width can resist even over-reinforced — increase H<sub>f</sub> or the footing width.</div>`;
  });
  const status = tooSmall.length ? 'FAIL' : (invalid.length || !okRes.length ? 'ERROR' : 'PASS');
  const barTxt = (c) => (c.design && c.design.ok ? (c.spacing > 0 ? `D${fmt(bar,0)} @ ${fmt(c.spacing,0)} mm (${c.n} bars)` : `D${fmt(bar,0)}: spacing < 25 mm`) : '—');
  const topCases = CASES.filter(c => c.face === 'top' && c.required);
  Object.assign(lastResults.pileCapRebar, {
    status,
    invalidCombos: invalid.length, // combinations that lose contact with the soil entirely: Auto-Size treats them as a stability matter (bigger footing)
    metric: tooSmall.length ? 'SECTION TOO SMALL' : `x ${barTxt(CASES[0])}; z ${barTxt(CASES[1])}${topCases.length ? '; top ' + topCases.map(c => `${c.lbl} ${barTxt(c)}`).join(', ') : ''}`,
    detail: CASES.filter(c => c.design && c.design.ok).map(c => `${c.lbl}-${c.face}: M_u=${fmt(c.Mu,1)}kN·m (${c.gov.name}${c.ptTxt || ''}), A_s=${fmt(c.design.As,0)}mm²`).join(' | ')
      + (invalid.length ? ` | ${invalid.length} combination(s) without soil pressure` : '') + (tooSmall.length ? ' | section too small: ' + tooSmall.map(c => c.title).join(', ') : '')
  });
  html += introPara(`${multi
    ? `${fa.points.length} load points (Tab 02): M<sub>u</sub> at a section s = ∫(q − w)·|c − s| dA over the part of the footing beyond s, full width, minus Σ P<sub>j</sub>·|c<sub>j</sub> − s| (+ the couples) of the point loads beyond s (a point straddling s by the share of its width beyond). Sections at both faces of every point (§13.2.7.1) and at 40 equally spaced sections across the footing outside the point footprints — between two points the largest moment is in the span (combined footing), usually hogging between skid runners / columns`
    : `M<sub>u</sub> = ∫(q − w)·(|c − c<sub>p</sub>| − h<sub>p</sub>) dA over the part of the footing beyond each pedestal face, full width (c = x: h<sub>p</sub> = B<sub>p</sub>/2 = ${fmt(ped.c1 / 2,3)} m, c<sub>p</sub> = ${fmt(ped.x,3)} m; c = z: h<sub>p</sub> = L<sub>p</sub>/2 = ${fmt(ped.c2 / 2,3)} m, c<sub>p</sub> = ${fmt(ped.z,3)} m)`}; net &gt; 0 = sagging (bottom steel), net &lt; 0 = hogging on the uplift side (top steel). A<sub>s</sub> from R<sub>u</sub> = M<sub>u</sub>/(φ·b·d²), φ = 0.9, with ${asMinText(fy)}; bars at a spacing rounded down to a multiple of 25 mm, s ≤ min(3t, 450 mm) (§7.7.2.3); b = footing width perpendicular to the bending, d = t − cc − d<sub>b</sub> = ${fmt(d,0)} mm (x-direction, outer layer) and ${fmt(d - bar,0)} mm (z-direction, inner layer).`);
  html += `<div class="overflow-x"><table class="calc-table">
    <caption>Recommended reinforcement</caption>
    <tr><th>Section</th><th>Governing combination</th><th>M<sub>u</sub> (kN·m)</th><th>b (mm)</th><th>d (mm)</th><th>A<sub>s</sub> req. (mm²)</th><th>A<sub>s,min</sub> (mm²)</th><th>A<sub>s</sub> gov. (mm²)</th><th>Bars</th></tr>
    ${CASES.map(c => {
      if (!c.required) return `<tr><td>${c.title}</td><td colspan="8">Not required by the LRFD combinations — no hogging moment beyond the pedestal faces. Provide the minimum / detailing top steel per the project.</td></tr>`;
      if (!c.design.ok) return `<tr class="governing"><td>${c.title}</td><td>${c.gov.name}${c.ptTxt || ''}</td><td class="num">${fmt(c.Mu,1)}</td><td class="num">${fmt(c.b,0)}</td><td class="num">${fmt(c.dEff,0)}</td><td colspan="4">SECTION TOO SMALL</td></tr>`;
      return `<tr class="governing"><td>${c.title}</td><td>${govCell(c)}</td><td class="num">${fmt(c.minOnly ? 0 : c.Mu,1)}</td><td class="num">${fmt(c.b,0)}</td><td class="num">${fmt(c.dEff,0)}</td><td class="num">${fmt(c.design.AsCalc,0)}</td><td class="num">${fmt(c.design.AsMin,0)}</td><td class="num">${fmt(c.design.As,0)}</td><td class="num">${barTxt(c)}</td></tr>`;
    }).join('')}
  </table></div>`;
  const drawLayers = {};
  CASES.forEach(c => { if (c.required && c.design && c.design.ok) drawLayers[c.key] = { n: c.n, label: barTxt(c) }; });
  if (Object.keys(drawLayers).length && !tooSmall.length) {
    const pedDraw = multi ? fa.points.map(p => ({ x: p.x, y: p.y, Bp: p.c1 * 1000, Lp: p.c2 * 1000 })) : { x: ped.x, y: ped.z, Bp: ped.c1 * 1000, Lp: ped.c2 * 1000 };
    html += pileCapRebarPlanSVG({ Bf: B, Lf: L, cc, db: bar, piles: [], D: 0, ped: pedDraw, layers: drawLayers, name: 'Footing' });
    html += pileCapRebarSectionSVG({ Bf: B, t, cc, db: bar, piles: [], D: 0, ped: pedDraw, layers: drawLayers, name: 'Footing' });
  }
  const minClear = Math.max(25, bar);
  const tight = CASES.filter(c => c.required && c.design && c.design.ok && (c.spacing - bar) < minClear - 1e-9);
  lastResults.pileCapRebar.notices = tight.length ? [{ title: 'Footing bar spacing',
    text: `Clear spacing < ${fmt(minClear, 0)} mm = max(25 mm, d_b) (ACI 318M-19 §25.2.1): ${tight.map(c => `${c.title} ${fmt(c.spacing - bar, 0)} mm (${c.n} × D${fmt(bar, 0)})`).join('; ')} — use a larger bar or a second layer.` }] : [];
  const byIt = new Map(res.map(r => [r.it, r]));
  const strong = (r, c) => (r === c.gov && c.required ? `<strong>${fmt(r.m[c.key],1)}</strong>` : fmt(r.m[c.key],1));
  html += soilPressureHtml(fa, { head: CASES.map(c => `M<sub>u</sub> ${c.title.replace(' — ', ' ')} (kN·m)`), gov: null,
    cells: (it) => { const r = byIt.get(it); return CASES.map(c => `<td class="num">${r.m[c.key] > 1e-6 || c.face === 'bottom' ? strong(r, c) : '—'}</td>`).join(''); } },
    'Soil pressure and factored moment per load combination');
  lastResults.pileCapRebar.limit = (multi ? 'Several load points: each point load (share of the superstructure load) is spread uniformly over its footprint c<sub>1</sub> × c<sub>2</sub>; the footing is rigid (linear pressure) — for a long, flexible footing under skid runners check the slab as a beam / plate on elastic soil if the rigid assumption is doubtful. ' : '') + 'Critical sections at the pedestal faces over the full footing width (§13.2.7.1); the concentration of reinforcement in the central band of a rectangular footing (§13.3.3.3) is not applied — distribute the short-direction bars accordingly in the detailing. Soil pressure: rigid footing, linear, no tension, from the factored LRFD combinations (ASCE 7-22 §2.3, LC201+) — the same model as the 4A bearing check, at strength level; the factored footing and backfill weight is deducted where it sits. x-direction bars outer layer (d), z-direction inner (d − d<sub>b</sub>). Development length, edge spacing and top steel for crack control are left to the detailing.';
  html += '<div class="ch6-limits"></div>';
  document.getElementById('calc-rebarcap').innerHTML = numberTables(html, '6');
  renderCh6Limits();
}
