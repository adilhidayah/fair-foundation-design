"""Cantilever pipe support: siku sama kaki dilas (fillet keliling) ke struktur eksisting (kolom / balok platform), satu pipa.
Statis tertentu -> dihitung langsung (tanpa STAAD). Beban pipa & angin dari pipesupport.py (fungsi yang sama), gempa komponen
ASCE 7-22 §13.3 (batas atas Fp = 1.6·SDS·Ip·Wp, Ev = 0.2·SDS·Wp), kombinasi ASD design basis proyek (Tabel 15-2), cek:
- siku AISC 360-22 H2 (tegangan elastis sumbu utama, konservatif: |N|/A + (|Mz|+|My|)/√2·(1/Su + 1/Sv) ≤ Fy/Ω) + torsi
  St. Venant terhadap tumit (warping diabaikan, DG9) dan geser: τ = 1.5·V/(b·t) + T·t/J ≤ 0.6Fy/Ω
- las fillet keliling profil di pangkal, metode elastis vektor (AISC Manual Part 8): f = √(σ² + τy² + τz²) ≤ 0.6·FEXX/2.0
- lendutan ujung layan D+Po pada sumbu utama, batas L/(lendutan_lengan)
- reaksi di pangkal (ke struktur platform) untuk semua kombinasi.
Config: blok "kantilever" di .ps.json (lihat contoh di proyek PT-TIP). Output <folder>/<nama>/<nama> - Kalkulasi.md + PDF/<nama> - Kalkulasi.pdf
  python kantilever.py --folder <folder Kalkulasi> [--ps x.ps.json] [--tanpa-pdf] [--tanpa-staad]
Model STAAD verifikasi (<nama>.std/.ANL) dibuat & dijalankan tanpa GUI kecuali --tanpa-staad."""
import argparse, glob, html, importlib.util, json, math, os, re, subprocess, sys, urllib.parse

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("pipesupport", os.path.join(HERE, "pipesupport.py"))
PS = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(PS)


