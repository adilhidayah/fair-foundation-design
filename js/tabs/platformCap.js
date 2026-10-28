// 5B — pile cap under vessels and a platform (beam method). The platform columns stand on the cap at their own positions
// (state.platformColumnList); the load points of Tab 02 are the vessels. For every factored (LRFD) combination lib/foundation/shared/
// pileCapPlatform.js gives the face moments, the moments / shears of the cap as a beam between the pile rows and lines, and this
// panel shows the envelope against the bars: flexure x / z top / bottom, one-way shear, crack control and the punching of the columns.
// Display + input parsing only — all formulas are in lib/.
import { evaluatePileGroupCombo, eccentricPunchingStress, pileCapPlatformCombo, pileCapPlatformEnvelope, twoWayShearCheck } from '../../lib/foundation/index.js?v=20261028e4';
import { escapeHtml, getRadioVal, num } from '../core/dom.js?v=20261028e4';
import { fmt } from '../core/format.js?v=20261028e4';
import { lastResults, pileList, platformColumnList } from '../core/state.js?v=20261028e4';
import { loadPointsActive } from '../tabs/loadPoints.js?v=20261028e4';
import { pileComboLoads } from '../tabs/pile.js?v=20261028e4';
import { renderShearFocus } from '../tabs/shearFocus.js?v=20261028e4';

const NO_CAP = { Qc: 1e12, Qt: 1e12, Ql: 1e12 };

// "x z c1 c2 D L E(O) ..." header, one row per column; separators: tab, comma, semicolon, spaces. Returns { columns, codes, errors }.
export function parsePlatformColumns(text) {
  const rows = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#')).map(l => l.split(/[\t,;\s]+/));
  const errors = [];
  if (rows.length < 2) return { columns: [], codes: [], errors: ['Give a header row and at least one column.'] };
  const head = rows[0], fixed = ['x', 'z', 'c1', 'c2'];
  if (fixed.some((h, i) => (head[i] || '').toLowerCase() !== h)) return { columns: [], codes: [], errors: ['The header must start with: x z c1 c2.'] };
  const codes = head.slice(4);
  const columns = [];
  rows.slice(1).forEach((r, k) => {
    const v = r.map(Number);
    if (v.length < 4 || v.slice(0, 4).some(a => !Number.isFinite(a))) { errors.push(`Row ${k + 1}: x, z, c1, c2 must be numbers.`); return; }
    const P = {};
    codes.forEach((c, i) => { const a = v[4 + i]; P[c] = Number.isFinite(a) ? a : 0; });
    columns.push({ x: v[0], y: v[1], c1: v[2], c2: v[3], P });
  });
  return { columns, codes, errors };
}

function columnLoad(col, f) { return Object.keys(f || {}).reduce((s, k) => s + (col.P[k] || 0) * (f[k] || 0), 0); }

