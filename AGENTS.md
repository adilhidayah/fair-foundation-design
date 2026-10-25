# AGENTS.md — FAIR Foundation Design (Foundation Calculator Web App)

> Instruksi universal untuk AI coding assistant (Cline, Copilot, Claude, Cursor, VS Code).
> Workspace: `e:\MASTER CALCULATOR`. Bahasa user: Indonesia. Bahasa kode/komentar: English.
> Sebelum coding: baca file ini + `docs/PROJECT_INSTRUCTIONS.md` + `lib/foundation/index.js`.
> Bila menyentuh UI: baca juga `js/README.md`. Mencari file: `docs/PROJECT_MAP.md`. Nama & filosofi: `docs/PHILOSOPHY.md`.

## 1. Apa Ini
- Web app **FAIR Foundation Design** — kalkulator fondasi. Modul pertama: equipment oil & gas (vessel, tank, heat exchanger, pompa, kompresor, turbin, pipe rack, skid-mounted package unit). Modul fondasi gedung direncanakan, belum ada.
- Tulis nama sebagai **FAIR** Foundation Design, bukan "FAIR Foundation AI" (AI hanya untuk input data).
- User: civil structure engineer. Output untuk submit ke client/checker — keselamatan struktur, jangan asal ubah rumus.
- Acuan standar: **ACI 318M-19 / ASCE 7-22** untuk UI, library, dan laporan. Komentar lama bertulis "ASCE 7-16" = legacy, samakan ke ASCE 7-22 saat menyentuh file itu.

## 2. Tech Stack (jangan tambah baru tanpa izin)
- **UI**: `index.html` (markup) + `css/app.css` (style) + `js/` (ES modules, entry `js/app.js`). Tanpa bundler, tanpa package.json, tanpa framework.
  - Aturan modul UI (modul hanya deklarasi, wiring di `app.js`, state lewat `state.x`): lihat `js/README.md`.
  - Import antar modul js pakai `?v=` — naikkan di semua import file yang berubah, plus `js/app.js?v=` di HTML.
- **Library hitung**: `lib/foundation/**/*.js` — ES Modules murni, pure functions, tanpa DOM.
- **OCR**: `tesseract.js@5` via CDN untuk Smart Fill, di-load lewat `loadTesseract()` (`js/ocr/tesseract.js`) hanya saat tombol OCR diklik. Font: Google IBM Plex.
- **Validasi**: Node.js 22+ (butuh JSON import attribute `with { type: 'json' }`).
- **Menjalankan**: buka HTML lewat dev server (`npx serve .` atau Live Server), JANGAN `file://`, agar import jalan.
- **`patch.js`** (Node, idempotent): fixer marker SVG `fsize-arrow` / `fdn-arrow` di `js/diagrams/foundationDiagram.js` + `foundSizeDiagram.js`.

