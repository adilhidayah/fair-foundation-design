// 09 — Anchor bolt design.
// Moved from app.js — function/const declarations only; event wiring stays in app.js.
import { anchorGroupCheck, computeAnchorCapacity, computeGoverningCa1, evaluateAnchorCombo, normalisePoints, stdComboVector } from '../../lib/foundation/index.js?v=20261028s3';
import { escapeHtml, getRadioVal, num } from '../core/dom.js?v=20261028s3';
import { fmt } from '../core/format.js?v=20261028s3';
import { boltList, comboState, lastResults } from '../core/state.js?v=20261028s3';
import { activeLoadPoints, loadPointsPedestals } from '../tabs/loadPoints.js?v=20261028s3';
import { chapterHeader, comboLabel, numberTables, sectionHeader } from '../core/worksheet.js?v=20261028s3';
import { anchorDiagramSVG } from '../diagrams/anchorDiagram.js?v=20261028s3';
import { buildStdComboBase } from '../tabs/combos.js?v=20261028s3';
import { SCOPE_NA_LABEL, inScope } from '../workflow/scope.js?v=20261028s3';
import { renderAnchorFocus } from './anchorFocus.js?v=20261028s3';

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
const AB_HEAD = () => chapterHeader('09. Anchor Bolt Design', `This chapter checks the anchor bolts at the base plate for tension, shear and their interaction under the factored LRFD combinations (LC201+) of Section 03, at the top of the pedestal — ACI 318M-19 Ch.17 (${getRadioVal('ab-method') === 'group' ? 'group of 4 anchors, projected areas' : 'single-anchor simplification'}). The status of the check is shown in the Design Status panel.`);
export function calcAnchor() {
  calculateAnchor();
  renderAnchorFocus();
}
function calculateAnchor() {
  syncAnchorInputs();
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
  // Pedestals to check: the one pedestal of Tab 02 (size from ab-Bp / ab-Lp), or — pile cap with SEVERAL load points and a pedestal under
  // each — every pedestal (c1 × c2 of its point) with its share of the loads. The same bolt pattern is checked on each; the pedestal with
  // the highest governing UC is shown in detail and all of them are listed.
  const multi = loadPointsPedestals();
  const pts = multi ? normalisePoints(activeLoadPoints()) : null;
  const sites = multi ? pts.map((p, j) => ({ idx: j + 1, Bp: p.c1 * 1000, Lp: p.c2 * 1000, f: p.f, x: p.x, y: p.y }))
    : [{ idx: 1, Bp: num('ab-Bp'), Lp: num('ab-Lp'), f: 1, x: 0, y: 0 }];
  // Anchor design loads: the factored LRFD combinations (LC201+, comboState.lrfd) at the TOP of the pedestal (base plate) —
  // ACI 318M-19 Ch.17 compares φN_n / φV_n with factored actions. Same biaxial vectors as Section 03 table 3.3.3, without any
  // top -> bottom transfer; the bolt group is checked about one axis with the resultants H = √(Fx² + Fz²), M = √(Mx² + Mz²).
  const base = buildStdComboBase();
  if (getRadioVal('ab-method') === 'group') { calcAnchorGroup(sites, multi, base); return; }
  // Bolt coordinates are entered in mm, but evaluateAnchorCombo() distributes M (kN·m) with the coordinates in m
  // (F = P/n + M·dx/Σdx²). Passing mm made the moment term 1000× too small — convert here, and convert the returned
  // bolt positions back to mm for the table and the drawing.
  const boltsM = boltList.map(b => ({ x: b.x / 1000, y: b.y / 1000 }));
  const evalSite = (st) => {
    const ca1 = computeGoverningCa1(boltList, st.Bp);
    if (!isFinite(ca1) || ca1 <= 0) return { ...st, invalidLayout: true, ca1 };
    const cap = computeAnchorCapacity({
      ca1,
      da: num('ab-da'), Ase: num('ab-Ase'), futa: num('ab-futa'), hef: num('ab-hef'), Abrg: num('ab-Abrg'),
      fc: num('gen-fc'), lambda: num('ab-lambda'), groutPad: !!document.getElementById('fs-grout')?.checked,
      anchorType: getRadioVal('ab-type'), cracked: getRadioVal('ab-crack') === 'cracked',
      phiNsa: num('ab-phi-Nsa'), phiNcb: num('ab-phi-Ncb'), phiNpn: num('ab-phi-Npn'),
      phiVsa: num('ab-phi-Vsa'), phiVcb: num('ab-phi-Vcb'), phiVcp: num('ab-phi-Vcp')
    });
    const results = comboState.lrfd.map(combo => {
      const v = stdComboVector(combo.f, base);
      const Ptop = st.f * v.P, Htop = st.f * Math.hypot(v.Fx, v.Fz), Mtop = st.f * Math.hypot(v.Mx, v.Mz);
      const r = evaluateAnchorCombo(boltsM, Ptop, Htop, Mtop, cap);
      if (r.boltForces) r.boltForces = r.boltForces.map(bf => ({ ...bf, x: bf.x * 1000, y: bf.y * 1000 }));
      return { combo, P: Ptop, H: Htop, M: Mtop, ...r };
    });
    const governing = results.reduce((a, b) => b.governingUC > a.governingUC ? b : a);
    return { ...st, ca1, cap, results, governing };
  };
  const siteRes = sites.map(evalSite);
  const badSite = siteRes.find(r => r.invalidLayout);
  if (badSite) {
    document.getElementById('calc-anchor').innerHTML = AB_HEAD() + `<div class="warn-box"><strong>⚠  Invalid layout${multi ? ` (pedestal ${badSite.idx})` : ''}:</strong> one or more bolts fall outside the pedestal width B<sub>p</sub> = ${fmt(badSite.Bp, 0)} mm (computed edge distance c<sub>a1</sub> ≤ 0). Move the bolts inside${multi ? ' every pedestal (c<sub>1</sub> of each load point)' : ' or increase the pedestal width'}.</div>`;
    lastResults.anchor.detail = 'Invalid layout (bolt outside pedestal width).';
    return;
  }
  const worstSite = siteRes.reduce((a, b) => (!b.governing.valid || (a.governing.valid && b.governing.governingUC > a.governing.governingUC) ? b : a));
  const { Bp, Lp, ca1, cap, results, governing } = worstSite;
  lastResults.anchor = {
    label: 'Anchor Bolt Design',
    status: !governing.valid ? 'ERROR' : (governing.overallPass ? 'PASS' : 'FAIL'),
    metric: governing.valid ? `UC = ${fmt(governing.governingUC,3)}` : '—',
    detail: governing.valid ? `${multi ? `Pedestal ${worstSite.idx} of ${sites.length}: ` : ''}Governing: ${comboLabel(governing.combo)} — ${governing.governingCheck.name}, n=${boltList.length} bolts` : `${governing.note}`
  };
  lastResults.anchor.notices = [];
  lastResults.anchor.viz = { method: 'single', site: worstSite, sites: siteRes, bolts: boltList.map(b => ({ ...b })), da: num('ab-da'), hef: num('ab-hef') };
  let html = AB_HEAD();
  if (multi) {
    html += sectionHeader('9.0', 'Pedestals (one per load point)', `The bolt pattern of this tab is checked on each of the ${sites.length} pedestals with its share of the factored loads at the top (P, H, M × share); c<sub>a1</sub> follows each pedestal width c<sub>1</sub>. The governing pedestal (${worstSite.idx}) is detailed below.`, true);
    html += `<div class="overflow-x"><table class="calc-table">
      <caption>Anchor bolts per pedestal</caption>
      <tr><th>Pedestal</th><th>x, z (m)</th><th>c<sub>1</sub> × c<sub>2</sub> (mm)</th><th>Share</th><th>c<sub>a1</sub> (mm)</th><th>Governing combination</th><th>Governing check</th><th>UC</th><th>Status</th></tr>
      ${siteRes.map(r => `<tr class="${r === worstSite ? 'governing' : ''}"><td>${r.idx}</td><td class="num">${fmt(r.x,2)}, ${fmt(r.y,2)}</td><td class="num">${fmt(r.Bp,0)} × ${fmt(r.Lp,0)}</td><td class="num">${fmt(r.f*100,1)}%</td><td class="num">${fmt(r.ca1,1)}</td><td>${comboLabel(r.governing.combo)}</td><td>${r.governing.valid ? r.governing.governingCheck.name : '—'}</td><td class="num">${r.governing.valid ? fmt(r.governing.governingUC,3) : '—'}</td><td>${!r.governing.valid ? 'ERROR' : (r.governing.overallPass ? 'PASS' : 'FAIL')}</td></tr>`).join('')}
    </table></div>`;
  }
  if (!governing.valid) {
    html += `<div class="warn-box"><strong>⚠  Invalid:</strong> ${governing.note}</div>`;
  }
  if (governing.valid) {
    html += sectionHeader('9.1', 'Bolt Layout', `Bolt group on the pedestal (${fmt(Bp,0)} × ${fmt(Lp,0)} mm) with the bolt tensions of the governing combination (${comboLabel(governing.combo)}).`, true);
    html += anchorDiagramSVG(boltList, governing.boltForces, Bp, Lp);
    html += sectionHeader('9.2', 'Anchor Capacity', 'Design strength of a single anchor in tension and shear for each failure mode; the smallest governs.');
    html += `<div class="note">Steel shear: V<sub>sa</sub> = ${fmt(cap.groutFactor, 2)} × 0.6A<sub>se,V</sub>f<sub>uta</sub>. ${cap.groutPad ? 'Grout pad selected in Section 02: factor 0.80 applies (§17.7.1.2.1).' : 'No grout pad selected in Section 02: factor 1.00.'} Other failure modes are not multiplied by this factor.</div>`;
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

// Tab 09 inputs shown per method: the group box for "ACI 17 group", the hairpin fields for hairpin anchor reinforcement.
export function syncAnchorInputs() {
  const groutNote = document.getElementById('ab-grout-note');
  if (groutNote) groutNote.textContent = document.getElementById('fs-grout')?.checked
    ? 'Grout pad: present (Section 02). Steel shear strength factor = 0.80, ACI 318M-19 §17.7.1.2.1.'
    : 'Grout pad: absent (Section 02). Steel shear strength factor = 1.00.';
  const grp = getRadioVal('ab-method') === 'group';
  const show = (id, on) => { const e = document.getElementById(id); if (e) e.style.display = on ? '' : 'none'; };
  show('ab-group-box', grp);
  const sharing=document.getElementById('ab-shear-anchors').value;
  document.getElementById('ab-tie-case').value=sharing==='4'?'1':sharing==='2'?'2':'';
  show('ab-shear-basis-field',grp&&sharing==='4');
  show('ab-hp-box', grp && (document.getElementById('ab-reinf')?.value === 'hairpin' || document.getElementById('ab-vreinf')?.value === 'hairpin'));
  show('ab-tie-box', grp && document.getElementById('ab-vreinf')?.value === 'ties');
}

// Four bolts in a rectangle about their centroid (the pattern anchorGroupCheck assumes): { sx, sz } in mm, or null.
function boltRectangle() {
  if (boltList.length !== 4) return null;
  const cx = boltList.reduce((s, b) => s + b.x, 0) / 4, cz = boltList.reduce((s, b) => s + b.y, 0) / 4;
  const pts = boltList.map(b => [b.x - cx, b.y - cz]);
  const hx = Math.abs(pts[0][0]), hz = Math.abs(pts[0][1]);
  const same = pts.every(([x, z]) => Math.abs(Math.abs(x) - hx) < 0.5 && Math.abs(Math.abs(z) - hz) < 0.5);
  const quads = new Set(pts.map(([x, z]) => `${Math.sign(x)},${Math.sign(z)}`)).size === 4;
  return hx > 0 && hz > 0 && same && quads ? { sx: 2 * hx, sz: 2 * hz, cx, cz } : null;
}

// Anchor reinforcement of the group check (select ab-reinf): the 5A pedestal bars (layout from lastResults.pedestalRebar, the same
// positions as the CLI: n bars on each x face at d′, spread along z) or hairpins (lib anchorGroupCheck reinf.type 'hairpin').
function groupReinf(Bp, Lp) {
  const kind = document.getElementById('ab-reinf')?.value || 'none', vkind = document.getElementById('ab-vreinf')?.value || 'none';
  const fy = num('gen-fy'), topCover = num('ab-topcover') || 50;
  const val = (id) => document.getElementById(id)?.value;
  const n = Math.max(1, Math.round(num('ab-hp-n') || 1)), r = val('ab-hp-r');
  const hp = { db: num('ab-hp-db'), fy, n, legEnd: val('ab-hp-leg') === 'straight' ? 'straight' : 'hook', sideCover: num('ab-hp-cover'), topCover };
  const out = { kind, vkind, reinf: null, shearReinf: { type: 'none' }, text: [] };
  if (kind === 'bars') {
    const L = lastResults.pedestalRebar && lastResults.pedestalRebar.layout;
    if (!L || Math.abs(L.Bp - Bp) > 0.5 || Math.abs(L.Lp - Lp) > 0.5) return { error: 'The pedestal bars of 5A are not available for this pedestal (5A not designed, several pedestals, or a different size) — choose hairpins or no tension anchor reinforcement.' };
    const bars = [];
    for (const xs of [-Bp / 2 + L.dPrime, Bp / 2 - L.dPrime]) for (let i = 0; i < L.n; i++) bars.push([xs, L.n > 1 ? -Lp / 2 + L.dPrime + i * (Lp - 2 * L.dPrime) / (L.n - 1) : 0]);
    out.reinf = { bars, db: L.barDia, fy, topCover };
    out.text.push(`tension: ${L.n * 2} D${fmt(L.barDia, 0)} pedestal bars (5A)`);
  } else if (kind === 'hairpin') {
    out.reinf = { type: 'hairpin', ...hp, ...(r !== '' && r !== undefined ? { r: parseFloat(r) } : {}), tension: true, shear: false };
    out.text.push(`tension: ${n} hairpin${n > 1 ? 's' : ''} D${fmt(hp.db, 0)} per anchor`);
  }
  if (vkind === 'hairpin') {
    out.shearReinf = { type: 'hairpin', db: hp.db, fy, n, legEnd: hp.legEnd, sideCover: hp.sideCover };
    out.text.push(`shear: ${n} hairpin${n > 1 ? 's' : ''} D${fmt(hp.db, 0)} per front anchor`);
  } else if (vkind === 'ties') {
    const tn = Math.max(1, Math.round(num('ab-tie-n') || 2)), tdb = num('ab-tie-db') || 13, diamond = !!document.getElementById('ab-tie-diamond')?.checked;
    out.shearReinf = { type: 'ties', n: tn, db: tdb, fy, case: val('ab-tie-case') === '1' ? 1 : 2, diamond };
    out.text.push(`shear: ${tn} D${fmt(tdb, 0)} ties in the top 125 mm${diamond ? ' + diamond ties' : ''}`);
  }
  out.text = out.text.join('; ');
  return out;
}

// Tab 09 method "ACI 17 group": anchorGroupCheck (lib) per LRFD combination at the top of each pedestal, with P, Mx, Mz, Fx, Fz
// (FAIR signs) — the same check as tools/staad-stability.mjs (pedestal.anchor).
function calcAnchorGroup(sites, multi, base) {
  const el = document.getElementById('calc-anchor');
  const fail = (msg, detail) => { el.innerHTML = AB_HEAD() + `<div class="warn-box"><strong>⚠  ACI 17 group:</strong> ${msg}</div>`; lastResults.anchor.detail = detail; };
  const shearAnchors=Number(document.getElementById('ab-shear-anchors').value), shearBasis=document.getElementById('ab-shear-basis').value.trim();
  if(![2,4].includes(shearAnchors))return fail('choose 2 or 4 shear-resisting anchors for this project; no default is assumed.','Shear-sharing selection not set.');
  if(shearAnchors===4&&!shearBasis)return fail('state the detail / drawing that ensures equal sharing among four anchors.','Four-anchor load-transfer detail not stated.');
  const rect = boltRectangle();
  if (!rect) return fail('the group method needs exactly 4 bolts in a rectangle about their centroid (x = ±s<sub>x</sub>/2, z = ±s<sub>z</sub>/2). Edit the bolt table or use "Single anchor".', 'Group method: 4 bolts in a rectangle needed.');
  if (getRadioVal('ab-type') !== 'cast-in') return fail('the group method covers cast-in headed anchors only — select "Cast-in" or use "Single anchor".', 'Group method: cast-in anchors only.');
  const fc = num('gen-fc'), seismic = !!document.getElementById('ab-seismic')?.checked;
  const prop = { da: num('ab-da'), Ase: num('ab-Ase'), futa: num('ab-futa'), hef: num('ab-hef'), Abrg: num('ab-Abrg'), lambda: num('ab-lambda') || 1, groutPad: !!document.getElementById('fs-grout')?.checked };
  const phi = { sN: num('ab-phi-Nsa'), cN: num('ab-phi-Ncb'), pN: num('ab-phi-Npn'), sV: num('ab-phi-Vsa'), cV: num('ab-phi-Vcb'), ar: 0.75 };
  const siteRes = [];
  for (const st of sites) {
    if (rect.sx >= st.Bp || rect.sz >= st.Lp) return fail(`the bolts (${fmt(rect.sx, 0)} × ${fmt(rect.sz, 0)} mm) do not fit in the pedestal ${fmt(st.Bp, 0)} × ${fmt(st.Lp, 0)} mm${multi ? ` (pedestal ${st.idx})` : ''}.`, 'Invalid layout (bolt outside pedestal).');
    const R = groupReinf(st.Bp, st.Lp);
    if (R.error) return fail(R.error, 'Anchor reinforcement not available.');
    const results = comboState.lrfd.map(combo => {
      const v = stdComboVector(combo.f, base);
      const a = { P: st.f * v.P, Mx: st.f * v.Mx, Mz: st.f * v.Mz, Fx: st.f * v.Fx, Fz: st.f * v.Fz };
      return { combo, ...a, res: anchorGroupCheck({ Bp: st.Bp, Lp: st.Lp, sx: rect.sx, sz: rect.sz, ...prop, fc, seismic, phi, ...a, shearAnchors,shearBasis, reinf: R.reinf, shearReinf: R.shearReinf }) };
    });
    siteRes.push({ ...st, R, results, governing: results.reduce((g, r) => (r.res.uc > g.res.uc ? r : g)) });
  }
  const worst = siteRes.reduce((a, b) => (b.governing.res.uc > a.governing.res.uc ? b : a));
  const g = worst.governing, res = g.res;
  const inter = res.interaction > Math.max(res.govT.uc, res.govV.uc) + 1e-12;
  const govName = inter ? 'Tension-shear interaction (§17.8)' : (res.govT.uc >= res.govV.uc ? res.govT.name : res.govV.name);
  lastResults.anchor = {
    label: 'Anchor Bolt Design', status: res.pass ? 'PASS' : 'FAIL', metric: `UC = ${Number.isFinite(res.uc) ? fmt(res.uc, 3) : '∞'}`,
    detail: `${multi ? `Pedestal ${worst.idx} of ${sites.length}: ` : ''}ACI 17 group, governing: ${comboLabel(g.combo)} — ${govName}${worst.R.text ? `, ${worst.R.text}` : ''}`,
    notices: []
  };
  const kN = (N) => fmt(N / 1000, 2);
  lastResults.anchor.viz = { method: 'group', site: worst, sites: siteRes, rect, bolts: boltList.map(b => ({ ...b })), da: prop.da, hef: prop.hef };
  let html = AB_HEAD();
  html += `<div class="note"><strong>Project shear sharing:</strong> ${shearAnchors} anchors, V/${shearAnchors} = ${fmt(res.Va,2)} kN per anchor. ${shearAnchors===4?escapeHtml(shearBasis):'Front row in the dominant shear direction.'} Steel and ties use the same selection. Pryout uses the projected area of these ${shearAnchors} shear-loaded anchors (§17.7.3.1). Concrete shear breakout is checked conservatively with the full resultant V on the front-row surface.</div>`;
  if (multi) {
    html += sectionHeader('9.0', 'Pedestals (one per load point)', `The 4-bolt pattern is checked on each of the ${sites.length} pedestals with its share of the factored loads at the top. The governing pedestal (${worst.idx}) is detailed below.`, true);
    html += `<div class="overflow-x"><table class="calc-table"><caption>Anchor group per pedestal</caption>
      <tr><th>Pedestal</th><th>c<sub>1</sub> × c<sub>2</sub> (mm)</th><th>Share</th><th>Governing combination</th><th>UC</th><th>Status</th></tr>
      ${siteRes.map(r => `<tr class="${r === worst ? 'governing' : ''}"><td>${r.idx}</td><td class="num">${fmt(r.Bp, 0)} × ${fmt(r.Lp, 0)}</td><td class="num">${fmt(r.f * 100, 1)}%</td><td>${comboLabel(r.governing.combo)}</td><td class="num">${fmt(r.governing.res.uc, 3)}</td><td>${r.governing.res.pass ? 'PASS' : 'FAIL'}</td></tr>`).join('')}
    </table></div>`;
  }
  const forces = boltList.map((b, i) => {
    const a = res.anchors.find(q => Math.sign(q.x) === Math.sign(b.x - rect.cx) && Math.sign(q.z) === Math.sign(b.y - rect.cz));
    return { i: i + 1, x: b.x, y: b.y, tension: a ? a.T : 0 };
  });
  html += sectionHeader('9.1', 'Bolt Layout', `4 anchors at s<sub>x</sub> × s<sub>z</sub> = ${fmt(rect.sx, 0)} × ${fmt(rect.sz, 0)} mm, centred in the pedestal ${fmt(worst.Bp, 0)} × ${fmt(worst.Lp, 0)} mm (edge distances c<sub>x</sub> = ${fmt(res.cx, 1)}, c<sub>z</sub> = ${fmt(res.cz, 1)} mm), with the anchor tensions of ${comboLabel(g.combo)}.`, true);
  html += anchorDiagramSVG(boltList, forces, worst.Bp, worst.Lp);
  html += sectionHeader('9.2', 'Anchor Group Strength — ACI 318M-19 Chapter 17', `Cast-in headed anchors, cracked concrete${seismic ? ', seismic: concrete-governed strengths × 0.75 (§17.10.5.4, §17.10.6.4)' : ''}. h<sub>ef</sub>′ = ${fmt(res.hefE, 1)} mm (§17.6.2.1.2). Governing combination ${comboLabel(g.combo)}: T<sub>u</sub> = ${fmt(res.Tmax, 2)} kN per anchor, ${fmt(res.Tgrp, 2)} kN group, V<sub>u</sub> = ${fmt(res.V, 2)} kN.`);
  html += `<div class="note">Steel shear: V<sub>sa</sub> = ${fmt(res.groutFactor, 2)} × 0.6A<sub>se,V</sub>f<sub>uta</sub> = ${kN(res.Vsa)} kN per anchor. ${res.groutPad ? 'Grout pad selected in Section 02: factor 0.80 applies (§17.7.1.2.1).' : 'No grout pad selected in Section 02: factor 1.00.'} Other failure modes are not multiplied by this factor.</div>`;
  const capN = { 'Steel N_sa': `${kN(res.Nsa)} kN per anchor`, 'Concrete breakout N_cbg': `${kN(res.Ncbg)} kN (group)`, 'Pullout N_pn': `${kN(res.Npn)} kN per anchor`,
    'Side-face blowout N_sbg': Number.isFinite(res.Nsbg) ? `${kN(res.Nsbg)} kN` : 'n/a (h<sub>ef</sub> ≤ 2.5 c<sub>a1</sub>)' };
  const capV = { 'Steel V_sa': `${kN(res.Vsa)} kN per anchor`, 'Concrete breakout V_cbg': `${kN(res.Vcbg)} kN (front row)`, 'Pryout V_cpg': `${kN(res.Vcpg)} kN (group)` };
  if (res.ar) capN[res.tension[1].name] = `φN = ${kN(res.ar.phiNn)} kN (${res.ar.n} legs / bars)`;
  if (res.arV) capV[res.shear[1].name] = res.arV.type === 'ties' ? `φV = ${kN(res.arV.phiVn)} kN (${res.arV.n} ties × V/${res.arV.case === 1 ? 4 : 2})` : `φV = ${kN(res.arV.phiVn)} kN (${res.arV.n} legs)`;
  const row = (kind, m, cap) => res.modeDetails.find(d=>d.name===m.name)?.applicable===false ? `<tr><td>${kind} — ${m.name}</td><td>—</td><td>—</td><td>NOT REQUIRED</td></tr>` : `<tr class="${m === res.govT || m === res.govV ? 'governing' : ''}"><td>${kind} — ${m.name}</td><td class="num">${cap || '—'}</td><td class="num">${Number.isFinite(m.uc) ? fmt(m.uc, 3) : '∞'}</td><td>${m.uc <= 1 ? 'OK' : 'EXCEEDS'}</td></tr>`;
  html += `<div class="overflow-x"><table class="calc-table">
    <caption>Anchor group checks — governing combination ${comboLabel(g.combo)}</caption>
    <tr><th>Mode</th><th>Nominal strength</th><th>UC</th><th>Status</th></tr>
    ${res.tension.map(m => row('Tension', m, capN[m.name])).join('')}
    ${res.shear.map(m => row('Shear', m, capV[m.name])).join('')}
    <tr class="${inter ? 'governing' : ''}"><td>Interaction (§17.8)</td><td class="clause">both &gt; 0.2: (N/φN + V/φV) / 1.2</td><td class="num">${fmt(res.interaction, 3)}</td><td>${res.interaction <= 1 ? 'OK' : 'EXCEEDS'}</td></tr>
  </table></div>`;
  if (res.ar && res.ar.type === 'hairpin') html += `<div class="note"><strong>Hairpins, tension (§17.5.2.1(a)):</strong> ${res.ar.hairpins} vertical hairpins at the anchors in tension (${res.ar.n} legs, A<sub>s</sub> = ${fmt(res.ar.As, 0)} mm²), legs at r = ${fmt(res.ar.r, 0)} mm ${res.ar.within ? '≤' : '>'} 0.5·h<sub>ef</sub>; length above the 35° breakout plane ${fmt(res.ar.avail, 0)} mm ${res.ar.developed ? '≥' : '<'} l<sub>dh</sub> = ${fmt(res.ar.ldh, 0)} mm (hooked at the top). U-bend at the top (the hook), straight legs below the plane ≥ l<sub>d</sub> = ${fmt(res.ar.ldBelow, 0)} mm (detailing, SP-17M Fig. E18.5).</div>`;
  else if (res.ar) html += `<div class="note"><strong>Anchor reinforcement (§17.5.2.1(a)):</strong> ${res.ar.n} pedestal bars within 0.5·h<sub>ef</sub> of the anchors in tension (A<sub>s</sub> = ${fmt(res.ar.As, 0)} mm²), nearest at ${fmt(res.ar.r, 0)} mm; length above the 35° plane ${fmt(res.ar.avail, 0)} mm ${res.ar.developed ? '≥' : '<'} l<sub>dh</sub> = ${fmt(res.ar.ldh, 0)} mm (hooked).</div>`;
  if (res.arV && res.arV.type === 'hairpin') html += `<div class="note"><strong>Hairpins, shear (§17.5.2.1(b), along ${res.arV.axis}):</strong> ${res.arV.hairpins} horizontal hairpins around the ${res.arV.anchors} front anchors (${res.arV.n} legs, A<sub>s</sub> = ${fmt(res.arV.As, 0)} mm²), in contact with the anchors near the top; legs ${fmt(res.arV.legAvail, 0)} mm ${res.arV.developed ? '≥' : '<'} ${res.arV.legEnd === 'straight' ? 'l<sub>d</sub>' : 'l<sub>dh</sub>'} = ${fmt(res.arV.ldReq, 0)} mm. Provide the hairpins at every anchor (the shear direction reverses).</div>`;
  if (res.arV && res.arV.type === 'ties') html += `<div class="note"><strong>Ties in the top 125 mm, shear (SP-17M(14) Anchorage Example 18, Steps 17b / 17c, Case ${res.arV.case}):</strong> V<sub>a</sub> = V/${res.arV.case === 1 ? 4 : 2} = ${fmt(res.arV.Va, 2)} kN per anchor; strut at 45° to the corner bar, tie tension T = V<sub>a</sub> ≤ φ·n·A<sub>b</sub>·f<sub>y</sub> = 0.75 × ${res.arV.n} × ${fmt(res.arV.As / res.arV.n, 0)} mm² × f<sub>y</sub>. ${res.arV.n} × D${fmt(res.arV.db, 0)} ${res.arV.minOk ? '≥' : '<'} minimum ${res.arV.nMin} ties in the top 125 mm (§10.7.6.1.6)${res.arV.minOk ? '' : ' — NOT OK'}.${res.arV.diamond ? ' Diamond ties provided for the alternate strut to the middle bars (Fig. E18.14 / E18.16).' : ''}</div>`;
  if (Number.isFinite(res.Nsbg)) html += `<div class="note"><strong>Side-face blowout (§17.6.4):</strong> h<sub>ef</sub> &gt; 2.5·c<sub>a1</sub>; corner factor (1 + c<sub>a2</sub>/c<sub>a1</sub>)/4 = ${fmt(res.psiCornerSb, 2)} (§17.6.4.1.1), group factor (1 + s/6c<sub>a1</sub>) where s &lt; 6c<sub>a1</sub>.</div>`;
  html += sectionHeader('9.3', 'Combinations', 'Factored LRFD actions at the top of the pedestal (FAIR signs) and the governing UC of each combination.');
  html += `<div class="overflow-x"><table class="calc-table">
    <caption>Anchor group per combination — governing row highlighted</caption>
    <tr><th>Combination</th><th>P (kN)</th><th>M<sub>x</sub> (kN·m)</th><th>M<sub>z</sub> (kN·m)</th><th>F<sub>x</sub> (kN)</th><th>F<sub>z</sub> (kN)</th><th>T<sub>max</sub> (kN)</th><th>V (kN)</th><th>UC</th><th>Status</th></tr>
    ${worst.results.map(r => `<tr class="${r === g ? 'governing' : ''}"><td>${comboLabel(r.combo)}</td><td class="num">${fmt(r.P, 1)}</td><td class="num">${fmt(r.Mx, 2)}</td><td class="num">${fmt(r.Mz, 2)}</td><td class="num">${fmt(r.Fx, 2)}</td><td class="num">${fmt(r.Fz, 2)}</td><td class="num">${fmt(r.res.Tmax, 2)}</td><td class="num">${fmt(r.res.V, 2)}</td><td class="num">${Number.isFinite(r.res.uc) ? fmt(r.res.uc, 3) : '∞'}</td><td>${r.res.pass ? 'OK' : 'EXCEEDS'}</td></tr>`).join('')}
  </table></div>`;
  html += `<div class="limits-box"><strong>Limitation:</strong> 4 cast-in headed anchors in a rectangle centred in the pedestal, rigid base plate (anchor forces F = P/4 + M<sub>z</sub>·x/Σx² − M<sub>x</sub>·z/Σz²), cracked concrete. Shear breakout and the shear hairpins use the front row in the dominant shear direction. Seismic actions are not amplified here (Ω<sub>0</sub>); base plate bearing and grout compressive strength are not checked. Steel shear includes the grout-pad factor 0.80 when Section 02 specifies grout (§17.7.1.2.1). Shear sharing is selected per project; steel and ties use the same count, and pryout uses the selected shear-loaded anchors. Full V is checked on the front-row concrete breakout surface (conservative); ψ<sub>c,V</sub> = 1.2 (tied pedestal) and the l<sub>dh</sub> reduction A<sub>s,req</sub>/A<sub>s,prov</sub> are not used (conservative). Hairpin model: verify the detail (contact with the anchor, position near the top, closed end below the head) against the drawing.</div>`;
  el.innerHTML = numberTables(html, '9');
}
