# Cakupan dan struktur folder

Keputusan 27 Oktober 2026: FAIR Foundation Design khusus perhitungan pondasi. Bagian struktur nonpondasi dipindahkan ke folder proyek terpisah, bukan disembunyikan dalam subfolder repo yang sama.

## FAIR Foundation Design

Folder utama di komputer ini: `E:\KERJA\TOOLS\MASTER CALCULATOR` (dipindahkan dari `E:\MASTER CALCULATOR` pada 27 Oktober 2026). Halaman masuk tetap `index.html`; tidak ada perubahan rumus maupun jalur import aplikasi akibat pemisahan ini.

```text
MASTER CALCULATOR/
├── index.html                 # Halaman aplikasi
├── css/                       # Tampilan aplikasi dan laporan
├── js/                        # Input, diagram, workflow dan laporan pondasi
├── lib/foundation/            # Mesin hitung pondasi, tanah, beban dan import reaksi
│   ├── index.js
│   ├── shared/
│   ├── static/
│   ├── rotating/
│   ├── reciprocating/
│   ├── piperack/
│   ├── skidMounted/
│   ├── import/
│   ├── report/
│   └── validation/
├── tools/
│   ├── fair-run.mjs           # Input .fnd ke perhitungan pondasi
│   ├── staad-stability.mjs    # Reaksi STAAD ke pondasi dangkal
│   ├── staad-pile.mjs         # Reaksi STAAD ke pondasi tiang
│   ├── foundation-drawing.mjs # Gambar pondasi DXF/SVG
│   └── report-output.mjs     # Laporan pondasi HTML/PDF
├── docs/                      # Panduan, contoh dan catatan historis
├── .github/                   # Validasi otomatis pondasi
├── patch.js                  # Pemeliharaan marker SVG
├── AGENTS.md
└── README.md
```

Tetap dalam cakupan: daya dukung, stabilitas, settlement, fondasi dangkal / tiang, pile cap, pedestal dan tulangannya, anchor bolt beserta pengangkurannya, perhitungan beban angin / gempa / equipment untuk pondasi, serta import reaksi STAAD. Kategori pipe rack / skid / rotating adalah kategori **pondasi equipment**, sehingga tetap dipertahankan. Outline kolom baja pada gambar pondasi merupakan konteks gambar, bukan modul desain kolom.

## FAIR Structural Tools

Folder terpisah: `E:\FAIR STRUCTURAL TOOLS`. Tidak berada di dalam repo FAIR Foundation Design.

```text
FAIR STRUCTURAL TOOLS/
├── lib/steel/
│   ├── connection/           # Desain sambungan baja
│   └── validation/           # Validasi baja tersendiri
├── tools/staad/
│   ├── cek/                  # Rasio member dan lendutan STAAD
│   ├── pipesupport/          # Model, kantilever, gambar baja, laporan batch
│   │   ├── templates/
│   │   └── foundation_path.py
│   └── gambar/               # Utility pengukuran PDF
├── .github/                  # Validasi baja dan sintaks Python
└── README.md
```

| Lokasi lama di repo pondasi | Lokasi baru di proyek terpisah |
|---|---|
| `lib/steel/` | `lib/steel/` |
| `tools/staad/cek/` | `tools/staad/cek/` |
| `tools/staad/pipesupport/` | `tools/staad/pipesupport/` |
| `tools/staad/gambar/` | `tools/staad/gambar/` |

Paket batch pipe support tetap mencakup `tipe_pondasi.py`, brief drafter dan laporan gabungan karena bergantung pada konfigurasi serta output pipe support. Mesin perhitungan pondasinya tetap di FAIR Foundation Design; tidak disalin ke proyek struktur.

Untuk menghubungkan batch dengan lokasi pondasi yang berbeda, gunakan `--foundation-root "<folder FAIR Foundation Design>"` pada `jalankan_semua.py` / `tipe_pondasi.py`, atau environment variable `FAIR_FOUNDATION_ROOT`. Default mencari `KERJA/TOOLS/MASTER CALCULATOR` pada drive proyek struktur, lalu repo saudara bernama `MASTER CALCULATOR` atau `fair-foundation-design`. Argumen lokasi diteruskan ke proses jadwal tipe pondasi.

## Pemeliharaan

- Jalankan validasi pondasi dari repo pondasi dan validasi baja dari proyek struktur. Workflow CI pondasi tidak lagi mencari library baja.
- Data client dan hasil kerja tetap di luar source atau dalam `projects/` yang diabaikan Git.
- File `.bak-*` lama ikut dipertahankan di folder struktur secara lokal; tidak menjadi source yang dipublikasikan.
- Catatan penggabungan sebelumnya di `MERGE_2026-10-27.md` adalah riwayat keadaan sebelum pemisahan ini.
- Pemisahan lokal ini tidak membuat repo GitHub baru atau memperbarui website online.

## Verifikasi pemisahan

- 23 file source / template dipindahkan; 21 identik byte per byte. Hanya pencarian lokasi CLI pada dua script integrasi yang disesuaikan. Hash sumber dan tujuan tercatat dalam `SOURCE_MANIFEST.json` di proyek struktur.
- Mesin hitung pondasi, HTML, CSS dan modul UI identik dengan sebelum pemisahan; tidak ada perubahan rumus atau UC.
- Seluruh 45 skrip validasi pondasi lulus, termasuk 22 pemeriksaan report generator tanpa skip; 137 modul JavaScript / MJS lulus parse.
- Proyek struktur: 59 pemeriksaan sambungan baja lulus, 7 modul JavaScript / MJS dan 15 source Python lulus parse. Kedua CLI batch menampilkan opsi `--foundation-root` dengan benar, termasuk saat Python dijalankan dengan `-I`.
- Pencarian lokasi pondasi diuji melalui argumen eksplisit, environment variable, folder saudara dan pesan kegagalan saat lokasi tidak ada.
- STAAD.Pro dan alur laporan Excel tidak dijalankan ulang; perubahan hanya memindahkan source dan memperbarui jalur integrasi.