def hitung(k, um):
    mat = um["material"]; E, Fy = float(mat["E_MPa"]), float(mat["Fy_MPa"]); G = E / 2.6
    pr = PS.dimensi_siku(k["profil"]); L = float(k["panjang"]) * 1000; a = float(k["pipa"]["a"]) * 1000
    t, b, cy, x0 = pr["tw"], pr["b"], pr["cy"], pr["x0"]
    p = k["pipa"]; bp = PS.beban_pipa(p); R = bp["Dluar"] * 500
    vert = str(k.get("orientasi_pipa", "horizontal")).startswith("v")
    k_sw = float(um.get("desain", {}).get("faktor_berat_sendiri", 1.0))
    w_sw = pr["A"] * 1e-6 * 76.8195 * k_sw                       # kN/m
    # ---- gempa (ASCE 7-22 §13.3, batas atas) - SDS dari proyek
    gm = um["gempa"]; kls = str(gm.get("kelas_situs", "D")).upper()[-1]
    Fa = gm.get("Fa") or round(PS.interp_tab(float(gm["Ss"]), PS.SS_TITIK, PS.FA_TAB[kls]), 3)
    SDS = 2 / 3 * float(Fa) * float(gm["Ss"]); Ip = float(gm.get("Ie", 1.0))
    kh = 1.6 * SDS * Ip; kv = 0.2 * SDS
    # ---- angin pada pipa (sama dengan pipesupport: maks(qz·Kd·G·Cf, p_min)·D·span)
    ang = um["angin"]; z = float(k.get("elevasi_m", 4.0))
    q = max(0.613 * PS.Kz(z, ang.get("eksposur", "C")) * float(ang.get("Kzt", 1)) * float(ang["V"]) ** 2 / 1000, float(ang.get("q_min_kPa", 0)))
    Dq = bp["Dluar"] * math.sqrt(q * 1000); Cf = 0.7 if Dq > 5.3 else 1.2
    pw = max(q * float(ang.get("Kd", 0.85)) * float(ang.get("G", 0.85)) * Cf, float(ang.get("p_min_kPa", 0)))
    W = pw * bp["Dluar"] * float(p["span"])
    mu = float(p.get("mu", 0.3))
    # ---- geometri gaya terhadap titik berat siku (x sepanjang lengan dari muka struktur, y vertikal, z horizontal ⟂ lengan)
    # lengan: kaki horizontal di atas (tumit di atas, di sisi punggung z = -cy), pusat geser di tumit: (y, z) = (+x0, -x0)
    ysc, zsc = x0, -x0
    if vert:   # pipa vertikal di depan punggung kaki vertikal, U-bolt; titik gaya di sumbu pipa setinggi titik berat
        yp, zp = 0.0, -cy - R
    else:      # pipa di atas kaki horizontal, di tengah kaki
        yp, zp = cy, b / 2 - cy
    # beban primer di titik pipa: (Fx, Fy, Fz) kN dan titik kerja (y, z) mm
    prim = {"Pe": [(0, -bp["Pe"], 0, yp, zp)], "Po": [(0, -bp["Po"], 0, yp, zp)]}
    if vert:
        prim["Wx"] = [(W, 0, 0, 0, zp)]; prim["Wz"] = [(0, 0, W, 0, zp)]; prim["T"] = []      # U-bolt: tanpa friksi aksial
    else:
        prim["Wx"] = [(W, 0, 0, yp + R, zp)]; prim["Wz"] = []                                 # angin ⟂ pipa = sepanjang lengan
        prim["T"] = [(0, 0, mu * bp["Po"], yp, zp)]                                           # friksi sepanjang pipa (z)
    Wp = bp["Po"] + w_sw * L / 1000
    prim["Ex"] = [(kh * bp["Po"], 0, 0, yp + (0 if vert else R), zp)]
    prim["Ez"] = [(0, 0, kh * bp["Po"], yp + (0 if vert else R), zp)]
    prim["Ev"] = [(0, -kv * bp["Po"], 0, yp, zp)]

    def gaya(fak):
        """gaya dalam di pangkal (x = 0) untuk kombinasi {primer: faktor}: N, Vy, Vz, T (thd pusat geser), My, Mz (kN, kNm)"""
        N = Vy = Vz = T = My = Mz = 0.0
        for nm, f in fak.items():
            if nm == "D":
                Vy += -w_sw * L / 1000 * f; Mz += -w_sw * (L / 1000) ** 2 / 2 * f; continue
            for Fx, Fy_, Fz, y, zz in prim[nm]:
                Fx, Fy_, Fz = Fx * f, Fy_ * f, Fz * f; xa = a / 1000
                N += Fx; Vy += Fy_; Vz += Fz
                Mz += Fy_ * xa - Fx * y / 1000            # momen di bidang vertikal (terhadap z)
                My += -Fz * xa + Fx * zz / 1000           # momen di bidang horizontal (terhadap y)
                T += -Fy_ * (zz - zsc) / 1000 + Fz * (y - ysc) / 1000
        return N, Vy, Vz, T, My, Mz

    # ---- kombinasi ASD design basis (Tabel 15-2), gempa 100/30, angin & friksi dua arah
    k1, k2 = 1 + 0.14 * SDS, 1 + 0.105 * SDS
    kom = [("D+Pe", {"D": 1, "Pe": 1}), ("D+Po", {"D": 1, "Po": 1})]
    for s in (1, -1):
        if prim["T"]: kom.append((f"D+Po{'+' if s > 0 else '-'}T", {"D": 1, "Po": 1, "T": s}))
        for w in ("Wx", "Wz"):
            if prim[w]:
                kom.append((f"D+Pe{'+' if s > 0 else '-'}0.6{w}", {"D": 1, "Pe": 1, w: 0.6 * s}))
                kom.append((f"D+Po+T{'+' if s > 0 else '-'}0.45{w}", {"D": 1, "Po": 1, "T": 1, w: 0.45 * s} if prim["T"] else {"D": 1, "Po": 1, w: 0.45 * s}))
    for e1, e2 in (("Ex", "Ez"), ("Ez", "Ex")):
        for s1 in (1, -1):
            for s2 in (1, -1):
                tag = f"{'+' if s1 > 0 else '-'}{e1}{'+' if s2 > 0 else '-'}0.3{e2}"
                kom.append((f"(1+0.14SDS)(D+Pe)+0.7({tag})+0.7Ev", {"D": k1, "Pe": k1, e1: 0.7 * s1, e2: 0.21 * s2, "Ev": 0.7}))
                kom.append((f"(1+0.105SDS)(D+Po)+T+0.525({tag})", {"D": k2, "Po": k2, "T": 1, e1: 0.525 * s1, e2: 0.1575 * s2, "Ev": 0.525}))
    # ---- cek per kombinasi
    Om, Omw = 1.67, 2.0; Fb, Fv = Fy / Om, 0.6 * Fy / Om
    FEXX = float(k.get("FEXX_MPa", 490)); w_mm = float(k.get("las_mm", 6)); te = 0.707 * w_mm; Fw = 0.6 * FEXX / Omw
    # las keliling profil di pangkal: segmen garis (y, z) relatif titik berat, tiap segmen dipecah 20 titik
    yv, zv = lambda v: cy - v, lambda u: u - cy                           # v dari atas (tumit), u dari punggung
    garis = [((0, 0), (0, b)), ((0, b), (t, b)), ((t, b), (t, t)), ((t, t), (b, t)), ((b, t), (b, 0)), ((b, 0), (0, 0))]   # (v, u)
    titik = []
    for (v1, u1), (v2, u2) in garis:
        Ls = math.hypot(v2 - v1, u2 - u1); n = 20
        for i in range(n):
            f = (i + 0.5) / n; titik.append((yv(v1 + (v2 - v1) * f), zv(u1 + (u2 - u1) * f), Ls / n))
    Lw = sum(d for _, _, d in titik); yc = sum(y * d for y, _, d in titik) / Lw; zc = sum(z * d for _, z, d in titik) / Lw
    Iz = sum((y - yc) ** 2 * d for y, _, d in titik) * te; Iy = sum((z - zc) ** 2 * d for _, z, d in titik) * te
    Ipw = Iz + Iy; Aw = Lw * te
    hasil = []
    for nm, fak in kom:
        N, Vy, Vz, T, My, Mz = gaya(fak)
        sb = abs(N) * 1e3 / pr["A"] + (abs(Mz) + abs(My)) * 1e6 / math.sqrt(2) * (1 / pr["Su"] + 1 / pr["Sv"])
        tau = 1.5 * math.hypot(Vy, Vz) * 1e3 / (b * t) + abs(T) * 1e6 * t / pr["J"]
        # las: momen torsi terhadap titik berat las (T dihitung thd pusat geser -> geser ke titik berat las, beda kecil diabaikan)
        fw = 0
        for y, z, _ in titik:
            s = N * 1e3 / Aw + Mz * 1e6 * (y - yc) / Iz - My * 1e6 * (z - zc) / Iy
            ty = Vy * 1e3 / Aw - T * 1e6 * (z - zc) / Ipw
            tz = Vz * 1e3 / Aw + T * 1e6 * (y - yc) / Ipw
            fw = max(fw, math.sqrt(s ** 2 + ty ** 2 + tz ** 2))
        hasil.append(dict(nm=nm, N=N, Vy=Vy, Vz=Vz, T=T, My=My, Mz=Mz, sb=sb, tau=tau, rs=sb / Fb, rt=tau / Fv,
                          r=max(sb / Fb, tau / Fv), fw=fw, rw=fw / Fw))
    # ---- lendutan layan D+Po di ujung (sumbu utama, beban titik + berat sendiri)
    P = bp["Po"] * 1e3; w = w_sw
    d_titik = lambda I: (P / math.sqrt(2)) * a ** 2 * (3 * L - a) / (6 * E * I) + (w / math.sqrt(2)) * L ** 4 / (8 * E * I)
    dl = math.hypot(d_titik(pr["Iu"]), d_titik(pr["Iv"]))
    nL = float(str(um.get("cek", {}).get("lendutan_lengan", "L/180")).split("/")[-1]); dlim = L / nL
    return dict(pr=pr, bp=bp, L=L, a=a, R=R, vert=vert, SDS=SDS, Fa=Fa, kh=kh, kv=kv, q=q, pw=pw, W=W, mu=mu, Ip=Ip,
                hasil=hasil, Fb=Fb, Fv=Fv, Fw=Fw, te=te, Lw=Lw, dl=dl, dlim=dlim, w_sw=w_sw, k_sw=k_sw, e_v=(zp - zsc), z=z,
                prim=prim, kom=kom, ysc=ysc, zsc=zsc, E=E, Fy=Fy, Fu=float(mat.get("Fu_MPa", 400)), K=float(um.get("desain", {}).get("K_tiang", 2.1)))


