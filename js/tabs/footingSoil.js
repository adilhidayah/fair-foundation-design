// 5B shallow footing — factored (LRFD) soil pressure per combination, shared by the one-way shear, punching and flexure panels.
// Function/const declarations only; event wiring stays in app.js.
import { pedestalOffsetMoments, signedSoilPressure, stdComboVector } from '../../lib/foundation/index.js?v=20261009m';
import { escapeHtml, getRadioVal, num } from '../core/dom.js?v=20261009m';
import { fmt } from '../core/format.js?v=20261009m';
import { comboState, state } from '../core/state.js?v=20261009m';
import { comboLabel } from '../core/worksheet.js?v=20261009m';
import { buildStdComboBase } from '../tabs/combos.js?v=20261009m';

export const isShallow = () => getRadioVal('fs-support') !== 'pile';

// Loads at the underside of the footing for every LRFD combination — the same statics as 4A (buildStdComboBase() + the
// pedestal-offset moments of pedestalOffsetMoments()) but for comboState.lrfd — and the no-tension pressure plane under each.
// Net design pressure: the factored self-weight of the footing and of the backfill above it is deducted where it sits,
// w = kD·(W_f / A_f + W_s / (A_f − A_p)) per unit area outside the pedestal (kD = the combination's dead-load factor,
// dP / ΔW, as in 4A). Pedestal (load point) from Tab 02: centre (Off X, Off Z), size B_p × L_p (rb-Bp / rb-Lp, mm — the
// column / base-plate size when there is no pedestal).
export function footingLrfdActions() {
  const B = num('fs-Bf'), L = num('fs-Lf');
  if (!(B > 0 && L > 0)) return { valid: false, note: 'Footing size B_f × L_f (Tab 02) must be greater than zero.' };
  const items0 = comboState.lrfd;
  if (items0.length === 0) return { valid: false, note: 'No factored (LRFD) combinations — load them with "Edit LRFD Combinations".' };
  const hasPed = getRadioVal('fs-type') === 'pedestal';
  const c1 = num('rb-Bp') / 1000, c2 = num('rb-Lp') / 1000;
  if (!(c1 > 0 && c2 > 0)) return { valid: false, note: 'Pedestal / column size B_p × L_p must be greater than zero.' };
  const ped = { x: hasPed ? num('fs-OffX') : 0, z: hasPed ? num('fs-OffZ') : 0, c1, c2 };
  const Af = B * L, Ap = hasPed ? num('fs-Bp') * num('fs-Lp') : 0;
  const wUnit = state.footW / Af + (Af - Ap > 1e-9 ? state.footSoilW / (Af - Ap) : 0); // kPa at kD = 1
  const base = buildStdComboBase();
  const dW = num('lc-dW');
  const hasOffset = Math.abs(ped.x) > 1e-9 || Math.abs(ped.z) > 1e-9;
  const items = items0.map(combo => {
    const v = stdComboVector(combo.f, base);
    const kD = dW > 0 ? v.dP / dW : 0;
    const off = hasOffset
      ? pedestalOffsetMoments({ Ptop: v.P, kD, Wped: state.pedW, Wsoil: state.footSoilW, OffX: ped.x, OffZ: ped.z, Af, Ap })
      : { dMx: 0, dMz: 0 };
    const Pu = v.P + v.dP, Mx = v.Mx + v.dMx + off.dMx, Mz = v.Mz + v.dMz + off.dMz;
    const w = kD * wUnit;
    if (!(Pu > 0)) return { combo, Pu, Mx, Mz, kD, w, invalid: 'Net uplift (P_u ≤ 0) — no soil pressure.' };
    const pl = signedSoilPressure(B, L, Pu, Mz / Pu, -Mx / Pu);
    if (!pl.valid) return { combo, Pu, Mx, Mz, kD, w, invalid: pl.note || 'Resultant outside the footing.' };
    return { combo, Pu, Mx, Mz, kD, w, pl, invalid: null };
  });
  return { valid: true, B, L, ped, hasPed, wUnit, items };
}

// Formula block + per-combination table of the design pressure, shown under each 5B panel in shallow mode.
export function soilPressureHtml(fa, extraCols = null) {
  const rows = fa.items.map(it => it.invalid
    ? `<tr><td>${escapeHtml(comboLabel(it.combo))}</td><td class="num">${fmt(it.Pu, 1)}</td><td class="num">${fmt(it.Mx, 1)}</td><td class="num">${fmt(it.Mz, 1)}</td><td colspan="${4 + (extraCols ? extraCols.head.length : 0)}">${escapeHtml(it.invalid)}</td></tr>`
    : `<tr class="${extraCols && extraCols.gov === it ? 'governing' : ''}"><td>${escapeHtml(comboLabel(it.combo))}</td><td class="num">${fmt(it.Pu, 1)}</td><td class="num">${fmt(it.Mx, 1)}</td><td class="num">${fmt(it.Mz, 1)}</td><td class="num">${fmt(it.pl.qmax, 1)}</td><td class="num">${fmt(it.pl.qmin, 1)}</td><td class="num">${fmt(100 * it.pl.contactRatio, 0)}%</td><td class="num">${fmt(it.w, 2)}</td>${extraCols ? extraCols.cells(it) : ''}</tr>`).join('');
  return `<div class="lc-formula">
    <div class="lc-formula-title">Design soil pressure — factored (LRFD) combinations at the underside of the footing</div>
    q(x, z) = max(0, a + b·x + c·z): rigid footing, linear pressure, no tension, resultant at x<sub>R</sub> = M<sub>z</sub>/P<sub>u</sub>, z<sub>R</sub> = −M<sub>x</sub>/P<sub>u</sub> (same model as the 4A bearing check); full contact q = (P<sub>u</sub>/BL)(1 ± 6e<sub>x</sub>/B ± 6e<sub>z</sub>/L)<br>
    Net design pressure q − w, w = k<sub>D</sub>·(W<sub>f</sub>/A<sub>f</sub> + W<sub>s</sub>/(A<sub>f</sub> − A<sub>p</sub>)) = k<sub>D</sub> × ${fmt(fa.wUnit, 2)} kPa (factored footing + backfill, k<sub>D</sub> = dead-load factor of the combination)
    <div class="lc-formula-where">P<sub>u</sub>, M<sub>x</sub>, M<sub>z</sub> include the footing, pedestal and backfill weights × k<sub>D</sub>${fa.hasPed && (Math.abs(fa.ped.x) > 1e-9 || Math.abs(fa.ped.z) > 1e-9) ? ' and the moments of the pedestal offset (as in 4A)' : ''}. Pedestal centre (${fmt(fa.ped.x, 3)}, ${fmt(fa.ped.z, 3)}) m, B<sub>p</sub> × L<sub>p</sub> = ${fmt(fa.ped.c1, 3)} × ${fmt(fa.ped.c2, 3)} m.</div>
  </div>
  <div class="overflow-x"><table class="calc-table">
    <caption>Design soil pressure per LRFD combination</caption>
    <tr><th>Combination</th><th>P<sub>u</sub> (kN)</th><th>M<sub>x</sub> (kN·m)</th><th>M<sub>z</sub> (kN·m)</th><th>q<sub>max</sub> (kPa)</th><th>q<sub>min</sub> (kPa)</th><th>Contact</th><th>w (kPa)</th>${extraCols ? extraCols.head.map(h => `<th>${h}</th>`).join('') : ''}</tr>
    ${rows}
  </table></div>`;
}
