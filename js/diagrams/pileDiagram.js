import { fmt } from '../core/format.js?v=20261014a';

// Pile group plan: pile cap outline (Bf x Lf from "02", centred on the origin), piles at true diameter with their number
// inside and the axial force beside them, optional coordinate rulers (x along the top, y along the left, with dotted
// guides from the piles), optional dimensions (minimum spacing and minimum edge distance, drawn in the margins so they
// never cross the piles), and the group centroid / load point (their offset is what produces torsion).
// Pure SVG string builder (no DOM access) — values in, markup out.
// pileForces: [{ i, x, y, F }] or null (no forces yet -> pile numbers only).
// info: { at: {x,y} load point, spacingPair: [i, j] | null, spacing: m | null, edgePile: k | null, edge: m | null }
// opts: { coords, dims, marks } — each defaults to true (shown).
export function pileDiagramSVG(piles, capB, capL, D, pileForces, info = {}, opts = {}) {
  const showCoords = opts.coords !== false, showDims = opts.dims !== false, showMarks = opts.marks !== false;
  const hasCap = capB > 0 && capL > 0;
  const n = piles.length;
  const xs = piles.map(p => p.x), ys = piles.map(p => p.y);
  let minX = Math.min(...xs) - 0.25, maxX = Math.max(...xs) + 0.25;
  let minY = Math.min(...ys) - 0.25, maxY = Math.max(...ys) + 0.25;
  if (hasCap) {
    minX = Math.min(minX, -capB / 2); maxX = Math.max(maxX, capB / 2);
    minY = Math.min(minY, -capL / 2); maxY = Math.max(maxY, capL / 2);
  }
  const w = Math.max(maxX - minX, 0.1), h = Math.max(maxY - minY, 0.1);
  const W = 640;
  const M = { l: showCoords ? 62 : 22, r: 74, t: showCoords ? 50 : 34, b: (showDims ? 62 : 24) + (showMarks ? 14 : 0) + (pileForces ? 14 : 0) };
  const plotW = W - M.l - M.r;
  const scale = Math.min(plotW / w, 330 / h);
  const H = Math.round(M.t + h * scale + M.b);
  const x0 = M.l + (plotW - w * scale) / 2;
  const toX = (x) => x0 + (x - minX) * scale;
  const toY = (y) => M.t + (maxY - y) * scale;
  const r = D > 0 ? Math.max(6, D / 2 * scale) : 12;
  const halo = 'paint-order:stroke;stroke:var(--panel);stroke-width:3px;stroke-linejoin:round;';
  const T = (x, y, s, anchor = 'middle', extra = '') => `<text class="dim-text" style="${halo}${extra}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}">${s}</text>`;
  const L = (x1, y1, x2, y2, style = '') => `<line class="dim" style="${style}" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
  const dotted = 'stroke-dasharray:2 3;opacity:0.7;';

  const capLeft = hasCap ? toX(-capB / 2) : toX(minX), capRight = hasCap ? toX(capB / 2) : toX(maxX);
  const capTop = hasCap ? toY(capL / 2) : toY(maxY), capBottom = hasCap ? toY(-capL / 2) : toY(minY);
  let out = '';
  if (hasCap) out += `<rect class="outline-footing" x="${capLeft.toFixed(1)}" y="${capTop.toFixed(1)}" width="${(capRight - capLeft).toFixed(1)}" height="${(capBottom - capTop).toFixed(1)}"/>`;
  // origin axes — light centre lines
  out += L(capLeft, toY(0), capRight, toY(0), 'stroke-dasharray:6 4;opacity:0.35;') + L(toX(0), capTop, toX(0), capBottom, 'stroke-dasharray:6 4;opacity:0.35;');

  // ---- coordinate rulers: x along the top, y along the left, dotted guides from the piles ----
  if (showCoords) {
    const uniq = (vals) => { const s = [...vals].sort((a, b) => a - b), o = []; s.forEach(v => { if (!o.length || Math.abs(v - o[o.length - 1]) > 0.005) o.push(v); }); return o; };
    let lastX = -1e9;
    uniq([...xs, 0]).forEach(xv => {
      const X = toX(xv);
      const col = piles.filter(p => Math.abs(p.x - xv) <= 0.005).sort((a, b) => b.y - a.y)[0]; // topmost pile in this column
      out += L(X, capTop - 5, X, capTop);
      if (col) out += L(X, capTop, X, toY(col.y) - r, dotted);
      if (X - lastX >= 34) { out += T(X, capTop - 9, fmt(xv, 2)); lastX = X; }
    });
    let lastY = -1e9;
    uniq([...ys, 0]).reverse().forEach(yv => {
      const Y = toY(yv);
      const row = piles.filter(p => Math.abs(p.y - yv) <= 0.005).sort((a, b) => a.x - b.x)[0]; // left-most pile in this row
      out += L(capLeft - 5, Y, capLeft, Y);
      if (row) out += L(capLeft, Y, toX(row.x) - r, Y, dotted);
      if (Y - lastY >= 14) { out += T(capLeft - 8, Y + 3.5, fmt(yv, 2), 'end'); lastY = Y; } // Y grows downward
    });
    out += T(capRight, capTop - 22, 'x (m)', 'end') + T(capLeft - 8, capTop - 6, 'z (m)', 'end');
  }

  // ---- dimensions in the margins ----
  if (showDims && info.spacingPair && info.spacing > 0) {
    const a = piles[info.spacingPair[0] - 1], b = piles[info.spacingPair[1] - 1];
    const label = `s = ${fmt(info.spacing, 2)} m${D > 0 ? ` (${fmt(info.spacing / D, 2)}D)` : ''}`;
    if (Math.abs(a.y - b.y) < 1e-6) {           // horizontal pair -> dimension line in the bottom margin
      const yl = capBottom + 34, xa = toX(a.x), xb = toX(b.x);
      out += L(xa, toY(a.y) + r, xa, yl + 4, dotted) + L(xb, toY(b.y) + r, xb, yl + 4, dotted);
      out += L(xa, yl, xb, yl, 'stroke-width:1.2;') + L(xa, yl - 4, xa, yl + 4) + L(xb, yl - 4, xb, yl + 4);
      out += T((xa + xb) / 2, yl - 5, label);
    } else if (Math.abs(a.x - b.x) < 1e-6) {    // vertical pair -> dimension line in the right margin
      const xl = capRight + 40, ya = toY(a.y), yb = toY(b.y);
      out += L(capRight, ya, xl + 4, ya, dotted) + L(capRight, yb, xl + 4, yb, dotted);
      out += L(xl, ya, xl, yb, 'stroke-width:1.2;') + L(xl - 4, ya, xl + 4, ya) + L(xl - 4, yb, xl + 4, yb);
      out += T(xl + 6, (ya + yb) / 2 + 3, label, 'start');
    } else {                                     // diagonal pair -> straight line between the centres
      out += L(toX(a.x), toY(a.y), toX(b.x), toY(b.y), 'stroke-width:1.2;') + T((toX(a.x) + toX(b.x)) / 2, (toY(a.y) + toY(b.y)) / 2 - 5, label);
    }
  }
  if (showDims && hasCap && info.edgePile) {
    const p = piles[info.edgePile - 1];
    const ex = capB / 2 - Math.abs(p.x), ey = capL / 2 - Math.abs(p.y);
    const label = `e = ${fmt(info.edge, 2)} m${D > 0 ? ` (${fmt(info.edge / D, 2)}D)` : ''}`;
    const cx = toX(p.x), cy = toY(p.y);
    if (ex <= ey) {                              // nearest edge is left / right
      const left = p.x < 0, X = left ? capLeft : capRight;
      out += L(cx + (left ? -r : r), cy, X, cy, 'stroke-width:1.4;');
      // on the left the y-ruler label sits at the same height, so lift the edge label clear of it
      out += left ? T(capLeft - 8, cy - (showCoords ? 15 : 6), label, 'end') : T(capRight + 8, cy + 3.5, label, 'start');
    } else {                                     // nearest edge is top / bottom
      const top = p.y > 0, Y = top ? capTop : capBottom;
      out += L(cx, cy + (top ? -r : r), cx, Y, 'stroke-width:1.4;');
      out += top ? T(cx, capTop - 22, label) : T(cx, capBottom + 14, label);
    }
  }

  // ---- piles ----
  const forceOf = (i) => (pileForces || []).find(pf => pf.i === i);
  piles.forEach((p, k) => {
    const cx = toX(p.x), cy = toY(p.y), f = forceOf(k + 1);
    const tension = f && f.F < 0, failed = f && f.fail;
    // blue = compression, yellow = uplift within capacity, red = a check on this pile exceeds capacity (f.fail, UC > 1)
    const cls = failed ? 'pile-fail' : (tension ? 'pile-uplift' : 'pile-compression');
    const tip = f ? `Pile ${k + 1}: F = ${fmt(f.F, 1)} kN${f.ucAxial !== undefined ? `, axial UC = ${fmt(f.ucAxial, 3)}` : ''}${f.ucLat !== undefined ? `, lateral UC = ${fmt(f.ucLat, 3)}` : ''}${failed ? ' — EXCEEDS CAPACITY' : ''}` : `Pile ${k + 1}`;
    out += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" class="${cls}"><title>${tip}</title></circle>`;
    if (r >= 9) out += `<text class="dim-text" style="font-weight:600;" x="${cx.toFixed(1)}" y="${(cy + 3.5).toFixed(1)}" text-anchor="middle">${k + 1}</text>`;
    else out += T(cx, cy - r - 3, `#${k + 1}`);
    // force beside the pile, on the side facing the cap centre so it never runs over the cap edge
    const fStyle = failed ? 'fill:var(--fail);font-weight:700;' : (tension ? 'fill:var(--caution);font-weight:600;' : '');
    if (f) out += p.x > 0.001 ? T(cx - r - 4, cy + 4, `${fmt(f.F, 0)} kN`, 'end', fStyle)
      : T(cx + r + 4, cy + 4, `${fmt(f.F, 0)} kN`, 'start', fStyle);
  });

  // ---- centroid and load point ----
  if (showMarks) {
    const cgx = xs.reduce((s, v) => s + v, 0) / n, cgy = ys.reduce((s, v) => s + v, 0) / n;
    const at = info.at || { x: 0, y: 0 };
    const off = Math.hypot(at.x - cgx, at.y - cgy) > 1e-6;
    if (off) out += `<line style="stroke:var(--fail);stroke-width:1.2;" x1="${toX(cgx).toFixed(1)}" y1="${toY(cgy).toFixed(1)}" x2="${toX(at.x).toFixed(1)}" y2="${toY(at.y).toFixed(1)}"/>`;
    out += `<path d="M${(toX(cgx) - 6).toFixed(1)} ${toY(cgy).toFixed(1)}h12M${toX(cgx).toFixed(1)} ${(toY(cgy) - 6).toFixed(1)}v12" style="stroke:var(--ink);stroke-width:1.8;fill:none;"/>`;
    out += `<path d="M${(toX(at.x) - 5).toFixed(1)} ${(toY(at.y) - 5).toFixed(1)}l10 10M${(toX(at.x) + 5).toFixed(1)} ${(toY(at.y) - 5).toFixed(1)}l-10 10" style="stroke:var(--fail);stroke-width:2;fill:none;"/>`;
    const ly = H - 8 - (pileForces ? 14 : 0); // the colour legend takes the bottom line when forces are shown
    out += `<path d="M${M.l} ${ly - 3}h8M${M.l + 4} ${ly - 7}v8" style="stroke:var(--ink);stroke-width:1.5;fill:none;"/>` + T(M.l + 12, ly, off ? 'CG (centre of rigidity)' : 'CG = load point', 'start');
    const lx = M.l + (off ? 158 : 120);
    if (off) out += `<path d="M${lx} ${ly - 7}l8 8M${lx + 8} ${ly - 7}l-8 8" style="stroke:var(--fail);stroke-width:1.8;fill:none;"/>` + T(lx + 12, ly, `load point (pedestal), a = (${fmt(at.x - cgx, 2)}, ${fmt(at.y - cgy, 2)}) m`, 'start');
  }

  // ---- colour legend (only when forces are drawn) ----
  if (pileForces) {
    const ly = H - 8;
    let lx = M.l;
    [['pile-compression', 'compression'], ['pile-uplift', 'tension (uplift)'], ['pile-fail', 'exceeds capacity (UC > 1)']].forEach(([cls, txt]) => {
      out += `<circle cx="${(lx + 5).toFixed(1)}" cy="${(ly - 3.5).toFixed(1)}" r="5" class="${cls}"/>` + T(lx + 14, ly, txt, 'start');
      lx += 14 + txt.length * 6.2 + 18;
    });
  }

  // (the panel-title style upper-cases text, so no unit letter here — the rulers and dimensions carry "m")
  const title = `Plan View — Pile Group Axial Force${hasCap ? ` — cap Bf × Lf = ${fmt(capB, 2)} × ${fmt(capL, 2)}` : ''} — origin at cap centre`;
  return `<svg class="fdn-diagram" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <text class="panel-title" x="${M.l > 30 ? 20 : 12}" y="16">${title}</text>
    ${out}
  </svg>`;
}
