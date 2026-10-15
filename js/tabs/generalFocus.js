// 01 — General Input Data: Focus Canvas view (#focus-general). Shown instead of the A4 report sheet while the preview is in
// Focus Canvas mode (css/app.css); Report Preview and print keep #calc-general.
// Builds markup only — every value is the one renderGeneralSummary() puts in the report, nothing is recomputed here.
// Declarations only. Reuses the .fz-* layout of the 02 Focus view (js/tabs/foundSizeFocus.js).
import { escapeHtml } from '../core/dom.js?v=20261015e';
import { fmt } from '../core/format.js?v=20261015e';

// d: { projName, isPile, status: { status, note }, fc, Ec, fy, gc, gl, gs, qa: { qa, given }, fs: { otPerm, otTemp, slPerm, slTemp, distinct },
//      pile: { type, D, L, Qc, Qt, Ql }, standards: [{ docNo, title }] }
export function generalFocusHTML(d) {
  const ok = d.status.status === 'PASS';
  const statusTag = ok ? '<span class="fz-tag ok">Inputs valid</span>' : '<span class="fz-tag bad">Check f′<sub>c</sub>, f<sub>y</sub>, γ<sub>c</sub>, γ<sub>s</sub> &gt; 0</span>';
  const nb = (t) => `<span class="fz-nb">${t}</span>`;
  const tile = (label, value, sub) => `<div class="fz-tile"><div class="fz-tile-label">${label}</div><div class="fz-tile-value">${value}</div>${sub ? `<div class="fz-tile-sub">${sub}</div>` : ''}</div>`;
  const unit = (u) => `<span class="fz-unit">${u}</span>`;
  const qaTile = d.isPile
    ? tile('Pile capacity P<sub>all</sub>', `${fmt(d.pile.Qc, 1)}${unit('kN')}`, `${nb(`T<sub>all</sub> = ${fmt(d.pile.Qt, 1)} kN`)} · ${nb(`H<sub>all</sub> = ${fmt(d.pile.Ql, 1)} kN`)}`)
    : tile('Allowable bearing q<sub>a</sub>', d.qa.qa !== null ? `${fmt(d.qa.qa, 1)}${unit('kPa')}` : (d.qa.given ? 'NOT SET' : '—'),
        d.qa.given ? 'Given — geotechnical report (Tab 08)' : 'Computed in Tab 08');
  const tiles = [
    tile("Concrete f'<sub>c</sub>", `${fmt(d.fc, 1)}${unit('MPa')}`, nb(`E<sub>c</sub> = 4700√f'<sub>c</sub> = ${fmt(d.Ec, 0)} MPa`)),
    tile('Rebar f<sub>y</sub>', `${fmt(d.fy, 1)}${unit('MPa')}`, nb('E<sub>s</sub> = 200,000 MPa')),
    tile('Unit weight γ<sub>c</sub> / γ<sub>s</sub>', `${fmt(d.gc, 2)} / ${fmt(d.gs, 2)}${unit('kN/m³')}`, nb(`γ<sub>L</sub> = ${fmt(d.gl, 2)} kN/m³ (lean concrete)`)),
    qaTile
  ].join('');
  const stdRows = d.standards.length
    ? d.standards.map((s, i) => `<tr><td class="fz-num">${i + 1}</td><td class="fz-doc">${escapeHtml(s.docNo)}</td><td>${escapeHtml(s.title)}</td></tr>`).join('')
    : '<tr><td colspan="3" class="fz-empty">No design standards listed — add them in the input panel.</td></tr>';
  const row = (label, value) => `<tr><td>${label}</td><td class="fz-num">${value}</td></tr>`;
  const geoRows = d.isPile
    ? row('Pile type', escapeHtml(d.pile.type || '—')) + row('Pile diameter, D', `${fmt(d.pile.D, 0)} mm`) + row('Embedment length, L', `${fmt(d.pile.L, 1)} m`) +
      row('Allowable compression, P<sub>all</sub>', `${fmt(d.pile.Qc, 1)} kN`) + row('Allowable tension / uplift, T<sub>all</sub>', `${fmt(d.pile.Qt, 1)} kN`) +
      row('Allowable lateral, H<sub>all</sub>', `${fmt(d.pile.Ql, 1)} kN`)
    : row(`Allowable bearing capacity, q<sub>a</sub>${d.qa.given ? ' (geotechnical report)' : ''}`, d.qa.qa !== null ? `${fmt(d.qa.qa, 1)} kPa` : (d.qa.given ? 'NOT SET' : '—')) +
      row('FS overturning — permanent', fmt(d.fs.otPerm, 2)) + row('FS overturning — temporary (wind / seismic)', fmt(d.fs.otTemp, 2)) +
      row('FS sliding — permanent', fmt(d.fs.slPerm, 2)) + row('FS sliding — temporary (wind / seismic)', fmt(d.fs.slTemp, 2));
  return `<div class="fz">
    <div class="fz-head">
      <div><div class="fz-kicker">01 · General Input Data</div><div class="fz-title">${escapeHtml(d.projName)}</div></div>
      <div class="fz-tags"><span class="fz-tag">${d.isPile ? 'Pile foundation' : 'Shallow foundation'}</span><span class="fz-tag">SI units</span>${statusTag}</div>
    </div>
    <div class="fz-tiles even">${tiles}</div>
    <div class="fz-cols">
      <div class="fz-card">
        <div class="fz-sub">Design standards <span class="fz-count">${d.standards.length}</span></div>
        <table class="fz-table"><tr><th class="fz-num">No</th><th>Document</th><th>Title</th></tr>${stdRows}</table>
      </div>
      <div class="fz-card">
        <div class="fz-sub">Geotechnical design criteria</div>
        <table class="fz-table"><tr><th>Parameter</th><th class="fz-num">Value</th></tr>${geoRows}</table>
        ${d.isPile ? '' : `<div class="fz-note">${d.fs.distinct ? 'Permanent and temporary minimums set separately (Tab 4A inputs).' : 'One minimum FS for permanent and temporary combinations (Tab 4A inputs).'}</div>`}
      </div>
    </div>
  </div>`;
}
