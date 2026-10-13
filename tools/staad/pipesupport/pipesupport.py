# pipesupport.py
# Generator pipe support UNP / siku sama kaki tunggal (tipe T, |-, Γ, dan bertingkat) untuk STAAD.Pro 2025 - ASCE 7-22 + AISC 360-22.
# - Tiang UNP vertikal (tumpuan jepit), lengan UNP duduk di atas puncak tiang (MEMBER OFFSET), lengan level
#   bawah menempel di samping tiang.
# - Beban pipa dihitung dari DN/schedule/isi/insulasi/span (kosong, operasi, hydrotest), friksi sesuai jenis
#   tumpuan (rest/guide/stop), angin ASCE 7-22 Ch.29 pada pipa & struktur, gempa via generator IBC 2018 STAAD
#   (SDS/SD1 ASCE 7-22, berat = struktur + pipa operasi).
# - Torsi UNP dimasukkan eksplisit: beban vertikal pipa terhadap PUSAT GESER lengan (STAAD memuntir terhadap
#   titik berat), friksi/angin di atas sayap terhadap sumbu lengan, gaya arah badan tiang terhadap pusat geser tiang.
# - Opsi --jalankan: running engine (lewat skill staad-cek) + cek torsi AISC 360-22 H3.3 (DG9, kantilever).
#
#   python -I pipesupport.py --config "<proyek>.ps.json" [--jalankan]
import shutil, argparse, importlib.util, json, math, os, re, sqlite3, subprocess, sys

sys.stdout.reconfigure(encoding="utf-8")
G_ = 9.81
DB = r"C:\Program Files\Bentley\Engineering\STAAD.Pro 2025\STAAD\SPPM\Program\SectionMap1.sqlite"
CEK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "cek", "cek_staad.py")   # repo: tools/staad/cek

def berhenti(p):
    print("BERHENTI: " + p); sys.exit(1)

def f3(x):
    s = f"{x:.4f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s

# ---------------------------------------------------------------- pipa ASME B36.10M (OD mm, tebal mm)
OD = {15: 21.3, 20: 26.7, 25: 33.4, 32: 42.2, 40: 48.3, 50: 60.3, 65: 73.0, 80: 88.9, 100: 114.3, 125: 141.3,
      150: 168.3, 200: 219.1, 250: 273.1, 300: 323.9, 350: 355.6, 400: 406.4, 450: 457.0, 500: 508.0, 600: 610.0}
TEBAL = {
    "STD": {15: 2.77, 20: 2.87, 25: 3.38, 32: 3.56, 40: 3.68, 50: 3.91, 65: 5.16, 80: 5.49, 100: 6.02, 125: 6.55,
            150: 7.11, 200: 8.18, 250: 9.27, 300: 9.53, 350: 9.53, 400: 9.53, 450: 9.53, 500: 9.53, 600: 9.53},
    "40":  {15: 2.77, 20: 2.87, 25: 3.38, 32: 3.56, 40: 3.68, 50: 3.91, 65: 5.16, 80: 5.49, 100: 6.02, 125: 6.55,
            150: 7.11, 200: 8.18, 250: 9.27, 300: 10.31, 350: 11.13, 400: 12.70, 450: 14.27, 500: 15.09, 600: 17.48},
    "XS":  {15: 3.73, 20: 3.91, 25: 4.55, 32: 4.85, 40: 5.08, 50: 5.54, 65: 7.01, 80: 7.62, 100: 8.56, 125: 9.53,
            150: 10.97, 200: 12.70, 250: 12.70, 300: 12.70, 350: 12.70, 400: 12.70, 450: 12.70, 500: 12.70, 600: 12.70},
    "80":  {15: 3.73, 20: 3.91, 25: 4.55, 32: 4.85, 40: 5.08, 50: 5.54, 65: 7.01, 80: 7.62, 100: 8.56, 125: 9.53,
            150: 10.97, 200: 12.70, 250: 15.09, 300: 17.48, 350: 19.05, 400: 21.44, 450: 23.83, 500: 26.19, 600: 30.96},
}
# koefisien situs SNI 1726:2019 Tabel 6 (Fa) & 7 (Fv) = ASCE 7-16 (sel "site-specific" diisi nilai SNI)
SS_TITIK = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5]
S1_TITIK = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6]
FA_TAB = {"A": [0.8] * 6, "B": [0.9] * 6, "C": [1.3, 1.3, 1.2, 1.2, 1.2, 1.2],
          "D": [1.6, 1.4, 1.2, 1.1, 1.0, 1.0], "E": [2.4, 1.7, 1.3, 1.1, 0.9, 0.8]}
FV_TAB = {"A": [0.8] * 6, "B": [0.8] * 6, "C": [1.5, 1.5, 1.5, 1.5, 1.5, 1.4],
          "D": [2.4, 2.2, 2.0, 1.9, 1.8, 1.7], "E": [4.2, 3.3, 2.8, 2.4, 2.2, 2.0]}
SCLASS_NO = {"A": 1, "B": 2, "C": 3, "D": 4, "E": 5}

def interp_tab(x, xs, ys):
    if x <= xs[0]: return ys[0]
    if x >= xs[-1]: return ys[-1]
    for i in range(len(xs) - 1):
        if xs[i] <= x <= xs[i + 1]:
            return ys[i] + (ys[i + 1] - ys[i]) * (x - xs[i]) / (xs[i + 1] - xs[i])

RHO_ISI = {"air": 1000, "minyak": 850, "kondensat": 750, "gas": 0, "kosong": 0}

def beban_pipa(p):
    DN = int(p["DN"]); sch = str(p.get("sch", "STD")).upper()
    od = float(p.get("OD_mm") or OD.get(DN) or berhenti(f"DN {DN} tidak ada di tabel; isi OD_mm"))
    t = float(p.get("t_mm") or TEBAL.get(sch, {}).get(DN) or berhenti(f"schedule {sch} DN {DN} tidak ada; isi t_mm"))
    di = od - 2 * t
    span = float(p["span"])
    ti = float(p.get("insulasi_mm", 0)); rho_i = float(p.get("rho_insulasi", 150))
    isi = p.get("isi", "air")
    rho_c = float(p.get("rho_isi", RHO_ISI.get(str(isi).lower(), 1000)))
    A_s = math.pi / 4 * (od ** 2 - di ** 2) * 1e-6
    A_i = math.pi / 4 * ((od + 2 * ti) ** 2 - od ** 2) * 1e-6
    A_c = math.pi / 4 * di ** 2 * 1e-6
    w_s = A_s * 7850 * G_ / 1000; w_i = A_i * rho_i * G_ / 1000
    w_c = A_c * rho_c * G_ / 1000; w_t = A_c * 1000 * G_ / 1000
    Pe = (w_s + w_i) * span + float(p.get("tambahan_kN", 0))
    return dict(od=od, t=t, Dluar=(od + 2 * ti) / 1000, Pe=Pe, Po=Pe + w_c * span, Pt=Pe + w_t * span,
                w_s=w_s, w_i=w_i, w_c=w_c, w_t=w_t)

# ---------------------------------------------------------------- profil UNP (database STAAD, read-only)
def dimensi_unp(nama):
    con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    r = con.execute("select SpcName from JP where StaadName = ? and StaadTable = 'Channel'", (nama.upper(),)).fetchone()
    if not r: berhenti(f"profil {nama} tidak ada di tabel kanal JAPANESE STAAD (contoh: C150X75X6.5)")
    m = re.match(r"CH([\d.]+)X([\d.]+)X([\d.]+)X([\d.]+)", r[0])
    h, b, tw, tf = (float(x) for x in m.groups())
    # properti tanpa fillet (garis tengah pelat untuk torsi)
    A = 2 * b * tf + (h - 2 * tf) * tw
    cy = (2 * b * tf * b / 2 + (h - 2 * tf) * tw * tw / 2) / A           # titik berat dari punggung web
    Ix = (b * h ** 3 - (b - tw) * (h - 2 * tf) ** 3) / 12
    hp, bp = h - tf, b - tw / 2
    e0 = bp ** 2 * hp ** 2 * tf / (4 * Ix)                               # pusat geser dari garis tengah web
    x0 = e0 + cy - tw / 2                                                # pusat geser dari titik berat
    J = (2 * bp * tf ** 3 + hp * tw ** 3) / 3
    Cw = tf * bp ** 3 * hp ** 2 / 12 * (3 * bp * tf + 2 * hp * tw) / (6 * bp * tf + hp * tw)
    Wn = max(e0 * hp / 2, (bp - e0) * hp / 2)
    Sw = tf * hp * (bp - e0) ** 2 / 4
    return dict(nama=nama.upper(), jenis="UNP", h=h, b=b, tw=tw, tf=tf, A=A, cy=cy, Ix=Ix, e0=e0, x0=x0, y0=0.0, J=J, Cw=Cw,
                Wn=Wn, Sw=Sw, e_atas=h / 2)

def dimensi_siku(nama):
    """Siku sama kaki (tabel Angle JAPANESE STAAD). Orientasi lengan: kaki horizontal di atas (tumit di atas), kaki
    vertikal ke bawah; ujung kaki horizontal ke 'ujung_sayap'. Pusat geser = tumit (perpotongan garis tengah kaki):
    x0 di belakang titik berat (arah punggung kaki vertikal), y0 di atas titik berat. Warping diabaikan (AISC DG9 4.1)."""
    con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    r = con.execute("select SpcName from JP where StaadName = ? and StaadTable = 'Angle'", (nama.upper(),)).fetchone()
    if not r: berhenti(f"profil {nama} tidak ada di tabel siku JAPANESE STAAD (contoh: L50X50X6)")
    m = re.match(r"EA([\d.]+)X([\d.]+)X([\d.]+)", r[0])
    L, L2, t = (float(x) for x in m.groups())
    if abs(L - L2) > 1e-9: berhenti(f"profil {nama}: baru siku sama kaki yang didukung")
    A = t * (2 * L - t)
    cy = (L * t * t / 2 + (L - t) * t * (t + (L - t) / 2)) / A           # titik berat dari punggung kaki (sama dua arah)
    Ix = (t * L ** 3 / 12 + L * t * (L / 2 - cy) ** 2
          + (L - t) * t ** 3 / 12 + (L - t) * t * (t / 2 - cy) ** 2)      # sumbu geometrik
    Ixy = -(L * t * (t / 2 - cy) * (L / 2 - cy) + (L - t) * t * (t + (L - t) / 2 - cy) * (t / 2 - cy))
    Iu, Iv = Ix + abs(Ixy), Ix - abs(Ixy)                                  # sumbu kuat (simetri) / lemah
    J = (2 * L - t) * t ** 3 / 3
    Lp = L - t / 2
    Cw = t ** 3 / 36 * 2 * Lp ** 3
    x0 = cy - t / 2
    return dict(nama=nama.upper(), jenis="L", h=L, b=L, tw=t, tf=t, A=A, cy=cy, Ix=Ix, Iu=Iu, Iv=Iv,
                Su=Iu / (L / math.sqrt(2)), Sv=Iv / (math.sqrt(2) * cy), e0=0.0, x0=x0, y0=x0, J=J, Cw=Cw,
                Wn=0.0, Sw=0.0, e_atas=cy)

