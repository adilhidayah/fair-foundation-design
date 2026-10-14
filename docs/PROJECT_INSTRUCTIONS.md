# FAIR Foundation Design — Project Instructions

> File ini adalah simpanan instruksi user. JANGAN otak-atik kode existing tanpa perintah eksplisit.
> Tanggal simpan: 18 Sep 2026 — update terakhir: 25 Sep 2026 (refactor struktur file, nama FAIR)
> Lokasi workspace: e:\MASTER CALCULATOR
>
> Dokumen terkait (indeks: `docs/README.md`):
> - `docs/PHILOSOPHY.md` — nama, filosofi, dan cakupan aplikasi
> - `docs/PROJECT_MAP.md` — peta semua file ("mau ubah apa → buka file mana")
> - `docs/AI_ASSISTANT_PLAN.md` — rencana fitur AI
> - `js/README.md` — aturan modul UI
> - `AGENTS.md` (root) — aturan kerja AI assistant

## 1. Tentang User & Proyek
- Civil structure engineer di industri oil & gas.
- Membangun **FAIR Foundation Design**, web app kalkulator fondasi. Modul pertama: SEMUA jenis equipment —
  vessel, tank, heat exchanger, pompa, kompresor, turbin, pipe rack, skid-mounted package unit, dll.
  Modul fondasi gedung direncanakan kemudian (belum ada).

## 2. Status Saat Ini (25 Sep 2026)
- Rumus kalkulasi sudah diekstrak ke library pure functions di `lib/foundation/` (tanpa DOM), divalidasi hand-calc lewat `lib/foundation/validation/` (part1–12, 472 cek, semua PASS per 27 Sep 2026).
- UI yang dulu satu file raksasa (~408 KB) sudah dipecah:
  - `index.html` — markup saja (~92 KB)
  - `css/app.css` — style
  - `js/` — ES modules: `app.js` (event wiring + startup), `core/`, `diagrams/`, `tabs/` (satu file per tab), `ocr/`, `report/`, `workflow/`
- Refactor ini murni pemindahan kode — tidak ada rumus yang berubah. Diverifikasi: validasi lib PASS + uji interaksi headless browser identik dengan versi sebelum dipecah (949/949 langkah).
- Tesseract.js (OCR) sekarang di-load hanya saat tombol OCR diklik, bukan saat halaman dibuka.
- Modul kategori rotating/reciprocating/piperack/skidMounted sudah ada di `lib/`, tapi helper UI-nya (bolt-map, dll.) belum dibuat.
- **Tab 4B Pile (25 Sep 2026)** — dibangun ulang di atas `lib/foundation/shared/pileGroup.js` (validasi part8, 101 cek):
  - Origin koordinat tiang = pusat pile cap; cap = Bf × Lf dari Tab 02. `scalePilesToFooting` dihapus (spasi tidak lagi berubah diam-diam saat Bf/Lf diubah).
  - Cek spasi c/c dan jarak tepi: batas **per proyek** (input, satuan ×D atau mm, kolom sumber). Kosong = NOT SET → status "INCOMPLETE", bukan PASS. Spasi minimum = FAIL; spasi anjuran dan jarak tepi = WARNING; tiang di luar cap = FAIL.
  - Efisiensi grup Converse–Labarre hanya untuk Qc dan Qt (grid m×n; layout tak beraturan butuh Eg manual). Lateral: p-multiplier per baris (tabel AASHTO 10.7.2.4-1, bisa diedit; **nilai dari ingatan, verifikasi**), default baris penentu.
  - Gaya biaksial per tiang; lateral = H/n + torsi dari eksentrisitas titik kerja (pusat pedestal, OffX/OffZ) terhadap sentroid grup. Kapasitas ASD tanpa kenaikan untuk angin/gempa (ASCE 7 §2.4.1).
  - Struktur preview 4B mengikuti bab lain (permintaan user): judul bab "04. Pile Foundation Stability" (`report-header`) + paragraf pengantar, lalu subbab bernomor `section-label` 4.1 Pile Layout, 4.2 Axial Group Efficiency (bila tampil), 4.3 Lateral Group Reduction (bila p-multiplier aktif), 4.x Design Loads and Pile Forces, 4.x Demand / Capacity Ratio (DCR), 4.x Calculation Formulas — masing-masing dengan pengantar singkat. Kotak verdict di atas preview dihapus atas permintaan user (status, UC penentu, dan combo penentu sudah tampil di panel Live Design dari `lastResults.pile`; status INCOMPLETE tampil sebagai PENDING di sana, ). Notifikasi 4B (NOT SET, warning jarak tepi / spasi, warning p-multiplier) juga tidak dicetak di preview: `calcPile()` mengisi `lastResults.pile.notices` ([{title, text}]) dan `renderLiveBar()` (`js/workflow/status.js`) menampilkannya di panel kanan, bagian "Notices" (kelas `.lb-notice`), baik saat mode onboarding maupun setelah siap; hanya tampil bila 4B termasuk cek aktif (tidak di mode shallow). Kotak merah untuk kesalahan yang menghalangi hasil (mis. Eg tidak bisa ditentukan) tetap di preview. Caption tabel dinomori otomatis "Table 4.<subbab>.<n>." di akhir `calcPile()` (nomor menyesuaikan bila subbab opsional tidak tampil).
  - DCR dipisah per cek (permintaan user, karena tekan, tarik, dan lateral bisa ditentukan combo yang berbeda): tabel ringkasan "DCR per check" (demand, kapasitas, DCR, combo penentu, tiang + koordinat, status; termasuk spasi minimum) lalu tiga tabel terpisah — Compression, Tension, Lateral (kolom: No., combo, V_max, tiang, koordinat, DCR, check — tanpa Hx/Hz/T) — masing-masing menyorot baris penentunya sendiri. Rumus + substitusi angka juga per cek, dari combo penentu cek itu.
  - Diuji headless Edge: angka per tiang cocok dengan rumus tangan independen (selisih ≤ 0,06 dari pembulatan).
  - Tombol "Set Bf × Lf from the piles" (grup Pile Cap Geometry): Bf = 2·(|x| terbesar + e), Lf = 2·(|y| terbesar + e), dibulatkan naik ke 50 mm, ditulis ke Tab 02. e = isian "Fit cap size" (×D atau mm); bila kosong memakai batas warning jarak tepi; bila keduanya kosong tombol menolak (tidak ada angka bawaan). Data bawaan tiang diubah atas permintaan user menjadi ±0,6 m (2×2, spasi 1,2 m = 3D; generator grid juga 1,2 m) — pada cap bawaan 2,4 m jarak tepi 0,6 m (1,5D).
  - Diagram denah (`js/diagrams/pileDiagram.js`, didesain ulang): cap Bf×Lf dari Tab 02, tiang diameter sebenarnya dengan nomor di dalam dan gaya di samping kanan; penggaris koordinat x (atas) dan y (kiri) dengan garis bantu titik-titik; dimensi s dan e digambar di margin luar; penanda CG dan titik kerja. Warna tiang (kombinasi penentu): **biru** = tekan, **kuning** = tarik (uplift) dalam kapasitas, **merah** = ada cek yang UC > 1 (aksial terhadap Qc·Eg / Qt·Eg, atau lateral tiang itu termasuk torsi); tooltip per tiang menampilkan F dan UC; legenda di bawah gambar (kelas CSS `pile-compression` / `pile-uplift` / `pile-fail`; `pile-tension` tetap dipakai diagram angkur). Tiga tombol di panel input "Diagram Display" (`pf-show-coords`, `pf-show-dims`, `pf-show-marks`) menampilkan atau menyembunyikan masing-masing; berlaku juga di laporan cetak.

