# HANDOFF — FAIR Foundation Design (per 15 Okt 2026)

## Status repo
- `main` = `fe32c60`. PR #4 (Focus Canvas), #5 (font + lag), #6 (pile settlement, load points, pile punching) sudah merged, CI hijau.
- Validasi: 28 file, 965 checks, 965 pass (`lib/foundation/validation/VALIDATION_REPORT.md`).
- Cache-buster `?v=` saat ini `20261015m` (harus seragam di semua import `js/` + `index.html`).
- Branch kerja `claude/matrix-164x166-performance-9ptb5f` sudah merged: untuk kerja baru reset ke `origin/main`.

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
