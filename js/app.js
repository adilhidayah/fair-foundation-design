import {
  windForceASCE722, designSpectralAccel, seismicResponseCoefficient
} from '../lib/foundation/index.js?v=20261009l'; // ?v= cache-buster: bump when lib/ changes
import { fmt } from './core/format.js?v=20261009l';
import { selectRadio, getRadioVal, num, openModal, closeModal, wireDecimalAutoFormat } from './core/dom.js?v=20261009l';
import { dlWorksheetItem } from './core/worksheet.js?v=20261009l';
import { state, comboState, designStandards, pileList, boltList, reportBlocks } from './core/state.js?v=20261009l';
import { renderComboImportReview, renderEqOcrReview, renderFsAutoFillReview, renderLtOcrReview, renderOcrReview } from './ocr/review.js?v=20261009l';
import { loadTesseract } from './ocr/tesseract.js?v=20261009l';
import { generateReport, renderBlockList, wireLogoUpload } from './report/builder.js?v=20261009l';
import { renderSummaryReport } from './report/summary.js?v=20261009l';
import { calcAnchor, renderBoltTable } from './tabs/anchor.js?v=20261009l';
import { loadLrfdCombos, loadStandardVesselCombos, renderComboTable, renderLcSummary, renderStdComboTables, wireComboTable } from './tabs/combos.js?v=20261009l';
import { calcFoundation } from './tabs/foundation.js?v=20261009l';
import { calcFoundSize } from './tabs/foundSize.js?v=20261009l';
import { recalcAllGeneral, renderDesignStandardsTable, renderGeneralSummary, saveStandardEdit } from './tabs/general.js?v=20261009l';
import { ensureLoadType, kindOptions, renderEquipmentLoad, renderLiveLoad, renderLoadSummary, renderLoadTypesTable, renderSeismicDirectPreview, renderWindDirectPreview, saveLoadTypeEdit, updateNewTypeSuggestion } from './tabs/loading.js?v=20261009l';
import { calcPile, fitCapToPiles, generatePileGrid, renderPileTable, resetPMultiplierInputs } from './tabs/pile.js?v=20261009l';
import { calcRebar } from './tabs/rebar.js?v=20261009l';
import { calcSettlement } from './tabs/settlement.js?v=20261009l';
import { calcOneWay, calcTwoWay } from './tabs/shear.js?v=20261009l';
import { setAssistantOpen, setRightPanelView, updateAssistantContext } from './workflow/assistant.js?v=20261009l';
import { calcBearingAndFoundation, calcFoundationAndGeneral, recalcAll } from './workflow/recalc.js?v=20261009l';
import { resolveCheckTab, sync5BSources, toggleLoadInputMode, updateEquipmentSetup, updateFoundationTabVisibility } from './workflow/setup.js?v=20261009l';
import { recalcAllWorkflow, renderLiveBar, renderWorkflowLive, scheduleWorkflowLive, switchWorkflowTab } from './workflow/status.js?v=20261009l';
import { getSavedRightPanelState, getSavedSidebarState, injectSectionNavs, injectSidebarRails, setRightPanelState, setSidebarState, shrinkSidebar, syncSidebarRails } from './ui/sidebar.js?v=20261009l';
import { getSavedViewMode, injectViewSwitchers, setViewMode } from './ui/viewMode.js?v=20261009l';
import { syncThemeButton, toggleTheme } from './ui/theme.js?v=20261009l';
import { setCadView } from './tabs/foundSizeFocus.js?v=20261009l';
import { renderScopePanel } from './workflow/scope.js?v=20261009l';
import { applyProjectData, collectProject, parseProjectText, pickProjectFile, projectFile, resetProjectFile, saveProjectFile, setProjectDirty, setProjectFileName, validateProject } from './workflow/project.js?v=20261009l';

// ---------- Design Standards register (editable — feeds the "1.1 Design Standards" table in the preview) ----------

document.getElementById('gen-standards-table').addEventListener('keydown', (e) => {
  if (!e.target.classList.contains('row-edit-input')) return;
  if (e.key === 'Enter') { e.preventDefault(); saveStandardEdit(window.__stdEditingIndex); }
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); window.__stdEditingIndex = null; renderDesignStandardsTable(); }
});
document.getElementById('gen-standards-table').addEventListener('click', (e) => {
  const t = e.target;
  if (t.classList.contains('gen-standard-edit')) { window.__stdEditingIndex = +t.dataset.i; renderDesignStandardsTable(); document.getElementById('std-edit-docno')?.focus(); return; }
  if (t.classList.contains('gen-standard-cancel')) { window.__stdEditingIndex = null; renderDesignStandardsTable(); return; }
  if (t.classList.contains('gen-standard-save')) { saveStandardEdit(+t.dataset.i); return; }
  if (!e.target.classList.contains('gen-standard-remove')) return;
  window.__stdEditingIndex = null;
  designStandards.splice(+e.target.dataset.i, 1);
  renderDesignStandardsTable();
  renderGeneralSummary();
});
document.getElementById('gen-add-standard').addEventListener('click', () => {
  const docNoEl = document.getElementById('gen-newstd-docno'), titleEl = document.getElementById('gen-newstd-title');
  const docNo = docNoEl.value.trim(), title = titleEl.value.trim();
  if (!docNo) { docNoEl.focus(); return; }
  designStandards.push({ docNo, title });
  docNoEl.value = ''; titleEl.value = '';
  renderDesignStandardsTable();
  renderGeneralSummary();
});
renderDesignStandardsTable();

// ---------- Load combination tables (generic — used by foundation & pile tabs) ----------

