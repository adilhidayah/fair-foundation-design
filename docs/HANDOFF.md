# HANDOFF — FAIR Foundation Design (28 Oktober 2026)

## Status terkini — baca bagian ini terlebih dahulu

User berbahasa Indonesia, civil/structural engineer, bukan programmer. Keputusan terakhir: **hentikan perapian visual sementara; prioritaskan kelengkapan dan ketepatan fitur anchor ACI**. Perbaikan visual berikutnya hanya bila mengganggu penggunaan atau diminta user.

### Lokasi dan Git

- Folder utama: `E:\KERJA\_FAIR-WORKSPACE\MASTER CALCULATOR`.
- Salinan kerja chat ini: `C:\Users\M S I\.codex\worktrees\merge-local-github\MASTER CALCULATOR`.
- Folder utama dulu berada di `E:\KERJA\TOOLS\MASTER CALCULATOR`; sudah dipindahkan. Pointer `.git` salinan kerja telah diperbaiki ke lokasi baru.
- Branch salinan kerja: `codex/merge-local-github`. Folder utama memakai `codex/unified-local-github` dan telah di-fast-forward ke kode yang sama.
- Commit kode terakhir: **`b663268`**, `Require explicit ACI anchor shear sharing and align steel ties and pryout`.
- Semua perubahan aplikasi sudah disimpan dan disinkronkan lokal. **Belum di-push ke GitHub / dipublikasikan.** Jangan mengganti checkout ke `origin/main` atau menimpa perubahan lokal berdasarkan catatan arsip di bawah.
- Perubahan user yang harus dipertahankan di folder utama: `AGENTS.md`, `docs/SCOPE_AND_STRUCTURE.md`, dan untracked `repo-comparison-2026-10-27.md`. Salinan kerja C bersih sebelum pembaruan catatan handoff ini.
- Web lokal terakhir: `http://127.0.0.1:8872/?v=20261028s3`, dilayani dari folder utama oleh Python tersembunyi. Jika tidak berjalan, jalankan dev server dari folder utama. Server uji port 8874 sudah dihentikan.

### Anchor ACI — perubahan yang sudah selesai

Catatan rinci dan vektor hitungan: [ANCHOR_SHEAR_AUDIT.md](ANCHOR_SHEAR_AUDIT.md).

1. User secara eksplisit memilih **jumlah angkur penahan geser wajib dipilih per proyek, tanpa nilai bawaan**.
2. API `anchorGroupCheck` menerima `shearAnchors: 2 | 4`. Pilihan 4 wajib disertai string `shearBasis`, rujukan detail penyaluran gaya. Teks rujukan bukan verifikasi otomatis atas detail.
3. Demand baja = V/2 atau V/4 sesuai pilihan (§17.7.1.1). Faktor grout 0,80 (§17.7.1.2.1) tetap hanya pada kapasitas baja geser.
4. Sengkang mengikuti pilihan yang sama: 2 → Case 2, 4 → Case 1. `ab-tie-case` diturunkan otomatis dan disabled. Library menolak Case lama yang bertentangan.
5. Pryout (§17.7.3.1) memakai proyeksi dan hef efektif dari angkur yang menerima geser: dua di baris depan pada arah dominan atau keempat angkur. Sebelumnya selalu memakai empat.
6. Breakout geser beton tetap diperiksa dengan seluruh V pada permukaan baris depan sebagai batas konservatif. Hairpin geser tetap memikul seluruh V melalui dua angkur depan, tanpa bonus kapasitas karena pilihan empat angkur.
7. Tanpa gaya tarik, breakout tarik ditandai **NOT REQUIRED**; tidak lagi menghasilkan 0/0. Tidak ada kapasitas fiktif yang ditambahkan.
8. Pilihan kosong/tidak valid, rujukan empat angkur kosong, atau Case bertentangan tidak boleh PASS. Proyek lama perlu dipilih ulang; tidak ada migrasi diam-diam ke empat angkur.
9. Proyek baru memakai metode **ACI 17 group**. Metode single-anchor masih tersedia dan diberi label simplified.
10. CLI JSON: `pedestal.anchor.shearAnchors` / `shearBasis`. `.fnd`: `ANCHOR SHARING 2` atau `ANCHOR SHARING 4 Drawing S-101 detail ...`. Contoh `.fnd` telah menyatakan pilihan dua secara eksplisit.

