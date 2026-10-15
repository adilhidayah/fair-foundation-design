# Peta Proyek — Master Calculator

Klik nama file untuk membukanya. Ukuran per 25 Sep 2026.

## Struktur folder

```
MASTER CALCULATOR/
├── index.html                         ← halaman utama (markup saja)
├── css/
│   └── app.css                ← semua style
├── js/                        ← tampilan + wiring UI (menyentuh DOM)
│   ├── app.js                 ← entry: event listener + urutan startup
│   ├── core/                  ← helper & state bersama
│   ├── diagrams/              ← gambar SVG
│   ├── tabs/                  ← satu file per tab kalkulasi
│   ├── ocr/                   ← OCR / paste review
│   ├── report/                ← summary + report builder
│   ├── ui/                    ← layout: panel input collapsible, switch Focus Canvas / Report Preview
│   └── workflow/              ← setup equipment, status, recalc, assistant
├── lib/foundation/            ← MESIN HITUNG (pure, tanpa DOM, bisa dites di Node)
│   ├── index.js               ← pintu masuk semua fungsi hitung
│   ├── shared/                ← rumus umum (bearing, stability, pedestal, ...)
│   ├── static/ rotating/ reciprocating/ piperack/ skidMounted/
│   ├── import/                ← parser teks OCR/paste
│   └── validation/            ← test hand-calc (node ...mjs)
├── patch.js                   ← fixer marker SVG (idempotent)
├── tools/
│   ├── staad-stability.mjs    ← CLI: reaksi STAAD → stabilitas + desain footing/pedestal (laporan .md)
│   └── foundation-drawing.mjs ← gambar pondasi (DXF R12 + SVG) dari hasil staad-stability
├── AGENTS.md                  ← aturan kerja AI assistant (harus di root)
└── docs/                      ← catatan proyek: filosofi, instruksi, peta, rencana AI
```

## Mau ubah apa → buka file mana

| Mau ubah… | UI / tampilan (`js/`) | Rumus (`lib/`) |
|---|---|---|
| 00 — Equipment setup | [js/workflow/setup.js](../js/workflow/setup.js) | [lib/foundation/index.js](../lib/foundation/index.js) (dispatcher) |
| 01 — General Input Data | [js/tabs/general.js](../js/tabs/general.js) | — |
| 02 — Foundation Dimension | [js/tabs/foundSize.js](../js/tabs/foundSize.js), diagram [foundSizeDiagram.js](../js/diagrams/foundSizeDiagram.js) | [static/foundationSizing.js](../lib/foundation/static/foundationSizing.js) |
| 03 — Loading Data (load types, live, equipment, wind, seismic) | [js/tabs/loading.js](../js/tabs/loading.js) | [shared/windLoad.js](../lib/foundation/shared/windLoad.js), [shared/seismicLoad.js](../lib/foundation/shared/seismicLoad.js) |
| Load combinations | [js/tabs/combos.js](../js/tabs/combos.js) | [shared/loadCombinations.js](../lib/foundation/shared/loadCombinations.js) |
| 4A — Foundation Stability | [js/tabs/foundation.js](../js/tabs/foundation.js), diagram [foundationDiagram.js](../js/diagrams/foundationDiagram.js) | [shared/stabilityCheck.js](../lib/foundation/shared/stabilityCheck.js) |
| 4B — Pile Stability | [js/tabs/pile.js](../js/tabs/pile.js), diagram [pileDiagram.js](../js/diagrams/pileDiagram.js) | [shared/pileGroup.js](../lib/foundation/shared/pileGroup.js) (spasi/tepi, efisiensi, p-multiplier, biaksial + torsi); `pileComboLoads()` (pile.js) juga dipakai 5B; `evaluatePileCombo` (uniaksial lama) di [shared/stabilityCheck.js](../lib/foundation/shared/stabilityCheck.js) tidak lagi dipakai UI |
| 5A — Pedestal (P-M) | [js/tabs/rebar.js](../js/tabs/rebar.js), diagram [pmDiagram.js](../js/diagrams/pmDiagram.js) | [shared/pedestalCheck.js](../lib/foundation/shared/pedestalCheck.js) |
| 5B — Pile cap / footing shear + flexure | [js/tabs/shear.js](../js/tabs/shear.js), [js/tabs/rebar.js](../js/tabs/rebar.js), [js/tabs/footingSoil.js](../js/tabs/footingSoil.js) | [shared/footingCheck.js](../lib/foundation/shared/footingCheck.js), [shared/pileCapShear.js](../lib/foundation/shared/pileCapShear.js), [shared/footingDesign.js](../lib/foundation/shared/footingDesign.js) |
| 08 — Bearing Capacity | [js/tabs/bearing.js](../js/tabs/bearing.js) | [shared/bearingCapacity.js](../lib/foundation/shared/bearingCapacity.js) |
| 08B — Settlement (footing: elastis + konsolidasi; pile: Vesic) | [js/tabs/settlement.js](../js/tabs/settlement.js) | [shared/settlementCheck.js](../lib/foundation/shared/settlementCheck.js), [shared/pileSettlement.js](../lib/foundation/shared/pileSettlement.js), [shared/soilProperties.js](../lib/foundation/shared/soilProperties.js) |
| 09 — Anchor Bolt | [js/tabs/anchor.js](../js/tabs/anchor.js), diagram [anchorDiagram.js](../js/diagrams/anchorDiagram.js) | [shared/pedestalCheck.js](../lib/foundation/shared/pedestalCheck.js) |
| Summary / laporan cetak | [js/report/summary.js](../js/report/summary.js), [js/report/builder.js](../js/report/builder.js) | — |
| Status workflow / live bar | [js/workflow/status.js](../js/workflow/status.js) | — |
| OCR / paste import | [js/ocr/review.js](../js/ocr/review.js), [js/ocr/tesseract.js](../js/ocr/tesseract.js) | [import/textParsers.js](../lib/foundation/import/textParsers.js) |
| Batch stabilitas dari STAAD (CLI, tanpa UI) | [tools/staad-stability.mjs](../tools/staad-stability.mjs) | [import/staadOutput.js](../lib/foundation/import/staadOutput.js) + [shared/stabilityCheck.js](../lib/foundation/shared/stabilityCheck.js) |
| Tombol, event listener, urutan startup | [js/app.js](../js/app.js) | — |
| Warna, layout, font | [css/app.css](../css/app.css) | — |
| Teks / field di halaman | [index.html](../index.html) | — |