['lc-case-D', 'lc-case-other'].forEach(id => document.getElementById(id).addEventListener('input', (e) => {
  const src = e.target.dataset && e.target.dataset.src && document.getElementById(e.target.dataset.src);
  if (!src) return;
  src.value = e.target.value;
  src.dispatchEvent(new Event('input', { bubbles: true })); // Load Values table listener -> recalcAll()
}));
document.getElementById('lc-loadvalue-table').addEventListener('input', (e) => {
  if (!e.target.classList.contains('lc-value-input')) return;
  recalcAll();
});
document.getElementById('lc-loadtype-table').addEventListener('click', (e) => {
  const t = e.target;
  if (t.classList.contains('lc-loadtype-edit')) { window.__ltEditingCode = t.dataset.code; renderLoadTypesTable(); document.getElementById('lt-edit-label')?.focus(); return; }
  if (t.classList.contains('lc-loadtype-cancel')) { window.__ltEditingCode = null; renderLoadTypesTable(); return; }
  if (t.classList.contains('lc-loadtype-save')) { saveLoadTypeEdit(t.dataset.code); return; }
  if (!t.classList.contains('lc-loadtype-remove')) return;
  state.lcLoadTypes = state.lcLoadTypes.filter(lt => lt.code !== e.target.dataset.code);
  renderLoadTypesTable();
  renderComboTable('lc');
  recalcAll();
});
// Enter = Save, Escape = Cancel while a Load Types row is being edited.
document.getElementById('lc-loadtype-table').addEventListener('keydown', (e) => {
  if (!e.target.classList.contains('row-edit-input')) return;
  if (e.key === 'Enter') { e.preventDefault(); saveLoadTypeEdit(window.__ltEditingCode); }
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); window.__ltEditingCode = null; renderLoadTypesTable(); }
});
// Type dropdown / suggestion button on existing custom rows.
document.getElementById('lc-loadtype-table').addEventListener('change', (e) => {
  if (!e.target.classList.contains('lc-loadtype-kind')) return;
  const lt = state.lcLoadTypes.find(t => t.code === e.target.dataset.code);
  if (!lt) return;
  lt.kind = e.target.value || undefined;
  renderLoadTypesTable();
  recalcAll();
});
document.getElementById('lc-loadtype-table').addEventListener('click', (e) => {
  if (!e.target.classList.contains('lc-loadtype-suggest')) return;
  const lt = state.lcLoadTypes.find(t => t.code === e.target.dataset.code);
  if (!lt) return;
  lt.kind = e.target.dataset.kind;
  renderLoadTypesTable();
  recalcAll();
});
// "Add load type" form: Type is required; a suggestion from the typed code/label is offered (one click), not pre-set.
document.getElementById('lc-newtype-kind').innerHTML = kindOptions('');
['lc-newtype-code', 'lc-newtype-label'].forEach(id => document.getElementById(id).addEventListener('input', updateNewTypeSuggestion));
document.getElementById('lc-newtype-kind').addEventListener('change', updateNewTypeSuggestion);
document.getElementById('lc-newtype-suggest').addEventListener('click', (e) => {
  if (e.target.id !== 'lc-newtype-use-suggest') return;
  document.getElementById('lc-newtype-kind').value = e.target.dataset.kind;
  updateNewTypeSuggestion();
});
updateNewTypeSuggestion();
document.getElementById('lc-add-loadtype').addEventListener('click', () => {
  const codeEl = document.getElementById('lc-newtype-code'), labelEl = document.getElementById('lc-newtype-label');
  const kindEl = document.getElementById('lc-newtype-kind');
  const code = codeEl.value.trim();
  const label = labelEl.value.trim() || code;
  if (!code) { codeEl.focus(); return; }
  if (state.lcLoadTypes.some(lt => lt.code === code)) { alert(`Load type code "${code}" already exists — pick a different code.`); return; }
  if (!kindEl.value) { alert(`Choose the type of "${code}" (e.g. Earthquake — X-direction) so the calculation knows how to apply it.`); kindEl.focus(); return; }
  state.lcLoadTypes.push({ code, label, kind: kindEl.value });
  codeEl.value = ''; labelEl.value = ''; kindEl.value = ''; updateNewTypeSuggestion();
  renderLoadTypesTable();
  renderComboTable('lc');
  recalcAll();
});
renderLoadTypesTable();
// ---------- Import Load Types from Image/Table (OCR image or pasted text -> code/label candidates for review) ----------
let ltOcrImageData = null;
document.getElementById('lt-ocr-file').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    ltOcrImageData = ev.target.result;
    document.getElementById('lt-ocr-preview').innerHTML = `<img src="${ltOcrImageData}" alt="Uploaded load designation table" class="ocr-preview-img">`;
    document.getElementById('lt-ocr-run').disabled = false;
    document.getElementById('lt-ocr-status').textContent = 'Image loaded — click "Run OCR" to extract text.';
    document.getElementById('lt-ocr-review').innerHTML = '';
  };
  reader.readAsDataURL(file);
});
document.getElementById('lt-ocr-run').addEventListener('click', async () => {
  const statusEl = document.getElementById('lt-ocr-status');
  const runBtn = document.getElementById('lt-ocr-run');
  if (!ltOcrImageData) {
    statusEl.textContent = 'Upload an image first.';
    return;
  }
  statusEl.textContent = 'Loading OCR engine…';
  if (!(await loadTesseract())) {
    statusEl.textContent = '⚠  OCR library failed to load — check your internet connection and try again.';
    return;
  }
  runBtn.disabled = true;
  statusEl.textContent = 'Running OCR… this may take a few seconds (longer the first time, while the engine downloads).';
  try {
    const { data: { text } } = await Tesseract.recognize(ltOcrImageData, 'eng');
    renderLtOcrReview(text);
    statusEl.textContent = 'OCR complete — review the detected rows below before adding them.';
  } catch (err) {
    statusEl.textContent = '⚠  OCR failed: ' + err.message;
  } finally {
    runBtn.disabled = false;
  }
});
document.getElementById('lt-text-parse').addEventListener('click', () => {
  renderLtOcrReview(document.getElementById('lt-text-paste').value);
});
// ---------- Live Load (L) — direct entry, no formula. Pattern to follow for any future load type that deserves
['ll-load-p', 'lr-load-p'].forEach(id => document.getElementById(id).addEventListener('input', () => {
  renderLiveLoad();
  recalcAll();
}));
renderLiveLoad();
window.__liveLoadReady = true;
// ---------- Equipment Load (E) — direct entry from the mechanical/vendor datasheet, no formula ----------
// recalcAll() is only safe to call once the rest of the script (e.g. pileList, further below) has finished
// initializing — calling it from inside renderEquipmentLoad() itself would break the page's very first render,
// since that function also runs once at startup before those later declarations exist.
['eq-load-ee', 'eq-load-eo', 'eq-load-et'].forEach(id => document.getElementById(id).addEventListener('input', () => {
  renderEquipmentLoad();
  recalcAll();
}));
renderEquipmentLoad();
// ---------- Equipment Load import (OCR image or pasted datasheet text -> EE/EO/ET candidates for review) ----------
let eqOcrImageData = null;
document.getElementById('eq-ocr-file').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    eqOcrImageData = ev.target.result;
    document.getElementById('eq-ocr-preview').innerHTML = `<img src="${eqOcrImageData}" alt="Uploaded mechanical datasheet" class="ocr-preview-img">`;
    document.getElementById('eq-ocr-run').disabled = false;
    document.getElementById('eq-ocr-status').textContent = 'Image loaded — click "Run OCR" to extract text.';
    document.getElementById('eq-ocr-review').innerHTML = '';
  };
  reader.readAsDataURL(file);
});

document.getElementById('eq-ocr-run').addEventListener('click', async () => {
  const statusEl = document.getElementById('eq-ocr-status');
  const runBtn = document.getElementById('eq-ocr-run');
  if (!eqOcrImageData) {
    statusEl.textContent = 'Upload an image first.';
    return;
  }
  statusEl.textContent = 'Loading OCR engine…';
  if (!(await loadTesseract())) {
    statusEl.textContent = '⚠  OCR library failed to load — check your internet connection and try again.';
    return;
  }
  runBtn.disabled = true;
  statusEl.textContent = 'Running OCR… this may take a few seconds (longer the first time, while the engine downloads).';
  try {
    const { data: { text } } = await Tesseract.recognize(eqOcrImageData, 'eng');
    renderEqOcrReview(text);
    statusEl.textContent = 'OCR complete — review the detected values below before applying.';
  } catch (err) {
    statusEl.textContent = '⚠  OCR failed: ' + err.message;
  } finally {
    runBtn.disabled = false;
  }
});
document.getElementById('eq-text-parse').addEventListener('click', () => {
  renderEqOcrReview(document.getElementById('eq-text-paste').value);
});
// ---------- Wind Load (W) — direct datasheet entry; "Calculate" opens the popup generator wired further below ----------

['wl-direct-Fx', 'wl-direct-Mz', 'wl-direct-Fz', 'wl-direct-Mx'].forEach(id => document.getElementById(id).addEventListener('input', renderWindDirectPreview));
renderWindDirectPreview();
document.getElementById('wl-direct-apply').addEventListener('click', () => {
  const Fx = num('wl-direct-Fx'), Mz = num('wl-direct-Mz'), Fz = num('wl-direct-Fz'), Mx = num('wl-direct-Mx');
  state.windDirState = { Fx, Mz, Fz, Mx };
  ensureLoadType('WX', 'Wind Load, WX');
  ensureLoadType('WZ', 'Wind Load, WZ');
  document.getElementById('lc-WX-H').value = Fx.toFixed(2);
  document.getElementById('lc-WX-M').value = Mz.toFixed(2);
  document.getElementById('lc-WZ-H').value = Fz.toFixed(2);
  document.getElementById('lc-WZ-M').value = Mx.toFixed(2);
  recalcAll();
});
// ---------- Seismic Load (E) — direct datasheet entry; "Calculate" opens the popup generator wired further below ----------

['sg-direct-Fx', 'sg-direct-Mz', 'sg-direct-Fz', 'sg-direct-Mx', 'sg-direct-Fx-empty', 'sg-direct-Mz-empty', 'sg-direct-Fz-empty', 'sg-direct-Mx-empty']
  .forEach(id => document.getElementById(id).addEventListener('input', renderSeismicDirectPreview));
renderSeismicDirectPreview();
document.getElementById('sg-direct-apply').addEventListener('click', () => {
  const opeFx = num('sg-direct-Fx'), opeMz = num('sg-direct-Mz'), opeFz = num('sg-direct-Fz'), opeMx = num('sg-direct-Mx');
  state.seismicDirState.opeFx = opeFx; state.seismicDirState.opeMz = opeMz; state.seismicDirState.opeFz = opeFz; state.seismicDirState.opeMx = opeMx;
  ensureLoadType('EQX(O)', 'Seismic Load, Operating, EQX(O)');
  ensureLoadType('EQZ(O)', 'Seismic Load, Operating, EQZ(O)');
  document.getElementById('lc-EQX(O)-H').value = opeFx.toFixed(2);
  document.getElementById('lc-EQX(O)-M').value = opeMz.toFixed(2);
  document.getElementById('lc-EQZ(O)-H').value = opeFz.toFixed(2);
  document.getElementById('lc-EQZ(O)-M').value = opeMx.toFixed(2);
  recalcAll();
});
// (state.seismicDirState lives in core/state.js, alongside state.windDirState, for the same reason — renderEquipmentLoad()
// reads it via renderLoadSummary() once at page load, before the script would otherwise reach this section.)
// Empty-condition seismic feeds the Design Load Summary and the EQX(E)/EQZ(E) rows of the Load Combinations table
// (LC101-116 use them; operating condition, above, feeds EQX(O)/EQZ(O) instead).
['sg-direct-Fx-empty', 'sg-direct-Mz-empty', 'sg-direct-Fz-empty', 'sg-direct-Mx-empty'].forEach(id => document.getElementById(id).addEventListener('input', () => {
  state.seismicDirState.empFx = num('sg-direct-Fx-empty');
  state.seismicDirState.empMz = num('sg-direct-Mz-empty');
  state.seismicDirState.empFz = num('sg-direct-Fz-empty');
  state.seismicDirState.empMx = num('sg-direct-Mx-empty');
  ensureLoadType('EQX(E)', 'Seismic Load, Empty, EQX(E)');
  ensureLoadType('EQZ(E)', 'Seismic Load, Empty, EQZ(E)');
  document.getElementById('lc-EQX(E)-H').value = state.seismicDirState.empFx.toFixed(2);
  document.getElementById('lc-EQX(E)-M').value = state.seismicDirState.empMz.toFixed(2);
  document.getElementById('lc-EQZ(E)-H').value = state.seismicDirState.empFz.toFixed(2);
  document.getElementById('lc-EQZ(E)-M').value = state.seismicDirState.empMx.toFixed(2);
  if (typeof renderLoadSummary === 'function') renderLoadSummary();
  recalcAll();
}));
// ---------- Popup calculators (Wind Load Generator, Seismic Load Generator) — moved out of the inline flow to save space ----------
document.getElementById('wl-open-calc').addEventListener('click', () => openModal('wind-modal'));
document.getElementById('sg-open-calc').addEventListener('click', () => openModal('seismic-modal'));
document.getElementById('lc-open-values').addEventListener('click', () => openModal('values-modal'));
document.getElementById('lc-open-loadtypes').addEventListener('click', () => openModal('loadtypes-modal'));
document.getElementById('lc-open-combos').addEventListener('click', () => openModal('combos-modal'));
document.getElementById('gen-open-standards').addEventListener('click', () => openModal('standards-modal'));
// ---------- AI Assistant drawer toggle (right panel: DESIGN STATUS | ✦ ASSISTANT) — UI only, no AI wired yet ----------