## 3. Struktur Section yang Sudah Didesain
1. General input (termasuk tipe equipment — akan menentukan check mana yang relevan)
2. Loading data (beban superstruktur/equipment)
3. Foundation sizing
4. Stability check
5. Settlement check
6. Pedestal check and reinforcement
7. Footing check and reinforcement

## 4. Dependency Penting
- **Circular dependency**: Foundation sizing (section 3) butuh loading data, tapi dead load dari fondasi sendiri baru bisa dihitung setelah dimensi fondasi ditentukan → perlu ITERASI.
- **Section 4-7 bukan langkah linear independen** — mereka adalah loop validasi:
  sizing → run check 4-7 → kalau ada yang fail → revisi dimensi → ulang check 4-7 → sampai semua PASS.
- Solusi: sizing punya iterasi internal (trial dimension → hitung berat sendiri → cek ulang → adjust) idealnya otomatis di kode, bukan manual oleh user.

## 5. Kategorisasi Equipment (mempengaruhi rumus/check)
| Kategori | Contoh | Check khusus |
|---|---|---|
| Static | Vessel, tank, heat exchanger | DL, LL, wind, seismic (standar) |
| Rotating/vibrating | Pompa, kompresor, turbin, motor | + Dynamic/vibration check, fatigue |
| Reciprocating | Kompresor piston, diesel engine | + Dynamic unbalanced force, sering butuh block foundation massive |
| Piping support/rack | Pipe rack | Thermal expansion load, support spacing |
| Skid-mounted | Package unit | Beban terpusat di anchor bolt |

Rencana: mulai dari kategori **static equipment** dulu untuk validasi library, baru ekspansi ke rotating/reciprocating sebagai modul tambahan.

## 6. Rencana Fitur AI Assistant (fase berikutnya, BELUM dikerjakan)
- **Peran AI**: input parser / data extractor saja — BUKAN untuk kalkulasi.
- User bisa isi form manual (override) ATAU input via chat/foto ke AI.
- AI mengekstrak data mentah (teks bebas / foto uji sondir / boring log) → JSON terstruktur → auto-fill form.
- Field yang di-auto-fill AI di-highlight, user tetap harus verifikasi sebelum klik "Hitung".
- Kalkulasi inti (bearing capacity, sizing, dll) tetap rumus manual deterministik di kode, tidak pernah diserahkan ke AI, karena menyangkut keselamatan struktur.

## 7. Prioritas Kerja yang Disepakati
1. ✅ Ekstrak rumus dari UI yang sudah ada → jadi pure functions terpisah di `lib/foundation/shared/`
   (`bearingCapacity`, `static/foundationSizing`, `stabilityCheck`, `settlementCheck`, `pedestalCheck`, `footingCheck`, dll.)
2. ✅ Validasi tiap fungsi dengan hand-calculation (`lib/foundation/validation/`).
3. ✅ Wire ulang UI existing ke fungsi-fungsi yang sudah tervalidasi (fungsi `calc*()` di `js/tabs/` memanggil `lib/`).
4. ✅ Rapikan struktur file UI (pecah HTML/CSS/JS, JS per tab) — 25 Sep 2026.
5. ⏳ Tambahkan fitur AI assistant (parsing/extraction) di atas library yang solid — lihat `AI_ASSISTANT_PLAN.md`.

## 8. Aturan Kerja
- JANGAN otak-atik kode existing tanpa izin eksplisit user.
- Standar acuan resmi: ACI 318M-19 / ASCE 7-22 (pengganti ASCE 7-16 — berlaku global untuk UI, library, dan laporan).
- Jika perlu detail teknis lain (metode bearing capacity, code/standar acuan seperti API/ASCE/ACI 318) → tanya user dulu.
- File ini hanya untuk konteks, bukan untuk dieksekusi.