## Semua file

### Halaman & style
| File | Ukuran | Isi |
|---|---:|---|
| [index.html](../index.html) | 92 KB | Markup semua tab (tanpa CSS/JS) |
| [css/app.css](../css/app.css) | 52 KB | Semua style |

### js/ — tampilan & wiring
| File | Ukuran | Isi |
|---|---:|---|
| [js/app.js](../js/app.js) | 50 KB | Entry point: event listener, render awal, `window.*`, popup generator Wind/Seismic |
| [js/README.md](../js/README.md) | 4 KB | Aturan kerja modul js (baca sebelum edit UI) |
| [js/core/format.js](../js/core/format.js) | 0.3 KB | `fmt()` format angka tampilan |
| [js/core/dom.js](../js/core/dom.js) | 1.5 KB | `num()`, radio, modal, `escapeHtml()` |
| [js/core/worksheet.js](../js/core/worksheet.js) | 3 KB | Baris worksheet, kotak PASS/FAIL, badge efisiensi |
| [js/core/state.js](../js/core/state.js) | 5.5 KB | State bersama (`lcLoadTypes`, `comboState`, `pileList`, ...) |
| [js/diagrams/foundationDiagram.js](../js/diagrams/foundationDiagram.js) | 5 KB | Plan + section + tekanan tanah (4A) |
| [js/diagrams/foundSizeDiagram.js](../js/diagrams/foundSizeDiagram.js) | 15 KB | Plan + elevasi dimensi fondasi (02) |
| [js/diagrams/loadTransferDiagram.js](../js/diagrams/loadTransferDiagram.js) | 6 KB | Transfer beban top pedestal → dasar footing |
| [js/diagrams/pileDiagram.js](../js/diagrams/pileDiagram.js) | 2 KB | Gaya aksial tiap tiang |
| [js/diagrams/anchorDiagram.js](../js/diagrams/anchorDiagram.js) | 2 KB | Tarik tiap anchor bolt |
| [js/diagrams/pmDiagram.js](../js/diagrams/pmDiagram.js) | 2 KB | Diagram interaksi P-M |
| [js/diagrams/equipmentDiagram.js](../js/diagrams/equipmentDiagram.js) | 6 KB | Skema elevasi equipment + fondasi (00, tidak berskala) |
| [js/diagrams/foundIsoDiagram.js](../js/diagrams/foundIsoDiagram.js) | 5 KB | Isometrik 2.5D footing / pedestal / tiang (02 Focus Canvas) |
| [js/diagrams/shearFocusDiagram.js](../js/diagrams/shearFocusDiagram.js) | 17 KB | 5B Focus Canvas: geser satu arah + punching — plan / potongan / iso 2.5D (SVG murni) |
| [js/tabs/general.js](../js/tabs/general.js) | 12 KB | 01 — Design standards + ringkasan general |
| [js/tabs/foundSize.js](../js/tabs/foundSize.js) | 13 KB | 02 — `calcFoundSize()` |
| [js/tabs/loading.js](../js/tabs/loading.js) | 26 KB | 03 — Load types/values, live, equipment, wind, seismic, design load summary |
| [js/tabs/combos.js](../js/tabs/combos.js) | 14 KB | Tabel load combination, LC101-126 |
| [js/tabs/foundation.js](../js/tabs/foundation.js) | 18 KB | 4A — `calcFoundation()` |
| [js/tabs/pile.js](../js/tabs/pile.js) | 10 KB | 4B — tabel tiang + `calcPile()` |
| [js/tabs/rebar.js](../js/tabs/rebar.js) | 10 KB | 5A/5B — `calcRebar()` |
| [js/tabs/shear.js](../js/tabs/shear.js) | 10 KB | 5B — `calcOneWay()`, `calcTwoWay()` |
| [js/tabs/footingSoil.js](../js/tabs/footingSoil.js) | 5 KB | 5B shallow — `footingLrfdActions()` (beban LRFD di dasar footing + bidang tekanan tanah per kombinasi), `soilPressureHtml()` |
| [js/tabs/bearing.js](../js/tabs/bearing.js) | 6 KB | 08 — `calcBearing()` |
| [js/tabs/settlement.js](../js/tabs/settlement.js) | 6 KB | 08B — `calcSettlement()` |
| [js/tabs/anchor.js](../js/tabs/anchor.js) | 8 KB | 09 — tabel bolt + `calcAnchor()` |
| [js/ocr/tesseract.js](../js/ocr/tesseract.js) | 1 KB | Loader Tesseract (diunduh saat OCR diklik) |
| [js/ocr/review.js](../js/ocr/review.js) | 9 KB | Tabel review hasil OCR / paste |
| [js/report/summary.js](../js/report/summary.js) | 2 KB | Tab Summary Report |
| [js/report/builder.js](../js/report/builder.js) | 5 KB | Report builder (section, logo, header dokumen) |
| [js/workflow/setup.js](../js/workflow/setup.js) | 11 KB | 00 — Equipment setup (profile card: kategori, code, checks), visibilitas tab |
| [js/workflow/status.js](../js/workflow/status.js) | 17 KB | Status workflow + live design-status bar |
| [js/workflow/recalc.js](../js/workflow/recalc.js) | 2 KB | `recalcAll()` dan gabungan recalc |
| [js/workflow/assistant.js](../js/workflow/assistant.js) | 1 KB | Panel kanan: Design Status / Assistant |
| [js/tabs/loadingFocus.js](../js/tabs/loadingFocus.js) | 5 KB | 03 — tampilan Focus Canvas (envelope ASD, load types, diagram transfer beban, kombinasi) |
| [js/tabs/stabilityFocus.js](../js/tabs/stabilityFocus.js) | 6 KB | 4A / 4B — tampilan Focus Canvas (UC per cek, diagram, tabel UC / DCR per kombinasi) |
| [js/tabs/generalFocus.js](../js/tabs/generalFocus.js) | 3 KB | 01 — tampilan Focus Canvas (material, berat isi, q_a / kapasitas tiang, standar, kriteria geoteknik) |
| [js/tabs/foundSizeFocus.js](../js/tabs/foundSizeFocus.js) | 4 KB | 02 — tampilan Focus Canvas (dimensi utama, diagram, self-weight, geometry check) |
| [js/tabs/shearFocus.js](../js/tabs/shearFocus.js) | 5 KB | 5B — Focus Canvas geser (`#focus-capcheck`): toggle mode/view, badge D/C, tile, tooltip |
| [js/workflow/project.js](../js/workflow/project.js) | 6 KB | File proyek `*.fair.json`: New / Open / Save / Save As |
| [js/workflow/scope.js](../js/workflow/scope.js) | 1 KB | Scope of Work (panel kanan di 00): anchor by vendor / q_a given geotech |
| [js/ui/theme.js](../js/ui/theme.js) | 1 KB | Tombol tema terang / gelap di header |
| [js/ui/sidebar.js](../js/ui/sidebar.js) | 3 KB | Panel input kiri: expanded / compact / collapsed (`localStorage` `fair_fdn_sidebar_state`) |
| [js/ui/viewMode.js](../js/ui/viewMode.js) | 3 KB | Switch Focus Canvas / Report Preview + badge governing status |

