# js/ — UI modules

`index.html` loads one entry script, `js/app.js`, which imports everything else.

**Split rule:** `lib/` = calculate + extract (pure, Node-testable). `js/` = display + wiring (touches the DOM).
Calculation formulas never live in `js/` — modules here read inputs, call `lib/`, and render.

## Layout

| Folder / file | Contents |
|---|---|
| `app.js` | Entry point. **Only executable top-level code**: event wiring (`addEventListener`), startup renders, `window.*` exports for inline `onclick=`, the Wind/Seismic generator popup handlers. Kept in the original execution order. |
| `core/format.js` | `fmt` (display number formatting) |
| `tabs/loadPoints.js` | `loadPointsActive`, `loadPointsPedestals` (a pedestal under every point: 5A and 09 are done per pedestal), `activeLoadPoints`, `renderLoadPointTable` — Tab 02 list of load points (several equipment on one pile cap, `state.loadPointList`); consumed by `pileComboLoads()` (4B / 5B) and the 5B shear / flexure |
| `core/lazyPanels.js` | `installLazyPanels`, `setActiveTab` — heavy result panels (`#calc-*`, `#focus-*`, Tab 03 summaries) keep a write as a string until their tab is open; `.innerHTML` reads still return the latest HTML (perf with 100+ combinations); long tables (> 40 rows) show their first rows + a "Show all N rows" button on screen (reports and print stay full) |
| `core/dom.js` | `num`, `selectRadio`, `getRadioVal`, `escapeHtml`, `openModal`/`closeModal`, `wireDecimalAutoFormat` |
| `core/worksheet.js` | `comboLabel`, `dlWorksheetItem`, `dlWorksheetTotal` (unused), `verdictHTML`, `efficiencyBadge` |
| `core/state.js` | Shared state — see below |
| `diagrams/*.js` | Pure SVG builders: foundation, foundSize (maintained by `patch.js`), loadTransfer, pile, anchor, pm, equipment (00 schematic), foundIso (02 isometric 2.5D) |
| `tabs/general.js` | 01 — design standards register, general summary |
| `tabs/generalFocus.js` | 01 — Focus Canvas view (`#focus-general`): material / unit-weight / q_a tiles, standards list, geotechnical criteria; replaces the A4 sheet only in Focus Canvas mode |
| `tabs/foundSize.js` | 02 — `calcFoundSize` |
| `tabs/shearFocus.js` | 5B — Focus Canvas of the shear checks (`#focus-capcheck`): two stacked canvases, 6.1 one-way and 6.2 punching, each with its own Plan / Elevation / Isometric 2.5D switcher (`state.shViewOw` / `state.shViewTw`), D/C badge and tiles, hover popover on `[data-tip]`; draws `lastResults.oneway.viz` / `.twoway.viz` (set in shear.js) with `diagrams/shearFocusDiagram.js` |
| `tabs/platformCapFocus.js` | 5B.2 — Focus Canvas section of the platform pile cap (appended below 6.1 / 6.2 in `#focus-capcheck` by shearFocus.js): D/C badge, tiles, cap plan (piles, vessel rings, platform columns), moment curves and a ratio bar per check; draws `lastResults.platformCapViz` (set in platformCap.js) |
| `tabs/foundSizeFocus.js` | 02 — Focus Canvas view (`#focus-foundsize`): tiles, CAD viewport (Plan / Elevation = crops of the report diagram, Isometric 2.5D; view in `state.fzView`), self-weight, geometry checks; replaces the A4 sheet only in Focus Canvas mode |
| `tabs/loading.js` | 03 — load types / values, live, equipment, wind & seismic direct entry, design load summary |
| `tabs/staadImport.js` | 03 — "Import STAAD (.std + .ANL)" (`#sti-group`, Support Reaction mode): `readStaadImportFile`, `applyStaadImport` — calls `staadReactionCombos` (lib), writes the unit load types FY/FX/FZ/MX/MZ + D + TMP into `state.lcLoadTypes` and the ASD / LRFD lists into `comboState`, sets the STAAD sign mode |
| `tabs/combos.js` | load combination tables, computed summary, standard LC101-126 set |
| `tabs/loadingFocus.js` | 03 — Focus Canvas view (`#focus-loading`, filled by `renderLcSummary()`): ASD envelope tiles, load types, load-transfer diagram, combinations at the bottom of the footing; replaces `.ld-page` in Focus Canvas mode unless an OCR / paste review is open |
| `tabs/foundation.js` | 4A — `calcFoundation` |
| `tabs/pile.js` | 4B — pile table, `calcPile` |
| `tabs/stabilityFocus.js` | 4A / 4B — Focus Canvas views (`#focus-foundation`, `#focus-pile`): check tiles with governing UC, diagram, UC / DCR table per combination; replace the A4 sheet only in Focus Canvas mode |
| `tabs/rebar.js` | 5A/5B — `calcRebar` |
| `tabs/pedestalFocus.js`, `diagrams/pedestalFocusDiagram.js` | 5A — Section 02-style viewport: cross-section / elevation / isometric / P–M. Reads `lastResults.pedestalRebar.viz`, selects LRFD points (`state.pedestalFocusLC`) and retains `state.pedestalFocusView`. The same two-face layout and factored curve as Report Preview; no inferred ties, end anchorage or biaxial design |
| `tabs/shear.js` | 5B — `calcOneWay`, `calcTwoWay` |
| `tabs/bearing.js`, `tabs/settlement.js` | 08 / 08B |
| `tabs/settlementFocus.js`, `diagrams/settlementDiagram.js` | 08B — display-only settlement Focus Canvas and static report SVGs: before / after / overlay, existing components and allowable checks; single-pile components remain separate from group settlement |
| `tabs/anchor.js` | 09 — bolt table, `calcAnchor`; method (radio `ab-method`): single anchor (`computeAnchorCapacity`) or ACI 17 group of 4 anchors (`anchorGroupCheck`, = CLI) with anchor reinforcement `ab-reinf` none / pedestal bars (layout from `lastResults.pedestalRebar.layout`) / hairpins (`ab-hp-*`), shear reinforcement `ab-vreinf` none / ties in the top 125 mm (`ab-tie-*`, Case 1 / 2, diamond) / hairpins; `syncAnchorInputs` shows the fields |
| `tabs/anchorFocus.js`, `diagrams/anchorFocusDiagram.js` | 09 — display-only Focus Canvas from `lastResults.anchor.viz`: governing pedestal envelope, LRFD combination selector (`state.anchorFocusLC`), anchor-tension plan/table and library UC bars; undefined check ratios show ERROR; Report Preview retains the governing calculation |
| `tabs/anchorViewport.js`, `diagrams/anchorGeometryDiagram.js` | 09 — Section 02-style CAD viewport: Plan / Elevation / Isometric 2.5D / Failure Modes, with an inspector beside one large drawing. `state.anchorFocusView` persists across recalculation. Elevation / iso show the embedment zone only, not an inferred pedestal height or base plate |
| `tabs/anchorModes.js`, `diagrams/anchorFailureDiagram.js` | 09 — one selected failure mechanism (`state.anchorFailureMode`) in the CAD viewport, with ACI clause, demand / design capacity (kN), UC and explicit NOT CHECKED / NOT REQUIRED / REPLACED / UNDEFINED states. Values come from library `modeDetails`; sketches are not scaled failure surfaces or construction details |
| `ocr/tesseract.js` | lazy Tesseract.js loader |
| `ocr/review.js` | OCR / paste review tables (parsers are in `lib/foundation/import/textParsers.js`) |
| `report/exportHtml.js` | "Export report (HTML)" on the Summary tab: the Summary panel + `css/report.css` as one standalone file (same document builder as the CLI, `lib/foundation/report/reportDocument.js`), SVG styles written inline, Print / Save as PDF button inside |
| `report/summary.js`, `report/builder.js` | Summary tab; printable report builder |
| `workflow/recalc.js` | `recalcAll`, `calcFoundationAndGeneral`, `calcBearingAndFoundation` |
| `workflow/setup.js` | 00 — equipment setup, foundation-tab visibility, load input mode |
| `workflow/status.js` | workflow step status, live design-status bar |
| `workflow/assistant.js` | right-panel assistant drawer |
| `workflow/project.js` | project file `*.fair.json` — `collectProject()` / `applyProjectData()` (every input / select / textarea by id, radio groups, load types, combinations, piles, bolts, standards, report blocks, wind / seismic, logos), Save / Save As (File System Access API, download fallback), Open; wired in `app.js` (header buttons, Ctrl+S / Ctrl+Shift+S / Ctrl+O, unsaved marker, `window.fairProject.collect()` / `.load()`) |
| `workflow/scope.js` | Scope of Work (right panel on 00): `inScope('anchor'|'bearing')` — out of scope = status `NA`, left out of the governing UC; bearing out of scope = q_a given (`bc-qa-given`), read via `allowableBearing()` in `tabs/bearing.js` |
| `ui/theme.js` | light / dark toggle in the header (`localStorage` `fair_fdn_theme`; applied before paint by an inline script in `<head>`) |
| `ui/sidebar.js` | collapsible input column — `.layout-wrapper[data-sidebar]` expanded / compact / collapsed, saved in `localStorage` (`fair_fdn_sidebar_state`); sticky Previous / Next section bar at the bottom of the main preview panel (ribbon order, hidden tabs skipped); right status panel hide / show (`.layout-wrapper[data-rpanel]`, `localStorage` `fair_fdn_rightpanel_state`) |
| `ui/viewMode.js` | Focus Canvas / Report Preview switch on every `.results` / `.ld-results` (`data-view`), governing status badge (values from `getGoverningStatus()` in `workflow/status.js`, never recomputed) |