document.getElementById('ai-assistant-toggle').addEventListener('click', () => {
  setAssistantOpen(!document.getElementById('right-panel').classList.contains('assistant-open'));
});
document.getElementById('ai-assistant-close').addEventListener('click', () => setAssistantOpen(false));
document.querySelectorAll('#right-panel .rp-tab').forEach(t => t.addEventListener('click', () => setRightPanelView(t.dataset.view)));
// setTimeout: the tab-switch listener (registered further below) moves the .active class after this one runs.
document.querySelectorAll('.sidebar-menu .tab').forEach(t => t.addEventListener('click', () => setTimeout(updateAssistantContext, 0)));
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'j') {
    e.preventDefault();
    setAssistantOpen(!document.getElementById('right-panel').classList.contains('assistant-open'));
  } else if (e.key === 'Escape' && !document.querySelector('.modal-overlay.open')
             && document.getElementById('right-panel').classList.contains('assistant-open')) {
    setAssistantOpen(false);
  }
}, true); // capture: runs before the modal Escape handler, so one Esc closes an open popup first, not both
// Auto Fill card, Tab 01 — UI only for now: show the chosen file name, no extraction/auto-fill yet.
document.getElementById('gen-ai-file')?.addEventListener('change', (e) => {
  const f = e.target.files && e.target.files[0];
  document.getElementById('gen-ai-file-name').textContent = f ? ('Selected: ' + f.name + ' — extraction not available yet') : '';
});
// Auto Fill card, Tab 02 — pasted text or an OCR'd image -> parseFoundationDimText() -> review table -> "Apply to form".
{
  const chat = document.getElementById('fs-ai-chat'), readBtn = document.getElementById('fs-ai-chat-apply');
  const nameEl = document.getElementById('fs-ai-file-name');
  chat.addEventListener('input', () => { readBtn.disabled = !chat.value.trim(); });
  readBtn.addEventListener('click', () => renderFsAutoFillReview(chat.value, 'text'));
  document.getElementById('fs-ai-file').addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = ''; // the same file can be picked again
    if (!f) return;
    if (!f.type.startsWith('image/')) { nameEl.textContent = `${f.name}: PDF is not supported yet — upload an image (PNG / JPG) or paste the text.`; return; }
    nameEl.textContent = `${f.name}: loading OCR engine…`;
    if (!(await loadTesseract())) { nameEl.textContent = '⚠  OCR library failed to load — check your internet connection and try again.'; return; }
    nameEl.textContent = `${f.name}: running OCR… (longer the first time, while the engine downloads)`;
    try {
      const { data: { text } } = await Tesseract.recognize(f, 'eng');
      nameEl.textContent = `${f.name}: OCR complete — review the values below.`;
      renderFsAutoFillReview(text, 'ocr');
    } catch (err) {
      nameEl.textContent = '⚠  OCR failed: ' + err.message;
    }
  });
}
// Auto Fill highlight: a field filled from text stays marked until the user edits it.
document.addEventListener('input', (e) => { e.target.classList?.remove('ai-filled'); }, true);
document.querySelectorAll('.modal-close').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.close));
});
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(overlay.id); });
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  document.querySelectorAll('.modal-overlay.open').forEach(overlay => closeModal(overlay.id));
});

// ---------- Pile layout table ----------

// pileList is the single shared source of truth for pile layout — read by both this tab's calcPile() and
// "02 — Foundation Dimension"'s calcFoundSize() (footing/pile cap diagram + "n = " count). Every mutation
// below re-runs both so the Section 02 diagram never goes stale relative to what's edited here.
document.getElementById('pf-pile-table').addEventListener('input', (e) => {
  if (!e.target.classList.contains('pile-input')) return;
  const i = +e.target.dataset.i, f = e.target.dataset.f;
  pileList[i][f] = parseFloat(e.target.value) || 0;
  calcPile();
  if (typeof calcFoundSize === 'function') calcFoundSize();
});
document.getElementById('pf-pile-table').addEventListener('click', (e) => {
  if (!e.target.classList.contains('combo-remove')) return;
  pileList.splice(+e.target.dataset.i, 1);
  renderPileTable();
  calcPile();
  if (typeof calcFoundSize === 'function') calcFoundSize();
});
document.getElementById('pf-add-pile').addEventListener('click', () => {
  pileList.push({ x: 0, y: 0 });
  renderPileTable();
  calcPile();
  if (typeof calcFoundSize === 'function') calcFoundSize();
});
document.getElementById('pf-gen-grid').addEventListener('click', () => {
  if (!generatePileGrid()) return;
  renderPileTable();
  calcPile();
  if (typeof calcFoundSize === 'function') calcFoundSize();
});
document.getElementById('pf-fit-cap').addEventListener('click', () => {
  const r = fitCapToPiles();
  document.getElementById('pf-fit-msg').textContent = r.msg;
  if (r.ok) document.getElementById('fs-Bf').dispatchEvent(new Event('input', { bubbles: true })); // Tab 02 -> recalcAll -> 4B
});
document.getElementById('pf-pm-reset').addEventListener('click', () => {
  resetPMultiplierInputs();
  calcPile();
});
renderPileTable();

// ---------- ANCHOR BOLT DESIGN (ACI 318-19 Chapter 17, single-anchor simplification) ----------
document.getElementById('ab-bolt-table').addEventListener('input', (e) => {
  if (!e.target.classList.contains('bolt-input')) return;
  const i = +e.target.dataset.i, f = e.target.dataset.f;
  boltList[i][f] = parseFloat(e.target.value) || 0;
  calcAnchor();
});
document.getElementById('ab-bolt-table').addEventListener('click', (e) => {
  if (!e.target.classList.contains('combo-remove')) return;
  boltList.splice(+e.target.dataset.i, 1);
  renderBoltTable();
  calcAnchor();
});
document.getElementById('ab-add-bolt').addEventListener('click', () => {
  boltList.push({ x: 0, y: 0 });
  renderBoltTable();
  calcAnchor();
});
renderBoltTable();

