# validasi_mesh.py
# Validasi model balok + DG9 terhadap model PELAT (mesh) STAAD untuk pipe support UNP satu level
# (tipe T / |-, lengan duduk di atas tiang). Tiga kasus:
#   1. torsi murni 1 kNm pada lengan (kopel gaya di sayap pada posisi pipa)
#   2. torsi murni 1 kNm pada tiang (kopel gaya di sayap tiang di bawah lengan)
#   3. beban pipa sebenarnya: Po ke bawah + friksi Ff arah sumbu pipa, di titik kontak sayap atas
# Teori: DG9 kantilever, pangkal menahan warping, torsi di posisi c (bukan di ujung).
#
#   python -I validasi_mesh.py --config "<proyek>.ps.json" --tipe PS-L1 [--elemen 25]
import argparse, importlib.util, json, math, os, re, subprocess, sys

sys.stdout.reconfigure(encoding="utf-8")
SINI = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("ps", os.path.join(SINI, "pipesupport.py"))
ps = importlib.util.module_from_spec(spec); spec.loader.exec_module(ps)

def bimomen(T, a, L, c, z):
    """|Bimomen| di z (dari pangkal) - kantilever, pangkal warping tertahan, ujung bebas, torsi T di c."""
    k = 1.0
    s, ch = math.sinh(c / a), math.cosh(c / a)
    S, Ch = math.sinh((L - c) / a), math.cosh((L - c) / a)
    Bc = k * (s * Ch - (1 - ch) * S) / math.cosh(L / a)
    if z <= c:
        dphi = -k * math.sinh(z / a) / a + Bc * math.cosh(z / a) / a
    else:
        Cc = (k * s - Bc * ch) / S if S > 1e-12 else 0.0
        dphi = -Cc * math.sinh((L - z) / a) / a * -1
    return abs(T * a * a * dphi)          # B = E·Cw·θ'' = T·a²·φ'/k

