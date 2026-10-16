# FAIR Foundation Design

Web app kalkulator fondasi untuk civil structure engineer. Modul pertama: fondasi equipment oil & gas (vessel, tank, heat exchanger, pompa, kompresor, turbin, pipe rack, skid-mounted package unit). Acuan standar: ACI 318M-19 / ASCE 7-22.

## Menjalankan
Buka lewat dev server, bukan `file://` (agar ES module jalan):

```
npx serve .
```

Lalu buka `index.html`. Tanpa bundler dan tanpa `package.json`.

## Command line (Node.js 22+)
```
node tools/fair-run.mjs docs/examples/example.fnd --out report.md
```
Input gaya STAAD (`.fnd`) → laporan Markdown / HTML / PDF. Contoh: `docs/examples/`.

## Validasi
Semua `lib/foundation/validation/validation_*.mjs` dijalankan CI di setiap push / PR (`.github/workflows/validation.yml`). Daftar perintah dan hasil: `AGENTS.md` §7 dan `lib/foundation/validation/VALIDATION_REPORT.md`.

## Struktur
| Folder | Isi |
|---|---|
| `index.html`, `css/`, `js/` | UI (ES modules, entry `js/app.js`) |
| `lib/foundation/` | Library hitung: pure function, tanpa DOM |
| `tools/` | CLI Node (`fair-run`, `staad-stability`, `staad-pile`, gambar DXF/SVG, report) |
| `docs/` | Catatan proyek: peta file, filosofi, handoff, contoh `.fnd` |

Mulai dari [`docs/README.md`](docs/README.md). Aturan kerja AI assistant: [`AGENTS.md`](AGENTS.md).
