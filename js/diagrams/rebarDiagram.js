import { fmt } from '../core/format.js?v=20261027merge1';

// Reinforcement drawings for Section 5 — pure SVG string builders (no DOM access): values in, markup out.
//   pedestalSectionSVG      5A  pedestal cross-section with the bars of the P-M design
//   pileCapRebarPlanSVG     5B  plan of the pile cap: piles, pedestal and the bar mats (bottom / top, x / z)
//   pileCapRebarSectionSVG  5B  section through the pile cap: bar layers, cover, thickness, pedestal and pile stubs
// The drawings show exactly what was designed (counts, spacing, cover); nothing is recomputed here except geometry.

const HALO = 'paint-order:stroke;stroke:var(--panel);stroke-width:3px;stroke-linejoin:round;';
const txt = (x, y, s, anchor = 'middle', extra = '') => `<text class="dim-text" style="${HALO}${extra}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}">${s}</text>`;
const ln = (x1, y1, x2, y2, style = '') => `<line class="dim" style="${style}" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
const title = (s) => `<text class="panel-title" x="12" y="16">${s}</text>`;
const svg = (W, H, body) => `<svg class="fdn-diagram" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;

// Bar-layer styles shared by the plan, the section and the legend.
const LAYER = {
  xb: { name: 'x-direction bottom', stroke: 'var(--accent)', dash: '', fill: 'var(--accent)' },
  yb: { name: 'z-direction bottom', stroke: 'var(--pass)', dash: '', fill: 'var(--pass)' },
  xt: { name: 'x-direction top', stroke: 'var(--caution)', dash: '7 3', fill: 'var(--caution)' },
  yt: { name: 'z-direction top', stroke: 'var(--ink-soft)', dash: '2 3', fill: 'var(--ink-soft)' }
};