def dimensi_profil(nama):
    return dimensi_siku(nama) if nama.upper().startswith("L") else dimensi_unp(nama)

# ---------------------------------------------------------------- ASCE 7-22 angin
EKSPOSUR = {"B": (7.5, 3280 * 0.3048), "C": (9.8, 2460 * 0.3048), "D": (11.5, 1935 * 0.3048)}
def Kz(z, eks):
    a, zg = EKSPOSUR[eks]; return 2.41 * (max(z, 4.572) / zg) ** (2.0 / a)

# =============================================================== generator satu tipe
def buat_tipe(tp, um, folder):
    nama = tp["nama"]
    mat = um.get("material", {})
    E = float(mat.get("E_MPa", 205000)); Fy = float(mat.get("Fy_MPa", 240)); Fu = float(mat.get("Fu_MPa", 370))
    ti = tp["tiang"]; pt = dimensi_profil(ti["profil"])
    toe_t = 1 if str(ti.get("ujung_sayap", "+Z")).upper().startswith("+") else -1
    H = float(ti["tinggi"])                      # puncak baja tiang dari dasar (m)
    levels = sorted(tp["level"], key=lambda l: -(l.get("elev") or 1e9))
    lap, cat = [], []
    J, M, grup = {}, {}, {}
    def joint(x, y):
        key = (round(x, 4), round(y, 4))
        for k, v in J.items():
            if (round(v[0], 4), round(v[1], 4)) == key: return k
        n = len(J) + 1; J[n] = (x, y); return n
    j0 = joint(0, 0)
    # ---- level & joint
    info = []
    for i, lv in enumerate(levels):
        pl = dimensi_profil(lv.get("profil", ti["profil"]))
        atas = i == 0 and lv.get("elev") is None
        if atas and pl["jenis"] == "L":
            # lengan siku dilas di puncak tiang (tiang naik sampai bawah kaki horizontal lengan): sumbu lengan =
            # puncak model tiang, 'tinggi' tiang = T.O.S - dasar - e_atas lengan (jarak tepi atas ke titik berat)
            y = H
        elif atas:
            y = H + float(lv.get("tebal_cap_mm", 0)) / 1000 + pl["h"] / 2000
        else:
            if lv.get("elev") is None: berhenti("hanya level teratas yang boleh tanpa 'elev' (duduk di atas tiang)")
            y = float(lv["elev"])
            if y >= H: berhenti(f"level elev {y} harus di bawah puncak tiang {H}")
        kiri, kanan = float(lv.get("kiri", 0)), float(lv.get("kanan", 0))
        toe = 1 if str(lv.get("ujung_sayap", "+Z")).upper().startswith("+") else -1
        xs = {-kiri, 0.0, kanan}
        for p in lv.get("pipa", []):
            x = float(p["x"])
            if x < -kiri - 1e-6 or x > kanan + 1e-6: berhenti(f"pipa {p.get('nama')} x={x} di luar lengan")
            xs.add(round(x, 4))
        xs = sorted(xs)
        info.append(dict(lv=lv, pl=pl, y=y, atas=atas, xs=xs, toe=toe, kiri=kiri, kanan=kanan))
    yk = sorted({0.0} | {inf["y"] for inf in info if not inf["atas"]} | {info[0]["y"] if info[0]["atas"] else H})
    col = []
    for a_, b_ in zip(yk[:-1], yk[1:]):
        n = len(M) + 1; M[n] = (joint(0, a_), joint(0, b_)); col.append(n)
    grup["_TIANG"] = col
    lengan, ujung_m, ujung_j, akar = [], [], [], []
    for li, inf in enumerate(info):
        js = [joint(x, inf["y"]) for x in inf["xs"]]
        ms = []
        for a_, b_ in zip(js[:-1], js[1:]):
            n = len(M) + 1; M[n] = (a_, b_); ms.append(n)
        inf["members"] = ms; lengan += ms
        if inf["kiri"] > 0: ujung_m.append(ms[0]); ujung_j.append(js[0])
        if inf["kanan"] > 0: ujung_m.append(ms[-1]); ujung_j.append(js[-1])
        jc = joint(0, inf["y"])
        for m in ms:
            if jc in M[m]: akar.append((m, jc, li, "kiri" if J[M[m][1]][0] <= 1e-9 else "kanan"))
        grup[f"_LENGAN_L{li + 1}"] = ms
    grup["_LENGAN"] = lengan; grup["_UJUNG_LENGAN"] = ujung_m

    # ---- lampiran geometri
    lap += [f"## {nama}", "", "| Bagian | Nilai |", "|---|---|",
            f"| Tiang | {pt['nama']} (h {pt['h']:.0f} × b {pt['b']:.0f} × tw {pt['tw']} × tf {pt['tf']} mm), tinggi {H} m, jepit, ujung sayap {'+' if toe_t > 0 else '-'}Z |"]
    for li, inf in enumerate(info):
        dudukan = ("dilas di puncak tiang (kaki horizontal di atas)" if inf["pl"]["jenis"] == "L" else "duduk di atas tiang") \
            if inf["atas"] else "menempel di samping tiang"
        lap.append(f"| Level {li + 1} | {inf['pl']['nama']}, {dudukan}, "
                   f"sumbu lengan y = {inf['y']:.3f} m, kiri {inf['kiri']} m, kanan {inf['kanan']} m |")
    for pr_ in [pt] + [inf["pl"] for inf in info]:
        if pr_["jenis"] == "L":
            lap += ["", f"Siku {pr_['nama']}: titik berat {pr_['cy']:.1f} mm dari punggung kaki; pusat geser di tumit, "
                    f"x0 = y0 = {pr_['x0']:.1f} mm dari titik berat; Iu = {pr_['Iu'] / 1e4:.2f} cm⁴, Iv = {pr_['Iv'] / 1e4:.2f} cm⁴, "
                    f"J = {pr_['J'] / 1e4:.3f} cm⁴ (tanpa fillet). Orientasi STAAD: BETA ANGLE / RANGLE (kaki sejajar sumbu global)."]
            break
    if pt["jenis"] == "UNP":
        lap += ["", f"Pusat geser UNP {pt['nama']}: e0 = {pt['e0']:.1f} mm di belakang garis tengah web, "
                f"x0 = {pt['x0']:.1f} mm dari titik berat (dihitung tanpa fillet)."]
    lap += [""]

    # ---- beban pipa
    ang = um["angin"]; V = float(ang["V"]); eks = ang.get("eksposur", "C").upper()
    Kd, Kzt, Gf = float(ang.get("Kd", 0.85)), float(ang.get("Kzt", 1.0)), float(ang.get("G", 0.85))
    Ke = math.exp(-0.000119 * float(ang.get("elevasi_tanah_m", 0)))
    q_min = float(ang.get("q_min_kPa", 0)); p_min = float(ang.get("p_min_kPa", 0))
    def q(z): return max(0.613 * Kz(z, eks) * Kzt * Ke * V ** 2 / 1000.0, q_min)
    def pw(qz, Cf): return max(qz * Kd * Gf * Cf, p_min)          # tekanan desain, minimum ASCE 7-22 29.7 (0.77 kPa x Af)
    REF = []
    def ref(lt, judul, baris):
        k = f"R{len(REF) + 1}"; REF.append((k, lt, judul, baris)); return k
    jl = {"PE": [], "PC": [], "PTC": [], "FZ": [], "FX": [], "WX": []}   # (joint, FX,FY,FZ,MX,MY,MZ)
    tab = ["| Pipa | Lvl | x (m) | DN/sch | Isi | Span | Pe (kN) | Po (kN) | Pt (kN) | Tumpuan | Ff (kN) | e torsi (mm) | Wx (kN) |",
           "|---|---|---|---|---|---|---|---|---|---|---|---|---|"]
    total_po = 0.0
    for li, inf in enumerate(info):
        pl, toe = inf["pl"], inf["toe"]
        z_sc = toe * (-pl["x0"]) / 1000
        for p in inf["lv"].get("pipa", []):
            bp = beban_pipa(p); x = float(p["x"]); jj = joint(x, inf["y"])
            pos = p.get("posisi_sayap", "tengah")
            zl = (pl["b"] / 2 - pl["cy"]) if pos == "tengah" else ((pl["tw"] / 2 - pl["cy"]) if pos == "web" else float(pos) - pl["cy"])
            zp = toe * zl / 1000
            shoe = float(p.get("shoe_mm", 0)) / 1000
            dy_f = pl["e_atas"] / 1000 + shoe               # friksi bekerja di dasar pipa/shoe
            y_sc = pl["y0"] / 1000                          # pusat geser di atas titik berat (siku: tumit)
            dy_w = dy_f + bp["Dluar"] / 2                   # angin pada sumbu pipa
            e_v = zp - z_sc                                 # eksentrisitas beban vertikal terhadap pusat geser
            def vert(P): return (jj, 0, -P, 0, P * e_v, 0, 0)          # MX = -(zp - zsc)*FY
            jl["PE"].append(vert(bp["Pe"]))
            jl["PC"].append(vert(bp["Po"] - bp["Pe"]))
            jl["PTC"].append(vert(bp["Pt"] - bp["Pe"]))
            total_po += bp["Po"]
            jenis = str(p.get("tumpuan", "rest")).lower(); mu = float(p.get("mu", 0.3))
            if jenis in ("rest", "guide"): Ff = mu * bp["Po"]
            elif jenis == "stop": Ff = float(p.get("F_stop_kN") or berhenti(f"pipa {p.get('nama')}: tumpuan stop butuh F_stop_kN"))
            else: berhenti(f"jenis tumpuan '{jenis}' belum didukung (rest/guide/stop)")
            jl["FZ"].append((jj, 0, 0, Ff, (dy_f - y_sc) * Ff, 0, 0))        # MX = FZ x lengan ke pusat geser
            if jenis == "guide":
                Fg = float(p.get("F_guide_kN", mu * bp["Po"]))
                jl["FX"].append((jj, Fg, 0, 0, 0, zp * Fg, -dy_f * Fg))
            zpipa = inf["y"] + dy_w
            Dq = bp["Dluar"] * math.sqrt(q(zpipa) * 1000)
            Cf = float(ang.get("Cf_pipa") or (0.7 if Dq > 5.3 else 1.2))
            Wx = pw(q(zpipa), Cf) * bp["Dluar"] * float(p["span"])
            jl["WX"].append((jj, Wx, 0, 0, 0, zp * Wx, -dy_w * Wx))
            tab.append(f"| {p.get('nama', '-')} | {li + 1} | {x} | {p['DN']}/{p.get('sch', 'STD')} | {p.get('isi', 'air')} | {p['span']} | "
                       f"{bp['Pe']:.2f} | {bp['Po']:.2f} | {bp['Pt']:.2f} | {jenis} | {Ff:.2f} | {e_v * 1000:.0f} | {Wx:.3f} |")
    lap += ["### Beban pipa", "", "Pe = pipa + insulasi, Po = Pe + isi operasi, Pt = Pe + air hydrotest; "
            "Ff = μ·Po (rest/guide) arah sumbu pipa (Z); e torsi = jarak beban vertikal ke pusat geser lengan; "
            "Wx = maks(qz·Kd·G·Cf, p_min)·D·span (Cf = 1.2 bila D√qz ≤ 5.3, 0.7 bila lebih, ASCE 7-22 Fig. 29.4-1).", ""] + tab + [""]

    def baris_jl(daftar, skala=1.0):
        out = []
        for (j_, fx, fy, fz, mx, my, mz) in daftar:
            s = " ".join(f"{k} {f3(v * skala)}" for k, v in (("FX", fx), ("FY", fy), ("FZ", fz), ("MX", mx), ("MY", my), ("MZ", mz)) if abs(v * skala) > 1e-5)
            if s: out.append(f"{j_} {s}")
        return out
    # koreksi pusat geser TIANG: gaya arah badan tiang (X) di puncak -> torsi MY = x0_tiang * FX
    jtop = M[col[-1]][1]
    # pusat geser tiang relatif titik berat (xs, zs): UNP di belakang web (arah -toe Z); siku di tumit, kaki BETA ANGLE
    # +X/-Z (tanda ±180° tidak berpengaruh karena beban horizontal selalu dua arah). MY = -zs·Fx + xs·Fz.
    if pt["jenis"] == "L": xs_t, zs_t = -pt["x0"] / 1000, pt["x0"] / 1000
    else: xs_t, zs_t = 0.0, -toe_t * pt["x0"] / 1000
    def koreksi_tiang(daftar):
        Fx = sum(d[1] for d in daftar); Fz = sum(d[3] for d in daftar)
        My = -zs_t * Fx + xs_t * Fz
        return [(jtop, 0, 0, 0, 0, My, 0)] if abs(My) > 1e-9 else []

    # faktor berat sendiri (pelat, las, baut yang tidak dimodelkan); juga ikut berat seismik lewat REFERENCE LOAD
    k_sw = float(um.get("desain", {}).get("faktor_berat_sendiri", 1.0))
    sw = ref("Dead", "SELFWEIGHT" + (f" x {f3(k_sw)}" if k_sw != 1 else ""), [f"SELFWEIGHT Y -{f3(k_sw)}"])
    if k_sw != 1:
        lap += [f"Berat sendiri baja dikalikan {f3(k_sw)} (cover/base/stiffener plate, las, baut tidak dimodelkan); "
                "faktor sama dipakai pada berat seismik.", ""]
    rpe = ref("Dead", "PIPA KOSONG + INSULASI (Pe)", ["JOINT LOAD"] + baris_jl(jl["PE"]))
    rpc = ref("Dead", "ISI OPERASI", ["JOINT LOAD"] + baris_jl(jl["PC"]))
    rpt = ref("Dead", "ISI AIR HYDROTEST", ["JOINT LOAD"] + baris_jl(jl["PTC"]))
    fric = []
    for sg in (1, -1):
        b_ = baris_jl(jl["FZ"] + koreksi_tiang(jl["FZ"]), sg)
        if b_: fric.append((ref("Live", f"FRIKSI {'+' if sg > 0 else '-'}Z", ["JOINT LOAD"] + b_), f"FF{'+' if sg > 0 else '-'}Z"))
        g_ = baris_jl(jl["FX"] + koreksi_tiang(jl["FX"]), sg)
        if jl["FX"]: fric.append((ref("Live", f"GUIDE {'+' if sg > 0 else '-'}X", ["JOINT LOAD"] + g_), f"FG{'+' if sg > 0 else '-'}X"))
    # angin pada struktur (drag profil) + pipa
    Cfs = float(ang.get("Cf_struktur", 2.0))
    angin = []
    for ax in ("X", "Z"):
        for sg in (1, -1):
            isi = []
            ml = []
            for m in col:
                y1, y2 = J[M[m][0]][1], J[M[m][1]][1]
                lebar = (pt["b"] if ax == "X" else pt["h"]) / 1000
                ml.append(f"{m} UNI G{ax} {f3(sg * pw(q((y1 + y2) / 2), Cfs) * lebar)}")
            if ax == "Z":
                for inf in info:
                    for m in inf["members"]:
                        ml.append(f"{m} UNI GZ {f3(sg * pw(q(inf['y']), Cfs) * inf['pl']['h'] / 1000)}")
            isi += ["MEMBER LOAD"] + ml
            if ax == "X" and jl["WX"]:
                isi += ["JOINT LOAD"] + baris_jl(jl["WX"] + koreksi_tiang(jl["WX"]), sg)
            angin.append((ref("Wind", f"ANGIN {'+' if sg > 0 else '-'}{ax}", isi), f"W{'+' if sg > 0 else '-'}{ax}"))
    lap += [f"Angin: V = {V} m/s, eksposur {eks}, Kd {Kd}, G {Gf}, Kzt {Kzt}, Ke {Ke:.3f}; qz di sumbu lengan atas = "
            f"{q(info[0]['y']):.3f} kN/m²" + (f" (q min {q_min} kPa)" if q_min else "") + (f", tekanan minimum {p_min} kPa x Af (ASCE 7-22 29.7)" if p_min else "") + f". Drag profil Cf = {Cfs} (lebar tiang {pt['b']:.0f} mm arah X, {pt['h']:.0f} mm arah Z; "
            "sisi lengan arah Z). Angin arah Z (sejajar pipa) tidak membebani pipa.", ""]
    if not jl["WX"]: cat.append("Tidak ada pipa: angin hanya pada struktur.")

    # ---- gempa
    gm = um["gempa"]; rho = float(gm.get("rho", 1.0))
    RX = gm.get("RX", gm.get("R")); RZ = gm.get("RZ", gm.get("R"))
    if gm.get("Ss") is not None:
        # parameter peta + koefisien situs (mis. SNI 1726:2019) langsung ke generator, sama dengan hitungan proyek
        Ss_, S1_ = float(gm["Ss"]), float(gm["S1"])
        kls = str(gm.get("kelas_situs", "")).upper().strip()
        if len(kls) == 2 and kls.startswith("S"): kls = kls[1]          # "SE" (SNI) -> "E"
        if gm.get("Fa") is not None and gm.get("Fv") is not None:
            Fa_, Fv_ = float(gm["Fa"]), float(gm["Fv"])
        elif kls in FA_TAB:
            Fa_, Fv_ = round(interp_tab(Ss_, SS_TITIK, FA_TAB[kls]), 3), round(interp_tab(S1_, S1_TITIK, FV_TAB[kls]), 3)
            gm.setdefault("sumber_koef", f"SNI 1726:2019 Tabel 6 & 7, kelas situs S{kls}, interpolasi linear")
        else:
            berhenti("gempa: isi Fa & Fv, atau kelas_situs A-E (kelas F perlu analisis spesifik situs)")
        scl = gm.get("SCLASS", SCLASS_NO.get(kls, 4))
        SDS, SD1 = 2 / 3 * Fa_ * Ss_, 2 / 3 * Fv_ * S1_
        ibc1 = f"SS {f3(Ss_)} S1 {f3(S1_)} I {gm.get('Ie', 1.0)} RX {RX} RZ {RZ} SCLASS {scl} -"
        ibc2 = f"TL {gm.get('TL', 8)} FA {f3(Fa_)} FV {f3(Fv_)}"
        ket_g = (f"Gempa: Ss {Ss_}, S1 {S1_}, Fa {Fa_}, Fv {Fv_} ({gm.get('sumber_koef', 'koefisien situs dari user')}) "
                 f"-> SDS = 2/3·Fa·Ss = {SDS:.3f}, SD1 = 2/3·Fv·S1 = {SD1:.3f}, langsung ke generator IBC 2018, ")
    else:
        SDS, SD1 = float(gm["SDS"]), float(gm["SD1"])
        ibc1 = f"SS {f3(1.5 * SDS)} S1 {f3(1.5 * SD1)} I {gm.get('Ie', 1.0)} RX {RX} RZ {RZ} SCLASS {gm.get('SCLASS', 4)} -"
        ibc2 = f"TL {gm.get('TL', 8)} FA 1 FV 1"
        ket_g = f"Gempa: SDS {SDS}, SD1 {SD1} (ASCE 7-22) lewat generator IBC 2018 (SS = 1.5·SDS, S1 = 1.5·SD1, FA = FV = 1), "
    ibc2 += (f" PX {gm['PX']}" if gm.get("PX") else "") + (f" PZ {gm['PZ']}" if gm.get("PZ") else "")
    lap += [ket_g +
            f"R = {RX}/{RZ} (X/Z), Ie {gm.get('Ie', 1.0)}, ρ {rho}; berat seismik = berat sendiri + pipa operasi "
            f"(Σ Po = {total_po:.2f} kN). Koreksi pusat geser tiang untuk gaya gempa arah X tidak ditambahkan "
            "(gaya dibangkitkan STAAD) - lihat cek torsi.", ""]

    # ---- primer & kombinasi
    primer = [(1, "Seismic-H", "EX", "IBC LOAD X 1"), (2, "Seismic-H", "EZ", "IBC LOAD Z 1")]
    EX, EZ = 1, 2
    D, PE, PO, PT = 3, 4, 5, 6
    primer += [(D, "Dead", "D STRUKTUR", [(sw, 1)]), (PE, "Dead", "PIPA KOSONG Pe", [(rpe, 1)]),
               (PO, "Dead", "PIPA OPERASI Po", [(rpe, 1), (rpc, 1)]), (PT, "Dead", "PIPA HYDROTEST Pt", [(rpe, 1), (rpt, 1)])]
    no = 7; FF, W = [], []
    for r_, j_ in fric: primer.append((no, "Live", j_, [(r_, 1)])); FF.append((no, j_)); no += 1
    for r_, j_ in angin: primer.append((no, "Wind", j_, [(r_, 1)])); W.append((no, j_)); no += 1
    def eset(f):
        out = []
        for u, k, nu, nk in ((EX, EZ, "X", "Z"), (EZ, EX, "Z", "X")):
            for s1 in (1, -1):
                for s2 in (1, -1):
                    out.append((f"{f3(f * rho)}E{nu}{'+' if s1 > 0 else '-'}{f3(0.3 * f * rho)}E{nk}{'+' if s2 > 0 else '-'}",
                                [(u, s1 * f * rho), (k, s2 * 0.3 * f * rho)]))
        return out
    kt = float(um.get("kombinasi", {}).get("faktor_angin_hydrotest", 0))
    hydro = bool(um.get("kombinasi", {}).get("hydrotest", True))   # False bila Test = Operating (kombinasi Pt identik)
    asd = [("D+Po", [(D, 1), (PO, 1)])] + ([("D+Pt", [(D, 1), (PT, 1)])] if hydro else [])
    asd += [(f"D+Po+{j}", [(D, 1), (PO, 1), (n_, 1)]) for n_, j in FF]
    asd += [(f"D+Po+0.6{j}", [(D, 1), (PO, 1), (n_, 0.6)]) for n_, j in W]
    if kt and hydro: asd += [(f"D+Pt+{f3(0.6 * kt)}{j}", [(D, 1), (PT, 1), (n_, 0.6 * kt)]) for n_, j in W]
    asd += [(f"0.6(D+Pe)+0.6{j}", [(D, 0.6), (PE, 0.6), (n_, 0.6)]) for n_, j in W]
    asd += [(f"(1+0.14SDS)(D+Po)+{j}", [(D, 1 + 0.14 * SDS), (PO, 1 + 0.14 * SDS)] + e) for j, e in eset(0.7)]
    asd += [(f"(0.6-0.14SDS)(D+Pe)+{j}", [(D, 0.6 - 0.14 * SDS), (PE, 0.6 - 0.14 * SDS)] + e) for j, e in eset(0.7)]
    lrfd = [("1.4(D+Po)", [(D, 1.4), (PO, 1.4)])] + ([("1.4(D+Pt)", [(D, 1.4), (PT, 1.4)])] if hydro else [])
    lrfd += [(f"1.4(D+Po+{j})", [(D, 1.4), (PO, 1.4), (n_, 1.4)]) for n_, j in FF]
    lrfd += [(f"1.2(D+Po)+1.0{j}", [(D, 1.2), (PO, 1.2), (n_, 1.0)]) for n_, j in W]
    if kt and hydro: lrfd += [(f"1.2(D+Pt)+{f3(kt)}{j}", [(D, 1.2), (PT, 1.2), (n_, kt)]) for n_, j in W]
    lrfd += [(f"0.9(D+Pe)+1.0{j}", [(D, 0.9), (PE, 0.9), (n_, 1.0)]) for n_, j in W]
    lrfd += [(f"(1.2+0.2SDS)(D+Po)+{j}", [(D, 1.2 + 0.2 * SDS), (PO, 1.2 + 0.2 * SDS)] + e) for j, e in eset(1.0)]
    lrfd += [(f"(0.9-0.2SDS)(D+Pe)+{j}", [(D, 0.9 - 0.2 * SDS), (PE, 0.9 - 0.2 * SDS)] + e) for j, e in eset(1.0)]
    mode_k = str(um.get("kombinasi", {}).get("mode", "")).lower()
    if mode_k == "design_basis":
        # Design basis proyek (ASCE 7-22, Tabel 15-2 ASD / 15-3 LRFD): L = Lr = I = SP = Vh = E(.) = 0,
        # T = friksi pipa (±Z), P(T) = P(O) bila hydrotest False. LRFD operating gempa dikoreksi ke P(O)+T
        # dan ditambah (1.2+0.2SDS)[D+P(O)+T]+EQ (keputusan user 13-Okt-2026).
        TT = [(n_, "T" + j[2:]) for n_, j in FF] or [(None, "")]
        def tt(n_, f): return [(n_, f)] if n_ else []
        PTX, lbt = (PT, "Pt") if hydro else (PO, "Pt(=Po)")
        asd = [("D+Pe", [(D, 1), (PE, 1)])]
        asd += [(f"D+Pe+0.6{j}", [(D, 1), (PE, 1), (n_, 0.6)]) for n_, j in W]
        asd += [(f"0.6(D+Pe)+0.6{j}", [(D, 0.6), (PE, 0.6), (n_, 0.6)]) for n_, j in W]
        asd += [(f"(1+0.14SDS)(D+Pe)+{j}", [(D, 1 + 0.14 * SDS), (PE, 1 + 0.14 * SDS)] + e) for j, e in eset(0.7)]
        asd += [(f"(1+0.105SDS)(D+Pe)+{j}", [(D, 1 + 0.105 * SDS), (PE, 1 + 0.105 * SDS)] + e) for j, e in eset(0.525)]
        asd += [(f"(0.6-0.14SDS)(D+Pe)+{j}", [(D, 0.6 - 0.14 * SDS), (PE, 0.6 - 0.14 * SDS)] + e) for j, e in eset(0.7)]
        asd += [(f"D+Po+{t}", [(D, 1), (PO, 1)] + tt(nt, 1)) for nt, t in TT]
        asd += [(f"D+Po+{t}+0.45{j}", [(D, 1), (PO, 1)] + tt(nt, 1) + [(n_, 0.45)]) for nt, t in TT for n_, j in W]
        asd += [(f"(1+0.105SDS)(D+Po)+{t}+{j}", [(D, 1 + 0.105 * SDS), (PO, 1 + 0.105 * SDS)] + tt(nt, 1) + e)
                for nt, t in TT for j, e in eset(0.525)]
        asd += [(f"D+{lbt}", [(D, 1), (PTX, 1)])]
        asd += [(f"D+{lbt}+0.45{j}", [(D, 1), (PTX, 1), (n_, 0.45)]) for n_, j in W]
        lrfd = [("1.4(D+Pe)", [(D, 1.4), (PE, 1.4)])]
        lrfd += [(f"1.2(D+Pe)+0.5{j}", [(D, 1.2), (PE, 1.2), (n_, 0.5)]) for n_, j in W]
        lrfd += [(f"1.2(D+Pe)+1.0{j}", [(D, 1.2), (PE, 1.2), (n_, 1.0)]) for n_, j in W]
        lrfd += [(f"0.9(D+Pe)+1.0{j}", [(D, 0.9), (PE, 0.9), (n_, 1.0)]) for n_, j in W]
        lrfd += [(f"(1.2+0.2SDS)(D+Pe)+{j}", [(D, 1.2 + 0.2 * SDS), (PE, 1.2 + 0.2 * SDS)] + e) for j, e in eset(1.0)]
        lrfd += [(f"(0.9-0.2SDS)(D+Pe)+{j}", [(D, 0.9 - 0.2 * SDS), (PE, 0.9 - 0.2 * SDS)] + e) for j, e in eset(1.0)]
        lrfd += [(f"1.2(D+Po+{t})", [(D, 1.2), (PO, 1.2)] + tt(nt, 1.2)) for nt, t in TT]
        for fw in (0.5, 1.0):
            lrfd += [(f"1.2(D+Po+{t})+{fw}{j}", [(D, 1.2), (PO, 1.2)] + tt(nt, 1.2) + [(n_, fw)]) for nt, t in TT for n_, j in W]
        lrfd += [(f"0.9(D+Po+{t})+1.0{j}", [(D, 0.9), (PO, 0.9)] + tt(nt, 0.9) + [(n_, 1.0)]) for nt, t in TT for n_, j in W]
        lrfd += [(f"(1.2+0.2SDS)(D+Po+{t})+{j}", [(D, 1.2 + 0.2 * SDS), (PO, 1.2 + 0.2 * SDS)] + tt(nt, 1.2 + 0.2 * SDS) + e)
                 for nt, t in TT for j, e in eset(1.0)]
        lrfd += [(f"(0.9-0.2SDS)(D+Po+{t})+{j}", [(D, 0.9 - 0.2 * SDS), (PO, 0.9 - 0.2 * SDS)] + tt(nt, 0.9 - 0.2 * SDS) + e)
                 for nt, t in TT for j, e in eset(1.0)]
        lrfd += [(f"1.4(D+{lbt})", [(D, 1.4), (PTX, 1.4)])]
        lrfd += [(f"1.2(D+{lbt})+0.5{j}", [(D, 1.2), (PTX, 1.2), (n_, 0.5)]) for n_, j in W]
        lrfd += [(f"1.2(D+{lbt})+1.0{j}", [(D, 1.2), (PTX, 1.2), (n_, 1.0)]) for n_, j in W]
        lrfd += [(f"0.9(D+{lbt})+1.0{j}", [(D, 0.9), (PTX, 0.9), (n_, 1.0)]) for n_, j in W]
    if len(asd) > 99 or len(lrfd) > 199: berhenti("kombinasi terlalu banyak (ASD > 99 / LRFD > 199)")
    kombi = [(100 + i, j, s) for i, (j, s) in enumerate(asd, 1)] + [(300 + i, j, s) for i, (j, s) in enumerate(lrfd, 1)]
    kombi += [(501, "DRIFT EX+", [(EX, 1)]), (502, "DRIFT EZ+", [(EZ, 1)]), (503, "DRIFT EX-", [(EX, -1)]), (504, "DRIFT EZ-", [(EZ, -1)])]
    LC_ORDE2 = 601                                   # beban tetap D+Po, dianalisis PDELTA di akhir (cek simpangan orde-2)
    kombi += [(LC_ORDE2, "D+Po BEBAN TETAP ORDE-2 (PDELTA)", [(D, 1), (PO, 1)])]
    asd_no = [k[0] for k in kombi if 100 < k[0] < 200]; lrfd_no = [k[0] for k in kombi if 300 < k[0] < 500]
    if mode_k == "design_basis":
        gempa_ = lambda j: "EX" in j or "EZ" in j
        svc_grav = [n_ for n_, j, _ in kombi if 100 < n_ < 200 and not gempa_(j) and "W" not in j and not j.startswith("0.6")]
        svc_hor = [n_ for n_, j, _ in kombi if 100 < n_ < 200 and not gempa_(j) and not j.startswith("0.6") and ("W" in j or "+T" in j)]
        lc_tetap1 = [n_ for n_, j, _ in kombi if 100 < n_ < 200 and j == f"D+{lbt}"]
    else:
        svc_grav = [n_ for n_, j, _ in kombi if j in ("D+Po", "D+Pt")]
        lc_tetap1 = [n_ for n_, j, _ in kombi if j == "D+Po" and n_ < 200]
        svc_hor = [n_ for n_, j, _ in kombi if 100 < n_ < 200 and ("W" in j or "FF" in j or "FG" in j) and not j.startswith("0.6")]
    if mode_k == "design_basis":
        nama_p = {D: "D", PE: "Pe", PO: "Po", PT: "Pt", EX: "EX", EZ: "EZ"}
        nama_p.update({n_: "T" + j[2:] for n_, j in FF}); nama_p.update({n_: j for n_, j in W})
        lap += ["### Kombinasi - design basis proyek (ASCE 7-22, Tabel 15-2 ASD / 15-3 LRFD)", "",
                f"- ASD {asd_no[0]}–{asd_no[-1]}, LRFD {lrfd_no[0]}–{lrfd_no[-1]}, drift QE 501–504, beban tetap orde-2 601.",
                "- Pemetaan: P(E)/P(O)/P(T) = Pe/Po/Pt; T (thermal force) = friksi pipa μ·Po arah sumbu pipa (±Z); "
                "L, Lr, I, SP, Vh, Vi dan beban equipment E(·) = 0 (tidak ada). Angin dan gempa diambil ± untuk tiap arah; ρ = 1.0. "
                + ("P(T) = P(O) (Test = Operating). " if not hydro else "")
                + "Kombinasi yang menjadi identik setelah beban nol dihapus.",
                "- Koreksi design basis: baris LRFD Operating (0.9−0.2SDS)[D+E(E)+P(E)] dibaca (0.9−0.2SDS)[D+P(O)+T] "
                "dan ditambah (1.2+0.2SDS)[D+P(O)+T]+EQ (gempa operasi tidak tercantum), keputusan user.", "",
                "| L/C | Kombinasi | Faktor |", "|---|---|---|"]
        for n_, j, isi in kombi:
            if n_ < 500: lap.append(f"| {n_} | {j} | " + " + ".join(f"{f3(f)}·{nama_p.get(p_, p_)}" for p_, f in isi) + " |")
        lap.append("")
    else:
        lap += ["### Kombinasi (ASCE 7-22 §2.3/2.4 + praktik pipe support)", "",
                f"- ASD {asd_no[0]}–{asd_no[-1]}, LRFD {lrfd_no[0]}–{lrfd_no[-1]}, drift QE 501–504.",
                "- Friksi tidak dikombinasikan dengan angin/gempa (praktik umum, mis. PIP STC01015); "
                "isi pipa dianggap beban mati; Ev = 0.2·SDS·(D+Po).",
                f"- Hydrotest + angin: {'faktor ' + f3(kt) + ' × W' if kt else 'tidak dibuat (faktor_angin_hydrotest = 0)'}.", ""]

    # ---- desain
    ds = um.get("desain", {}); metode = ds.get("metode", "ASD").upper()
    unp_all = col + lengan
    tinggi_tiang = J[M[col[-1]][1]][1]

    # ---- tulis .std
    def bungkus(teks):
        if len(teks) <= 75: return [teks]
        h_, cur = [], ""
        for t in teks.split():
            if len(cur) + len(t) + 3 > 75: h_.append(cur + " -"); cur = t
            else: cur = (cur + " " + t).strip()
        return h_ + [cur]
    def daftar(nos): return " ".join(str(n_) for n_ in nos)
    def rekam(recs):
        """record 'a; b; c;' dipecah hanya di batas ';' (STAAD menolak record terpotong)."""
        h_, cur = [], ""
        for r_ in recs:
            if cur and len(cur) + len(r_) + 2 > 75: h_.append(cur); cur = ""
            cur += r_ + "; "
        return h_ + ([cur.rstrip()] if cur else [])
    out = ["STAAD SPACE", "START JOB INFORMATION", f"JOB NAME PIPE SUPPORT {nama}", "END JOB INFORMATION", "INPUT WIDTH 79",
           f"SET NL {len(REF) + len(primer) + len(kombi) + 20}", "*", "* " + "=" * 66,
           f"*  PIPE SUPPORT {nama} - {'siku' if pt['jenis'] == 'L' else 'UNP'} tunggal, dibuat skill staad-pipesupport (ASCE 7-22, AISC 360-22)",
           "*  Torsi terhadap pusat geser (UNP / tumit siku) sebagai JOINT LOAD MX/MY",
           "* " + "=" * 66, "UNIT METER KN", "JOINT COORDINATES"]
    out += rekam([f"{k} {f3(v[0])} {f3(v[1])} 0" for k, v in J.items()])
    out += ["MEMBER INCIDENCES"] + rekam([f"{k} {a_} {b_}" for k, (a_, b_) in M.items()])
    out += ["START GROUP DEFINITION", "MEMBER"] + [x for g, ms in grup.items() for x in bungkus(f"{g} {daftar(ms)}")]
    out += ["JOINT", f"_PUNCAK {jtop}", f"_UJUNG {daftar(ujung_j)}" if ujung_j else f"_UJUNG {jtop}", "END GROUP DEFINITION"]
    out += ["DEFINE MATERIAL START", "ISOTROPIC STEEL", f"E {f3(E * 1000)}", "POISSON 0.3", "DENSITY 76.8195", "ALPHA 1.2e-05",
            "DAMP 0.03", "TYPE STEEL", f"STRENGTH FY {f3(Fy * 1000)} FU {f3(Fu * 1000)} RY 1.5 RT 1.2", "END DEFINE MATERIAL",
            "MEMBER PROPERTY JAPANESE"]
    out += bungkus(f"{daftar(col)} TABLE ST {pt['nama']}")
    for inf in info: out += bungkus(f"{daftar(inf['members'])} TABLE ST {inf['pl']['nama']}")
    out += ["CONSTANTS", "MATERIAL STEEL ALL"]
    b180 = ([m for m in col] if toe_t < 0 and pt["jenis"] == "UNP" else []) + \
           [m for inf in info if inf["toe"] < 0 and inf["pl"]["jenis"] == "UNP" for m in inf["members"]]
    if b180: out += bungkus(f"BETA 180 MEMB {daftar(b180)}")
    # siku: kaki sejajar sumbu global (diuji di STAAD 2025: lengan arah X, BETA ANGLE -> ujung kaki horizontal -Z,
    # BETA RANGLE -> +Z; tumit di atas / bawah setara untuk lentur karena simetri titik, torsi dimasukkan manual)
    b_ang = ([m for m in col] if pt["jenis"] == "L" else []) + \
            [m for inf in info if inf["toe"] < 0 and inf["pl"]["jenis"] == "L" for m in inf["members"]]
    b_rang = [m for inf in info if inf["toe"] > 0 and inf["pl"]["jenis"] == "L" for m in inf["members"]]
    if b_ang: out += bungkus(f"BETA ANGLE MEMB {daftar(b_ang)}")
    if b_rang: out += bungkus(f"BETA RANGLE MEMB {daftar(b_rang)}")
    if info[0]["atas"] and info[0]["y"] - H > 1e-6:
        off = info[0]["y"] - H
        out += ["MEMBER OFFSET", f"{col[-1]} END 0 {f3(-off)} 0"]
    out += ["SUPPORTS", f"{j0} FIXED", "DEFINE REFERENCE LOADS"]
    for k, lt, judul, isi in REF:
        out.append(f"LOAD {k} LOADTYPE {lt}  TITLE {judul}")
        for x in isi: out += bungkus(x)
    out += ["END DEFINE REFERENCE LOADS", "DEFINE IBC 2018", ibc1, ibc2, "REFERENCE LOAD Y", f"{sw} 1.0 {rpe} 1.0 {rpc} 1.0"]
    for n_, lt, judul, isi in primer:
        out.append(f"LOAD {n_} LOADTYPE {lt}  TITLE {judul}")
        # REPEAT LOAD baru membawa beban IBC bila kasus IBC sudah dianalisis lebih dulu (pola PERFORM ANALYSIS + CHANGE)
        if isinstance(isi, str): out += [isi, "PERFORM ANALYSIS", "CHANGE"]
        else: out += ["REFERENCE LOAD"] + bungkus(" ".join(f"{r_} {f3(f)}" for r_, f in isi))
    for n_, j, isi in kombi:
        out += [f"LOAD {n_} {j[:70]}", "REPEAT LOAD"] + bungkus(" ".join(f"{p_} {f3(f)}" for p_, f in isi))
    lc_desain = asd_no if metode == "ASD" else lrfd_no
    lc_layan = sorted(set(svc_grav + svc_hor))
    out += ["PERFORM ANALYSIS"] + bungkus("LOAD LIST " + daftar(sorted(set(asd_no + lrfd_no + lc_layan))))
    out += bungkus("PRINT MEMBER FORCES LIST " + daftar(sorted(unp_all)))
    out += bungkus("PRINT JOINT DISPLACEMENTS LIST " + daftar(sorted(set(ujung_j + [jtop]))))
    # reaksi tumpuan ASD + LRFD (stabilitas pondasi: MASTER CALCULATOR/tools/staad-stability.mjs)
    out += bungkus("LOAD LIST " + daftar(asd_no + lrfd_no)) + ["UNIT METER KN", "PRINT SUPPORT REACTION"]
    out += bungkus("LOAD LIST " + daftar(lc_desain))
    out += ["PARAMETER 1", "CODE AISC UNIFIED 2022", f"METHOD {metode}", f"FYLD {f3(Fy * 1000)} ALL", f"FU {f3(Fu * 1000)} ALL"]
    out += bungkus(f"LY {f3(tinggi_tiang)} MEMB {daftar(col)}") + bungkus(f"LZ {f3(tinggi_tiang)} MEMB {daftar(col)}")
    out += bungkus(f"KY {ds.get('K_tiang', 2.1)} MEMB {daftar(col)}") + bungkus(f"KZ {ds.get('K_tiang', 2.1)} MEMB {daftar(col)}")
    out += bungkus(f"UNL {f3(tinggi_tiang)} MEMB {daftar(col)}")
    for inf in info:
        for sisi, ms in (("kiri", [m for m in inf["members"] if J[M[m][1]][0] <= 1e-9]),
                         ("kanan", [m for m in inf["members"] if J[M[m][0]][0] >= -1e-9])):
            Ls = inf[sisi]
            if ms and Ls > 0:
                out += bungkus(f"UNL {f3(Ls)} MEMB {daftar(ms)}") + bungkus(f"LY {f3(Ls)} MEMB {daftar(ms)}") + bungkus(f"LZ {f3(Ls)} MEMB {daftar(ms)}")
    out += ["CB 1 ALL", f"RATIO {ds.get('rasio', 1.0)} ALL",
            f"MAIN {ds.get('kl_r_lain', 250)} ALL",
            "* (MAIN 200 untuk member dengan Pr/Pc >= 0.2 ditambahkan otomatis setelah running pertama)",
            "TRACK 2 ALL", "CHECK CODE ALL",
            "* simpangan beban tetap orde-2: D+Po dengan P-DELTA (setelah desain, tidak mengubah hasil desain)",
            f"LOAD LIST {LC_ORDE2}", "PDELTA ANALYSIS"]
    out += bungkus("PRINT MEMBER FORCES LIST " + daftar(sorted(col)))
    out += bungkus("PRINT JOINT DISPLACEMENTS LIST " + daftar(sorted(set(ujung_j + [jtop])))) + ["FINISH"]
    std = os.path.join(folder, f"{nama}.std")
    with open(std, "w", encoding="latin-1", newline="\r\n") as f: f.write("\n".join(out) + "\n")

    # ---- config staad-cek
    ck = um.get("cek", {})
    n_l = float(str(ck.get("lendutan_lengan", "L/120")).upper().replace(" ", "").split("/")[-1])
    lv_cek = []
    for li, inf in enumerate(info):
        for sisi, m in (("kiri", inf["members"][0]), ("kanan", inf["members"][-1])):
            if inf[sisi] > 0:   # batas dari panjang lengan (kantilever), bukan panjang segmen ujung
                lv_cek.append({"tipe": f"Ujung lengan L{li + 1} {sisi} (absolut, L = {inf[sisi]} m)", "member": [m],
                               "beban": daftar(svc_grav), "batas": round(inf[sisi] * 1000 / n_l, 2), "mode": "absolut"})
    cek = {"lendutan_vertikal": lv_cek,
           "simpangan_angin": {"node": "_PUNCAK", "beban": daftar(svc_hor), "batas": ck.get("simpangan_tiang", "H/150"),
                               "arah": {"X": "Lengan", "Z": "Pipa"}},
           "simpangan_gempa": {"node": "_PUNCAK", "beban": "501 TO 504", "Cd_arah": {"X": gm.get("CdX", gm.get("Cd", 1.25)), "Z": gm.get("CdZ", gm.get("Cd", 1.25))},
                               "Ie": gm.get("Ie", 1.0), "batas": ck.get("simpangan_gempa", "0.02H"), "arah": {"X": "Lengan", "Z": "Pipa"}},
           "rasio_baja": [{"nama": "Tiang", "member": "_TIANG", "batas": ds.get("rasio", 1.0)},
                          {"nama": "Lengan", "member": "_LENGAN", "batas": ds.get("rasio", 1.0)}]}
    if not cek["lendutan_vertikal"]: del cek["lendutan_vertikal"]
    with open(os.path.join(folder, f"{nama}.cek.json"), "w", encoding="utf-8") as f: json.dump(cek, f, indent=2)
    # rantai kantilever: member urut dari pangkal ke luar; jroot = joint pangkal; jin = joint dalam tiap member;
    # c = jarak joint luar tiap member dari pangkal (mm)
    rantai = [dict(label="Tiang (dasar)", ms=col, jroot=M[col[0]][0], jin=[M[m][0] for m in col],
                   c=[J[M[m][1]][1] * 1000 for m in col], L=tinggi_tiang * 1000, prof=pt,
                   warping="bebas" if pt["jenis"] == "L" else "tertahan")]
    for li, inf in enumerate(info):
        jc = joint(0, inf["y"])
        wp = "bebas" if inf["pl"]["jenis"] == "L" else inf["lv"].get("warping_pangkal", "bebas" if inf["atas"] else "tertahan")
        kn = [m for m in inf["members"] if J[M[m][0]][0] >= -1e-9]
        kr = [m for m in reversed(inf["members"]) if J[M[m][1]][0] <= 1e-9]
        if kn and inf["kanan"] > 0:
            rantai.append(dict(label=f"Lengan L{li + 1} kanan", ms=kn, jroot=jc, jin=[M[m][0] for m in kn],
                               c=[J[M[m][1]][0] * 1000 for m in kn], L=inf["kanan"] * 1000, prof=inf["pl"], warping=wp))
        if kr and inf["kiri"] > 0:
            rantai.append(dict(label=f"Lengan L{li + 1} kiri", ms=kr, jroot=jc, jin=[M[m][1] for m in kr],
                               c=[-J[M[m][0]][0] * 1000 for m in kr], L=inf["kiri"] * 1000, prof=inf["pl"], warping=wp))
    ujung = []
    for li, inf in enumerate(info):
        for sisi, jj in (("kiri", joint(-inf["kiri"], inf["y"])), ("kanan", joint(inf["kanan"], inf["y"]))):
            if inf[sisi] > 0:
                ujung.append(dict(label=f"Ujung lengan L{li + 1} {sisi}", j=jj, x=J[jj][0], y=J[jj][1]))
    meta = dict(nama=nama, std=std, metode=metode, E=E, Fy=Fy, rantai=rantai, ujung=ujung, jtop=jtop,
                lc_desain=lc_desain, lc_layan=lc_layan,
                batas_ujung=ck.get("simpangan_ujung", "H/150"), batas_putar=float(ck.get("putaran_tiang_maks_derajat", 1.0)),
                lc_tetap1=lc_tetap1, lc_tetap2=[LC_ORDE2], H_tiang=tinggi_tiang,
                batas_tetap1=ck.get("simpangan_tetap_orde1", "H/500"), batas_tetap2=ck.get("simpangan_tetap_orde2", "H/300"))
    return std, lap, cat, meta

