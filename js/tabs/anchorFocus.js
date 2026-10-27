// 09: presentation of anchor calculation snapshots. No design calculations here.
import { escapeHtml } from '../core/dom.js?v=20261028a4';
import { fmt } from '../core/format.js?v=20261028a4';
import { lastResults, state } from '../core/state.js?v=20261028a4';
import { comboLabel } from '../core/worksheet.js?v=20261028a4';
import { anchorFocusDiagramSVG } from '../diagrams/anchorFocusDiagram.js?v=20261028a4';

const ucText = n => Number.isFinite(n) ? fmt(n, 3) : n === Infinity ? '∞' : '—';
const tag = (uc, valid = true) => `<span class="fz-tag ${valid && uc <= 1 ? 'ok' : 'bad'}">${valid ? `UC ${ucText(uc)} · ${uc <= 1 ? 'PASS' : 'FAIL'}` : 'ERROR'}</span>`;

// Selection only changes the displayed snapshot; it does not run or alter calculations.
export function selectAnchorFocusCombo(value) {
  const v = lastResults.anchor?.viz;
  if (!v || !v.site.results.some(r => comboLabel(r.combo) === value)) return;
  state.anchorFocusLC = value;
  renderAnchorFocus();
}

export function renderAnchorFocus() {
  const panel = document.getElementById('focus-anchor');
  if (!panel) return;
  const result = lastResults.anchor, v = result?.viz;
  if (!v) {
    panel.innerHTML = `<section class="fz"><div class="fz-head"><div><div class="fz-kicker">09 · Anchor bolt design</div><div class="fz-title">${result?.status === 'NA' ? 'By mechanical vendor' : 'Anchor results unavailable'}</div></div><span class="fz-tag">${escapeHtml(result?.status || 'NOT COMPUTED')}</span></div><div class="fz-card">${escapeHtml(result?.detail || 'Complete the anchor inputs first.')}</div></section>`;
    return;
  }
  const group = v.method === 'group', s = v.site;
  const r = s.results.find(q => comboLabel(q.combo) === state.anchorFocusLC) || s.governing;
  const a = group ? r.res : r;
  const definedRatio = c => typeof c.uc === 'number' && !Number.isNaN(c.uc);
  const valid = group ? [...a.tension, ...a.shear, { uc: a.interaction }, { uc: a.uc }].every(definedRatio) : a.valid && a.checks.every(definedRatio);
  const uc = group ? a.uc : a.governingUC;
  const forces = group ? v.bolts.map((b, i) => {
    const f = a.anchors.find(q => Math.sign(q.x) === Math.sign(b.x - v.rect.cx) && Math.sign(q.z) === Math.sign(b.y - v.rect.cz));
    return { i: i + 1, x: b.x, y: b.y, tension: f?.T ?? 0 };
  }) : a.boltForces;
  const checks = group ? [...a.tension.map(m => ({ ...m, kind: 'Tension' })), ...a.shear.map(m => ({ ...m, kind: 'Shear' })), { name: 'Interaction (§17.8)', kind: 'Combined', uc: a.interaction }] : a.checks;
  const tile = (label, amount, sub) => `<div class="fz-tile"><div class="fz-tile-label">${label}</div><div class="fz-tile-value">${amount}</div><div class="fz-tile-sub">${sub}</div></div>`;
  const kN = n => `${fmt(n, 2)}<span class="fz-unit">kN</span>`;
  const boltTable = valid && forces ? `<div class="overflow-x"><table class="calc-table"><caption>Selected combination · tensile demand per anchor</caption><tr><th>Anchor</th><th>x (mm)</th><th>z (mm)</th><th>Tension (kN)</th></tr>${forces.map(f => `<tr><td>#${f.i}</td><td class="num">${fmt(f.x, 0)}</td><td class="num">${fmt(f.y, 0)}</td><td class="num">${fmt(f.tension, 2)}</td></tr>`).join('')}</table></div>` : '';
  panel.innerHTML = `<section class="fz ab-focus"><div class="fz-head"><div><div class="fz-kicker">09 · ACI 318M-19 Ch.17 · ${group ? 'Group of 4' : 'Single-anchor simplification'}</div><div class="fz-title">Anchor bolt design</div></div><span class="fz-tag ${result.status === 'PASS' ? 'ok' : 'bad'}">Envelope · ${escapeHtml(result.metric)} · ${escapeHtml(result.status)}</span></div>
    <div class="fz-note">${escapeHtml(result.detail)}</div>
    <div class="fz-card ab-select"><label for="ab-focus-combo">Inspect LRFD combination</label><select id="ab-focus-combo">${s.results.map(q => `<option value="${escapeHtml(comboLabel(q.combo))}" ${q === r ? 'selected' : ''}>${escapeHtml(comboLabel(q.combo))}${q === s.governing ? ' · GOVERNING' : ''}</option>`).join('')}</select>${tag(uc, valid)}</div>
    ${valid ? `<div class="fz-tiles even">${tile('Max anchor tension', kN(a.Tmax), 'Selected combination · per anchor')}${tile(group ? 'Group shear V' : 'Shear per anchor', kN(group ? a.V : a.Hi), group ? 'Resultant at pedestal top' : 'H / number of anchors')}${tile('Pedestal', `${fmt(s.Bp, 0)} × ${fmt(s.Lp, 0)}`, `mm · pedestal ${s.idx} of ${v.sites.length}`)}${tile('Anchor geometry', `D${fmt(v.da, 0)}`, `h<sub>ef</sub> ${fmt(v.hef, 0)} mm · ${v.bolts.length} anchors`)}</div>
    <div class="ab-layout"><div class="fz-card"><div class="fz-sub">Anchor plan · selected combination</div>${anchorFocusDiagramSVG(forces, s.Bp, s.Lp)}<div class="fz-note">Amber: tensile demand. Blue: zero tensile demand. Coordinates in mm; tensile forces in kN. Pedestal outline follows the calculation model, centred on the anchor-group centroid.</div>${boltTable}</div>
    <div class="fz-card"><div class="fz-sub">Demand / capacity · selected combination</div><div class="ab-check-list">${checks.map(c => {
      const bad = !Number.isFinite(c.uc) || c.uc > 1, width = Number.isFinite(c.uc) ? Math.min(100, Math.max(0, c.uc) / 1.5 * 100) : 100;
      return `<div class="ab-check"><div class="ab-check-head"><span>${escapeHtml(c.kind ? `${c.kind} · ${c.name}` : c.name)}</span><strong class="${bad ? 'ab-fail' : 'ab-pass'}">${ucText(c.uc)} · ${bad ? 'FAIL' : 'PASS'}</strong></div><div class="ab-meter" role="img" aria-label="${escapeHtml(`${c.name}: UC ${ucText(c.uc)}; limit 1.000`)}"><span style="width:${width}%;background:var(--${bad ? 'fail' : 'pass'})"></span><i></i></div></div>`;
    }).join('')}</div><div class="fz-note">Tick: UC = 1.000. Bars stop at UC 1.5; the number shows the full ratio. Ratios come directly from the calculation; group and per-anchor checks retain their own demand basis.</div>${!group ? `<div class="ab-strength"><div>Tension φN<sub>n</sub>: <strong>${fmt(s.cap.phiNn / 1000, 2)} kN/anchor</strong><br>${escapeHtml(s.cap.govNMode)}</div><div>Shear φV<sub>n</sub>: <strong>${fmt(s.cap.phiVn / 1000, 2)} kN/anchor</strong><br>${escapeHtml(s.cap.govVMode)}</div></div>` : `<div class="fz-note">${escapeHtml(s.R.text || 'No anchor reinforcement selected.')}</div>`}</div></div>` : `<div class="fz-card">${escapeHtml(a.note || 'One or more check ratios are undefined in the existing calculation for this combination. Review Report Preview; no complete check result can be shown.')}</div>`}
    ${v.sites.length > 1 ? `<div class="fz-card"><div class="fz-sub">All pedestals · envelope</div><div class="overflow-x"><table class="calc-table"><tr><th>Pedestal</th><th>Governing combination</th><th>UC</th><th>Status</th></tr>${v.sites.map(p => { const g = group ? p.governing.res : p.governing; const u = group ? g.uc : g.governingUC; return `<tr class="${p.idx === s.idx ? 'governing' : ''}"><td>${p.idx}</td><td>${escapeHtml(comboLabel(p.governing.combo))}</td><td>${ucText(u)}</td><td>${(group || g.valid) ? (u <= 1 ? 'PASS' : 'FAIL') : 'ERROR'}</td></tr>`; }).join('')}</table></div><div class="fz-note">The plan and combination selector inspect the governing pedestal ${s.idx}.</div></div>` : ''}
    <div class="fz-card ab-limit"><div class="fz-sub">Model &amp; limitations</div>${escapeHtml(group ? 'Four cast-in headed anchors in a rectangle; rigid base plate and cracked concrete. Steel shear uses V/4 in the current calculation. Case 2 ties use V/2 per anchor; this sharing issue remains open. Front-row shear breakout follows the dominant shear direction. Verify reinforcement detailing in Report Preview.' : 'Single-anchor simplification: group projected areas, side-face blowout, perpendicular edge and corner interaction are not checked. Shear is shared H/n; moment is reduced to a resultant about one axis. Use Report Preview for the full capacity breakdown.')} Base plate bearing and grout compressive strength are not checked. Steel shear grout factor: ${fmt(group ? s.governing.res.groutFactor : s.cap.groutFactor, 2)} (Section 02). Loads are factored LRFD actions at pedestal top.</div>
  </section>`;
}
