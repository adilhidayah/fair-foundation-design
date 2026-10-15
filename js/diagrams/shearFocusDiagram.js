import { fmt } from '../core/format.js?v=20261014v';

// 5B (report chapter 06) — Focus Canvas pictures of the two shear checks of a footing / pile cap: one-way shear (§22.5) and
// two-way / punching shear (§22.6), each as plan, elevation and isometric 2.5D. Pure SVG string builders (no DOM access):
// v = lastResults.oneway.viz / lastResults.twoway.viz (js/tabs/shear.js) in, markup out — every number shown comes from the
// check itself, nothing feeds a calculation. Axes: x along Bf, z along Lf (plan: x right, z up), y up. Elements carrying a
// data-tip attribute get a hover popover (js/tabs/shearFocus.js). Colours are theme tokens (css/app.css, .sh-*).

const HALO = 'paint-order:stroke;stroke:var(--panel);stroke-width:3px;stroke-linejoin:round;';
const f = (n) => n.toFixed(1);
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const tip = (t) => (t ? ` data-tip="${esc(t)}"` : '');
const mm = (m) => `${fmt(m * 1000, 0)} mm`;
const W = 640, H = 420;

// Arrowheads: one for dimension lines, one for soil-pressure vectors (ids made unique per SVG — see foundSizeFocus.js).
const defs = (id) => `<defs>
  <marker id="${id}-dim" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,1 L10,5 L0,9 z" class="sh-head-dim"/></marker>
  <marker id="${id}-q" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="sh-head-q"/></marker>
</defs>`;
const svgOpen = (id, cls, label, title) => `<svg id="${id}" class="fdn-diagram cad-svg sh-svg ${cls}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${defs(id)}
  <text class="panel-title" x="16" y="22">${title}</text>`;
// Dimension line with arrows at both ends and a centred label (screen coordinates). vertical: label rotated.
function dimLine(id, x1, y1, x2, y2, label, { side = -1, cls = 'dim' } = {}) {
  const vert = Math.abs(x2 - x1) < 1e-6;
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const tx = vert ? mx + side * 11 : mx, ty = vert ? my : my + (side < 0 ? -5 : 13);
  return `<line class="${cls}" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" marker-start="url(#${id}-dim)" marker-end="url(#${id}-dim)"/>
  <text class="dim-text" style="${HALO}" x="${f(tx)}" y="${f(ty)}" text-anchor="middle"${vert ? ` transform="rotate(-90 ${f(tx)} ${f(ty)})"` : ''}>${label}</text>`;
}
// Legend row along the bottom; items laid out by their text length (10 px mono ≈ 6.2 px per character).
const legend = (items) => { let x0 = 16; return `<g class="sh-legend">${items.map(([cls, txt]) => {
  const x = x0, y = H - 14;
  x0 += 28 + txt.length * 6.2 + 22;
  const sw = cls === 'line' ? `<line class="sh-crit" x1="${x}" y1="${y - 4}" x2="${x + 22}" y2="${y - 4}"/>`
    : cls === 'arrow' ? `<line class="sh-arrow hot" x1="${x + 11}" y1="${y + 2}" x2="${x + 11}" y2="${y - 10}"/>`
    : cls === 'crack' ? `<line class="sh-crack gov" x1="${x + 4}" y1="${y - 10}" x2="${x + 18}" y2="${y + 2}"/>`
    : `<rect class="${cls}" x="${x}" y="${y - 10}" width="22" height="11"/>`;
  return `${sw}<text class="dim-text" x="${x + 28}" y="${y}">${txt}</text>`;
}).join('')}</g>`; };

// Soil pressure at a plan point (net of nothing — the arrows show the gross soil reaction q; w is listed in the tiles).
const qAt = (pl, x, z) => (pl ? Math.max(0, pl.a + pl.b * x + pl.c * z) : 1);

