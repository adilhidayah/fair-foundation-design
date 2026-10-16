# HANDOFF — FAIR Foundation Design (per 16 Okt 2026)

## Status repo
- `main` = `b9bdd4f` (merge PR #15, PT-TIP butir 1–3). CI Validation + GitHub Pages deploy sukses (16 Okt 04:25 UTC).
- Validasi: 39 file, 1175 checks, 1175 pass (`lib/foundation/validation/VALIDATION_REPORT.md`).
- Cache-buster `?v=` saat ini `20261015q` (seragam di semua import `js/` + `index.html`; `lib/foundation/index.js` memakai `?v=` sendiri untuk `pedestalCheck.js` dan `anchorGroup.js`).
- Untuk kerja baru: branch dari `origin/main`. Branch `claude/pt-tip-*` sudah merged (lewat PR #15).

## Lanjutan berikutnya (prioritas)
1. **V_sa angkur (tidak konservatif dengan grout)**: `anchorGroupCheck` cek geser baja V/4 per angkur tanpa faktor 0.8 grout pad (§17.7.1.2.1). SP-17M Example 18 Step 16: V/2 per angkur (Case 2) × 0.8. Tercatat di laporan Tab 09 / CLI; belum diubah (user: "tulis saja dulu"). Perlu input grout (ada `groutT` di CLI / `fs-grout-t` di app).
2. **Brief PT-TIP butir 4–7** (belum mulai): pedestal 5A lengkap di lib (geser + sengkang §22.5, 3 sengkang atas dalam 125 mm, ρmin proyek 0.5 %, selimut 40, jarak baut–tulangan 25, auto-size pedestal step 50 s/d 600 — CLI `staad-stability` sudah punya sebagian); input Ω0 di Tab 09 (CLI sudah `anchor.omega0`); "same bars both ways" + spacing step 50 di 5B / proyek / `.fnd`; lean concrete (checkbox atau dokumentasi tebal 0).
3. **Pencocokan file proyek asli** (rencana user: dicek oleh Claude lain): T-POST 1.1 (UC 0.902 L/C 130, kontak 78 %; pedestal 4 D13, D10 @200 + 3 atas) dan T-POST 1.11 (kontak UC 0.931 L/C 128; angkur 0.949 pullout; pedestal 8 D13). File ada di komputer user (`KALKULASI 2`, branch lokal `tools/staad-scripts`, commit hairpin `5a1c693` belum di-push). Angka angkur 0.949 kemungkinan dari sebelum faktor sudut side-face → diharapkan berubah.
4. **Performa saat mengerjakan fondasi lokal vs online** (ditanyakan user, belum ada data): kode sama, tidak ada cabang per-host. Dugaan: versi kode lokal beda (branch lain), mode tampilan Focus Canvas / Report Preview tersimpan per origin di `localStorage` (`viewMode.js`), input matriks 164 load type vs Import STAAD (7 load type), DevTools / ekstensi. Snippet ukur recalc sudah diberikan ke user (import `js/workflow/recalc.js?v=<versi>`, `recalcAll()`, `performance.now()`). Opsi buka-halaman: `<link rel="modulepreload">` untuk 87 modul.

## PT-TIP — yang sudah ada di main (PR #15)
- **4A luas kontak minimum** (`fd-mincontact`, kosong = off; `combineFootingChecks` `minContact`, UC = min/rasio kontak), sama dengan CLI. Perbaikan: "No limit" eksentrisitas tidak lagi memasukkan kern ke UC.
- **Tab 03 "Import STAAD (.std + .ANL)"** (`js/tabs/staadImport.js`, lib `staadReactionCombos`): node, daftar ASD 101–164 / LRFD 301–400, satuan wajib KN/METER, tabel reaksi terakhir. Model: load type satuan FY/FX/FZ/MX/MZ (faktor kombinasi = reaksi), D dengan kD (Dead pertama), TMP = penanda temporary (Wind/Seismic). 164 kombinasi: import ~0.2 s, recalc ~20 ms. `lc-dW` 3 desimal.
- **Angkur ACI 17 grup** (`anchorGroupCheck`; CLI + Tab 09 metode "ACI 17 group (4 anchors)", default tetap "Single anchor"):
  - Tarik: none / tulangan pedestal 5A (`lastResults.pedestalRebar.layout`) / hairpin (U di atas = kait, kaki ≤ 0.5·hef, l_dh di atas bidang 35°, kaki lurus ≥ l_d di bawah).
  - Geser (`shearReinf`): none / tie 125 mm teratas (strut 45°, T = V/2 Case 2 default, V/4 Case 1; min 2 D13 / 3 D10 §10.7.6.1.6; diamond ties = flag detail, tanpa kapasitas) / hairpin (2 angkur depan, kaki vs l_dh / l_d).
  - **Side-face blowout dengan faktor sudut (1 + c_a2/c_a1)/4 (§17.6.4.1.1)** — dulu hilang (2× tidak konservatif). Pedestal 300×300, M16 @130, hef 300 kini sering governing side-face.
  - φ mode grup = input Tab 09 (default app N_cb / N_pn 0.65; CLI 0.70 → samakan bila membandingkan).
  - CLI: `pedestal.anchor.reinforcement: true|"bars"|"hairpin"`, `hairpin {}`, `shearReinforcement: "ties"|"hairpin"|"none"`, `ties { n, db, case, diamond }`. `.fnd`: `REINFORCEMENT [BARS|HAIRPIN]`, `HAIRPIN ...`, `ANCHOR SHEAR TIES [N] [BAR] [CASE 1|2] [DIAMOND] | HAIRPIN | NONE`. Gambar B-B: hairpin + diamond ties.
- **Validasi SP-17M(14) Anchorage Example 18** (part39): N_sa, h_ef′, N_cbg (700 / 800), pullout, side-face 2φN_sbg = 494 kN, tie Case 1 A_s,req 106 mm² — sama dengan buku. Beda terdokumentasi (FAIR lebih konservatif): l_dh tulangan pedestal pakai 318M-19 tanpa reduksi A_s,req/A_s,prov (367 vs 255 mm); ψc,V = 1.2 tidak dipakai.
- Diuji di browser dengan model STAAD sintetis 164 kombinasi (scratchpad, bukan file proyek): 4A app 0.847 = CLI 0.8471; Tab 09 grup 0.171 = CLI.

## Fitur sebelumnya (PR #4–#6)
1. **Pile settlement Vesic / Das §11.18** — `lib/foundation/shared/pileSettlement.js` (`pileSettlementVesic`: S1+S2+S3, Fg=√(Bg/D)). UI: Tab 08B mode Pile (`js/tabs/settlement.js`, beban kerja otomatis dari kombinasi servis gravitasi). Asumsi Es, shaft share, ξ, Iwp wajib dari laporan geotek.
2. **Beberapa titik beban pada satu pile cap** — `lib/foundation/shared/loadPoints.js`; UI Tab 02 "Load Points" (`js/tabs/loadPoints.js`). Beban grup ekuivalen di pusat cap + netting beban titik di balik penampang untuk geser/lentur. Hanya pile cap tanpa pedestal.
3. **Punching tiang menembus pile cap** — `lib/foundation/shared/pilePunching.js` (ACI §22.6, λs, αs 40/30/20, dipotong tepi cap). Status Two-Way Shear = max(UC kolom, UC tiang).
4. **Performa** — `js/core/lazyPanels.js` (panel lazy, tabel panjang >40 baris diciutkan di layar), `content-visibility:auto`. Ketik 143/279→92/63 ms; pindah tab Report Preview 2–4× lebih cepat.
5. **Font** — tab bar dan Focus Canvas diseragamkan (IBM Plex Sans 12px, skala tipe Focus Canvas di `css/app.css`).

## Temuan audit PDF Filter Coalescer 101-F-2201
- Reaksi tiang: FAIR = hand calc (F = P/n + Mz·x/Σx² + Mx·z/Σz²); angka di dokumen yang salah.
- Efisiensi grup: FAIR default Converse–Labarre (0.816); dokumen memakai Feld 0.9375 → isi Eg manual bila ingin sama.
- Lentur penuh dari reaksi tiang di FAIR lebih konservatif daripada model strip dokumen.

## Keterbatasan diketahui
- Multi-titik beban dengan pedestal per titik (Pile Cap + Pedestal): pedestal = c1×c2 titik, tinggi Hp Tab 02; 5A dan 09 dicek per pedestal dengan share beban. Berat pedestal bekerja di titiknya; bukan satu `Bp×Lp` Tab 02 (Bp, Lp, Off X/Z diabaikan). Pola baut Tab 09 sama untuk semua pedestal. Belum ada di `.fnd`.
- 4A mengabaikan momen P·offset.
- Eq. (c) / λs untuk footing dan pemetaan STAAD perlu diverifikasi user.
- Summary tab: sudah dioptimasi (buka pertama ~178→~66 ms, buka ulang tanpa perubahan ~117→~13 ms @130 kombinasi, headless). Bila masih terasa lambat, sisa biaya = layout 500 KB report (35k node).
- Kotak "Limitation" 5B: sudah diperbaiki (`renderCh6Limits` menulis lewat string HTML panel, bukan DOM).

## Gotcha teknis
- Line ending campuran (CRLF/LF): edit binary-safe.
- `node --check` tidak menangkap error ESM; pakai `node --experimental-vm-modules --no-warnings .github/scripts/parse-check.mjs`.
- Jangan set `style.display='block'` pada tab 4A/4B (tab menempel); pakai `''`.
- Kombinasi beban yang di-inject harus punya `lc` bertipe string.
- Test browser: jaga `?v=` konsisten agar modul tidak terduplikasi.
- GitHub Pages deploy dari `main`.
- Test browser Playwright: Chromium di `/opt/pw-browsers/chromium`, server `python3 -m http.server 8123`; file input Import STAAD lewat `setInputFiles('#sti-std' / '#sti-anl')`, buka dulu `#sti-group` (details). Daftar bolt Tab 09 di `state.boltList` (ubah lewat tabel, bukan splice, agar input ikut ter-render).
- Mode grup Tab 09 butuh tepat 4 baut persegi simetris terhadap centroid, angkur cast-in.

## Input command `.fnd` (CLI)
- `node tools/fair-run.mjs input.fnd [--out report.md] [--check]`; sintaks di header `lib/foundation/import/fndCommands.js`, contoh `docs/examples/`.
- Footing/pedestal dangkal (`staad-stability.mjs`) dan pile cap `SUPPORT PILE` (`staad-pile.mjs`: 4B, struktur 5B, auto-thickness).
- CLI pile cap 5B sudah dibandingkan dengan tab 5B di app (6 kasus, semua sama; lihat catatan di VALIDATION_REPORT). Belum diuji dengan file STAAD proyek asli.
- Belum: torsi MY STAAD untuk grup tiang (tanda belum terverifikasi), multi-titik beban di `.fnd`, campuran pile + dangkal dalam satu file.

## Report generator (HTML + PDF)
- CLI: `fair-run input.fnd [--pdf]` → `.md` + `.html` (A4, `css/report.css`) + `.pdf` (Chrome/Chromium/Edge terpasang; `FAIR_BROWSER`/`--browser`). `REPORT ...` di `.fnd` mengisi header (oleh, tanggal, rev, lokasi, nomor dokumen, halaman). Gambar DXF/SVG footing ikut tertanam bila `DRAWINGS ON`.
- App: Summary → "Export report (HTML)" (satu file mandiri, tombol Print / Save as PDF di dalamnya). PDF di app = print browser; tidak ada library PDF.
- Belum: logo di CLI, nomor halaman total di header dokumen, font IBM Plex di file mandiri (memakai font sistem).

## Tulangan atas footing / pile cap
- Default: atas hanya bila ada hogging (perilaku lama). Opsi "Two layers" (app 5B: select Top reinforcement + ρtop; `.fnd`: `TOP MAT ON [RHO ..]`) = mat atas selalu, ≥ ρtop·b·h (default 0.0009, nilai proyek), atau desain hogging bila lebih besar. Gambar CLI: titik batang z atas di potongan + plan mat atas.

## Ide lanjutan (belum diminta)
Multi-titik di `.fnd`, pembanding model strip 5B.
