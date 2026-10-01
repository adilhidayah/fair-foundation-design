// Scope of Work (Section 00 — shown in the right panel on that tab): checks that can be taken out of this calculation.
//   stability  — Foundation / pile stability (4A / 4B).
//   bearing    — Soil bearing capacity (08). Unchecked: q_a given by the geotechnical report (bc-qa-given), used as-is by 4A.
//   settlement — Settlement (08B).
//   structural — Structural design: pedestal (5A) and pile cap / footing shear + flexure (5B).
//   anchor     — Anchor Bolt Design (09). Unchecked: by mechanical vendor, not checked here.
// Out-of-scope checks report status 'NA' in the Design Status panel and are left out of the governing UC; their report pages get
// a NOT IN SCOPE banner (css/app.css, from the body[data-scope-*="off"] attributes set below). The calculations themselves run
// unchanged.
// Declarations only — wiring lives in app.js.

export const SCOPE_NA_LABEL = { stability: 'N/A (NOT IN SCOPE)', bearing: 'GIVEN (GEOTECH)', settlement: 'N/A (NOT IN SCOPE)',
  structural: 'N/A (NOT IN SCOPE)', anchor: 'N/A (BY VENDOR)' };
const SCOPE_IN_LABEL = { stability: 'IN SCOPE — checked in 4A / 4B', bearing: 'IN SCOPE — computed in 08', settlement: 'IN SCOPE — checked in 08B',
  structural: 'IN SCOPE — checked in 5A / 5B', anchor: 'IN SCOPE — checked in 09' };

// true unless the Section 00 checkbox exists and is unchecked
export function inScope(key) {
  const el = document.getElementById('scope-' + key);
  return !el || el.checked;
}
export function renderScopePanel() {
  Object.keys(SCOPE_NA_LABEL).forEach((k) => {
    const el = document.getElementById('scope-' + k + '-state');
    if (!el) return;
    const on = inScope(k);
    el.className = 'scope-state ' + (on ? 'on' : 'na');
    el.textContent = on ? SCOPE_IN_LABEL[k] : SCOPE_NA_LABEL[k];
  });
  // body[data-scope-<key>="off"] drives the NOT IN SCOPE banners on the report pages (css/app.css).
  Object.keys(SCOPE_NA_LABEL).forEach((k) => { document.body.dataset['scope' + k[0].toUpperCase() + k.slice(1)] = inScope(k) ? 'on' : 'off'; });
}
