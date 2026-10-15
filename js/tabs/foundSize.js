// 02 — Foundation dimension / sizing.
// Moved from app.js — function/const declarations only; event wiring stays in app.js.
import { foundationGeometryCheck, foundationSizing } from '../../lib/foundation/index.js?v=20261015f';
import { escapeHtml, getRadioVal, num } from '../core/dom.js?v=20261015f';
import { fmt } from '../core/format.js?v=20261015f';
import { lastResults, pileList, state } from '../core/state.js?v=20261015f';
import { foundSizeDiagramSVG } from '../diagrams/foundSizeDiagram.js?v=20261015f';
import { chapterHeader, numberTables, sectionHeader } from '../core/worksheet.js?v=20261015f';
import { recalcAll } from '../workflow/recalc.js?v=20261015f';
import { activeLoadPoints } from '../tabs/loadPoints.js?v=20261015f';
import { foundSizeFocusHTML, foundSizeFocusInvalidHTML } from '../tabs/foundSizeFocus.js?v=20261015f';

// foundationSizing() lives in lib/foundation/static/foundationSizing.js.
export function calcFoundSize() {
  const type = getRadioVal('fs-type');
  const hasPed = type === 'pedestal';
  const isBlock = type === 'block';
  document.getElementById('fs-pedestal-fields').style.display = hasPed ? 'block' : 'none';
  document.getElementById('fs-pedestal-group').style.display = hasPed ? '' : 'none'; // whole group, incl. its header
  const support = getRadioVal('fs-support');
  const isPile = support === 'pile';
  // Grouting sits on the top concrete surface: the pedestal (Footing + Pedestal) or the footing / pile cap itself
  // (Footing / Pile Cap Only) — move the one grouting block into the matching input group.
  const groutBlock = document.getElementById('fs-grout-block');
  const groutSlot = document.getElementById(hasPed ? 'fs-grout-slot-pedestal' : 'fs-grout-slot-footing');
  if (groutBlock.parentElement !== groutSlot) groutSlot.appendChild(groutBlock);
  document.getElementById('fs-grout-label').textContent = 'Grouting above ' + (hasPed ? 'pedestal' : (isPile ? 'pile cap' : 'footing'));
  const hasGrout = document.getElementById('fs-grout').checked;
  const groutT = num('fs-grout-t');
  document.getElementById('fs-grout-t-field').style.display = hasGrout ? 'block' : 'none';
  document.getElementById('fs-pile-fields').style.display = isPile ? 'block' : 'none';
  document.getElementById('fs-type-pedestal-btn').textContent = isPile ? 'Pile Cap + Pedestal' : 'Footing + Pedestal';
  document.getElementById('fs-type-block-btn').textContent = isPile ? 'Pile Cap Only' : 'Footing Only';
  document.getElementById('fs-footing-section-label').textContent = isPile ? 'Pile Cap Dimensions' : 'Footing Dimensions';
  document.getElementById('fs-Bf-label').innerHTML = 'Width, B<sub>f</sub>';
  document.getElementById('fs-Lf-label').innerHTML = 'Length, L<sub>f</sub>';
  document.getElementById('fs-Hf-label').innerHTML = 'Height, H<sub>f</sub>';
  document.getElementById('fs-lean-proj-label').textContent = isPile ? 'Edge projection beyond pile cap (each side), e' : 'Edge projection beyond footing (each side), e';
  document.getElementById('fs-ai-file-label').textContent = isPile ? 'Upload a pile cap / pedestal drawing or datasheet, or type the dimensions.' : 'Upload a footing / pedestal drawing or datasheet, or type the dimensions.';
  document.getElementById('fs-ai-chat-label').textContent = 'Chat / paste spec text';
  document.getElementById('fs-ai-chat').placeholder = isPile ? 'pile cap 2.4 x 2.4 x 0.8, Df 1.5, pedestal 1.25 x 1.25 Gp 0.275 ...' : 'footing 2.4 x 2.4 x 0.8, Df 1.5, pedestal 1.25 x 1.25 Gp 0.275 ...';
  document.getElementById('fs-ai-parser-note').innerHTML = `Reads Bf, Lf, Hf, Df, Bp, Lp, Gp, Off X, Off Z, grout thickness and embedment h, and size groups such as "${isPile ? 'pile cap' : 'footing'} 3 x 3 x 0.8" or "pedestal 1.25 x 1.25". Units mm / cm / m are converted; a number without a unit is read as m (mm when ≥ 50). Keywords: pile / shallow, pedestal / "footing only" / "no pedestal". Images are read by OCR; PDF is not supported yet.`;
  const piles = isPile ? pileList : [];
  const Bf = num('fs-Bf'), Lf = num('fs-Lf');
  const Hf0 = num('fs-Hf');
  const Df = num('fs-Df');
  const gc = num('gen-gc') / 9.80665, gs = num('gen-gs') / 9.80665, gl = num('gen-gl') / 9.80665; // kN/m³ -> t/m³
  const hpile = num('fs-hpile');
  const Bp = hasPed ? num('fs-Bp') : 0, Lp = hasPed ? num('fs-Lp') : 0;
  const pedGp = hasPed ? num('fs-Gp') : 0;
  const OffX = hasPed ? num('fs-OffX') : 0, OffZ = hasPed ? num('fs-OffZ') : 0;
  // Tab 02 is the single source of the plan geometry used by 5A / 5B: the pedestal size (5A section, one-way shear
  // sections, punching column size) and the cap widths (5B flexure / one-way shear). They are mirrored into those
  // tabs' fields (read-only). With no pedestal in Tab 02 (cap-only) the pedestal-size fields stay editable, as the
  // column / base-plate size the load is applied through. Units: Tab 02 in m, the mirrored fields in mm.
  const mirror = (id, m, locked) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.readOnly = locked;
    if (locked) el.value = String(+(m * 1000).toFixed(1));
  };
  mirror('rb-Lcap', Lf, true); mirror('rb-Bcap', Bf, true);
  // Cap thickness: Tab 02 Hf (m) -> the flexure thickness (5B), the one-way / punching overall height (5B), and the 4B display.
  mirror('rb-t', Hf0, true); mirror('ow-h', Hf0, true); mirror('tw-h', Hf0, true);
  const pft = document.getElementById('pf-t');
  if (pft) { pft.readOnly = true; pft.value = Hf0.toFixed(2); }
  ['rb-Bp', 'tw-c1'].forEach(id => mirror(id, hasPed ? num('fs-Bp') : 0, hasPed));
  ['rb-Lp', 'tw-c2'].forEach(id => mirror(id, hasPed ? num('fs-Lp') : 0, hasPed));
  // Tab 09: the concrete member the anchor bolts sit in (its size sets the edge distance c_a1) — the pedestal, or the
  // footing / pile cap itself when there is no pedestal. Always from Tab 02, never typed separately.
  mirror('ab-Bp', hasPed ? num('fs-Bp') : Bf, true);
  mirror('ab-Lp', hasPed ? num('fs-Lp') : Lf, true);
  const abNote = document.getElementById('ab-ped-src');
  if (abNote) abNote.innerHTML = hasPed
    ? 'From the pedestal in "02 — FOUNDATION DIMENSION" — edit it there.'
    : `No pedestal in Tab 02: the bolts sit in the ${isPile ? 'pile cap' : 'footing'} itself, so its plan size B<sub>f</sub> × L<sub>f</sub> is used — edit it in "02 — FOUNDATION DIMENSION". Bolt group assumed centred on it.`;
  const pedNote = hasPed ? 'From the pedestal in "02 — FOUNDATION DIMENSION" (B<sub>p</sub> along x, L<sub>p</sub> along z) — edit it there.'
    : 'No pedestal in Tab 02 (cap only) — enter the column / base-plate size the load is applied through.';
  ['rb-ped-src', 'tw-ped-src'].forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = pedNote; });
  // Tab 08 bearing capacity (also used by 4A and Table 1.3.1): footing plan size and depth from Tab 02, read-only.
  // B = shorter side, L = longer side; shape follows the plan (square when Bf = Lf, otherwise rectangular).
  const bcShape = Math.abs(Bf - Lf) < 1e-9 ? 'square' : 'rectangular';
  [['bc-B', Math.min(Bf, Lf)], ['bc-L', Math.max(Bf, Lf)], ['bc-Df', Df]].forEach(([id, v]) => {
    const el = document.getElementById(id);
    if (el) { el.readOnly = true; el.value = String(+v.toFixed(3)); }
  });
  document.querySelectorAll('#bc-shape button').forEach(b => { b.classList.toggle('sel', b.dataset.val === bcShape); b.disabled = true; });
  const blockGp = 0; // unused by foundationSizing() since the "Only" mode uses input Hf (kept for signature)
  // Lean concrete is no longer part of the foundation dead load (replaced by the grouting row, Wg) — the hidden
  // fs-lean-* inputs are left in place but not passed, so foundationSizing() returns Wl = 0.
  const sizing = foundationSizing({ type, Bf, Lf, Hf: Hf0, Df, gc, gs, Bp, Lp, pedGp, OffX, OffZ, blockGp,
    groutT: hasGrout ? groutT / 1000 : 0 }); // grout input in mm -> m
  if (!sizing.valid) {
    state.pedHp = 0; state.pedW = 0; state.footSoilW = 0; state.footW = 0;
    lastResults.foundsize = { issues: foundationGeometryCheck({ Bf, Lf, Hf: Hf0, Df }).issues };
    document.getElementById('calc-foundsize').innerHTML = `<div class="warn-box"><strong>⚠  Invalid input:</strong> B<sub>f</sub>, L<sub>f</sub>, H<sub>f</sub> must be greater than zero and D<sub>f</sub> ≥ 0 (bottom not above ground). With a pedestal, D<sub>f</sub> ≥ H<sub>f</sub> as well (the footing must fit within the embedment depth); without a pedestal the footing / pile cap may project above ground.</div>`;
    document.getElementById('focus-foundsize').innerHTML = foundSizeFocusInvalidHTML();
    return;
  }
  const { Hf, Af, Wf, Gp, Dp, Hp, Ap, Wp, Wg, Ws, hs, totalWeightTon, totalWeightKN, deltaH } = sizing;
  // 5A designs the pedestal at its base (top of footing): the lever arm of H is the pedestal height Hp (incl. grout) and the
  // pedestal's own weight (concrete Wp + grout Wg, tons -> kN) adds to the axial load. Nothing for a cap-only foundation.
  state.pedHp = sizing.hasPed ? Hp : 0;
  state.pedW = sizing.hasPed ? (Wp + Wg) * 9.80665 : 0;
  state.footSoilW = Ws * 9.80665; // tons -> kN (4A: centroid shifts with the pedestal offset)
  // tons -> kN (5B shallow footing: deducted with the backfill from the design pressure); without a pedestal the grout layer
  // covers the whole footing (Wg = gc·Af·groutT), so it is part of the footing load per unit area.
  state.footW = (Wf + (sizing.hasPed ? 0 : Wg)) * 9.80665;
  const hasGroutT = hasGrout && sizing.groutT > 0; // grout is part of Hp (pedestal) or HfTot (block) geometry; weight reported as Wg
  const HfTot = sizing.HfTot;
  // Hf is a free input in every mode now (the "Only" mode no longer derives it from Df + Gp) — make sure a
  // field locked by an earlier version of this code is editable again.
  document.getElementById('fs-Hf').readOnly = false;
  let html = '';
  html += chapterHeader('02. Foundation Dimension', 'This section establishes the foundation geometry — footing/pile cap and pedestal dimensions — used by the subsequent calculations in this tool.');
  // Geometry consistency (lib) — shown here, and the result drives the status of step 02 in the Design Status panel.
  const geom = foundationGeometryCheck({ Bf, Lf, Hf, Df, hasPed, Bp, Lp, OffX, OffZ, isPile, hEmbed: hpile });
  // Non-blocking warnings (e.g. a cap-only top not above the ground) go to the Design Status panel as notices.
  lastResults.foundsize = { issues: geom.issues, notices: geom.warnings.map(w => ({ title: `${isPile ? 'Pile cap' : 'Footing'} top not above ground`, text: w.text })) };
  if (!geom.overallPass) {
    html += `<div class="warn-box"><strong>⚠  Foundation geometry is not consistent:</strong><ul style="margin:4px 0 0 18px;padding:0;">${geom.issues.map(i => `<li>${escapeHtml(i.text)}</li>`).join('')}</ul>Correct the dimensions in the input panel — the checks that use this geometry are not reliable until then.</div>`;
  }
  if (isPile && piles.length === 0) {
    html += `<div class="warn-box"><strong>⚠  Pile Foundation selected but no piles defined:</strong> add piles in "4B — PILE FOUNDATION STABILITY", or switch Foundation Type to "Shallow Foundation" in "01 — GENERAL INPUT DATA".</div>`;
  }
  html += sectionHeader('2.1', 'Foundation Layout', `Plan (x, z) and elevation (x, y); origin at the ${isPile ? 'pile cap' : 'footing'} centre.${isPile && piles.length ? ' Piles are shown dashed (below the cap), numbered as in 4B.' : ''}`, true);
  const diagramSvg = foundSizeDiagramSVG(type, Bf, Lf, Hf, Df, Bp, Lp, Gp, Dp, OffX, OffZ, hpile, piles, hasGrout, groutT, isPile ? num('pf-dia') / 1000 : 0, activeLoadPoints());
  html += diagramSvg;
  const fWord = isPile ? 'pile cap' : 'footing';
  html += sectionHeader('2.2', isPile ? 'Pile Cap' : 'Footing');
  html += `<div class="overflow-x"><table class="calc-table" style="table-layout:fixed;">
    <caption>${isPile ? 'Pile Cap Size' : 'Footing Size'}</caption>
    <tr><th style="width:46%;">Parameter</th><th style="width:24%;">Expression</th><th style="width:30%;">Value</th></tr>
    <tr><td>Width of ${fWord}, B<sub>f</sub></td><td class="clause">input</td><td class="num">${fmt(Bf,2)} m</td></tr>
    <tr><td>Length of ${fWord}, L<sub>f</sub></td><td class="clause">input</td><td class="num">${fmt(Lf,2)} m</td></tr>
    <tr><td>Height of ${fWord}, H<sub>f</sub></td><td class="clause">input</td><td class="num">${fmt(Hf,2)} m</td></tr>
    <tr><td>Depth of ${fWord}, D<sub>f</sub></td><td class="clause">input</td><td class="num">${fmt(Df,2)} m</td></tr>
    ${isBlock && hasGroutT ? `<tr><td>Grout thickness above ${fWord}, t<sub>G</sub></td><td class="clause">input</td><td class="num">${fmt(sizing.groutT,3)} m</td></tr>
    <tr><td>Total height of ${fWord}, H<sub>f,tot</sub></td><td class="clause">H<sub>f</sub> + t<sub>G</sub></td><td class="num">${fmt(HfTot,3)} m</td></tr>` : ''}
    ${isBlock && Gp > 0 ? `<tr><td>Projection of ${fWord} above ground, G<sub>p</sub></td><td class="clause">H<sub>f</sub> - D<sub>f</sub></td><td class="num">${fmt(Gp,3)} m</td></tr>` : ''}
    <tr><td>Area of ${fWord}, A<sub>f</sub></td><td class="clause">B<sub>f</sub>·L<sub>f</sub></td><td class="num">${fmt(Af,2)} m²</td></tr>
  </table></div>`;
  if (hasPed) {
    html += sectionHeader('2.3', 'Pedestal');
    html += `<div class="overflow-x"><table class="calc-table" style="table-layout:fixed;">
      <caption>Pedestal Size</caption>
      <tr><th style="width:46%;">Parameter</th><th style="width:24%;">Expression</th><th style="width:30%;">Value</th></tr>
      <tr><td>Width of pedestal, B<sub>p</sub></td><td class="clause">input</td><td class="num">${fmt(Bp,2)} m</td></tr>
      <tr><td>Length of pedestal, L<sub>p</sub></td><td class="clause">input</td><td class="num">${fmt(Lp,2)} m</td></tr>
      <tr><td>Height of pedestal above ground, G<sub>p</sub></td><td class="clause">input</td><td class="num">${fmt(Gp,3)} m</td></tr>
      <tr><td>Pedestal offset X from ${fWord} center, Off<sub>X</sub></td><td class="clause">input</td><td class="num">${fmt(OffX,2)} m</td></tr>
      <tr><td>Pedestal offset Z from ${fWord} center, Off<sub>Z</sub></td><td class="clause">input</td><td class="num">${fmt(OffZ,2)} m</td></tr>
      <tr><td>Depth of pedestal below ground, D<sub>p</sub></td><td class="clause">D<sub>f</sub> - H<sub>f</sub></td><td class="num">${fmt(Dp,3)} m</td></tr>
      ${hasGroutT ? `<tr><td>Grout thickness above pedestal, t<sub>G</sub></td><td class="clause">input</td><td class="num">${fmt(sizing.groutT,3)} m</td></tr>` : ''}
      <tr><td>Total height of pedestal, H<sub>p</sub></td><td class="clause">G<sub>p</sub> + D<sub>p</sub>${hasGroutT ? ' + t<sub>G</sub>' : ''}</td><td class="num">${fmt(Hp,3)} m</td></tr>
      <tr><td>Area of pedestal, A<sub>p</sub></td><td class="clause">B<sub>p</sub>·L<sub>p</sub></td><td class="num">${fmt(Ap,2)} m²</td></tr>
    </table></div>`;
  }
  {
    // Weight values (Wf, Wg, Wp, Ws) come straight from foundationSizing() above (in tonnes) — converted to kN
    // here for display, not recomputed from Hf/Af/γ etc. a second time, so the geometry-to-weight formula lives
    // in one place (lib/foundation/static/foundationSizing.js).
    const gcKN = num('gen-gc'), gsKN = num('gen-gs');
    const dlItems = [];
    dlItems.push({
      desc: 'Weight of footing,', sym: 'W<sub>F</sub>',
      // Geometry notation matches the "02. Foundation Dimension" tables (Bf, Lf, Hf, Hf,tot, Af, Df, Gp, Hp, Ap, Dp).
      exprSym: 'H<sub>f</sub>·A<sub>f</sub>·γ<sub>C</sub>',
      exprSub: `${fmt(Hf,2)}*${fmt(Af,2)}*${fmt(gcKN,3)}`,
      val: Wf * 9.80665, dec: 2
    });
    if (Wg > 0) {
      // Grout on top of the pedestal (or footing / pile cap in block mode), unit weight γC — see foundationSizing.
      const gA = hasPed ? 'A<sub>p</sub>' : 'A<sub>f</sub>', gAval = hasPed ? Ap : Af;
      dlItems.push({
        desc: 'Weight of grouting,', sym: 'W<sub>G</sub>',
        exprSym: `${gA}·t<sub>G</sub>·γ<sub>C</sub>`,
        exprSub: `${fmt(gAval,4)}*${fmt(sizing.groutT,3)}*${fmt(gcKN,3)}`,
        val: Wg * 9.80665, dec: 2
      });
    }
    if (hasPed) {
      dlItems.push({
        desc: 'Weight of pedestal,', sym: 'W<sub>P</sub>',
        exprSym: '(G<sub>p</sub> + D<sub>p</sub>)·A<sub>p</sub>·γ<sub>C</sub>',
        exprSub: `(${fmt(Gp,3)}+${fmt(Dp,3)})*${fmt(Ap,4)}*${fmt(gcKN,3)}`,
        val: Wp * 9.80665, dec: 2
      });
      dlItems.push({
        desc: 'Weight of soil above footing,', sym: 'W<sub>soil</sub>',
        exprSym: '(A<sub>f</sub> - A<sub>p</sub>)·D<sub>p</sub>·γ<sub>S</sub>',
        exprSub: `(${fmt(Af,2)}-${fmt(Ap,4)})*${fmt(Dp,2)}*${fmt(gsKN,2)}`,
        val: Ws * 9.80665, dec: 2
      });
    } else if (isBlock && hs > 0) {
      dlItems.push({
        desc: `Weight of soil above ${fWord},`, sym: 'W<sub>soil</sub>',
        exprSym: hasGroutT ? 'A<sub>f</sub>·(D<sub>f</sub> - H<sub>f,tot</sub>)·γ<sub>S</sub>' : 'A<sub>f</sub>·(D<sub>f</sub> - H<sub>f</sub>)·γ<sub>S</sub>',
        exprSub: `${fmt(Af,2)}*${fmt(hs,2)}*${fmt(gsKN,2)}`,
        val: Ws * 9.80665, dec: 2
      });
    }
    // Same calc-table style as the "02. Foundation Dimension" tables: Description | Symbol | Calculation | Result
    // (trailing comma of desc dropped for table cells).
    let dlRows = '';
    dlItems.forEach(it => {
      dlRows += `<tr><td>${it.desc.replace(/,$/, '')}</td><td>${it.sym}</td><td class="clause">${it.exprSym}</td><td class="num">${fmt(it.val, it.dec)} kN</td></tr>`;
    });
    dlRows += `<tr class="calc-total"><td>Total dead load</td><td>D</td><td class="clause"></td><td class="num">${fmt(totalWeightKN, 2)} kN</td></tr>`;
    const dlContainer = document.getElementById('dl-worksheet-container');
    if (dlContainer) {
      dlContainer.innerHTML = `<div class="overflow-x"><table class="calc-table" style="table-layout:fixed;">
        <caption>3.1.1. Dead Load (D)</caption>
        <tr><th style="width:34%;">Description</th><th style="width:12%;">Symbol</th><th style="width:30%;">Calculation</th><th style="width:24%;">Result</th></tr>
        ${dlRows}
      </table></div>`;
    }
    // Focus Canvas view of the same results (js/tabs/foundSizeFocus.js) — shown instead of the report sheet in that mode.
    document.getElementById('focus-foundsize').innerHTML = foundSizeFocusHTML({
      typeLabel: hasPed ? (isPile ? 'Pile Cap + Pedestal' : 'Footing + Pedestal') : (isPile ? 'Pile Cap Only' : 'Footing Only'),
      supportLabel: isPile ? 'Pile foundation' : 'Shallow foundation',
      isPile, hasPed, isBlock, Bf, Lf, Hf, Df, Af, Bp, Lp, Gp, Dp, Hp, Ap, OffX, OffZ, groutT: hasGroutT ? sizing.groutT : 0, HfTot,
      nPiles: piles.length, piles, D: isPile ? num('pf-dia') / 1000 : 0, hEmbed: hpile,
      weights: dlItems.map((it) => ({ label: it.desc.replace(/,$/, ''), sym: it.sym, kN: it.val })),
      totalKN: totalWeightKN, deltaH, geom, svg: diagramSvg
    });
  }
  document.getElementById('calc-foundsize').innerHTML = numberTables(html, '2');
  document.getElementById('lc-dW').value = totalWeightKN.toFixed(1);
  document.getElementById('lc-dh').value = deltaH.toFixed(3);
  recalcAll(); // also re-runs calcPile() — pile coordinates stay fixed when Bf/Lf change; 4B re-checks spacing/edge against the new cap size
}
