import { fmt } from '../core/format.js?v=20261015h';

// 02 — Foundation Dimension: isometric 2.5D view for the Focus Canvas viewport (js/tabs/foundSizeFocus.js).
// Pure SVG string builder (no DOM access) — geometry in, markup out. Boxes are drawn as three visible <polygon> faces
// (top, +x side, +z side); nothing here feeds a calculation. Model axes: x along Bf, z along Lf, y vertical, origin at
// the footing / pile cap centre on the ground line (y = 0). Piles are drawn as stubs (length not to scale).
const C30 = Math.cos(Math.PI / 6), S30 = Math.sin(Math.PI / 6);
const proj = (x, y, z) => [(x - z) * C30, (x + z) * S30 - y];

export function foundIsoDiagramSVG({ Bf, Lf, Hf, Df, hasPed, Bp, Lp, Gp, OffX, OffZ, groutT = 0, isPile = false, piles = [], D = 0, hEmbed = 0 }) {
  const W = 640, H = 400, PAD = 34;
  const shapes = [];   // { pts: [[X, Y]...], cls }
  const texts = [];    // { at: [X, Y], txt, rot, anchor, dx, dy }
  const poly = (pts, cls) => shapes.push({ pts: pts.map((p) => proj(...p)), cls });
  // One box as its three visible faces; the viewer looks from +x, +z, above.
  const box = (x0, x1, z0, z1, y0, y1, kind) => {
    if (!(y1 > y0)) return;
    poly([[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], `iso-face iso-${kind} iso-sx`);
    poly([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], `iso-face iso-${kind} iso-sz`);
    poly([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], `iso-face iso-${kind} iso-top`);
  };
  // A box crossing the ground (y = 0) is drawn in two parts: below ground before the translucent ground plane, above after it.
  const below = [], above = [];
  const splitBox = (x0, x1, z0, z1, y0, y1, kind) => {
    if (y0 < 0) below.push([x0, x1, z0, z1, y0, Math.min(y1, 0), kind]);
    if (y1 > 0) above.push([x0, x1, z0, z1, Math.max(y0, 0), y1, kind]);
  };
  const fx0 = -Bf / 2, fx1 = Bf / 2, fz0 = -Lf / 2, fz1 = Lf / 2;
  const fy0 = -Df, fy1 = -Df + Hf;
  // ---- piles (behind / under everything): far ones first ----
  if (isPile && piles.length) {
    const r = Math.max(D > 0 ? D : 0.3, 0.05) / 2;
    const stub = Math.min(1.5, 0.6 * Math.max(Bf, Lf));
    const rx = r * Math.SQRT2 * C30, ry = r * Math.SQRT2 * S30;
    [...piles].sort((a, b) => (a.x + a.y) - (b.x + b.y)).forEach((p) => {
      const top = proj(p.x, fy0 + Math.max(hEmbed, 0), p.y), bot = proj(p.x, fy0 - stub, p.y);
      shapes.push({ pts: [[top[0] - rx, top[1]], [top[0] + rx, top[1]], [bot[0] + rx, bot[1]], [bot[0] - rx, bot[1]]], cls: 'iso-face iso-pile' });
      shapes.push({ ellipse: { cx: bot[0], cy: bot[1], rx, ry }, cls: 'iso-face iso-pile' });
    });
  }
  splitBox(fx0, fx1, fz0, fz1, fy0, fy1, 'footing');
  let topY = fy1;
  if (hasPed) {
    const px0 = OffX - Bp / 2, px1 = OffX + Bp / 2, pz0 = OffZ - Lp / 2, pz1 = OffZ + Lp / 2;
    splitBox(px0, px1, pz0, pz1, fy1, Gp, 'pedestal');
    if (groutT > 0) splitBox(px0, px1, pz0, pz1, Gp, Gp + groutT, 'grout');
    topY = Gp + groutT;
  } else if (groutT > 0) {
    splitBox(fx0, fx1, fz0, fz1, fy1, fy1 + groutT, 'grout');
    topY = fy1 + groutT;
  }
  below.forEach((b) => box(...b));
  // ---- ground plane at y = 0 (translucent, so the buried part stays visible) ----
  // Back edges: margin m. Front edges (+x, +z) reach further, so the plane's front corner lands below the buried footing
  // (its bottom sits Df under the plane and projects lower on screen) instead of cutting across it.
  const m = 0.35 * Math.max(Bf, Lf);
  const mf = Math.max(m, Df + 0.25 * Math.max(Bf, Lf));
  poly([[fx0 - m, 0, fz0 - m], [fx1 + mf, 0, fz0 - m], [fx1 + mf, 0, fz1 + mf], [fx0 - m, 0, fz1 + mf]], 'iso-ground');
  above.forEach((b) => box(...b));
  // ---- labels (along the iso axes: x edges at +30°, z edges at -30°) ----
  // Bf / Lf sit just outside their bottom edges (offset along the edge's outward normal on screen); the heights go on
  // the right-most vertical edges, clear of the front corner where Bf and Lf meet.
  texts.push({ at: proj(0, fy0, fz1), txt: `Bf = ${fmt(Bf, 2)} m`, rot: 30, dx: -8, dy: 15 });
  texts.push({ at: proj(fx1, fy0, 0), txt: `Lf = ${fmt(Lf, 2)} m`, rot: -30, dx: 8, dy: 15 });
  texts.push({ at: proj(fx1, (fy0 + fy1) / 2, fz0), txt: `Hf = ${fmt(Hf, 2)} m`, anchor: 'start', dx: 10, dy: 4 });
  if (hasPed) {
    const Hp = topY - fy1;
    texts.push({ at: proj(OffX + Bp / 2, (fy1 + topY) / 2, OffZ - Lp / 2), txt: `Hp = ${fmt(Hp, 3)} m`, anchor: 'start', dx: 10, dy: 4 });
  }
  texts.push({ at: proj(fx0 - m, 0, fz1 + mf), txt: 'GL ±0.000', anchor: 'end', dx: -6 });
  if (isPile && piles.length) texts.push({ at: proj(fx0, fy0 - Math.min(1.5, 0.6 * Math.max(Bf, Lf)), fz1), txt: 'piles (length not to scale)', anchor: 'end', dx: -6, dy: 4 });
  // ---- fit to the viewBox ----
  const all = shapes.flatMap((s) => (s.pts ? s.pts : [[s.ellipse.cx - s.ellipse.rx, s.ellipse.cy + s.ellipse.ry], [s.ellipse.cx + s.ellipse.rx, s.ellipse.cy + s.ellipse.ry]]));
  const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const k = Math.min((W - 2 * PAD - 150) / Math.max(maxX - minX, 1e-6), (H - 2 * PAD - 30) / Math.max(maxY - minY, 1e-6));
  const ox = (W - (maxX - minX) * k) / 2 - minX * k, oy = PAD + 14 - minY * k;
  const T = ([X, Y]) => [X * k + ox, Y * k + oy];
  const f = (n) => n.toFixed(1);
  const body = shapes.map((s) => {
    if (s.ellipse) { const [cx, cy] = T([s.ellipse.cx, s.ellipse.cy]); return `<ellipse class="${s.cls}" cx="${f(cx)}" cy="${f(cy)}" rx="${f(s.ellipse.rx * k)}" ry="${f(s.ellipse.ry * k)}"/>`; }
    return `<polygon class="${s.cls}" points="${s.pts.map((p) => T(p).map(f).join(',')).join(' ')}"/>`;
  }).join('');
  const HALO = 'paint-order:stroke;stroke:var(--panel);stroke-width:3px;stroke-linejoin:round;';
  const labels = texts.map((t) => {
    const [x, y] = T(t.at);
    const X = x + (t.dx || 0), Y = y + (t.dy || 0);
    return `<text class="dim-text" style="${HALO}" x="${f(X)}" y="${f(Y)}" text-anchor="${t.anchor || 'middle'}"${t.rot ? ` transform="rotate(${t.rot} ${f(X)} ${f(Y)})"` : ''}>${t.txt}</text>`;
  }).join('');
  // Axis triad (x along Bf, z along Lf, y up) in the bottom-left corner.
  const a0 = [40, H - 30], L = 22;
  const ax = (dx, dy, lbl) => `<line class="iso-axis" x1="${a0[0]}" y1="${a0[1]}" x2="${f(a0[0] + dx * L)}" y2="${f(a0[1] + dy * L)}"/><text class="dim-text" x="${f(a0[0] + dx * (L + 8))}" y="${f(a0[1] + dy * (L + 8) + 3)}" text-anchor="middle">${lbl}</text>`;
  return `<svg id="svg-iso" class="fdn-diagram cad-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Isometric view of the foundation">
    <text class="panel-title" x="16" y="22">Isometric 2.5D — schematic</text>
    ${body}${labels}
    <g>${ax(C30, S30, 'x')}${ax(-C30, S30, 'z')}${ax(0, -1, 'y')}</g>
  </svg>`;
}