## 3. Peta File
Peta lengkap semua file: `docs/PROJECT_MAP.md`. Ringkasan:
- UI: `index.html` (markup), `css/app.css` (style), `js/app.js` (event wiring + startup).
- Fungsi `calc*()` ada di `js/tabs/`: `bearing.js` (`calcBearing`), `foundation.js` (`calcFoundation`), `pile.js` (`calcPile`), `settlement.js` (`calcSettlement`; mode Pile → settlement kelompok tiang Vesic via `pileSettlementVesic`), `anchor.js` (`calcAnchor`), `rebar.js` (`calcRebar`), `foundSize.js` (`calcFoundSize`), `shear.js` (`calcOneWay`, `calcTwoWay`; V_u source manual / piles / soil), `footingSoil.js` (shallow: aksi LRFD + tekanan tanah per kombinasi; lentur / geser footing memakai `lib/foundation/shared/footingDesign.js`), `loadPoints.js` (daftar titik beban Tab 02, `activeLoadPoints()`; pile cap dan footing dangkal, dengan atau tanpa pedestal per titik), `autoSize.js` (`autoSizeFoundation`: tombol Auto-Size, shallow saja; opsi "Keep B × L × H" = ukuran footing dikunci, hanya Df dicari (`autoSizeDepth`); pencarian ada di `lib/foundation/shared/autoSizeFooting.js`). `lastResults` di `js/core/state.js`.
- `lib/foundation/index.js` — ENTRY POINT + dispatcher. Import dari sini, jangan deep-import dari UI.
- `lib/foundation/shared/` — `anchorGroup` (grup anchor ACI 17 + tulangan pengangkuran: tulangan pedestal (tarik) atau hairpin (tarik + geser), geser juga tie 125 mm teratas (`shearReinf` ties, SP-17M Example 18) + diamond ties; side-face blowout dengan faktor sudut §17.6.4.1.1; dipakai CLI dan Tab 09 mode "ACI 17 group"), `bearingCapacity`, `loadCombinations`, `stabilityCheck`, `pedestalCheck`, `pileGroup`, `pileCapShear`, `pilePunching` (punching tiang menembus pile cap, ACI §22.6; masuk ke status Two-Way Shear), `loadPoints` (beberapa titik beban pada satu pile cap: beban grup ekuivalen + netting beban titik di balik penampang; footing dangkal: `footingPointLoads` → resultan grup + beban titik, section check di `footingDesign` (`footingFlexurePoints`, `footingOneWayShearPoints`, `footingPunchingPoint`)), `pileCapBeam` (`capBeamAnalysis`: moment / shear diagram of the cap between the pile lines by statics, balance couple on the equipment rings; `crackSpacingCheck`, ACI 24.3.2), `pileCapPlatform` (`pileCapPlatformCombo`: face moments, beam moments along x and z, one-way shear x and z of one combination for vessels + platform columns on a pile cap; the caller loops over the combinations and takes the envelope), `pileSettlement` (Vesic / Das §11.18, tiang tunggal + kelompok), `footingCheck`, `footingDesign`, `spreadFooting` (referensi independen / cross-check `footingDesign`), `autoSizeFooting`, `soilProperties`, `settlementCheck`, `windLoad`, `seismicLoad`.
- `lib/foundation/static/` — vessel/tank/heat-exchanger: `loadingData`, `foundationSizing`.
- `lib/foundation/rotating/` — `loadingData`, `vibrationCheck`, `foundationSizing` (mass ratio >= 3).
- `lib/foundation/reciprocating/` — `loadingData`, `dynamicForceCheck` (1x + 2x rpm), `foundationSizing` (mass ratio >= 5).
- `lib/foundation/piperack/` — `loadingData` (L-dir/T-dir), `loadCombinations` (envelope max |Mbot|), `foundationSizing` (iteratif `sizePierFooting`).
- `lib/foundation/skidMounted/` — `loadingData` (`sumBoltReactions`; `skidSupportLoads`: reaksi vendor per tumpuan → E(E)/E(O)/E(T) + load points Tab 02, share = reaksi operating; UI tabel tumpuan di Tab 03 `js/tabs/skidSupports.js`, tampil untuk Skid Package Unit), `foundationSizing` (footprint + 2x edge).
- `lib/foundation/import/` — `textParsers` (OCR/paste teks → kandidat untuk direview user; tanpa konversi satuan), `staadOutput` (STAAD .std load case/REPEAT LOAD + .ANL support reactions → konvensi tanda FAIR), `staadImport` (`staadReactionCombos`: .std + .ANL satu node → load type satuan FY/FX/FZ/MX/MZ + kombinasi ASD/LRFD untuk Tab 03, tombol "Import STAAD" di `js/tabs/staadImport.js`).
- `tools/foundation-drawing.mjs` — gambar pondasi per tipe dari hasil staad-stability (plan, potongan, potongan pedestal, tulangan footing) → DXF R12 (layer CONCRETE/REBAR/DIM/TEXT/AXIS/HIDDEN/STEEL, mm) + SVG; tanpa hitungan.
- `tools/staad-stability.mjs` — CLI Node batch: reaksi STAAD per kombinasi → stabilitas fondasi dangkal (cek 4A, rumus dari lib) → laporan Markdown. `node tools/staad-stability.mjs <config.json> [--out report.md]`; format config di header file.
- `tools/fair-run.mjs` — CLI input gaya STAAD: file teks `.fnd` (command per baris: `FOOTING 1.0 1.0 0.3 DEPTH 0.9`, `LC 101 TO 164`, ...) → config JSON staad-stability → laporan. `node tools/fair-run.mjs <input.fnd> [--out report.md] [--check]`. Parser `lib/foundation/import/fndCommands.js` (`parseFndCommands`, tanpa rumus); sintaks di header file itu, contoh `docs/examples/example.fnd`. Cakupan: footing/pedestal dangkal, dan pile cap 4B lewat `SUPPORT PILE` (`PILE CAPACITY/DIAMETER/LIMITS/EFFICIENCY`, `PILE GRID` / `PILE n x z`; contoh `docs/examples/example-pile.fnd`). Dengan `DESIGN ...` + `LC LRFD ...` ikut dicek struktur pile cap (lentur, geser satu arah, punching pedestal & tiang; `pileCapDesignCheck`); `TOP MAT ON [RHO 0.0009]` = selalu ada mat atas ≥ ρ·b·h (default: atas hanya bila hogging; app: select "Top reinforcement" di 5B, `topLayerDesign` di lib); `ANCHOR .. REINFORCEMENT [BARS|HAIRPIN]` + `HAIRPIN BAR .. N .. [R ..] [COVER ..] [TENSION OFF] [SHEAR OFF] [STRAIGHT]` + `ANCHOR SHEAR TIES [N ..] [BAR ..] [CASE 1|2] [DIAMOND] | HAIRPIN | NONE` = tulangan pengangkuran angkur; `AUTO THICKNESS TO .. STEP ..` mencari tebal cap H terkecil yang lolos 4B + struktur (pakai `DP` agar kedalaman pedestal tetap); tipe equipment lain belum.
- **Report generator** (CLI + app, satu format): `lib/foundation/report/reportDocument.js` (pure: `buildReportDocument`, `markdownToHtml`), `css/report.css` (A4, print = layar), `tools/report-output.mjs` (HTML + PDF lewat Chrome/Chromium/Edge headless yang sudah terpasang; `FAIR_BROWSER` menunjuk browser), `js/report/exportHtml.js` (tombol "Export report (HTML)" di Summary). `fair-run` menulis `<nama> - Stability|Pile.html` (tanpa `--no-html`) dan `.pdf` dengan `--pdf`; perintah `REPORT BY .. DATE .. REV .. LOCATION .. COMPANYDOC .. CONTRACTORDOC .. PAGES ..` mengisi header.
- `tools/staad-pile.mjs` — CLI Node: reaksi STAAD per kombinasi → cek 4B pile group (layout, Eg, tekan/tarik/lateral; `evaluatePileGroupCombo` dari lib) + struktur pile cap 5B dari kombinasi LRFD → laporan Markdown. `node tools/staad-pile.mjs <config.json>`; format config di header file.
- `lib/foundation/validation/` — 41 file `.mjs` (part44 = `pileCapPlatformCombo`: cap under three vessels and a platform, LC 220 / 221 face moment, beam moment, one-way shear vs the calculation, plus `pileCapFlexureCheck` / `pileCapPlatformEnvelope` (Table C.21 / C.22 ratios against D13-150), 19 checks; part43 = pile cap as a beam between the pile lines (`capBeamAnalysis`), crack-control spacing, equipment / platform column punching vs the Filter Coalescer calculation, 18 checks; part42 = Feld's rule Eg + faktor baris lateral Reese et al. (2003), 10 checks; part41 = reaksi tumpuan skid → beban E + load points (`skidSupportLoads`, centroid shift per kondisi, uplift, fallback), 11 checks; part40 = multi-titik beban pada fondasi DANGKAL (skid runner / base plate / pedestal per titik): `footingPointLoads`, lentur di muka tiap titik + scan bentang (hogging di antara runner), geser satu arah & punching dengan titik lain dinetralkan, 21 checks; part39 = grup angkur vs SP-17M(14) Anchorage Example 18 (breakout, pullout, side-face blowout dengan faktor sudut, tulangan pedestal, tie 125 mm teratas Case 1/2 + diamond ties), 30 checks; part38 = hairpin tulangan pengangkuran tarik + geser (`anchorGroupCheck` reinf.type 'hairpin', `straightDevLength`, CLI `anchorReinf`, `.fnd` HAIRPIN), 28 checks; part37 = import STAAD .std + .ANL di app (`staadReactionCombos`, 7 load type satuan, kD, temporary; vektor = CLI), 14 checks; part36 = kriteria luas kontak minimum 4A, 8 checks; part35 = opsi tulangan atas: lapis bawah saja / 2 lapis, 15 checks; part34 = report generator HTML/PDF, 22 checks; part33 = multi-titik beban dengan pedestal per titik, 20 checks; part32 = auto-thickness pile cap, 12 checks; part31 = struktur pile cap dari kombinasi LRFD STAAD, 16 checks; part29 = input `.fnd` + CLI = rute JSON, 24 checks; part30 = `.fnd` pile cap + staad-pile hand calc, 21 checks; part7 = import parsers, 62 checks; part8 = pile group, 105 checks; part9 = LRFD set + pile cap shear, 58 checks; part10 = pile cap flexure 2 axes, 25 checks; part11 = punching with unbalanced moment, 16 checks; part12 = foundation geometry consistency, 23 checks; part13 = offset pedestal on a shallow footing + biaxial governing, 22 checks; part14 = biaxial no-tension soil pressure + no-e-limit option + Meyerhof effective area, 43 checks; part15 = wind generator ASCE 7-22, 26 checks; part16 = shallow footing M_u / V_u from net soil pressure, 33 checks; part17 = footing punching at edge / corner + two-way size effect λs, 31 checks; part18 = STAAD import + batch stability + Meyerhof bearing + FS temp + auto-size + project file + static uplift + min contact + footing thickness / bars, 65 checks; part19 = anchor group ACI 17, 19 checks; part20 = Auto-Size footing, 29 checks; part21 = audit fixes (anchor Vb, one-way Vc, P-M φ), 38 checks; part22 = independent spread-footing reference, 41 checks; part23 = STAAD reactions Y-up → FAIR, 27 checks; part24 = cross-check `footingDesign` vs `spreadFooting` on 600 random cases, 6 checks; part25 = pile group of a real 12-pile equipment foundation (reaction lever arms, Eg), 20 checks; part26 = pile settlement Vesic, 17 checks; part27 = several load points on one pile cap (equivalent group load, equilibrium, sections), 16 checks; part28 = punching of a pile through the cap, 14 checks) + `VALIDATION_REPORT.md` (1207 checks, 1207 pass @ 16 Oct 2026).

## 4. Kontrak Pure Function (harga mati di lib/)
- `lib/` = no DOM, no `document`, no `window`, no `fmt()`, no Tesseract. Input plain numbers/objects, output plain objects.
- Satuan SI: P kN (down +), H kN, M kN·m, dimensi m, c/cu/q/Es kPa, gamma kN/m3, frekuensi Hz, massa kg, kekakuan kN/m, settlement mm.
- Konversi ton → kN (`* 9.80665`) hanya di UI (Tab 03), BUKAN di library.
- Return standar: `{ valid, ..., governingUC, overallPass }`. `UC = demand/capacity`, PASS bila `UC <= 1.0`. `Infinity` = fail berat.
- Note string di lib pakai `.toFixed()` polos, bukan helper `fmt()` UI.
- Konvensi tanda beban (`loadTypeVector()`): P ke bawah +; beban lateral: H dan M **tanda sama** bila menggulingkan searah (M_dasar = M + H·Δh); Mz > 0 menekan sisi +x, Mx > 0 menekan sisi −z. Reaksi tumpuan STAAD (Y up) BUKAN konvensi ini: pilih "STAAD support reactions (Y up)" di Tab 03 (mode Support Reaction) — `staadReactionToFair()`: H = −FX, Hz = −FZ, M = +MZ (tipe X) / −MX (tipe Z), P = FY, Mx = +MX. Software / sumbu lain butuh pemetaan sendiri.

## 5. Dispatcher Kategori
- `getCategoryForEquipment(type)` dan `requiredChecksForCategory(cat)` = satu-satunya mapping equipment → modul.
- Kategori: `static | rotating | reciprocating | piperack | skidMounted`. Base checks: `bearing, stability, settlement, pedestal, footing`. Tambahan: rotating `+vibration`, reciprocating `+dynamicForce`, piperack `+twoDirectionStability`, skidMounted `+anchorConcentration`.
- Helper UI pending: rotating/reciprocating, dan cek anchor concentration skid (tabel reaksi tumpuan skid sudah ada; lihat `helperNote` di `js/workflow/setup.js` ~baris 78-95). Jangan klaim sudah ada.

## 6. Dependency Melingkar
- Sizing butuh loading, dead load fondasi baru diketahui setelah dimensi → selesaikan **iteratif di kode**, bukan manual user. Contoh baku: `sizePierFooting()` di piperack.
- Section stability/settlement/pedestal/footing = loop validasi sampai ALL PASS. Tombol "Auto-Size Foundation" memicu loop ini.

## 7. Cara Validasi (wajib tiap ubah rumus)
```powershell
node lib/foundation/validation/validation_shared_part1.mjs
node lib/foundation/validation/validation_shared_part2.mjs
node lib/foundation/validation/validation_shared_part3.mjs
node lib/foundation/validation/validation_shared_part4.mjs
node lib/foundation/validation/validation_cat_part5.mjs
node lib/foundation/validation/validation_cat_part6.mjs
node lib/foundation/validation/validation_import_part7.mjs
node lib/foundation/validation/validation_shared_part8.mjs
node lib/foundation/validation/validation_shared_part9.mjs
node lib/foundation/validation/validation_shared_part10.mjs
node lib/foundation/validation/validation_shared_part11.mjs
node lib/foundation/validation/validation_static_part12.mjs
node lib/foundation/validation/validation_shared_part13.mjs
node lib/foundation/validation/validation_shared_part14.mjs
node lib/foundation/validation/validation_shared_part15.mjs
node lib/foundation/validation/validation_shared_part16.mjs
node lib/foundation/validation/validation_shared_part17.mjs
node lib/foundation/validation/validation_import_part18.mjs
node lib/foundation/validation/validation_shared_part19.mjs
node lib/foundation/validation/validation_shared_part20.mjs
node lib/foundation/validation/validation_shared_part21.mjs
node lib/foundation/validation/validation_shared_part22.mjs
node lib/foundation/validation/validation_shared_part23.mjs
node lib/foundation/validation/validation_shared_part24.mjs
node lib/foundation/validation/validation_shared_part25.mjs
node lib/foundation/validation/validation_shared_part26.mjs
node lib/foundation/validation/validation_shared_part27.mjs
node lib/foundation/validation/validation_shared_part28.mjs
node lib/foundation/validation/validation_shared_part42.mjs
node lib/foundation/validation/validation_shared_part43.mjs
node lib/foundation/validation/validation_shared_part44.mjs
node lib/foundation/validation/validation_import_part29.mjs
node lib/foundation/validation/validation_import_part30.mjs
node lib/foundation/validation/validation_import_part31.mjs
node lib/foundation/validation/validation_import_part32.mjs
node lib/foundation/validation/validation_shared_part33.mjs
node lib/foundation/validation/validation_import_part34.mjs
node lib/foundation/validation/validation_shared_part35.mjs
node lib/foundation/validation/validation_shared_part36.mjs
node lib/foundation/validation/validation_import_part37.mjs
node lib/foundation/validation/validation_shared_part38.mjs
node lib/foundation/validation/validation_shared_part39.mjs
node lib/foundation/validation/validation_shared_part40.mjs
node lib/foundation/validation/validation_shared_part41.mjs
```
- Exit 0 = pass, 1 = ada fail. Toleransi: integer 1e-9, textbook 0.05-0.08. Jangan tambah jest/vitest tanpa izin.
- CI: `.github/workflows/validation.yml` menjalankan semua `validation_*.mjs` + cek sintaks (`.github/scripts/parse-check.mjs`) di setiap push / PR ke `main` (Node 22). `node --check` tidak dipakai: meleset pada `.js` ber-`import`/`export`.

## 8. Aturan Kerja AI
1. JANGAN otak-atik kode existing tanpa perintah eksplisit. Default: baca + jelaskan + propose patch kecil.
2. Import lib selalu dari `lib/foundation/index.js` (dari modul `js/`, path relatif, mis. `../../lib/foundation/index.js`) atau `../shared/...` relatif (antar modul lib). Jangan deep-import dari UI. `lib/` tidak pernah import `js/`.
3. Kalkulasi inti = rumus deterministik di kode. AI hanya **input parser/extractor** (OCR/teks → JSON → auto-fill, highlight kuning, user verifikasi). AI dilarang menebak hasil hitung.
4. Korelasi tanah (`soilProperties.js`: Peck/Stroud/Bowles) wajib tampilkan `method` + warning verifikasi geotech report.
5. Tiap ubah rumus: sebut pasal code (mis. ACI 318M-19 §22.5.5 / §22.6.5 / Ch.17 / §22.4), before/after + hand-calc vector, re-run validasi.
6. Patch kecil & idempotent. Edit via konteks unik, jangan rewrite file besar sekaligus. Pindah kode antar file = pindahkan apa adanya, lalu verifikasi (validasi + bandingkan hasil halaman sebelum/sesudah).
7. Pakai absolute path. Verifikasi akhir via read-back + run bila bisa.
8. Bila butuh detail (Terzaghi vs Meyerhof, Fa/Fv, ASD/LRFD) → tanya user dulu, jangan asumsi.

## 9. Workflow Tiap Tugas
1. Planning: pemahaman + file yang diubah + risiko.
2. Baca paralel: `index.js` + modul terkait + fungsi `calc*()` terkait + report validasi.
3. Implementasi: ubah `lib/` dulu, tambah vector validasi, baru wiring UI (`calc*()` + `lastResults` + Summary Report).
4. Verifikasi: `node validation_*`, `node patch.js` bila sentuh SVG, buka via dev server & cek console.
5. Ringkasan: apa diubah, kenapa, UC before/after, PASS/FAIL, asumsi/batasan.

## 10. Contoh Prompt Efektif
- "Tambah helper rotating F0 = m·e·ω² di Tab 03 lalu wire ke `rotatingLoadingData` + `rotatingVibrationCheck`, tanpa ubah rumus shared."
- "Refactor `calcBearing()` agar panggil `bearingCapacityCheck()` dari lib, tampilkan formula breakdown, re-run validation_shared_part1."
- "Buatkan auto-size loop static block: trial B/L → self-weight → `evaluateFoundationCombo` sampai `governingUC <= 1`."

---
*Dibuat 20 Sep 2026 dari pemetaan aktual repo; dirapikan 25 Sep 2026 (struktur js/, nama FAIR). Rujuk silang: docs/PROJECT_INSTRUCTIONS.md, docs/PROJECT_MAP.md, docs/PHILOSOPHY.md, js/README.md, lib/foundation/validation/VALIDATION_REPORT.md.*