// Small moment diagram of the governing combination (z direction): the whole width, kN·m, sagging down.
function momentSvg(beam, s0, s1, title) {
  const W = 560, H = 150, pad = 28, n = 200;
  const xs = Array.from({ length: n + 1 }, (_, k) => s0 + (s1 - s0) * k / n), ms = xs.map(s => beam.momentAt(s));
  const mmax = Math.max(...ms, 1), mmin = Math.min(...ms, -1), span = mmax - mmin;
  const X = (s) => pad + (s - s0) / (s1 - s0) * (W - 2 * pad), Y = (m) => pad / 2 + (mmax - m) / span * (H - pad);
  const pts = xs.map((s, k) => `${X(s).toFixed(1)},${Y(ms[k]).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:${W}px;display:block;margin:6px 0;font:10px monospace;"><title>${escapeHtml(title)}</title>
    <line x1="${pad}" x2="${W - pad}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}" stroke="currentColor" stroke-width=".6" opacity=".5"/>
    <polyline fill="none" stroke="var(--accent,#2b6cb0)" stroke-width="1.6" points="${pts}"/>
    <text x="${pad}" y="10" fill="currentColor">M max ${fmt(mmax, 1)} kN·m (bottom tension, drawn up) / min ${fmt(mmin, 1)}</text></svg>`;
}

export function calcPlatformCap() {
  const out = document.getElementById('calc-platformcap');
  if (!out) return;
  const active = getRadioVal('fs-support') === 'pile' && loadPointsActive() && platformColumnList.length > 0;
  if (!active) { out.innerHTML = ''; lastResults.platformCap = null; lastResults.platformCapViz = null; renderShearFocus(); return; }
  const fail = (m) => { lastResults.platformCapViz = null; renderShearFocus(); out.innerHTML = `<div class="warn-box"><strong>Platform pile cap:</strong> ${m}</div>`; lastResults.platformCap = { label: 'Platform pile cap', status: 'ERROR', metric: '—', detail: m }; };
  const Bf = num('fs-Bf'), Lf = num('fs-Lf'), t = num('rb-t'), cc = num('rb-cc'), bar = num('rb-capbar'), fc = num('gen-fc'), fy = num('gen-fy');
  const dp = num('pf-dia') / 1000;
  if (!(pileList.length >= 2 && dp > 0 && Bf > 0 && Lf > 0 && t > 0 && bar > 0 && fc > 0 && fy > 0)) return fail('piles, pile width, cap size, thickness, bar and material strengths must be set.');
  const { items } = pileComboLoads('lrfd');
  if (!items.length) return fail('no factored (LRFD) combinations.');
  const dx = (t - cc - bar) / 1000, dz = dx - bar / 1000;
  const results = [], punch = platformColumnList.map(() => ({ P: 0, lc: '-' }));
  let ringD = 0;
  for (const it of items) {
    if (!it.pointLoads || !it.pointLoads.length) continue;
    const ev = evaluatePileGroupCombo(pileList, it.load, NO_CAP);
    if (!ev.valid) continue;
    const cols = platformColumnList.map(c => ({ x: c.x, y: c.y, c1: c.c1, c2: c.c2, P: columnLoad(c, it.combo.f) }));
    const sumCol = cols.reduce((s, c) => s + c.P, 0);
    ringD = it.pointLoads.reduce((s, p) => s + p.c1, 0) / it.pointLoads.length;
    const vessels = it.pointLoads.map(p => ({ x: p.x, y: p.y, P: p.P - p.f * sumCol, Mx: 0, Mz: 0 }));
    const r = pileCapPlatformCombo({ cap: { B: Bf, L: Lf, W: it.Pcap, dx, dz }, pileForces: ev.pileForces, dp, vessels, ringD, columns: cols });
    if (r.valid) results.push({ lc: it.combo.lc, ...r });
    cols.forEach((c, k) => { if (c.P > punch[k].P) punch[k] = { P: c.P, lc: it.combo.lc }; });
  }
  if (!results.length) return fail('no combination gave a valid section analysis (check the load points and the pile layout).');
  const env = pileCapPlatformEnvelope(results, { B: Bf, L: Lf }, { bar, cc, fc, fy, t });
  if (!env.valid) return fail(env.note);
  // column punching: V_u = the column load (no pile inside the section is ignored — conservative), interior
  const colPunch = platformColumnList.map((c, k) => {
    const e = eccentricPunchingStress({ c1: c.c1 * 1000, c2: c.c2 * 1000, d: t - cc - bar, Vu: punch[k].P, Mx: 0, Mz: 0 });
    const tw = twoWayShearCheck({ c1: c.c1 * 1000, c2: c.c2 * 1000, h: t, cc, Dbar: bar, fc, vu: punch[k].P, lambda: 1, loc: 'interior' });
    return { k, lc: punch[k].lc, Vu: punch[k].P, vu: e.valid ? e.vu : NaN, phiVc: tw.valid ? tw.phi * tw.vc_gov : NaN, uc: e.valid && tw.valid ? e.vu / (tw.phi * tw.vc_gov) : Infinity };
  });
  const cp = colPunch.reduce((a, b) => (b.uc > a.uc ? b : a));
  const checks = [...env.checks, { name: `Punching, platform column ${cp.k + 1}`, lc: cp.lc, uc: cp.uc }];
  const gov = checks.reduce((a, b) => (b.uc > a.uc ? b : a));
  const pass = env.pass && cp.uc <= 1;
  const bars = `D${bar}-${env.spacing}`;
  const gz = results.reduce((a, b) => (b.beamZ.Mpos > a.beamZ.Mpos ? b : a));
  const fmtUc = (u) => `<td class="num${u > 1 ? ' fail' : ''}">${fmt(u, 3)}</td>`;
  let html = `<div class="section-label">5B.2 Pile cap on piles under vessels and a platform — beam method (ACI 318M-19)</div>
    <p>The cap carries ${platformColumnList.length} platform columns at their own positions and ${items[0].pointLoads.length} vessel(s) on base rings of ${fmt(ringD, 3)} m. For every factored combination the cap is analysed as a beam between the pile rows (x) and pile lines (z) from the pile reactions, with the vessel couples balanced by statics; the bottom bars take the larger of the face moment and the beam sagging moment, the top bars the hogging. One mat ${bars} is used top and bottom (the largest required of the four sections, spacing in 25 mm steps).</p>
    <table class="calc-table"><caption>Table 5B.2.1. Flexure against the bars provided (all LRFD combinations)</caption>
    <tr><th>Section</th><th>L/C</th><th>M<sub>u</sub> kN·m</th><th>b mm</th><th>d mm</th><th>A<sub>s,calc</sub></th><th>A<sub>s,min</sub></th><th>A<sub>s,prov</sub> mm²</th><th>φM<sub>n</sub> kN·m</th><th>M<sub>u</sub>/φM<sub>n</sub></th></tr>
    ${env.flexure.map(f => `<tr><td>${f.key}</td><td>${escapeHtml(String(f.lc))}</td><td class="num">${fmt(f.Mu, 1)}</td><td class="num">${fmt(f.b, 0)}</td><td class="num">${fmt(f.d, 1)}</td><td class="num">${fmt(f.AsCalc, 0)}</td><td class="num">${fmt(f.AsMin, 0)}</td><td class="num">${fmt(f.AsProv, 0)}</td><td class="num">${fmt(f.phiMn, 1)}</td>${fmtUc(f.ratio)}</tr>`).join('')}</table>
    <table class="calc-table"><caption>Table 5B.2.2. One-way shear at d from the faces of the vessel footprint</caption>
    <tr><th>Direction</th><th>L/C</th><th>V<sub>u</sub> kN</th><th>b<sub>w</sub> mm</th><th>d mm</th><th>ρ<sub>w</sub> %</th><th>φv<sub>c</sub> MPa</th><th>Ratio</th></tr>
    ${env.shear.map(s => `<tr><td>${s.axis}</td><td>${escapeHtml(String(s.lc))}</td><td class="num">${fmt(s.Vu, 1)}</td><td class="num">${fmt(s.bw, 0)}</td><td class="num">${fmt(s.d * 1000 / 1000, 1)}</td><td class="num">${fmt(s.rho * 100, 3)}</td><td class="num">${fmt(s.phiVc / (s.bw * s.d) , 3)}</td>${fmtUc(s.ratio)}</tr>`).join('')}</table>
    <table class="calc-table"><caption>Table 5B.2.3. Crack control, platform column punching and the governing check</caption>
    <tr><th>Check</th><th>L/C</th><th>Demand</th><th>Limit</th><th>Ratio</th></tr>
    <tr><td>Crack control, bar spacing (§24.3.2)</td><td>—</td><td class="num">${fmt(env.crack.s, 0)} mm</td><td class="num">${fmt(env.crack.sAll, 1)} mm</td>${fmtUc(env.crack.uc)}</tr>
    <tr><td>Punching, platform column ${cp.k + 1} (largest load)</td><td>${escapeHtml(String(cp.lc))}</td><td class="num">${fmt(cp.vu, 3)} MPa</td><td class="num">${fmt(cp.phiVc, 3)} MPa</td>${fmtUc(cp.uc)}</tr>
    <tr class="governing"><td><strong>Governing: ${escapeHtml(gov.name)}</strong></td><td>${escapeHtml(String(gov.lc))}</td><td></td><td></td>${fmtUc(gov.uc)}</tr></table>
    <p><strong>Moment along z, L/C ${escapeHtml(String(gz.lc))}</strong> (whole width ${fmt(Bf, 2)} m):</p>${momentSvg(gz.beamZ, -Lf / 2, Lf / 2, 'Moment along z')}
    <div class="limits-box"><strong>Limitation:</strong> statics from the pile reactions of a rigid cap (no cap-pile stiffness model); the vessel base-ring pressure is linear over the ring diameter and its couple is whatever balances the load case; column base moments are not used; punching of the vessel and of the piles is in 5B.1. Cap weight is taken from Section 02.</div>`;
  out.innerHTML = html;
  // Focus Canvas data (js/tabs/platformCapFocus.js): geometry, the checks and the moment curves of the governing combinations.
  const sample = (beam, s0, s1) => Array.from({ length: 121 }, (_, k) => { const q = s0 + (s1 - s0) * k / 120; return [q, beam.momentAt(q)]; });
  const gx = results.reduce((a, b) => (b.beamX.Mpos > a.beamX.Mpos ? b : a));
  lastResults.platformCapViz = {
    Bf, Lf, t, bars, pass, gov, dp, ringD, piles: pileList.map(p => ({ x: p.x, y: p.y })),
    vessels: items[0].pointLoads.map(p => ({ x: p.x, y: p.y })), columns: platformColumnList.map(c => ({ x: c.x, y: c.y, c1: c.c1, c2: c.c2 })), punchK: cp.k,
    footprint: results[0].footprint, checks, momentZ: { lc: gz.lc, pts: sample(gz.beamZ, -Lf / 2, Lf / 2) }, momentX: { lc: gx.lc, pts: sample(gx.beamX, -Bf / 2, Bf / 2) }
  };
  lastResults.platformCap = { label: 'Platform pile cap', status: pass ? 'PASS' : 'FAIL', metric: `${fmt(gov.uc, 3)} (${gov.name})`, detail: `${gov.name}, UC = ${fmt(gov.uc, 3)}` };
  renderShearFocus();
}