def grid(a, b, h, wajib=()):
    pts = {round(a, 6), round(b, 6)} | {round(w, 6) for w in wajib if a - 1e-9 <= w <= b + 1e-9}
    pts = sorted(pts); out = [pts[0]]
    for p, q in zip(pts[:-1], pts[1:]):
        n = max(1, round((q - p) / h))
        out += [p + (q - p) * i / n for i in range(1, n + 1)]
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", required=True); ap.add_argument("--tipe", required=True)
    ap.add_argument("--elemen", type=float, default=25.0, help="ukuran elemen target (mm)")
    a = ap.parse_args()
    cfg = json.load(open(a.config, encoding="utf-8"))
    tp = next(t for t in cfg["tipe"] if t["nama"] == a.tipe)
    if len(tp["level"]) != 1: ps.berhenti("validasi mesh hanya untuk tipe satu level")
    lv = tp["level"][0]; pr = ps.dimensi_unp(tp["tiang"]["profil"])
    if ps.dimensi_unp(lv.get("profil", tp["tiang"]["profil"]))["nama"] != pr["nama"]:
        ps.berhenti("validasi mesh: profil lengan harus sama dengan tiang")
    E = float(cfg["umum"].get("material", {}).get("E_MPa", 205000)); Gm = E / 2.6
    h, b, tw, tf, cy = pr["h"], pr["b"], pr["tw"], pr["tf"], pr["cy"]
    hp, bp = h - tf, b - tw / 2
    H = float(tp["tiang"]["tinggi"]) * 1000
    kiri, kanan = float(lv.get("kiri", 0)) * 1000, float(lv.get("kanan", 0)) * 1000
    p = lv["pipa"][0]; xp = float(p["x"]) * 1000
    bpp = ps.beban_pipa(p); Po = bpp["Po"]; Ff = float(p.get("mu", 0.3)) * Po
    zw = -(cy - tw / 2)                       # garis tengah web (titik berat di z = 0), sayap ke +Z
    zc = zw + (b / 2 - tw / 2)                # titik kontak pipa: tengah sayap
    ybf = H + tf / 2; ytf = ybf + hp          # sayap bawah / atas lengan (garis tengah)
    el = a.elemen
    # ---- node & elemen
    N, E_ = {}, []
    def nd(x, y, z):
        k = (round(x, 3), round(y, 3), round(z, 3))
        if k not in N: N[k] = len(N) + 1
        return N[k]
    tebal = {}
    def quad(p1, p2, p3, p4, t):
        E_.append((nd(*p1), nd(*p2), nd(*p3), nd(*p4))); tebal[len(E_)] = t; return len(E_)
    xs_w = grid(-hp / 2, hp / 2, el)                          # web tiang (arah X)
    zs_f = grid(zw, zw + bp, el, [zc])                        # sayap (arah Z)
    ys = grid(0, ybf, el, [ybf - 50])
    xa = grid(-hp / 2 - kiri if kiri else -hp / 2, kanan, el, xs_w + [xp, xp - el, xp + el])
    kol = {"web": [], "sayap": []}
    for j in range(len(ys) - 1):
        for i in range(len(xs_w) - 1):
            kol["web"].append((quad((xs_w[i], ys[j], zw), (xs_w[i], ys[j + 1], zw), (xs_w[i + 1], ys[j + 1], zw), (xs_w[i + 1], ys[j], zw), tw), j, i))
        for xf in (-hp / 2, hp / 2):
            for k in range(len(zs_f) - 1):
                kol["sayap"].append((quad((xf, ys[j], zs_f[k]), (xf, ys[j + 1], zs_f[k]), (xf, ys[j + 1], zs_f[k + 1]), (xf, ys[j], zs_f[k + 1]), tf), j, k, xf))
    ys_a = grid(ybf, ytf, el)
    lg = {"web": [], "sayap": []}
    for i in range(len(xa) - 1):
        for j in range(len(ys_a) - 1):
            lg["web"].append((quad((xa[i], ys_a[j], zw), (xa[i + 1], ys_a[j], zw), (xa[i + 1], ys_a[j + 1], zw), (xa[i], ys_a[j + 1], zw), tw), i, j))
        for yf in (ybf, ytf):
            for k in range(len(zs_f) - 1):
                lg["sayap"].append((quad((xa[i], yf, zs_f[k]), (xa[i + 1], yf, zs_f[k]), (xa[i + 1], yf, zs_f[k + 1]), (xa[i], yf, zs_f[k + 1]), tf), i, k, yf))
    # ---- beban
    def node_at(x, y, z):
        k = (round(x, 3), round(y, 3), round(z, 3))
        if k not in N: ps.berhenti(f"node {k} tidak ada di mesh")
        return N[k]
    T1 = 1.0  # kNm
    F_l = T1 * 1e3 / hp                                        # kN, kopel lengan (lengan dalam mm -> kN·m)
    F_t = T1 * 1e3 / hp
    yT = ys[min(range(len(ys)), key=lambda j: abs(ys[j] - (ybf - 50)))]
    beban = {
        1: [(node_at(xp, ytf, zw), "FZ", F_l), (node_at(xp, ybf, zw), "FZ", -F_l)],
        2: [(node_at(hp / 2, yT, zw), "FZ", -F_t), (node_at(-hp / 2, yT, zw), "FZ", F_t)],
        3: [(node_at(x_, ytf, zc), f, v / 3) for x_ in (xp - el, xp, xp + el) for f, v in (("FY", -Po), ("FZ", Ff))],
    }
    # ---- tulis .std (mm)
    out = ["STAAD SPACE", "INPUT WIDTH 79", "UNIT MMS KN", "JOINT COORDINATES"]
    out += [f"{n} {k[0]} {k[1]} {k[2]};" for k, n in N.items()]
    out += ["ELEMENT INCIDENCES SHELL"] + [f"{i} {a_} {b_} {c_} {d_};" for i, (a_, b_, c_, d_) in enumerate(E_, 1)]
    for t in sorted(set(tebal.values())):
        ids = [i for i, tt in tebal.items() if tt == t]
        out.append("ELEMENT PROPERTY")
        out += [f"{ids[k]} TO {ids[min(k + 999, len(ids) - 1)]} THICKNESS {t}" for k in range(0, len(ids), 1000)] if ids == list(range(ids[0], ids[-1] + 1)) else \
               [" ".join(map(str, ids[k:k + 12])) + f" THICKNESS {t}" for k in range(0, len(ids), 12)]
    out += ["DEFINE MATERIAL START", "ISOTROPIC STEEL", f"E {E / 1000}", "POISSON 0.3", "DENSITY 7.68195e-08", "END DEFINE MATERIAL",
            "CONSTANTS", "MATERIAL STEEL ALL", "SUPPORTS"]
    base = [n for k, n in N.items() if abs(k[1]) < 1e-6]
    out += [" ".join(map(str, base[k:k + 15])) + " FIXED" for k in range(0, len(base), 15)]
    judul = {1: "TORSI MURNI LENGAN 1 KNM", 2: "TORSI MURNI TIANG 1 KNM", 3: "BEBAN PIPA PO + FRIKSI"}
    for lc, bb in beban.items():
        out += [f"LOAD {lc} LOADTYPE Dead  TITLE {judul[lc]}", "JOINT LOAD"] + [f"{n} {f} {ps.f3(v)}" for n, f, v in bb]
    out += ["PERFORM ANALYSIS"]
    # elemen yang dibaca: baris dasar tiang & baris pangkal lengan (di luar muka tiang)
    baca_k = sorted({e for e, j, *_ in kol["web"] + kol["sayap"] if j in (0, 1)})
    i_root = next(i for i in range(len(xa) - 1) if xa[i] >= hp / 2 - 1e-6)
    baca_l = sorted({e for e, i, *_ in lg["web"] + lg["sayap"] if i in (i_root, i_root + 1)})
    lst = baca_k + baca_l
    out += [f"PRINT ELEMENT STRESSES LIST {' '.join(map(str, lst[k:k + 12]))}" for k in range(0, len(lst), 12)] + ["FINISH"]
    folder = os.path.dirname(os.path.abspath(a.config))
    std = os.path.join(folder, f"{a.tipe} - MESH.std")
    open(std, "w", encoding="latin-1", newline="\r\n").write("\n".join(out) + "\n")
    print(f"MESH: {len(N)} node, {len(E_)} elemen -> {std}")
    kosong = os.path.join(folder, "_kosong.json"); open(kosong, "w").write("{}")
    r = subprocess.run([sys.executable, "-I", ps.CEK, "--model", std, "--config", kosong, "--keluar", os.path.join(folder, "_mesh.md")],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    os.remove(kosong)
    m = re.search(r"Sumber output: `([^`]+)`", r.stdout); err = re.search(r"Error di output: (\d+)", r.stdout)
    print("analisis mesh: error =", err.group(1) if err else "?", "|", m.group(1) if m else r.stdout[-500:])
    if os.path.exists(os.path.join(folder, "_mesh.md")): os.remove(os.path.join(folder, "_mesh.md"))
    if not m: ps.berhenti("output mesh tidak ada")
    # ---- baca tegangan elemen (kN/mm2 -> MPa)
    L_ = open(m.group(1), encoding="latin-1", errors="replace").read().splitlines()
    S = {}; el_ = None
    for i, s in enumerate(L_):
        m1 = re.match(r"^\s+(\d+)\s+(\d+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*$", s)
        m2 = re.match(r"^\s{10,}(\d+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*$", s)
        if m1: el_, lc = int(m1.group(1)), int(m1.group(2))
        elif m2 and el_: lc = int(m2.group(1))
        else: continue
        v = L_[i + 1].split()
        if len(v) >= 5: S[(el_, lc)] = dict(VT=float(v[0]) * 1e3, VB=float(v[1]) * 1e3, SX=float(v[2]) * 1e3)
    a_ = math.sqrt(E * pr["Cw"] / (Gm * pr["J"])); e0 = pr["e0"]
    def Wn(zp): return hp / 2 * (zp - e0)                 # zp diukur dari garis tengah web
    dz = zs_f[-1] - zs_f[-2]; z_tip = bp - dz / 2         # titik berat elemen ujung sayap
    def maks(daftar, lc, kunci="SX"):
        return max((abs(S[(e, lc)][kunci]) for e in daftar if (e, lc) in S), default=float("nan"))
    def vm(daftar, lc): return max((max(S[(e, lc)]["VT"], S[(e, lc)]["VB"]) for e in daftar if (e, lc) in S), default=float("nan"))
    ujung_k = [e for e, j, k, xf in kol["sayap"] if j == 0 and k == len(zs_f) - 2]
    ujung_l = [e for e, i, k, yf in lg["sayap"] if i == i_root and k == len(zs_f) - 2]
    yk0 = (ys[0] + ys[1]) / 2; xl0 = (xa[i_root] + xa[i_root + 1]) / 2
    hasil = ["| Kasus | Lokasi | Mesh SX ujung sayap (MPa) | DG9 pangkal = muka tiang (MPa) | DG9 pangkal = sumbu tiang (MPa) |", "|---|---|---|---|---|"]
    # kasus 1: torsi lengan (kopel di x = xp)
    for nama_, L0 in (("muka", hp / 2), ("sumbu", 0.0)):
        pass
    sw1 = [bimomen(T1 * 1e6, a_, kanan - r0, xp - r0, xl0 - r0) * Wn(z_tip) / pr["Cw"] for r0 in (hp / 2, 0.0)]
    hasil.append(f"| 1. Torsi murni lengan 1 kNm di x = {xp:.0f} | pangkal lengan (x = {xl0:.0f} mm) | {maks(ujung_l, 1):.1f} | {sw1[0]:.1f} | {sw1[1]:.1f} |")
    sw2 = bimomen(T1 * 1e6, a_, ybf, yT, yk0) * Wn(z_tip) / pr["Cw"]
    hasil.append(f"| 2. Torsi murni tiang 1 kNm di y = {yT:.0f} | dasar tiang (y = {yk0:.0f} mm) | {maks(ujung_k, 2):.1f} | {sw2:.1f} (dasar jepit) | – |")
    # kasus 3: beban pipa sebenarnya
    Sz = pr["Ix"] / (h / 2)
    Iy = (2 * tf * b ** 3 / 12 + 2 * b * tf * (b / 2 - cy) ** 2 + (h - 2 * tf) * tw ** 3 / 12 + (h - 2 * tf) * tw * (cy - tw / 2) ** 2)
    Sy = Iy / (b - cy)
    zc_ = zc - zw                                           # kontak pipa dari garis tengah web
    # tiang dasar
    N_ = Po * 1e3; Mz = Po * 1e3 * xp; Mx = Ff * 1e3 * (ytf + tf / 2) + Po * 1e3 * abs(zc); Tt = Ff * 1e3 * xp
    sb_t = N_ / pr["A"] + Mz / Sz + Mx / Sy
    sw_t_ujung = bimomen(Tt, a_, ybf, ybf, 0) * pr["Wn"] / pr["Cw"]
    # lengan pangkal (muka tiang)
    r0 = hp / 2
    Mz_l = Po * 1e3 * (xp - r0); My_l = Ff * 1e3 * (xp - r0)
    Tl = Po * 1e3 * (zc_ + e0) + Ff * 1e3 * (h / 2)
    sb_l = Mz_l / Sz + My_l / Sy
    sw_l_ujung = bimomen(Tl, a_, kanan - r0, kanan - r0, 0) * pr["Wn"] / pr["Cw"]
    sw_l_c = bimomen(Tl, a_, kanan - r0, xp - r0, 0) * pr["Wn"] / pr["Cw"]
    kol0 = [e for e, j, *_ in kol["web"] + kol["sayap"] if j == 0]
    lg0 = [e for e, i, *_ in lg["web"] + lg["sayap"] if i == i_root]
    hasil += ["", "| Kasus 3: Po + friksi | Mesh maks SX (MPa) | Mesh maks von Mises (MPa) | Balok: σb (MPa) | Balok: σw torsi di ujung | Balok: σw torsi di posisi pipa | σb+σw (H3.3, jumlah mutlak) |",
              "|---|---|---|---|---|---|---|",
              f"| Dasar tiang | {maks(kol0, 3):.1f} | {vm(kol0, 3):.1f} | {sb_t:.1f} | {sw_t_ujung:.1f} | {sw_t_ujung:.1f} (torsi di puncak) | {sb_t + sw_t_ujung:.1f} |",
              f"| Pangkal lengan | {maks(lg0, 3):.1f} | {vm(lg0, 3):.1f} | {sb_l:.1f} | {sw_l_ujung:.1f} | {sw_l_c:.1f} | {sb_l + sw_l_c:.1f} |"]
    md = os.path.join(folder, f"{a.tipe} - Validasi Mesh.md")
    teks = [f"# Validasi torsi {a.tipe}: model balok + DG9 vs model pelat STAAD", "",
            f"Mesh {len(N)} node / {len(E_)} elemen shell (±{el:.0f} mm), web & sayap di garis tengah pelat, dasar tiang jepit penuh, "
            f"lengan menyatu dengan puncak tiang. {pr['nama']}: J = {pr['J'] / 1e4:.2f} cm⁴, Cw = {pr['Cw'] / 1e6:.0f} cm⁶, "
            f"a = {a_:.0f} mm, e0 = {e0:.1f} mm. Po = {Po:.2f} kN, Ff = {Ff:.2f} kN di x = {xp:.0f} mm, tengah sayap atas.", ""] + hasil + [""]
    open(md, "w", encoding="utf-8").write("\n".join(teks))
    print("\n".join(hasil)); print(f"LAPORAN: {md}")

if __name__ == "__main__":
    main()