### lib/foundation/ — mesin hitung
| File | Ukuran | Isi |
|---|---:|---|
| [lib/foundation/index.js](../lib/foundation/index.js) | 6 KB | Pintu masuk + dispatcher equipment → kategori |
| [shared/bearingCapacity.js](../lib/foundation/shared/bearingCapacity.js) | 4 KB | Terzaghi / Meyerhof |
| [shared/bearingCapacityFactors.json](../lib/foundation/shared/bearingCapacityFactors.json) | 0.3 KB | Tabel faktor Nc/Nq/Nγ |
| [shared/loadCombinations.js](../lib/foundation/shared/loadCombinations.js) | 11 KB | Kombinasi beban, LC101-126 |
| [shared/stabilityCheck.js](../lib/foundation/shared/stabilityCheck.js) | 5 KB | Guling, geser, tekanan tanah, tiang |
| [shared/pileGroup.js](../lib/foundation/shared/pileGroup.js) | 12 KB | Tiang: spasi/tepi, efisiensi grup (Converse–Labarre), p-multiplier lateral, distribusi biaksial |
| [shared/pileCapShear.js](../lib/foundation/shared/pileCapShear.js) | 5 KB | V_u geser satu arah / punching pile cap dari reaksi tiang (interpolasi d_p/2) |
| [shared/pedestalCheck.js](../lib/foundation/shared/pedestalCheck.js) | 7 KB | P-M pedestal, anchor bolt (ACI Ch.17) |
| [shared/footingCheck.js](../lib/foundation/shared/footingCheck.js) | 6 KB | One-way / punching shear, lentur |
| [shared/footingDesign.js](../lib/foundation/shared/footingDesign.js) | 6 KB | Footing dangkal: M<sub>u</sub> / V<sub>u</sub> dari tekanan tanah net (linear tanpa tarik, integrasi eksak) |
| [shared/soilProperties.js](../lib/foundation/shared/soilProperties.js) | 2 KB | Korelasi SPT (Peck/Stroud/Bowles) |
| [shared/settlementCheck.js](../lib/foundation/shared/settlementCheck.js) | 3 KB | Penurunan elastis + konsolidasi |
| [shared/pileSettlement.js](../lib/foundation/shared/pileSettlement.js) | 2 KB | Penurunan tiang tunggal + kelompok (Vesic 1977, Das §11.18): `pileSettlementVesic()` |
| [shared/windLoad.js](../lib/foundation/shared/windLoad.js) | 2 KB | Beban angin |
| [shared/seismicLoad.js](../lib/foundation/shared/seismicLoad.js) | 4 KB | Fa/Fv, S_DS, Cs |
| [static/](../lib/foundation/static/) | 6 KB | Vessel/tank/HE: `loadingData`, `foundationSizing` |
| [rotating/](../lib/foundation/rotating/) | 6 KB | Pompa/kompresor/turbin: vibrasi, mass ratio ≥ 3 |
| [reciprocating/](../lib/foundation/reciprocating/) | 6 KB | Kompresor torak: gaya dinamis 1x/2x, mass ratio ≥ 5 |
| [piperack/](../lib/foundation/piperack/) | 6 KB | Pipe rack: arah L/T, sizing iteratif |
| [skidMounted/](../lib/foundation/skidMounted/) | 3 KB | Skid: reaksi bolt, footprint |
| [import/textParsers.js](../lib/foundation/import/textParsers.js) | 6 KB | Parser teks OCR/paste (tanpa konversi satuan) |
| [import/staadOutput.js](../lib/foundation/import/staadOutput.js) | 6 KB | Parser STAAD: load case / REPEAT LOAD (.std), SUPPORT REACTIONS (.ANL), reaksi → konvensi tanda FAIR |
| [validation/](../lib/foundation/validation/) | — | 7 file test + [VALIDATION_REPORT.md](../lib/foundation/validation/VALIDATION_REPORT.md) |

### Lain-lain
| File | Isi |
|---|---|
| [AGENTS.md](../AGENTS.md) | Aturan untuk AI assistant |
| [PROJECT_INSTRUCTIONS.md](PROJECT_INSTRUCTIONS.md) | Instruksi proyek |
| [AI_ASSISTANT_PLAN.md](AI_ASSISTANT_PLAN.md) | Rencana fitur AI assistant |
| [patch.js](../patch.js) | Fixer marker panah SVG — jalankan `node patch.js` |

## Alur saat halaman dibuka

```
index.html
  └─ css/app.css
  └─ js/app.js  ──import──►  js/core/*  js/diagrams/*  js/tabs/*  js/ocr/*  js/report/*  js/workflow/*
                                   │
                                   └──import──►  lib/foundation/index.js  ──►  shared/ static/ ... import/
```

`js/` boleh import `lib/`, tapi `lib/` **tidak pernah** import `js/` (supaya tetap bisa dites di Node).
