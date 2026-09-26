import { fmt } from '../core/format.js?v=20260926e';

// Foundation sizing plan + elevation. patch.js keeps its #fsize-arrow marker clean.
// Pure SVG string builder (no DOM access) — values in, markup out. Moved verbatim from app.js.
export function foundSizeDiagramSVG(type, Bf, Lf, Hf, Df, Bp, Lp, Gp, Dp, OffX, OffZ, hpile, piles, hasGrout, groutT) {
  const hasPed = type === 'pedestal';
  const isBlock = type === 'block';
  // ---- Plan (left) ----
  const pX0 = 20, pY0 = 25, pW = 280, pH = 165, pMargin = 45;
  const pScale = Math.min((pW - pMargin) / Math.max(Bf, 0.1), (pH - pMargin) / Math.max(Lf, 0.1));
  const pcx = pX0 + pW / 2, pcy = pY0 + pH / 2;
  const ffx = pcx - (Bf * pScale) / 2, ffy = pcy - (Lf * pScale) / 2;
  const fW = Bf * pScale, fL = Lf * pScale;
  let pedPlan = '';
  if (hasPed) {
    const pedCx = pcx + OffX * pScale, pedCy = pcy - OffZ * pScale;
    const px = pedCx - (Bp * pScale) / 2, py = pedCy - (Lp * pScale) / 2;
    pedPlan = `<rect class="outline-pedestal" x="${px.toFixed(1)}" y="${py.toFixed(1)}" width="${(Bp*pScale).toFixed(1)}" height="${(Lp*pScale).toFixed(1)}"/>
      <line class="dim" x1="${px.toFixed(1)}" y1="${(py+Lp*pScale+8).toFixed(1)}" x2="${(px+Bp*pScale).toFixed(1)}" y2="${(py+Lp*pScale+8).toFixed(1)}"/>
      <text class="dim-text" x="${(px+Bp*pScale/2).toFixed(1)}" y="${(py+Lp*pScale+20).toFixed(1)}" text-anchor="middle">Bp = ${fmt(Bp,2)} m</text>
      <line class="dim" x1="${(px-8).toFixed(1)}" y1="${py.toFixed(1)}" x2="${(px-8).toFixed(1)}" y2="${(py+Lp*pScale).toFixed(1)}"/>
      <text class="dim-text" x="${(px-12).toFixed(1)}" y="${(py+Lp*pScale/2).toFixed(1)}" text-anchor="end">Lp = ${fmt(Lp,2)} m</text>`;
    if (OffX !== 0 || OffZ !== 0) {
      // Single diagonal leader from the origin to the pedestal center — a two-segment (H-then-V) path would run right along the x-axis or z-axis line and get lost under it.
      const offLabel = `Off X=${fmt(OffX,2)}m, Off Z=${fmt(OffZ,2)}m`;
      const labelCy = pY0 + 12;
      pedPlan += `<line class="dim" x1="${pcx.toFixed(1)}" y1="${pcy.toFixed(1)}" x2="${pedCx.toFixed(1)}" y2="${pedCy.toFixed(1)}" stroke-dasharray="3,3"/>
      <circle cx="${pedCx.toFixed(1)}" cy="${pedCy.toFixed(1)}" r="2.5" fill="var(--accent)"/>
      <text class="dim-text" x="${pcx.toFixed(1)}" y="${(labelCy+2).toFixed(1)}" text-anchor="middle" fill="var(--accent)" font-weight="600">${offLabel}</text>`;
    }
  }
      const planHtml = `
      <text class="panel-title" x="${pX0}" y="16">Foundation Plan</text>
      <rect class="outline-footing" x="${ffx.toFixed(1)}" y="${ffy.toFixed(1)}" width="${fW.toFixed(1)}" height="${fL.toFixed(1)}" fill="none" stroke="var(--line-strong)"/>
      ${pedPlan}
      <!-- Coordinate Axes: X to East(Right), Z to North(Up) — kept inside the footing outline so it never crosses the Bf/Lf dimension lines outside it -->
      <!-- X-axis -->
      <line x1="${(pcx-Math.min(fW/2-8,50)).toFixed(1)}" y1="${pcy.toFixed(1)}" x2="${(pcx+Math.min(fW/2-8,50)).toFixed(1)}" y2="${pcy.toFixed(1)}" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#fsize-arrow)"/>
      <text class="dim-text" x="${(pcx+Math.min(fW/2-8,50)-4).toFixed(1)}" y="${(pcy-6).toFixed(1)}" text-anchor="end" fill="var(--accent)" font-weight="600">x</text>
      <!-- Z-axis -->
      <line x1="${pcx.toFixed(1)}" y1="${(pcy+Math.min(fL/2-8,50)).toFixed(1)}" x2="${pcx.toFixed(1)}" y2="${(pcy-Math.min(fL/2-8,50)).toFixed(1)}" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#fsize-arrow)"/>
      <text class="dim-text" x="${(pcx+6).toFixed(1)}" y="${(pcy-Math.min(fL/2-8,50)+10).toFixed(1)}" fill="var(--accent)" font-weight="600">z</text>
      <!-- Origin Point (0,0) -->
      <circle cx="${pcx.toFixed(1)}" cy="${pcy.toFixed(1)}" r="3" fill="var(--accent)" stroke="var(--panel)" stroke-width="1"/>
      <text class="dim-text" x="${(pcx+5).toFixed(1)}" y="${(pcy-5).toFixed(1)}" fill="var(--accent)" font-weight="600">(0,0)</text>
    <line class="dim" x1="${ffx.toFixed(1)}" y1="${(ffy+fL+14).toFixed(1)}" x2="${(ffx+fW).toFixed(1)}" y2="${(ffy+fL+14).toFixed(1)}"/>
    <text class="dim-text" x="${pcx.toFixed(1)}" y="${(ffy+fL+27).toFixed(1)}" text-anchor="middle">Bf = ${fmt(Bf,2)} m</text>
    <line class="dim" x1="${(ffx+fW+14).toFixed(1)}" y1="${ffy.toFixed(1)}" x2="${(ffx+fW+14).toFixed(1)}" y2="${(ffy+fL).toFixed(1)}"/>
    <text class="dim-text" x="${(ffx+fW+18).toFixed(1)}" y="${pcy.toFixed(1)}">Lf = ${fmt(Lf,2)} m</text>`;
  // ---- Elevation (right) ----
  const eX0 = 340, eY0 = 25, eW = 300, eH = 165, eMargin = 45;
  // Gp = pedestal height above ground (Footing + Pedestal) or the footing/pile cap's own above-ground
  // projection (Footing Only / Pile Cap Only, per foundationSizing()'s isBlock branch) — either way, it's
  // vertical space the elevation view must reserve above the ground line.
  const totalH = Gp + Df;
  // Half-extent needed each side of center: whichever is wider, the footing or the (possibly offset) pedestal.
  const pedHalfExtent = hasPed ? Math.abs(OffX) + Bp/2 : 0;
  const totalW = Math.max(Bf, pedHalfExtent*2);
  const eScale = Math.min((eW - eMargin) / Math.max(totalW, 0.1), (eH - eMargin - 15) / Math.max(totalH, 0.1));
  const ecx = eX0 + eW / 2;
  const groundY = eY0 + 20 + Gp * eScale;
  // Footing sits below ground from depth (Df - Hf) to Df in both modes: under the pedestal (Footing + Pedestal)
  // or under soil backfill (Footing / Pile Cap Only — Gp = 0, flush with grade when Df = Hf).
  const footTopY = groundY + (Df - Hf) * eScale;
  const footBotY = groundY + Df * eScale;
  const footEx = ecx - (Bf * eScale) / 2, footEw = Bf * eScale;
  let pedElev = '';
  if (hasPed) {
    // Pedestal center shifts horizontally with OffX (same East/x direction as the plan) — the footing itself stays centered on ecx, matching how the plan draws the footing fixed and the pedestal offset from it.
    const pedCxE = ecx + OffX * eScale;
    const pedTopY = groundY - Gp * eScale;
    const pedEx = pedCxE - (Bp * eScale) / 2;
    const pedBracketX = pedCxE - (Bp*eScale)/2 - 12;
    const hpBracketX = pedCxE + (Bp*eScale)/2 + 12;
    // Grout (when used) is part of Hp = Gp + Dp + tG — the Hp bracket starts at the top of the grout.
    const groutOn = hasGrout && groutT > 0;
    const groutPx = groutOn ? Math.max(4, (groutT/1000) * eScale) : 0;
    const hpTopY = pedTopY - groutPx;
    const HpShown = Gp + Dp + (groutOn ? groutT/1000 : 0);
    pedElev = `<rect class="outline-pedestal" x="${pedEx.toFixed(1)}" y="${pedTopY.toFixed(1)}" width="${(Bp*eScale).toFixed(1)}" height="${(footTopY-pedTopY).toFixed(1)}"/>
      <line class="dim" x1="${pedBracketX.toFixed(1)}" y1="${pedTopY.toFixed(1)}" x2="${pedBracketX.toFixed(1)}" y2="${groundY.toFixed(1)}"/>
      <text class="dim-text" x="${(pedBracketX-4).toFixed(1)}" y="${((pedTopY+groundY)/2).toFixed(1)}" text-anchor="end">Gp=${fmt(Gp,3)}</text>
      <line class="dim" x1="${pedBracketX.toFixed(1)}" y1="${groundY.toFixed(1)}" x2="${pedBracketX.toFixed(1)}" y2="${footTopY.toFixed(1)}"/>
      <text class="dim-text" x="${(pedBracketX-4).toFixed(1)}" y="${((groundY+footTopY)/2).toFixed(1)}" text-anchor="end">Dp=${fmt(Dp,3)}</text>
      <line class="dim" x1="${hpBracketX.toFixed(1)}" y1="${hpTopY.toFixed(1)}" x2="${hpBracketX.toFixed(1)}" y2="${footTopY.toFixed(1)}"/>
      <text class="dim-text" x="${(hpBracketX+4).toFixed(1)}" y="${((hpTopY+footTopY)/2).toFixed(1)}">Hp=${fmt(HpShown,3)}</text>`;
    if (groutOn) {
      pedElev += `<rect class="grout" x="${pedEx.toFixed(1)}" y="${hpTopY.toFixed(1)}" width="${(Bp*eScale).toFixed(1)}" height="${groutPx.toFixed(1)}"/>
      <text class="dim-text" x="${pedCxE.toFixed(1)}" y="${(hpTopY-4).toFixed(1)}" text-anchor="middle">Grout=${fmt(groutT/1000,3)}</text>`;
    }
  }
  const footElev = `<rect class="outline-footing" x="${footEx.toFixed(1)}" y="${footTopY.toFixed(1)}" width="${footEw.toFixed(1)}" height="${(footBotY-footTopY).toFixed(1)}"/>
    <line class="dim" x1="${(footEx+footEw+12).toFixed(1)}" y1="${footTopY.toFixed(1)}" x2="${(footEx+footEw+12).toFixed(1)}" y2="${footBotY.toFixed(1)}"/>
    <text class="dim-text" x="${(footEx+footEw+16).toFixed(1)}" y="${((footTopY+footBotY)/2).toFixed(1)}">Hf=${fmt(Hf,3)}</text>
    ${isBlock && Gp > 0 ? `<line class="dim" x1="${(footEx-12).toFixed(1)}" y1="${footTopY.toFixed(1)}" x2="${(footEx-12).toFixed(1)}" y2="${groundY.toFixed(1)}"/>
    <text class="dim-text" x="${(footEx-16).toFixed(1)}" y="${((footTopY+groundY)/2).toFixed(1)}" text-anchor="end">Gp=${fmt(Gp,3)}</text>` : ''}
    <line class="dim" x1="${(footEx-12).toFixed(1)}" y1="${groundY.toFixed(1)}" x2="${(footEx-12).toFixed(1)}" y2="${footBotY.toFixed(1)}"/>
    <text class="dim-text" x="${(footEx-16).toFixed(1)}" y="${((groundY+footBotY)/2).toFixed(1)}" text-anchor="end">Df=${fmt(Df,3)}</text>`;
  // Footing / Pile Cap Only: grout layer on top of the footing / cap itself (full width), part of Hf,tot.
  let footGrout = '';
  if (!hasPed && hasGrout && groutT > 0) {
    const gPx = Math.max(4, (groutT/1000) * eScale);
    footGrout = `<rect class="grout" x="${footEx.toFixed(1)}" y="${(footTopY-gPx).toFixed(1)}" width="${footEw.toFixed(1)}" height="${gPx.toFixed(1)}"/>
      <text class="dim-text" x="${ecx.toFixed(1)}" y="${(footTopY-gPx-4).toFixed(1)}" text-anchor="middle">Grout=${fmt(groutT/1000,3)}</text>`;
  }
  let pileLegs = '';
  if (piles.length > 0) {
    // Pile symbol: shaft embeds into the cap (a visible minimum overlap, since the true "hpile" embedment is often only a few mm and would otherwise render as an invisible sliver), then a schematic shaft below the cap ending in a pointed tip.
    const embedPx = Math.min(Math.max(16, hpile * eScale), footBotY - footTopY - 4);
    const shaftLen = 40;
    const topY = footBotY - embedPx;
    const tipY = footBotY + shaftLen;
    const uniqueX = [...new Set(piles.map(p => Math.round(p.x * 1000)))].map(v => v / 1000);
    pileLegs = uniqueX.map(px => {
      const x = ecx + px * eScale;
      return `<rect class="pile-leg" x="${(x-5).toFixed(1)}" y="${topY.toFixed(1)}" width="10" height="${(tipY-8-topY).toFixed(1)}"/>
      <polygon class="pile-leg" points="${(x-5).toFixed(1)},${(tipY-8).toFixed(1)} ${(x+5).toFixed(1)},${(tipY-8).toFixed(1)} ${x.toFixed(1)},${tipY.toFixed(1)}"/>`;
    }).join('');
    pileLegs += `<text class="dim-text" x="${ecx.toFixed(1)}" y="${(tipY+14).toFixed(1)}" text-anchor="middle">h(embed)=${fmt(hpile,3)}m</text>`;
  }
  // Exclusion zone for the ground hatch/label: the footing width, widened to also clear the Gp/Dp (left) and Hp (right) dimension brackets and their text when there's a pedestal — using the pedestal's own (possibly OffX-shifted) center, not the footing's.
  const pedCxForZone = ecx + (hasPed ? OffX * eScale : 0);
  const hatchZoneL = hasPed ? Math.min(footEx, pedCxForZone - (Bp*eScale)/2 - 55) : footEx - 6;
  const hatchZoneR = hasPed ? Math.max(footEx+footEw, pedCxForZone + (Bp*eScale)/2 + 65) : footEx + footEw + 6;
  let groundHatch = '';
  for (let hx = eX0 + 6; hx < eX0 + eW - 2; hx += 9) {
    if (hx > hatchZoneL && hx < hatchZoneR) continue;
    groundHatch += `<line class="ground-hatch" x1="${hx.toFixed(1)}" y1="${groundY.toFixed(1)}" x2="${(hx-5).toFixed(1)}" y2="${(groundY+7).toFixed(1)}"/>`;
  }
  // "Ground" label prefers the left of the panel, but two different things can crowd it there: the Gp/Df (or
  // Gp/Dp/Hp) bracket text on the left (anchor="end", can reach quite far left of the footing/pedestal outline
  // — e.g. "Gp=0.200"), and — the bug seen in practice — the "Hf=" bracket on the RIGHT, which on a small
  // total height / wide footing can itself reach almost to the panel's right edge, so a naive "fall back to
  // the right" collides with it instead. Check both sides' real clearance and pick whichever is less crowded.
  const leftBracketEdge = hatchZoneL - 74; // left extent of the Gp/Df (or Gp/Dp/Hp) bracket text
  const rightBracketEdge = footEx + footEw + 16 + 70; // right extent of the "Hf=" bracket text
  const leftClearance = leftBracketEdge - (eX0 + 4);
  const rightClearance = (eX0 + eW) - rightBracketEdge;
  const groundLabelOnLeft = leftClearance >= rightClearance;
  const groundLabelX = groundLabelOnLeft ? eX0 + 4 : eX0 + eW - 6;
  const groundLabelAnchor = groundLabelOnLeft ? 'start' : 'end';
  // Line + hatch stay in normal draw order (under the footing/pedestal), but the label itself is appended to
  // elevHtml LAST, after footElev/pedElev — otherwise, whenever neither side has room and the label ends up
  // sitting over the footing/pedestal outline, that shape's solid fill (painted afterwards) would cover it.
  const groundLineBase = `<line class="ground-line" x1="${eX0}" y1="${groundY.toFixed(1)}" x2="${(eX0+eW).toFixed(1)}" y2="${groundY.toFixed(1)}"/>
    ${groundHatch}`;
  const groundLabel = `<text class="dim-text" x="${groundLabelX.toFixed(1)}" y="${(groundY-4).toFixed(1)}" text-anchor="${groundLabelAnchor}">Ground</text>`;
  // Coordinate axes for the elevation: origin at bottom-center of the footing — x horizontal (same East direction as the plan), y vertical (elevation, up positive)
  const eOx = ecx, eOy = footBotY;
  const eAxisLen = Math.max(10, Math.min(35, footBotY - footTopY - 8, footEw/2 - 8));
  const axisElev = `<line x1="${eOx.toFixed(1)}" y1="${eOy.toFixed(1)}" x2="${(eOx+eAxisLen).toFixed(1)}" y2="${eOy.toFixed(1)}" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#fsize-arrow)"/>
    <text class="dim-text" x="${(eOx+eAxisLen+4).toFixed(1)}" y="${(eOy+4).toFixed(1)}" fill="var(--accent)" font-weight="600">x</text>
    <line x1="${eOx.toFixed(1)}" y1="${eOy.toFixed(1)}" x2="${eOx.toFixed(1)}" y2="${(eOy-eAxisLen).toFixed(1)}" stroke="var(--accent)" stroke-width="1.5" marker-end="url(#fsize-arrow)"/>
    <text class="dim-text" x="${(eOx+4).toFixed(1)}" y="${(eOy-eAxisLen-4).toFixed(1)}" fill="var(--accent)" font-weight="600">y</text>
    <circle cx="${eOx.toFixed(1)}" cy="${eOy.toFixed(1)}" r="3" fill="var(--accent)" stroke="var(--panel)" stroke-width="1"/>
    <text class="dim-text" x="${(eOx+5).toFixed(1)}" y="${(eOy-5).toFixed(1)}" fill="var(--accent)" font-weight="600">(0,0)</text>`;
  const elevHtml = `
    <text class="panel-title" x="${eX0}" y="16">Elevation</text>
    ${groundLineBase}
    ${pedElev}
    ${footElev}
    ${footGrout}
    ${pileLegs}
    ${axisElev}
    ${groundLabel}`;
    return `<svg class="fdn-diagram" viewBox="0 0 700 220" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <marker id="fsize-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" fill="var(--line-strong)"/>
        </marker>
      </defs>
    <line class="divider" x1="330" y1="10" x2="330" y2="210"/>
    ${planHtml}
    ${elevHtml}
  </svg>`;
}