// ---------- Wind load generator (ASCE 7-22 Ch. 29, force method for rigid "other structures") ----------
// windForceASCE722() lives in lib/foundation/shared/windLoad.js.
selectRadio('wg-exp', () => {});
document.getElementById('wg-generate').addEventListener('click', () => {
  const V = num('wg-V');
  const exp = getRadioVal('wg-exp');
  const Kzt = num('wg-Kzt'), Kd = num('wg-Kd'), Ke = num('wg-Ke'), G = num('wg-G'), Cf = num('wg-Cf'), h = num('wg-h');
  const Asx = num('wg-Asx'), Asz = num('wg-Asz');
  const { alpha, zg, z, Kz, qz, Fx, Mz, Fz, Mx } = windForceASCE722({ V, exposure: exp, z: num('wg-z'), Kzt, Kd, Ke, G, Cf, h, Asx, Asz });
  state.windDirState = { Fx, Mz, Fz, Mx };
  // Each direction fills its own WX/WZ row used by Load Combinations.
  ensureLoadType('WX', 'Wind Load, WX');
  ensureLoadType('WZ', 'Wind Load, WZ');
  document.getElementById('lc-WX-H').value = Fx.toFixed(2);
  document.getElementById('lc-WX-M').value = Mz.toFixed(2);
  document.getElementById('lc-WZ-H').value = Fz.toFixed(2);
  document.getElementById('lc-WZ-M').value = Mx.toFixed(2);
  const dirBlock = (dirLabel, sym, A, symA, F, Msym, M) => {
    let rows = '';
    rows += dlWorksheetItem('Velocity pressure exposure coefficient,', 'K<sub>z</sub>', '2.41·(z / z<sub>g</sub>)<sup>2/α</sup>', `2.41×(${fmt(z,2)}/${fmt(zg,2)})^(2/${fmt(alpha,2)})`, Kz, '', 3, false);
    rows += dlWorksheetItem('Velocity pressure,', 'q<sub>z</sub>', '0.613·K<sub>z</sub>·K<sub>zt</sub>·K<sub>e</sub>·V²', `0.613×${fmt(Kz,3)}×${fmt(Kzt,2)}×${fmt(Ke,3)}×${fmt(V,1)}²`, qz, 'Pa', 1, false);
    rows += dlWorksheetItem(`Projected area,`, symA, 'input', fmt(A,2), A, 'm²', 2, false);
    rows += dlWorksheetItem(`Wind force,`, sym, `q<sub>z</sub>·K<sub>d</sub>·G·C<sub>f</sub>·${symA} / 1000`, `${fmt(qz,1)}×${fmt(Kd,2)}×${fmt(G,2)}×${fmt(Cf,2)}×${fmt(A,2)} / 1000`, F, 'kN', 2, false);
    rows += dlWorksheetItem(`Wind moment,`, Msym, `${sym}·h`, `${fmt(F,2)}×${fmt(h,2)}`, M, 'kN·m', 2, false);
    return rows;
  };
  const wgHtml = `<div class="overflow-x"><table class="dl-worksheet"><colgroup><col style="width:28%"><col style="width:8%"><col style="width:18px"><col style="width:20%"><col style="width:24%"><col style="width:17%"></colgroup>
    <caption>Wind Load Generator (ASCE 7-22 Ch. 29) — X-direction</caption>
    ${dirBlock('transversal', 'F<sub>x</sub>', Asx, 'A<sub>sx</sub>', Fx, 'M<sub>z</sub>', Mz)}
  </table></div>
  <div class="overflow-x"><table class="dl-worksheet"><colgroup><col style="width:28%"><col style="width:8%"><col style="width:18px"><col style="width:20%"><col style="width:24%"><col style="width:17%"></colgroup>
    <caption>Wind Load Generator (ASCE 7-22 Ch. 29) — Z-direction</caption>
    ${dirBlock('longitudinal', 'F<sub>z</sub>', Asz, 'A<sub>sz</sub>', Fz, 'M<sub>x</sub>', Mx)}
  </table></div>
  <div class="note">Fills the Design Load Summary's and Load Combinations' WX (F<sub>x</sub>=${fmt(Fx,2)} kN, M<sub>z</sub>=${fmt(Mz,2)} kN·m) and WZ (F<sub>z</sub>=${fmt(Fz,2)} kN, M<sub>x</sub>=${fmt(Mx,2)} kN·m) rows directly. K<sub>zt</sub>, K<sub>d</sub> and C<sub>f</sub> depend on structure shape and site — verify against ASCE 7-22 Tables 26.8-1, 26.6-1 and 29.4-1 before using the generated value. z below z<sub>min</sub> of the exposure (B 9.14 m, C 4.57 m, D 2.13 m) is raised to z<sub>min</sub>.</div>`;
  document.getElementById('wg-result').innerHTML = wgHtml;
  // Also persist the breakdown in the main "03 — LOADING DATA" results panel, so it stays visible after the popup closes.
  const wgPreview = document.getElementById('wind-calc-preview');
  if (wgPreview) wgPreview.innerHTML = wgHtml;
  recalcAll();
});
// ---------- Seismic load generator (equivalent lateral force, rigid equipment) ----------
// designSpectralAccel() and seismicResponseCoefficient() live in lib/foundation/shared/seismicLoad.js.
selectRadio('sg-site', () => recalcAll());
selectRadio('sg-mode', () => {
  const mode = getRadioVal('sg-mode');
  document.getElementById('sg-compute-fields').style.display = (mode === 'compute') ? 'block' : 'none';
  document.getElementById('sg-direct-fields').style.display = (mode === 'direct') ? 'block' : 'none';
  recalcAll();
});
// Keeps the "A.3.2 Loading Combination" SDS display (and its factor columns) live as these are edited directly,
// without requiring the "Generate" button click that the rest of the Seismic Load Generator worksheet needs.
['sg-Ss', 'sg-SDS-direct'].forEach(id => document.getElementById(id).addEventListener('input', () => recalcAll()));
document.getElementById('sg-generate').addEventListener('click', () => {
  const mode = getRadioVal('sg-mode');
  const site = getRadioVal('sg-site');
  const Ss = num('sg-Ss'), S1 = num('sg-S1');
  const { Fa, Fv, SMS, SM1, SDS, SD1 } = designSpectralAccel({ mode, Ss, S1, site, SDSDirect: num('sg-SDS-direct'), SD1Direct: num('sg-SD1-direct') });
  let rows = '';
  if (mode === 'compute') {
    rows += dlWorksheetItem('MCE spectral acceleration, short period,', 'S<sub>S</sub>', 'input', fmt(Ss,3), Ss, 'g', 3, false);
    rows += dlWorksheetItem('MCE spectral acceleration, 1s period,', 'S<sub>1</sub>', 'input', fmt(S1,3), S1, 'g', 3, false);
    rows += dlWorksheetItem('Site coefficient (Table 11.4-1),', 'F<sub>a</sub>', `interp(S<sub>S</sub>, Site Class ${site})`, `Table 11.4-1 @ Class ${site}`, Fa, '', 3, false);
    rows += dlWorksheetItem('Site coefficient (Table 11.4-2),', 'F<sub>v</sub>', `interp(S<sub>1</sub>, Site Class ${site})`, `Table 11.4-2 @ Class ${site}`, Fv, '', 3, false);
    rows += dlWorksheetItem('MCE spectral acceleration, adjusted,', 'S<sub>MS</sub>', 'F<sub>a</sub>·S<sub>S</sub>', `${fmt(Fa,3)}×${fmt(Ss,3)}`, SMS, 'g', 3, false);
    rows += dlWorksheetItem('MCE spectral acceleration, adjusted,', 'S<sub>M1</sub>', 'F<sub>v</sub>·S<sub>1</sub>', `${fmt(Fv,3)}×${fmt(S1,3)}`, SM1, 'g', 3, false);
  }
  rows += dlWorksheetItem('Design spectral acceleration, short period,', 'S<sub>DS</sub>', mode === 'compute' ? '(2/3)·S<sub>MS</sub>' : 'input', mode === 'compute' ? `(2/3)×${fmt(SMS,3)}` : fmt(SDS,3), SDS, 'g', 3, false);
  rows += dlWorksheetItem('Design spectral acceleration, 1s period,', 'S<sub>D1</sub>', mode === 'compute' ? '(2/3)·S<sub>M1</sub>' : 'input', mode === 'compute' ? `(2/3)×${fmt(SM1,3)}` : fmt(SD1,3), SD1, 'g', 3, false);
  const R = num('sg-R'), Ie = num('sg-Ie'), hn = num('sg-hn'), Ct = num('sg-Ct'), xExp = num('sg-x'), TL = num('sg-TL'), CoG = num('sg-h');
  const { Ta, Ts, CsInit, CsMax, CsMin, csMinBasis, Cs, csGovernedBy } = seismicResponseCoefficient({ SDS, SD1, R, Ie, hn, Ct, xExp, TL, S1, mode });
  rows += dlWorksheetItem('Approx. fundamental period,', 'T<sub>a</sub>', 'C<sub>t</sub>·h<sub>n</sub><sup>x</sup>', `${fmt(Ct,3)}×${fmt(hn,2)}^${fmt(xExp,2)}`, Ta, 's', 3, false);
  rows += dlWorksheetItem('Long-period transition period,', 'T<sub>L</sub>', 'input', fmt(TL,2), TL, 's', 2, false);
  rows += dlWorksheetItem('Transition period,', 'T<sub>S</sub>', 'S<sub>D1</sub> / S<sub>DS</sub>', `${fmt(SD1,3)}/${fmt(SDS,3)}`, Ts, 's', 3, false);
  const minNote = csMinBasis === 'S1' ? '0.5·S<sub>1</sub>/(R/I<sub>e</sub>) — governs, S<sub>1</sub>≥0.6g' : 'max(0.044·S<sub>DS</sub>·I<sub>e</sub>, 0.01)';
  const govNote = csGovernedBy === 'max' ? ' (governed by C<sub>s,max</sub>)' : csGovernedBy === 'min' ? ' (governed by C<sub>s,min</sub>)' : '';
  rows += dlWorksheetItem('Seismic response coefficient,', 'C<sub>s</sub>', 'S<sub>DS</sub> / (R/I<sub>e</sub>)', `${fmt(SDS,3)}/(${fmt(R,2)}/${fmt(Ie,2)})`, CsInit, '', 4, false);
  rows += dlWorksheetItem(`Maximum, C<sub>s,max</sub> (T<sub>a</sub> ${Ta <= TL ? '≤' : '>'} T<sub>L</sub>),`, 'C<sub>s,max</sub>', Ta <= TL ? 'S<sub>DS</sub> / (T<sub>a</sub>(R/I<sub>e</sub>))' : 'S<sub>DS</sub>·T<sub>L</sub> / (T<sub>a</sub>²(R/I<sub>e</sub>))', Ta <= TL ? `${fmt(SDS,3)}/(${fmt(Ta,3)}×(${fmt(R,2)}/${fmt(Ie,2)}))` : `${fmt(SDS,3)}×${fmt(TL,2)}/(${fmt(Ta,3)}²×(${fmt(R,2)}/${fmt(Ie,2)}))`, CsMax, '', 4, false);
  rows += dlWorksheetItem('Minimum,', 'C<sub>s,min</sub>', minNote, minNote, CsMin, '', 4, false);
  rows += dlWorksheetItem(`Seismic response coefficient (governing)${govNote},`, 'C<sub>s</sub>', 'clamp(C<sub>s</sub>, C<sub>s,min</sub>, C<sub>s,max</sub>)', `clamp(${fmt(CsInit,4)}, ${fmt(CsMin,4)}, ${fmt(CsMax,4)})`, Cs, '', 4, false);
  const EE = num('eq-load-ee'), EO = num('eq-load-eo'); // kN
  const V_emp = Cs * EE, M_emp = V_emp * CoG;
  const V_ope = Cs * EO, M_ope = V_ope * CoG;
  rows += dlWorksheetItem('Lateral load, empty condition,', 'V<sub>Empty</sub>', 'C<sub>s</sub>·E(E)', `${fmt(Cs,4)}×${fmt(EE,2)}`, V_emp, 'kN', 2, false);
  rows += dlWorksheetItem('Moment at bottom of foundation, empty,', 'M<sub>Empty</sub>', 'V<sub>Empty</sub>·CoG', `${fmt(V_emp,2)}×${fmt(CoG,2)}`, M_emp, 'kN·m', 2, false);
  rows += dlWorksheetItem('Lateral load, operating condition,', 'V<sub>Operating</sub>', 'C<sub>s</sub>·E(O)', `${fmt(Cs,4)}×${fmt(EO,2)}`, V_ope, 'kN', 2, false);
  rows += dlWorksheetItem('Moment at bottom of foundation, operating,', 'M<sub>Operating</sub>', 'V<sub>Operating</sub>·CoG', `${fmt(V_ope,2)}×${fmt(CoG,2)}`, M_ope, 'kN·m', 2, false);
  ensureLoadType('EQX(E)', 'Seismic Load, Empty, EQX(E)');
  ensureLoadType('EQZ(E)', 'Seismic Load, Empty, EQZ(E)');
  ensureLoadType('EQX(O)', 'Seismic Load, Operating, EQX(O)');
  ensureLoadType('EQZ(O)', 'Seismic Load, Operating, EQZ(O)');
  document.getElementById('lc-EQX(E)-H').value = V_emp.toFixed(2);
  document.getElementById('lc-EQX(E)-M').value = M_emp.toFixed(2);
  document.getElementById('lc-EQZ(E)-H').value = V_emp.toFixed(2);
  document.getElementById('lc-EQZ(E)-M').value = M_emp.toFixed(2);
  document.getElementById('lc-EQX(O)-H').value = V_ope.toFixed(2);
  document.getElementById('lc-EQX(O)-M').value = M_ope.toFixed(2);
  document.getElementById('lc-EQZ(O)-H').value = V_ope.toFixed(2);
  document.getElementById('lc-EQZ(O)-M').value = M_ope.toFixed(2);
  document.getElementById('sg-direct-Fx-empty').value = V_emp.toFixed(2);
  document.getElementById('sg-direct-Mz-empty').value = M_emp.toFixed(2);
  document.getElementById('sg-direct-Fz-empty').value = V_emp.toFixed(2);
  document.getElementById('sg-direct-Mx-empty').value = M_emp.toFixed(2);
  // Cs is isotropic (same for X and Z) — so Fx=Fz=V and Mz=Mx=M in magnitude for each condition; the Design
  // Load Summary still shows Mx with the opposite sign from Mz (longitudinal vs. transversal convention).
  state.seismicDirState = { empFx: V_emp, empMz: M_emp, empFz: V_emp, empMx: M_emp, opeFx: V_ope, opeMz: M_ope, opeFz: V_ope, opeMx: M_ope };
  const sgHtml = `<div class="overflow-x"><table class="dl-worksheet"><colgroup><col style="width:28%"><col style="width:8%"><col style="width:18px"><col style="width:20%"><col style="width:24%"><col style="width:17%"></colgroup>
    <caption>Seismic Load Generator (ASCE 7-22, X and Z directions — same C<sub>s</sub> both ways)</caption>
    ${rows}
  </table></div>
  <div class="note">Operating condition (V=${fmt(V_ope,2)} kN, M=${fmt(M_ope,2)} kN·m) fills the EQX(O)/EQZ(O) rows used by Load Combinations; Empty condition (V=${fmt(V_emp,2)} kN, M=${fmt(M_emp,2)} kN·m) fills the EQX(E)/EQZ(E) rows. Both apply identically to the X and Z directions. Verify R, I<sub>e</sub>, and site coefficients against your project's code edition and structure classification (ASCE 7-22 Table 15.4-2 or 12.2-1, and 1.5-2).</div>`;
  document.getElementById('sg-result').innerHTML = sgHtml;
  const sgPreview = document.getElementById('seismic-calc-preview');
  if (sgPreview) sgPreview.innerHTML = sgHtml;
  recalcAll();
});

