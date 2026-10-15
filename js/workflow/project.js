// Project file (*.fair.json): New / Open / Save / Save As. Declarations only — wiring (buttons, shortcuts, the recalculation
// after a load) lives in app.js.
//
// A project file is plain JSON, readable and writable outside the app:
//   { format: 'fair-foundation-project', version: 1, app, savedAt, project,
//     inputs: { <element id>: value | checked },        every input / select / textarea with an id (not file inputs, not the
//                                                        table rows rebuilt from `lists`, not the lcx-* mirrors of lc-*)
//     radios: { <group id>: <data-val of the selected button> },
//     lists:  { designStandards, pileList, boltList, reportBlocks, combosLc, combosLrfd },
//     state:  { lcLoadTypes, windDirState, seismicDirState, rptLogo1, rptLogo2 } }
// Values are stored as the inputs hold them (SI units, the same as the input labels); nothing is computed or converted here.
import { boltList, comboState, designStandards, loadPointList, pileList, reportBlocks, state } from '../core/state.js?v=20261015g';

export const PROJECT_FORMAT = 'fair-foundation-project';
export const PROJECT_VERSION = 1;
export const PROJECT_EXT = '.fair.json';
const STATE_KEYS = ['lcLoadTypes', 'windDirState', 'seismicDirState', 'rptLogo1', 'rptLogo2'];
const LIST_KEYS = ['designStandards', 'pileList', 'loadPointList', 'boltList', 'reportBlocks'];
const LISTS = { designStandards, pileList, loadPointList, boltList, reportBlocks };
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

// Inputs that are NOT stored by id: file pickers, buttons, and rows rebuilt from `lists` / load types (their values are in the
// lists), plus the lcx-* Load Case boxes that only mirror the lc-* Load Values inputs.
function skipInput(el) {
  return !el.id || ['file', 'button', 'submit', 'reset'].includes(el.type) || el.id.startsWith('lcx-') ||
    ['pile-input', 'bolt-input', 'combo-input', 'row-edit-input'].some((c) => el.classList.contains(c));
}
// Radio-style button groups (selectRadio / getRadioVal): the nearest ancestor with an id of each button[data-val].
function radioGroups() {
  const groups = new Map();
  document.querySelectorAll('button[data-val]').forEach((b) => {
    const g = b.parentElement && b.parentElement.closest('[id]');
    if (g && !groups.has(g.id) && g.querySelector('button.sel')) groups.set(g.id, g);
  });
  return groups;
}

// Snapshot of the whole project as a plain object.
export function collectProject() {
  const inputs = {};
  document.querySelectorAll('input, select, textarea').forEach((el) => {
    if (skipInput(el)) return;
    inputs[el.id] = (el.type === 'checkbox' || el.type === 'radio') ? el.checked : el.value;
  });
  const radios = {};
  radioGroups().forEach((g, id) => { radios[id] = g.querySelector('button.sel').dataset.val; });
  const lists = { combosLc: clone(comboState.lc), combosLrfd: clone(comboState.lrfd) };
  LIST_KEYS.forEach((k) => { lists[k] = clone(LISTS[k]); });
  const st = {};
  STATE_KEYS.forEach((k) => { st[k] = clone(state[k]); });
  return {
    format: PROJECT_FORMAT, version: PROJECT_VERSION, app: 'FAIR Foundation Design', savedAt: new Date().toISOString(),
    project: ((document.getElementById('gen-proj') || {}).value || '').trim(),
    inputs, radios, lists, state: st
  };
}

// Throws a readable error when `p` is not a FAIR project this version can read.
export function validateProject(p) {
  if (!p || typeof p !== 'object' || p.format !== PROJECT_FORMAT) throw new Error('Not a FAIR Foundation Design project file.');
  if (!(p.version >= 1) || p.version > PROJECT_VERSION) throw new Error(`Project file version ${p.version} is not supported by this version of the app (reads up to ${PROJECT_VERSION}).`);
  if (!p.inputs || typeof p.inputs !== 'object') throw new Error('Project file has no inputs.');
}