## 9. UX Journey — Structural Engineer (disimpan 18 Sep 2026)
Acuan standar header: ACI 318M-19 / ASCE 7-22. Switcher satuan: Metric/Imperial.

### 9.1 Inisiasi Proyek & Konfigurasi Parameter Dasar (Project Onboarding)
- Start: User membuka web app, disambut header ringkas (acuan standar ACI 318M-19 / ASCE 7-22 + tombol switcher satuan Metric/Imperial).
- Setup Equipment (Tab 00): User memilih jenis peralatan via kartu visual (misal: Horizontal Vessel).
- Dynamic Adaptation: Sistem otomatis menyesuaikan daftar tab di sidebar, menyembunyikan parameter tidak relevan, menampilkan parameter khusus (misal jarak saddle).

### 9.2 Pengisian Data Input (Smart Data Entry)
- Opsi A – Manual Input: bertahap via tab General Data, Dimension, Loading Data, Soil Bearing Capacity. Validasi batas (boundary check) di background cegah typo (misal angka negatif).
- Opsi B – Smart Input via AI (Shortcut):
  - User klik "Smart Fill via AI" lalu upload PDF (Boring Log / Uji Sondir) atau teks bebas.
  - Modal AI parsing dan auto-fill form.
  - Field auto-fill berubah warna Kuning Muda (Human-in-the-Loop review).
  - User cek dan konfirmasi angka sebelum eksekusi.
- Peran AI hanya input parser / data extractor — BUKAN kalkulasi (lihat §6).

### 9.3 Evaluasi Real-Time & Auto-Sizing (Interactive Review)
- Real-time Feedback: saat user mengetik/ubah dimensi di Tab 02 (Foundation Dimension), panel kanan instant update diagram 2D/3D + indikator Unity Check / D/C Ratio (Hijau/Kuning/Merah).
- Handling Design Failure:
  - Jika cek gagal (misal Overturning SF < 1.5 atau Punching Shear FAIL), banner kanan atas merah: "DESIGN FAILED".
  - Muncul tombol aksi "Auto-Size Foundation".
  - Klik → solver engine loop iterasi internal di background, update dimensi B x L x H ke ukuran aman terkecil.
  - Status berubah menjadi "ALL CHECKS PASSED".
- Ketergantungan iterasi self-weight (sizing butuh loading, dead load fondasi baru diketahui setelah dimensi) diselesaikan otomatis di kode (lihat §4).

### 9.4 Detail Penulangan & Cek Spesifik (Structural Refinement)
- Refinement (Tab 04–10): User ke tab Pedestal & Footing Rebar untuk atur diameter dan jarak tulangan utama + sengkang.
- Visual Rebar Checking: diagram potongan melintang 2D untuk pastikan spacing praktis dikerjakan di lapangan.

### 9.5 Finalisasi & Ekspor Laporan (Reporting & Export)
- Sanity Check: review akhir ringkasan Unity Check Table di panel kanan.
- One-Click Export: klik "Export Calculation Sheet".
- Output: regenerasi seluruh data jadi PDF formal siap cetak berisi Cover, Parameter Input, Formula Breakdown, Tabel Kombinasi Beban ASD/LRFD, status PASS/FAIL untuk submit ke client/checker.

## 10. Struktur File (setelah refactor 25 Sep 2026)
Pembagian tugas:
- **`lib/`** = menghitung + mengekstrak data. Pure, tanpa DOM, bisa dites di Node. Semua rumus di sini.
- **`js/`** = menampilkan + menghubungkan ke UI (menyentuh DOM). Tidak boleh berisi rumus.
- `js/` boleh import `lib/`; `lib/` tidak pernah import `js/`.

Mau ubah apa → buka file mana: lihat `PROJECT_MAP.md`. Aturan edit UI (modul hanya deklarasi, state lewat `state.x`, naikkan `?v=`): lihat `js/README.md`. Kedua file itu satu-satunya sumber rincian, supaya tidak ada dua versi yang bisa berbeda.

