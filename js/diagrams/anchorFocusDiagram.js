// Display-only plan of existing anchor forces. Geometry mm; tension kN.
import { escapeHtml } from '../core/dom.js?v=20261028e4';
import { fmt } from '../core/format.js?v=20261028e4';

export function anchorFocusDiagramSVG(forces, Bp, Lp) {
  if (!forces?.length || ![Bp, Lp].every(n => Number.isFinite(n) && n > 0) || forces.some(f => ![f.x, f.y, f.tension].every(Number.isFinite))) return '<div class="fz-note">Plan unavailable: non-finite geometry or forces.</div>';
  const cx = forces.reduce((s, b) => s + b.x, 0) / forces.length, cz = forces.reduce((s, b) => s + b.y, 0) / forces.length;
  const spanX = Math.max(Bp / 2, ...forces.map(b => Math.abs(b.x - cx))) * 2;
  const spanZ = Math.max(Lp / 2, ...forces.map(b => Math.abs(b.y - cz))) * 2;
  const scale = Math.min(390 / spanX, 290 / spanZ), X = x => 320 + (x - cx) * scale, Z = z => 205 - (z - cz) * scale;
  const left = X(cx - Bp / 2), right = X(cx + Bp / 2), top = Z(cz + Lp / 2), bottom = Z(cz - Lp / 2);
  const txt = (x, y, s, more = '') => `<text x="${x}" y="${y}" ${more}>${escapeHtml(s)}</text>`;
  return `<svg class="fdn-diagram ab-plan" viewBox="0 0 640 435" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Anchor plan with tensile demand per anchor; pedestal ${fmt(Bp, 0)} by ${fmt(Lp, 0)} mm" style="font-family:var(--sans);font-size:12px;fill:var(--ink)">
    <rect x="${left}" y="${top}" width="${Bp * scale}" height="${Lp * scale}" fill="var(--bg-subtle)" stroke="var(--primary)" stroke-width="2"/>
    <path d="M${left - 15} 205H${right + 25}M320 ${bottom + 15}V${top - 25}" stroke="var(--ink-soft)" stroke-dasharray="4 5" fill="none"/>
    ${txt(right + 30, 209, '+x')}${txt(324, top - 28, '+z')}
    <path d="M${left} ${bottom + 30}H${right}M${left} ${bottom + 25}V${bottom + 35}M${right} ${bottom + 25}V${bottom + 35}" stroke="var(--ink-soft)"/>
    ${txt(320, bottom + 48, `Bp ${fmt(Bp, 0)} mm`, 'text-anchor="middle"')}
    ${txt(320, top - 46, `Lp ${fmt(Lp, 0)} mm`, 'text-anchor="middle"')}
    ${forces.map(f => { const x = X(f.x), z = Z(f.y), side = f.x >= cx ? 1 : -1, up = f.y >= cz ? -1 : 1, color = f.tension > 0 ? 'var(--caution)' : 'var(--primary)';
      return `<g><title>${escapeHtml(`Anchor #${f.i}: x ${fmt(f.x, 0)}, z ${fmt(f.y, 0)} mm; tension ${fmt(f.tension, 2)} kN`)}</title><circle cx="${x}" cy="${z}" r="12" fill="${color}" stroke="var(--ink)" stroke-width="1"/>${txt(x, z + 4, `#${f.i}`, 'text-anchor="middle" font-size="10" fill="var(--bg-surface)"')}${txt(x + side * 18, z + up * 20, `${fmt(f.tension, 2)} kN`, `text-anchor="${side > 0 ? 'start' : 'end'}" font-weight="600"`)}</g>`;
    }).join('')}
    ${txt(20, 420, 'PLAN · tension demand only · no base-plate or reinforcement detail', 'fill="var(--ink-soft)" font-size="11"')}
  </svg>`;
}
