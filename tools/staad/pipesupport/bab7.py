"""Isi Bab 7 (RESULT) laporan klien VLPC-TIP-TRS-C-CC-0010 "Pipe Supports and Foundation" (sheet "6-8") dari hasil skrip:
Tabel 7-1 profil, 7-2 unity check, 7-3 lendutan (semua kasus T-POST + cantilever), 7-4 desain beton dan 7-5 stabilitas per
tipe pondasi F# (satu baris per tipe; penurunan elastis Meyerhof-SPT seperti Rev A), serta teks 7.2 & Summary.
  python bab7.py --folder <folder Kalkulasi> --xlsx <laporan.xlsx> [--cek]
--cek: hanya kumpulkan & tampilkan data (Excel tidak disentuh). Tanpa --cek: salinan cadangan <xlsx>.bak-<waktu>, lalu tabel diganti
lewat Excel COM (format, gambar, sheet lain tetap; file harus TERTUTUP). Rumus lama di tabel (rujukan ke lampiran Excel lama) diganti nilai."""
import argparse, datetime, glob, importlib.util, json, math, os, re, shutil, sys

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))
def _mod(nama):
    s = importlib.util.spec_from_file_location(nama, os.path.join(HERE, nama + ".py")); m = importlib.util.module_from_spec(s); s.loader.exec_module(m); return m
PS = _mod("pipesupport")
TANAH = dict(N=8, GWL=1.5, Sa=25.0, sumber="BH-01 N-SPT 8, GWL 1.5 m, allowable 25 mm (Rev A, VLPC-TIP-TRS-G-DB-001)")


def profil_lap(nama):
    """nama profil gaya laporan: C150X75X6.5 -> UNP150X75X6.5X10, L90X90X7 tetap"""
    d = PS.dimensi_profil(nama)
    if d["jenis"] == "L": return d["nama"]
    g = lambda v: f"{v:g}"
    return f"UNP{g(d['h'])}X{g(d['b'])}X{g(d['tw'])}X{g(d['tf'])}"


def tabel_md(md, kepala):
    """baris tabel markdown sesudah baris yang memuat `kepala` (list sel)"""
    L = md.splitlines(); out = []
    for i, l in enumerate(L):
        if kepala in l:
            for k in L[i + 1:]:
                if not k.startswith("|"):
                    if out: break
                    continue
                c = [x.strip() for x in k.strip().strip("|").split("|")]
                if set(c[0]) <= set("-: "): continue
                if c[0] in ("Titik", "Bagian", "Tipe", "Parameter"): continue
                out.append(c)
            break
    return out


def kumpul(ROOT, ps, fp):
    tdir = lambda t: os.path.join(ROOT, re.sub(r'[\\/:*?"<>|]+', "-", t).strip())
    baja = []
    for tp in ps["tipe"]:
        t = tp["nama"]; md = open(os.path.join(tdir(t), f"{t} - Perhitungan.md"), encoding="utf-8").read()
        tor = tabel_md(md, "| Bagian | Member | Profil | Warping pangkal")
        uc = lambda rows: max(((float(r[11]), int(r[4])) for r in rows), default=(None, None))
        kol = uc([r for r in tor if r[0].startswith("Tiang")]); lng = uc([r for r in tor if r[0].startswith("Lengan")])
        vd = []
        for r in tabel_md(md, "**Tabel 1 Vertical Deflection**"):
            m = re.search(r"L = ([\d.]+) m", r[0])
            if m and len(r) >= 6: vd.append((float(r[3]) / float(r[4]), float(m.group(1)) * 1000, float(r[3]), float(r[4]), int(r[2])))
        hd = []
        for r in tabel_md(md, "### Umum - semua kombinasi layan"):
            hd.append((float(r[9]) / float(r[10]), float(r[10]) * 200, float(r[9]), float(r[10]), int(r[2])))
        lv_prof = sorted({profil_lap(l.get("profil", tp["tiang"]["profil"])) for l in tp["level"]})
        baja.append(dict(tipe=t, kol=profil_lap(tp["tiang"]["profil"]), lengan=" / ".join(lv_prof), uc_k=kol, uc_l=lng,
                         d_l=max(vd) if vd else None, d_k=max(hd) if hd else None))
    KT = _mod("kantilever")
    for k in ps.get("kantilever", []):
        h = KT.hitung(k, ps["umum"]); i, g = max(enumerate(h["hasil"]), key=lambda x: x[1]["r"])
        baja.append(dict(tipe=k["nama"], kol=None, lengan=profil_lap(k["profil"]), uc_k=(None, None), uc_l=(g["r"], 101 + i),
                         d_l=(h["dl"] / h["dlim"], h["L"], h["dl"], h["dlim"], 101), d_k=None, braket=True))
    # ---- pondasi per tipe F (dari tipe_pondasi.json + laporan dengan ukuran tipe dikunci)
    tj = json.load(open(os.path.join(ROOT, "tipe_pondasi.json"), encoding="utf-8"))
    pond = []
    for F in sorted(tj["pondasi"], key=lambda x: int(x[1:])):
        P, Fo = tj["pedestal"][tj["pondasi"][F]["P"]], tj["footing"][tj["pondasi"][F]["Fot"]]
        kas = [t for t, m in tj["kasus"].items() if m["F"] == F]
        st = {}
        for t in kas:
            p = os.path.join(tdir(t), f"{t} - Fondasi Tipe.md")
            md = open(p if os.path.exists(p) else os.path.join(tdir(t), f"{t} - Fondasi.md"), encoding="utf-8").read()
            for r in tabel_md(md, "| Parameter | Actual | Allowable / required | Remarks |"):
                st.setdefault(r[0], []).append((float(r[1].rstrip(" %")), float(r[2].rstrip(" %")), t))   # kontak dalam %
        ag = {}
        for nm, v in st.items():
            ag[nm] = max(v, key=lambda x: x[0] / x[1]) if nm.startswith("Bearing") else min(v, key=lambda x: x[0] / x[1])
        # penurunan elastis Meyerhof (SPT) seperti Rev A A.5.3; CD = 1 (koreksi kedalaman tidak diambil, konservatif),
        # Cw = 2 bila muka air tanah < B di bawah dasar pondasi, 1 bila lebih dalam
        B = Fo["B"]; q = max(max(x[0] for x in st.get(k_, [(0, 1, "")])) for k_ in st if k_.startswith("Bearing")) if st else 0
        dw = TANAH["GWL"] - Fo["Df"]; Cw = 1.0 if dw >= B else 2.0
        Se = Cw * 1.0 * (1.25 * q / TANAH["N"] if B <= 1.2 else 2 * q / TANAH["N"] * (B / (B + 0.3)) ** 2)
        pond.append(dict(F=F, P=tj["pondasi"][F]["P"], Fot=tj["pondasi"][F]["Fot"], ped=P, fot=Fo, kasus=kas, st=ag, q_set=q, Cw=Cw, Se=Se))
    return baja, pond


