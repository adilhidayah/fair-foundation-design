// Settlement diagrams: presentation of existing results only, no geotechnical calculation.
import { escapeHtml } from '../core/dom.js?v=20261028m2';
import { fmt } from '../core/format.js?v=20261028m2';

const value = (n, digits = 2) => fmt(n, digits);
const text = (x, y, s, extra = '') => `<text x="${x}" y="${y}" ${extra}>${escapeHtml(s)}</text>`;
const ready = v => v && [v.total, v.allow].every(Number.isFinite) && v.total >= 0 && v.allow > 0;

// Geometry is schematic. Only the reference movement is visualized, not a soil/structural deformation field.
export function settlementDiagramSVG(v, view = 'overlay') {
  if (!ready(v)) return '';
  const pile = v.kind === 'pile', span = Math.max(v.total, v.allow), movement = 70 * v.total / span;
  const totalColor = v.ucTotal <= 1 ? 'var(--pass)' : 'var(--fail)';
  const limitY = 98 + 70 * v.allow / span, label = pile ? 'Sg' : 'Se + Sc';
  const section = pile ? v.piles.map(p => p[v.sectionAxis]) : [];
  const positions = [...new Set(section.map(x => Number(x.toFixed(6))))].sort((a, b) => a - b);
  const min = positions.length ? positions[0] - v.D / 2 : 0;
  const px = x => 130 + 300 * (x - min) / v.B;
  const pileWidth = pile ? Math.min(45, Math.max(8, v.D / v.B * 300)) : 0;
  const body = (after) => {
    const stroke = after ? 'var(--primary)' : 'var(--ink-soft)';
    return `<g class="st-foundation ${after ? 'st-after' : 'st-before'}" transform="translate(0 ${after ? movement.toFixed(3) : 0})"
      stroke="${stroke}" stroke-width="2" fill="${after ? 'var(--bg-subtle)' : 'none'}" ${after ? '' : 'stroke-dasharray="7 5"'}>
      <rect x="112" y="98" width="336" height="38" rx="2"/>
      ${pile ? positions.map(x => `<rect x="${(px(x) - pileWidth / 2).toFixed(2)}" y="136" width="${pileWidth.toFixed(2)}" height="122"/>`).join('')
        : '<rect x="243" y="62" width="74" height="36"/>'}
    </g>`;
  };
  return `<svg class="fdn-diagram st-settlement-svg" viewBox="0 0 680 365" xmlns="http://www.w3.org/2000/svg" role="img"
    aria-label="${escapeHtml(`${pile ? 'Pile group' : 'Shallow footing'} reference movement: ${value(v.total)} mm; allowable ${value(v.allow)} mm. Schematic geometry; displacement amplified.`)}"
    style="font-family:var(--sans);font-size:12px;fill:var(--ink)">
    ${text(28, 25, pile ? 'PILE GROUP · REFERENCE MOVEMENT' : 'SHALLOW FOOTING · REFERENCE MOVEMENT', 'font-size="12" font-weight="600"')}
    ${text(28, 47, view === 'before' ? 'Before settlement' : view === 'after' ? 'After settlement' : 'Before / after overlay', 'fill="var(--ink-soft)"')}
    <rect x="28" y="146" width="460" height="168" fill="var(--bg-subtle)"/>
    ${Array.from({ length: 12 }, (_, i) => `<line x1="${40 + i * 38}" y1="298" x2="${52 + i * 38}" y2="286" stroke="var(--line)"/>`).join('')}
    <line x1="75" y1="98" x2="502" y2="98" stroke="var(--ink-soft)" stroke-dasharray="3 5"/>
    ${view !== 'after' ? body(false) : ''}${view !== 'before' ? body(true) : ''}
    ${text(280, 338, `${pile ? 'Bg' : 'B'} = ${value(v.B)} m${pile ? ` · ${v.piles.length} piles, projected along ${v.sectionAxis}` : ` · L = ${value(v.L)} m`}`, 'text-anchor="middle"')}
    <line x1="555" y1="98" x2="555" y2="185" stroke="var(--line)" stroke-width="12"/>
    <line x1="555" y1="98" x2="555" y2="${(98 + movement).toFixed(3)}" stroke="${totalColor}" stroke-width="12"/>
    <circle cx="555" cy="${(98 + movement).toFixed(3)}" r="5" fill="${totalColor}"/>
    <line x1="540" y1="${limitY.toFixed(3)}" x2="578" y2="${limitY.toFixed(3)}" stroke="var(--ink)" stroke-width="2" stroke-dasharray="4 3"/>
    ${text(555, 82, '0', 'text-anchor="middle" fill="var(--ink-soft)"')}
    ${text(589, limitY + 4, 'limit', 'font-size="11"')}
    ${text(516, 218, `${label} = ${value(v.total)} mm`, 'font-weight="600"')}
    ${text(516, 240, `Allow = ${value(v.allow)} mm`)}
    ${text(516, 262, 'Positive downward', 'font-size="11" fill="var(--ink-soft)"')}
    ${text(28, 358, 'Schematic geometry · movement amplified · no tilt / deformation-field analysis', 'font-size="11" fill="var(--ink-soft)"')}
  </svg>`;
}