# =============================================================== cek torsi H3.3 (DG9) dari .ANL
def gaya_member(anl):
    with open(anl, encoding="latin-1", errors="replace") as f: L = f.read().splitlines()
    F, i, mb = {}, 0, None
    while i < len(L):
        if "MEMBER END FORCES" in L[i]:
            i += 1
            while i < len(L) and "END OF LATEST ANALYSIS" not in L[i]:
                m1 = re.match(r"^\s+(\d+)\s+(\d+)\s+(\d+)((?:\s+-?[\d.]+(?:E[-+]?\d+)?){6})\s*$", L[i])
                m2 = re.match(r"^\s{8,}(\d+)\s+(\d+)((?:\s+-?[\d.]+(?:E[-+]?\d+)?){6})\s*$", L[i])
                m3 = re.match(r"^\s{12,}(\d+)((?:\s+-?[\d.]+(?:E[-+]?\d+)?){6})\s*$", L[i])
                if m1: mb, lc, jt, v = int(m1.group(1)), int(m1.group(2)), int(m1.group(3)), m1.group(4)
                elif m2 and mb: lc, jt, v = int(m2.group(1)), int(m2.group(2)), m2.group(3)
                elif m3 and mb: jt, v = int(m3.group(1)), m3.group(2)
                else: i += 1; continue
                F[(mb, lc, jt)] = [float(x) for x in v.split()]
                i += 1
            continue
        i += 1
    rasio = {}
    for k, s in enumerate(L):
        m = re.search(r"Member No:\s*(\d+)", s)
        if m and k + 1 < len(L):
            m2 = re.search(r"Status:\s*(\w+)\s+Ratio:\s*([\d.]+)\s+Loadcase:\s*(\d+)", L[k + 1])
            if m2: rasio[int(m.group(1))] = (m2.group(1), float(m2.group(2)), int(m2.group(3)))
    return F, rasio

