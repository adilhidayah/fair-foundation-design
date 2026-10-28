// Failure-mode cards use the library's check operands. No capacity calculation in the UI.
import { escapeHtml } from '../core/dom.js?v=20261028p3';
import { fmt } from '../core/format.js?v=20261028p3';
import { anchorFailureDiagramSVG } from '../diagrams/anchorFailureDiagram.js?v=20261028p3';

const MODE = {
  steelN: ['Steel failure · tension', 'The anchor steel carries tensile force.'],
  breakoutN: ['Concrete breakout · tension', 'Tension can detach a concrete cone; group projected areas apply in group mode.'],
  pullout: ['Pullout', 'Local concrete bearing beneath a cast-in anchor head.'],
  blowout: ['Side-face blowout', 'A deeply embedded head near an edge can cause failure of the side face.'],
  steelV: ['Steel failure · shear', 'Steel shear check at the anchor; the grout-pad factor follows Section 02.'],
  breakoutV: ['Concrete breakout · shear', 'Concrete can break toward the free edge in the shear direction.'],
  pryout: ['Concrete pryout', 'Shear can pry concrete out behind the anchor.'],
  reinfN: ['Anchor reinforcement · tension', 'Reinforcement transfers tension in place of concrete breakout; development must be adequate.'],
  reinfV: ['Anchor reinforcement · shear', 'Reinforcement transfers shear in place of concrete breakout; development and tie requirements apply.']
};

export function anchorModeList(result, group) {
  if (!result.modeDetails) return [];
  const details = [...result.modeDetails];
  for (const [key, replaced, clause] of [['reinfN', 'breakoutN', '17.6.2'], ['reinfV', 'breakoutV', '17.7.2']]) {
    const index = details.findIndex(m => m.key === key);
    if (index >= 0) details.splice(index, 0, { key: replaced, clause, replaced: true, note: 'Replaced by the anchor reinforcement check in the current model.' });
  }
  if (!group) details.splice(3, 0, { key: 'blowout', clause: '17.6.4', notChecked: true, note: 'Not checked by the single-anchor simplification. Use the group method where its assumptions apply.' });
  return details.map(m => ({ ...m, title: MODE[m.key]?.[0] || m.name }));
}

export function anchorModesHTML(result, group, selected) {
  const details = anchorModeList(result, group);
  const m = details.find(q => q.key === selected) || details[0];
  if (!m) return '<div class="fz-note">No mechanism results available.</div>';
      const [name, description] = MODE[m.key] || [m.name, ''];
      const defined = typeof m.uc === 'number' && !Number.isNaN(m.uc);
      const status = m.replaced ? 'REPLACED' : m.notChecked ? 'NOT CHECKED' : m.applicable === false ? 'NOT REQUIRED' : !defined ? 'UNDEFINED' : m.uc <= 1 ? 'PASS' : 'FAIL';
      const color = status === 'PASS' ? 'ok' : status === 'FAIL' || status === 'UNDEFINED' ? 'bad' : '';
      const number = n => Number.isFinite(n) ? fmt(n, 2) : n === Infinity ? '∞' : '—';
      const show = !m.replaced && !m.notChecked && m.applicable !== false;
      return `<div class="av-mode-select"><label for="ab-focus-mode">Failure mechanism</label><select id="ab-focus-mode">${details.map(q => `<option value="${q.key}" ${q === m ? 'selected' : ''}>${escapeHtml(q.title)} · §${q.clause}</option>`).join('')}</select></div>
      <div class="av-scene"><div class="cad-stage av-stage">${anchorFailureDiagramSVG(m.key, name)}<div class="av-caption">Concept sketch · not a calculated fracture surface or construction detail</div></div>
      <article class="af-mode av-inspector"><header><div><h3>${escapeHtml(name)}</h3><span class="af-clause">ACI §${escapeHtml(m.clause)}</span></div><span class="fz-tag ${color}">${status}</span></header>
        <p class="af-description">${escapeHtml(description)}</p>
        <div class="af-basis">${escapeHtml(m.basis || 'Outside this method')}</div>
        ${show ? `<dl><div><dt>Demand</dt><dd>${number(m.demand)} kN</dd></div><div><dt>Design capacity φR<sub>n</sub></dt><dd>${number(m.capacity)} kN</dd></div><div><dt>UC</dt><dd>${defined ? (Number.isFinite(m.uc) ? fmt(m.uc, 3) : '∞') : '—'}</dd></div></dl>` : '<div class="af-inactive">No demand / capacity ratio reported.</div>'}
        ${m.note ? `<p class="fz-note">${escapeHtml(m.note)}</p>` : ''}
      </article></div>`;
}
