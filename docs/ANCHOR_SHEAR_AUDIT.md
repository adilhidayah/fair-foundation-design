# Audit geser anchor — 28 Oktober 2026

## Koreksi faktor grout yang sudah diterapkan

ACI 318M-19 §17.7.1.2.1 mensyaratkan faktor 0,80 pada kekuatan nominal baja dalam geser untuk anchor dengan built-up grout pad. Faktor ini tidak diterapkan pada kapasitas tarik, breakout beton, pryout, atau kapasitas tulangan pengangkuran.

- Library: `anchorGroupCheck` dan `computeAnchorCapacity` menerima boolean `groutPad` (default false untuk pemanggilan langsung tanpa konfigurasi grout). Keluaran menyediakan `VsaBare`, `Vsa`, `groutFactor` dan `groutPad` agar laporan dapat diaudit.
- Tab 09: kedua metode membaca checkbox grouting di Section 02. Tidak ada input grout kedua yang dapat berbeda nilainya. Faktor dan kapasitas setelah reduksi ditampilkan pada laporan.
- CLI: `pedestalDesignCheck` mengaktifkan faktor jika geometri fondasi mempunyai `groutT > 0` mm. Perintah `.fnd` `GROUT` sudah mengisi field ini.
- Faktor grout pada kekuatan baja tidak sama dengan pemeriksaan kekuatan tekan grout / bearing base plate; kedua pemeriksaan tersebut tetap di luar cakupan kode anchor saat ini.

### Vektor hitungan pembanding

Ase,V = 694 mm², futa = 520 MPa, phi baja geser = 0,65:

- Sebelum: Vsa = 0,6 × 694 × 520 = 216.528 N; phi Vsa = 140.743,2 N.
- Sesudah, dengan grout: Vsa = 0,80 × 216.528 = 173.222,4 N; phi Vsa = 112.594,56 N.
- Pada demand per baut 33,425 kN yang sama, UC baja naik dari sekitar 0,2375 menjadi 0,2969 (×1,25).
- Tanpa grout: hasil lama tetap sama.

## Pembagian geser masih menunggu keputusan

Kode sebelum audit memakai V/4 untuk baja pada grup empat anchor; cek sengkang sudah memiliki pilihan Case 1 (V/4) / Case 2 (V/2). ACI §17.7.1.1 dan R17.7.1.1 mengharuskan konsistensi dengan asumsi breakout dan redistribusi. Koreksi faktor grout di atas belum menyelesaikan perbedaan pembagian ini.

Pertanyaan yang diajukan kepada user: default dua baut dengan pilihan empat, selalu dua, atau wajib memilih per proyek. Jangan menyatakan audit geser selesai atau memperbarui website sebelum pilihan ini diselesaikan dan diuji. Detail yang mendukung pembagian ke empat baut harus dinyatakan; jumlah baut total saja tidak membuktikan pembagian tersebut.

## Verifikasi tahap faktor grout

- `validation_shared_part46.mjs`: 21 pemeriksaan lulus, mencakup dua metode library, isolasi faktor pada baja, konsistensi seismik, dan deteksi grout dari geometri CLI.
- Seluruh 46 skrip validasi lulus; 138 modul lulus pemeriksaan sintaks.
- Browser lokal: kapasitas nominal baja contoh bawaan berubah dari 175,79 ke 140,64 kN saat grout dicentang; phi Vsa dari 114,27 ke 91,41 kN. Kedua metode Tab 09 menampilkan faktor 0,80; tidak ada error console.
- Tidak ada rumus geser beton atau rumus pengangkuran yang diubah pada tahap ini. Hasil keseluruhan desain tetap bergantung pada semua limit state, bukan UC baja saja.

## Sumber

- [ACI: maksud faktor 0,8 pada §17.7.1.2.1](https://www.concrete.org/frequentlyaskedquestions.aspx?faqid=887).
- [ACI 318-19, Chapter 17, §17.7.1.1 dan §17.7.1.2.1; salinan dokumen ACI di Berkeley](https://www.ocf.berkeley.edu/~chiep/wp-content/uploads/2024/01/CE-123-ACI-318-19.pdf). Bagian yang diperiksa berkaitan dengan distribusi gaya dan faktor grout, bukan koefisien breakout dalam satuan SI.
