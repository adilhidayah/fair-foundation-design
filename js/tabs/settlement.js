// 08B — Settlement (soil).
// Moved from app.js — function/const declarations only; event wiring stays in app.js.
import { consolidationSettlement, correctSPT, cuFromSPT, elasticSettlement, esFromSPT, phiFromSPT, pileSettlementVesic, settlementCheck } from '../../lib/foundation/index.js?v=20261015h';
import { getRadioVal, num } from '../core/dom.js?v=20261015h';
import { fmt } from '../core/format.js?v=20261015h';
import { lastResults, pileList } from '../core/state.js?v=20261015h';
import { pileComboLoads } from '../tabs/pile.js?v=20261015h';

// correctSPT/phiFromSPT/cuFromSPT/esFromSPT live in shared/soilProperties.js;
// elasticSettlement/consolidationSettlement/settlementCheck live in shared/settlementCheck.js.
// Pile foundation (Tab 02 support = Pile): the settlement of the pile group by Vesic's method (lib: pileSettlementVesic) replaces the
// shallow-footing elastic / consolidation settlement. Same lastResults.settlement slot, so the Design Status and the Summary read it.
const isPile = () => getRadioVal('fs-support') === 'pile';
function pileWorkingLoad() {
  const { items } = pileComboLoads('lc');
  const n = pileList.length;
  if (!n || !items.length) return null;
  const gravity = items.filter(i => Math.abs(i.load.Hx) < 1e-6 && Math.abs(i.load.Hz) < 1e-6 && Math.abs(i.load.Mx) < 1e-6 && Math.abs(i.load.Mz) < 1e-6);
  const pool = gravity.length ? gravity : items;
  const best = pool.reduce((a, b) => (b.load.P > a.load.P ? b : a));
  return { Qw: best.load.P / n, lc: best.combo.lc, gravityOnly: gravity.length > 0 };
}
function calcPileSettlement() {
  lastResults.settlement = { label: 'Pile Group Settlement', status: 'ERROR', metric: '—', detail: 'Not yet computed.' };
  const out = document.getElementById('calc-settlement');
  const fail = (msg) => { out.innerHTML = `<div class="warn-box"><strong>Invalid input:</strong> ${msg}</div>`; lastResults.settlement.detail = 'Invalid input: ' + msg; };
  const D = num('pf-dia') / 1000;
  if (!pileList.length) return fail('no piles defined in 4B.');
  if (!(D > 0)) return fail('pile width D (4B) must be greater than zero.');
  const xs = pileList.map(p => p.x), ys = pileList.map(p => p.y);
  const Bg = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) + D;
  const override = num('st-pile-Q');
  const auto = pileWorkingLoad();
  const Qw = override > 0 ? override : (auto ? auto.Qw : 0);
  const allow = num('st-allowTotal') || 25;
  const r = pileSettlementVesic({ Qw, shaftFraction: num('st-pile-shaft') / 100, xi: parseFloat(document.getElementById('st-pile-xi').value), L: num('st-pile-L'), D,
    shape: document.getElementById('st-pile-shape').value, Ep_kPa: num('st-pile-Ep') * 1000, Es_kPa: num('st-pile-Es'), mu: num('st-pile-mu'), Iwp: num('st-pile-Iwp'), Bg, allow_mm: allow });
  const note = document.getElementById('st-pile-Q-note');
  if (note) note.textContent = override > 0 ? 'Working load entered by the user.' : (auto ? `Auto: ${fmt(auto.Qw, 2)} kN = P / n of ${auto.gravityOnly ? 'the gravity-only service combination' : 'the service combination'} LC ${auto.lc} (largest).` : 'Auto: no service combinations available.');
  if (!r.valid) return fail(r.note);
  const pass = r.overallPass;
  lastResults.settlement = { label: 'Pile Group Settlement', status: pass ? 'PASS' : 'FAIL', metric: 'T=' + fmt(r.Sg, 2) + 'mm', detail: `S_g=${fmt(r.Sg, 2)}mm (S_e=${fmt(r.Se, 2)}mm x F_g=${fmt(r.Fg, 2)}) vs ${fmt(allow, 0)}mm, Q_w=${fmt(Qw, 1)}kN` };
  let html = '<div class="verdict' + (pass ? '' : ' fail') + '"><div class="stamp">' + (pass ? 'PILE SETTLEMENT PASS' : 'PILE SETTLEMENT FAIL') + '</div><div class="uc"><div class="val">' + fmt(r.Sg, 2) + '</div><div class="lbl">mm group settlement vs allow ' + fmt(allow, 1) + ' mm (UC=' + fmt(r.uc, 3) + ')</div></div></div>';
  const row = (a, e, v, cls = '') => `<tr${cls}><td>${a}</td><td class="clause">${e}</td><td class="num">${v}</td></tr>`;
  html += '<div class="overflow-x"><table class="calc-table"><caption>Single pile — Vesic (1977), Das §11.18</caption><tr><th>Parameter</th><th>Expression</th><th>Value</th></tr>' +
    row('Q<sub>w</sub>, working load', override > 0 ? 'input' : 'auto (P / n)', fmt(Qw, 2) + ' kN') +
    row('Q<sub>ws</sub> / Q<sub>wp</sub>', 'shaft share ' + fmt(num('st-pile-shaft'), 0) + '% / tip', fmt(r.Qws, 2) + ' / ' + fmt(r.Qwp, 2) + ' kN') +
    row('A<sub>p</sub> / p', 'pile section', fmt(r.Ap, 4) + ' m² / ' + fmt(r.p, 3) + ' m') +
    row('S<sub>1</sub>', '(Q<sub>wp</sub> + ξQ<sub>ws</sub>)L / (A<sub>p</sub>E<sub>p</sub>), ξ = ' + document.getElementById('st-pile-xi').value, fmt(r.S1, 3) + ' mm') +
    row('q<sub>wp</sub>', 'Q<sub>wp</sub> / A<sub>p</sub>', fmt(r.qwp, 1) + ' kPa') +
    row('S<sub>2</sub>', 'q<sub>wp</sub>·D(1 − μ<sub>s</sub>²)I<sub>wp</sub> / E<sub>s</sub>', fmt(r.S2, 3) + ' mm') +
    row('I<sub>ws</sub>', '2 + 0.35√(L/D)', fmt(r.Iws, 3)) +
    row('S<sub>3</sub>', '(Q<sub>ws</sub>/(pL))·(D/E<sub>s</sub>)(1 − μ<sub>s</sub>²)I<sub>ws</sub>', fmt(r.S3, 3) + ' mm') +
    row('S<sub>e</sub>', 'S<sub>1</sub> + S<sub>2</sub> + S<sub>3</sub>', fmt(r.Se, 3) + ' mm', ' class="governing"') + '</table></div>';
  html += '<div class="overflow-x"><table class="calc-table"><caption>Pile group</caption><tr><th>Parameter</th><th>Expression</th><th>Value</th></tr>' +
    row('B<sub>g</sub>', 'shorter side of the group + D', fmt(Bg, 3) + ' m') +
    row('F<sub>g</sub>', '√(B<sub>g</sub> / D)', fmt(r.Fg, 3)) +
    row('S<sub>g</sub>', 'F<sub>g</sub>·S<sub>e</sub>', fmt(r.Sg, 2) + ' mm', ' class="governing"') +
    row('UC', 'S<sub>g</sub> / allowable', fmt(r.uc, 3) + ' ' + (pass ? 'PASS' : 'FAIL')) + '</table></div>';
  html += '<div class="limits-box"><strong>Limitation:</strong> Vesic\'s semi-empirical method (elastic settlement under the sustained working load, no consolidation of soft layers below the tip). E<sub>s</sub>, the shaft / tip split and ξ are assumptions to be taken from the geotechnical report; the group factor √(B<sub>g</sub>/D) is a rough rule.</div>';
  out.innerHTML = html;
}
export function calcSettlement() {
  if (isPile()) { calcPileSettlement(); return; }
  lastResults.settlement = { label: 'Settlement (Soil)', status: 'ERROR', metric: '—', detail: 'Not yet computed.' };
  const N = num('st-N'), sigmaV = num('st-sigmaV'), ER = num('st-ER');
  const soilType = document.getElementById('st-soilType').value;
  const k = num('st-k');
  const qNet = num('st-qNet'), B = num('st-B'), L = num('st-L'), Es = num('st-Es'), nu = num('st-nu');
  const rigid = document.getElementById('st-rigid').value === 'rigid';
  const H = num('st-H'), e0 = num('st-e0'), Cc = num('st-Cc'), Cr = num('st-Cr');
  const sv0 = num('st-sv0'), dSigma = num('st-dSigma');
  const pcRaw = document.getElementById('st-pc').value;
  const pc = (pcRaw === '' || pcRaw === null) ? null : parseFloat(pcRaw);
  const allowTotal = num('st-allowTotal') || 25, diff = num('st-diff'), allowDiff = num('st-allowDiff') || 19;
  if (B <= 0 || L <= 0) {
    document.getElementById('calc-settlement').innerHTML = `<div class="warn-box"><strong>Invalid input:</strong> B and L must be greater than zero.</div>`;
    lastResults.settlement.detail = 'Invalid input (B, L must be > 0).';
    return;
  }
  if (Es <= 0) {
    document.getElementById('calc-settlement').innerHTML = `<div class="warn-box"><strong>Invalid input:</strong> Es must be greater than zero.</div>`;
    lastResults.settlement.detail = 'Invalid input (Es must be > 0).';
    return;
  }
  const spt = correctSPT(N, sigmaV, ER);
  const N60 = spt.valid ? spt.N60 : 0;
  const phi = phiFromSPT(N60, soilType);
  const cu = cuFromSPT(N60, k);
  const esCorr = esFromSPT(N60, cu.cu);
  const elas = elasticSettlement({ qNet_kPa: qNet, B, L, Es_kPa: Es, nu, rigid });
  let consol = { valid: true, Sc_mm: 0, skipped: true };
  if (H > 0) {
    const c = consolidationSettlement({ H, e0, Cc, Cr, sigmaV0_kPa: sv0, dSigma_kPa: dSigma, pc_kPa: pc });
    consol = c.valid ? { valid: true, Sc_mm: c.Sc_mm, skipped: false } : { valid: false, Sc_mm: 0, skipped: false };
  }
  const Se = elas.valid ? elas.Se_mm : 0;
  const Sc = consol.valid ? consol.Sc_mm : 0;
  const chk = settlementCheck({ Se_mm: Se, Sc_mm: Sc, allowTotal_mm: allowTotal, allowDiff_mm: allowDiff, diff_mm: diff });
  const pass = chk.overallPass && elas.valid && consol.valid;
  const chkTotal = fmt(chk.total_mm,2);
  lastResults.settlement = { label: 'Settlement (Soil)', status: (pass ? 'PASS' : 'FAIL'), metric: ('T=' + chkTotal + 'mm'), detail: 'Se+Sc vs allow' };
  let html = '<div class="verdict' + (pass ? '' : ' fail') + '"><div class="stamp">' + (pass ? 'SETTLEMENT PASS' : 'SETTLEMENT FAIL') + '</div><div class="uc"><div class="val">' + fmt(chk.total_mm,2) + ' mm</div><div class="lbl">total vs allow ' + fmt(allowTotal,1) + ' mm (UC=' + fmt(chk.governingUC,3) + ')</div></div></div>';
  html += '<div class="overflow-x"><table class="calc-table"><caption>SPT correlation (verify vs geotech report)</caption><tr><th>Parameter</th><th>Expression</th><th>Value</th></tr>';
  html += '<tr><td>Cn</td><td class="clause">sqrt(100/sv)</td><td class="num">' + (spt.valid ? fmt(spt.Cn,3) : '--') + '</td></tr>';
  html += '<tr><td>N60</td><td class="clause">N.(ER/60).Cn</td><td class="num">' + (spt.valid ? fmt(N60,2) : '--') + '</td></tr>';
  html += '<tr><td>phi gran</td><td class="clause">Peck approx</td><td class="num">' + (soilType === 'clay' ? '0.0 UU' : fmt(phi.phiDeg,1)) + '</td></tr>';
  html += '<tr><td>cu</td><td class="clause">k.N60</td><td class="num">' + fmt(cu.cu,1) + ' kPa</td></tr>';
  html += '<tr><td>Es hint</td><td class="clause">500.(N60+15)</td><td class="num">' + fmt(esCorr.EsGranular,0) + ' kPa</td></tr>';
  html += '<tr><td>Es used</td><td class="clause">input</td><td class="num">' + fmt(Es,0) + ' kPa</td></tr></table></div>';
  html += '<div class="overflow-x"><table class="calc-table"><caption>Elastic Se</caption><tr><th>Parameter</th><th>Expression</th><th>Value</th></tr>';
  html += '<tr><td>L/B</td><td class="clause">input</td><td class="num">' + fmt(L / B,3) + '</td></tr>';
  html += '<tr><td>If</td><td class="clause">Steinbrenner fit</td><td class="num">' + (elas.valid ? fmt(elas.If,3) : '--') + '</td></tr>';
  html += '<tr class="governing"><td>Se</td><td class="clause">immediate</td><td class="num">' + fmt(Se,2) + ' mm</td></tr></table></div>';
  html += '<div class="overflow-x"><table class="calc-table"><caption>Check</caption><tr><th>Parameter</th><th>Expression</th><th>Value</th></tr>';
  html += '<tr><td>Sc</td><td class="clause">1-D layer</td><td class="num">' + fmt(Sc,2) + ' mm</td></tr>';
  html += '<tr><td>Total</td><td class="clause">Se+Sc</td><td class="num">' + fmt(chk.total_mm,2) + ' mm</td></tr>';
  html += '<tr><td>UC total</td><td class="clause">T/allow</td><td class="num">' + fmt(chk.ucTotal,3) + '</td></tr>';
  html += '<tr><td>UC diff</td><td class="clause">diff/allowDiff</td><td class="num">' + fmt(chk.ucDiff,3) + '</td></tr>';
  html += '<tr class="governing"><td>Gov UC</td><td class="clause">max</td><td class="num">' + fmt(chk.governingUC,3) + ' ' + (pass ? 'PASS' : 'FAIL') + '</td></tr></table></div>';
  html += '<div class="limits-box"><strong>Limitation:</strong> Simplified If fit (rigid x0.8). Single 1-D layer, dSigma user input. SPT correlations empirical.</div>';
  document.getElementById('calc-settlement').innerHTML = html;
}