// ---------- Standard Vessel Foundation Load Combinations (A.3.2-style, LC101-126) ----------

// Unfactored per-load-type vectors (P vertical; Fx/Mz transversal; Fz/Mx longitudinal, sign per the longi()
// convention used by the Design Load Summary; dP/dMz/dMx are the top->bottom transfer terms). Every registered
// load type is read from its Load Values fields (lc-<code>-P/H/M; equipment P straight from the kN inputs) and
// turned into a vector by its KIND (lib buildComboBase()), not by its code — so an engineer's own notation (e.g.
// "V" for seismic) is computed correctly once its type is chosen in "Edit Load Types". A type with no kind is
// left out and listed in state.lastUntypedLoadTypes (warned in 3.3 / stability) instead of being guessed.
// Reset at this point of startup, exactly as the former hoisted `var` declaration re-initialised it here
// (renderLoadSummary() -> buildStdComboBase() already ran once above and filled it).
state.lastUntypedLoadTypes = [];

// ---------- OCR import (image of a load combination table -> detected rows for review) ----------
let lcOcrImageData = null;
document.getElementById('lc-ocr-file').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    lcOcrImageData = ev.target.result;
    document.getElementById('lc-ocr-preview').innerHTML = `<img src="${lcOcrImageData}" alt="Uploaded load combination table" class="ocr-preview-img">`;
    document.getElementById('lc-ocr-run').disabled = false;
    document.getElementById('lc-ocr-status').textContent = 'Image loaded — click "Run OCR" to extract text.';
    document.getElementById('lc-ocr-review').innerHTML = '';
  };
  reader.readAsDataURL(file);
});
// ---------- Load combination import (Excel paste / OCR text -> review -> comboState.lc) ----------

document.getElementById('lc-paste-toggle').addEventListener('click', () => {
  const p = document.getElementById('lc-paste-panel');
  p.style.display = p.style.display === 'none' ? '' : 'none';
  if (p.style.display === '') document.getElementById('lc-paste-text').focus();
});
document.getElementById('lc-paste-parse').addEventListener('click', () => {
  renderComboImportReview(document.getElementById('lc-paste-review'), document.getElementById('lc-paste-text').value, 'paste');
});
// Pasting straight into the box parses immediately (no extra click needed).
document.getElementById('lc-paste-text').addEventListener('paste', () => setTimeout(() => document.getElementById('lc-paste-parse').click(), 0));
document.getElementById('lc-ocr-run').addEventListener('click', async () => {
  const statusEl = document.getElementById('lc-ocr-status');
  const runBtn = document.getElementById('lc-ocr-run');
  if (!lcOcrImageData) {
    statusEl.textContent = 'Upload an image first.';
    return;
  }
  statusEl.textContent = 'Loading OCR engine…';
  if (!(await loadTesseract())) {
    statusEl.textContent = '⚠  OCR library failed to load — check your internet connection and try again.';
    return;
  }
  runBtn.disabled = true;
  statusEl.textContent = 'Running OCR… this may take a few seconds (longer the first time, while the engine downloads).';
  try {
    const { data: { text } } = await Tesseract.recognize(lcOcrImageData, 'eng');
    renderOcrReview(text);
    statusEl.textContent = 'OCR complete — review the detected rows below before adding them.';
  } catch (err) {
    statusEl.textContent = '⚠  OCR failed: ' + err.message;
  } finally {
    runBtn.disabled = false;
  }
});

// ---------- Report builder: pick, reorder and page-break the sections that go into the printable report ----------
document.getElementById('rpt-block-table').addEventListener('change', (e) => {
  const i = +e.target.dataset.i;
  if (Number.isNaN(i)) return;
  if (e.target.classList.contains('rpt-include')) reportBlocks[i].include = e.target.checked;
  if (e.target.classList.contains('rpt-pagebreak')) reportBlocks[i].pageBreak = e.target.checked;
  generateReport();
});
document.getElementById('rpt-block-table').addEventListener('click', (e) => {
  const i = +e.target.dataset.i;
  if (Number.isNaN(i)) return;
  if (e.target.classList.contains('rpt-up') && i > 0) {
    [reportBlocks[i - 1], reportBlocks[i]] = [reportBlocks[i], reportBlocks[i - 1]];
    renderBlockList();
    generateReport();
  } else if (e.target.classList.contains('rpt-down') && i < reportBlocks.length - 1) {
    [reportBlocks[i + 1], reportBlocks[i]] = [reportBlocks[i], reportBlocks[i + 1]];
    renderBlockList();
    generateReport();
  }
});
renderBlockList();
wireLogoUpload('rpt-logo1', 'rpt-logo1-preview', (d) => { state.rptLogo1 = d; });
wireLogoUpload('rpt-logo2', 'rpt-logo2-preview', (d) => { state.rptLogo2 = d; });
document.getElementById('rpt-use-docheader').addEventListener('change', (e) => {
  document.getElementById('rpt-docheader-fields').style.display = e.target.checked ? 'block' : 'none';
  generateReport();
});

