import { fmt } from '../core/format.js?v=20261028a1';

// Anchor bolt plan with tension per bolt.
// Pure SVG string builder (no DOM access) — values in, markup out. Moved verbatim from app.js.
export function anchorDiagramSVG(bolts, boltForces, Bp, Lp) {
  const xs = bolts.map(b => b.x), ys = bolts.map(b => b.y);
  const xbar = xs.reduce((a, b) => a + b, 0) / xs.length;
  const ybar = ys.reduce((a, b) => a + b, 0) / ys.length;
  const margin = 40;
  const minX = Math.min(Math.min(...xs), xbar - Bp / 2) - margin;
  const maxX = Math.max(Math.max(...xs), xbar + Bp / 2) + margin;
  const minY = Math.min(Math.min(...ys), ybar - Lp / 2) - margin;
  const maxY = Math.max(Math.max(...ys), ybar + Lp / 2) + margin;
  const capW = Math.max(maxX - minX, 0.1), capH = Math.max(maxY - minY, 0.1);
  const areaX0 = 20, areaY0 = 25, areaW = 600, areaH = 165;
  const scale = Math.min((areaW - 60) / capW, (areaH - 60) / capH);
  const midX = (minX + maxX) / 2, midY = (minY + maxY) / 2;
  const originX = areaX0 + areaW / 2, originY = areaY0 + areaH / 2;
  const toX = (x) => originX + (x - midX) * scale;
  const toY = (y) => originY - (y - midY) * scale;
  const pedX = toX(xbar - Bp / 2), pedY = toY(ybar + Lp / 2);
  const pedestalRect = `<rect class="outline-pedestal" x="${pedX.toFixed(1)}" y="${pedY.toFixed(1)}" width="${(Bp*scale).toFixed(1)}" height="${(Lp*scale).toFixed(1)}"/>`;
  // One label per bolt ("#i force"), pushed radially away from the bolt-group centroid so that labels of closely
  // spaced bolts (e.g. 300 mm pitch inside a large pedestal) do not stack on top of each other.
  const cxBar = toX(xbar), cyBar = toY(ybar);
  const circles = boltForces.map(bf => {
    const cx = toX(bf.x), cy = toY(bf.y);
    const tension = bf.tension > 0;
    const dx = cx - cxBar, dy = cy - cyBar, d = Math.hypot(dx, dy);
    const ux = d > 1e-6 ? dx / d : 0, uy = d > 1e-6 ? dy / d : 1;
    const anchor = ux > 0.3 ? 'start' : ux < -0.3 ? 'end' : 'middle';
    const lx = cx + ux * 13, ly = cy + uy * 13 + (uy > 0.3 ? 9 : uy < -0.3 ? -1 : 4);
    return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="9" class="${tension ? 'pile-tension' : 'pile-compression'}"/>
      <text class="dim-text" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor}">#${bf.i} ${fmt(bf.tension,1)} kN</text>`;
  }).join('');
  return `<svg class="fdn-diagram" viewBox="0 0 640 210" xmlns="http://www.w3.org/2000/svg">
    <text class="panel-title" x="${areaX0}" y="16">Plan View — Anchor Bolt Tension (pedestal outline shown)</text>
    ${pedestalRect}
    ${circles}
  </svg>`;
}
