// Recalculate-everything entry points.
// Moved from app.js — function/const declarations only; event wiring stays in app.js.
import { calcAnchor } from '../tabs/anchor.js?v=20260926x';
import { calcBearing } from '../tabs/bearing.js?v=20260926x';
import { renderLcSummary, renderStdComboTables } from '../tabs/combos.js?v=20260926x';
import { calcFoundation } from '../tabs/foundation.js?v=20260926x';
import { renderGeneralSummary } from '../tabs/general.js?v=20260926x';
import { renderLoadSummary } from '../tabs/loading.js?v=20260926x';
import { calcPile } from '../tabs/pile.js?v=20260926x';
import { calcRebar } from '../tabs/rebar.js?v=20260926x';
import { calcOneWay, calcTwoWay } from '../tabs/shear.js?v=20260926x';
import { renderWorkflowLive } from '../workflow/status.js?v=20260926x';

export function recalcAll() {
  // Tab 08 reads its footing size / depth from Tab 02 (mirrored in calcFoundSize()), so q_a, the Table 1.3.1 summary
  // and 4A must follow every geometry change — calcBearing() first, calcFoundation() reads the same q_a.
  calcBearing();
  calcFoundation();
  calcPile();
  // Pile cap flexure / shear (5B) read the pile reactions of the factored combinations, so they follow every change
  // in loads, pile layout or cap geometry — not only edits of their own inputs.
  // (each guarded: a failure in one of these must not stop the summaries and status below from refreshing)
  [calcRebar, calcOneWay, calcTwoWay, calcAnchor].forEach(fn => { try { fn(); } catch (e) { console.error('recalcAll:', fn.name, e); } });
  renderLcSummary();
  renderGeneralSummary();
  if (typeof renderStdComboTables === 'function') renderStdComboTables();
  if (typeof renderLoadSummary === 'function') renderLoadSummary();
  if (typeof renderWorkflowLive === 'function') renderWorkflowLive();
}
// fd-ecc/fd-mu/fd-fsSlide-perm/fd-fsSlide-temp/fd-fsOT-perm/fd-fsOT-temp and bc-* also feed the read-only
// "1.3 Geotechnical Parameters" section of
// "01 — General Input Data" (renderGeneralSummary()), so both must refresh it too, not just their own tab.
export function calcFoundationAndGeneral() { calcFoundation(); renderGeneralSummary(); }
// calcFoundation() reads q_a fresh from the Bearing Capacity inputs (no separate field/copy button any more), so
// any bc-* change must also re-run calcFoundation(), not just calcBearing().
export function calcBearingAndFoundation() { calcBearing(); calcFoundation(); renderGeneralSummary(); }
