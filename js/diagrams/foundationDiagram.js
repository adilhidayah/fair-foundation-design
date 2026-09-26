import { fmt } from '../core/format.js?v=20260926v';

// Shallow foundation stability — plan + section with bearing pressure.
// Pure SVG string builder (no DOM access) — values in, markup out. Moved verbatim from app.js.
export function foundationDiagramSVG(B, L, Bp, Lp, t, hp, H, M, e, qmax, qmin) {
  const planX0 = 20, planY0 = 25, planW = 280, planH = 170;
  const scaleP = Math.min((planW - 50) / Math.max(B, 0.01), (planH - 50) / Math.max(L, 0.01));
  const fW = B * scaleP, fH = L * scaleP;
  const pW = Math.min(Bp, B) * scaleP, pH = Math.min(Lp, L) * scaleP;
  const cx = planX0 + planW / 2, cy = planY0 + planH / 2;
  const fx = cx - fW / 2, fy = cy - fH / 2;
  const px = cx - pW / 2, py = cy - pH / 2;
  const eX = cx + e * scaleP;
  const secX0 = 340, secY0 = 25, secW = 300, secH = 170;
  const scaleS = Math.min((secW - 70) / Math.max(B, 0.01), (secH - 80) / Math.max(t + hp, 0.01));
  const sfW = B * scaleS, sfH = t * scaleS;
  const spW = Math.min(Bp, B) * scaleS, spH = hp * scaleS;
  const baseY = secY0 + secH - 30;
  const scx = secX0 + secW / 2;
  const sfx = scx - sfW / 2, sfy = baseY - sfH;
  const spx = scx - spW / 2, spy = sfy - spH;
  const pScale = 28 / Math.max(qmax, 0.01);
  const hLeft = Math.max(qmin, 0) * pScale;
  const hRight = qmax * pScale;
  const hArrow = Math.abs(H) > 0.01 ? `<line class="load-line" x1="${scx.toFixed(1)}" y1="${(spy-24).toFixed(1)}" x2="${(scx+22).toFixed(1)}" y2="${(spy-24).toFixed(1)}" marker-end="url(#fdn-arrow-fail)"/>
    <text class="load-text" x="${(scx+25).toFixed(1)}" y="${(spy-19).toFixed(1)}">H=${fmt(H,0)}</text>` : '';
  const mText = Math.abs(M) > 0.01 ? `<text class="load-text" x="${(scx+5).toFixed(1)}" y="${(spy-34).toFixed(1)}">M=${fmt(M,0)}</text>` : '';
  const eccMarker = Math.abs(e) > 0.001 ? `<circle cx="${eX.toFixed(1)}" cy="${cy.toFixed(1)}" r="3" fill="var(--fail)"/>
    <text class="load-text" x="${(eX+5).toFixed(1)}" y="${(cy-5).toFixed(1)}">e</text>` : '';
    return `<svg class="fdn-diagram" viewBox="0 0 660 220" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <marker id="fdn-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" fill="var(--line-strong)"/>
        </marker>
        <marker id="fdn-arrow-fail" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" fill="var(--fail)"/>
        </marker>
      </defs>
    <line class="divider" x1="330" y1="10" x2="330" y2="210"/>
    <text class="panel-title" x="${planX0}" y="16">Plan View</text>
    <text class="panel-title" x="${secX0}" y="16">Section (B direction)</text>
    <rect class="outline-footing" x="${fx.toFixed(1)}" y="${fy.toFixed(1)}" width="${fW.toFixed(1)}" height="${fH.toFixed(1)}"/>
    <rect class="outline-pedestal" x="${px.toFixed(1)}" y="${py.toFixed(1)}" width="${pW.toFixed(1)}" height="${pH.toFixed(1)}"/>
    <line class="centerline" x1="${cx.toFixed(1)}" y1="${(fy-8).toFixed(1)}" x2="${cx.toFixed(1)}" y2="${(fy+fH+8).toFixed(1)}"/>
    <line class="centerline" x1="${(fx-8).toFixed(1)}" y1="${cy.toFixed(1)}" x2="${(fx+fW+8).toFixed(1)}" y2="${cy.toFixed(1)}"/>
    ${eccMarker}
    <line class="dim" x1="${fx.toFixed(1)}" y1="${(fy+fH+14).toFixed(1)}" x2="${(fx+fW).toFixed(1)}" y2="${(fy+fH+14).toFixed(1)}"/>
    <text class="dim-text" x="${cx.toFixed(1)}" y="${(fy+fH+27).toFixed(1)}" text-anchor="middle">B = ${fmt(B,2)} m</text>
    <line class="dim" x1="${(fx+fW+14).toFixed(1)}" y1="${fy.toFixed(1)}" x2="${(fx+fW+14).toFixed(1)}" y2="${(fy+fH).toFixed(1)}"/>
    <text class="dim-text" x="${(fx+fW+18).toFixed(1)}" y="${cy.toFixed(1)}">L = ${fmt(L,2)} m</text>
    <rect class="outline-footing" x="${sfx.toFixed(1)}" y="${sfy.toFixed(1)}" width="${sfW.toFixed(1)}" height="${sfH.toFixed(1)}"/>
    <rect class="outline-pedestal" x="${spx.toFixed(1)}" y="${spy.toFixed(1)}" width="${spW.toFixed(1)}" height="${spH.toFixed(1)}"/>
    <line class="load-line" x1="${scx.toFixed(1)}" y1="${(spy-24).toFixed(1)}" x2="${scx.toFixed(1)}" y2="${spy.toFixed(1)}" marker-end="url(#fdn-arrow-fail)"/>
    <text class="load-text" x="${(scx-14).toFixed(1)}" y="${(spy-4).toFixed(1)}">P</text>
    ${hArrow}
    ${mText}
    <polygon class="pressure" points="${sfx.toFixed(1)},${baseY.toFixed(1)} ${sfx.toFixed(1)},${(baseY+hLeft).toFixed(1)} ${(sfx+sfW).toFixed(1)},${(baseY+hRight).toFixed(1)} ${(sfx+sfW).toFixed(1)},${baseY.toFixed(1)}"/>
    <text class="dim-text" x="${sfx.toFixed(1)}" y="${(baseY+hLeft+12).toFixed(1)}" text-anchor="middle">${fmt(qmin,0)}</text>
    <text class="dim-text" x="${(sfx+sfW).toFixed(1)}" y="${(baseY+hRight+12).toFixed(1)}" text-anchor="middle">${fmt(qmax,0)}</text>
    <text class="dim-text" x="${scx.toFixed(1)}" y="${(baseY+Math.max(hLeft,hRight)+24).toFixed(1)}" text-anchor="middle">Bearing pressure (kPa)</text>
  </svg>`;
}