## 11. Item Terbuka (belum dikerjakan)
- ⏳ **Cap / footing oktagon — untuk vertical vessel (ditunda, keputusan user 26 Sep 2026)**: aplikasi sekarang hanya mengenal cap persegi panjang B<sub>f</sub> × L<sub>f</sub> berpusat di (0, 0). Rencana: pilihan bentuk Rectangular / Octagonal di Tab 02 (input: beraturan W, atau B × L dengan potongan sudut 45° kaki c — belum diputuskan). Jarak tepi tiang: e<sub>i</sub> = min(B/2 − |x|, L/2 − |z|, (B/2 + L/2 − c − |x| − |z|)/√2); oktagon beraturan: e<sub>i</sub> = W/2 − max(|x|, |z|, (|x| + |z|)/√2), c ≈ 0,293W. Contoh W 2,4 m, tiang (0,6; 0,6): 0,351 m (persegi: 0,600 m — rumus persegi tidak konservatif). Yang ikut berubah: luas/berat (A = B·L − 2c²), diagram 02/4B, pedestal di dalam cap, lebar penampang kritis 5B, tekanan tanah 4A.
- ✅ ~~Bug lama: "Generate combos" Pipe Rack / Vessel / Tank error bila D/L sudah dihapus dari Load Types~~ — diperbaiki 25 Sep 2026: ketiga handler di `js/app.js` kini memanggil `ensureLoadType('D')` dan `ensureLoadType('L')` sebelum menulis ke `lc-D-*` / `lc-L-*`. Belum diuji klik di browser.
- ✅ 5B Pile Cap flexure sudah dipindah ke `evaluatePileGroupCombo` (25 Sep 2026) lewat helper bersama `pileComboLoads()` di `js/tabs/pile.js`; bidang kritis diukur dari pusat pedestal (Off X). Wiring diverifikasi headless terhadap hitung tangan.
- ✅ **Bug satuan 5B diperbaiki (25 Sep 2026)**: sebelumnya `xCrit = Bp / 2` memakai `rb-Bp` dalam mm sedangkan koordinat tiang dalam m, lalu M_u dibagi 1000 lagi → M_u = 0 untuk semua combo dan tulangan pile cap selalu A_s,min. Sekarang `xCrit = Bp/2/1000` (m) dan M_u langsung kN·m. Cek: 2 tiang F = 1.038,4 kN, lengan 0,8 m → M_u = 1.661,5 kN·m (A_s 12.283 mm² vs A_s,min 3.200 mm²). **Hasil 5B lama yang pernah dipakai/di-submit tidak valid dan perlu dihitung ulang.**
- ✅ **Combo LRFD terpisah untuk pile cap (25 Sep 2026)**: `buildLrfdCombos(SDS)` (LC201–227, ASCE 7-22 §2.3.1/§2.3.6, Ev = 0,2·SDS·D, ortogonal 100/30, ρ = 1, L = 1 di combo angin/gempa), tabel bisa diedit lewat "Edit LRFD Combinations" (`comboState.lrfd`). Dipakai hanya oleh 5B: lentur (M_u terfaktor) dan geser satu arah + punching dengan V_u dari reaksi tiang (`oneWayPileShear`, `punchingPileShear`, interpolasi d_p/2; validasi part9, 58 cek). V_u bisa "Manual" atau "From pile reactions (LRFD)". Tab 4B tetap ASD.
- ✅ **Visualisasi penulangan 5A dan 5B (26 Sep 2026, permintaan user)** — `js/diagrams/rebarDiagram.js` (SVG murni): `pedestalSectionSVG` (5A: penampang pedestal Bp × Lp dengan n batang per muka, d′, spasi c/c, jadwal batang, Ast, ρ, dan cek jarak bersih ≥ max(1,5·db, 40 mm) — ACI 318M-19 §25.2.3), `pileCapRebarPlanSVG` (5B: denah cap dengan tiang, pedestal, dan mat tulangan bawah/atas arah x dan y; mat atas digeser 3,5 px agar terlihat) dan `pileCapRebarSectionSVG` (5B: potongan dengan lapisan luar arah x = garis, lapisan dalam arah y = titik, tebal, selimut, pedestal, kepala tiang, legenda). Gambar hanya menampilkan lapisan yang punya desain valid. Cek jarak bersih tulangan (pedestal §25.2.3; pile cap ≥ max(25 mm, db) — §25.2.1) muncul sebagai notifikasi di panel Design Status untuk cek "Pedestal & Rebar" (`lastResults.pedestalRebar.notices` / `pileCapRebar.notices`). Catatan: jumlah tulangan pile cap tetap satu lapis di seluruh lebar (spasi = b/(n+1)); jarak bersih di bawah batas berarti perlu bar lebih besar atau dua lapis.
- ✅ **Section 03 memuat LRFD (25 Sep 2026, permintaan user)**: input — tombol "Edit Load Combinations (ASD)" dan "(LRFD)" (`.lrfd-open-btn` membuka popup LRFD yang sama dengan 5B). Preview — 3.2.1 ASD (Table 3.2.1) dan 3.2.2 LRFD (Table 3.2.2 + blok "LRFD factors" dengan faktor S_DS-dependent (1,2 + 0,2·SDS) dan (0,9 − 0,2·SDS) dievaluasi, dan peringatan "out of date" bila S_DS berubah); 3.3.1 puncak pedestal (ASD, baut angkur), 3.3.2 dasar footing (ASD, stabilitas), **3.3.3 dasar pedestal (LRFD, untuk 5A; memuat H·Hp dan berat pedestal)**, **3.3.4 dasar footing (LRFD, untuk 5B)**. Tabel ikut diperbarui saat faktor LRFD diedit (`recalcPileCap` memanggil `renderLcSummary`) dan masuk ke laporan cetak. Diverifikasi terhadap hitung tangan (LC208: dasar footing P = 1.020,06, Mz = 327,5; dasar pedestal P = 929,53, Mz = 287,5). **Belum**: tabel "puncak pedestal (LRFD)" dan Tab 09 (baut angkur) masih memakai beban ASD di puncak pedestal padahal ACI 318 Ch.17 membandingkan φN dengan beban terfaktor — perlu keputusan user.
- ✅ **5A pedestal: beban LRFD di dasar pedestal (25 Sep 2026, keputusan user)**: sebelumnya 5A membandingkan φMn dengan beban **ASD** dan momen di **puncak** pedestal (tanpa H × tinggi pedestal, tanpa berat pedestal) — tidak konservatif (perkiraan 1,4–1,6×). Sekarang: combo LRFD (`comboState.lrfd`); `buildPedestalComboBase()` (combos.js) memakai dh = tinggi pedestal Hp dan dW = berat pedestal (beton + grout, kN) dari Tab 02 (`state.pedHp`, `state.pedW`, diisi `calcFoundSize()`), sehingga Mx/Mz di dasar pedestal sudah memuat H·Hp dan P memuat berat pedestal × faktor D combo tsb; Mu = √(Mx²+Mz²). Diverifikasi terhadap hitung tangan (D = 1000, Wped = 21,12, Hp = 1,1, WX H = 100 / M = 200: LC201 Pu = 1.429,57; LC206 Pu = 1.225,34, Mz = 310; LC208 Pu = 919,01, Mz = 310). Tanpa pedestal di Tab 02 (cap only) Hp = 0 dan W = 0. **Hasil 5A lama tidak valid dan perlu dihitung ulang.** Belum ada: desain geser dan sengkang pedestal, biaksial terpisah (Mx dan Mz), preview 5A/5B dengan pola bab.
- ✅ **Ukuran pedestal disatukan (25 Sep 2026)**: Tab 02 (Bp×Lp, m) jadi satu-satunya sumber. `calcFoundSize()` menyalin ke `rb-Bp`/`rb-Lp` (5A, lentur, geser satu arah) dan `tw-c1`/`tw-c2` (punching) dalam mm, field dikunci (read-only). Bila Tab 02 tanpa pedestal (cap only) field tetap bisa diedit sebagai ukuran kolom / base plate. Lebar cap `rb-Lcap` (= Lf) dan `rb-Bcap` (= Bf) juga cermin read-only dari Tab 02.
- ✅ **Lentur pile cap dua arah + tulangan atas (25 Sep 2026)**: `calcPileCapFlexure()` di `js/tabs/rebar.js` mendesain arah x dan y, muka bawah dan atas, dari reaksi tiang LRFD; `pileCapMomentAxis()` di lib (validasi part10, 25 cek). Momen neto > 0 → tulangan bawah; < 0 → tulangan atas (uplift), hanya didesain bila ada momen negatif. Arah x = lapisan luar (d), arah y = lapisan dalam (d − db). Diverifikasi independen (M_u 529,5 / 132,0 / 376,7 / 173,2 kN·m).
- ✅ **Ketebalan cap disatukan (25 Sep 2026, atas persetujuan user)**: Tab 02 `fs-Hf` (m) jadi satu-satunya sumber; `rb-t` (lentur), `ow-h` (geser satu arah), `tw-h` (punching) dan `pf-t` (4B, sebelumnya input yang tidak dipakai) adalah cermin read-only. Nilai bawaan lama 800 / 500 / 500 mm diganti mengikuti Hf = 0,4 m, sehingga hasil geser dan lentur 5B berubah (default: d = 341 mm, UC geser satu arah 0,924). Bila cap bawaan terasa tipis, ubah Hf di Tab 02.
- **Batasan 5B**: berat sendiri cap tidak dikurangkan, tulangan atas minimum untuk detailing tidak ditambahkan, jumlah tulangan dihitung satu lapis di seluruh lebar cap, momen tak-seimbang pada punching (γv·Mu·c/Jc) tidak dihitung, bw satu arah harus sama dengan lebar cap (ada warning).
- **Offset pedestal (OffX/OffZ) belum masuk ke 4A** (fondasi dangkal): momen P·offset belum dihitung di stabilitas shallow; di Tab 4B sudah.
- ✅ **Generator Pipe Rack/Vessel/Tank diselaraskan (25 Sep 2026, keputusan user)**: nilai angin yang diisi di helper adalah **level kekuatan** (sama dengan Wind Generator), sehingga semua combo ASD memakai **0,6W** (mis. 0,6D + 0,6W untuk uplift); E tetap 0,7E. Label helper ditandai "strength level" dan nama combo memuat faktornya.
- **Keputusan faktor LRFD (25 Sep 2026, user)**: L = 1,0 di combo angin/gempa (tetap), angin kondisi Test = 1,0W tanpa reduksi (konservatif), ρ = 1,0 (belum ditanyakan; editable di tabel). Semua faktor bisa diedit di "Edit LRFD Combinations".
- **Tabel p-multiplier**: nilai AASHTO 10.7.2.4-1 (3D 0,8/0,4/0,3; 5D 1,0/0,85/0,7) masih dari ingatan dan **belum diverifikasi**. Ditambahkan isian "Source of this table" (`pf-pm-src`) yang tercetak di caption preview; sampai diisi, tertulis "verify against the edition / project spec". Isi dengan edisi / dokumen proyek yang dipakai.
- **Nama dan label Wind Generator masih "ASCE 7-16"** (`windForceASCE716`, judul popup) padahal standar proyek ASCE 7-22. Persamaan q_z, faktor K_d dan K_e menurut edisi 22 perlu dicek user sebelum angka angin dipakai untuk submit.
- **Belum diuji visual**: cetak/PDF Tab 4B (tabel semua combo cukup lebar) dan tampilan di layar sempit.
- **OCR load combination**: baris yang isinya hanya angka (mis. `201 1.2 1.6 1.2 0.5`) kehilangan nomor LC-nya; faktor tetap benar. Paste dari Excel tidak terpengaruh.
- **Bersih-bersih**: `dlWorksheetTotal()` tidak terpakai; 239 atribut `style=""` inline di HTML bisa dipindah ke class CSS.
- **Belum diuji manual setelah refactor**: OCR dengan gambar asli dan upload logo di report builder.
- ✅ **Bug satuan baut angkur (Tab 09) diperbaiki (26 Sep 2026, persetujuan user)**: koordinat baut diinput dalam mm, tetapi `evaluateAnchorCombo()` membagi momen dengan koordinat dalam m (F = P/n + M·dx/Σdx²) → suku momen 1000× terlalu kecil, tarik baut akibat momen praktis diabaikan. Sekarang `anchor.js` mengonversi mm → m sebelum memanggil library dan mengembalikan posisi ke mm untuk tabel/gambar. Hand-calc: 4 baut ±150 mm, M = 54 kN·m → T = 90 kN (sebelumnya 0,09). Data bawaan: UC 0,090 (geser) → **0,681 (tarik)**. Vector baru di validation part3. **Hasil Tab 09 lama tidak valid, hitung ulang.**
- ✅ **Tab 09 baut angkur memakai LRFD (26 Sep 2026, persetujuan user)**: combo LC201–227 (`comboState.lrfd`) di **puncak pedestal** (tanpa transfer H·h / berat), vektor biaksial yang sama dengan Section 03; H = √(Fx²+Fz²), M = √(Mx²+Mz²) dipakai sebagai satu arah pada grup baut. Section 03 menambah **3.3.3 Load at top of pedestal (LRFD)** (3.3.4 dasar pedestal, 3.3.5 dasar footing). `calcAnchor` ikut `recalcAll` dan edit tabel LRFD. Verifikasi: LC208 (0,9D + 1,0WX) M = 90 kN·m → T = 150 kN (hand = aplikasi), UC 150/156 = 0,962. Data bawaan: UC 0,681 (ASD) → **0,962 (LRFD)**. Pembagian: set 1xx (ASD) = 4A, 4B, daya dukung; set 2xx (LRFD) = 5A, 5B, 09.
- ✅ **Sumbu diseragamkan (26 Sep 2026, keputusan user)**: sumbu horizontal = **x dan z**, sumbu vertikal = y — di semua label, tabel, rumus, diagram, dan pesan (4B, 5A, 5B, 09, input). Nama field di kode tetap `y` untuk koordinat denah tiang/baut (`{x, y}` = plan x, z; lihat komentar di `pileGroup.js`) — hanya tampilan yang diubah, tidak ada angka yang berubah. Sumbu "y" yang masih tampil hanya sumbu vertikal pada potongan Tab 02.
- ✅ **Cek geometri Tab 02 (26 Sep 2026)**: `foundationGeometryCheck()` (lib/static/foundationSizing.js, validasi part12, 15 cek) — ukuran > 0, Df ≥ Hf, pedestal + offset di dalam footing/cap pada kedua arah (tepi rata diizinkan), panjang tiang tertanam h < Hf. Masalah tampil sebagai kotak merah di preview Tab 02 dan membuat langkah 02 FAIL (Design Status / readiness). Tidak ada nilai yang dikoreksi otomatis.
- ✅ **Preview & diagram Tab 02 (26 Sep 2026)**: pola bab "02. Foundation Dimension" → 2.1 Foundation Layout (diagram), 2.2 Footing / Pile Cap (Table 2.2.1), 2.3 Pedestal (Table 2.3.1, hanya bila ada pedestal). Diagram (`foundSizeDiagram.js`): tiang digambar di denah (garis putus-putus, diameter asli dari `pf-dia`, bernomor seperti 4B; ubah D di 4B langsung refresh Tab 02); potongan menampilkan jumlah tiang yang bertumpuk di x yang sama ("×2"); label Bp/Lp di luar footing dengan garis bantu, Lf/Lp/Df diputar vertikal, bracket Df digeser keluar dari bracket Gp/Dp, label "Ground" di atas garis tanah pada sisi yang kosong, catatan offset pedestal di bawah denah. Hanya tampilan — tidak ada angka yang berubah (validasi 12 file PASS).
- ✅ **Auto Fill Tab 02 (26 Sep 2026)**: `parseFoundationDimText()` (lib/import/textParsers.js, validasi part7 +28 cek) membaca label (Bf, Lf, Hf, Df/depth, Bp, Lp, Gp, Off X/Off Z, grout, embedment) dan grup ukuran ("footing/pile cap a x b x c", "pedestal a x b"), plus kata kunci pile/shallow dan pedestal/"footing only"/"no pedestal". Lib mengembalikan nilai + satuan mentah; konversi ke satuan field di UI (`js/ocr/review.js`): mm/cm/m, tanpa satuan = m (mm bila ≥ 50), grout dalam mm. Nilai pertama dipakai; nilai berbeda untuk field yang sama dilaporkan. Alur: tempel teks atau unggah gambar (OCR Tesseract; PDF belum) → "Read & Review" → tabel Field / New / Now → "Apply to form" → field terisi disorot kuning sampai diedit user. Input lean concrete tetap dipertahankan (akan dipakai untuk grouting, keputusan user).
- ✅ **Input tersembunyi block projection dihapus (26 Sep 2026)**: `fs-block-fields` / `fs-block-Gp` (HTML) dan baris penyembunyinya di `calcFoundSize()`. Sudah tidak dipakai sejak mode "Only" memakai H<sub>f</sub> + urugan. Parameter `blockGp` di `foundationSizing()` (lib) dibiarkan (selalu 0, tidak ada rumus yang berubah). Section 2 selesai.
- ✅ **Footing / pile cap "Only" boleh menonjol di atas tanah (26 Sep 2026, keputusan user)**: syarat satu-satunya dasar tidak melayang (D<sub>f</sub> ≥ 0; D<sub>f</sub> = 0 = duduk di muka tanah). Bila H<sub>f</sub> > D<sub>f</sub>: G<sub>p</sub> = H<sub>f</sub> − D<sub>f</sub> di atas tanah, tanpa urugan (W<sub>soil</sub> = 0), W<sub>F</sub> = H<sub>f</sub>·A<sub>f</sub>·γ<sub>C</sub>, Δh = H<sub>f,tot</sub> tetap. Mode dengan pedestal tetap D<sub>f</sub> ≥ H<sub>f</sub>. Lib: `foundationSizing()` + `foundationGeometryCheck()`; validasi part5 +13, part12 +3 (hand-calc 2×2×0,8, D<sub>f</sub> 0,5: G<sub>p</sub> 0,3, W 7,68 t; + grout 25 mm: 7,92 t). Sebelumnya kasus ini ditolak (invalid), jadi tidak ada hasil lama yang berubah. Tab 02 menampilkan baris "Projection above ground, G<sub>p</sub>" dan diagram menggambar bagian di atas tanah.
- ↩ Percobaan memakai aturan yang sama untuk mode dengan pedestal (commit `58562e9`) **dibatalkan atas permintaan user** (`67c45d6`): dengan pedestal tetap D<sub>f</sub> ≥ H<sub>f</sub>. Yang dipertahankan: Design Status langkah 02 kini memakai aturan per mode (dengan pedestal D<sub>f</sub> ≥ H<sub>f</sub>, tanpa pedestal D<sub>f</sub> ≥ 0) — sebelumnya FAIL palsu untuk mode "Only" yang menonjol.
- ✅ **Warning mode "Only" tidak menonjol (26 Sep 2026, keputusan user)**: tanpa pedestal, puncak footing / pile cap diharapkan di atas tanah. Bila H<sub>f</sub> − D<sub>f</sub> ≤ 0 (rata atau di bawah tanah), `foundationGeometryCheck()` mengembalikan `warnings` (kode `notAboveGrade`) — tidak menggagalkan geometri (langkah 02 tetap PASS). Ditampilkan di panel kanan "Notices" (sumber: Foundation Dimension) lewat `lastResults.foundsize.notices`. Berlaku untuk Footing Only dan Pile Cap Only; mode dengan pedestal tidak diberi warning. Validasi part12 +5.
- ✅ **Bug q<sub>a</sub> memakai footing yang berbeda — diperbaiki (26 Sep 2026)**: Tab 08 (dan lewat itu 4A serta Table 1.3.1) memakai input B/L/D<sub>f</sub>/bentuk miliknya sendiri (default 2,0 × 3,0, D<sub>f</sub> 1,5, persegi panjang), bukan footing Tab 02. Sekarang `calcFoundSize()` menyalin B = min(B<sub>f</sub>, L<sub>f</sub>), L = max, D<sub>f</sub> dan bentuk (square bila B<sub>f</sub> = L<sub>f</sub>, selain itu rectangular) ke `bc-B/bc-L/bc-Df/bc-shape` — read-only / tombol bentuk nonaktif. `recalcAll()` kini juga menjalankan `calcBearing()` dan `renderGeneralSummary()`. Rumus tidak berubah. Default: q<sub>a</sub> 453,38 → **409,43 kPa** (hand-calc Terzaghi general, φ 30°: q<sub>u</sub> = 483,60 + 404,28 + 340,42 = 1228,30; validasi part1 +2). Hasil 4A lama yang dihitung dengan geometri Tab 08 yang berbeda dari Tab 02 perlu dihitung ulang. Temuan terpisah (belum diperbaiki): label sudut geser di Tab 08 tertulis π (U+03C0), seharusnya φ.
- ✅ **Preview 4A memakai pola bab (26 Sep 2026)**: "04. Foundation Stability" → 4.1 Governing Load Combination (diagram + Table 4.1.1/4.1.2), 4.2 Eccentricity (Kern) Check, 4.3 Bearing Pressure Check, 4.4 Sliding Check, 4.5 Overturning Check (rumus jadi kalimat pengantar subbab), caption bernomor via `numberTables(html, '4')`. Kotak verdict dihapus (status di Design Status). Kombinasi yang tidak bisa dievaluasi lib (P ≤ 0 atau e > B/2) → pemberitahuan di panel kanan (`lastResults.foundation.notices`, SRC '4A' di status.js), barisnya di tabel memuat alasannya + status NG (sebelumnya jumlah kolom salah); 4.1 menampilkan kombinasi valid terburuk. Istilah diseragamkan: OK/NG, kolom "Combination". Teks Limitation dikoreksi (kern & guling sudah biaksial). **Bug diperbaiki**: kombinasi tidak valid membuat status 4A = ERROR → tampil PENDING di Design Status; sekarang FAIL, metric "UC = ∞ (base separation)". Rumus tidak berubah. Temuan (belum diubah): 4.1 memilih kombinasi penentu dari cek uniaksial (105, UC eksentrisitas 1,872) sedangkan tabel kern biaksial 4.2 penentunya 111 (UC 1,953).
- ✅ **4B tampilan & pilihan efisiensi grup (26–27 Sep 2026, permintaan user)**: Table 4.1.1 — baris "Recommended spacing" dan "Pile centres inside the cap" dihapus (statusnya sudah tercermin di baris spasi = WARNING dan jarak tepi = FAIL; nilai rekomendasi ditulis di kolom Limit), kolom Actual dipecah jadi Actual (m) / Actual / D / Pile, kolom Expression hanya rumus (min √(Δx² + Δz²); min[B<sub>f</sub>/2 − |x|, L<sub>f</sub>/2 − |z|]). Centang baru **"Apply group efficiency"** (`pf-eff-on`, default aktif): mati → `pileGroupEfficiency({ apply: false })` mengembalikan E<sub>g</sub> = 1, method `off` (validasi part8 +4), subbab 4.2 tidak tampil, input efisiensi lain dinonaktifkan, intro DCR menyebut E<sub>g</sub> = 1. Contoh default: aktif P<sub>all,g</sub> = 0,7952 × 800 = 636,1 kN; mati 800 kN. Import `shared/pileGroup.js` di index.js kini ber-`?v=`.
- ✅ **4B: subbab "Design Loads and Pile Forces" dihapus (27 Sep 2026, permintaan user)**: subbab itu hanya menjabarkan satu kombinasi (DCR keseluruhan terbesar), padahal tekan, tarik dan lateral punya kombinasi penentu masing-masing — membingungkan checker. Penentu per cek tetap di tabel DCR dan di "Calculation Formulas" (substitusi per cek). Hitungan tidak berubah.
- ✅ **Ukuran beton di sekitar baut angkur (Tab 09) dari Tab 02 (26 Sep 2026)**: `ab-Bp` / `ab-Lp` sebelumnya input terpisah (bawaan 800 mm) yang tidak terhubung ke Tab 02 (pedestal 1,25 m) — padahal menentukan jarak tepi c_a1 dan kapasitas breakout geser. Sekarang cermin read-only: pedestal (Bp × Lp) bila ada; bila cap/footing only, ukuran cap (Bf × Lf). Data bawaan: c_a1 250 → 475 mm, UC tetap 0,962 (tarik baut menentukan); Bp 0,4 m → c_a1 50 mm, φVn 114,3 → 70,5 kN, penentu berpindah ke interaksi (UC 0,979).
- ✅ **Preview 5A, 5B, 09 memakai pola bab (26 Sep 2026)**: helper bersama di `js/core/worksheet.js` — `chapterHeader()`, `sectionHeader()`, `numberTables(html, prefix)` (caption → "Table <subbab>.<n>."). 5A: "5A. Pedestal Check" → 5A.1 Design Loads, 5A.2 P-M Interaction, 5A.3 Reinforcement. 5B: "5B. Pile Cap Check" → 5B.1 One-Way Shear (calc-oneway), 5B.2 Punching Shear (calc-twoway), 5B.3 Pile Cap Flexure (calc-rebarcap). 09: "09. Anchor Bolt Design" → 9.1 Bolt Layout, 9.2 Anchor Capacity, 9.3 Bolt Forces and Checks. Kotak verdict dihapus (status di Live Design). Notifikasi non-blok (metode geser disederhanakan tidak diizinkan, b_w ≠ lebar cap) dipindah ke panel kanan lewat `lastResults.oneway/twoway/anchor.notices`; panel kini juga refresh setelah klik tombol radio. Kotak merah yang menghalangi hasil tetap di preview.
- ✅ **Punching 5B dengan momen tak-seimbang (26 Sep 2026, keputusan user)**: `eccentricPunchingStress()` (footingCheck.js, validasi part11) — ACI 318M-19 §8.4.4.2, pedestal interior, suku Mx dan Mz dijumlahkan di sudut (konservatif), selalu diterapkan. Mode reaksi tiang: Vu dan momen dari combo LRFD yang sama, momen di dasar pedestal (tabel 3.3.4, termasuk H·Hp); combo penentu = v_u terbesar. Mode manual: input baru `tw-muz` / `tw-mux`. UC = v_u / (φ·v_c). Lokasi edge/corner → ERROR (belum diimplementasi). Hand-calc: 500×500, d 400, Vu 500, Muz 100 → 0,435 MPa (aplikasi 0,435). Saran pengurangan tebal disembunyikan bila ada momen (pencarian h mengabaikan suku momen).
- ✅ Git aktif sejak 26 Sep 2026 (branch `main`, commit awal `44b81b7`). Git for Windows di `C:\Program Files\Git`; `.claude/` diabaikan lewat `.gitignore`.