def f_bimomen(c, L, a):
    """B pangkal / (T*a) untuk torsi T di jarak c: kantilever, pangkal warping tertahan, ujung bebas (DG9).
    c = L -> tanh(L/a)."""
    return (math.sinh(c / a) * math.cosh((L - c) / a) - (1 - math.cosh(c / a)) * math.sinh((L - c) / a)) / math.cosh(L / a)

def cek_torsi(meta, anl):
    F, rasio = gaya_member(anl)
    E = meta["E"]; Gm = E / 2.6; Fy = meta["Fy"]
    asd = meta["metode"] == "ASD"
    fn_s, fn_t = (Fy / 1.67, 0.6 * Fy / 1.67) if asd else (0.9 * Fy, 0.9 * 0.6 * Fy)
    rows, detail = [], None
    lcs = [lc for lc in sorted({k[1] for k in F}) if lc in meta["lc_desain"]]
    for rt in meta["rantai"]:
        pr = rt["prof"]; L = rt["L"]; m0 = rt["ms"][0]
        a = math.sqrt(E * pr["Cw"] / (Gm * pr["J"]))
        if pr["jenis"] == "L":
            # gaya member STAAD pada sumbu utama siku: Mz terhadap sumbu lemah (serat terjauh = tumit), My sumbu kuat
            Sz, Sy = pr["Sv"], pr["Su"]
        else:
            Sz = pr["Ix"] / (pr["h"] / 2)
            Iy = (2 * pr["tf"] * pr["b"] ** 3 / 12 + 2 * pr["b"] * pr["tf"] * (pr["b"] / 2 - pr["cy"]) ** 2
                  + (pr["h"] - 2 * pr["tf"]) * pr["tw"] ** 3 / 12 + (pr["h"] - 2 * pr["tf"]) * pr["tw"] * (pr["cy"] - pr["tw"] / 2) ** 2)
            Sy = Iy / (pr["b"] - pr["cy"])
        best = None
        for lc in lcs:
            if (m0, lc, rt["jroot"]) not in F: continue
            P, Vy, Vz, T0, My, Mz = F[(m0, lc, rt["jroot"])]
            # torsi dalam tiap segmen = |MX| di joint dalam member (sisi pangkal); lonjakan torsi di tiap joint luar
            Ti = [abs(F.get((m, lc, ji), [0.0] * 6)[3]) for m, ji in zip(rt["ms"], rt["jin"])]
            sg = [math.copysign(1.0, F.get((m, lc, ji), [0.0] * 6)[3] or 1.0) for m, ji in zip(rt["ms"], rt["jin"])]
            Ts = [t * g for t, g in zip(Ti, sg)]
            dT = [Ts[i] - (Ts[i + 1] if i + 1 < len(Ts) else 0.0) for i in range(len(Ts))]
            Troot = abs(T0) * 1e6
            if rt["warping"] == "tertahan":
                B = abs(sum(d * 1e6 * a * f_bimomen(min(c, L), L, a) for d, c in zip(dT, rt["c"])))
                tt = max(Troot * pr["tf"] / pr["J"], Troot * pr["Sw"] / (pr["Cw"] * pr["tf"]))
            else:                                   # warping bebas di pangkal: St. Venant murni (terbukti dengan mesh)
                B = 0.0; tt = Troot * pr["tf"] / pr["J"]
            sw = B * pr["Wn"] / pr["Cw"]
            sb = abs(P) * 1e3 / pr["A"] + abs(Mz) * 1e6 / Sz + abs(My) * 1e6 / Sy
            if pr["jenis"] == "L":                  # geser satu kaki (b·t), sebaran parabola 1.5
                tv = 1.5 * math.hypot(Vy, Vz) * 1e3 / (pr["b"] * pr["tf"])
            else:
                tv = max(abs(Vy) * 1e3 / (pr["h"] * pr["tw"]), 1.5 * abs(Vz) * 1e3 / (2 * pr["b"] * pr["tf"]))
            r = max((sb + sw) / fn_s, (tv + tt) / fn_t)
            if best is None or r > best[0]:
                best = (r, lc, abs(T0), sb, sw, tv + tt, (sb + sw) / fn_s, (tv + tt) / fn_t, a, B, tt)
        if not best: continue
        r, lc, T, sb, sw, tau, rs, rtau, a_, B, tt = best
        rst = rasio.get(m0, ("?", float("nan"), 0))
        abaikan = max(sw / fn_s, tt / fn_t) < 0.05
        # torsi kecil -> rasio STAAD (interaksi H1, plastis) yang dipakai; H3.3 elastis hanya bila torsi berarti
        penentu = rst[1] if abaikan else max(r, rst[1])
        rows.append([rt["label"], m0, pr["nama"], rt["warping"], lc, f"{T:.3f}", f"{sb:.1f}", f"{sw:.1f}", f"{tau:.1f}",
                     f"{rst[1]:.3f}", f"{r:.3f}" + (" (torsi kecil, diabaikan)" if abaikan else ""), f"{penentu:.3f}",
                     "OK" if penentu <= 1.0 else "NOT OK"])
        if detail is None or r > detail[0]:
            detail = (r, m0, lc, pr, L, a_, B, T, sb, sw, tau, rs, rtau, rt["warping"])
    return rows, detail, fn_s, fn_t