// ---------------------------------------------------------------- plan frame
function planFrame(v) {
  const mL = 78, mR = 86, mT = 64, mB = 78;
  const s = Math.min((W - mL - mR) / Math.max(v.B, 0.1), (H - mT - mB) / Math.max(v.L, 0.1));
  const cx = mL + (W - mL - mR) / 2, cy = mT + (H - mT - mB) / 2;
  const X = (x) => cx + x * s, Y = (z) => cy - z * s;
  const rect = (x0, x1, z0, z1, cls, t = '') => `<rect class="${cls}" x="${f(X(x0))}" y="${f(Y(z1))}" width="${f((x1 - x0) * s)}" height="${f((z1 - z0) * s)}"${tip(t)}/>`;
  return { s, X, Y, rect };
}
function planAxes(F, v) {
  const x0 = F.X(-v.B / 2) + 12, y0 = F.Y(-v.L / 2) - 12;
  return `<g class="sh-axes"><line class="iso-axis" x1="${f(x0)}" y1="${f(y0)}" x2="${f(x0 + 26)}" y2="${f(y0)}"/><text class="dim-text" x="${f(x0 + 31)}" y="${f(y0 + 3)}">x</text>
    <line class="iso-axis" x1="${f(x0)}" y1="${f(y0)}" x2="${f(x0)}" y2="${f(y0 - 26)}"/><text class="dim-text" x="${f(x0 - 3)}" y="${f(y0 - 30)}">z</text></g>`;
}
function footingDims(id, F, v) {
  const yb = F.Y(-v.L / 2) + 24, xr = F.X(v.B / 2) + 24;
  return dimLine(id, F.X(-v.B / 2), yb, F.X(v.B / 2), yb, `B<tspan baseline-shift="sub" font-size="7">f</tspan> = ${fmt(v.B, 2)} m`, { side: 1 })
    + dimLine(id, xr, F.Y(v.L / 2), xr, F.Y(-v.L / 2), `L<tspan baseline-shift="sub" font-size="7">f</tspan> = ${fmt(v.L, 2)} m`, { side: 1 });
}

// ---------------------------------------------------------------- one-way geometry
// Sections at d from the two pedestal faces, perpendicular to the axis ('x' or 'z'); u = coordinate along the axis.
function oneWayGeom(v) {
  const ax = v.axis;
  const half = ax === 'x' ? v.ped.c1 / 2 : v.ped.c2 / 2, cp = ax === 'x' ? v.ped.x : v.ped.z;
  const lim = ax === 'x' ? v.B / 2 : v.L / 2, across = ax === 'x' ? v.L / 2 : v.B / 2, tc = ax === 'x' ? v.ped.z : v.ped.x;
  const sides = [
    { sg: '+', face: cp + half, pos: cp + half + v.d, from: cp + half + v.d, to: lim },
    { sg: '-', face: cp - half, pos: cp - half - v.d, from: -lim, to: cp - half - v.d }
  ].map((sd) => ({ ...sd, inside: sd.pos > -lim + 1e-9 && sd.pos < lim - 1e-9, gov: v.side ? v.side === sd.sg : sd.sg === '+' }));
  return { ax, half, cp, lim, across, tc, sides };
}
const U = (g) => g.ax.toUpperCase() === 'X' ? 'x' : 'z';

export function oneWayPlanSVG(v, id) {
  const F = planFrame(v), g = oneWayGeom(v);
  // model rectangle from (u0, u1) along the axis and (t0, t1) across it
  const rUT = (u0, u1, t0, t1, cls, t) => (g.ax === 'x' ? F.rect(u0, u1, t0, t1, cls, t) : F.rect(t0, t1, u0, u1, cls, t));
  let out = svgOpen(id, 'sh-plan', 'One-way shear — plan', `One-way shear — plan (sections ⟂ ${U(g)})`);
  out += F.rect(-v.B / 2, v.B / 2, -v.L / 2, v.L / 2, 'outline-footing');
  g.sides.forEach((sd) => {
    if (!sd.inside) return;
    const len = sd.to - sd.from, area = len * 2 * g.across;
    out += rUT(sd.from, sd.to, -g.across, g.across, `sh-trib${sd.gov ? ' gov' : ''}`,
      `Tributary area beyond the ${sd.sg} section: ${fmt(len, 3)} × ${fmt(2 * g.across, 2)} = ${fmt(area, 3)} m² — its net soil pressure is the shear V`);
  });
  out += F.rect(v.ped.x - v.ped.c1 / 2, v.ped.x + v.ped.c1 / 2, v.ped.z - v.ped.c2 / 2, v.ped.z + v.ped.c2 / 2, 'outline-pedestal',
    `Pedestal ${mm(v.ped.c1)} × ${mm(v.ped.c2)}`);
  g.sides.forEach((sd) => {
    if (!sd.inside) return;
    const t = `Critical section at d = ${mm(v.d)} from the pedestal face (${U(g)} = ${fmt(sd.pos, 3)} m)`;
    const [x1, y1, x2, y2] = g.ax === 'x' ? [F.X(sd.pos), F.Y(g.across), F.X(sd.pos), F.Y(-g.across)] : [F.X(-g.across), F.Y(sd.pos), F.X(g.across), F.Y(sd.pos)];
    out += `<line class="sh-crit${sd.gov ? ' gov' : ''}" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"${tip(t)}/>`;
    out += `<line class="sh-hit" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"${tip(t)}/>`;
  });
  // d and tributary-length dimensions on the governing side (above the footing for sections ⟂ x, left of it for ⟂ z)
  const gs = g.sides.find((sd) => sd.gov && sd.inside) || g.sides.find((sd) => sd.inside);
  if (gs) {
    if (g.ax === 'x') {
      const y = F.Y(v.L / 2) - 16;
      out += dimLine(id, F.X(gs.face), y, F.X(gs.pos), y, `d = ${fmt(v.d * 1000, 0)}`);
      out += dimLine(id, F.X(gs.from), y - 20, F.X(gs.to), y - 20, `${fmt(gs.to - gs.from, 3)} m`);
    } else {
      const x = F.X(-v.B / 2) - 16;
      out += dimLine(id, x, F.Y(gs.face), x, F.Y(gs.pos), `d = ${fmt(v.d * 1000, 0)}`, { side: -1 });
      out += dimLine(id, x - 22, F.Y(gs.from), x - 22, F.Y(gs.to), `${fmt(gs.to - gs.from, 3)} m`, { side: -1 });
    }
  } else {
    out += `<text class="dim-text" x="${f(F.X(0))}" y="${f(F.Y(v.L / 2) - 14)}" text-anchor="middle">Both sections lie outside the footing — V = 0</text>`;
  }
  out += footingDims(id, F, v) + planAxes(F, v);
  out += legend([['line', 'critical section (d from face)'], ['sh-trib gov', 'tributary area → Vu'], ['outline-pedestal', 'pedestal']]);
  return out + '</svg>';
}