## 12. Catatan Sesi 25 Sep 2026 — keputusan & langkah berikutnya
**Keputusan user (jangan diulang tanya):**
- Tab 4B pile: koordinat tiang berorigin di **pusat pile cap**; torsi lateral berasal dari eksentrisitas konfigurasi tiang (sentroid) terhadap titik kerja gaya (pusat pedestal); **tidak ada** eksentrisitas pemasangan tiang; tidak ada torsi vertikal (M_t) di UI.
- Batas spasi c/c dan jarak tepi **berbeda per proyek** → input, bukan angka baku di kode. Kosong = NOT SET (bukan PASS). Contoh proyek ini: spasi minimum 2D (FAIL di bawahnya), warning bila < 3D; jarak tepi hanya warning bila < 1D.
- Efisiensi grup Converse–Labarre hanya untuk Qc dan Qt; lateral memakai p-multiplier (default baris penentu, opsi rata-rata). Kapasitas tiang = nilai izin **tiang tunggal**. Bagian "Axial Group Efficiency" di preview **hanya tampil bila reduksi dikenakan** (spasi < ambang "no reduction", atau Eg manual < 1) atau Eg tidak bisa ditentukan (tabel menjelaskan alasannya); pada spasi ≥ ambang, end-bearing, tiang tunggal, atau Eg manual = 1 bagian itu disembunyikan dan Qc/Qt penuh dipakai (permintaan user).
- Combo pile 4B = **ASD**, tanpa kenaikan kapasitas untuk angin/gempa (ASCE 7-22 §2.4.1 ASD sudah memuat 0,6W/0,7E).
- 5B pile cap (lentur + geser satu arah + punching) memakai **combo LRFD terpisah** (LC201–227, otomatis dari ASCE 7-22, bisa diedit).
- Bug satuan 5B diperbaiki atas persetujuan user.

**Langkah berikutnya (usulan urutan):**
1. ✅ Satukan input ukuran pedestal (selesai).
2. ✅ Lentur pile cap arah y dan tulangan atas untuk uplift (selesai). Ketebalan cap juga sudah disatukan (Tab 02 Hf).
3. Offset pedestal (P·e) untuk 4A fondasi dangkal.
4. ✅ Faktor W di generator (diselaraskan ke 0,6W).
5. Isi sumber tabel p-multiplier; cek nomor pasal ACI untuk interpolasi reaksi tiang d_p/2; cek persamaan angin ASCE 7-22 (K_d, K_e) di Wind Generator.
6. Uji visual cetak/PDF Tab 4B dan 5B; lalu bug OCR nomor LC dan `git init`.

**Cara verifikasi yang dipakai:** validasi `lib/` part1–11 (semua PASS) + uji headless Edge (server statis + CDP) dengan pembanding hitung tangan independen untuk gaya per tiang, M_u, dan V_u.

---
*Disimpan dari rangkuman diskusi user untuk ditempel ke Claude Code.*
