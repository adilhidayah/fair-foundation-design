// Conceptual failure mechanisms, not a scaled breakout surface or construction detail.
import { escapeHtml } from '../core/dom.js?v=20261028m2';

export function anchorFailureDiagramSVG(key, label) {
  const concrete = '<rect x="40" y="68" width="240" height="100" fill="var(--bg-subtle)" stroke="var(--line)" stroke-width="1.5"/>';
  const rod = '<path d="M160 48V140M145 140H175" fill="none" stroke="var(--primary)" stroke-width="7"/>';
  const up = '<path d="M160 40V15M152 25L160 15L168 25" class="af-force"/>';
  const right = '<path d="M178 48H226M216 40L226 48L216 56" class="af-force"/>';
  const zone = d => `<path d="${d}" class="af-zone"/>`;
  const crack = d => `<path d="${d}" class="af-crack"/>`;
  let shape = '', view = 'SECTION';
  switch (key) {
    case 'steelN': shape = concrete + rod + up + crack('M149 91l13 -6l-7 10l15 -4') + '<path d="M151 87h18" stroke="var(--panel)" stroke-width="6"/>' + crack('M149 91l13 -6l-7 10l15 -4'); break;
    case 'breakoutN': shape = concrete + zone('M65 68L160 140L255 68Z') + rod + up; break;
    case 'pullout': shape = concrete + zone('M133 122Q160 100 187 122L180 148H140Z') + rod + up + crack('M137 150l8 -5l8 6l9 -5l10 4l10 -5'); break;
    case 'blowout': shape = concrete + zone('M40 98L105 135L40 158Z') + '<path d="M105 48V135M90 135H120" fill="none" stroke="var(--primary)" stroke-width="7"/><path d="M105 40V15M97 25L105 15L113 25" class="af-force"/>' + crack('M40 98l9 10l-12 10l11 10l-10 12l9 10'); break;
    case 'steelV': shape = concrete + rod + right + crack('M148 68l14 -6l-6 10l15 -5'); break;
    case 'breakoutV': view = 'PLAN'; shape = concrete + zone('M160 118L280 75V161Z') + '<circle cx="160" cy="118" r="10" fill="var(--primary)"/><path d="M180 118H235M225 110L235 118L225 126" class="af-force"/>'; break;
    case 'pryout': shape = concrete + zone('M65 68L155 140L178 68Z') + rod + right + '<path d="M125 65V36M117 46L125 36L133 46" class="af-force"/>'; break;
    case 'reinfN': shape = concrete + rod + up + '<path d="M120 155V95Q120 80 132 80H145M200 155V95Q200 80 188 80H175" class="af-rebar"/>'; break;
    case 'reinfV': shape = concrete + rod + right + '<path d="M70 88H230V108H70M70 124H230V144H70" class="af-rebar"/>'; break;
    default: return '';
  }
  return `<svg class="af-diagram" viewBox="0 0 320 192" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeHtml(label)} — conceptual ${view.toLowerCase()}, not to scale">
    ${shape}<text x="160" y="187" text-anchor="middle" fill="var(--ink-soft)" font-family="var(--mono)" font-size="9">${view} · SCHEMATIC · NOT TO SCALE</text></svg>`;
}
