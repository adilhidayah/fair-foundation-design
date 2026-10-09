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
- **UI**: `FAIR Foundation Design.html` (markup) + `css/app.css` (style) + `js/` (ES modules, entry `js/app.js`). Tanpa bundler, tanpa package.json, tanpa framework.
  - Aturan modul UI (modul hanya deklarasi, wiring di `app.js`, state lewat `state.x`): lihat `js/README.md`.
  - Import antar modul js pakai `?v=` — naikkan di semua import file yang berubah, plus `js/app.js?v=` di HTML.
- **Library hitung**: `lib/foundation/**/*.js` — ES Modules murni, pure functions, tanpa DOM.
- **OCR**: `tesseract.js@5` via CDN untuk Smart Fill, di-load lewat `loadTesseract()` (`js/ocr/tesseract.js`) hanya saat tombol OCR diklik. Font: Google IBM Plex.
- **Validasi**: Node.js 22+ (butuh JSON import attribute `with { type: 'json' }`).
- **Menjalankan**: buka HTML lewat dev server (`npx serve .` atau Live Server), JANGAN `file://`, agar import jalan.
- **`patch.js`** (Node, idempotent): fixer marker SVG `fsize-arrow` / `fdn-arrow` di `js/diagrams/foundationDiagram.js` + `foundSizeDiagram.js`.

## 3. Peta File
Peta lengkap semua file: `docs/PROJECT_MAP.md`. Ringkasan:
- UI: `FAIR Foundation Design.html` (markup), `css/app.css` (style), `js/app.js` (event wiring + startup).
- Fungsi `calc*()` ada di `js/tabs/`: `bearing.js` (`calcBearing`), `foundation.js` (`calcFoundation`), `pile.js` (`calcPile`), `settlement.js` (`calcSettlement`), `anchor.js` (`calcAnchor`), `rebar.js` (`calcRebar`), `foundSize.js` (`calcFoundSize`), `shear.js` (`calcOneWay`, `calcTwoWay`). `lastResults` di `js/core/state.js`.
- `lib/foundation/index.js` — ENTRY POINT + dispatcher. Import dari sini, jangan deep-import dari UI.
- `lib/foundation/shared/` — `bearingCapacity`, `loadCombinations`, `stabilityCheck`, `pedestalCheck`, `pileGroup`, `pileCapShear`, `footingCheck`, `soilProperties`, `settlementCheck`, `windLoad`, `seismicLoad`.
- `lib/foundation/static/` — vessel/tank/heat-exchanger: `loadingData`, `foundationSizing`.
- `lib/foundation/rotating/` — `loadingData`, `vibrationCheck`, `foundationSizing` (mass ratio >= 3).
- `lib/foundation/reciprocating/` — `loadingData`, `dynamicForceCheck` (1x + 2x rpm), `foundationSizing` (mass ratio >= 5).
- `lib/foundation/piperack/` — `loadingData` (L-dir/T-dir), `loadCombinations` (envelope max |Mbot|), `foundationSizing` (iteratif `sizePierFooting`).
- `lib/foundation/skidMounted/` — `loadingData` (`sumBoltReactions`), `foundationSizing` (footprint + 2x edge).
- `lib/foundation/import/` — `textParsers` (OCR/paste teks → kandidat untuk direview user; tanpa konversi satuan).
- `lib/foundation/validation/` — 14 file `.mjs` (part7 = import parsers, 62 checks; part8 = pile group, 105 checks; part9 = LRFD set + pile cap shear, 58 checks; part10 = pile cap flexure 2 axes, 25 checks; part11 = punching with unbalanced moment, 16 checks; part12 = foundation geometry consistency, 23 checks; part13 = offset pedestal on a shallow footing + biaxial governing, 22 checks; part14 = biaxial no-tension soil pressure + no-e-limit option + Meyerhof effective area, 43 checks) + `VALIDATION_REPORT.md` (537 checks, 537 pass @ 9 Oct 2026).

## 4. Kontrak Pure Function (harga mati di lib/)
- `lib/` = no DOM, no `document`, no `window`, no `fmt()`, no Tesseract. Input plain numbers/objects, output plain objects.
- Satuan SI: P kN (down +), H kN, M kN·m, dimensi m, c/cu/q/Es kPa, gamma kN/m3, frekuensi Hz, massa kg, kekakuan kN/m, settlement mm.
- Konversi ton → kN (`* 9.80665`) hanya di UI (Tab 03), BUKAN di library.
- Return standar: `{ valid, ..., governingUC, overallPass }`. `UC = demand/capacity`, PASS bila `UC <= 1.0`. `Infinity` = fail berat.
- Note string di lib pakai `.toFixed()` polos, bukan helper `fmt()` UI.

## 5. Dispatcher Kategori
- `getCategoryForEquipment(type)` dan `requiredChecksForCategory(cat)` = satu-satunya mapping equipment → modul.
- Kategori: `static | rotating | reciprocating | piperack | skidMounted`. Base checks: `bearing, stability, settlement, pedestal, footing`. Tambahan: rotating `+vibration`, reciprocating `+dynamicForce`, piperack `+twoDirectionStability`, skidMounted `+anchorConcentration`.
- Helper UI pending: rotating/reciprocating/skid bolt-map (lihat `helperNote` di `js/workflow/setup.js` ~baris 78-95). Jangan klaim sudah ada.

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
```
- Exit 0 = pass, 1 = ada fail. Toleransi: integer 1e-9, textbook 0.05-0.08. Jangan tambah jest/vitest tanpa izin.

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