# ukur_pdf.py
# Mengukur geometri dari gambar CAD dalam PDF vektor (teks gambar sering ikut jadi vektor, tanpa teks yang bisa dibaca).
# Koordinat yang dicetak = koordinat halaman TANPA rotasi (PyMuPDF); halaman "rot 270": arah kanan tampilan = +y halaman,
# atas tampilan = +x halaman. Skala dikalibrasi sendiri: panjang garis terukur / dimensi tertulis (mis. 709.1 / 700 mm).
# Jalankan TANPA -I (PyMuPDF = paket user-site):
#   python ukur_pdf.py <file.pdf> info                                   rotasi, ukuran halaman, jumlah garis
#   python ukur_pdf.py <file.pdf> garis [--min 25] [--lebar 0.72]        garis aksial (H/V) objek, panjang >= min
#   python ukur_pdf.py <file.pdf> klaster x0 x1 y0 y1 [--arah x|y] [--celah 6] [--min-titik 20]
#                                                                        pusat klaster titik garis di kotak (lingkaran pipa
#                                                                        tersusun dari banyak segmen pendek -> pusat = tengah bbox)
#   python ukur_pdf.py <file.pdf> render x0 x1 y0 y1 <keluar.png> [--zoom 6]   potongan gambar (koordinat halaman tanpa rotasi)
# Posisi relatif titik berat tiang: x_mm = (koordinat - punggung_kaki) / skala + cy  (punggung = sisi tebal profil di gambar).
import argparse, math, sys, warnings

warnings.filterwarnings("ignore")
try:
    import pymupdf as fitz
except ImportError:
    import fitz

sys.stdout.reconfigure(encoding="utf-8")
ap = argparse.ArgumentParser()
ap.add_argument("pdf"); ap.add_argument("perintah", choices=("info", "garis", "klaster", "render"))
ap.add_argument("arg", nargs="*")
ap.add_argument("--min", type=float, default=25); ap.add_argument("--lebar", type=float, default=None)
ap.add_argument("--arah", choices=("x", "y"), default="y"); ap.add_argument("--celah", type=float, default=6)
ap.add_argument("--min-titik", type=int, default=20); ap.add_argument("--zoom", type=float, default=6)
ap.add_argument("--hal", type=int, default=0)
a = ap.parse_args()
p = fitz.open(a.pdf)[a.hal]

def segmen():
    for d in p.get_drawings():
        for it in d["items"]:
            if it[0] == "l": yield it[1], it[2], d.get("width")
            elif it[0] == "re":
                r = it[1]
                for q1, q2 in ((r.tl, r.tr), (r.tr, r.br), (r.br, r.bl), (r.bl, r.tl)): yield q1, q2, d.get("width")

if a.perintah == "info":
    n = sum(1 for _ in segmen())
    print(f"halaman {p.rect.width:.0f} x {p.rect.height:.0f}, rotasi {p.rotation}, segmen {n}, teks '{p.get_text().strip()[:60]}'")
elif a.perintah == "garis":
    for q1, q2, w in segmen():
        dx, dy = abs(q2.x - q1.x), abs(q2.y - q1.y)
        if a.lebar is not None and (w is None or abs(w - a.lebar) > 0.01): continue
        if (dx >= a.min and dy < 1) or (dy >= a.min and dx < 1):
            print(f"{'H' if dy < 1 else 'V'} {q1.x:7.1f} {q1.y:7.1f} -> {q2.x:7.1f} {q2.y:7.1f}  L={math.hypot(dx, dy):6.1f}  w={w}")
elif a.perintah == "klaster":
    x0, x1, y0, y1 = map(float, a.arg[:4])
    pts = [(q.x, q.y) for q1, q2, _ in segmen() for q in (q1, q2) if x0 < q.x < x1 and y0 < q.y < y1]
    if not pts: sys.exit("tidak ada titik di kotak")
    k = 1 if a.arah == "y" else 0
    pts.sort(key=lambda t: t[k])
    cl = [[pts[0]]]
    for t in pts[1:]:
        (cl[-1].append(t) if t[k] - cl[-1][-1][k] < a.celah else cl.append([t]))
    for c in cl:
        if len(c) < a.min_titik: continue
        xs, ys = [t[0] for t in c], [t[1] for t in c]
        print(f"n={len(c):4d}  pusat x={(min(xs) + max(xs)) / 2:7.1f} y={(min(ys) + max(ys)) / 2:7.1f}  "
              f"bbox x[{min(xs):.1f},{max(xs):.1f}] y[{min(ys):.1f},{max(ys):.1f}]")
elif a.perintah == "render":
    x0, x1, y0, y1 = map(float, a.arg[:4]); keluar = a.arg[4]
    r = fitz.Rect(x0, y0, x1, y1) * p.rotation_matrix; r.normalize()     # clip dalam koordinat tampilan
    p.get_pixmap(matrix=fitz.Matrix(a.zoom, a.zoom), clip=r).save(keluar); print(keluar)