// ---------------------------------------------------------------- elevation frame (cut along the axis through the pedestal)
function elevFrame(lim, v, hp) {
  const mL = 92, mR = 100, top = 70, bottom = 128;
  const s = Math.min((W - mL - mR) / Math.max(2 * lim, 0.1), (H - top - bottom) / Math.max(v.H + hp, 0.1));
  const cx = mL + (W - mL - mR) / 2, yb = H - bottom + 26;
  return { s, Ux: (u) => cx + u * s, Vy: (y) => yb - y * s, yb };
}
// Soil-pressure arrows under the footing between u0 and u1; hot = beyond a critical section (counts in V_u).
function soilArrows(id, E, v, lim, pointAt, isHot, piles) {
  if (v.src === 'piles') return '';
  const n = Math.max(6, Math.round((2 * lim * E.s) / 22));
  const qs = [], us = [];
  for (let i = 0; i <= n; i++) { const u = -lim + (2 * lim * i) / n; us.push(u); qs.push(qAt(v.plane, ...pointAt(u))); }
  const qm = Math.max(...qs, 1e-9);
  let out = '';
  us.forEach((u, i) => {
    const L = 46 * qs[i] / qm;
    if (L < 2) return;
    const x = E.Ux(u), y0 = E.Vy(0) + 8 + L, y1 = E.Vy(0) + 6;
    out += `<line class="sh-arrow${isHot(u) ? ' hot' : ''}" x1="${f(x)}" y1="${f(y0)}" x2="${f(x)}" y2="${f(y1)}" marker-end="url(#${id}-q)"/>`;
  });
  const lbl = v.plane ? `soil pressure q (factored), q<tspan baseline-shift="sub" font-size="7">max</tspan> = ${fmt(v.plane.qmax, 1)} kPa` : 'soil pressure q (schematic — Vu typed in)';
  out += `<text class="dim-text sh-qlabel" x="${f(E.Ux(-lim))}" y="${f(E.Vy(0) + 70)}">${lbl}</text>`;
  return out;
}
// Piles under a pile cap (elevation): stubs at their coordinate along the cut axis, reaction arrows on the piles that load
// the section, with their share of the force.
function pileStubs(id, E, v, coord, loads) {
  if (v.src !== 'piles' || !v.piles) return '';
  const w = Math.max(6, (v.dp || 0.3) * E.s);
  return v.piles.map((p) => {
    const u = coord(p), x = E.Ux(u), hot = p.frac > 0 && loads(p);
    return `<rect class="sh-pile${hot ? ' hot' : ''}" x="${f(x - w / 2)}" y="${f(E.Vy(0))}" width="${f(w)}" height="54"${tip(`Pile ${p.i}: F = ${fmt(p.F, 1)} kN, share ${fmt(p.frac, 2)}`)}/>`
      + (hot ? `<line class="sh-arrow hot" x1="${f(x)}" y1="${f(E.Vy(0) + 50)}" x2="${f(x)}" y2="${f(E.Vy(0) + 6)}" marker-end="url(#${id}-q)"/><text class="dim-text" style="${HALO}" x="${f(x + w / 2 + 3)}" y="${f(E.Vy(0) + 40)}">${fmt(p.F * p.frac, 0)} kN</text>` : '');
  }).join('');
}
function sectionBody(id, E, v, lim, cp, cHalf, hp) {
  // footing, pedestal (cut, with a break line), bottom bars
  let out = `<rect class="outline-footing" x="${f(E.Ux(-lim))}" y="${f(E.Vy(v.H))}" width="${f(2 * lim * E.s)}" height="${f(v.H * E.s)}"/>`;
  const px0 = E.Ux(cp - cHalf), px1 = E.Ux(cp + cHalf), pyT = E.Vy(v.H + hp), pyB = E.Vy(v.H);
  const zz = Array.from({ length: 7 }, (_, i) => `${f(px0 + ((px1 - px0) * i) / 6)},${f(pyT + (i % 2 ? 5 : -2))}`).join(' ');
  out += `<polygon class="outline-pedestal" points="${f(px0)},${f(pyB)} ${f(px1)},${f(pyB)} ${zz.split(' ').reverse().join(' ')}"${tip(`Pedestal ${mm(2 * cHalf)}`)}/>`;
  const yr = E.Vy(v.cc + v.db / 2), x0 = E.Ux(-lim + v.cc), x1 = E.Ux(lim - v.cc);
  out += `<line class="sh-rebar-line" x1="${f(x0)}" y1="${f(yr)}" x2="${f(x1)}" y2="${f(yr)}"/>`;
  const nb = Math.max(4, Math.round((x1 - x0) / 16));
  for (let i = 0; i <= nb; i++) out += `<circle class="sh-rebar" cx="${f(x0 + ((x1 - x0) * i) / nb)}" cy="${f(yr)}" r="${f(Math.max(1.6, Math.min(3.2, v.db * E.s / 2)))}"/>`;
  return out;
}
function depthDims(id, E, v, lim) {
  const xr = E.Ux(lim) + 18, xl = E.Ux(-lim) - 18;
  return dimLine(id, xl, E.Vy(0), xl, E.Vy(v.H), `H<tspan baseline-shift="sub" font-size="7">f</tspan> = ${fmt(v.H * 1000, 0)}`, { side: -1 })
    + dimLine(id, xr, E.Vy(v.H), xr, E.Vy(v.H - v.d), `d = ${fmt(v.d * 1000, 0)}`, { side: 1 })
    + dimLine(id, xr + 30, E.Vy(0), xr + 30, E.Vy(v.cc), `cc = ${fmt(v.cc * 1000, 0)}`, { side: 1 });
}

