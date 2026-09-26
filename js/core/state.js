import { defaultCombos, DEFAULT_KIND_BY_CODE } from '../../lib/foundation/index.js?v=20260926n';

// Shared UI state. Objects/arrays that are only ever mutated (never reassigned) are exported directly;
// values that get reassigned live on `state` (ES module imports are read-only bindings), so every module
// reads and writes the same `state.x`.

// Populated by each calc*() function with its latest governing result, for the Summary Report tab.
export const lastResults = {};
// ---------- Design Standards register (editable — feeds the "1.1 Design Standards" table in the preview) ----------
export const designStandards = [
  { docNo: 'ACI 318-19', title: 'Building Code Requirements for Structural Concrete and Commentary' },
  { docNo: 'ASCE 7-22', title: 'Minimum Design Loads for Buildings and Other Structures' }
];
// defaultCombos() is imported from lib/foundation/shared/loadCombinations.js.
// lc = ASD combinations (stability, pile capacity, anchor bolts, ...); lrfd = separate factored set for the pile cap
// flexure / shear checks (5B) — see loadLrfdCombos().
export const comboState = { lc: defaultCombos(), lrfd: [] };
// ---------- Pile layout table ----------
export const pileList = [
  { x: -0.6, y: -0.6 }, { x: 0.6, y: -0.6 }, { x: -0.6, y: 0.6 }, { x: 0.6, y: 0.6 }
];
// ---------- Anchor bolt layout ----------
export const boltList = [
  { x: -150, y: -150 }, { x: 150, y: -150 }, { x: -150, y: 150 }, { x: 150, y: 150 }
];
// ---------- Report builder sections ----------
export const reportBlocks = [
  { id: 'general', title: '01 — General Input Data', include: true, pageBreak: false },
  { id: 'foundsize', title: '02 — Foundation Dimension', include: true, pageBreak: false },
  { id: 'loadcomb', title: '03 — Load Combinations (computed)', include: true, pageBreak: false },
  { id: 'foundation', title: '4A — Foundation Stability', include: true, pageBreak: true },
  { id: 'pile', title: '4B — Pile Foundation Stability', include: true, pageBreak: true },
  { id: 'rebar', title: '5A — Pedestal Check: Reinforcement (P-M)', include: true, pageBreak: true },
  { id: 'oneway', title: '5B — Pile Cap Check: One-Way Shear', include: true, pageBreak: true },
  { id: 'twoway', title: '5B — Pile Cap Check: Punching Shear', include: true, pageBreak: false },
  { id: 'rebarcap', title: '5B — Pile Cap Check: Flexure', include: true, pageBreak: false },
  { id: 'bearing', title: '08 — Bearing Capacity (Soil)', include: true, pageBreak: false },
  { id: 'settlement', title: '08B — Settlement (Soil)', include: true, pageBreak: false },
  { id: 'anchor', title: '09 — Anchor Bolt Design', include: true, pageBreak: true }
];

export const state = {
  // Holds independent Fx/Mz (transversal) and Fz/Mx (longitudinal) Wind values — set by manual "Apply" (asymmetric,
  // whatever was actually typed into the Fx/Fz dialog) or by the ASCE 7-16 generator (from Asx/Asz). Read by
  // renderLoadSummary() for the WX/WZ rows. Declared here (not next to where it's set, further down) because
  // renderEquipmentLoad() calls renderLoadSummary() once at page load, before the script reaches those sections.
  windDirState: null,
  // Same idea for Seismic — always populated (never null) so the Design Load Summary has one source to read, no
  // separate symmetric-fallback path.
  seismicDirState: { empFx: 0, empMz: 0, empFz: 0, empMx: 0, opeFx: 0, opeMz: 0, opeFz: 0, opeMx: 0 },
  // The set of load types is editable — "+ Add load type" in "03 — LOADING DATA" appends a new { code, label }
  // entry here, which drives the Load Components rows AND the Load Combinations columns. Default set matches the
  // "A.3.2 Loading Combination" standard vessel/equipment combination set (LC101-126, see loadStandardVesselCombos()
  // below): Dead/Live/Roof-Live, Equipment Empty/Operating/Test, Wind split transversal/longitudinal (WX/WZ), and
  // Seismic split by condition and direction (EQX(E)/EQZ(E) empty, EQX(O)/EQZ(O) operating) — so the editable "Load Combinations"
  // table and the "A.3.2" report read the same columns, fed from the same "03 — LOADING DATA" inputs. Everything
  // else from Table 6-1 (Pipe, Handling, Vibration, Thermal, Soil/Liquid Pressure, Tube Bundle, Vehicle, Current,
  // Berthing, Mooring, ...) is added only when actually needed, via "+ Add load type", the OCR/table import, or
  // ensureLoadType() the first time a generator button needs it (see pr-/vsl-/tnk-generate-combos, which use the
  // older generic W/E/T codes and re-add them on demand) — so the table starts minimal instead of pre-populated
  // with unused columns.
  lcLoadTypes: [
    { code: 'D', label: 'Dead Load, D' },
    { code: 'L', label: 'Live Load, L' },
    { code: 'Lr', label: 'Roof Live Load, Lr' },
    { code: 'E(E)', label: 'Equipment Empty Load, E(E)' },
    { code: 'E(O)', label: 'Equipment Operating Load, E(O)' },
    { code: 'E(T)', label: 'Equipment Test Load, E(T)' },
    { code: 'WX', label: 'Wind Load, WX' },
    { code: 'WZ', label: 'Wind Load, WZ' },
    { code: 'EQX(E)', label: 'Seismic Load, Empty, EQX(E)' },
    { code: 'EQZ(E)', label: 'Seismic Load, Empty, EQZ(E)' },
    { code: 'EQX(O)', label: 'Seismic Load, Operating, EQX(O)' },
    { code: 'EQZ(O)', label: 'Seismic Load, Operating, EQZ(O)' }
  ].map(lt => ({ ...lt, kind: DEFAULT_KIND_BY_CODE[lt.code] })), // kind = what the load IS (lib LOAD_KINDS)
  // Registered load types with no kind (left out of combos, warned in 3.3 / stability) — set by buildStdComboBase().
  lastUntypedLoadTypes: [],
  // Pedestal of Tab 02 for the 5A pedestal design: height Hp (m, incl. grout — the lever arm of H down to the pedestal
  // base) and self-weight pedW (kN, concrete + grout). Both 0 when Tab 02 has no pedestal. Set by calcFoundSize().
  pedHp: 0, pedW: 0,
  // Report header logos (data URLs from the logo uploads).
  rptLogo1: null, rptLogo2: null
};