def tampil(baja, pond):
    f = lambda v, n=3: "-" if v is None else f"{v:.{n}f}"
    print("Tabel 7-1/7-2/7-3")
    for b in baja:
        print(f"  {b['tipe']:20s} col {b['kol'] or '-':18s} UC {f(b['uc_k'][0])} LC {b['uc_k'][1]} | beam {b['lengan']:22s} UC {f(b['uc_l'][0])} LC {b['uc_l'][1]}"
              + (f" | dV {b['d_l'][2]:.2f}/{b['d_l'][3]:.2f} (L {b['d_l'][1]:.0f})" if b["d_l"] else "")
              + (f" | dH {b['d_k'][2]:.2f}/{b['d_k'][3]:.2f} (H {b['d_k'][1]:.0f})" if b["d_k"] else ""))
    print("Tabel 7-4/7-5")
    for p in pond:
        s = p["st"]; g = lambda k: f"{s[k][0]:.2f}/{s[k][1]:.2f}" if k in s else "-"
        print(f"  {p['F']} {p['P']}-{p['Fot']} {p['fot']['B']:.2f}x{p['fot']['H']:.2f} ped {p['ped']['B'] * 1000:.0f} {p['ped']['bars']} | q perm {g('Bearing pressure, permanent (kN/m²)')} "
              f"temp {g('Bearing pressure, temporary (kN/m²)')} | OT {g('Overturning SF, permanent')} {g('Overturning SF, temporary')} | SL {g('Sliding SF, permanent')} "
              f"{g('Sliding SF, temporary')} | Se {p['Se']:.1f} mm (q {p['q_set']:.1f}, Cw {p['Cw']:.0f}) | {', '.join(p['kasus'])}")


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--folder", required=True); ap.add_argument("--xlsx"); ap.add_argument("--ps"); ap.add_argument("--fondasi")
    ap.add_argument("--cek", action="store_true")
    a = ap.parse_args(); ROOT = os.path.abspath(a.folder)
    ps = json.load(open(os.path.abspath(a.ps or sorted(glob.glob(os.path.join(ROOT, "*.ps.json")))[0]), encoding="utf-8"))
    fp = json.load(open(os.path.abspath(a.fondasi or sorted(glob.glob(os.path.join(ROOT, "*Fondasi.proyek.json")))[0]), encoding="utf-8"))
    baja, pond = kumpul(ROOT, ps, fp)
    tampil(baja, pond)
    if a.cek or not a.xlsx: return
    _mod("excel_bab7").tulis(os.path.abspath(a.xlsx), baja, pond, ps, fp, TANAH)


if __name__ == "__main__":
    main()
