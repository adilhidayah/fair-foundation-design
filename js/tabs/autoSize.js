// Auto-Size Foundation (Tab 02 button / Design Status panel button): smallest square footing B = L and thickness H, in
// 0.05 m steps, for which 4A stability (kern, bearing pressure, sliding, overturning) and the one-way / punching shear checks
// all PASS (and the footing flexure is not "section too small"). With "Keep B × L × H" ticked the footing size is the user's (site limit) and only the depth D_f is sized. The search lives in lib/foundation/shared/autoSizeFooting.js; this file only supplies evaluate(): it writes the trial
// size into Tab 02, runs calcFoundSize() (-> recalcAll(), the very checks the user sees) and reads the statuses back.
// Shallow foundations only. Pedestal, D_f, grout and the load data are never changed; nothing is changed when no size passes.
import { autoSizeDepth, autoSizeFooting } from '../../lib/foundation/index.js?v=20261014k';
import { escapeHtml, getRadioVal, num } from '../core/dom.js?v=20261014k';
import { fmt } from '../core/format.js?v=20261014k';
import { lastResults } from '../core/state.js?v=20261014k';
import { calcFoundSize } from '../tabs/foundSize.js?v=20261014k';

const STEP = 0.05;          // m — grid of the result (B, L, H)
const H_MIN = 0.3;          // m — thinnest footing the search starts from
const H_MAX_BLOCK = 3.0;    // m — thickest footing tried for "Footing Only" (with a pedestal H <= D_f, the geometry rule)
const B_MAX = 10;           // m — largest square footing tried
const DF_MAX = 5.0;         // m — deepest embedment tried when only D_f is sized
let running = false;

const setField = (id, v) => { document.getElementById(id).value = String(v); };
const yieldToUi = () => new Promise((r) => setTimeout(r, 0));
const shearStatuses = () => [lastResults.oneway, lastResults.twoway];

