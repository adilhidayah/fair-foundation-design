# js/ — UI modules

`FAIR Foundation Design.html` loads one entry script, `js/app.js`, which imports everything else.

**Split rule:** `lib/` = calculate + extract (pure, Node-testable). `js/` = display + wiring (touches the DOM).
Calculation formulas never live in `js/` — modules here read inputs, call `lib/`, and render.

## Layout

| Folder / file | Contents |
|---|---|
| `app.js` | Entry point. **Only executable top-level code**: event wiring (`addEventListener`), startup renders, `window.*` exports for inline `onclick=`, the Wind/Seismic generator popup handlers. Kept in the original execution order. |
| `core/format.js` | `fmt` (display number formatting) |
| `core/dom.js` | `num`, `selectRadio`, `getRadioVal`, `escapeHtml`, `openModal`/`closeModal`, `wireDecimalAutoFormat` |
| `core/worksheet.js` | `comboLabel`, `dlWorksheetItem`, `dlWorksheetTotal` (unused), `verdictHTML`, `efficiencyBadge` |
| `core/state.js` | Shared state — see below |
| `diagrams/*.js` | Pure SVG builders: foundation, foundSize (maintained by `patch.js`), loadTransfer, pile, anchor, pm |
| `tabs/general.js` | 01 — design standards register, general summary |
| `tabs/foundSize.js` | 02 — `calcFoundSize` |
| `tabs/loading.js` | 03 — load types / values, live, equipment, wind & seismic direct entry, design load summary |
| `tabs/combos.js` | load combination tables, computed summary, standard LC101-126 set |
| `tabs/foundation.js` | 4A — `calcFoundation` |
| `tabs/pile.js` | 4B — pile table, `calcPile` |
| `tabs/rebar.js` | 5A/5B — `calcRebar` |
| `tabs/shear.js` | 5B — `calcOneWay`, `calcTwoWay` |
| `tabs/bearing.js`, `tabs/settlement.js` | 08 / 08B |
| `tabs/anchor.js` | 09 — bolt table, `calcAnchor` |
| `ocr/tesseract.js` | lazy Tesseract.js loader |
| `ocr/review.js` | OCR / paste review tables (parsers are in `lib/foundation/import/textParsers.js`) |
| `report/summary.js`, `report/builder.js` | Summary tab; printable report builder |
| `workflow/recalc.js` | `recalcAll`, `calcFoundationAndGeneral`, `calcBearingAndFoundation` |
| `workflow/setup.js` | 00 — equipment setup, foundation-tab visibility, load input mode |
| `workflow/status.js` | workflow step status, live design-status bar |
| `workflow/assistant.js` | right-panel assistant drawer |

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
