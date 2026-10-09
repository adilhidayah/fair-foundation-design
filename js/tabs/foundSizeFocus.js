// 02 — Foundation Dimension: Focus Canvas view (#focus-foundsize). Shown instead of the A4 report sheet while the
// preview is in Focus Canvas mode (css/app.css); Report Preview and print keep #calc-foundsize.
// Builds markup only — every value comes from calcFoundSize() (foundationSizing() / foundationGeometryCheck() results),
// nothing is recomputed here. Declarations only.
import { escapeHtml } from '../core/dom.js?v=20261009i';
import { fmt } from '../core/format.js?v=20261009i';
import { state } from '../core/state.js?v=20261009i';
import { foundIsoDiagramSVG } from '../diagrams/foundIsoDiagram.js?v=20261009i';

// CAD viewport views: [key, icon, label] — the key is the data-cad-view value and the #btn-* / #svg-* id suffix.
const CAD_VIEWS = [['plan', '📐', 'Plan View'], ['elev', '📏', 'Elevation View'], ['iso', '🧊', 'Isometric 2.5D']];
// Switch the viewport view in place (no re-render); state.fzView keeps it across calcFoundSize() re-renders.
export function setCadView(v) {
  if (!CAD_VIEWS.some(([k]) => k === v)) return;
  state.fzView = v;
  const vp = document.querySelector('#focus-foundsize .cad-viewport');
  if (!vp) return;
  vp.dataset.view = v;
  vp.querySelectorAll('[data-cad-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cadView === v)));
}

// The rules foundationGeometryCheck() applies (lib/foundation/static/foundationSizing.js), keyed by its issue codes, so the
// list can show which ones were checked and passed — not only the failures.
function geometryRules({ hasPed, isPile, fWord }) {
  const rules = [{ codes: ['size'], text: 'B<sub>f</sub>, L<sub>f</sub>, H<sub>f</sub> > 0' }];
  rules.push(hasPed
    ? { codes: ['depth'], text: `D<sub>f</sub> ≥ H<sub>f</sub> — ${fWord} within the embedment depth` }
    : { codes: ['depth'], text: `D<sub>f</sub> ≥ 0 — ${fWord} bottom not above ground` });
  if (hasPed) {
    rules.push({ codes: ['pedSize'], text: 'B<sub>p</sub>, L<sub>p</sub> > 0' });
    rules.push({ codes: ['pedX'], text: `Pedestal within the ${fWord} in x: |Off<sub>X</sub>| + B<sub>p</sub>/2 ≤ B<sub>f</sub>/2` });
    rules.push({ codes: ['pedZ'], text: `Pedestal within the ${fWord} in z: |Off<sub>Z</sub>| + L<sub>p</sub>/2 ≤ L<sub>f</sub>/2` });
  }
  if (isPile) rules.push({ codes: ['embed'], text: 'Pile embedment h < H<sub>f</sub>' });
  return rules;
}

// Invalid input (foundationSizing() returned valid: false) — same message as the report sheet.
export function foundSizeFocusInvalidHTML() {
  return `<div class="fz"><div class="fz-head"><div><div class="fz-kicker">02 · Foundation Dimension</div><div class="fz-title">Invalid input</div></div>
    <span class="fz-tag bad">Geometry not valid</span></div>
    <div class="fz-card fz-alert bad">B<sub>f</sub>, L<sub>f</sub>, H<sub>f</sub> must be greater than zero and D<sub>f</sub> ≥ 0. With a pedestal, D<sub>f</sub> ≥ H<sub>f</sub> as well.</div></div>`;
}

// d: { typeLabel, supportLabel, isPile, hasPed, isBlock, Bf, Lf, Hf, Df, Af, Bp, Lp, Gp, Dp, Hp, Ap, OffX, OffZ, groutT, HfTot,
//      nPiles, piles, D, hEmbed, weights: [{ label, sym, kN }], totalKN, deltaH, geom, svg }
export function foundSizeFocusHTML(d) {
  const fWord = d.isPile ? 'pile cap' : 'footing';
  const FWord = d.isPile ? 'Pile cap' : 'Footing';
  const nIssues = d.geom.issues.length;
  const statusTag = nIssues
    ? `<span class="fz-tag bad">${nIssues} geometry issue${nIssues > 1 ? 's' : ''}</span>`
    : '<span class="fz-tag ok">Geometry OK</span>';
  // Sub-line items ("Hp = 0.875 m") are kept on one line each; the line may break only between items.
  const nb = (t) => `<span class="fz-nb">${t}</span>`;
  const tile = (label, value, sub) => `<div class="fz-tile"><div class="fz-tile-label">${label}</div><div class="fz-tile-value">${value}</div>${sub ? `<div class="fz-tile-sub">${sub}</div>` : ''}</div>`;
  const tiles = [
    tile(`${FWord} B<sub>f</sub> × L<sub>f</sub> × H<sub>f</sub>`, `${fmt(d.Bf, 2)} × ${fmt(d.Lf, 2)} × ${fmt(d.Hf, 2)}<span class="fz-unit">m</span>`, nb(`A<sub>f</sub> = ${fmt(d.Af, 2)} m²`)),
    tile('Depth D<sub>f</sub>', `${fmt(d.Df, 2)}<span class="fz-unit">m</span>`,
      d.hasPed ? `${nb(`D<sub>p</sub> = ${fmt(d.Dp, 3)} m`)} below ground` : (d.Gp > 0 ? `projects ${nb(`${fmt(d.Gp, 3)} m`)} above ground` : 'top at / below ground')),
    d.hasPed
      ? tile('Pedestal B<sub>p</sub> × L<sub>p</sub>', `${fmt(d.Bp, 2)} × ${fmt(d.Lp, 2)}<span class="fz-unit">m</span>`, `${nb(`H<sub>p</sub> = ${fmt(d.Hp, 3)} m`)} · ${nb(`G<sub>p</sub> = ${fmt(d.Gp, 3)} m`)}`)
      : tile('Pedestal', 'None', `${FWord} only`),
    tile('Dead load D', `${fmt(d.totalKN, 1)}<span class="fz-unit">kN</span>`, `${nb(`Δh = ${fmt(d.deltaH, 3)} m`)} → Tab 03`)
  ].join('');
  const rules = geometryRules({ hasPed: d.hasPed, isPile: d.isPile, fWord });
  const failed = new Set(d.geom.issues.map((i) => i.code));
  const checks = rules.map((r) => {
    const bad = r.codes.some((c) => failed.has(c));
    return `<li class="${bad ? 'bad' : 'ok'}"><span class="fz-mark">${bad ? '✗' : '✓'}</span><span>${r.text}</span></li>`;
  }).join('') +
    d.geom.issues.map((i) => `<li class="bad detail"><span class="fz-mark"></span><span>${escapeHtml(i.text)}</span></li>`).join('') +
    d.geom.warnings.map((w) => `<li class="warn"><span class="fz-mark">!</span><span>${escapeHtml(w.text)}</span></li>`).join('');
  const weightRows = d.weights.map((w) => `<tr><td>${w.label}</td><td class="fz-sym">${w.sym}</td><td class="fz-num">${fmt(w.kN, 2)}</td></tr>`).join('');
  const extra = [];
  if (d.hasPed && (d.OffX || d.OffZ)) extra.push(`Pedestal offset Off<sub>X</sub> = ${fmt(d.OffX, 2)} m, Off<sub>Z</sub> = ${fmt(d.OffZ, 2)} m`);
  if (d.groutT > 0) extra.push(`Grout t<sub>G</sub> = ${fmt(d.groutT * 1000, 0)} mm${d.isBlock ? ` (H<sub>f,tot</sub> = ${fmt(d.HfTot, 3)} m)` : ''}`);
  if (d.isPile) extra.push(d.nPiles ? `${d.nPiles} piles from 4B (dashed in the plan)` : 'No piles defined yet — add them in 4B');
  // CAD viewport: Plan and Elevation are the report diagram (foundSizeDiagramSVG, viewBox 0 0 700 265: plan x 0-330,
  // elevation x 330-700) cropped by viewBox, so labels / piles / grout stay identical to the report; Isometric is its own
  // builder. Each copy gets its own marker id — a marker inside a hidden (display: none) SVG does not render elsewhere.
  const crop = (id, viewBox) => d.svg
    .replace('viewBox="0 0 700 265"', `viewBox="${viewBox}"`)
    .replace('<svg class="fdn-diagram"', `<svg id="svg-${id}" class="fdn-diagram cad-svg"`)
    .replaceAll('fsize-arrow', `fz-${id}-arrow`);
  const svgPlan = crop('plan', '0 0 328 265'), svgElev = crop('elev', '332 0 368 265');
  const svgIso = foundIsoDiagramSVG({ Bf: d.Bf, Lf: d.Lf, Hf: d.Hf, Df: d.Df, hasPed: d.hasPed, Bp: d.Bp, Lp: d.Lp, Gp: d.Gp,
    OffX: d.OffX, OffZ: d.OffZ, groutT: d.groutT, isPile: d.isPile, piles: d.piles, D: d.D, hEmbed: d.hEmbed });
  const view = CAD_VIEWS.some(([v]) => v === state.fzView) ? state.fzView : 'plan';
  const switcher = CAD_VIEWS.map(([v, icon, label]) =>
    `<button type="button" id="btn-${v}" data-cad-view="${v}" aria-pressed="${v === view}">${icon} ${label}</button>`).join('');
  return `<div class="fz">
    <div class="fz-head">
      <div><div class="fz-kicker">02 · Foundation Dimension</div><div class="fz-title">${escapeHtml(d.typeLabel)}</div></div>
      <div class="fz-tags"><span class="fz-tag">${escapeHtml(d.supportLabel)}</span>${statusTag}</div>
    </div>
    <div class="fz-tiles">${tiles}</div>
    ${extra.length ? `<div class="fz-extra">${extra.join(' · ')}</div>` : ''}
    <div class="fz-card fz-diagram cad-viewport" data-view="${view}">
      <div class="cad-switcher" role="group" aria-label="Viewport">${switcher}</div>
      <div class="cad-stage">${svgPlan}${svgElev}${svgIso}</div>
    </div>
    <div class="fz-cols">
      <div class="fz-card">
        <div class="fz-sub">Foundation self-weight</div>
        <table class="fz-table"><tr><th>Item</th><th>Symbol</th><th class="fz-num">kN</th></tr>${weightRows}
          <tr class="fz-total"><td>Total dead load</td><td class="fz-sym">D</td><td class="fz-num">${fmt(d.totalKN, 2)}</td></tr></table>
        <div class="fz-note">Goes to "03 — Loading Data" as ΔW, with Δh = ${fmt(d.deltaH, 3)} m (top of ${d.hasPed ? 'pedestal' : fWord} to underside of ${fWord}).</div>
      </div>
      <div class="fz-card">
        <div class="fz-sub">Geometry checks</div>
        <ul class="fz-checks">${checks}</ul>
      </div>
    </div>
  </div>`;
}