// Single-pile components remain single-pile results. Never stack them as though their sum were the group settlement.
export function settlementSummarySVG(v) {
  if (!ready(v)) return '';
  const pile = v.kind === 'pile', rows = v.components.length;
  const componentMax = Math.max(...v.components.map(c => c.value), 1e-9);
  const limits = [{ label: pile ? 'Group Sg' : 'Total Se + Sc', amount: v.total, allow: v.allow, uc: v.ucTotal }];
  if (!pile) limits.push({ label: 'Differential (input)', amount: v.diff, allow: v.allowDiff, uc: v.ucDiff });
  const lower = 67 + rows * 43, height = lower + 62 + limits.length * 54;
  const componentRows = v.components.map((c, i) => {
    const y = 66 + i * 43;
    return `${text(20, y - 5, c.label, 'font-size="12"')}<title>${escapeHtml(c.description)}</title>
      <rect x="232" y="${y - 17}" width="270" height="13" rx="3" fill="var(--bg-subtle)"/>
      <rect x="232" y="${y - 17}" width="${(270 * c.value / componentMax).toFixed(3)}" height="13" rx="3" fill="var(--primary)" opacity="${1 - i * 0.2}"/>
      ${text(650, y - 5, `${value(c.value, 3)} mm`, 'text-anchor="end"')}`;
  }).join('');
  const limitRows = limits.map((c, i) => {
    const y = lower + 65 + i * 54, scale = Math.max(c.allow, c.amount) * 1.15;
    const limitX = 232 + 270 * c.allow / scale;
    return `${text(20, y - 5, c.label, 'font-size="12"')}
      <rect x="232" y="${y - 18}" width="270" height="14" rx="3" fill="var(--bg-subtle)"/>
      <rect x="232" y="${y - 18}" width="${(270 * c.amount / scale).toFixed(3)}" height="14" rx="3" fill="${c.uc <= 1 ? 'var(--pass)' : 'var(--fail)'}"/>
      <line x1="${limitX.toFixed(3)}" y1="${y - 22}" x2="${limitX.toFixed(3)}" y2="${y}" stroke="var(--ink)" stroke-width="2"/>
      ${text(650, y - 6, `UC ${value(c.uc, 3)}`, 'text-anchor="end" font-weight="600"')}
      ${text(232, y + 13, `${value(c.amount)} / ${value(c.allow)} mm allowable`, 'font-size="11" fill="var(--ink-soft)"')}`;
  }).join('');
  return `<svg class="fdn-diagram st-summary-svg" viewBox="0 0 680 ${height}" xmlns="http://www.w3.org/2000/svg" role="img"
    aria-label="${escapeHtml(`${pile ? 'Single-pile' : 'Shallow settlement'} components and settlement limit checks`)}" style="font-family:var(--sans);font-size:12px;fill:var(--ink)">
    ${text(20, 25, pile ? 'SINGLE-PILE COMPONENTS · BEFORE GROUP FACTOR' : 'SETTLEMENT COMPONENTS', 'font-weight="600"')}
    ${componentRows}${text(20, lower, pile ? `Se ${value(v.single, 3)} mm × Fg ${value(v.factor, 3)} → Sg ${value(v.total)} mm` : (v.consolidationSkipped ? 'Consolidation not included (H = 0).' : 'Total = elastic Se + consolidation Sc.'), 'fill="var(--ink-soft)"')}
    ${text(20, lower + 33, 'LIMIT CHECKS · VERTICAL TICK = ALLOWABLE', 'font-weight="600"')}${limitRows}
  </svg>`;
}