def model_staad(k, h, folder):
    """Model STAAD verifikasi: batang siku terjepit di muka struktur, beban primer = beban skrip (gaya di titik pipa + momen
    akibat offset; torsi terhadap pusat geser/tumit seperti pipesupport.py), kombinasi sama (L/C 101..). Dijalankan tanpa GUI
    lewat cek_staad; hasil: rasio AISC 360-22 STAAD dan gaya pangkal per kombinasi."""
    f3 = PS.f3; L, a = h["L"] / 1000, h["a"] / 1000; nama = k["nama"]
    std = os.path.join(folder, f"{nama}.std")
    urut = [n for n in ("Pe", "Po", "T", "Wx", "Wz", "Ex", "Ez", "Ev") if h["prim"].get(n)]
    nomor = {"D": 1, **{n: i + 2 for i, n in enumerate(urut)}}
    o = ["STAAD SPACE", "START JOB INFORMATION", f"JOB NAME {nama}", "END JOB INFORMATION", "INPUT WIDTH 79", "*",
         f"* {nama} - cantilever angle bracket, generated by kantilever.py (verification of the hand calculation)",
         "* x = along the bracket from the face of the existing structure, y up, z horizontal; torsion about the heel as MX",
         "UNIT METER KN", "JOINT COORDINATES", f"1 0 0 0; 2 {f3(a)} 0 0; 3 {f3(L)} 0 0;", "MEMBER INCIDENCES", "1 1 2; 2 2 3;",
         "START GROUP DEFINITION", "MEMBER", "_BRAKET 1 2", "END GROUP DEFINITION",
         "DEFINE MATERIAL START", "ISOTROPIC STEEL", f"E {f3(h['E'] * 1000)}", "POISSON 0.3", "DENSITY 76.8195", "ALPHA 1.2e-05", "DAMP 0.03",
         "TYPE STEEL", f"STRENGTH FY {f3(h['Fy'] * 1000)} FU {f3(h['Fu'] * 1000)} RY 1.5 RT 1.2", "END DEFINE MATERIAL",
         "MEMBER PROPERTY JAPANESE", f"1 2 TABLE ST {h['pr']['nama']}", "CONSTANTS", "MATERIAL STEEL ALL",
         "BETA RANGLE MEMB 1 2", "SUPPORTS", "1 FIXED",
         "LOAD 1 LOADTYPE Dead TITLE D SELFWEIGHT", f"SELFWEIGHT Y -{f3(h['k_sw'])}"]
    for n in urut:
        o += [f"LOAD {nomor[n]} LOADTYPE {'Wind' if n.startswith('W') else 'Seismic' if n.startswith('E') else 'Live' if n == 'T' else 'Dead'} TITLE {n}",
              "JOINT LOAD"]
        for Fx, Fy, Fz, y, z in h["prim"][n]:
            mx = -Fy * (z - h["zsc"]) / 1000 + Fz * (y - h["ysc"]) / 1000; my = Fx * z / 1000; mz = -Fx * y / 1000
            o.append("2 " + " ".join(f"{c} {f3(v)}" for c, v in (("FX", Fx), ("FY", Fy), ("FZ", Fz), ("MX", mx), ("MY", my), ("MZ", mz)) if abs(v) > 1e-7))
    lc = []
    for i, (nm, fak) in enumerate(h["kom"], 1):
        lc.append(100 + i)
        o += [f"LOAD {100 + i} {nm[:60]}", "REPEAT LOAD", " ".join(f"{nomor[p]} {f3(v)}" for p, v in fak.items() if p in nomor)]   # primer kosong (mis. T pipa vertikal) dilewati
    lst = f"{lc[0]} TO {lc[-1]}"          # rentang: daftar panjang melebihi lebar baris STAAD dan terpotong (WARNING)
    o += ["PERFORM ANALYSIS", f"LOAD LIST {lst}", "PRINT MEMBER FORCES LIST 1 2", "PRINT SUPPORT REACTION",
          "PARAMETER 1", "CODE AISC UNIFIED 2022", "METHOD ASD", f"FYLD {f3(h['Fy'] * 1000)} ALL", f"FU {f3(h['Fu'] * 1000)} ALL",
          f"LY {f3(L)} ALL", f"LZ {f3(L)} ALL", f"UNL {f3(L)} ALL", f"KY {h['K']} ALL", f"KZ {h['K']} ALL", "CB 1 ALL",
          "TRACK 2 ALL", "CHECK CODE ALL", "FINISH"]
    with open(std, "w", encoding="latin-1", newline="\r\n") as fh: fh.write("\n".join(o) + "\n")
    cj = os.path.join(folder, f"{nama}.cek.json")
    json.dump({"rasio_baja": [{"nama": "Bracket", "member": "_BRAKET", "batas": 1.0}]}, open(cj, "w", encoding="utf-8"), indent=1)
    anl, err = PS.jalankan_cek(std, cj)
    if not anl or not os.path.exists(anl): return dict(err=err if err is not None else "?", std=std)
    import shutil; shutil.copy2(anl, os.path.join(folder, f"{nama}.ANL"))
    F, rasio = PS.gaya_member(anl)
    r = max((rasio[m] for m in (1, 2) if m in rasio), key=lambda x: x[1], default=("?", float("nan"), 0))
    banding = []
    for i, (nm, _) in enumerate(h["kom"], 1):
        s = F.get((1, 100 + i, 1))
        if s: banding.append((100 + i, nm, s, h["hasil"][i - 1]))
    return dict(err=err, std=std, status=r[0], rasio=r[1], lc=r[2], banding=banding)