// ---------------------------------------------------------------------------------------------------------------
// 5A — pedestal cross-section. Bp (bending direction, horizontal here) x Lp (vertical), all in mm. The design model puts
// n bars on each of the two faces perpendicular to the bending, at d' (to the bar centroid) from the face, spread over Lp.
export function pedestalSectionSVG({ Bp, Lp, dPrime, barDia, n, Ast, rho }) {
  const W = 640, M = { l: 78, r: 96, t: 44, b: 66 + 6 * 15 + 26 }; // the schedule is written below the section
  const plotW = W - M.l - M.r;
  const scale = Math.min(plotW / Bp, 300 / Lp); // px per mm
  const w = Bp * scale, h = Lp * scale;
  const x0 = M.l + (plotW - w) / 2, y0 = M.t;
  const H = Math.round(y0 + h + M.b);
  const rBar = Math.max(3.2, barDia / 2 * scale);
  const xs = [x0 + dPrime * scale, x0 + w - dPrime * scale];
  const ys = n <= 1 ? [y0 + h / 2] : Array.from({ length: n }, (_, k) => y0 + dPrime * scale + k * (h - 2 * dPrime * scale) / (n - 1));
  const spacing = n > 1 ? (Lp - 2 * dPrime) / (n - 1) : null;
  const clear = spacing === null ? null : spacing - barDia;
  const minClear = Math.max(1.5 * barDia, 40); // ACI 318M-19 §25.2.3 — columns / pedestals: max(1.5 db, 40 mm)
  const clearOk = clear === null || clear >= minClear - 1e-9;
  let out = title('Pedestal cross-section — reinforcement as designed in the P-M check');
  out += `<rect class="outline-footing" x="${x0.toFixed(1)}" y="${y0.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}"/>`;
  // bars
  xs.forEach(x => ys.forEach(y => { out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rBar.toFixed(1)}" style="fill:var(--ink);stroke:var(--panel);stroke-width:0.8;"/>`; }));
  // dimensions: Bp below, Lp left, d' above, bar spacing on the right
  const yb = y0 + h + 24;
  out += ln(x0, yb, x0 + w, yb, 'stroke-width:1.2;') + ln(x0, yb - 4, x0, yb + 4) + ln(x0 + w, yb - 4, x0 + w, yb + 4) + ln(x0, y0 + h, x0, yb + 4, 'stroke-dasharray:2 3;opacity:0.6;') + ln(x0 + w, y0 + h, x0 + w, yb + 4, 'stroke-dasharray:2 3;opacity:0.6;');
  out += txt(x0 + w / 2, yb + 15, `B<tspan baseline-shift="sub" font-size="8">p</tspan> = ${fmt(Bp, 0)} mm (bending direction)`);
  const xl = x0 - 24;
  out += ln(xl, y0, xl, y0 + h, 'stroke-width:1.2;') + ln(xl - 4, y0, xl + 4, y0) + ln(xl - 4, y0 + h, xl + 4, y0 + h);
  out += txt(xl - 6, y0 + h / 2 + 3.5, `L<tspan baseline-shift="sub" font-size="8">p</tspan> = ${fmt(Lp, 0)}`, 'end');
  const yc = y0 - 14;
  out += ln(x0, yc, xs[0], yc, 'stroke-width:1.2;') + ln(x0, yc - 4, x0, yc + 4) + ln(xs[0], yc - 4, xs[0], yc + 4);
  out += txt(xs[0] + 4, yc - 4, `d′ = ${fmt(dPrime, 0)} (to bar centroid)`, 'start');
  if (spacing !== null) {
    const xd = x0 + w + 14;
    out += ln(xd, ys[0], xd, ys[1], 'stroke-width:1.2;') + ln(xd - 4, ys[0], xd + 4, ys[0]) + ln(xd - 4, ys[1], xd + 4, ys[1]);
    out += txt(xd + 8, (ys[0] + ys[1]) / 2 + 3.5, `s = ${fmt(spacing, 0)} c/c`, 'start');
  }
  // schedule (below the dimension line)
  const px = M.l - 30, py = yb + 40;
  const rows = [`2 faces × ${n} = ${2 * n} bars D${fmt(barDia, 0)}`, `A<tspan baseline-shift="sub" font-size="8">st</tspan> = ${fmt(Ast, 0)} mm²`, `ρ = ${fmt(rho * 100, 2)} %  (limits 1.0–8.0 %)`,
    spacing === null ? 'single bar per face' : `clear spacing = ${fmt(clear, 0)} mm`,
    spacing === null ? '' : `min. clear = max(1.5·d<tspan baseline-shift="sub" font-size="8">b</tspan>, 40) = ${fmt(minClear, 0)} mm`];
  rows.forEach((s, i) => { if (s) out += `<text class="dim-text" x="${px}" y="${py + i * 15}" text-anchor="start">${s}</text>`; });
  out += `<text class="dim-text" x="${px}" y="${py + 5 * 15 + 2}" text-anchor="start" style="font-weight:700;fill:${clearOk ? 'var(--pass)' : 'var(--fail)'};">${clearOk ? 'clear spacing OK (ACI 318M-19 §25.2.3)' : 'CLEAR SPACING TOO SMALL — increase the pedestal or reduce the bars'}</text>`;
  out += `<text class="dim-text" x="${M.l - 30}" y="${H - 22}" text-anchor="start" style="opacity:0.85;">Bars as modelled: n per face on the two faces ⟂ bending.</text>`
    + `<text class="dim-text" x="${M.l - 30}" y="${H - 8}" text-anchor="start" style="opacity:0.85;">Side bars and ties: per detailing (not designed here).</text>`;
  return svg(W, H, out);
}

// ---------------------------------------------------------------------------------------------------------------
// Legend rows: swatch + text for each layer that exists.
function legend(layers, x, y0) {
  let out = '';
  Object.keys(LAYER).filter(k => layers[k]).forEach((k, i) => {
    const y = y0 + i * 15, L = LAYER[k];
    out += `<line x1="${x}" y1="${y - 3.5}" x2="${x + 26}" y2="${y - 3.5}" style="stroke:${L.stroke};stroke-width:2.2;${L.dash ? `stroke-dasharray:${L.dash};` : ''}"/>`;
    out += `<text class="dim-text" x="${x + 34}" y="${y}" text-anchor="start">${L.name}: ${layers[k].label}</text>`;
  });
  return out;
}

// 5B plan. Bf, Lf in m; cc, db in mm; piles [{x,y}] in m (origin = cap centre); D pile diameter in m;
// ped = { x, y, Bp, Lp } (m, mm) or null; layers = { xb, yb, xt, yt } each { n, label } or null (bars are spread at b / (n + 1)).
export function pileCapRebarPlanSVG({ Bf, Lf, cc, db, piles, D, ped, layers, name = 'Pile cap' }) {
  const W = 640, nLeg = Object.keys(LAYER).filter(k => layers[k]).length;
  const M = { l: 28, r: 28, t: 34, b: 30 + nLeg * 15 };
  const scale = Math.min((W - M.l - M.r) / Bf, 300 / Lf);
  const w = Bf * scale, h = Lf * scale;
  const x0 = M.l + (W - M.l - M.r - w) / 2, y0 = M.t;
  const H = Math.round(y0 + h + M.b);
  const toX = (x) => x0 + (x + Bf / 2) * scale, toY = (y) => y0 + (Lf / 2 - y) * scale;
  const ccPx = cc / 1000 * scale;
  // (the panel-title style upper-cases text: no unit letters or subscripts in the title — the dimensions carry the units)
  let out = title(`${name} reinforcement — plan, ${name === 'Pile cap' ? 'cap' : 'footing'} Bf × Lf = ${fmt(Bf, 2)} × ${fmt(Lf, 2)}`);
  out += `<rect class="outline-footing" x="${x0.toFixed(1)}" y="${y0.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}"/>`;
  // piles (dashed, under the bars) and pedestal
  const r = D > 0 ? Math.max(5, D / 2 * scale) : 9;
  piles.forEach((p, k) => { out += `<circle cx="${toX(p.x).toFixed(1)}" cy="${toY(p.y).toFixed(1)}" r="${r.toFixed(1)}" style="fill:none;stroke:var(--ink-soft);stroke-width:1.2;stroke-dasharray:4 3;"/>` + txt(toX(p.x), toY(p.y) + 3.5, String(k + 1), 'middle', 'opacity:0.8;'); });
  // ped: one pedestal / load point, or an array of them (several load points on the footing — labelled by number)
  (Array.isArray(ped) ? ped : [ped]).forEach((pd, k, all) => {
    if (!(pd && pd.Bp > 0 && pd.Lp > 0)) return;
    const pw = pd.Bp / 1000 * scale, ph = pd.Lp / 1000 * scale;
    out += `<rect class="outline-pedestal" x="${(toX(pd.x) - pw / 2).toFixed(1)}" y="${(toY(pd.y) - ph / 2).toFixed(1)}" width="${pw.toFixed(1)}" height="${ph.toFixed(1)}" style="fill-opacity:0.35;"/>`;
    out += txt(toX(pd.x), toY(pd.y) + 3.5, Array.isArray(ped) ? `point ${k + 1}` : 'pedestal', 'middle', 'font-weight:600;');
  });
  // bar mats — bars along x are spread across Lf, bars along z across Bf (positions b/(n+1), as reported in the schedule)
  // (the top mat is drawn 3 px off the bottom mat so the two stay distinguishable in plan)
  const bar = (k, kind, off = 0) => {
    const L = LAYER[kind], nn = layers[kind].n;
    let s = '';
    for (let i = 1; i <= nn; i++) {
      const f = i / (nn + 1);
      s += (k === 'x')
        ? `<line x1="${(x0 + ccPx).toFixed(1)}" y1="${(y0 + f * h + off).toFixed(1)}" x2="${(x0 + w - ccPx).toFixed(1)}" y2="${(y0 + f * h + off).toFixed(1)}" style="stroke:${L.stroke};stroke-width:1.5;${L.dash ? `stroke-dasharray:${L.dash};` : ''}opacity:0.9;"/>`
        : `<line x1="${(x0 + f * w + off).toFixed(1)}" y1="${(y0 + ccPx).toFixed(1)}" x2="${(x0 + f * w + off).toFixed(1)}" y2="${(y0 + h - ccPx).toFixed(1)}" style="stroke:${L.stroke};stroke-width:1.5;${L.dash ? `stroke-dasharray:${L.dash};` : ''}opacity:0.9;"/>`;
    }
    return s;
  };
  if (layers.yb) out += bar('y', 'yb');
  if (layers.xb) out += bar('x', 'xb');
  if (layers.yt) out += bar('y', 'yt', 3.5);
  if (layers.xt) out += bar('x', 'xt', 3.5);
  // axes
  out += `<path d="M${(x0 - 14).toFixed(1)} ${(y0 + h + 14).toFixed(1)}h22M${(x0 - 14).toFixed(1)} ${(y0 + h + 14).toFixed(1)}v-22" style="stroke:var(--ink);stroke-width:1.2;fill:none;"/>` + txt(x0 + 12, y0 + h + 18, 'x', 'start') + txt(x0 - 18, y0 + h - 12, 'z', 'end');
  out += legend(layers, M.l, y0 + h + 26);
  return svg(W, H, out);
}

// 5B section (looking along z): the x-direction bars run in the plane of the drawing, the z-direction bars are cut and appear as dots.
// Bf in m; t, cc, db in mm; piles [{x,y}] (m); D (m); ped = { x, Bp } (m, mm) or null.
export function pileCapRebarSectionSVG({ Bf, t, cc, db, piles, D, ped, layers, name = 'Pile cap' }) {
  const W = 640, nLeg = Object.keys(LAYER).filter(k => layers[k]).length;
  const sx = Math.min(500 / Bf, 260 / (t / 1000 * 2.6)); // px per m
  const pxmm = sx / 1000;
  const w = Bf * sx, h = t * pxmm;
  const stubUp = Math.max(26, h * 0.35), stubDown = Math.max(30, h * 0.4);
  const M = { l: 60, r: 90, t: 34 + stubUp, b: 46 + stubDown + nLeg * 15 };
  const x0 = M.l + (W - M.l - M.r - w) / 2, y0 = M.t;
  const H = Math.round(y0 + h + M.b);
  const toX = (x) => x0 + (x + Bf / 2) * sx;
  let out = title(`${name} reinforcement — section, D${fmt(db, 0)} bars`);
  // pile stubs below, pedestal stub above
  const pileX = [...new Set(piles.map(p => +p.x.toFixed(4)))];
  pileX.forEach(px => { const pw = D > 0 ? D * sx : 14; out += `<rect x="${(toX(px) - pw / 2).toFixed(1)}" y="${(y0 + h).toFixed(1)}" width="${pw.toFixed(1)}" height="${stubDown.toFixed(1)}" style="fill:none;stroke:var(--ink-soft);stroke-width:1.2;stroke-dasharray:4 3;"/>`; });
  if (pileX.length) out += txt(x0 + w + 8, y0 + h + stubDown / 2 + 3.5, 'piles', 'start');
  (Array.isArray(ped) ? ped : [ped]).forEach((pd, k) => {
    if (!(pd && pd.Bp > 0)) return;
    const pw = pd.Bp / 1000 * sx;
    out += `<rect class="outline-pedestal" x="${(toX(pd.x) - pw / 2).toFixed(1)}" y="${(y0 - stubUp).toFixed(1)}" width="${pw.toFixed(1)}" height="${stubUp.toFixed(1)}"/>`;
    out += txt(toX(pd.x), y0 - stubUp / 2 + 3.5, Array.isArray(ped) ? String(k + 1) : 'pedestal', 'middle', 'font-weight:600;');
  });
  out += `<rect class="outline-footing" x="${x0.toFixed(1)}" y="${y0.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}"/>`;
  // layers: outer = x-direction (line), inner = z-direction (dots), for the bottom and for the top face
  const rDot = Math.max(2.6, db / 2 * pxmm), sw = Math.max(2.4, db * pxmm);
  const yBotOuter = y0 + h - (cc + db / 2) * pxmm, yBotInner = y0 + h - (cc + db * 1.5) * pxmm;
  const yTopOuter = y0 + (cc + db / 2) * pxmm, yTopInner = y0 + (cc + db * 1.5) * pxmm;
  const line = (kind, y) => `<line x1="${(x0 + cc * pxmm).toFixed(1)}" y1="${y.toFixed(1)}" x2="${(x0 + w - cc * pxmm).toFixed(1)}" y2="${y.toFixed(1)}" style="stroke:${LAYER[kind].stroke};stroke-width:${sw.toFixed(1)};${LAYER[kind].dash ? `stroke-dasharray:${LAYER[kind].dash};` : ''}"/>`;
  const dots = (kind, y) => { let s = ''; const nn = layers[kind].n; for (let i = 1; i <= nn; i++) s += `<circle cx="${(x0 + i / (nn + 1) * w).toFixed(1)}" cy="${y.toFixed(1)}" r="${rDot.toFixed(1)}" style="fill:${LAYER[kind].fill};"/>`; return s; };
  if (layers.xb) out += line('xb', yBotOuter);
  if (layers.yb) out += dots('yb', yBotInner);
  if (layers.xt) out += line('xt', yTopOuter);
  if (layers.yt) out += dots('yt', yTopInner);
  // dimensions: t on the right, Bf below the pile stubs, cc callout on the left
  const xr = x0 + w + 22;
  out += ln(xr, y0, xr, y0 + h, 'stroke-width:1.2;') + ln(xr - 4, y0, xr + 4, y0) + ln(xr - 4, y0 + h, xr + 4, y0 + h);
  out += txt(xr + 8, y0 + h / 2 + 3.5, `t = ${fmt(t, 0)}`, 'start');
  const yBf = y0 + h + stubDown + 18;
  out += ln(x0, yBf, x0 + w, yBf, 'stroke-width:1.2;') + ln(x0, yBf - 4, x0, yBf + 4) + ln(x0 + w, yBf - 4, x0 + w, yBf + 4);
  out += txt(x0 + w / 2, yBf + 14, `B<tspan baseline-shift="sub" font-size="8">f</tspan> = ${fmt(Bf, 2)} m`);
  out += ln(x0 - 14, y0 + h, x0 - 14, yBotOuter + db / 2 * pxmm, 'stroke-width:1.2;') + txt(x0 - 18, y0 + h - cc * pxmm / 2 + 3.5, `cc ${fmt(cc, 0)}`, 'end');
  out += legend(layers, 28, yBf + 34);
  return svg(W, H, out);
}