def putar_dg9(dT, c, L, a, GJ):
    """Putaran puncak kantilever (rad) untuk lonjakan torsi dT (kN.m) di jarak c (mm): pangkal warping tertahan,
    ujung bebas (DG9). Juga putaran St. Venant murni (yang dihitung STAAD) untuk faktor koreksi."""
    th, th_sv = 0.0, 0.0
    for d, ci in zip(dT, c):
        ci = min(ci, L); k = d * 1e6 / GJ
        s_, ch = math.sinh(ci / a), math.cosh(ci / a)
        S, Ch = math.sinh((L - ci) / a), math.cosh((L - ci) / a)
        Bc = k * (s_ * Ch - (1 - ch) * S) / math.cosh(L / a)
        C = (k * s_ - Bc * ch) / S if S > 1e-12 else 0.0
        th += k * (ci - a * s_) + Bc * a * (ch - 1) + C * a * S
        th_sv += k * ci
    return th, th_sv

def cek_ujung(meta, anl, lcs=None, batas=None, puncak=False):
    """Simpangan & putaran di ujung lengan (titik pipa) untuk kombinasi layan; koreksi kekakuan warping tiang (DG9)."""
    F, _ = gaya_member(anl)
    with open(anl, encoding="latin-1", errors="replace") as f: L_ = f.read().splitlines()
    D, node, fak, blok = {}, None, 10.0, False
    for s_ in L_:
        h = re.match(r"^\s*JOINT DISPLACEMENT \(\s*(\w+)", s_)
        if h: fak = {"CM": 10.0, "MM": 1.0, "MMS": 1.0, "METE": 1000.0}.get(h.group(1).upper(), 10.0); blok = True; continue
        # hanya tabel JOINT DISPLACEMENT: tabel lain berformat sama (MEMBER SECTION DISPLACEMENTS dari staad-cek,
        # gaya member) menimpa D bila nomor member = nomor joint
        if re.search(r"MEMBER SECTION DISPL|MEMBER END FORCES|SUPPORT REACTION|STAAD CODE CHECK|END OF LATEST|^\s+\d+\.\s+[A-Z]", s_):
            blok = False; node = None; continue
        if not blok: continue
        m1 = re.match(r"^\s+(\d+)\s+(\d+)((?:\s+-?[\d.]+){6})\s*$", s_)
        m2 = re.match(r"^\s{8,}(\d+)((?:\s+-?[\d.]+){6})\s*$", s_)
        if m1: node, lc, v = int(m1.group(1)), int(m1.group(2)), m1.group(3)
        elif m2 and node is not None: lc, v = int(m2.group(1)), m2.group(2)
        else: continue
        x = [float(t) for t in v.split()]
        D[(node, lc)] = [x[0] * fak, x[1] * fak, x[2] * fak, x[3], x[4], x[5]]
    rt = meta["rantai"][0]; pr = rt["prof"]; E = meta["E"]; Gm = E / 2.6
    a = math.sqrt(E * pr["Cw"] / (Gm * pr["J"])); GJ = Gm * pr["J"]
    jenis, nilai = ("H", 150.0)
    bt = str(batas or meta["batas_ujung"]).upper().replace(" ", "")
    rows = []
    titik = ([dict(label="Puncak tiang", j=meta["jtop"], x=0.0, y=meta["H_tiang"])] if puncak else []) + meta["ujung"]
    for u in titik:
        izin = (u["y"] * 1000) / float(bt.split("/")[1]) if bt.startswith("H/") else float(bt)
        best = None
        for lc in (lcs or meta["lc_layan"]):
            if (u["j"], lc) not in D or (meta["jtop"], lc) not in D: continue
            dx, dy, dz = D[(u["j"], lc)][:3]
            thy = D[(meta["jtop"], lc)][4]                      # putaran puncak tiang (STAAD, St. Venant saja)
            Ti = [F.get((m, lc, ji), [0.0] * 6)[3] for m, ji in zip(rt["ms"], rt["jin"])]
            dT = [Ti[i] - (Ti[i + 1] if i + 1 < len(Ti) else 0.0) for i in range(len(Ti))]
            if pr["jenis"] == "L": rho = 1.0         # siku: warping diabaikan, St. Venant STAAD sudah benar
            else:
                th, th_sv = putar_dg9(dT, rt["c"], rt["L"], a, GJ)
                rho = th / th_sv if abs(th_sv) > 1e-12 else 1.0
            # bagian simpangan ujung akibat puntir tiang = putaran × lengan (rotasi terhadap Y: dz = -θy·x, dx = θy·z)
            dz_tw = -thy * u["x"] * 1000
            dz_k = dz - (1 - rho) * dz_tw
            res, res_k = math.hypot(dx, dz), math.hypot(dx, dz_k)
            deg, deg_k = math.degrees(abs(thy)), math.degrees(abs(thy * rho))
            skor = max(res_k / izin, deg_k / meta["batas_putar"])
            if best is None or skor > best[0]:
                best = (skor, lc, dx, dy, dz, res, deg, rho, res_k, deg_k)
        if not best: continue
        skor, lc, dx, dy, dz, res, deg, rho, res_k, deg_k = best
        ok = res_k <= izin + 1e-9 and deg_k <= meta["batas_putar"] + 1e-9
        rows.append([u["label"], u["j"], lc, f"{dx:.2f}", f"{dy:.2f}", f"{dz:.2f}", f"{res:.2f}", f"{deg:.2f}",
                     f"{rho:.2f}", f"{res_k:.2f}", f"{izin:.2f}", f"{deg_k:.2f}", f"{meta['batas_putar']:.2f}",
                     "OK" if ok else "NOT OK"])
    return rows, a