def laporan(k, h):
    pr, bp = h["pr"], h["bp"]; f = lambda v, n=2: f"{v:.{n}f}"
    g = max(h["hasil"], key=lambda r: r["r"]); gw = max(h["hasil"], key=lambda r: r["rw"])
    ok = lambda r: "OK" if r <= 1.0 + 1e-9 else "NOT OK"
    md = [f"# {k['nama']} — cantilever pipe support (calculation)", "",
          f"Location: {k.get('lokasi', '-')}. {k.get('catatan', '')}", "",
          "## Data", "", "| Item | Value |", "|---|---|",
          f"| Member | {pr['nama']} (equal angle, horizontal leg on top), length from the face of the existing structure L = {h['L']:.0f} mm |",
          f"| Connection | Fillet weld {k.get('las_mm', 6)} mm all round the section to the existing structure (E70, F_EXX {k.get('FEXX_MPa', 490)} MPa) |",
          f"| Pipe | DN{k['pipa']['DN']} sch {k['pipa'].get('sch', '40')}, {k['pipa'].get('isi', 'air')}-filled, span {k['pipa']['span']} m, "
          f"{'vertical (U-bolt guide)' if h['vert'] else 'horizontal, resting'} at a = {h['a']:.0f} mm |",
          f"| Pipe loads | Pe = {f(bp['Pe'])} kN, Po = {f(bp['Po'])} kN" + (" (vertical riser weight taken on the bracket - conservative)" if h['vert'] else "") + " |",
          f"| Self-weight | {f(h['w_sw'] * 1000, 1)} N/m (× {h['k_sw']} for welds/plates) |",
          f"| Wind | q = {f(h['q'], 3)} kPa at EL {h['z']:.2f} m, p = max(q·Kd·G·Cf, p_min) = {f(h['pw'], 3)} kPa → W = p·D·span = {f(h['W'], 3)} kN |",
          f"| Seismic (ASCE 7-22 §13.3, upper bound) | SDS = ⅔·Fa·Ss = {f(h['SDS'], 3)} (Fa {h['Fa']}), Ip = {h['Ip']}: Fp = 1.6·SDS·Ip·Wp = {f(h['kh'], 3)}·Po, Ev = 0.2·SDS·Po = {f(h['kv'], 3)}·Po |",
          f"| Friction | " + ("none (U-bolt, vertical pipe)" if h["vert"] else f"μ·Po = {h['mu']}·Po along the pipe (z)") + " |",
          f"| Torsion | eccentricity of the vertical pipe load to the shear centre (heel) e = {abs(h['e_v']):.1f} mm |",
          "", "## Results (ASD)", "",
          f"Allowables: Fy/Ω = {f(h['Fb'], 0)} MPa, 0.6Fy/Ω = {f(h['Fv'], 0)} MPa, weld 0.6·F_EXX/2.0 = {f(h['Fw'], 0)} MPa (throat {f(h['te'], 2)} mm, weld length {h['Lw']:.0f} mm).", "",
          "| Check | Governing combination | Value | Allowable | Ratio | Status |", "|---|---|---|---|---|---|",
          f"| Angle normal stress (H2, principal axes) | {g['nm']} | {f(g['sb'], 1)} MPa | {f(h['Fb'], 0)} MPa | {f(g['rs'], 3)} | {ok(g['rs'])} |",
          f"| Angle shear + St. Venant torsion | {max(h['hasil'], key=lambda r: r['rt'])['nm']} | {f(max(r['tau'] for r in h['hasil']), 1)} MPa | {f(h['Fv'], 0)} MPa | {f(max(r['rt'] for r in h['hasil']), 3)} | {ok(max(r['rt'] for r in h['hasil']))} |",
          f"| Fillet weld (elastic vector method) | {gw['nm']} | {f(gw['fw'], 1)} MPa | {f(h['Fw'], 0)} MPa | {f(gw['rw'], 3)} | {ok(gw['rw'])} |",
          f"| Tip deflection, service D+Po | D+Po | {f(h['dl'], 2)} mm | L/{int(round(h['L'] / h['dlim']))} = {f(h['dlim'], 2)} mm | {f(h['dl'] / h['dlim'], 3)} | {ok(h['dl'] / h['dlim'])} |",
          "", "## Forces at the root = reactions on the existing structure (ASD, kN / kN·m; x along the bracket, y up, z horizontal)", "",
          "| Combination | N (x) | Vy | Vz | T (about x) | My | Mz | Angle ratio | Weld ratio |", "|---|---|---|---|---|---|---|---|---|"]
    for r in h["hasil"]:
        md.append(f"| {r['nm']} | {f(r['N'], 3)} | {f(r['Vy'], 3)} | {f(r['Vz'], 3)} | {f(r['T'], 4)} | {f(r['My'], 4)} | {f(r['Mz'], 4)} | {f(r['r'], 3)} | {f(r['rw'], 3)} |")
    st = h.get("staad")
    if st:
        md += ["", "## STAAD.Pro verification", ""]
        if st.get("rasio") is None:
            md.append(f"STAAD run failed (error {st.get('err')}); model `{os.path.basename(st['std'])}`.")
        else:
            nmlc = dict((lc, nm) for lc, nm, _, _ in st["banding"])
            md += [f"Model `{os.path.basename(st['std'])}`: the bracket as one angle member fixed at the face of the existing structure, "
                   "the same primary loads (pipe point loads + offset moments; torsion about the heel as MX) and the same combinations "
                   "(L/C 101+). Code check AISC 360-22 ASD (single angle, principal axes; K = "
                   f"{h['K']}, L = {h['L']:.0f} mm, Cb 1). STAAD errors: {st.get('err')}.", "",
                   f"| STAAD ratio (governing) | L/C | Status | Hand calculation, angle ratio (elastic, conservative) |", "|---|---|---|---|",
                   f"| {st['rasio']:.3f} | {st['lc']} {nmlc.get(st['lc'], '')} | {st['status']} | {max(r['r'] for r in h['hasil']):.3f} |", "",
                   "Root forces, STAAD (local principal axes) vs hand calculation (geometric axes) - resultant moment and torsion:", "",
                   "| L/C | Combination | M STAAD √(My²+Mz²) | M hand √(My²+Mz²) | T STAAD | T hand | V STAAD | V hand |", "|---|---|---|---|---|---|---|---|"]
            sel = sorted(st["banding"], key=lambda b: -math.hypot(b[3]["My"], b[3]["Mz"]))[:6]
            for lc, nm, s, r in sorted(sel):
                md.append(f"| {lc} | {nm} | {math.hypot(s[4], s[5]):.4f} | {math.hypot(r['My'], r['Mz']):.4f} | {abs(s[3]):.4f} | {abs(r['T']):.4f} | "
                          f"{math.hypot(s[1], s[2]):.3f} | {math.hypot(r['Vy'], r['Vz']):.3f} |")
            md += ["", "STAAD does not check torsion of the angle or the weld; those come from the hand calculation above."]
    md += ["", "Notes: elastic principal-axis stresses (conservative: plastic 1.5·My and LTB of this short cantilever not credited); warping of the angle "
           "neglected (AISC DG9 §4.1); the existing structure (platform column / beam) must take the reactions above - check by the platform designer."]
    status = all(r["r"] <= 1 and r["rw"] <= 1 for r in h["hasil"]) and h["dl"] <= h["dlim"] and (not st or (st.get("rasio") or 0) <= 1)
    return "\n".join(md) + "\n", status, g, gw


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--folder", required=True); ap.add_argument("--ps"); ap.add_argument("--tanpa-pdf", action="store_true"); ap.add_argument("--tanpa-staad", action="store_true")
    a = ap.parse_args(); ROOT = os.path.abspath(a.folder)
    ps = json.load(open(os.path.abspath(a.ps) if a.ps else sorted(glob.glob(os.path.join(ROOT, "*.ps.json")))[0], encoding="utf-8"))
    import markdown
    for k in ps.get("kantilever", []):
        h = hitung(k, ps["umum"])
        d = os.path.join(ROOT, re.sub(r'[\\/:*?"<>|]+', "-", k["nama"]).strip()); os.makedirs(d, exist_ok=True)
        if not a.tanpa_staad: h["staad"] = model_staad(k, h, d)
        md, ok, g, gw = laporan(k, h)
        mdp = os.path.join(d, f"{k['nama']} - Kalkulasi.md"); open(mdp, "w", encoding="utf-8").write(md)
        st = h.get("staad") or {}
        print(f"{k['nama']}: {'OK' if ok else 'NOT OK'} — angle {g['r']:.3f} ({g['nm']}), weld {gw['rw']:.3f}, defl {h['dl']:.2f}/{h['dlim']:.2f} mm"
              + (f"; STAAD ratio {st.get('rasio')} L/C {st.get('lc')} err {st.get('err')}" if st else ""))
        if a.tanpa_pdf: continue
        lap = ps.get("laporan", {})
        css = ("@page{size:A4;margin:15mm}body{font-family:Arial,sans-serif;font-size:9.5pt}table{border-collapse:collapse;width:100%;margin:6px 0}"
               "td,th{border:1px solid #999;padding:3px 5px}th{background:#eee}h1{font-size:14pt}h2{font-size:11.5pt;margin-top:14px}")
        body = markdown.markdown(md, extensions=["tables"])
        hp = os.path.join(d, "_k.html")
        open(hp, "w", encoding="utf-8").write(f"<!doctype html><html><head><meta charset='utf-8'><style>{css}</style></head><body>"
                                              f"<p><b>{html.escape(lap.get('proyek', ''))}</b> — {html.escape(lap.get('drawing', ''))}</p>{body}</body></html>")
        out = os.path.join(ROOT, "PDF", f"{k['nama']} - Kalkulasi.pdf"); os.makedirs(os.path.dirname(out), exist_ok=True)
        subprocess.run([r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe", "--headless", "--disable-gpu", "--no-pdf-header-footer",
                        f"--print-to-pdf={out}", "file:///" + urllib.parse.quote(hp.replace("\\", "/"))], capture_output=True, timeout=120)
        os.remove(hp); print(f"  PDF: {out} {'OK' if os.path.exists(out) else 'GAGAL'}")


if __name__ == "__main__":
    main()