document.getElementById('rpt-generate').addEventListener('click', generateReport);
document.getElementById('summary-print').addEventListener('click', () => window.print());
// wire up radios
selectRadio('ow-lambda', calcOneWay);
selectRadio('ow-method', calcOneWay);
selectRadio('ow-vu-src', calcOneWay);
selectRadio('ow-dir', calcOneWay);
selectRadio('tw-vu-src', calcTwoWay);
selectRadio('tw-lambda', calcTwoWay);
selectRadio('tw-loc', calcTwoWay);
selectRadio('fd-ecc', calcFoundationAndGeneral);
selectRadio('fd-bearmeth', calcFoundationAndGeneral);
selectRadio('bc-shape', calcBearingAndFoundation);
selectRadio('bc-method', calcBearingAndFoundation);
selectRadio('bc-failure', calcBearingAndFoundation);
selectRadio('ab-type', calcAnchor);
selectRadio('ab-crack', calcAnchor);
selectRadio('fs-type', calcFoundSize);

selectRadio('fs-support', () => { sync5BSources(); calcFoundSize(); updateFoundationTabVisibility(); renderGeneralSummary(); });
selectRadio('ld-mode', () => { toggleLoadInputMode(); recalcAll(); });
toggleLoadInputMode();
// wire up the shared load combination table
wireComboTable('lc', recalcAll);
// Separate factored (LRFD) combination table — used only by the pile cap flexure / shear (5B), so a change re-runs those.
const recalcPileCap = () => { calcRebar(); calcOneWay(); calcTwoWay(); calcAnchor(); renderLcSummary(); }; // LRFD users (5A, 5B, 09) + the LRFD tables in Section 03
wireComboTable('lrfd', recalcPileCap);
document.getElementById('lrfd-reload-combos').addEventListener('click', () => { loadLrfdCombos(); recalcPileCap(); });
document.querySelectorAll('.lrfd-open-btn').forEach(btn => btn.addEventListener('click', () => openModal('combos-lrfd-modal')));
document.getElementById('lc-reload-std-combos').addEventListener('click', () => {
  loadStandardVesselCombos();
  recalcAll();
});
// wire up inputs
document.querySelectorAll('#in-oneway input').forEach(el => el.addEventListener('input', calcOneWay));
document.querySelectorAll('#in-twoway input').forEach(el => el.addEventListener('input', calcTwoWay));
document.querySelectorAll('#in-foundation input').forEach(el => el.addEventListener('input', calcFoundationAndGeneral));
document.querySelectorAll('#in-pile input:not(.pile-input)').forEach(el => el.addEventListener('input', calcPile));
document.getElementById('pf-dia').addEventListener('input', calcFoundSize); // the 02 plan draws the piles at their true diameter
document.querySelectorAll('#in-pile select').forEach(el => el.addEventListener('change', calcPile));
document.querySelectorAll('#in-loadcomb input:not(.combo-input):not(.lc-value-input):not(#lc-ocr-file)').forEach(el => el.addEventListener('input', recalcAll));
document.querySelectorAll('#in-bearing input').forEach(el => el.addEventListener('input', calcBearingAndFoundation));
document.querySelectorAll('#in-settlement input').forEach(el => el.addEventListener('input', calcSettlement));
document.querySelectorAll('#in-settlement select').forEach(el => el.addEventListener('change', calcSettlement));
document.querySelectorAll('#in-anchor input:not(.bolt-input)').forEach(el => el.addEventListener('input', calcAnchor));
document.querySelectorAll('#in-rebar input, #in-rebarcap input').forEach(el => el.addEventListener('input', calcRebar));
document.querySelectorAll('#in-summary input:not(.rpt-include):not(.rpt-pagebreak):not([type="file"])').forEach(el => el.addEventListener('input', generateReport));
document.querySelectorAll('#in-foundsize input').forEach(el => el.addEventListener('input', calcFoundSize));
document.querySelectorAll('#in-general input').forEach(el => el.addEventListener('input', recalcAllGeneral));
// Pile capacity fields (P_all, T_all, H_all) — kN, 1 decimal, matching Table 1.3.2's fmt(...,1).
[['pf-Qc', 1], ['pf-Qt', 1], ['pf-Ql', 1]].forEach(([id, dec]) => wireDecimalAutoFormat(id, dec));
// Footing/Pile Cap Dimensions fields — m, matching Table 02's fmt(...,2) (Gp uses 3, per fmt(Gp,3)).
[['fs-Bf', 2], ['fs-Lf', 2], ['fs-Hf', 2], ['fs-Df', 2], ['fs-lean-proj', 2], ['fs-lean-t', 2],
 ['fs-Bp', 2], ['fs-Lp', 2], ['fs-Gp', 3], ['fs-OffX', 2], ['fs-OffZ', 2]].forEach(([id, dec]) => wireDecimalAutoFormat(id, dec));
// tabs
const TAB_IDS = ['setup', 'loadingdata', 'oneway', 'twoway', 'foundation', 'pile', 'bearing', 'settlement', 'anchor', 'rebar', 'rebarcap', 'summary', 'foundsize', 'general'];
// "05 Structural Design" tabs show several existing input/result panels together (ids unchanged, so every
// calc*() and listener keeps working): 5A Pedestal Check = pedestal P-M rebar; 5B Pile Cap Check = one-way
// shear + punching shear + pile cap flexure.
const TAB_PANELS = { pedcheck: ['rebar'], capcheck: ['oneway', 'twoway', 'rebarcap'] };
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    // don't select hidden tabs
    if(tab.style.display === 'none') return;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const target = tab.dataset.tab;
    const panels = TAB_PANELS[target] || [target];
    TAB_IDS.forEach(id => {
      const inEl = document.getElementById('in-' + id);
      if (inEl) inEl.style.display = panels.includes(id) ? 'block' : 'none';
      const calcEl = document.getElementById('calc-' + id);
      if (calcEl) calcEl.classList.toggle('active', panels.includes(id));
    });
    if (target === 'summary') renderSummaryReport();
  });
});

