// 03 — Loading Data: Focus Canvas view (#focus-loading, inside .ld-results). Shown instead of the A4 sheet (.ld-page) while the
// preview is in Focus Canvas mode (css/app.css); Report Preview and print keep .ld-page.
// Builds markup only — the vectors come from renderLcSummary() (buildStdComboBase() / stdComboVector(), the same numbers as the
// 3.3 tables); the envelope only picks maxima / minima of those rows. Declarations only. Reuses the .fz-* layout.
import { escapeHtml } from '../core/dom.js?v=20261028e4';
import { fmt } from '../core/format.js?v=20261028e4';

// d: { modeLabel, status: { status }, nTypes, nAsd, nLrfd, dW, dh, untyped: [code], cWord,
//      types: [{ code, label, kindLabel, v: { Fx, Fz, P, Mx, Mz } | null }],
//      rows: [{ lc, name, P, H, M }] (ASD, bottom of footing), svg }
export function loadingFocusHTML(d) {
  const ok = d.status.status === 'PASS';
  const pick = (key, sign) => d.rows.reduce((a, r) => (a === null || sign * r[key] > sign * a[key] ? r : a), null);
  const pMax = pick('P', 1), pMin = pick('P', -1), hMax = pick('H', 1), mMax = pick('M', 1);
  const nb = (t) => `<span class="fz-nb">${t}</span>`;
  const tile = (label, r, key, unit, note) => `<div class="fz-tile"><div class="fz-tile-label">${label}</div>
    <div class="fz-tile-value">${r ? fmt(r[key], 1) : '—'}<span class="fz-unit">${unit}</span></div>
    <div class="fz-tile-sub">${r ? `${nb(`LC ${escapeHtml(r.lc || r.name)}`)}${note ? ` · ${note}` : ''}` : 'No combinations'}</div></div>`;
  const tiles = [
    tile('Max. vertical P', pMax, 'P', 'kN', 'compression'),
    tile('Min. vertical P', pMin, 'P', 'kN', pMin && pMin.P < 0 ? '<span class="fz-warn">net uplift</span>' : 'least compression'),
    tile('Max. horizontal H', hMax, 'H', 'kN', nb('√(F<sub>x</sub>² + F<sub>z</sub>²)')),
    tile('Max. moment M', mMax, 'M', 'kN·m', nb('√(M<sub>x</sub>² + M<sub>z</sub>²)'))
  ].join('');
  const v2 = (x) => `<td class="fz-num${Math.abs(x) < 1e-9 ? ' fz-zero' : ''}">${fmt(x, 2)}</td>`;
  const typeRows = d.types.map((t) => t.v
    ? `<tr><td class="fz-doc">${escapeHtml(t.code)}</td><td>${escapeHtml(t.label)}<div class="fz-kind">${escapeHtml(t.kindLabel)}</div></td>${v2(t.v.Fx)}${v2(t.v.Fz)}${v2(t.v.P)}${v2(t.v.Mx)}${v2(t.v.Mz)}</tr>`
    : `<tr class="fz-invalid"><td class="fz-doc">${escapeHtml(t.code)}</td><td colspan="6">${escapeHtml(t.label)} — no type, not included in the combinations</td></tr>`).join('');
  const env = new Set([pMax, pMin, hMax, mMax]);
  const cell = (r, key, gov) => `<td class="fz-num${gov ? ' fz-env' : ''}">${fmt(r[key], 1)}</td>`;
  const comboRows = d.rows.map((r) => `<tr${env.has(r) ? ' class="fz-gov"' : ''}><td class="fz-num">${escapeHtml(r.lc)}</td><td>${escapeHtml(r.name)}</td>` +
    cell(r, 'P', r === pMax || r === pMin) + cell(r, 'H', r === hMax) + cell(r, 'M', r === mMax) + '</tr>').join('');
  const tags = [`<span class="fz-tag">${d.nTypes} load types</span>`, `<span class="fz-tag">${d.nAsd} ASD · ${d.nLrfd} LRFD</span>`,
    d.untyped.length ? `<span class="fz-tag bad">No type: ${escapeHtml(d.untyped.join(', '))}</span>` : '',
    ok ? '<span class="fz-tag ok">Loads ready</span>' : '<span class="fz-tag bad">Needs load types &amp; combinations</span>'].join('');
  return `<div class="fz">
    <div class="fz-head">
      <div><div class="fz-kicker">03 · Loading Data</div><div class="fz-title">${escapeHtml(d.modeLabel)}</div></div>
      <div class="fz-tags">${tags}</div>
    </div>
    <div class="fz-sub fz-sub-plain">ASD envelope at the bottom of the ${d.cWord} (incl. ΔW = ${fmt(d.dW, 1)} kN, Δh = ${fmt(d.dh, 3)} m)</div>
    <div class="fz-tiles even">${tiles}</div>
    <div class="fz-card">
        <div class="fz-sub">Load types — unfactored, top of pedestal</div>
        <div class="fz-scroll"><table class="fz-table fz-uc-table">
          <tr><th>Code</th><th>Load</th><th class="fz-num">F<sub>x</sub></th><th class="fz-num">F<sub>z</sub></th><th class="fz-num">P</th><th class="fz-num">M<sub>x</sub></th><th class="fz-num">M<sub>z</sub></th></tr>
          ${typeRows}
        </table></div>
        <div class="fz-note">Forces in kN, moments in kN·m. Direction from each load type's kind (X: F<sub>x</sub> / M<sub>z</sub>, Z: F<sub>z</sub> / M<sub>x</sub>).</div>
      </div>
    <div class="fz-card fz-diagram fz-diagram-narrow">
        <div class="fz-sub">Load transfer — top of pedestal → bottom of ${d.cWord}</div>
        ${d.svg}
        <div class="fz-note">P<sub>bot</sub> = P<sub>top</sub> + ΔW (dead load only) · M<sub>z,bot</sub> = M<sub>z,top</sub> + F<sub>x</sub>·Δh · M<sub>x,bot</sub> = M<sub>x,top</sub> − F<sub>z</sub>·Δh</div>
    </div>
    <div class="fz-card">
      <div class="fz-sub">ASD combinations — bottom of ${d.cWord}</div>
      <div class="fz-scroll"><table class="fz-table fz-uc-table">
        <tr><th class="fz-num">LC</th><th>Combination</th><th class="fz-num">P (kN)</th><th class="fz-num">H (kN)</th><th class="fz-num">M (kN·m)</th></tr>
        ${comboRows || '<tr><td colspan="5" class="fz-empty">No ASD combinations — load them with "Edit Load Combinations".</td></tr>'}
      </table></div>
      <div class="fz-note">H and M are the resultants of the biaxial components (the same P, H, M that 4A / 4B check). Highlighted: envelope values above. Per-direction components (F<sub>x</sub>, F<sub>z</sub>, M<sub>x</sub>, M<sub>z</sub>) and the LRFD sets are in Report Preview.</div>
    </div>
  </div>`;
}
