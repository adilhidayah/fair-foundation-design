# AI Assistant Panel — Rencana UI (Foundation Calculator)

> Status: **RENCANA — belum diimplementasikan.** Dicatat 24 Sep 2026 atas permintaan user.
> Rujukan silang: `AGENTS.md` §8.3 (AI hanya input parser/extractor, dilarang menebak hasil hitung).

## 1. Prinsip Layout

| Area | Fungsi | Isi |
|---|---|---|
| **Kiri** | What I enter | Input / Control (panel tree per tab, Auto Fill) |
| **Tengah** | What the calculation produces | Calculation Preview (halaman A4) |
| **Kanan** | What the system tells me | Live Design Status (default) ↔ AI Assistant |

- Assistant **bukan kolom permanen ketiga**. Ia berupa **right-side drawer** yang *collapsible*, dan mengambil alih area kanan untuk sementara.
- **Live Design Status tidak boleh hilang** dan tetap jadi tampilan default. Saat assistant terbuka, panel kanan punya dua tab kecil: `DESIGN STATUS | ✦ ASSISTANT`.
- **Preview dokumen tidak boleh dikorbankan** (koreksi user, 24 Sep 2026): saat assistant dibuka, panel kanan **tetap selebar panel Design Status (240 px)**. Preview di tengah tidak boleh menyempit atau bergeser. Usulan awal drawer 340–380 px dibatalkan.
- Status implementasi: toggle `✦ AI Assistant` (header, Ctrl+J / Esc) dan tab `DESIGN STATUS | ✦ ASSISTANT` sudah ada, tapi isi assistant masih kerangka (konteks tab aktif saja, belum ada AI).
- Assistant tidak ditaruh di kiri, karena kiri = input data dan assistant = help/intelligence. Kalau dicampur, user bisa bingung antara tempat mengisi data dan tempat bertanya.

```
Tertutup:                                           Terbuka:
┌────────┬───────────────┬───────────────┐          ┌────────┬───────────────┬──────────────────────┐
│ INPUT  │ CALC PREVIEW  │ DESIGN STATUS │          │ INPUT  │ CALC PREVIEW  │ DESIGN STATUS|✦ ASST │
│        │   (A4)        │ ✓ Stability   │          │        │   (A4)        │ ✦ Foundation Asst.   │
│        │               │ ✓ Shear …     │          │        │               │ ○ Explain this calc  │
└────────┴───────────────┴───────────────┘          └────────┴───────────────┴──────────────────────┘
Tombol di header: [ ✦ AI Assistant ]
```

## 2. Tiga Jenis AI — Dipisahkan, Bukan Satu Chatbot

1. **AI Assistant** (tombol `✦ AI Assistant` di header): tanya-jawab umum.
   Contoh: "Kenapa DCR saya tinggi?", "Apa arti effective depth?", "Parameter apa yang mempengaruhi overturning?"
2. **AI Auto Fill / Smart Fill** (tetap di **panel input kiri**, grup `✦ AUTO FILL`): aksi terhadap data.
   Alurnya: Upload PDF/drawing → Extract → **Review** → Apply. Jangan lewat assistant panel.
3. **AI Design Assistant**: muncul **saat ada masalah** (cek FAIL).
   ```
   ⚠ DESIGN FAILED — Punching Shear, DCR = 1.08   [ ✦ Ask Design Assistant ]
   → Governing parameters: footing thickness, pedestal dimension, concrete strength
   → Actions: [ Review Thickness ] [ Review Pedestal ] [ Explain Calculation ]
   ```

## 3. Context-Aware (Bukan Sekadar Chat)

Assistant membaca tab dan cek yang sedang aktif. Contoh:

- **Di 02 Foundation Dimension**: tampilkan "You're viewing: Pile Cap + Pedestal, 2.40 × 2.40 × 0.40 m",
  lalu `[Explain Geometry] [Review Dimensions] [Check Practical Detailing] [Explain Calculation]`.
- **Di Punching Shear**: tampilkan "Current check: Punching Shear, DCR 1.08 ✕",
  lalu `[Explain Failure] [Show Governing Parameters] [Suggest Design Changes] [Show Calculation]`.

## 4. Keyboard Shortcut (Opsional, Bukan MVP)

- `Ctrl + J`: buka Assistant
- `Esc`: tutup Assistant
- `Ctrl + Enter`: Apply nilai hasil ekstraksi AI

## 5. Catatan Implementasi (Kaitan dengan Kode Saat Ini)

- **Panel kanan**: `#live-status-bar` (`.live-status-bar`, lebar 240 px), diisi oleh `renderLiveBar()`, termasuk mode onboarding "DESIGN NOT READY". Drawer assistant sebaiknya berupa mode/tab di kontainer ini, bukan elemen baru di `.layout-wrapper`.
- **Konteks tab aktif**: `.sidebar-menu .tab.active` → `dataset.tab`. Tab gabungan dipetakan lewat `TAB_PANELS`.
- **Konteks hasil cek**: `lastResults.*` dan `getWorkflowStepStatus(id)`. UC/DCR diambil dari angka yang sudah dihitung, bukan dihitung ulang (sama seperti `dcrOf()` di live bar).
- **Auto Fill** sudah ada sebagai kartu `.gt-ai` di Tab 01, 02, dan 03. Tab 01/02 masih tampilan saja; Tab 03 (OCR datasheet & tabel kombinasi) sudah berfungsi.
- **Batasan wajib (AGENTS.md §8.3)**:
  - AI tidak boleh menebak atau menghasilkan angka hasil hitung.
  - "Explain / Show Governing Parameters" hanya membaca rumus dan nilai dari kode.
  - "Suggest Design Changes" hanya menunjuk parameter yang berpengaruh dan membuka input terkait. Efek perubahannya dihitung ulang oleh rumus deterministik, bukan diperkirakan AI.
  - Nilai hasil Auto Fill harus ditandai (highlight kuning) dan diverifikasi user sebelum dipakai.
