# Flowchart FAIR Foundation Design

Dua alur: (1) alur kerja di aplikasi web (urutan tab), (2) alur batch lewat CLI (`fair-run`). Diagram memakai Mermaid, tampil langsung di GitHub; versi gambar: [flowchart-aplikasi.svg](flowchart-aplikasi.svg), [flowchart-cli.svg](flowchart-cli.svg).

Sumber: `docs/PROJECT_INSTRUCTIONS.md` §3, §4, §9; `AGENTS.md` §3, §5, §6; urutan tab di `index.html`.

## 1. Alur kerja di aplikasi

Kartu perangkat (Tab 00) menentukan kategori equipment, dan kategori menentukan check yang tampil. Check 4–7 adalah loop validasi, bukan langkah linear: gagal → revisi dimensi (atau Auto-Size, fondasi dangkal) → hitung ulang sampai semua lolos.

```mermaid
flowchart TD
  A([Mulai: buka aplikasi]) --> B["Tab 00 Equipment Setup<br/>pilih tipe equipment"]
  B --> C{"Kategori<br/>(getCategoryForEquipment)"}
  C -->|static| C1["check dasar:<br/>bearing, stability, settlement,<br/>pedestal, footing"]
  C -->|rotating| C2["dasar + vibration<br/>(mass ratio ≥ 3)"]
  C -->|reciprocating| C3["dasar + dynamic force<br/>(mass ratio ≥ 5)"]
  C -->|piperack| C4["dasar + stabilitas 2 arah<br/>(L-dir / T-dir)"]
  C -->|skid-mounted| C5["dasar + konsentrasi anchor<br/>(reaksi tumpuan skid)"]
  C1 & C2 & C3 & C4 & C5 --> D["Pengisian data input"]
  D --> D1["Manual: Tab 01 General,<br/>Tab 02 Foundation Dimension,<br/>Tab 03 Loading Data"]
  D --> D2["Smart Fill OCR / paste teks<br/>kolom kuning, user verifikasi"]
  D --> D3["Import STAAD .std + .ANL<br/>(Tab 03)"]
  D --> D4["Buka proyek *.fair.json"]
  D1 & D2 & D3 & D4 --> E["Kombinasi beban<br/>ASD dan LRFD (lib loadCombinations)"]
  E --> F{"Tipe fondasi"}

  F -->|dangkal| G1["Tab 4A Foundation Stability<br/>eksentrisitas, bearing, sliding,<br/>guling, luas kontak"]
  F -->|tiang| G2["Tab 4B Pile Foundation Stability<br/>reaksi tiang, Eg, tekan/tarik/lateral"]
  G1 --> H1["Tab 08 Bearing Capacity (Terzaghi / Meyerhof)<br/>Tab 08B Settlement (elastis + konsolidasi)"]
  G2 --> H2["Tab 08B Settlement tiang<br/>(Vesic, tunggal + kelompok)"]
  H1 --> I
  H2 --> I["Tab 5A Pedestal Check<br/>Tab 5B Footing / Pile Cap Check<br/>lentur, geser satu arah, punching"]
  I --> J["Tab 09 Anchor Bolt Design<br/>(ACI 17, skid / pedestal)"]
  J --> K{"Semua check<br/>lolos (UC ≤ 1.0)?"}
  K -->|tidak| L["Banner DESIGN FAILED"]
  L --> L2["Tab 02: revisi B × L × H<br/>atau tombol Auto-Size<br/>(loop iterasi, fondasi dangkal)"]
  L2 -->|hitung ulang| F
  K -->|ya| M["Status ALL CHECKS PASSED"]
  M --> N["Tab 11 Summary Report<br/>tabel UC, kombinasi, formula"]
  N --> O["Export report (HTML)<br/>atau Print / Save as PDF"]
  N --> P["Simpan proyek *.fair.json"]
  O --> Q([Selesai])
  P --> Q
```

## 2. Alur batch lewat CLI (`tools/fair-run.mjs`)

Tidak memakai UI. Rumus tetap dari `lib/foundation`; CLI hanya membaca input dan menyusun laporan. Cakupan: footing/pedestal dangkal dan pile cap; tipe equipment lain belum.

```mermaid
flowchart TD
  A([Mulai]) --> B["Input STAAD:<br/>file .std + .ANL<br/>(reaksi tumpuan per kombinasi)"]
  A --> C["File perintah .fnd<br/>FOOTING, LC, DESIGN, PEDESTAL, ANCHOR,<br/>SUPPORT PILE, REPORT ..."]
  B --> D["fair-run.mjs<br/>parseFndCommands → config JSON"]
  C --> D
  D --> E{"Jenis fondasi"}
  E -->|footing / pedestal| F["staad-stability.mjs<br/>cek 4A + struktur footing<br/>(+ anchor)"]
  E -->|SUPPORT PILE| G["staad-pile.mjs<br/>cek 4B + struktur pile cap 5B"]
  F --> H["Hasil per kombinasi:<br/>UC, status PASS / FAIL"]
  G --> H
  H --> I{"AUTO THICKNESS?"}
  I -->|ya| J["cari tebal H terkecil yang lolos"] --> H
  I -->|tidak| K["Laporan Markdown"]
  K --> L["HTML A4<br/>(report-output.mjs)"]
  L --> M["PDF (--pdf)<br/>Chrome / Chromium / Edge terpasang"]
  F --> N["Gambar DXF + SVG<br/>(DRAWINGS ON)"]
  G --> N
  M --> O([Selesai])
  N --> O
```
