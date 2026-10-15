import { fmt } from '../core/format.js?v=20261015i';

// Load transfer top-of-pedestal -> bottom of footing (Design Load Summary).
// Pure SVG string builder (no DOM access) — values in, markup out. Moved verbatim from app.js.
// Schematic (not to scale) elevation of the top-of-pedestal -> bottom-center load transfer used by the 3.1.7
// bottom-of-footing table: two panels, X-direction (Fx -> Mz) and Z-direction (Fz -> Mx). hasPed: pedestal on
// top (else loads act on top of footing / pile cap); isPile draws schematic piles. Symbols only — values are
// in the formula lines and tables.
export function loadTransferDiagramSVG(hasPed, isPile, dh, dW) {
  const cWord = isPile ? 'pile cap' : 'footing';
  const panel = (x0, dir) => {
    const cx = x0 + 150;
    const footTop = 118, footBot = 160;
    const topY = hasPed ? 58 : footTop;           // load point: top of pedestal, or top of footing / pile cap
    const groundY = hasPed ? 88 : 72;             // "Only" mode: cap/footing shown under backfill
    const F = dir === 'x' ? 'F<tspan baseline-shift="sub" font-size="8">x</tspan>' : 'F<tspan baseline-shift="sub" font-size="8">z</tspan>';
    const Mt = dir === 'x' ? 'M<tspan baseline-shift="sub" font-size="8">z,top</tspan>' : 'M<tspan baseline-shift="sub" font-size="8">x,top</tspan>';
    const Mb = dir === 'x' ? 'M<tspan baseline-shift="sub" font-size="8">z,bot</tspan>' : 'M<tspan baseline-shift="sub" font-size="8">x,bot</tspan>';
    const Fb = dir === 'x' ? 'F<tspan baseline-shift="sub" font-size="8">x,bot</tspan>' : 'F<tspan baseline-shift="sub" font-size="8">z,bot</tspan>';
    let hatch = '';
    for (let hx = x0 + 12; hx < x0 + 290; hx += 9) {
      if (hx > cx - 104 && hx < cx + 104) continue;
      hatch += `<line class="ground-hatch" x1="${hx}" y1="${groundY}" x2="${hx - 5}" y2="${groundY + 7}"/>`;
    }
    const piles = isPile ? [-86, 86].map(dx => `<rect class="pile-leg" x="${cx + dx - 5}" y="${footBot - 6}" width="10" height="34"/>
        <polygon class="pile-leg" points="${cx + dx - 5},${footBot + 28} ${cx + dx + 5},${footBot + 28} ${cx + dx},${footBot + 36}"/>`).join('') : '';
    return `
      <text class="panel-title" x="${x0 + 6}" y="14">${dir === 'x' ? 'X-direction' : 'Z-direction'}</text>
      <line class="ground-line" x1="${x0 + 6}" y1="${groundY}" x2="${x0 + 294}" y2="${groundY}"/>${hatch}
      <rect class="outline-footing" x="${cx - 100}" y="${footTop}" width="200" height="${footBot - footTop}"/>
      ${hasPed ? `<rect class="outline-pedestal" x="${cx - 26}" y="${topY}" width="52" height="${footTop - topY}"/>` : ''}
      ${piles}
      <!-- top loads (red) -->
      <line class="load-line" x1="${cx}" y1="${topY - 34}" x2="${cx}" y2="${topY - 3}" marker-end="url(#ltr-arrow-load)"/>
      <text class="load-text" x="${cx - 6}" y="${topY - 24}" text-anchor="end">P<tspan baseline-shift="sub" font-size="8">top</tspan></text>
      <line class="load-line" x1="${cx - 62}" y1="${topY}" x2="${cx - 3}" y2="${topY}" marker-end="url(#ltr-arrow-load)"/>
      <text class="load-text" x="${cx - 62}" y="${topY - 6}">${F}</text>
      <path class="ltr-arc-load" d="M ${cx + 14} ${topY + 10} A 14 14 0 1 0 ${cx + 14} ${topY - 10}" marker-end="url(#ltr-arrow-load)"/>
      <text class="load-text" x="${cx + 20}" y="${topY - 22}">${Mt}</text>
      <circle class="ltr-point" cx="${cx}" cy="${topY}" r="2.5"/>
      <!-- self-weight ΔW — on the centerline, stopping above the M,bot arc (its top is at footBot - 14) -->
      <line class="ltr-w" x1="${cx}" y1="${footTop + 3}" x2="${cx}" y2="${footBot - 17}" marker-end="url(#ltr-arrow-w)"/>
      <text class="ltr-w-text" x="${cx + 6}" y="${footTop + 17}">ΔW</text>
      <!-- bottom-center resultant (accent) -->
      <circle class="ltr-point" cx="${cx}" cy="${footBot}" r="2.5"/>
      <line class="ltr-res" x1="${cx}" y1="${footBot + 3}" x2="${cx}" y2="${footBot + 36}" marker-end="url(#ltr-arrow-res)"/>
      <text class="ltr-res-text" x="${cx - 6}" y="${footBot + 34}" text-anchor="end">P<tspan baseline-shift="sub" font-size="8">bot</tspan></text>
      <line class="ltr-res" x1="${cx - 62}" y1="${footBot}" x2="${cx - 3}" y2="${footBot}" marker-end="url(#ltr-arrow-res)"/>
      <text class="ltr-res-text" x="${cx - 62}" y="${footBot + 17}">${Fb}</text>
      <path class="ltr-res" d="M ${cx + 14} ${footBot + 10} A 14 14 0 1 0 ${cx + 14} ${footBot - 10}" marker-end="url(#ltr-arrow-res)"/>
      <text class="ltr-res-text" x="${cx + 20}" y="${footBot + 30}">${Mb}</text>
      <!-- lever arm Δh -->
      <line class="centerline" x1="${cx + (hasPed ? 26 : 100)}" y1="${topY}" x2="${cx + 122}" y2="${topY}"/>
      <line class="centerline" x1="${cx + 100}" y1="${footBot}" x2="${cx + 122}" y2="${footBot}"/>
      <line class="dim" x1="${cx + 118}" y1="${topY}" x2="${cx + 118}" y2="${footBot}" marker-start="url(#ltr-arrow-dim)" marker-end="url(#ltr-arrow-dim)"/>
      <text class="dim-text" x="${cx + 122}" y="${(topY + footBot) / 2 + 4}">Δh</text>`;
  };
  return `<svg class="fdn-diagram" viewBox="0 0 600 212" xmlns="http://www.w3.org/2000/svg" role="img"
      aria-label="Load transfer from top of ${hasPed ? 'pedestal' : cWord} to bottom center of ${cWord}: Δh = ${fmt(dh,3)} m, ΔW = ${fmt(dW,2)} kN">
    <defs>
      <marker id="ltr-arrow-load" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="var(--fail)"/></marker>
      <marker id="ltr-arrow-res" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="var(--accent)"/></marker>
      <marker id="ltr-arrow-w" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="var(--caution)"/></marker>
      <marker id="ltr-arrow-dim" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto-start-reverse"><path d="M0,0 L7,3.5 L0,7 z" fill="var(--ink-soft)"/></marker>
    </defs>
    ${panel(0, 'x')}
    <line class="divider" x1="300" y1="6" x2="300" y2="206"/>
    ${panel(300, 'z')}
  </svg>`;
}