File utama: `lib/foundation/shared/anchorGroup.js`, `js/tabs/anchor.js`, `js/tabs/anchorFocus.js`, `js/workflow/projectReadiness.js`, `tools/staad-stability.mjs`, `lib/foundation/import/fndCommands.js`, dan markup Tab 09 di `index.html`.

### Verifikasi terakhir

- **48 skrip validasi lulus**; **153 modul lulus pemeriksaan sintaks**.
- `validation_shared_part48.mjs`: **36 pemeriksaan baru**, termasuk hand-vector V=133,7 kN, konsistensi baja/sengkang, grout, pryout dua/empat dan arah x/z, tiga tepi dekat, pilihan wajib, parser `.fnd`, dan integrasi CLI.
- Vektor lama di part19/38/39/45/46/47 kini menyatakan asumsi empat angkur secara eksplisit; vektor Case 2 menyatakan dua. Part47 menguji NOT REQUIRED ketika tidak ada tarik.
- Browser: tanpa pilihan → PENDING; empat tanpa rujukan → PENDING; dua/empat dengan data lengkap → hasil tampil, Case terkunci sesuai pilihan. Pada LC201 contoh, demand per angkur 93,59 / 46,79 kN. Kasus tanpa tarik menampilkan NOT REQUIRED, sementara kegagalan geser tetap FAIL. Tidak ada error console.
- Screenshot contoh uji: `C:\Users\M S I\.codex\visualizations\2026\10\27\01a17e07-35cc-79b3-8da4-7955c528e4b5\anchor-aci-sharing.png`. Itu data uji, bukan proyek user.

### Yang masih perlu dikembangkan / diperiksa

- **Torsi base plate** belum dicakup oleh model anchor grup saat ini.
- **Breakout untuk geser miring pada dua tepi / sudut** belum diperiksa penuh; model masih memakai arah geser dominan.
- Model grup hanya empat cast-in headed anchors dalam persegi panjang, base plate kaku, beton retak. Bearing base plate / tekan grout dan kelengkapan detail penyaluran gaya belum dicakup.
- Penyelesaian di atas menutup inkonsistensi sharing yang tertunda; **jangan menyatakan seluruh Chapter 17 sudah lengkap atau tersertifikasi**.
- Untuk langkah berikutnya, kaji dan usulkan lingkup torsi / geser dua arah terlebih dahulu. Ikuti AGENTS: bila ada pilihan metode engineering baru, tanyakan kepada user, jangan menetapkan asumsi diam-diam.

### Perubahan aplikasi lain yang sudah selesai

- Focus Canvas Section 02-style untuk settlement, anchor (termasuk failure modes), pedestal 5A, dan lentur 5B (plan / section / isometric / design-section moments). Grafik momen 5B adalah nilai penampang yang sudah dihitung, bukan medan momen kontinu.
- Navigasi di kiri, bisa dilipat; 5A/5B dikelompokkan di Desain Struktur. Bar biru sekitar 40 px dan putih 32 px, tetap terlihat saat scroll; ResizeObserver di `app.js` menyesuaikan offset header bila terbungkus pada layar kecil.
- Font kontrol UI IBM Plex Sans. Proyek baru dan startup **kosong**: tidak ada contoh dimensi/material/beban/layout tiang/angkur. Standar, metode, dan faktor code tetap tersedia.
- `projectReadiness.js` menjaga isian kosong agar hasil, status dan laporan menunggu data; jangan melewati gate ini untuk memaksa PASS. Ada tindakan eksplisit untuk mengisi komponen beban kosong dengan 0.
- Commit terkait: `0b88776` (5B flexure), `cd4747a` (navigasi kiri), `8ac713e` (proyek kosong/font), `b94d9b2` (header tipis/freeze), `b663268` (anchor sharing).

### Aturan kerja penting

- Sebelum coding baca `AGENTS.md`, `docs/PROJECT_INSTRUCTIONS.md`, `lib/foundation/index.js`; UI juga `js/README.md`.
- Tanpa framework/bundler baru. Rumus deterministik dan pure di `lib/`; UI impor melalui index library.
- Cache-buster sekarang **`20261028s3`**. Pertahankan versi impor yang seragam, khususnya state bersama, agar tidak terbentuk dua instance state.
- Node 22+; gunakan parser repo untuk ESM, bukan `node --check`.
- Re-run semua `validation_*.mjs` untuk perubahan rumus; beri acuan pasal dan hand-vector. Perubahan UI saja cukup pemeriksaan yang sesuai.
- Line ending campuran: pertahankan format, gunakan patch kecil. Untuk diff check: `git -c core.whitespace=cr-at-eol diff --check`.
- Repo hanya pondasi dan pendukungnya; sambungan baja / pemodelan STAAD berada di FAIR Structural Tools terpisah. Jangan menambahkan kembali `lib/steel/` atau `tools/staad/`.

