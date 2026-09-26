// Workflow step status + live design-status bar.
// Moved from app.js — function/const declarations only; event wiring stays in app.js.
import { escapeHtml, getRadioVal, num } from '../core/dom.js?v=20260927f';
import { fmt } from '../core/format.js?v=20260927f';
import { comboState, lastResults, state } from '../core/state.js?v=20260927f';
import { calcAnchor } from '../tabs/anchor.js?v=20260927f';
import { calcBearing } from '../tabs/bearing.js?v=20260927f';
import { renderLcSummary, renderStdComboTables } from '../tabs/combos.js?v=20260927f';
import { calcFoundation } from '../tabs/foundation.js?v=20260927f';
import { calcFoundSize } from '../tabs/foundSize.js?v=20260927f';
import { renderGeneralSummary } from '../tabs/general.js?v=20260927f';
import { calcPile } from '../tabs/pile.js?v=20260927f';
import { calcRebar } from '../tabs/rebar.js?v=20260927f';
import { calcSettlement } from '../tabs/settlement.js?v=20260927f';
import { calcOneWay, calcTwoWay } from '../tabs/shear.js?v=20260927f';

export function switchWorkflowTab(tabId) {
  const tabBtn = document.querySelector('.sidebar-menu .tab[data-tab="' + tabId + '"]');
  if (tabBtn && tabBtn.style.display !== 'none') { tabBtn.click(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
}
export function recalcAllWorkflow() {
  calcOneWay(); calcTwoWay(); calcBearing(); calcSettlement(); calcAnchor(); calcRebar(); calcFoundSize();
  calcFoundation(); calcPile(); renderGeneralSummary(); renderLcSummary(); if (typeof renderStdComboTables === 'function') renderStdComboTables(); renderWorkflowLive();
  const wfV = document.getElementById('workflow-verdict');
  if (wfV) wfV.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
export function getWorkflowStepStatus(stepId) {
  const support = getRadioVal('fs-support');
  const hasCombos = Array.isArray(comboState.lc) && comboState.lc.length > 0;
  if (stepId === '00') {
    const eqBtn = document.querySelector('#eq-type button.sel');
    const nm = eqBtn ? eqBtn.textContent.trim().slice(0, 28) : getRadioVal('eq-type');
    return { status: 'PASS', metric: nm, note: 'Equipment & mode terpilih' };
  }
  if (stepId === '01') {
    const fc = num('gen-fc'), fy = num('gen-fy'), gc = num('gen-gc'), gs = num('gen-gs');
    const ok = fc > 0 && fy > 0 && gc > 0 && gs > 0;
    return { status: ok ? 'PASS' : 'FAIL', metric: ok ? ('fc=' + fmt(fc,0) + ' fy=' + fmt(fy,0)) : 'FAIL', note: ok ? ('gc=' + fmt(gc,1) + ', gs=' + fmt(gs,1) + ' kN/m3 valid') : 'Periksa fc, fy, gc, gs > 0' };
  }
  if (stepId === '02') {
    const Bf = num('fs-Bf'), Lf = num('fs-Lf'), Hf = num('fs-Hf'), Df = num('fs-Df');
    const type = getRadioVal('fs-type'); const hasPed = type === 'pedestal';
    const Bp = hasPed ? num('fs-Bp') : 1, Lp = hasPed ? num('fs-Lp') : 1;
    // Geometry issues found by foundationGeometryCheck() in calcFoundSize() (pedestal outside the footing, pile embedment, ...)
    const issues = lastResults.foundsize && lastResults.foundsize.issues ? lastResults.foundsize.issues : [];
    // Same depth rule as foundationSizing(): Df >= Hf with a pedestal; without one the footing may project (Df >= 0).
    const ok = Bf > 0 && Lf > 0 && Hf > 0 && (hasPed ? Df >= Hf : Df >= 0) && Bp > 0 && Lp > 0 && issues.length === 0;
    return { status: ok ? 'PASS' : 'FAIL', metric: ok ? (fmt(Bf,2) + 'x' + fmt(Lf,2) + 'x' + fmt(Hf,2) + 'm') : 'FAIL',
      note: ok ? ('Type: ' + type + ', Df=' + fmt(Df,2) + 'm') : (issues.length ? issues.map(i => i.text).join(' ') : 'Bf,Lf,Hf>0 & Df>=Hf wajib') };
  }
  if (stepId === '03') {
    const nt = Array.isArray(state.lcLoadTypes) ? state.lcLoadTypes.length : 0;
    const nc = Array.isArray(comboState.lc) ? comboState.lc.length : 0;
    const ok = nt > 0 && nc > 0;
    return { status: ok ? 'PASS' : 'FAIL', metric: nt + ' Load types, ' + nc + ' Combos', note: ok ? ('dW=' + fmt(num('lc-dW'),1) + ' kN') : 'Minimal 1 load type & 1 kombinasi beban' };
  }
  if (stepId === '4A') {
    if (support === 'pile') return { status: 'INFO', metric: 'N/A', note: 'Mode Pile aktif (cek tahap 4B)' };
    if (!hasCombos) return { status: 'FAIL', metric: '—', note: 'Butuh kombinasi beban di Tab 03' };
    const r = lastResults.foundation;
    if (!r) return { status: '—', metric: '—', note: 'Belum dihitung (buka tab 4A)' };
    return { status: r.status === 'PASS' ? 'PASS' : (r.status === 'FAIL' ? 'FAIL' : '—'), metric: r.metric || '—', note: r.detail || 'Shallow stability' };
  }
  if (stepId === '4B') {
    if (support !== 'pile') return { status: 'INFO', metric: 'N/A', note: 'Mode Shallow aktif (cek tahap 4A)' };
    if (!hasCombos) return { status: 'FAIL', metric: '—', note: 'Butuh kombinasi beban di Tab 03' };
    const r = lastResults.pile;
    if (!r) return { status: '—', metric: '—', note: 'Belum dihitung (buka tab 4B)' };
    return { status: r.status === 'PASS' ? 'PASS' : (r.status === 'FAIL' ? 'FAIL' : '—'), metric: r.metric || '—', note: r.detail || 'Pile stability' };
  }
  if (stepId === '5A') {
    const r = lastResults.oneway;
    if (!r) return { status: '—', metric: '—', note: 'Belum dihitung (buka tab 5B)' };
    return { status: r.status === 'PASS' ? 'PASS' : 'FAIL', metric: r.metric || '—', note: r.detail || 'One-Way Shear' };
  }
  if (stepId === '5B') {
    const r = lastResults.twoway;
    if (!r) return { status: '—', metric: '—', note: 'Belum dihitung (buka tab 5B)' };
    return { status: r.status === 'PASS' ? 'PASS' : 'FAIL', metric: r.metric || '—', note: r.detail || 'Punching Shear' };
  }
  if (stepId === '08') {
    const r = lastResults.bearing;
    if (!r) return { status: '—', metric: '—', note: 'Belum dihitung (buka tab 08)' };
    return { status: (r.status === 'INFO' || r.status === 'PASS') ? 'PASS' : 'FAIL', metric: r.metric || '—', note: r.detail || 'Daya dukung tanah' };
  }
  if (stepId === '08B') {
    const r = lastResults.settlement;
    if (!r) return { status: '—', metric: '—', note: 'Belum dihitung (buka tab 08B)' };
    return { status: r.status === 'PASS' ? 'PASS' : 'FAIL', metric: r.metric || '—', note: r.detail || 'Penurunan tanah' };
  }
  if (stepId === '09') {
    if (!hasCombos) return { status: 'FAIL', metric: '—', note: 'Butuh kombinasi beban di Tab 03' };
    const r = lastResults.anchor;
    if (!r) return { status: '—', metric: '—', note: 'Belum dihitung (buka tab 09)' };
    return { status: r.status === 'PASS' ? 'PASS' : (r.status === 'FAIL' ? 'FAIL' : '—'), metric: r.metric || '—', note: r.detail || 'Anchor bolt design' };
  }
  if (stepId === '10') {
    if (!hasCombos) return { status: 'FAIL', metric: '—', note: 'Butuh kombinasi beban di Tab 03' };
    const p = lastResults.pedestalRebar, c = lastResults.pileCapRebar;
    if (!p && !c) return { status: '—', metric: '—', note: 'Belum dihitung (buka tab 5A/5B)' };
    const pOk = p && p.status === 'PASS';
    const cOk = support !== 'pile' || (c && c.status === 'PASS');
    const ok = pOk && cOk;
    return { status: ok ? 'PASS' : 'FAIL', metric: ok ? 'PASS' : 'FAIL', note: (p ? p.detail : 'Pedestal') + (support === 'pile' ? (' | ' + (c ? c.detail : 'Cap')) : '') };
  }
  if (stepId === '11') {
    const arr = ['oneway','twoway','foundation','pile','bearing','settlement','anchor','pedestalRebar','pileCapRebar'].map(k => lastResults[k]).filter(Boolean);
    const anyF = arr.some(e => e.status === 'FAIL');
    const ok = !anyF && arr.length >= 6;
    return { status: ok ? 'PASS' : (anyF ? 'FAIL' : '—'), metric: arr.filter(e => e.status === 'PASS').length + '/' + arr.length + ' OK', note: 'Summary report akhir' };
  }
  return { status: '—', metric: '—', note: '—' };
}
export function renderWorkflowLive() {
  const tb = document.getElementById('workflow-body');
  const vd = document.getElementById('workflow-verdict');
  // Workflow table was removed from "00 — Equipment Setup"; still refresh the live status bar.
  if (!tb || !vd) { renderLiveBar(); return; }
  const steps = [
    ['00','setup','Equipment Setup'], ['01','general','General Input Data'],
    ['02','foundsize','Foundation Dimension'], ['03','loadingdata','Loading Data'],
    ['4A','foundation','Foundation Stability (Shallow)'], ['4B','pile','Pile Stability'],
    ['5B','capcheck','One-Way Shear'], ['5B','capcheck','Two-Way (Punching) Shear'],
    ['08','bearing','Bearing Capacity (Soil)'], ['08B','settlement','Settlement (Soil)'],
    ['09','anchor','Anchor Bolt Design'], ['5A','pedcheck','Pedestal & Pile Cap Rebar'],
    ['11','summary','Summary Report']
  ];
  let np = 0, nf = 0, nd = 0, req = 0;
  tb.innerHTML = steps.map(s => {
    const st = getWorkflowStepStatus(s[0]);
    const info = st.status === 'INFO';
    if (!info) { req++; if (st.status === 'PASS') np++; else if (st.status === 'FAIL') nf++; else nd++; }
    const col = st.status === 'PASS' ? 'var(--pass)' : (st.status === 'FAIL' ? 'var(--fail)' : (info ? 'var(--accent)' : 'var(--ink-soft)'));
    const bg = st.status === 'PASS' ? 'var(--pass-bg)' : (st.status === 'FAIL' ? 'var(--fail-bg)' : (info ? 'var(--accent-soft)' : 'var(--bg)'));
    return '<tr><td style="text-align:center; font-weight:700;">' + s[0] + '</td><td><strong>' + s[2] + '</strong></td>' +
      '<td><span class="clause" style="display:inline-block; padding:2px 8px; border:1px solid ' + col + '; border-radius:4px; font-weight:700; color:' + col + '; background:' + bg + ';">' + st.status + '</span></td>' +
      '<td><span style="font-size:12px; font-weight:600;">' + escapeHtml(st.metric) + '</span><div class="clause">' + escapeHtml(st.note) + '</div></td>' +
      '<td style="text-align:right;"><button type="button" class="combo-add-btn" style="margin:0; padding:4px 8px; font-size:11px;" onclick="switchWorkflowTab(\'' + s[1] + '\')">Buka</button></td></tr>';
  }).join('');
  const allOk = nf === 0 && nd === 0 && np > 0;
  const stamp = allOk ? 'SEMUA TAHAPAN PASS' : (nf > 0 ? nf + ' TAHAPAN FAIL' : nd + ' TAHAPAN BELUM LENGKAP');
  vd.innerHTML = '<div class="' + (allOk ? 'verdict' : 'verdict fail') + '" style="margin:0;"><div class="stamp">' + stamp + '</div><div class="uc"><div class="val">' + np + '/' + req + '</div><div class="lbl">TAHAP AKTIF PASS</div></div></div>';
  renderLiveBar();
}
// Compact, always-visible design-status summary (persists across tab switches, unlike the workflow
// table above which lives inside "00 — Equipment Setup"). Reuses "getWorkflowStepStatus()" so it can
// only ever say what that already-verified engine says — never a separate guess at the same numbers.
// Limited to the actual structural checks (4A-10); "00-03"/"11" are data-entry/summary gates, not
// checks, so they're left out of this specific card.
export function renderLiveBar() {
  const bar = document.getElementById('live-status-bar');
  if (!bar) return;
  // Declared inside the function (not as top-level consts) because this runs very early during
  // initial page setup — before the script has linearly executed down to a top-level "const" — and
  // a top-level const isn't accessible until its own declaration line actually runs (TDZ).
  const LIVE_BAR_ICON_CHECK = '<path d="M4 12l5 5L20 6"/>';
  const LIVE_BAR_ICON_X = '<path d="M6 6l12 12M18 6L6 18"/>';
  const checks = [
    ['4A', 'Foundation Stability'], ['4B', 'Pile Stability'],
    ['5A', 'One-Way Shear'], ['5B', 'Punching Shear'],
    ['08', 'Bearing Capacity'], ['08B', 'Settlement'],
    ['09', 'Anchor Bolt'], ['10', 'Pedestal & Rebar']
  ].map(([id, label]) => [label, getWorkflowStepStatus(id), id]).filter(([, st]) => st.status !== 'INFO');
  // ---- Onboarding state: on the input tabs (01 General, 02 Foundation Dimension) during first-time entry, show readiness instead of
  // PASS/FAIL cards (every field has a default, so those cards would otherwise report results the user
  // never entered). A section counts as ready once its tab has been visited (defaults reviewed) and, where
  // a validity gate exists in getWorkflowStepStatus(), that gate passes. Session-only, kept on window
  // (not a top-level const) because this function runs before the script body finishes (TDZ).
  // Notifications raised by a check (e.g. 4B: NOT SET limits, layout warnings) — shown here instead of inside the preview.
  // Only for checks that are currently shown (4B is hidden in shallow mode). Text is escaped; nothing is recomputed.
  const noticesHtml = () => {
    const list = [];
    // 02 is an input step (not in `checks`) but can raise warnings of its own (foundationGeometryCheck().warnings).
    (lastResults.foundsize && lastResults.foundsize.notices ? lastResults.foundsize.notices : [])
      .forEach((n) => list.push({ from: 'Foundation Dimension', ...n }));
    checks.forEach(([label, , id]) => {
      // 4B -> the pile check; 10 "Pedestal & Rebar" -> the 5A pedestal reinforcement and the 5B pile cap reinforcement
      const SRC = { '4A': [lastResults.foundation], '4B': [lastResults.pile], '5A': [lastResults.oneway], '5B': [lastResults.twoway], '09': [lastResults.anchor],
        '10': [lastResults.pedestalRebar, lastResults.pileCapRebar] };
      const sources = SRC[id] || [];
      sources.forEach((r) => (r && r.notices ? r.notices : []).forEach((n) => list.push({ from: label, ...n })));
    });
    if (!list.length) return '';
    return '<div class="lb-sec"><div class="lb-title">Notices</div>' +
      list.map((n) => '<div class="lb-notice"><div class="lb-notice-title">' + escapeHtml(n.title) + '</div>' + escapeHtml(n.text) +
        '<div class="lb-notice-from">' + escapeHtml(n.from) + '</div></div>').join('') + '</div>';
  };
  const visited = (window.__liveBarVisited = window.__liveBarVisited || new Set());
  const activeTab = document.querySelector('.sidebar-menu .tab.active')?.dataset.tab;
  if (activeTab) visited.add(activeTab);
  const tabShown = (t) => { const el = document.querySelector('.sidebar-menu .tab[data-tab="' + t + '"]'); return !!el && el.style.display !== 'none'; };
  const sections = [
    { key: 'general', label: 'General Input Data', tab: 'general', ok: () => getWorkflowStepStatus('01').status === 'PASS' },
    { key: 'dim', label: 'Foundation Dimension', tab: 'foundsize', ok: () => visited.has('foundsize') && getWorkflowStepStatus('02').status === 'PASS' },
    { key: 'load', label: 'Loading Data', tab: 'loadingdata', ok: () => visited.has('loadingdata') && getWorkflowStepStatus('03').status === 'PASS' },
    { key: 'soil', label: 'Soil / Geotechnical Data', tab: 'bearing', ok: () => visited.has('bearing') || visited.has('settlement') },
    { key: 'rebar', label: 'Reinforcement', tab: 'pedcheck', ok: () => visited.has('pedcheck') || visited.has('capcheck') }
  ].filter((s) => tabShown(s.tab)).map((s) => ({ ...s, ready: s.ok() }));
  const nReady = sections.filter((s) => s.ready).length;
  const ONBOARD_TABS = ['general', 'foundsize', 'loadingdata', 'foundation', 'pile', 'pedcheck', 'capcheck']; // tabs that show the readiness panel during first-time entry
  if (ONBOARD_TABS.includes(activeTab) && nReady < sections.length) {
    const secReady = (key) => { const s = sections.find((x) => x.key === key); return !s || s.ready; };
    const DEP = { '4A': ['load', 'loading'], '4B': ['load', 'loading'], '5A': ['dim', 'dimensions'], '5B': ['dim', 'dimensions'],
      '08': ['soil', 'soil data'], '08B': ['soil', 'soil data'], '09': ['load', 'loading'], '10': ['rebar', 'reinforcement'] };
    bar.innerHTML =
      '<div class="lb-sec"><div class="lb-title">Design Status</div>' +
        '<div class="lb-status"><div class="lb-status-head">◷ DESIGN NOT READY</div>' +
        '<div class="lb-status-sub">Complete required inputs to run foundation checks.</div></div></div>' +
      '<div class="lb-sec"><div class="lb-title">Project Readiness</div>' +
        sections.map((s) => '<button type="button" class="lb-ready-item' + (s.ready ? ' ok' : '') + '" onclick="switchWorkflowTab(\'' + s.tab + '\')">' +
          '<span class="lb-mark">' + (s.ready ? '✓' : '○') + '</span>' + escapeHtml(s.label) + '</button>').join('') +
        '<div class="lb-ready-count">' + nReady + ' / ' + sections.length + ' sections ready</div></div>' +
      '<div class="lb-sec"><div class="lb-title">Design Checks</div>' +
        checks.map(([label, , id]) => {
          const dep = DEP[id];
          const ok = !dep || secReady(dep[0]);
          return '<div class="lb-check"><span class="lb-check-dash">─</span><div><div class="lb-check-name">' + escapeHtml(label) + '</div>' +
            '<div class="lb-check-wait' + (ok ? ' ok' : '') + '">' + (ok ? 'Inputs ready' : 'Waiting for ' + dep[1]) + '</div></div></div>';
        }).join('') + '</div>' + noticesHtml();
    return;
  }
  if (!checks.length) { bar.innerHTML = ''; return; }
  // DCR = the "UC = x.xxx" (or "...UC=x.xxx") already sitting in that check's own metric/note text —
  // extracted, never recomputed, so this can only ever repeat what the check itself already reported.
  // Left as "—" wherever no such value is exposed (e.g. bearing capacity is a reference q_a, not a UC).
  const dcrOf = (st) => {
    const m = /UC\s*=\s*([\d.]+)/i.exec(st.metric) || /UC\s*=\s*([\d.]+)/i.exec(st.note);
    return m ? m[1] : null;
  };
  bar.innerHTML = checks.map(([label, st]) => {
    const failed = st.status === 'FAIL';
    const cls = failed ? 'fail' : 'pass'; // pending ('—') reads as an unfilled/gray "PASS" shell until computed
    const txt = st.status === '—' ? 'PENDING' : st.status;
    const dcr = dcrOf(st);
    const dcrNum = dcr === null ? null : parseFloat(dcr);
    const pct = dcrNum === null ? 0 : Math.min(100, dcrNum * 100);
    return '<div class="live-bar-card">' +
      '<div class="live-bar-card-top">' +
        '<span class="live-bar-card-label">' + escapeHtml(label) + '</span>' +
        '<div class="live-bar-progress"><div class="live-bar-progress-fill ' + cls + '" style="width:' + pct.toFixed(1) + '%;"></div></div>' +
      '</div>' +
      '<div class="live-bar-card-row">' +
        '<span class="live-bar-status-pill ' + cls + '"><span class="live-bar-status-icon"><svg viewBox="0 0 24 24" width="8" height="8" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">' + (failed ? LIVE_BAR_ICON_X : LIVE_BAR_ICON_CHECK) + '</svg></span>' + escapeHtml(txt) + '</span>' +
        '<div class="live-bar-dcr-wrap"><span class="live-bar-dcr-val">' + escapeHtml(dcr ?? '—') + '</span><span class="live-bar-dcr-limit">/ 1.00</span></div>' +
      '</div>' +
    '</div>';
  }).join('') + noticesHtml();
}
export let wfLiveT = null;
export function scheduleWorkflowLive() {
  if (wfLiveT) clearTimeout(wfLiveT);
  wfLiveT = setTimeout(() => { try { renderWorkflowLive(); } catch (e) {} }, 80);
}
