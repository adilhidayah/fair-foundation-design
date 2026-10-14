// 08B — Settlement (soil).
// Moved from app.js — function/const declarations only; event wiring stays in app.js.
import { consolidationSettlement, correctSPT, cuFromSPT, elasticSettlement, esFromSPT, phiFromSPT, settlementCheck } from '../../lib/foundation/index.js?v=20261014b';
import { num } from '../core/dom.js?v=20261014b';
import { fmt } from '../core/format.js?v=20261014b';
import { lastResults } from '../core/state.js?v=20261014b';

// correctSPT/phiFromSPT/cuFromSPT/esFromSPT live in shared/soilProperties.js;
// elasticSettlement/consolidationSettlement/settlementCheck live in shared/settlementCheck.js.
export function calcSettlement() {
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
