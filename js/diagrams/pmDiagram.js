import { fmt } from '../core/format.js?v=20260926n';

// Pedestal P-M interaction diagram.
// Pure SVG string builder (no DOM access) — values in, markup out. Moved verbatim from app.js.
export function pmDiagramSVG(curve, perCombo) {
  const areaX0 = 55, areaY0 = 20, areaW = 555, areaH = 165;
  const allM = curve.map(p => p.phiMn / 1e6).concat(perCombo.map(d => Math.abs(d.Mu)));
  const allP = curve.map(p => p.phiPn / 1000).concat(perCombo.map(d => d.Pu));
  const maxM = Math.max(...allM) * 1.15 || 1;
  const maxP = Math.max(...allP, 0) * 1.1 || 1;
  const minP = Math.min(...allP, 0) * 1.1;
  const toX = (m) => areaX0 + (m / maxM) * areaW;
  const toY = (p) => areaY0 + areaH - ((p - minP) / (maxP - minP)) * areaH;
  const curvePts = curve.map(p => `${toX(p.phiMn/1e6).toFixed(1)},${toY(p.phiPn/1000).toFixed(1)}`).join(' ');
  const zeroY = toY(0);
  const points = perCombo.map(d => {
    const cx = toX(Math.abs(d.Mu)), cy = toY(d.Pu);
    return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="4" class="${d.uc<=1.0 ? 'pm-point-ok' : 'pm-point'}"/>`;
  }).join('');
  return `<svg class="fdn-diagram" viewBox="0 0 640 210" xmlns="http://www.w3.org/2000/svg">
    <text class="panel-title" x="${areaX0}" y="14">π P-M Interaction Diagram — dots are each load combination</text>
    <line class="pm-axis" x1="${areaX0}" y1="${areaY0}" x2="${areaX0}" y2="${(areaY0+areaH).toFixed(1)}"/>
    <line class="pm-axis" x1="${areaX0}" y1="${zeroY.toFixed(1)}" x2="${(areaX0+areaW).toFixed(1)}" y2="${zeroY.toFixed(1)}"/>
    <polyline class="pm-curve" points="${curvePts}"/>
    ${points}
    <text class="dim-text" x="${(areaX0+areaW-90).toFixed(1)}" y="${(areaY0+areaH+14).toFixed(1)}">M (kN·m) →</text>
    <text class="dim-text" x="2" y="${(areaY0+10).toFixed(1)}">P(kN)</text>
  </svg>`;
}