export async function autoSizeFoundation() {
  const out = document.getElementById('fs-autosize-result');
  if (running || !out) return;
  const show = (cls, html) => { out.className = cls; out.innerHTML = html; };
  if (getRadioVal('fs-support') === 'pile') {
    show('warn-box', '<strong>Auto-Size is for shallow foundations.</strong> With a pile foundation the pile layout fixes the cap; size it in 4B / Tab 02.');
    return;
  }
  const hasPed = getRadioVal('fs-type') === 'pedestal';
  const Df = num('fs-Df');
  const orig = { Bf: document.getElementById('fs-Bf').value, Lf: document.getElementById('fs-Lf').value, Hf: document.getElementById('fs-Hf').value, Df: document.getElementById('fs-Df').value };
  // Smallest plan that still holds the pedestal (with its offset) — foundationGeometryCheck() would reject anything smaller.
  const Bmin = hasPed ? Math.max(num('fs-Bp') + 2 * Math.abs(num('fs-OffX')), num('fs-Lp') + 2 * Math.abs(num('fs-OffZ')), 0.5) : 0.5;
  const Hmax = hasPed ? Df : H_MAX_BLOCK; // with a pedestal the footing must fit within the embedment depth (Df >= Hf)
  const btns = document.querySelectorAll('[data-autosize]');
  running = true;
  btns.forEach((b) => { b.disabled = true; });
  show('note', 'Auto-sizing…');
  let trial = 0;
  // lockPlan: B, L and H stay as typed (site limit, any B x L) and only D_f is searched; otherwise B = L and H are searched.
  const lockPlan = document.getElementById('fs-autosize-lock').checked;
  const evaluate = async ({ B, H, Df: D }) => {
    trial += 1;
    out.innerHTML = `Auto-sizing… trial ${trial}: ${D !== undefined ? `D<sub>f</sub> = ${fmt(D, 2)} m` : `B = L = ${fmt(B, 2)} m, H = ${fmt(H, 2)} m`}`;
    if (B !== undefined) { setField('fs-Bf', B); setField('fs-Lf', B); }
    if (H !== undefined) setField('fs-Hf', H);
    if (D !== undefined) setField('fs-Df', D);
    calcFoundSize();
    await yieldToUi();
    const issues = lastResults.foundsize && lastResults.foundsize.issues ? lastResults.foundsize.issues : [];
    const [ow, tw] = shearStatuses();
    return {
      geometryOk: issues.length === 0,
      // contact: with V_u / flexure from the soil pressure, a factored combination that loses contact entirely needs a bigger footing, not a thicker one
      stabilityPass: !!lastResults.foundation && lastResults.foundation.status === 'PASS' && !(lastResults.pileCapRebar && lastResults.pileCapRebar.invalidCombos > 0),
      // thickness checks: one-way + punching shear and the footing flexure ("section too small" is cured by a thicker footing; a combination
      // that loses contact is not — it is part of stabilityPass above, so it must not push H up)
      shearPass: !!ow && !!tw && ow.status === 'PASS' && tw.status === 'PASS' && !!lastResults.pileCapRebar && (lastResults.pileCapRebar.status === 'PASS' || lastResults.pileCapRebar.invalidCombos > 0),
      info: { stability: lastResults.foundation, oneway: ow, twoway: tw }
    };
  };
  try {
    if (lockPlan) {
      const Bf = num('fs-Bf'), Lf = num('fs-Lf'), Hf = num('fs-Hf');
      if (!(Bf > 0 && Lf > 0 && Hf > 0)) { show('warn-box', '<strong>Enter B<sub>f</sub>, L<sub>f</sub> and H<sub>f</sub> first</strong> — with the footing size locked, only D<sub>f</sub> is sized.'); return; }
      // Smallest D_f that still holds the footing (D_f >= H_f); a deeper footing carries more soil and a larger q_a, so stability improves.
      const t = await autoSizeDepth({ evaluate, Dmin: Hf, Dmax: DF_MAX, step: STEP });
      if (t.ok) {
        setField('fs-Df', t.Df.toFixed(2));
        calcFoundSize();
        const rows = (lastResults.foundation && lastResults.foundation.checks ? lastResults.foundation.checks : []).map((c) => `<li>${escapeHtml(c.name)}: UC = ${fmt(c.uc, 3)} (LC ${escapeHtml(String(c.lc))})</li>`).join('');
        const ow = lastResults.oneway, tw = lastResults.twoway;
        show('suggest-box', `<strong>✓ Auto-sized: D<sub>f</sub> = ${fmt(t.Df, 2)} m</strong> with the footing kept at B<sub>f</sub> × L<sub>f</sub> × H<sub>f</sub> = ${fmt(Bf, 2)} × ${fmt(Lf, 2)} × ${fmt(Hf, 2)} m — smallest depth (${fmt(STEP * 1000, 0)} mm steps) passing the checks below, found in ${t.evals} trials. B<sub>f</sub>, L<sub>f</sub>, H<sub>f</sub>, the pedestal size and the loads were not changed.`
          + `<ul style="margin:6px 0 0 18px;padding:0;">${rows}<li>One-way shear: ${escapeHtml(ow ? ow.metric : '—')}</li><li>Punching shear: ${escapeHtml(tw ? tw.metric : '—')}</li></ul>`
          + `<div class="clause" style="margin-top:6px;">A deeper footing carries more soil on top of it and a larger q<sub>a</sub> (08), but the pedestal below grade gets longer (D<sub>p</sub> = D<sub>f</sub> − H<sub>f</sub>), which adds weight and the H·Δh moment — all included in the checks above. Check that the excavation, the water table and the soil layers at this depth match the soil data (Section 01 / 08), and review rebar and flexure before using it.</div>`);
      } else {
        setField('fs-Df', orig.Df);
        calcFoundSize();
        const atMax = t.info && t.info.stability ? ` At D<sub>f</sub> = ${fmt(t.Df, 2)} m the stability check gives ${escapeHtml(t.info.stability.metric || '—')}.` : '';
        const hints = [];
        if (t.failed.includes('stability')) hints.push(`The footing ${fmt(Bf, 2)} × ${fmt(Lf, 2)} × ${fmt(Hf, 2)} m is not enough for stability even at the deepest D<sub>f</sub> tried (${fmt(DF_MAX, 1)} m) — enlarge it (untick "Keep B × L × H" to let Auto-Size find the size), or reduce the loads.`);
        if (t.failed.includes('shear')) hints.push(`Shear does not depend on D<sub>f</sub>: H<sub>f</sub> = ${fmt(Hf, 2)} m is too thin for the shear checks (${escapeHtml(shearReason() || 'see 5B')}) — increase H<sub>f</sub>, or check the shear inputs in 5B.`);
        show('warn-box', `<strong>⚠  No depth found for the fixed footing size — D<sub>f</sub> left unchanged.</strong> ${escapeHtml(t.reason)}${atMax} ${hints.join(' ')}`);
      }
      return;
    }
    const r = await autoSizeFooting({ evaluate, Bmin, Bmax: B_MAX, Hmin: H_MIN, Hmax, step: STEP, H0: num('fs-Hf') });
    if (r.ok) {
      setField('fs-Bf', r.B.toFixed(2)); setField('fs-Lf', r.B.toFixed(2)); setField('fs-Hf', r.H.toFixed(2));
      calcFoundSize();
      const f = lastResults.foundation;
      const rows = (f && f.checks ? f.checks : []).map((c) => `<li>${escapeHtml(c.name)}: UC = ${fmt(c.uc, 3)} (LC ${escapeHtml(String(c.lc))})</li>`).join('');
      const ow = lastResults.oneway, tw = lastResults.twoway;
      show('suggest-box', `<strong>✓ Auto-sized: B<sub>f</sub> = L<sub>f</sub> = ${fmt(r.B, 2)} m, H<sub>f</sub> = ${fmt(r.H, 2)} m</strong> — smallest square footing (${fmt(STEP * 1000, 0)} mm steps) passing the checks below, found in ${r.evals} trials. D<sub>f</sub>, the pedestal and the loads were not changed.`
        + `<ul style="margin:6px 0 0 18px;padding:0;">${rows}<li>One-way shear: ${escapeHtml(ow ? ow.metric : '—')}</li><li>Punching shear: ${escapeHtml(tw ? tw.metric : '—')}</li></ul>`
        + `<div class="clause" style="margin-top:6px;">H is the smallest thickness passing the shear checks, then B the smallest plan passing stability at that H. Shear uses the V<sub>u</sub> source set in 5B — typed V<sub>u</sub> does not change with B. Review the result (rebar, flexure, deflection) before using it.</div>`);
    } else {
      setField('fs-Bf', orig.Bf); setField('fs-Lf', orig.Lf); setField('fs-Hf', orig.Hf);
      calcFoundSize();
      show('warn-box', `<strong>⚠  No safe size found — Tab 02 left unchanged.</strong> ${escapeHtml(r.reason)}${r.failed.includes('shear') ? ` ${escapeHtml(shearReason())}` : ''} Check the loads / soil / shear inputs, or enlarge D<sub>f</sub>${hasPed ? ' (with a pedestal H ≤ D<sub>f</sub>)' : ''}.`);
    }
  } finally {
    running = false;
    btns.forEach((b) => { b.disabled = false; });
  }
}
// Why the shear checks did not pass at the original size — the status line of each check that is not PASS.
function shearReason() {
  const bad = shearStatuses().filter((s) => s && s.status !== 'PASS');
  return bad.length ? bad.map((s) => `${s.label}: ${s.metric}${s.status === 'ERROR' ? ' — ' + s.detail : ''}.`).join(' ') : '';
}
