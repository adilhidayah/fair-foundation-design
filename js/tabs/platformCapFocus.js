// 5B.2 — Focus Canvas of the pile cap on piles under vessels and a platform (#focus-capcheck, below the 6.1 / 6.2 canvases).
// Builds markup only from lastResults.platformCapViz (set by calcPlatformCap(), js/tabs/platformCap.js): a plan of the cap with the
// piles, the vessel footprint and base rings and the 12 platform columns, the moment curves of the governing combinations, and the
// ratio of every check as a bar. Nothing is recomputed here.
import { escapeHtml } from '../core/dom.js?v=20261028a4';
import { fmt } from '../core/format.js?v=20261028a4';
import { lastResults } from '../core/state.js?v=20261028a4';

const tile = (label, value, sub) => `<div class="fz-tile"><div class="fz-tile-label">${label}</div><div class="fz-tile-value">${value}</div>${sub ? `<div class="fz-tile-sub">${sub}</div>` : ''}</div>`;

// Plan: the long side (L, pile y coordinate) runs left to right, the width (B, pile x coordinate) top to bottom.
function planSvg(v) {
  const W = 760, pad = 34, sc = (W - 2 * pad) / v.Lf, H = Math.round(v.Bf * sc + 2 * pad + 18);
  const X = (y) => pad + (y + v.Lf / 2) * sc, Y = (x) => pad + (x + v.Bf / 2) * sc;
  const fp = v.footprint, r = v.dp / 2;
  const piles = v.piles.map((p, i) => `<rect x="${X(p.y - r)}" y="${Y(p.x - r)}" width="${v.dp * sc}" height="${v.dp * sc}" fill="var(--accent,#2b6cb0)" opacity=".75"><title>Pile ${i + 1} (x ${fmt(p.x, 2)}, z ${fmt(p.y, 2)} m)</title></rect>`).join('');
  const rings = v.vessels.map(p => `<circle cx="${X(p.y)}" cy="${Y(p.x)}" r="${v.ringD / 2 * sc}" fill="none" stroke="#c05621" stroke-width="2"/><circle cx="${X(p.y)}" cy="${Y(p.x)}" r="2.5" fill="#c05621"/>`).join('');
  const cols = v.columns.map((c, k) => `<rect x="${X(c.y - c.c2 / 2)}" y="${Y(c.x - c.c1 / 2)}" width="${Math.max(c.c2 * sc, 5)}" height="${Math.max(c.c1 * sc, 5)}" fill="${k === v.punchK ? '#c53030' : '#4a5568'}"><title>Platform column ${k + 1}</title></rect>`).join('');
  const foot = `<rect x="${X(fp.yc - fp.Lp / 2)}" y="${Y(fp.xc - fp.Bp / 2)}" width="${fp.Lp * sc}" height="${fp.Bp * sc}" fill="#c05621" opacity=".08" stroke="#c05621" stroke-dasharray="6 4" stroke-width="1"/>`;
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;display:block;font:11px var(--sans,sans-serif);" role="img" aria-label="Plan of the pile cap">
    <rect x="${pad}" y="${pad}" width="${v.Lf * sc}" height="${v.Bf * sc}" fill="none" stroke="currentColor" stroke-width="1.5"/>
    ${foot}${piles}${rings}${cols}
    <text x="${pad}" y="${H - 8}" fill="currentColor" opacity=".75">cap ${fmt(v.Lf, 2)} × ${fmt(v.Bf, 2)} m · ■ pile · ◯ vessel base ring · ▪ platform column (red: highest load) · dashed: vessel footprint, section for face moment</text></svg>`;
}

function momentSvg(m, label, unit) {
  const W = 760, H = 150, pad = 30, pts = m.pts, s0 = pts[0][0], s1 = pts[pts.length - 1][0];
  const ms = pts.map(p => p[1]), mmax = Math.max(...ms, 1), mmin = Math.min(...ms, -1), span = mmax - mmin;
  const X = (s) => pad + (s - s0) / (s1 - s0) * (W - 2 * pad), Y = (q) => 18 + (mmax - q) / span * (H - 36);
  const line = pts.map(p => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;display:block;font:11px var(--sans,sans-serif);" role="img" aria-label="${escapeHtml(label)}">
    <line x1="${pad}" x2="${W - pad}" y1="${Y(0)}" y2="${Y(0)}" stroke="currentColor" opacity=".4"/>
    <polyline fill="none" stroke="var(--accent,#2b6cb0)" stroke-width="2" points="${line}"/>
    <text x="${pad}" y="12" fill="currentColor">${escapeHtml(label)} · L/C ${escapeHtml(String(m.lc))} · max ${fmt(mmax, 1)} / min ${fmt(mmin, 1)} ${unit} (sagging up)</text></svg>`;
}

