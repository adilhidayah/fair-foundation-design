// 00 — Equipment Setup: schematic elevation of the selected equipment on its typical foundation.
// Pure SVG string builder (no DOM access) — equipment type in, markup out. Symbols only, not to scale;
// no dimension here is read by any calculation. Reuses the .fdn-diagram classes (css/app.css) so it
// follows the same theme as the other diagrams. Axes: x horizontal, y vertical.

const GROUND_Y = 150;

// Ground line with soil hatch, skipping the spans occupied by foundation concrete ([x1, x2] pairs).
function ground(skip) {
  let hatch = '';
  for (let hx = 14; hx < 350; hx += 9) {
    if (skip.some(([a, b]) => hx > a - 2 && hx < b + 7)) continue;
    hatch += `<line class="ground-hatch" x1="${hx}" y1="${GROUND_Y}" x2="${hx - 5}" y2="${GROUND_Y + 7}"/>`;
  }
  return `<line class="ground-line" x1="8" y1="${GROUND_Y}" x2="352" y2="${GROUND_Y}"/>${hatch}`;
}
const rect = (cls, x, y, w, h) => `<rect class="${cls}" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
// Footing (centre cx, width w) from top y to y + h, with a pedestal of width pw from topP down to the footing.
function pierFooting(cx, w, pw, topP, fTop = 165, fH = 25) {
  return rect('outline-footing', cx - w / 2, fTop, w, fH) + (pw ? rect('outline-pedestal', cx - pw / 2, topP, pw, fTop - topP) : '');
}
const label = (x, y, text, anchor = 'start') => `<text class="eq-label" x="${x}" y="${y}" text-anchor="${anchor}">${text}</text>`;
const axes = () => `<g class="eq-axes">
    <line x1="18" y1="206" x2="40" y2="206"/><polyline points="36,203 40,206 36,209"/>
    <line x1="18" y1="206" x2="18" y2="184"/><polyline points="15,188 18,184 21,188"/>
    <text class="eq-label" x="44" y="209">x</text><text class="eq-label" x="15" y="180">y</text></g>`;

const DRAW = {
  generic: () => {
    const cx = 180;
    return ground([[cx - 60, cx + 60]]) + pierFooting(cx, 120, 50, 128) +
      rect('eq-steel', cx - 7, 34, 14, 91) + rect('eq-steel', cx - 18, 125, 36, 3) +
      label(cx + 16, 60, 'Column') + label(cx, 204, 'Footing + pedestal', 'middle');
  },
  vertical_vessel: () => {
    const cx = 180;
    return ground([[cx - 70, cx + 70]]) + pierFooting(cx, 140, 90, 128) +
      `<path class="eq-shell" d="M${cx - 30},104 L${cx - 30},38 A30,12 0 0 1 ${cx + 30},38 L${cx + 30},104 Z"/>` +
      `<path class="eq-hidden" d="M${cx - 30},104 A30,10 0 0 0 ${cx + 30},104"/>` +
      rect('eq-shell', cx - 30, 104, 60, 24) +
      label(cx + 38, 70, 'Vessel / tower') + label(cx + 38, 120, 'Skirt') + label(cx, 204, 'Octagon pedestal + footing', 'middle');
  },
  horizontal_vessel: () => {
    const cx = 180, s = 60;
    const saddle = (x) => `<polygon class="eq-steel" points="${x - 16},128 ${x + 16},128 ${x + 10},108 ${x - 10},108"/>`;
    return ground([[cx - 105, cx + 105]]) + rect('outline-footing', cx - 105, 165, 210, 25) +
      rect('outline-pedestal', cx - s - 14, 128, 28, 37) + rect('outline-pedestal', cx + s - 14, 128, 28, 37) +
      saddle(cx - s) + saddle(cx + s) +
      `<path class="eq-shell" d="M${cx - 100},70 L${cx + 100},70 A14,20 0 0 1 ${cx + 100},110 L${cx - 100},110 A14,20 0 0 1 ${cx - 100},70 Z"/>` +
      `<line class="dim" x1="${cx - s}" y1="52" x2="${cx + s}" y2="52"/>` +
      `<line class="dim" x1="${cx - s}" y1="46" x2="${cx - s}" y2="68"/><line class="dim" x1="${cx + s}" y1="46" x2="${cx + s}" y2="68"/>` +
      `<text class="dim-text" x="${cx}" y="47" text-anchor="middle">Ls</text>` +
      label(cx + 108, 124, 'Saddle') + label(cx, 204, 'Piers + common footing', 'middle');
  },
  tank: () => {
    const cx = 180;
    return ground([[cx - 122, cx - 98], [cx + 98, cx + 122]]) +
      rect('outline-pedestal', cx - 120, 124, 16, 48) + rect('outline-pedestal', cx + 104, 124, 16, 48) +
      `<rect class="eq-fill" x="${cx - 104}" y="124" width="208" height="26"/>` +
      rect('eq-shell', cx - 110, 64, 220, 60) +
      `<polyline class="eq-shell" points="${cx - 110},64 ${cx},46 ${cx + 110},64"/>` +
      label(cx, 98, 'Storage tank', 'middle') + label(cx, 142, 'Compacted fill', 'middle') + label(cx, 204, 'Ringwall (API 650)', 'middle');
  },
  piperack: () => {
    const xs = [110, 250];
    const pipes = [128, 146, 164, 182, 200, 218, 236].map((x, i) => `<circle class="eq-pipe" cx="${x}" cy="${i % 2 ? 60 : 59}" r="${i % 3 ? 6 : 8}"/>`).join('');
    const pipes2 = [140, 162, 184, 206, 228].map((x) => `<circle class="eq-pipe" cx="${x}" cy="94" r="6"/>`).join('');
    return ground(xs.map((x) => [x - 36, x + 36])) + xs.map((x) => pierFooting(x, 72, 26, 128) + rect('eq-steel', x - 5, 40, 10, 88)).join('') +
      rect('eq-steel', 100, 67, 160, 6) + rect('eq-steel', 100, 100, 160, 6) + pipes + pipes2 +
      label(180, 32, 'Pipe rack bent (transverse)', 'middle') + label(180, 204, 'Pedestal + footing per column', 'middle');
  },
  pump: () => {
    const cx = 180;
    return ground([[cx - 100, cx + 100]]) + rect('outline-footing', cx - 100, 112, 200, 76) +
      rect('eq-steel', cx - 84, 106, 164, 6) +
      `<circle class="eq-shell" cx="${cx - 46}" cy="84" r="20"/>` + rect('eq-shell', cx - 52, 52, 12, 14) +
      rect('eq-steel', cx - 24, 80, 16, 8) + rect('eq-shell', cx - 8, 66, 74, 40) +
      label(cx - 46, 44, 'Pump', 'middle') + label(cx + 29, 60, 'Driver', 'middle') + label(cx, 204, 'Concrete block — mass ratio ≥ 3', 'middle');
  },
  pistonCompressor: () => {
    const cx = 180;
    return ground([[cx - 125, cx + 125]]) + rect('outline-footing', cx - 125, 108, 250, 84) +
      rect('eq-steel', cx - 116, 102, 232, 6) +
      rect('eq-shell', cx - 36, 60, 72, 42) + rect('eq-shell', cx - 104, 68, 68, 26) + rect('eq-shell', cx + 36, 68, 68, 26) +
      `<line class="centerline" x1="${cx - 112}" y1="81" x2="${cx + 112}" y2="81"/>` +
      label(cx, 52, 'Frame + crankshaft', 'middle') + label(cx - 70, 60, 'Cylinder', 'middle') + label(cx + 70, 60, 'Cylinder', 'middle') +
      label(cx, 206, 'Heavy block — mass ratio ≥ 5', 'middle');
  },
  skid: () => {
    const cx = 180;
    const bolts = [cx - 98, cx - 30, cx + 30, cx + 98].map((x) => `<line class="eq-bolt" x1="${x}" y1="128" x2="${x}" y2="160"/>`).join('');
    return ground([[cx - 122, cx + 122]]) + rect('outline-footing', cx - 122, 136, 244, 28) +
      rect('eq-steel', cx - 108, 128, 216, 8) + bolts +
      rect('eq-shell', cx - 96, 74, 74, 54) +
      `<path class="eq-shell" d="M${cx},96 L${cx + 78},96 A10,16 0 0 1 ${cx + 78},128 L${cx},128 A10,16 0 0 1 ${cx},96 Z"/>` +
      label(cx - 59, 66, 'Package', 'middle') + label(cx + 40, 88, 'Vessel', 'middle') +
      label(cx, 204, 'Slab = skid footprint + edge; anchor bolts', 'middle');
  }
};

export function equipmentDiagramSVG(eqType) {
  const draw = DRAW[eqType] || DRAW.generic;
  return `<svg class="fdn-diagram eq-diagram" viewBox="0 0 360 216" role="img" aria-label="Schematic elevation of the equipment and its foundation">
    <text class="panel-title" x="10" y="16">Elevation — schematic, not to scale</text>
    ${draw()}${axes()}
  </svg>`;
}