## Rules when editing
- **Modules contain declarations only** (functions, pure consts). Anything that runs at load — `addEventListener`,
  an initial `render*()` call — goes in `app.js`, so startup order stays in one place.
- **Shared state** (`core/state.js`): arrays/objects that are only mutated are exported directly (`lastResults`,
  `comboState`, `designStandards`, `pileList`, `boltList`, `reportBlocks`). Values that get reassigned live on
  `state` (`state.lcLoadTypes`, `state.windDirState`, `state.seismicDirState`,
  `state.lastUntypedLoadTypes`, `state.rptLogo1/2`) — always write `state.x = ...`.
- **Imports** between modules are circular in places (e.g. `tabs/*` ↔ `workflow/recalc.js`). That is safe because
  modules only declare functions; never call an imported function at a module's top level.
- **Cache-busting**: every import carries `?v=`. When a file changes, bump the `?v=` in every import of that file
  (and `js/app.js?v=` in the HTML), otherwise browsers may keep the old copy.
- Inline `onclick="switchWorkflowTab(...)"` in the HTML needs the `window.switchWorkflowTab = ...` line in `app.js`.

## Verifying a refactor
Besides `validation_*.mjs` and `node patch.js`, the split was checked with a headless-Edge (CDP) run that edits
every number input, clicks every button (plus add/rename/remove load type), snapshots DOM + input values after each
action, and diffs the log against the pre-split page: identical, 949/949 steps. Not covered by that run: OCR with a
real image and logo file upload — check those by hand.