export function oneWayElevSVG(v, id) {
  const g = oneWayGeom(v), hp = 0.6 * v.H + 0.25;
  const E = elevFrame(g.lim, v, hp);
  let out = svgOpen(id, 'sh-elev', 'One-way shear — elevation', `One-way shear — section along ${U(g)} through the pedestal`);
  out += sectionBody(id, E, v, g.lim, g.cp, g.half, hp);
  g.sides.forEach((sd) => {
    if (!sd.inside) return;
    const dir = sd.sg === '+' ? 1 : -1;
    const t = `Critical section at d = ${mm(v.d)} from the pedestal face (${U(g)} = ${fmt(sd.pos, 3)} m)`;
    out += `<line class="sh-crit${sd.gov ? ' gov' : ''}" x1="${f(E.Ux(sd.pos))}" y1="${f(E.Vy(v.H) - 10)}" x2="${f(E.Ux(sd.pos))}" y2="${f(E.Vy(0) + 4)}"${tip(t)}/>`;
    out += `<line class="sh-hit" x1="${f(E.Ux(sd.pos))}" y1="${f(E.Vy(v.H) - 10)}" x2="${f(E.Ux(sd.pos))}" y2="${f(E.Vy(0) + 4)}"${tip(t)}/>`;
    // inclined crack: from the pedestal face at the top surface down at 45° to the bars at the critical section
    out += `<line class="sh-crack${sd.gov ? ' gov' : ''}" x1="${f(E.Ux(sd.face))}" y1="${f(E.Vy(v.H))}" x2="${f(E.Ux(sd.face + dir * v.d))}" y2="${f(E.Vy(v.H - v.d))}"${tip('Inclined shear crack, ≈45° from the pedestal face to the bottom bars')}/>`;
    if (sd.gov) out += dimLine(id, E.Ux(sd.face), E.Vy(v.H) - 22, E.Ux(sd.pos), E.Vy(v.H) - 22, `d = ${fmt(v.d * 1000, 0)}`);
  });
  const pointAt = (u) => (g.ax === 'x' ? [u, v.ped.z] : [v.ped.x, u]);
  const hot = (u) => g.sides.some((sd) => sd.inside && (sd.sg === '+' ? u >= sd.pos : u <= sd.pos));
  out += soilArrows(id, E, v, g.lim, pointAt, hot);
  const coord = (p) => (g.ax === 'x' ? p.x : p.y);
  const side = g.sides.find((sd) => sd.gov) || g.sides[0];
  out += pileStubs(id, E, v, coord, (p) => (side.sg === '+' ? coord(p) > g.cp : coord(p) < g.cp));
  out += depthDims(id, E, v, g.lim);
  out += legend([['line', 'critical section'], ['arrow', v.src === 'piles' ? 'pile reaction on the section' : 'soil pressure (beyond → Vu)'], ['crack', 'inclined crack']]);
  return out + '</svg>';
}