// Writes `p` into the shared state and the DOM — no recalculation (the caller runs it). renderLists() rebuilds the tables that
// come from the lists (load types / values, combinations, piles, bolts, standards, report blocks) before the inputs are set, so
// the per-load-type Load Values inputs (lc-<code>-P/H/M/Hz/Mx) exist when their values are written.
export function applyProjectData(p, renderLists) {
  const L = p.lists || {};
  LIST_KEYS.forEach((k) => { if (Array.isArray(L[k])) LISTS[k].splice(0, LISTS[k].length, ...clone(L[k])); });
  if (Array.isArray(L.combosLc)) comboState.lc = clone(L.combosLc);
  if (Array.isArray(L.combosLrfd)) comboState.lrfd = clone(L.combosLrfd);
  const S = p.state || {};
  STATE_KEYS.forEach((k) => { if (k in S) state[k] = clone(S[k]); });
  window.__ltEditingCode = null; window.__stdEditingIndex = null;
  renderLists();
  Object.entries(p.inputs || {}).forEach(([id, v]) => {
    const el = document.getElementById(id);
    if (!el || skipInput(el) || !('value' in el)) return;
    if (el.type === 'checkbox' || el.type === 'radio') el.checked = !!v;
    else el.value = v === null || v === undefined ? '' : String(v);
  });
  Object.entries(p.radios || {}).forEach(([id, val]) => {
    const g = document.getElementById(id);
    const b = g && [...g.querySelectorAll('button[data-val]')].find((x) => x.dataset.val === val);
    if (!b) return;
    g.querySelectorAll('button').forEach((x) => x.classList.remove('sel'));
    b.classList.add('sel');
  });
}

// ---------- file handling (File System Access API in Chrome / Edge; download / file input elsewhere) ----------
let fileHandle = null;
let fileName = null;
let dirty = false;
export const projectFile = () => ({ name: fileName, dirty, canOverwrite: !!fileHandle });
export function setProjectDirty(v) { dirty = !!v; }
export function resetProjectFile() { fileHandle = null; fileName = null; dirty = false; }
// A project loaded without a file handle (from a URL): remember its name for the label; Save then asks where to save.
export function setProjectFileName(name) { fileHandle = null; fileName = name || null; dirty = false; }

const safeName = (s) => (s || 'Untitled project').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'Untitled project';
const FILE_TYPES = [{ description: 'FAIR Foundation Design project', accept: { 'application/json': ['.json'] } }];
// Same picker id for Open and Save: the browser remembers the last folder used for FAIR projects (first time: Documents).
const PICKER = { id: 'fair-projects', startIn: 'documents' };

// Save (asNew = false: write to the file it was opened from / last saved to, if the browser allows) or Save As.
// Returns false when the user cancels the dialog.
export async function saveProjectFile(asNew) {
  const data = collectProject();
  const text = JSON.stringify(data, null, 2);
  const suggested = fileName || safeName(data.project) + PROJECT_EXT;
  if (window.showSaveFilePicker) {
    try {
      if (asNew || !fileHandle) fileHandle = await window.showSaveFilePicker({ ...PICKER, suggestedName: suggested, types: FILE_TYPES });
      const w = await fileHandle.createWritable();
      await w.write(text);
      await w.close();
      fileName = fileHandle.name;
    } catch (e) {
      if (e && e.name === 'AbortError') return false;
      throw e;
    }
  } else {
    // No file-system access: download a copy (the browser decides the folder / asks, depending on its settings).
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = suggested;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    fileName = suggested;
  }
  dirty = false;
  return true;
}

// Lets the user pick a project file; resolves { data, name } (parsed and validated) or null when cancelled.
export async function pickProjectFile() {
  let file = null, handle = null;
  if (window.showOpenFilePicker) {
    try {
      [handle] = await window.showOpenFilePicker({ ...PICKER, types: FILE_TYPES, multiple: false });
      file = await handle.getFile();
    } catch (e) {
      if (e && e.name === 'AbortError') return null;
      throw e;
    }
  } else {
    file = await new Promise((resolve) => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = '.json,application/json';
      inp.addEventListener('change', () => resolve(inp.files[0] || null));
      inp.click();
    });
    if (!file) return null;
  }
  const data = parseProjectText(await file.text());
  fileHandle = handle; fileName = file.name; dirty = false;
  return { data, name: file.name };
}
export function parseProjectText(text) {
  let data;
  try { data = JSON.parse(text); } catch (e) { throw new Error('The file is not valid JSON.'); }
  validateProject(data);
  return data;
}
