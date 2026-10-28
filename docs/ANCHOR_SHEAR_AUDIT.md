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

## Pembagian geser — keputusan dan koreksi 28 Oktober 2026

Kode sebelum audit memakai V/4 untuk baja pada grup empat anchor; cek sengkang sudah memiliki pilihan Case 1 (V/4) / Case 2 (V/2). ACI §17.7.1.1 dan R17.7.1.1 mengharuskan konsistensi dengan asumsi breakout dan redistribusi. Koreksi faktor grout di atas belum menyelesaikan perbedaan pembagian ini.

User memilih: **wajib ditetapkan per proyek, tanpa nilai bawaan**. Pilihan ini sekarang menjadi input `shearAnchors: 2 | 4`; empat angkur juga membutuhkan `shearBasis`, yaitu rujukan detail yang menjamin pembagian geser. Ini adalah asumsi desain yang harus diverifikasi engineer; memasukkan teks rujukan tidak memverifikasi detail secara otomatis.

- Baja: demand per angkur `V / shearAnchors` (§17.7.1.1). Kapasitas baja dan faktor grout tidak diubah.
- Sengkang 125 mm teratas: Case 2 diturunkan dari pilihan 2; Case 1 dari pilihan 4. UI tidak menyediakan pilihan Case yang terpisah. Library menolak Case lama yang bertentangan.
- Pryout (§17.7.3.1): `N_cbg` dihitung dari proyeksi angkur yang benar-benar menerima geser (dua angkur baris depan sesuai arah dominan, atau keempat angkur). `hef'` dan luas proyeksi mengikuti pola angkur tersebut; bukan selalu proyeksi empat angkur.
- Breakout geser beton tetap memakai seluruh V pada permukaan baris depan sebagai batas konservatif untuk model ini. Tidak mengambil peningkatan kapasitas dari baris belakang.
- Hairpin geser tetap diperiksa dengan seluruh V pada dua angkur baris depan; tidak mendapat tambahan kapasitas otomatis ketika pilihan baja memakai empat angkur.
- Tanpa pilihan, pilihan tidak valid, detail empat angkur kosong, atau Case bertentangan: `valid=false`, tidak boleh PASS. File proyek lama perlu ditinjau dan dipilih ulang. Tidak ada migrasi diam-diam dari V/4.
- CLI JSON: `pedestal.anchor.shearAnchors` dan `.shearBasis`. `.fnd`: `ANCHOR SHARING 2` atau `ANCHOR SHARING 4 Drawing S-101 detail ...`. Parameter Case lama, jika masih ditulis, harus sesuai pilihan ini.

### Vektor pembanding pembagian geser

Dengan V = 133,7 kN, Ase = 694 mm², futa = 520 MPa dan phi = 0,65:

- Kapasitas baja tanpa grout = 140,7432 kN per angkur, tetap sama.
- Empat angkur: demand 33,425 kN, UC = 0,23749.
- Dua angkur: demand 66,85 kN, UC = 0,47498 (dua kali UC empat angkur).
- Dua angkur dengan grout: kapasitas 112,59456 kN, UC = 0,59372.
- Pryout contoh independen Bp=Lp=1200, sx=300, sz=400, hef=150 mm: A_Nco=202500 mm²; dua angkur arah x: A_Nc=382500 mm²; empat: 637500 mm²; dua arah z: 337500 mm². Nb = 10 sqrt(fc) hef^1.5 dan Vcpg = 2 (A_Nc/A_Nco) Nb untuk contoh tanpa pengaruh tepi ini.

`validation_shared_part48.mjs`: 36 cek baru untuk demand/kapasitas, grout, kesamaan baja/sengkang, proyeksi pryout x/z dan pembalikan arah, pemotongan proyeksi oleh tepi dan hef efektif, pilihan wajib, parser `.fnd` dan integrasi CLI. Vektor lama yang mengasumsikan pembagian empat angkur kini menyatakannya secara eksplisit; vektor Case 2 menyatakan dua.

Kasus tambahan tanpa gaya tarik (Tgrp = 0): cek breakout tarik (§17.6.2) ditandai NOT REQUIRED, UC = 0 dan demand = 0, tanpa membagi 0/0 atau mengarang kapasitas. Kapasitas tetap 0 pada snapshot bila tidak ada angkur yang menerima tarik. `part47` memeriksa flag ini; `part48` memeriksa UC total nol yang finite ketika gaya tarik dan geser sama-sama tidak bekerja dan pilihan sharing sudah dinyatakan.

Verifikasi browser lokal: berkas proyek lama tanpa pilihan menampilkan PENDING; pilihan 2 memberi demand 93,59 kN per angkur pada LC201 contoh, pilihan 4 dengan detail memberi 46,79 kN pada LC yang sama. Case sengkang berubah 2 → 1 dan tidak dapat diedit terpisah; pilihan 4 tanpa rujukan tetap PENDING. Tidak ada error console.

Seluruh 48 skrip validasi lulus setelah koreksi; 153 modul lulus pemeriksaan sintaks. Kasus browser tanpa tarik memperlihatkan NOT REQUIRED untuk breakout tarik, sementara cek geser tetap berjalan (bukan menyatakan seluruh desain otomatis PASS).

### Batas cakupan yang tetap ada

Koreksi ini menutup inkonsistensi pembagian geser yang dicatat di atas, bukan sertifikasi menyeluruh Chapter 17. Model grup tetap empat cast-in headed anchors pada pedestal persegi panjang, base plate kaku dan beton retak. Breakout geser menggunakan arah dominan; torsi base plate, interaksi breakout pada dua tepi untuk geser miring, bearing base plate / tekan grout, dan kelengkapan detail penyaluran gaya memerlukan pemeriksaan tersendiri. Metode single-anchor tetap merupakan pendekatan sederhana dan diberi label demikian; default proyek baru kini metode grup.

## Verifikasi tahap faktor grout

- `validation_shared_part46.mjs`: 21 pemeriksaan lulus, mencakup dua metode library, isolasi faktor pada baja, konsistensi seismik, dan deteksi grout dari geometri CLI.
- Seluruh 46 skrip validasi lulus; 138 modul lulus pemeriksaan sintaks.
- Browser lokal: kapasitas nominal baja contoh bawaan berubah dari 175,79 ke 140,64 kN saat grout dicentang; phi Vsa dari 114,27 ke 91,41 kN. Kedua metode Tab 09 menampilkan faktor 0,80; tidak ada error console.
- Tidak ada rumus geser beton atau rumus pengangkuran yang diubah pada tahap ini. Hasil keseluruhan desain tetap bergantung pada semua limit state, bukan UC baja saja.

## Sumber

- [ACI: maksud faktor 0,8 pada §17.7.1.2.1](https://www.concrete.org/frequentlyaskedquestions.aspx?faqid=887).
- [ACI 318-19, Chapter 17, §17.7.1.1 dan §17.7.1.2.1; salinan dokumen ACI di Berkeley](https://www.ocf.berkeley.edu/~chiep/wp-content/uploads/2024/01/CE-123-ACI-318-19.pdf). Bagian yang diperiksa berkaitan dengan distribusi gaya dan faktor grout, bukan koefisien breakout dalam satuan SI.
- [Hilti ACI 318-19 guide, p.231: jumlah angkur untuk pryout mengikuti angkur yang menerima geser](https://viewer.joomag.com/profis-design-guide-ac-318-19-july-2022/0546853001659024142/p231).