// ---------------------------------------------------------------- isometric helpers (same projection as foundIsoDiagram.js)
const C30 = Math.cos(Math.PI / 6), S30 = Math.sin(Math.PI / 6);
const proj = (x, y, z) => [(x - z) * C30, (x + z) * S30 - y];
function isoScene() {
  const items = []; // { pts, cls, tip, line }
  const poly = (pts, cls, t = '') => items.push({ pts: pts.map((p) => proj(...p)), cls, tip: t });
  const line = (a, b, cls, t = '') => items.push({ pts: [proj(...a), proj(...b)], cls, tip: t, line: true });
  const text = (at, txt, o = {}) => items.push({ pts: [proj(...at)], text: txt, ...o });
  // three visible faces of a box (viewer from +x, +z, above)
  const box = (x0, x1, z0, z1, y0, y1, kind, t = '') => {
    if (!(x1 > x0 && z1 > z0 && y1 > y0)) return;
    poly([[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], `iso-face ${kind} iso-sx`, t);
    poly([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], `iso-face ${kind} iso-sz`, t);
    poly([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], `iso-face ${kind} iso-top`, t);
  };
  // hidden edges of a box (dashed), for the see-through footing
  const hidden = (x0, x1, z0, z1, y0, y1, cls) => {
    line([x0, y0, z0], [x1, y0, z0], cls); line([x0, y0, z0], [x0, y0, z1], cls); line([x0, y0, z0], [x0, y1, z0], cls);
  };
  const render = (id, title, label) => {
    const all = items.filter((i) => !i.text).flatMap((i) => i.pts);
    const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const k = Math.min((W - 200) / Math.max(maxX - minX, 1e-6), (H - 120) / Math.max(maxY - minY, 1e-6));
    const ox = (W - (maxX - minX) * k) / 2 - minX * k, oy = 52 - minY * k;
    const T = ([X, Y]) => [X * k + ox, Y * k + oy];
    const body = items.map((i) => {
      if (i.text) {
        const [x, y] = T(i.pts[0]);
        return `<text class="dim-text${i.cls ? ' ' + i.cls : ''}" style="${HALO}" x="${f(x + (i.dx || 0))}" y="${f(y + (i.dy || 0))}" text-anchor="${i.anchor || 'middle'}">${i.text}</text>`;
      }
      if (i.line) { const [a, b] = i.pts.map(T); return `<line class="${i.cls}" x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}"${tip(i.tip)}/>`; }
      return `<polygon class="${i.cls}" points="${i.pts.map((p) => T(p).map(f).join(',')).join(' ')}"${tip(i.tip)}/>`;
    }).join('');
    const a0 = [40, H - 40], L = 22;
    const ax = (dx, dy, lbl) => `<line class="iso-axis" x1="${a0[0]}" y1="${a0[1]}" x2="${f(a0[0] + dx * L)}" y2="${f(a0[1] + dy * L)}"/><text class="dim-text" x="${f(a0[0] + dx * (L + 8))}" y="${f(a0[1] + dy * (L + 8) + 3)}" text-anchor="middle">${lbl}</text>`;
    return `${svgOpen(id, 'sh-iso', label, title)}${body}<g>${ax(C30, S30, 'x')}${ax(-C30, S30, 'z')}${ax(0, -1, 'y')}</g></svg>`;
  };
  return { poly, line, text, box, hidden, render };
}

export function oneWayIsoSVG(v, id) {
  const g = oneWayGeom(v), sc = isoScene(), hp = 0.6 * v.H + 0.25;
  const gap = 0.12 * Math.max(v.B, v.L);
  const gs = g.sides.find((sd) => sd.gov && sd.inside) || g.sides.find((sd) => sd.inside);
  // pieces along the axis: back part (−), middle, front part (+); the governing beyond-part is pulled out by `gap`
  const pos = { '+': g.sides[0].inside ? g.sides[0].pos : g.lim, '-': g.sides[1].inside ? g.sides[1].pos : -g.lim };
  const shift = (sg) => (gs && gs.sg === sg ? (sg === '+' ? gap : -gap) : 0);
  const boxU = (u0, u1, y0, y1, kind, t) => (g.ax === 'x'
    ? sc.box(u0, u1, -v.L / 2, v.L / 2, y0, y1, kind, t)
    : sc.box(-v.B / 2, v.B / 2, u0, u1, y0, y1, kind, t));
  const planeU = (u, t) => {
    const e = 0.04 * Math.max(v.B, v.L);
    const P = (uu, y, tt) => (g.ax === 'x' ? [uu, y, tt] : [tt, y, uu]);
    sc.poly([P(u, -e, -g.across - e), P(u, -e, g.across + e), P(u, v.H + e, g.across + e), P(u, v.H + e, -g.across - e)], 'sh-plane', t);
  };
  const tribTip = (sd) => `Shear failure block beyond the ${sd.sg} section — ${fmt(sd.to - sd.from, 3)} m × ${fmt(2 * g.across, 2)} m`;
  // back part (−)
  if (g.sides[1].inside) boxU(-g.lim + shift('-'), pos['-'] + shift('-'), 0, v.H, `sh-block${gs && gs.sg === '-' ? ' gov' : ''}`, tribTip(g.sides[1]));
  // governing side −: the cut face that faces the viewer is the pulled-out block's own face, so the plane is drawn there
  if (gs && gs.sg === '-') planeU(pos['-'] + shift('-'), `Critical section at d = ${mm(v.d)} from the pedestal face`);
  boxU(pos['-'], pos['+'], 0, v.H, 'iso-footing');
  sc.box(v.ped.x - v.ped.c1 / 2, v.ped.x + v.ped.c1 / 2, v.ped.z - v.ped.c2 / 2, v.ped.z + v.ped.c2 / 2, v.H, v.H + hp, 'iso-pedestal', 'Pedestal');
  if (gs && gs.sg === '+') planeU(pos['+'], `Critical section at d = ${mm(v.d)} from the pedestal face`);
  if (g.sides[0].inside) boxU(pos['+'] + shift('+'), g.lim + shift('+'), 0, v.H, `sh-block${gs && gs.sg === '+' ? ' gov' : ''}`, tribTip(g.sides[0]));
  if (gs) {
    const up = gs.pos + shift(gs.sg) * (gs.sg === '-' ? 1 : 0);
    const lab = g.ax === 'x' ? [up, v.H, g.across] : [g.across, v.H, up];
    sc.text(lab, 'critical section', { dy: -10, cls: 'sh-crit-text' });
    const mid = (gs.from + gs.to) / 2 + shift(gs.sg);
    sc.text(g.ax === 'x' ? [mid, 0, g.across] : [g.across, 0, mid], 'shear failure block', { dy: 16, cls: 'sh-block-text' });
  }
  sc.text([0, 0, v.L / 2], `B<tspan baseline-shift="sub" font-size="7">f</tspan> = ${fmt(v.B, 2)} m`, { dy: 30, dx: -40 });
  sc.text([v.B / 2, 0, 0], `L<tspan baseline-shift="sub" font-size="7">f</tspan> = ${fmt(v.L, 2)} m`, { dy: 30, dx: 40 });
  return sc.render(id, 'One-way shear — isometric 2.5D (failure block pulled out)', 'One-way shear — isometric');
}

// ---------------------------------------------------------------- two-way (punching)
const perimTip = (v) => `Critical perimeter b<sub>o</sub> = ${mm(v.bo)} at d/2 = ${mm(v.d / 2)} from the pedestal faces (${v.loc})`.replace(/<\/?sub>/g, '');
// Sides of the critical section: those of v.rect not dropped at a free footing edge (shallow footing) — all four otherwise.
function perimSides(v) {
  const { X1, X2, Z1, Z2 } = v.rect, fr = v.free || {};
  return [
    !fr.xm && ['x−', [X1, Z1], [X1, Z2]], !fr.xp && ['x+', [X2, Z1], [X2, Z2]],
    !fr.zm && ['z−', [X1, Z1], [X2, Z1]], !fr.zp && ['z+', [X1, Z2], [X2, Z2]]
  ].filter(Boolean);
}

export function twoWayPlanSVG(v, id) {
  const F = planFrame(v);
  const { X1, X2, Z1, Z2 } = v.rect;
  let out = svgOpen(id, 'sh-plan', 'Punching shear — plan', 'Punching shear — plan');
  out += F.rect(-v.B / 2, v.B / 2, -v.L / 2, v.L / 2, 'outline-footing');
  // area outside the critical section (even-odd: footing minus the section's enclosed rectangle)
  const R = (x0, x1, z0, z1) => `M${f(F.X(x0))},${f(F.Y(z1))} H${f(F.X(x1))} V${f(F.Y(z0))} H${f(F.X(x0))} Z`;
  out += `<path class="sh-trib gov" fill-rule="evenodd" d="${R(-v.B / 2, v.B / 2, -v.L / 2, v.L / 2)} ${R(X1, X2, Z1, Z2)}"${tip(`Area outside the critical section: ${fmt(v.B * v.L - (X2 - X1) * (Z2 - Z1), 3)} m² — its net ${v.src === 'piles' ? 'pile reactions are' : 'soil pressure is'} V_u`)}/>`;
  out += F.rect(v.ped.x - v.ped.c1 / 2, v.ped.x + v.ped.c1 / 2, v.ped.z - v.ped.c2 / 2, v.ped.z + v.ped.c2 / 2, 'outline-pedestal', `Pedestal c1 × c2 = ${mm(v.ped.c1)} × ${mm(v.ped.c2)}`);
  const t = perimTip(v);
  perimSides(v).forEach(([, a, b]) => {
    out += `<line class="sh-crit gov" x1="${f(F.X(a[0]))}" y1="${f(F.Y(a[1]))}" x2="${f(F.X(b[0]))}" y2="${f(F.Y(b[1]))}"${tip(t)}/>`;
    out += `<line class="sh-hit" x1="${f(F.X(a[0]))}" y1="${f(F.Y(a[1]))}" x2="${f(F.X(b[0]))}" y2="${f(F.Y(b[1]))}"${tip(t)}/>`;
  });
  // perimeter extents and d/2
  const yT = F.Y(v.L / 2) - 16, xL = F.X(-v.B / 2) - 16;
  out += dimLine(id, F.X(X1), yT, F.X(X2), yT, `${fmt((X2 - X1) * 1000, 0)}`);
  out += dimLine(id, xL, F.Y(Z2), xL, F.Y(Z1), `${fmt((Z2 - Z1) * 1000, 0)}`, { side: -1 });
  const xf = v.ped.x + v.ped.c1 / 2;
  if (X2 - xf > 1e-6 && !(v.free && v.free.xp)) out += dimLine(id, F.X(xf), F.Y(v.ped.z) , F.X(X2), F.Y(v.ped.z), `d/2`);
  const boTxt = v.boFormula ? `b<tspan baseline-shift="sub" font-size="7">o</tspan> = ${v.boFormula} = ${fmt(v.bo * 1000, 0)} mm`
    : `b<tspan baseline-shift="sub" font-size="7">o</tspan> = Σ sides = ${fmt(v.bo * 1000, 0)} mm (${v.loc})`;
  out += `<text class="dim-text sh-bo" style="${HALO}" x="16" y="42"${tip(t)}>${boTxt}</text>`;
  out += footingDims(id, F, v) + planAxes(F, v);
  out += legend([['line', 'critical perimeter bo at d/2'], ['sh-trib gov', 'outside bo → Vu'], ['outline-pedestal', 'pedestal']]);
  return out + '</svg>';
}

export function twoWayElevSVG(v, id) {
  const lim = v.B / 2, hp = 0.6 * v.H + 0.25, cp = v.ped.x, ch = v.ped.c1 / 2;
  const E = elevFrame(lim, v, hp);
  let out = svgOpen(id, 'sh-elev', 'Punching shear — elevation', 'Punching shear — section along x through the pedestal');
  out += sectionBody(id, E, v, lim, cp, ch, hp);
  // punching cone: from the pedestal faces at the top surface, ≈45° down to the bars (d), clipped to the footing
  const cl = (u) => Math.max(-lim, Math.min(lim, u));
  const cone = [[cl(cp - ch), v.H], [cl(cp + ch), v.H], [cl(cp + ch + v.d), v.H - v.d], [cl(cp - ch - v.d), v.H - v.d]];
  out += `<polygon class="sh-cone" points="${cone.map(([u, y]) => `${f(E.Ux(u))},${f(E.Vy(y))}`).join(' ')}"${tip('Punching cone — truncated pyramid at ≈45° from the pedestal faces to the bottom bars')}/>`;
  out += `<line class="sh-crack gov" x1="${f(E.Ux(cl(cp + ch)))}" y1="${f(E.Vy(v.H))}" x2="${f(E.Ux(cl(cp + ch + v.d)))}" y2="${f(E.Vy(v.H - v.d))}"/>`;
  out += `<line class="sh-crack gov" x1="${f(E.Ux(cl(cp - ch)))}" y1="${f(E.Vy(v.H))}" x2="${f(E.Ux(cl(cp - ch - v.d)))}" y2="${f(E.Vy(v.H - v.d))}"/>`;
  const t = perimTip(v);
  const fr = v.free || {};
  [[v.rect.X2, !fr.xp], [v.rect.X1, !fr.xm]].forEach(([u, show]) => {
    if (!show) return;
    out += `<line class="sh-crit gov" x1="${f(E.Ux(u))}" y1="${f(E.Vy(v.H) - 10)}" x2="${f(E.Ux(u))}" y2="${f(E.Vy(0) + 4)}"${tip(t)}/>`;
    out += `<line class="sh-hit" x1="${f(E.Ux(u))}" y1="${f(E.Vy(v.H) - 10)}" x2="${f(E.Ux(u))}" y2="${f(E.Vy(0) + 4)}"${tip(t)}/>`;
  });
  if (!fr.xp && v.rect.X2 < lim - 1e-6) out += dimLine(id, E.Ux(cp + ch), E.Vy(v.H) - 22, E.Ux(v.rect.X2), E.Vy(v.H) - 22, 'd/2');
  const hot = (u) => (!fr.xp && u > v.rect.X2 + 1e-9) || (!fr.xm && u < v.rect.X1 - 1e-9); // a free side has no outside
  out += soilArrows(id, E, v, lim, (u) => [u, v.ped.z], hot);
  out += pileStubs(id, E, v, (p) => p.x, () => true);
  out += depthDims(id, E, v, lim);
  out += legend([['line', 'critical section (d/2)'], ['arrow', v.src === 'piles' ? 'pile reaction outside bo' : 'soil pressure (outside → Vu)'], ['sh-cone', 'punching cone']]);
  return out + '</svg>';
}

export function twoWayIsoSVG(v, id) {
  const sc = isoScene(), hp = 0.6 * v.H + 0.25;
  const bx = v.B / 2, bz = v.L / 2;
  // see-through footing: hidden edges dashed, visible faces translucent
  sc.hidden(-bx, bx, -bz, bz, 0, v.H, 'sh-ghost-edge');
  sc.box(-bx, bx, -bz, bz, 0, v.H, 'sh-ghost');
  // punching frustum: pedestal footprint at the top surface -> expanded by d at the bar level (y = H − d), clipped to the footing
  const cx = (x) => Math.max(-bx, Math.min(bx, x)), cz = (z) => Math.max(-bz, Math.min(bz, z));
  const t0 = { x0: v.ped.x - v.ped.c1 / 2, x1: v.ped.x + v.ped.c1 / 2, z0: v.ped.z - v.ped.c2 / 2, z1: v.ped.z + v.ped.c2 / 2 };
  const b0 = { x0: cx(t0.x0 - v.d), x1: cx(t0.x1 + v.d), z0: cz(t0.z0 - v.d), z1: cz(t0.z1 + v.d) };
  const yt = v.H, yb = v.H - v.d;
  const T = (x, z) => [x, yt, z], Bt = (x, z) => [x, yb, z];
  const coneTip = 'Punching cone — truncated pyramid from the pedestal faces at ≈45° to the bottom bars';
  sc.poly([Bt(b0.x0, b0.z0), Bt(b0.x1, b0.z0), Bt(b0.x1, b0.z1), Bt(b0.x0, b0.z1)], 'sh-cone base', coneTip);
  sc.poly([T(t0.x0, t0.z0), T(t0.x0, t0.z1), Bt(b0.x0, b0.z1), Bt(b0.x0, b0.z0)], 'sh-cone', coneTip); // −x (back)
  sc.poly([T(t0.x0, t0.z0), T(t0.x1, t0.z0), Bt(b0.x1, b0.z0), Bt(b0.x0, b0.z0)], 'sh-cone', coneTip); // −z (back)
  sc.poly([T(t0.x1, t0.z0), T(t0.x1, t0.z1), Bt(b0.x1, b0.z1), Bt(b0.x1, b0.z0)], 'sh-cone front', coneTip); // +x
  sc.poly([T(t0.x0, t0.z1), T(t0.x1, t0.z1), Bt(b0.x1, b0.z1), Bt(b0.x0, b0.z1)], 'sh-cone front', coneTip); // +z
  // critical perimeter at mid-depth of d (d/2 from the faces)
  const ym = v.H - v.d / 2, t = perimTip(v);
  perimSides(v).forEach(([, a, b]) => sc.line([a[0], ym, a[1]], [b[0], ym, b[1]], 'sh-crit gov', t));
  sc.box(t0.x0, t0.x1, t0.z0, t0.z1, v.H, v.H + hp, 'iso-pedestal', 'Pedestal');
  sc.text([b0.x1, yb, b0.z0], 'punching cone ≈45°', { dy: 14, dx: 14, anchor: 'start', cls: 'sh-crit-text' });
  sc.text([v.rect.X2, ym, v.rect.Z1], `b<tspan baseline-shift="sub" font-size="7">o</tspan> = ${fmt(v.bo * 1000, 0)} mm`, { dx: 12, anchor: 'start', cls: 'sh-crit-text' });
  sc.text([0, 0, bz], `B<tspan baseline-shift="sub" font-size="7">f</tspan> = ${fmt(v.B, 2)} m`, { dy: 30, dx: -40 });
  sc.text([bx, 0, 0], `L<tspan baseline-shift="sub" font-size="7">f</tspan> = ${fmt(v.L, 2)} m`, { dy: 30, dx: 40 });
  return sc.render(id, 'Punching shear — isometric 2.5D (footing see-through)', 'Punching shear — isometric');
}