function ratioBars(checks) {
  return `<div style="display:grid;gap:6px;">${checks.map(c => {
    const u = Number.isFinite(c.uc) ? c.uc : 9, w = Math.min(u, 1.2) / 1.2 * 100, bad = u > 1;
    return `<div style="display:grid;grid-template-columns:minmax(150px,230px) 1fr 52px;gap:10px;align-items:center;font-size:12px;">
      <span>${escapeHtml(c.name)}</span>
      <span style="position:relative;height:10px;background:var(--line,#ddd);border-radius:5px;overflow:hidden;"><span style="position:absolute;inset:0 auto 0 0;width:${w.toFixed(1)}%;background:${bad ? '#c53030' : 'var(--accent,#2b6cb0)'};"></span><span style="position:absolute;left:${(100 / 1.2).toFixed(1)}%;top:0;bottom:0;width:1px;background:currentColor;opacity:.6;"></span></span>
      <b style="text-align:right;font-variant-numeric:tabular-nums;">${fmt(c.uc, 3)}</b></div>`;
  }).join('')}</div>`;
}

export function platformCapFocusHtml() {
  const v = lastResults.platformCapViz;
  if (!v) return '';
  const g = v.gov;
  return `<section class="fz sh-block">
    <div class="fz-head"><div><div class="fz-kicker">5B.2 · Pile cap Check</div><div class="fz-title">Cap on piles under vessels and a platform — beam method, ACI 318M-19</div></div>
      <div class="fz-tags"><span class="fz-tag">factored LRFD combinations</span><span class="fz-tag sh-dc ${v.pass ? 'ok' : 'bad'}">D/C = ${fmt(g.uc, 3)} · ${v.pass ? 'PASS' : 'FAIL'}</span></div></div>
    <div class="fz-tiles">
      ${tile('Cap B × L × t', `${fmt(v.Bf, 2)} × ${fmt(v.Lf, 2)} × ${fmt(v.t / 1000, 2)}<span class="fz-unit">m</span>`, `${v.piles.length} piles · ${v.columns.length} platform columns · ${v.vessels.length} vessels`)}
      ${tile('Bars, top and bottom', `${escapeHtml(v.bars)}`, '<span class="fz-nb">one mat</span>')}
      ${tile('Governing check', `${fmt(g.uc, 3)}`, `${escapeHtml(g.name)}${g.lc && g.lc !== '-' ? ` · L/C ${escapeHtml(String(g.lc))}` : ''}`)}
    </div>
    <div class="fz-card fz-diagram" style="padding:12px;">${planSvg(v)}</div>
    <div class="fz-card" style="padding:12px;display:grid;gap:4px;">${momentSvg(v.momentZ, 'Moment along the long side', 'kN·m')}${momentSvg(v.momentX, 'Moment across the width', 'kN·m')}</div>
    <div class="fz-card" style="padding:14px;"><div class="fz-tile-label" style="margin-bottom:8px;">Demand / capacity of every check (line at 1.0)</div>${ratioBars(v.checks)}</div>
  </section>`;
}
