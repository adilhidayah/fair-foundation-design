// Auto-Size Foundation (Tab 02 button / Design Status panel button): smallest square footing B = L and thickness H, in
// 0.05 m steps, for which 4A stability (kern, bearing pressure, sliding, overturning) and the one-way / punching shear checks
// all PASS. With "Keep B × L" ticked the plan is the user's (site limit) and only H is sized. The search lives in lib/foundation/shared/autoSizeFooting.js; this file only supplies evaluate(): it writes the trial
// size into Tab 02, runs calcFoundSize() (-> recalcAll(), the very checks the user sees) and reads the statuses back.
// Shallow foundations only. Pedestal, D_f, grout and the load data are never changed; nothing is changed when no size passes.
import { autoSizeFooting, autoSizeThickness } from '../../lib/foundation/index.js?v=20261014f';
import { escapeHtml, getRadioVal, num } from '../core/dom.js?v=20261014f';
import { fmt } from '../core/format.js?v=20261014f';
import { lastResults } from '../core/state.js?v=20261014f';
import { calcFoundSize } from '../tabs/foundSize.js?v=20261014f';

const STEP = 0.05;          // m — grid of the result (B, L, H)
const H_MIN = 0.3;          // m — thinnest footing the search starts from
const H_MAX_BLOCK = 3.0;    // m — thickest footing tried for "Footing Only" (with a pedestal H <= D_f, the geometry rule)
const B_MAX = 10;           // m — largest square footing tried
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
  const orig = { Bf: document.getElementById('fs-Bf').value, Lf: document.getElementById('fs-Lf').value, Hf: document.getElementById('fs-Hf').value };
  // Smallest plan that still holds the pedestal (with its offset) — foundationGeometryCheck() would reject anything smaller.
  const Bmin = hasPed ? Math.max(num('fs-Bp') + 2 * Math.abs(num('fs-OffX')), num('fs-Lp') + 2 * Math.abs(num('fs-OffZ')), 0.5) : 0.5;
  const Hmax = hasPed ? Df : H_MAX_BLOCK; // with a pedestal the footing must fit within the embedment depth (Df >= Hf)
  const btns = document.querySelectorAll('[data-autosize]');
  running = true;
  btns.forEach((b) => { b.disabled = true; });
  show('note', 'Auto-sizing…');
  let trial = 0;
  // lockPlan: B and L stay as typed (site limit, any B x L) and only H is searched; otherwise B = L is searched as well.
  const lockPlan = document.getElementById('fs-autosize-lock').checked;
  const evaluate = async ({ B, H }) => {
    trial += 1;
    out.innerHTML = `Auto-sizing… trial ${trial}: ${B === undefined ? '' : `B = L = ${fmt(B, 2)} m, `}H = ${fmt(H, 2)} m`;
    if (B !== undefined) { setField('fs-Bf', B); setField('fs-Lf', B); }
    setField('fs-Hf', H);
    calcFoundSize();
    await yieldToUi();
    const issues = lastResults.foundsize && lastResults.foundsize.issues ? lastResults.foundsize.issues : [];
    const [ow, tw] = shearStatuses();
    return {
      geometryOk: issues.length === 0,
      stabilityPass: !!lastResults.foundation && lastResults.foundation.status === 'PASS',
      shearPass: !!ow && !!tw && ow.status === 'PASS' && tw.status === 'PASS',
      info: { stability: lastResults.foundation, oneway: ow, twoway: tw }
    };
  };
  try {
    if (lockPlan) {
      const Bf = num('fs-Bf'), Lf = num('fs-Lf');
      if (!(Bf > 0 && Lf > 0)) { show('warn-box', '<strong>Enter B<sub>f</sub> and L<sub>f</sub> first</strong> — with the plan size locked, only H is sized.'); return; }
      const t = await autoSizeThickness({ evaluate, Hmin: H_MIN, Hmax, step: STEP });
      if (t.ok) {
        setField('fs-Hf', t.H.toFixed(2));
        calcFoundSize();
        const rows = (lastResults.foundation && lastResults.foundation.checks ? lastResults.foundation.checks : []).map((c) => `<li>${escapeHtml(c.name)}: UC = ${fmt(c.uc, 3)} (LC ${escapeHtml(String(c.lc))})</li>`).join('');
        const ow = lastResults.oneway, tw = lastResults.twoway;
        show('suggest-box', `<strong>✓ Auto-sized: H<sub>f</sub> = ${fmt(t.H, 2)} m</strong> with the plan size kept at B<sub>f</sub> × L<sub>f</sub> = ${fmt(Bf, 2)} × ${fmt(Lf, 2)} m — smallest thickness (${fmt(STEP * 1000, 0)} mm steps) passing the checks below, found in ${t.evals} trials. B<sub>f</sub>, L<sub>f</sub>, D<sub>f</sub>, the pedestal and the loads were not changed.`
          + `<ul style="margin:6px 0 0 18px;padding:0;">${rows}<li>One-way shear: ${escapeHtml(ow ? ow.metric : '—')}</li><li>Punching shear: ${escapeHtml(tw ? tw.metric : '—')}</li></ul>`
          + `<div class="clause" style="margin-top:6px;">Review the result (rebar, flexure, deflection) before using it.</div>`);
      } else {
        setField('fs-Hf', orig.Hf);
        calcFoundSize();
        const atMax = t.info && t.info.stability ? ` At H<sub>f</sub> = ${fmt(t.H, 2)} m the stability check gives ${escapeHtml(t.info.stability.metric || '—')}.` : '';
        const hint = t.failed.includes('stability')
          ? ` The plan size ${fmt(Bf, 2)} × ${fmt(Lf, 2)} m is too small for stability whatever the thickness — enlarge it (untick "Keep B × L" to let Auto-Size find the plan), or reduce the loads / soil demand.`
          : ` Increase the limit by raising D<sub>f</sub>${hasPed ? ' (with a pedestal H ≤ D<sub>f</sub>)' : ''}, or check the shear inputs in 5B.`;
        show('warn-box', `<strong>⚠  No thickness found for the fixed plan size — H<sub>f</sub> left unchanged.</strong> ${escapeHtml(t.reason)}${atMax}${hint}`);
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