selectRadio('eq-type', updateEquipmentSetup);
updateEquipmentSetup(); // Run on startup
// 00 profile card: each required check opens the tab where it is done ('stability' -> 4A or 4B by Support).
document.getElementById('setup-status').addEventListener('click', (e) => {
  const b = e.target.closest('[data-check-tab]');
  if (b) switchWorkflowTab(resolveCheckTab(b.dataset.checkTab));
});
// Scope of Work (right panel on 00): taking a check in or out of scope re-runs everything that reads it (08, 4A via q_a, 09,
// Table 1.3.1, Design Status) and sets the NOT IN SCOPE banners.
['scope-stability', 'scope-bearing', 'scope-settlement', 'scope-structural', 'scope-anchor'].forEach((id) => document.getElementById(id).addEventListener('change', () => { renderScopePanel(); recalcAll(); }));
updateFoundationTabVisibility(); // Run on startup — hide the tab that doesn't match the default Support selection
document.getElementById('st-copy-bearing').addEventListener('click', () => {
  document.getElementById('st-B').value = document.getElementById('bc-B').value;
  document.getElementById('st-L').value = document.getElementById('bc-L').value;
  calcSettlement();
});
// loadStandardVesselCombos() must run before any calc*() that reads comboState.lc, so the first paint uses the
// LC101-126 set (biaxial-ready) instead of the transient 7-combo defaultCombos() fallback.
if (typeof loadStandardVesselCombos === 'function') loadStandardVesselCombos();
loadLrfdCombos(); // factored set for 5B — must exist before calcRebar / calcOneWay / calcTwoWay run (recalcAll below)
calcFoundation();
calcPile();
recalcPileCap();
calcSettlement();
recalcAllGeneral();
renderLcSummary();
if (typeof renderStdComboTables === 'function') renderStdComboTables();
renderSummaryReport();
if (typeof renderWorkflowLive === 'function') renderWorkflowLive();
  document.getElementById('pr-generate-combos').addEventListener('click', () => {
    // Read Pipe Rack inputs
    const De_P = num('pr-de-p'), De_Hx = num('pr-de-hx'), De_Hz = num('pr-de-hz');
    const Do_P = num('pr-do-p'), Do_Hx = num('pr-do-hx'), Do_Hz = num('pr-do-hz');
    const Tf_Hx = num('pr-tf-hx'), Tf_Hz = num('pr-tf-hz');
    const Ta_Hx = num('pr-ta-hx'), Ta_Hz = num('pr-ta-hz');
    const W_P = num('pr-w-p'), W_Hx = num('pr-w-hx'), W_Hz = num('pr-w-hz');
    ensureLoadType('D', 'Dead Load, D');
    ensureLoadType('L', 'Live Load, L');
    ensureLoadType('T', 'Thermal Force, T');
    ensureLoadType('W', 'Wind Load, W');
    ensureLoadType('E', 'Earthquake / Seismic Load, E');
    document.getElementById('lc-D-P').value = De_P;
    document.getElementById('lc-D-H').value = Math.max(Math.abs(De_Hx), Math.abs(De_Hz));
    document.getElementById('lc-D-M').value = 0;
    document.getElementById('lc-L-P').value = Do_P;
    document.getElementById('lc-L-H').value = Math.max(Math.abs(Do_Hx), Math.abs(Do_Hz));
    document.getElementById('lc-L-M').value = 0;
    document.getElementById('lc-T-P').value = 0;
    document.getElementById('lc-T-H').value = Math.max(Math.abs(Tf_Hx + Ta_Hx), Math.abs(Tf_Hz + Ta_Hz));
    document.getElementById('lc-T-M').value = 0;
    document.getElementById('lc-W-P').value = W_P;
    document.getElementById('lc-W-H').value = Math.max(Math.abs(W_Hx), Math.abs(W_Hz));
    document.getElementById('lc-W-M').value = 0;
    document.getElementById('lc-E-P').value = 0;
    document.getElementById('lc-E-H').value = 0;
    document.getElementById('lc-E-M').value = 0;
    comboState.lc = [
      { lc: '1', name: 'Operating', f: { D: 1.0, L: 1.0, W: 0, E: 0, T: 0 } },
      { lc: '2', name: 'Operating + Thermal', f: { D: 1.0, L: 1.0, W: 0, E: 0, T: 1.0 } },
      // The wind value entered above is the strength-level W (same as the Wind Generator), so the ASD combinations
      // apply 0.6W — ASCE 7-22 §2.4.1, like the standard LC101-126 set.
      { lc: '3', name: 'Operating + 0.6W', f: { D: 1.0, L: 1.0, W: 0.6, E: 0, T: 0 } },
      { lc: '4', name: 'Empty + 0.6W', f: { D: 1.0, L: 0, W: 0.6, E: 0, T: 0 } },
      { lc: '5', name: 'Operating + Thermal + 0.6W', f: { D: 1.0, L: 1.0, W: 0.6, E: 0, T: 1.0 } },
      { lc: '6', name: '0.6 Empty + 0.6W (Uplift)', f: { D: 0.6, L: 0, W: 0.6, E: 0, T: 0 } }
    ];
    renderComboTable('lc');
    recalcAll();
    document.querySelector('.tab[data-tab="loadingdata"]').click();
  });
  document.getElementById('vsl-generate-combos').addEventListener('click', () => {
    const D_P = num('vsl-d-p');
    const Do_P = num('vsl-do-p');
    const W_H = num('vsl-w-h'), W_M = num('vsl-w-m');
    const E_H = num('vsl-e-h'), E_M = num('vsl-e-m');
    ensureLoadType('D', 'Dead Load, D');
    ensureLoadType('L', 'Live Load, L');
    ensureLoadType('T', 'Thermal Force, T');
    ensureLoadType('W', 'Wind Load, W');
    ensureLoadType('E', 'Earthquake / Seismic Load, E');
    document.getElementById('lc-D-P').value = D_P;
    document.getElementById('lc-D-H').value = 0; document.getElementById('lc-D-M').value = 0;
    document.getElementById('lc-L-P').value = Do_P;
    document.getElementById('lc-L-H').value = 0; document.getElementById('lc-L-M').value = 0;
    document.getElementById('lc-T-P').value = 0; document.getElementById('lc-T-H').value = 0; document.getElementById('lc-T-M').value = 0;
    document.getElementById('lc-W-P').value = 0;
    document.getElementById('lc-W-H').value = W_H;
    document.getElementById('lc-W-M').value = W_M;
    document.getElementById('lc-E-P').value = 0;
    document.getElementById('lc-E-H').value = E_H;
    document.getElementById('lc-E-M').value = E_M;
    comboState.lc = [
      { lc: '1', name: 'Operating', f: { D: 1.0, L: 1.0, W: 0, E: 0, T: 0 } },
      // W entered above is the strength-level value (like the Wind Generator) -> 0.6W in ASD; E already uses 0.7E.
      { lc: '2', name: 'Operating + 0.6W', f: { D: 1.0, L: 1.0, W: 0.6, E: 0, T: 0 } },
      { lc: '3', name: 'Operating + Seismic', f: { D: 1.0, L: 1.0, W: 0, E: 0.7, T: 0 } },
      { lc: '4', name: 'Empty + 0.6W', f: { D: 1.0, L: 0, W: 0.6, E: 0, T: 0 } },
      { lc: '5', name: '0.6 Empty + 0.6W (Uplift)', f: { D: 0.6, L: 0, W: 0.6, E: 0, T: 0 } },
      { lc: '6', name: '0.6 Empty + Seismic', f: { D: 0.6, L: 0, W: 0, E: 0.7, T: 0 } }
    ];
    renderComboTable('lc');
    recalcAll();
    document.querySelector('.tab[data-tab="loadingdata"]').click();
  });
  document.getElementById('tnk-generate-combos').addEventListener('click', () => {
    const D_P = num('tnk-d-p');
    const Do_P = num('tnk-do-p');
    const W_H = num('tnk-w-h'), W_M = num('tnk-w-m');
    const E_H = num('tnk-e-h'), E_M = num('tnk-e-m');
    ensureLoadType('D', 'Dead Load, D');
    ensureLoadType('L', 'Live Load, L');
    ensureLoadType('T', 'Thermal Force, T');
    ensureLoadType('W', 'Wind Load, W');
    ensureLoadType('E', 'Earthquake / Seismic Load, E');
    document.getElementById('lc-D-P').value = D_P;
    document.getElementById('lc-D-H').value = 0; document.getElementById('lc-D-M').value = 0;
    document.getElementById('lc-L-P').value = Do_P;
    document.getElementById('lc-L-H').value = 0; document.getElementById('lc-L-M').value = 0;
    document.getElementById('lc-T-P').value = 0; document.getElementById('lc-T-H').value = 0; document.getElementById('lc-T-M').value = 0;
    document.getElementById('lc-W-P').value = 0;
    document.getElementById('lc-W-H').value = W_H;
    document.getElementById('lc-W-M').value = W_M;
    document.getElementById('lc-E-P').value = 0;
    document.getElementById('lc-E-H').value = E_H;
    document.getElementById('lc-E-M').value = E_M;
    comboState.lc = [
      { lc: '1', name: 'Operating', f: { D: 1.0, L: 1.0, W: 0, E: 0, T: 0 } },
      // W entered above is the strength-level value (like the Wind Generator) -> 0.6W in ASD; E already uses 0.7E.
      { lc: '2', name: 'Operating + 0.6W', f: { D: 1.0, L: 1.0, W: 0.6, E: 0, T: 0 } },
      { lc: '3', name: 'Operating + Seismic', f: { D: 1.0, L: 1.0, W: 0, E: 0.7, T: 0 } },
      { lc: '4', name: 'Empty + 0.6W', f: { D: 1.0, L: 0, W: 0.6, E: 0, T: 0 } },
      { lc: '5', name: '0.6 Empty + 0.6W (Uplift)', f: { D: 0.6, L: 0, W: 0.6, E: 0, T: 0 } }
    ];
    renderComboTable('lc');
    recalcAll();
    document.querySelector('.tab[data-tab="loadingdata"]').click();
  });
// ---------- WORKFLOW TAHAPAN WAJIB (00 -> 11) LIVE STATUS ----------

window.switchWorkflowTab = switchWorkflowTab;
window.renderWorkflowLive = renderWorkflowLive;
window.renderLiveBar = renderLiveBar;
window.recalcAllWorkflow = recalcAllWorkflow;

document.getElementById('wf-recalc')?.addEventListener('click', recalcAllWorkflow);
document.querySelectorAll('#wf-nav button').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#wf-nav button').forEach((b) => b.classList.remove('sel'));
    btn.classList.add('sel');
    switchWorkflowTab(btn.dataset.val);
  });
});