def jalankan_cek(std, cekjson):
    r = subprocess.run([sys.executable, "-I", CEK, "--model", std, "--config", cekjson],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    m = re.search(r"Sumber output: `([^`]+)`", r.stdout)
    err = re.search(r"Error di output: (\d+)", r.stdout)
    return (m.group(1) if m else None), (int(err.group(1)) if err else None)

def atur_main(std, anl, batas_tekan=200, ambang=0.2, fisik=()):
    """Pr/Pc >= ambang -> MAIN batas_tekan (AISC 360-22 E2 user note), lainnya tetap MAIN default (250).
    Mengembalikan (tabel kelangsingan, perlu_running_ulang)."""
    spec = importlib.util.spec_from_file_location("cek", CEK)
    ck = importlib.util.module_from_spec(spec); spec.loader.exec_module(ck)
    with open(anl, encoding="latin-1", errors="replace") as f: d = ck.parse_desain(f.read())
    pr_m = {mb: (d[mb]["tekan"][3] if d[mb].get("tekan") else 0.0) for mb in d}
    # satu member fisik (tiang / satu sisi lengan) = satu batas: pakai Pr/Pc terbesar di sepanjang member fisik
    grup = {mb: g for g in fisik for mb in g}
    tab, ketat = [], []
    for mb in sorted(d):
        lg = d[mb].get("lgs")
        prpc_g = max(pr_m.get(x, 0.0) for x in grup.get(mb, [mb]))
        if prpc_g >= ambang: ketat.append(mb)
        tab.append((mb, pr_m[mb], lg[1] if lg else None, batas_tekan if prpc_g >= ambang else None))
    with open(std, encoding="latin-1") as f: L = f.read().splitlines()
    i = next(k for k, b in enumerate(L) if re.match(r"^\s*MAIN\s+[\d.]+\s+ALL", b))
    lama = [k for k, b in enumerate(L) if re.match(r"^\s*MAIN\s+[\d.]+\s+MEMB", b)]
    for k in reversed(lama): del L[k]
    if ketat:
        L.insert(i + 1, f"MAIN {batas_tekan} MEMB " + " ".join(map(str, ketat)))
    with open(std, "w", encoding="latin-1", newline="\r\n") as f: f.write("\n".join(L) + "\n")
    return tab, bool(ketat) or bool(lama)

# =============================================================== utama
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", required=True)
    ap.add_argument("--jalankan", action="store_true", help="running STAAD (staad-cek) + cek torsi H3.3")
    a = ap.parse_args()
    with open(a.config, encoding="utf-8") as f: cfg = json.load(f)
    folder = cfg.get("folder") or os.path.dirname(os.path.abspath(a.config))
    os.makedirs(folder, exist_ok=True)
    um = cfg["umum"]
    for tp in cfg["tipe"]:
        std, lap, cat, meta = buat_tipe(tp, um, folder)
        md = os.path.join(folder, f"{tp['nama']} - Perhitungan.md")
        jp = "siku" if str(tp["tiang"]["profil"]).upper().startswith("L") else "UNP"
        teks = [f"# Pipe support {tp['nama']} ({jp} tunggal, ASCE 7-22 / AISC 360-22)", ""]
        if cat: teks += ["**Catatan:**"] + [f"- {c}" for c in cat] + [""]
        teks += lap
        print(f"STD: {std}")
        if a.jalankan:
            cekjson = os.path.join(folder, f"{tp['nama']}.cek.json")
            anl, err = jalankan_cek(std, cekjson)
            tab_kl = None
            if anl and err == 0:
                ds_ = um.get("desain", {})
                tab_kl, ulang = atur_main(std, anl, ds_.get("kl_r_tekan", 200), ds_.get("ambang_prpc", 0.2),
                                          [r_["ms"] for r_ in meta["rantai"]])
                if ulang:
                    anl, err = jalankan_cek(std, cekjson)
            print(f"  analisis: error = {err if err is not None else '?'}")
            if anl and os.path.exists(anl):          # simpan output di samping model (reaksi untuk cek pondasi)
                shutil.copy2(anl, os.path.join(folder, f"{tp['nama']}.ANL"))
            m = re.match(r"(.+)", anl) if anl else None
            cek_md = os.path.join(folder, f"{tp['nama']} - Cek Hasil.md")
            if os.path.exists(cek_md):
                with open(cek_md, encoding="utf-8") as f: teks += ["", "---", ""] + f.read().replace("# Cek hasil", "## Cek hasil").splitlines()
            if tab_kl:
                ds_ = um.get("desain", {})
                teks += ["", "## Batas kelangsingan (MAIN)", "",
                         f"Aturan: Pr/Pc ≥ {ds_.get('ambang_prpc', 0.2)} → KL/r ≤ {ds_.get('kl_r_tekan', 200)} (MAIN), "
                         f"lainnya KL/r ≤ {ds_.get('kl_r_lain', 250)}; satu batas per member fisik (tiang, tiap sisi lengan) "
                         "berdasarkan Pr/Pc terbesar segmennya. Pr/Pc dari running pertama (tekuk tekan penentu), "
                         "lalu model dijalankan ulang dengan MAIN per member.", "",
                         "| Member | Pr/Pc maks | KL/r aktual | Batas KL/r | Check |", "|---|---|---|---|---|"]
                for mb, prpc, klr, bt in tab_kl:
                    bt_ = bt or ds_.get("kl_r_lain", 250)
                    teks.append(f"| {mb} | {prpc:.3f} | {klr if klr is not None else '-'} | {bt_} | "
                                f"{'OK' if klr is None or klr <= bt_ else 'NOT OK'} |")
                print("  kelangsingan:", "; ".join(f"m{mb} Pr/Pc {prpc:.3f} KL/r {klr} batas {bt or ds_.get('kl_r_lain', 250)}" for mb, prpc, klr, bt in tab_kl if klr))
            if m:
                rows, det, fs, ft = cek_torsi(meta, m.group(1))
                teks += ["", f"## Cek torsi {jp} - AISC 360-22 H3.3 (di luar cek STAAD)", "",
                         f"Batas: normal Fn/Ω = {fs:.0f} MPa, geser {ft:.0f} MPa ({meta['metode']}). "
                         "σb = P/A + Mz/Sx + My/Sy. Warping 'tertahan' (tiang di baseplate, lengan dilas di samping tiang): "
                         "σw = B·Wn/Cw, B = Σ ΔTi·a·f(ci) dari lonjakan torsi di tiap joint (DG9 kantilever, ujung bebas), "
                         "τ = geser lentur + maks(T·tf/J, T·Sw/(Cw·tf)). Warping 'bebas' (lengan duduk di atas tiang - terbukti "
                         "dengan model pelat): σw = 0, τ = geser lentur + T·tf/J. "
                         "Rasio penentu = maks(rasio STAAD, rasio H3.3); bila torsi kecil (σw dan τ torsi < 5% batas) dipakai rasio STAAD saja. Tekuk (H3.3c) diwakili rasio STAAD (F2/E4).", "",
                         "| Bagian | Member | Profil | Warping pangkal | L/C | T (kNm) | σb (MPa) | σw (MPa) | τ (MPa) | Rasio STAAD | Rasio H3.3 | Rasio penentu | Check |",
                         "|---|---|---|---|---|---|---|---|---|---|---|---|---|"] + ["| " + " | ".join(str(x) for x in rw) + " |" for rw in rows]
                if det:
                    r_, mb, lc, pr, L, a_, B, T, sb, sw, tau, rs, rt, wp = det
                    teks += ["", f"**Contoh hitungan (penentu: member {mb}, L/C {lc}):** "
                             f"{pr['nama']}: J = {pr['J'] / 1e4:.2f} cm⁴, Cw = {pr['Cw'] / 1e6:.0f} cm⁶, Wn = {pr['Wn']:.0f} mm², "
                             f"Sw = {pr['Sw'] / 1e3:.1f}×10³ mm⁴; a = √(E·Cw/G·J) = {a_:.0f} mm; L = {L:.0f} mm; "
                             f"warping pangkal {wp}; T pangkal = {T:.3f} kNm → B = {B / 1e9:.4f} kN·m²; σw = {sw:.1f} MPa; "
                             f"σb = {sb:.1f} MPa; σtotal = {sb + sw:.1f} MPa (rasio {rs:.3f}); τ = {tau:.1f} MPa (rasio {rt:.3f})."]
                print("  cek torsi:", "; ".join(f"{rw[0]} {rw[11]} {rw[12]}" for rw in rows))
                kepala = ("| Titik | Joint | L/C | X (mm) | Y (mm) | Z (mm) | Res STAAD (mm) | θ tiang STAAD (°) | ρ DG9 | "
                          "Res terkoreksi (mm) | Izin (mm) | θ terkoreksi (°) | θ izin (°) | Check |")
                garis = "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|"
                cek3 = [("Umum - semua kombinasi layan (gravitasi, friksi, angin), orde-1", meta["lc_layan"], meta["batas_ujung"]),
                        ("Beban tetap D+Po - orde-1", meta["lc_tetap1"], meta["batas_tetap1"]),
                        ("Beban tetap D+Po - orde-2 (P-DELTA, L/C 601)", meta["lc_tetap2"], meta["batas_tetap2"])]
                a_u = None; blok = []
                for judul, lcs, bts in cek3:
                    ur, a_u = cek_ujung(meta, m.group(1), lcs, bts, puncak=True)
                    if not ur: continue
                    blok += ["", f"### {judul} - batas {bts}", "", kepala, garis] + ["| " + " | ".join(str(x) for x in rw) + " |" for rw in ur]
                    print(f"  simpangan {judul.split(' - ')[0]} {bts}:", "; ".join(f"{rw[0]} {rw[9]}/{rw[10]} mm {rw[13]}" for rw in ur))
                if blok:
                    teks += ["", "## Simpangan horizontal & putaran (puncak tiang dan ujung lengan / titik pipa)", "",
                             "STAAD memakai kekakuan torsi St. Venant (G·J) saja, sehingga puntir tiang yang warping-nya tertahan di "
                             "dasar terlalu besar. Koreksi: ρ = θ_DG9 / θ_St.Venant dari diagram torsi tiang (kantilever, dasar "
                             f"tertahan, a = {a_u:.0f} mm); bagian simpangan ujung akibat puntir tiang (θ × lengan) dikalikan ρ. "
                             "H = elevasi titik dari dasar tiang. Putaran tiang ≤ "
                             f"{meta['batas_putar']}°. Status dari nilai terkoreksi. Beban tetap = berat sendiri + pipa operasi "
                             "(friksi, angin, gempa tidak termasuk)."] + blok
        with open(md, "w", encoding="utf-8") as f: f.write("\n".join(teks) + "\n")
        print(f"  LAPORAN: {md}")

if __name__ == "__main__":
    main()