---

## Arsip handoff 16 Oktober 2026 — bukan status terkini

Bagian berikut dipertahankan untuk riwayat. Nomor commit, lokasi, hasil validasi, asumsi default, dan daftar keterbatasannya mungkin sudah berubah; gunakan status 28 Oktober di atas dan sumber aktual sebagai acuan.

## Status repo
- `main` = `b9bdd4f` (merge PR #15, hairpin + Tab 09 ACI 17 group). Semua PR sebelumnya (#4 Focus Canvas, #5 font + lag, #6 pile settlement / load points / pile punching, … #14, #15) sudah merged.
- Validasi: 41 file, 1207 checks, 1207 pass (`lib/foundation/validation/VALIDATION_REPORT.md`); CI `.github/workflows/validation.yml` menjalankan semuanya.
- Cache-buster `?v=` saat ini `20261015q` (harus seragam di semua import `js/` + `index.html`).
- Untuk kerja baru: mulai dari `origin/main`, jangan memakai ulang branch yang sudah merged.
- Bagian "Fitur yang ditambahkan" di bawah adalah catatan sesi 15 Okt (PR #4–#6); fitur sesudahnya (PT-TIP, `.fnd`, report generator, tulangan atas, hairpin) ada di bagian masing-masing.

## Fitur yang ditambahkan
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

## Pondasi pipe support PT-TIP (MC-002 Rev 0)
- Butir 1: luas kontak minimum 4A (`fd-mincontact`, kosong = off; `combineFootingChecks` `minContact`), sama dengan CLI. Perbaikan: dengan "No limit" kern tidak lagi ikut UC.
- Butir 2: Tab 03 "Import STAAD (.std + .ANL)" (`js/tabs/staadImport.js`, lib `staadReactionCombos`): 5 load type satuan FY/FX/FZ/MX/MZ (faktor kombinasi = reaksi), D dengan kD, TMP = penanda temporary. 164 kombinasi: import ~0.2 s. `lc-dW` kini 3 desimal (beda 0.4 % P dengan CLI).
- Belum diuji dengan file proyek asli (T-POST 1.1 / 1.11 ada di komputer user, branch lokal `tools/staad-scripts`, commit `5a1c693` hairpin).
- Butir 3 (hairpin): `anchorGroupCheck` reinf `{ type: 'hairpin', db, n, r, tension, shear, legEnd, sideCover }` — tarik: kaki vertikal ≤ 0.5·hef, dikembangkan di atas bidang 35° (l_dh), ganti N_cbg; geser: hairpin horizontal di 2 angkur depan, kaki ke dalam pedestal (l_dh / l_d), ganti V_cbg; φ 0.75, tanpa faktor seismik 0.75. CLI `pedestal.anchor.reinforcement: "hairpin"` + `hairpin {}`; `.fnd` `REINFORCEMENT HAIRPIN` / `HAIRPIN ...`; gambar B-B. Tab 09: metode `ACI 17 group` (= CLI; φ dari input Tab 09 — set N_cb / N_pn 0.70 agar sama dengan CLI). Model ditulis ulang tanpa commit `5a1c693`: bandingkan dengan T-POST 1.11 (UC 0.949 pullout).
- SP-17M(14) Anchorage Example 18 (part39): lib = buku untuk N_sa, N_cbg, pullout, side-face. Diperbaiki: faktor sudut side-face blowout (dulu 2× tidak konservatif; pipe support 300 × 300 M16 @130 hef 300 kini sering governing side-face). Tulangan geser baru: tie 125 mm teratas (strut 45°, T = V/2 Case 2 default) + diamond ties (detail). Belum: faktor grout 0.8 untuk V_sa (§17.7.1.2.1) dan V_sa Case 2 (V/2 per angkur) — app/CLI masih V/4 tanpa 0.8; ψc,V = 1.2 dengan tulangan; reduksi l_dh A_s,req/A_s,prov.