// ---------- Layout: collapsible input panel + Focus Canvas / Report Preview switch (js/ui/) ----------
// Injected before the first renderWorkflowLive() below so the governing badges get filled on startup.
injectSidebarRails();
injectSectionNavs(); // sticky Previous / Next section bar at the bottom of the main (preview) panel
injectViewSwitchers();
setSidebarState(getSavedSidebarState(), false);
setRightPanelState(getSavedRightPanelState(), false);
setViewMode(getSavedViewMode(), false);
document.addEventListener('click', (e) => {
  const t = e.target.closest && e.target.closest('[data-sidebar-set], [data-sidebar-step], [data-go-tab], [data-rp-set], .view-switcher-bar [data-mode]');
  if (!t) return;
  if (t.dataset.rpSet) { setRightPanelState(t.dataset.rpSet); return; }
  if (t.dataset.sidebarSet) setSidebarState(t.dataset.sidebarSet);
  else if (t.dataset.sidebarStep) shrinkSidebar();
  else if (t.dataset.goTab) switchWorkflowTab(t.dataset.goTab);
  else if (t.dataset.mode) setViewMode(t.dataset.mode);
});
// Compact strip codes follow the active tab and the 4A/4B visibility (Support radio in Tab 02).
document.querySelectorAll('.sidebar-menu .tab').forEach((t) => t.addEventListener('click', syncSidebarRails));
document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('.radio-row button')) setTimeout(syncSidebarRails, 0); }, true);
// 02 Focus Canvas viewport: Plan / Elevation / Isometric switch (in place, no re-render).
document.getElementById('focus-foundsize').addEventListener('click', (e) => {
  const b = e.target.closest('[data-cad-view]');
  if (b) setCadView(b.dataset.cadView);
});
// Watermark under the sheet: current year.
document.getElementById('app-year').textContent = String(new Date().getFullYear());
// Light / dark toggle in the header; the button icon also follows OS theme changes while no choice is saved.
syncThemeButton();
document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', syncThemeButton);
// Scrolling over a focused number input must not change its value — drop focus first.
document.addEventListener('wheel', () => {
  const el = document.activeElement;
  if (el && el.type === 'number') el.blur();
}, { passive: true });

document.addEventListener('input', scheduleWorkflowLive, true);
document.addEventListener('change', scheduleWorkflowLive, true);
// Radio-row buttons (e.g. V_u source Manual / From piles) change results without an input/change event — refresh the
// Design Status panel after them too (scheduleWorkflowLive is debounced, so it runs after the button's own handler).
document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('.radio-row button')) scheduleWorkflowLive(); }, true);
document.querySelectorAll('.sidebar-menu .tab').forEach((t) => t.addEventListener('click', scheduleWorkflowLive));
try { renderWorkflowLive(); } catch (e) {}

// ---------- Project file: New / Open / Save / Save As (js/workflow/project.js) ----------
// Defaults = the state right after startup; "New" restores them and "Open" starts from them, so nothing from the previous
// project survives a load.
const PROJECT_DEFAULTS = collectProject();
let projectLoading = false;
function renderProjectLists() {
  renderLoadTypesTable(); // also the Load Values rows (lc-<code>-*)
  renderComboTable('lc'); // ASD and LRFD tables
  renderPileTable();
  renderBoltTable();
  renderDesignStandardsTable();
  renderBlockList();
  [['rpt-logo1-preview', state.rptLogo1], ['rpt-logo2-preview', state.rptLogo2]].forEach(([id, src]) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = src ? `<img src="${src}" style="max-height:60px;max-width:100%;border:1px solid var(--line);margin-top:6px;">` : '';
  });
}
// Writes a project into the page and recalculates everything, in startup order.
function loadProjectData(data) {
  projectLoading = true;
  try {
    applyProjectData(PROJECT_DEFAULTS, renderProjectLists);
    applyProjectData(data, renderProjectLists);
    // Replay the radio choices as clicks so each group's own handler runs (field visibility, tab visibility, ...). Equipment
    // type first: its handler may pre-select a foundation type, which the file's own fs-type choice then overrides.
    const radios = data.radios || {};
    Object.keys(radios).sort((a, b) => (b === 'eq-type') - (a === 'eq-type')).forEach((id) => {
      const g = document.getElementById(id);
      const btn = g && [...g.querySelectorAll('button[data-val]')].find((x) => x.dataset.val === radios[id]);
      if (btn && !btn.disabled) btn.click();
    });
    toggleLoadInputMode();
    updateFoundationTabVisibility();
    renderScopePanel();
    renderEquipmentLoad(); renderLiveLoad(); renderWindDirectPreview(); renderSeismicDirectPreview();
    calcFoundSize(); // also recalcAll()
    recalcPileCap();
    calcSettlement();
    recalcAllGeneral();
    renderLcSummary();
    if (typeof renderStdComboTables === 'function') renderStdComboTables();
    renderSummaryReport();
    // A loaded project is not a first-time entry: show the results, not the readiness checklist.
    window.__liveBarVisited = new Set([...document.querySelectorAll('.sidebar-menu .tab')].map((t) => t.dataset.tab));
    syncSidebarRails();
    renderWorkflowLive();
  } finally {
    projectLoading = false;
  }
  setProjectDirty(false);
  updateProjectLabel();
}
function updateProjectLabel() {
  const f = projectFile();
  const el = document.getElementById('project-file-name');
  el.textContent = (f.name || 'Untitled project') + (f.dirty ? ' ●' : '');
  el.classList.toggle('dirty', f.dirty);
  el.title = f.dirty ? 'Unsaved changes' : (f.name ? 'Saved' : 'Not saved yet');
}
const confirmDiscard = () => !projectFile().dirty || window.confirm('Discard the unsaved changes of the current project?');
// Short confirmation under the header (Open / Save / New) — a successful load otherwise only shows in the file name.
let projectToastT = null;
function projectToast(msg, bad) {
  let el = document.getElementById('project-toast');
  if (!el) { el = document.createElement('div'); el.id = 'project-toast'; el.setAttribute('role', 'status'); document.body.append(el); }
  el.textContent = msg;
  el.className = 'project-toast show' + (bad ? ' bad' : '');
  clearTimeout(projectToastT);
  projectToastT = setTimeout(() => { el.className = 'project-toast' + (bad ? ' bad' : ''); }, bad ? 8000 : 4000);
}
async function saveProject(asNew) {
  try { if (await saveProjectFile(asNew)) { updateProjectLabel(); projectToast('✓ Saved: ' + projectFile().name); } }
  catch (e) { console.error('Save project:', e); projectToast('✗ Could not save the project: ' + (e && e.message ? e.message : e), true); }
}
async function openProject() {
  if (!confirmDiscard()) return;
  try {
    const r = await pickProjectFile();
    if (r) {
      loadProjectData(r.data);
      switchWorkflowTab('foundsize'); // show something that visibly comes from the file
      projectToast(`✓ Opened: ${r.name} — ${r.data.project || 'project'} (footing ${document.getElementById('fs-Bf').value} × ${document.getElementById('fs-Lf').value} m)`);
    }
  } catch (e) { console.error('Open project:', e); projectToast('✗ Could not open the project: ' + (e && e.message ? e.message : e), true); }
  updateProjectLabel();
}
document.getElementById('project-new').addEventListener('click', () => {
  if (!confirmDiscard()) return;
  loadProjectData(PROJECT_DEFAULTS);
  resetProjectFile();
  updateProjectLabel();
  projectToast('✓ New project (default values)');
});
document.getElementById('project-open').addEventListener('click', openProject);
document.getElementById('project-save').addEventListener('click', () => saveProject(false));
document.getElementById('project-saveas').addEventListener('click', () => saveProject(true));
document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === 's') { e.preventDefault(); saveProject(e.shiftKey); }
  else if (k === 'o' && !e.shiftKey) { e.preventDefault(); openProject(); }
});
// Unsaved-changes marker: any edit of an input, or a button press inside the input panels / dialogs / Scope of Work.
const markProjectDirty = (e) => {
  if (projectLoading || (e.target && e.target.type === 'file') || projectFile().dirty) return;
  setProjectDirty(true);
  updateProjectLabel();
};
document.addEventListener('input', markProjectDirty, true);
document.addEventListener('change', markProjectDirty, true);
document.addEventListener('click', (e) => {
  const b = e.target.closest && e.target.closest('button');
  if (b && b.closest('.inputs, .ld-inputs, .modal-box, #scope-panel') && !b.closest('.sidebar-rail')) markProjectDirty(e);
}, true);
window.addEventListener('beforeunload', (e) => {
  if (!projectFile().dirty) return;
  e.preventDefault();
  e.returnValue = '';
});
updateProjectLabel();
// Open a project straight from the address bar: ?project=<relative path on this server>.json [&tab=<ribbon tab id>], e.g.
// FAIR%20Foundation%20Design.html?project=projects/my-job.fair.json&tab=foundation. Same-origin relative paths only.
(async () => {
  const q = new URLSearchParams(location.search);
  const path = q.get('project');
  if (!path) return;
  if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(path) || !/\.json$/i.test(path)) { projectToast('✗ ?project= must be a relative path to a .json file on this server', true); return; }
  try {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
    const data = parseProjectText(await res.text());
    loadProjectData(data);
    setProjectFileName(decodeURIComponent(path.split('/').pop()));
    updateProjectLabel();
    const tab = q.get('tab');
    if (tab) switchWorkflowTab(tab);
    projectToast(`✓ Opened: ${decodeURIComponent(path.split('/').pop())} — ${data.project || 'project'}`);
  } catch (e) {
    console.error('Open project from URL:', e);
    projectToast('✗ Could not open the project: ' + (e && e.message ? e.message : e), true);
  }
})();
// For automation / tests: read the current project, or load one (object or JSON text) without the file dialogs.
window.fairProject = {
  collect: collectProject,
  load: (p) => { const data = typeof p === 'string' ? parseProjectText(p) : p; validateProject(data); loadProjectData(data); }
};
