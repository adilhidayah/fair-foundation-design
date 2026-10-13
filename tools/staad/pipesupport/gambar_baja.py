"""Gambar baja pipe support per tipe, langsung dari config yang dipakai model STAAD (pipesupport.py): elevasi (tiang, lengan,
cover plate, base plate, pipa, dimensi, elevasi absolut), potongan 1-1 (penampang tiang & lengan + orientasi ujung sayap / kaki
siku) dan denah base plate (profil tiang + baut). Output per tipe <folder>/<Tipe>/<Tipe> - Gambar Baja.dxf/.svg dan satu PDF
A3 landscape <folder>/PDF/Gambar Baja - Pipe Support.pdf. Hanya gambar - semua ukuran dari config / laporan pondasi.
  python gambar_baja.py --folder <folder Kalkulasi> [--ps x.ps.json] [--fondasi y.Fondasi.proyek.json] [--tipe ...] [--tanpa-pdf]
Data dasar per tipe di config: "dasar_gambar": {jenis pedestal|platform|slab, el (EL absolut y=0 model), grout (mm),
base_plate {B, L, t mm}, baut {jenis, n, dia, sx, sz}}; tipe berpondasi: pedestal & angkur dibaca dari "<Tipe> - Fondasi.md"."""
import argparse, glob, html, importlib.util, json, math, os, re, subprocess, sys, urllib.parse

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("pipesupport", os.path.join(HERE, "pipesupport.py"))
PS = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(PS)

LAYERS = {"STEEL": 5, "CONCRETE": 7, "DIM": 3, "TEXT": 7, "AXIS": 4, "HIDDEN": 8, "PIPE": 6, "REV": 1}
COL = {"STEEL": "#1d4ed8", "CONCRETE": "#222", "DIM": "#1f7a3a", "TEXT": "#222", "AXIS": "#2b6cb0", "HIDDEN": "#888",
       "PIPE": "#7c3aed", "REV": "#c0262d"}
SW = {"STEEL": 2.2, "CONCRETE": 2.5, "DIM": 1.0, "AXIS": 1.0, "HIDDEN": 1.2, "PIPE": 1.4, "REV": 1.6}
DASH = {"AXIS": "40 10 6 10", "HIDDEN": "12 8"}
TXT = 16


class Lembar:
    def __init__(self): self.E = []
    def line(self, ly, x1, y1, x2, y2): self.E.append(("line", ly, x1, y1, x2, y2))
    def rect(self, ly, x, y, w, h):
        for a, b in (((x, y), (x + w, y)), ((x + w, y), (x + w, y + h)), ((x + w, y + h), (x, y + h)), ((x, y + h), (x, y))):
            self.line(ly, *a, *b)
    def poly(self, ly, pts):
        for i, a in enumerate(pts): self.line(ly, *a, *pts[(i + 1) % len(pts)])
    def circle(self, ly, x, y, r): self.E.append(("circle", ly, x, y, r))
    def text(self, ly, x, y, s, h=TXT, align="left"): self.E.append(("text", ly, x, y, s, h, align))
    def dim(self, x1, y1, x2, y2, off, label=None):
        dx, dy = x2 - x1, y2 - y1; L = math.hypot(dx, dy) or 1; nx, ny = -dy / L, dx / L; sg = 1 if off >= 0 else -1
        a1, a2 = (x1 + nx * off, y1 + ny * off), (x2 + nx * off, y2 + ny * off)
        self.line("DIM", x1 + nx * sg * 6, y1 + ny * sg * 6, a1[0] + nx * sg * 8, a1[1] + ny * sg * 8)
        self.line("DIM", x2 + nx * sg * 6, y2 + ny * sg * 6, a2[0] + nx * sg * 8, a2[1] + ny * sg * 8)
        self.line("DIM", *a1, *a2)
        ux, uy, tk = dx / L, dy / L, 7
        for x, y in (a1, a2): self.line("DIM", x - (ux + nx) * tk, y - (uy + ny) * tk, x + (ux + nx) * tk, y + (uy + ny) * tk)
        vert = abs(dx) < 1e-9; s = label if label is not None else f"{L:.0f}"
        if vert: self.text("DIM", (a1[0] + a2[0]) / 2 + (-6 if off < 0 else 6), (a1[1] + a2[1]) / 2 - TXT * 0.35, s, TXT * 0.85, "right" if off < 0 else "left")
        else: self.text("DIM", (a1[0] + a2[0]) / 2, (a1[1] + a2[1]) / 2 + (5 if off > 0 else -TXT - 3), s, TXT * 0.85, "center")


def elv(m): return "±0.000" if abs(m) < 5e-4 else ("+" if m > 0 else "−") + f"{abs(m):.3f}"


def kolom_denah(pr, toe):
    """outline penampang tiang di denah (x = STAAD X, y = STAAD Z) relatif titik berat, mm"""
    if pr["jenis"] == "L":
        L, t, cy = pr["h"], pr["tw"], pr["cy"]
        return [(u + cy, v - cy) for u, v in ((0, 0), (-L, 0), (-L, t), (-t, t), (-t, L), (0, L))]
    h, b, tw, tf, s = pr["h"], pr["b"], pr["tw"], pr["tf"], (-1 if str(toe).startswith("-") else 1)
    return [(u, s * (v - pr["cy"])) for u, v in ((-h / 2, 0), (h / 2, 0), (h / 2, b), (h / 2 - tf, b), (h / 2 - tf, tw),
                                                  (-h / 2 + tf, tw), (-h / 2 + tf, b), (-h / 2, b))]


def penampang_lengan(pr, toe):
    """penampang lengan di bidang Z-Y (z relatif titik berat, v dari bawah lengan), mm"""
    s = -1 if str(toe).startswith("-") else 1
    if pr["jenis"] == "L":
        L, t = pr["h"], pr["tw"]; loc = ((0, 0), (t, 0), (t, L - t), (L, L - t), (L, L), (0, L))
    else:
        h, b, tw, tf = pr["h"], pr["b"], pr["tw"], pr["tf"]
        loc = ((0, 0), (b, 0), (b, tf), (tw, tf), (tw, h - tf), (b, h - tf), (b, h), (0, h))
    return [(s * (u - pr["cy"]), v) for u, v in loc]


def pondasi_md(folder, t):
    p = os.path.join(folder, f"{t} - Fondasi.md")
    if not os.path.exists(p): return {}
    md = open(p, encoding="utf-8").read(); out = {}
    m = re.search(r"pedestal ([\d.]+) × ([\d.]+) m, top ([\d.]+) m above grade", md)
    if m: out.update(Bp=float(m.group(1)) * 1000, Lp=float(m.group(2)) * 1000, Gp=float(m.group(3)) * 1000)
    m = re.search(r"Anchor bolts \| (\d+)-M(\d+) @ (\d+) × (\d+)", md)
    if m: out["baut"] = dict(jenis="anchor bolt", n=int(m.group(1)), dia=int(m.group(2)), sx=int(m.group(3)), sz=int(m.group(4)))
    m = re.search(r"grout (\d+) mm", md)
    if m: out["grout"] = int(m.group(1))
    return out


def gambar_tipe(tp, um, folder, fp):
    nama = tp["nama"]; S = Lembar()
    ti = tp["tiang"]; pt = PS.dimensi_profil(ti["profil"]); toe_t = ti.get("ujung_sayap", "+Z")
    dg = tp.get("dasar_gambar") or PS.berhenti(f"{nama}: 'dasar_gambar' belum diisi di config")
    jenis, EL0 = dg["jenis"], float(dg["el"])
    fd = pondasi_md(folder, nama)
    num = re.search(r"(\d+\.\d+)(-\w+)?", nama)
    pre = fp.get("presets", {}).get((fp.get("preset_per_tipe", {}).get(num.group(0)) or fp.get("preset_per_tipe", {}).get(num.group(1), "")) if num else "", {})
    if jenis == "pedestal":
        bp = dict(B=pre.get("baseplate", {}).get("B", 0.25) * 1000, L=pre.get("baseplate", {}).get("L", 0.25) * 1000,
                  t=pre.get("baseplate", {}).get("t", 12))
        bt = fd.get("baut") or dict(jenis="anchor bolt", **{k: pre.get("bolts", {}).get(k) for k in ("n", "dia", "sx", "sz")})
        gr = fd.get("grout", pre.get("groutT", 25)); Bp = fd.get("Bp", pre.get("Bp", 0.3) * 1000)
        if dg.get("base_plate"): bp = dict(dg["base_plate"])          # config menimpa preset (mis. pondasi oleh gambar lain)
        if dg.get("baut"): bt = dict(dg["baut"])
        if dg.get("grout") is not None: gr = dg["grout"]
        if dg.get("pedestal_ref") and not fd: Bp = max(bp["B"], bp["L"]) + 150
    else:
        bp = dict(dg["base_plate"]); bt = dict(dg.get("baut", {})); gr = dg.get("grout", 0); Bp = 0
    y_bob = gr if jenis == "slab" else 0.0          # slab: y=0 model = T.O.C., plat di atas grouting
    H = float(ti["tinggi"]) * 1000
    # ---- level (logika sama dengan pipesupport.buat_tipe)
    lv_all = sorted(tp["level"], key=lambda l: -(l.get("elev") or 1e9)); info = []
    for i, lv in enumerate(lv_all):
        pl = PS.dimensi_profil(lv.get("profil", ti["profil"])); atas = i == 0 and lv.get("elev") is None
        cap = float(lv.get("tebal_cap_mm", 0)) if atas and pl["jenis"] == "UNP" else 0.0
        if atas and pl["jenis"] == "L": y_top = H + pl["e_atas"]
        elif atas: y_top = H + cap + pl["h"]
        else: y_top = float(lv["elev"]) * 1000 + pl["e_atas"]
        info.append(dict(lv=lv, pl=pl, atas=atas, cap=cap, top=y_top, bot=y_top - pl["h"], kiri=float(lv.get("kiri", 0)) * 1000,
                         kanan=float(lv.get("kanan", 0)) * 1000, toe=lv.get("ujung_sayap", "+Z")))
    # puncak baja tiang: siku dengan lengan siku dilas di puncak -> sampai bawah kaki horizontal lengan
    y_ctop = info[0]["top"] - info[0]["pl"]["tw"] if info[0]["atas"] and info[0]["pl"]["jenis"] == "L" else H
    y_c0 = y_bob + bp["t"]
    if pt["jenis"] == "L": cx1, cx2, cin = -pt["h"] + pt["cy"], pt["cy"], [pt["cy"] - pt["tw"]]
    else: cx1, cx2, cin = -pt["h"] / 2, pt["h"] / 2, []
    kiri = max(i_["kiri"] for i_ in info); kanan = max(i_["kanan"] for i_ in info)
    ytop = max(i_["top"] for i_ in info)

    # ================= ELEVASI (lihat searah Z) =================
    S.line("AXIS", 0, -180, 0, ytop + 260)
    if jenis == "pedestal":
        S.rect("CONCRETE", -Bp / 2, -gr - 320, Bp, 320); S.rect("HIDDEN", -bp["B"] / 2, -gr, bp["B"], gr)
        S.text("TEXT", Bp / 2 + 20, -gr - 160, f"PEDESTAL - see {dg['pedestal_ref']}" if dg.get("pedestal_ref") and not fd
               else f"PEDESTAL {Bp:.0f}×{Bp:.0f} (see foundation drawing)")
    elif jenis == "slab":
        S.line("CONCRETE", -max(kiri, 250) - 150, 0, max(kanan, 250) + 150, 0); S.line("CONCRETE", -max(kiri, 250) - 150, -150, max(kanan, 250) + 150, -150)
        S.rect("HIDDEN", -bp["B"] / 2, 0, bp["B"], gr); S.text("TEXT", max(kanan, 250) + 20, -90, "CONCRETE SLAB (existing)")
    else:
        S.rect("HIDDEN", -max(kiri, 200) - 100, -120, max(kiri, 200) + max(kanan, 200) + 200, 120)
        S.text("TEXT", max(kanan, 200) + 120, -70, "EXIST. PLATFORM STRUCTURE")
    S.rect("STEEL", -bp["B"] / 2, y_bob, bp["B"], bp["t"])
    if bt.get("n"):
        for a in (-1, 1):
            xb = a * bt["sx"] / 2; S.line("STEEL", xb, y_c0 + 30, xb, y_bob - (160 if jenis == "pedestal" else 70))
            S.rect("STEEL", xb - bt["dia"] * 0.8, y_c0, bt["dia"] * 1.6, bt["dia"] * 0.8)
    y_vis = min(y_ctop, info[0]["bot"]) if info[0]["atas"] else y_ctop     # di dalam lengan atas: garis tersembunyi
    for x in [cx1, cx2] + cin:
        S.line("STEEL", x, y_c0, x, y_vis)
        if y_ctop > y_vis + 0.5: S.line("HIDDEN", x, y_vis, x, y_ctop)
    if not (info[0]["atas"] and info[0]["pl"]["jenis"] == "L"): S.line("STEEL", cx1, y_ctop, cx2, y_ctop)
    for inf in info:
        pl = inf["pl"]
        if inf["cap"]:
            w = max(pt["h"], pl["b"]) + 20; S.rect("STEEL", -w / 2, H, w, inf["cap"])
            S.text("TEXT", w / 2 + 15, H - 4, f"COVER PLATE t = {inf['cap']:.0f}", TXT * 0.85)
        segs = [(-inf["kiri"], inf["kanan"])] if inf["atas"] else [(x1, x2) for x1, x2 in ((-inf["kiri"], cx1), (cx2, inf["kanan"])) if x2 - x1 > 1]
        for x1, x2 in segs:
            S.rect("STEEL", x1, inf["bot"], x2 - x1, pl["h"])
            if pl["jenis"] == "L": S.line("STEEL", x1, inf["top"] - pl["tw"], x2, inf["top"] - pl["tw"])
            else:
                for yy in (inf["top"] - pl["tf"], inf["bot"] + pl["tf"]): S.line("HIDDEN", x1, yy, x2, yy)
        for p in inf["lv"].get("pipa", []):
            bp_ = PS.beban_pipa(p); R = bp_["Dluar"] * 500; x = float(p["x"]) * 1000; yc = inf["top"] + float(p.get("shoe_mm", 0)) + R
            S.circle("PIPE", x, yc, R); S.line("AXIS", x - R - 10, yc, x + R + 10, yc); S.line("AXIS", x, yc - R - 10, x, yc + R + 10)
            S.text("PIPE", x, yc + R + 14, f"DN{p['DN']} ({p.get('nama', '')})", TXT * 0.8, "center")
        S.text("TEXT", -inf["kiri"] - 20, inf["bot"] + pl["h"] / 2 - 6, f"ARM {pl['nama']}", TXT * 0.9, "right")
    # dimensi lengan (rantai di atas lengan teratas) + elevasi
    for k, inf in enumerate(info):
        xs = sorted({round(-inf["kiri"], 1), 0.0, round(inf["kanan"], 1)} | {round(float(p["x"]) * 1000, 1) for p in inf["lv"].get("pipa", [])})
        ydim = inf["top"] + 150 + (90 if k == 0 else 0)
        for a, b in zip(xs[:-1], xs[1:]):
            if b - a > 0.5: S.dim(a, ydim, b, ydim, 0)
        if k == 0 and len(xs) > 2: S.dim(xs[0], ydim + 60, xs[-1], ydim + 60, 0)
    xl = -kiri - 140
    ys = [y_bob] + sorted(i_["top"] for i_ in info)
    for a_, b_ in zip(ys[:-1], ys[1:]): S.dim(xl, a_, xl, b_, -40, f"{b_ - a_:.0f}")
    xr = max(kanan, bp["B"] / 2, Bp / 2) + 120
    def tag(y, s):
        S.line("DIM", xr - 40, y, xr + 260, y); S.text("DIM", xr + 10, y + 5, s, TXT * 0.85)
    if jenis == "platform": tag(0, f"EL {elv(EL0)} T.O.S. platform = B.O.B. plate")
    else: tag(y_bob, f"EL {elv(EL0 + y_bob / 1000)} B.O.B. plate")
    if jenis == "slab": tag(0, f"EL {elv(EL0)} T.O.C.")
    for inf in info: tag(inf["top"], f"EL {elv(EL0 + inf['top'] / 1000)} T.O.S.")
    S.text("TEXT", cx2 + 15, (y_c0 + min(i_["bot"] for i_ in info)) / 2, f"COLUMN {pt['nama']}", TXT * 0.9)
    S.text("TEXT", 0, -gr - 400 if jenis == "pedestal" else -260, f"ELEVATION — {nama}", TXT * 1.5, "center")

    # ================= POTONGAN 1-1 (lihat searah X; horizontal = Z) =================
    ox = xr + 620
    Z = lambda z: ox + z
    zc = [z for z, _ in kolom_denah(pt, toe_t)]
    S.line("AXIS", ox, -150, ox, ytop + 200)
    S.rect("STEEL", Z(-bp["L"] / 2), y_bob, bp["L"], bp["t"])
    if jenis == "pedestal": S.rect("CONCRETE", Z(-Bp / 2), -gr - 320, Bp, 320)
    else: S.line("CONCRETE", Z(-max(bp["L"], 300) / 2 - 80), 0, Z(max(bp["L"], 300) / 2 + 80), 0)
    zcol = [y for _, y in kolom_denah(pt, toe_t)]
    z1, z2 = min(zcol), max(zcol)
    S.line("STEEL", Z(z1), y_c0, Z(z1), y_ctop); S.line("STEEL", Z(z2), y_c0, Z(z2), y_ctop)
    if pt["jenis"] == "L": S.line("STEEL", Z(-pt["cy"] + pt["tw"]), y_c0, Z(-pt["cy"] + pt["tw"]), y_ctop)
    else:
        s = -1 if str(toe_t).startswith("-") else 1; zw = s * (pt["tw"] - pt["cy"]); S.line("HIDDEN", Z(zw), y_c0, Z(zw), y_ctop)
    for inf in info:
        pts = [(Z(z), inf["bot"] + v) for z, v in penampang_lengan(inf["pl"], inf["toe"])]; S.poly("STEEL", pts)
        if inf["cap"]: S.rect("STEEL", Z(-inf["pl"]["b"] / 2 - 10), H, inf["pl"]["b"] + 20, inf["cap"])
        pp = inf["lv"].get("pipa", [])
        if pp:
            pl = inf["pl"]; s = -1 if str(inf["toe"]).startswith("-") else 1
            R = max(PS.beban_pipa(p)["Dluar"] for p in pp) * 500; zp = s * (pl["b"] / 2 - pl["cy"])
            S.circle("PIPE", Z(zp), inf["top"] + R, R)
        S.text("TEXT", Z(max(z2, 60) + 25), inf["bot"] + 10, f"{inf['pl']['nama']} — toe {inf['toe']}", TXT * 0.8)
    S.text("TEXT", Z(max(z2, 60) + 25), y_c0 + 120, f"{pt['nama']}" + (f" — toe {toe_t}" if pt["jenis"] == "UNP" else " (legs −X / +Z)"), TXT * 0.8)
    S.text("TEXT", ox, -gr - 400 if jenis == "pedestal" else -260, "SECTION 1-1 (looking along X)", TXT * 1.5, "center")

    # ================= DENAH BASE PLATE =================
    px, py = ox + 520, max(ytop * 0.55, 350)
    S.rect("STEEL", px - bp["B"] / 2, py - bp["L"] / 2, bp["B"], bp["L"])
    S.poly("STEEL", [(px + x, py + z) for x, z in kolom_denah(pt, toe_t)])
    S.line("AXIS", px - bp["B"] / 2 - 40, py, px + bp["B"] / 2 + 40, py); S.line("AXIS", px, py - bp["L"] / 2 - 40, px, py + bp["L"] / 2 + 40)
    if bt.get("n"):
        for a, b in ((-1, -1), (1, -1), (1, 1), (-1, 1))[: bt["n"]]: S.circle("STEEL", px + a * bt["sx"] / 2, py + b * bt["sz"] / 2, bt["dia"] / 2 + 1.5)
        S.dim(px - bt["sx"] / 2, py + bp["L"] / 2, px + bt["sx"] / 2, py + bp["L"] / 2, 35)
        S.dim(px + bp["B"] / 2, py + bt["sz"] / 2, px + bp["B"] / 2, py - bt["sz"] / 2, -35)
    S.dim(px - bp["B"] / 2, py - bp["L"] / 2, px + bp["B"] / 2, py - bp["L"] / 2, -45)
    S.text("TEXT", px, py - bp["L"] / 2 - 110, "BASE PLATE PLAN (x = STAAD X, up = +Z)", TXT * 1.2, "center")
    ket = [f"BASE PLATE {bp['B']:.0f}×{bp['L']:.0f}×{bp['t']:.0f}"]
    if bt.get("n"): ket.append(f"{bt['n']}-M{bt['dia']} {bt['jenis'].upper()} @ {bt['sx']}×{bt['sz']}")
    elif bt.get("catatan"): ket.append(bt["catatan"])
    if bp.get("cek"): ket.append("CHECK: " + bp["cek"])
    for i, s in enumerate(ket): S.text("REV" if s.startswith("CHECK") else "TEXT", px - bp["B"] / 2, py - bp["L"] / 2 - 145 - i * 22, s, TXT * 0.9)

    # ================= judul & catatan =================
    n_rev = -(-len(tp.get("revisi", "")) // 150)
    yT = ytop + 330 + 36 + 4 * 22 + 10 + n_rev * 22 + 40; x0 = -kiri - 150
    S.text("TEXT", x0, yT, f"STEEL SUPPORT {nama} — AS DESIGNED IN STAAD ({nama}.std)", TXT * 1.9)
    baris = [f"Location: {tp.get('lokasi', '-')}", tp.get("tos_catatan", ""),
             f"Base: {jenis} - y=0 of the model at EL {elv(EL0)}" + (f"; grout {gr} mm" if gr else ""),
             "Profiles: JIS (STAAD JAPANESE table); dimensions in mm, elevations in m."]
    for i, s in enumerate(b for b in baris if b): S.text("TEXT", x0, yT - 36 - i * 22, s, TXT * 0.9)
    if tp.get("revisi"):
        r = tp["revisi"]; w = 150
        for i in range(0, len(r), w): S.text("REV", x0, yT - 36 - len(baris) * 22 - 10 - (i // w) * 22, ("REVISED: " if i == 0 else "") + r[i:i + w], TXT * 0.9)
    return S.E


def batas(E):
    x1 = y1 = 1e18; x2 = y2 = -1e18
    def add(x, y):
        nonlocal x1, y1, x2, y2; x1, y1, x2, y2 = min(x1, x), min(y1, y), max(x2, x), max(y2, y)
    for e in E:
        if e[0] == "line": add(e[2], e[3]); add(e[4], e[5])
        elif e[0] == "circle": add(e[2] - e[4], e[3] - e[4]); add(e[2] + e[4], e[3] + e[4])
        else:
            w = len(e[4]) * e[5] * 0.55; xa = e[2] - (w / 2 if e[6] == "center" else w if e[6] == "right" else 0); add(xa, e[3]); add(xa + w, e[3] + e[5])
    return x1, y1, x2, y2


def ke_svg(E, judul=""):
    x1, y1, x2, y2 = batas(E); m = 40; W, Hh = x2 - x1 + 2 * m, y2 - y1 + 2 * m
    X = lambda x: f"{x - x1 + m:.1f}"; Y = lambda y: f"{y2 - y + m:.1f}"
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W:.0f} {Hh:.0f}" style="background:#fff;font-family:Arial,sans-serif">']
    if judul: o.append(f"<title>{html.escape(judul)}</title>")
    for e in E:
        if e[0] == "line":
            d = f' stroke-dasharray="{DASH[e[1]]}"' if e[1] in DASH else ""
            o.append(f'<line x1="{X(e[2])}" y1="{Y(e[3])}" x2="{X(e[4])}" y2="{Y(e[5])}" stroke="{COL[e[1]]}" stroke-width="{SW.get(e[1], 1.5)}"{d}/>')
        elif e[0] == "circle":
            o.append(f'<circle cx="{X(e[2])}" cy="{Y(e[3])}" r="{e[4]:.1f}" stroke="{COL[e[1]]}" stroke-width="{SW.get(e[1], 1.5)}" fill="none"/>')
        else:
            a = {"center": "middle", "right": "end"}.get(e[6], "start")
            o.append(f'<text x="{X(e[2])}" y="{Y(e[3])}" font-size="{e[5]:.0f}" fill="{COL[e[1]]}" text-anchor="{a}">{html.escape(e[4])}</text>')
    o.append("</svg>"); return "\n".join(o)


def ke_dxf(E):
    o = []
    p = lambda c, v: o.extend([str(c), str(v)])
    p(0, "SECTION"); p(2, "HEADER"); p(9, "$ACADVER"); p(1, "AC1009"); p(9, "$INSUNITS"); p(70, 4); p(0, "ENDSEC")
    p(0, "SECTION"); p(2, "TABLES"); p(0, "TABLE"); p(2, "LTYPE"); p(70, 3)
    for nm, ds, pat in (("CONTINUOUS", "Solid", []), ("DASHED", "Dashed", [12.7, -6.35]), ("CENTER", "Center", [31.75, -6.35, 6.35, -6.35])):
        p(0, "LTYPE"); p(2, nm); p(70, 0); p(3, ds); p(72, 65); p(73, len(pat)); p(40, sum(abs(v) for v in pat))
        for v in pat: p(49, v)
    p(0, "ENDTAB"); p(0, "TABLE"); p(2, "LAYER"); p(70, len(LAYERS))
    for nm, c in LAYERS.items():
        p(0, "LAYER"); p(2, nm); p(70, 0); p(62, c); p(6, "CENTER" if nm == "AXIS" else "DASHED" if nm == "HIDDEN" else "CONTINUOUS")
    p(0, "ENDTAB"); p(0, "ENDSEC"); p(0, "SECTION"); p(2, "ENTITIES")
    f = lambda v: f"{v:.2f}"
    rep = {"±": "%%p", "×": "x", "−": "-", "—": "-", "Ø": "%%c", "°": "%%d"}
    for e in E:
        if e[0] == "line": p(0, "LINE"); p(8, e[1]); p(10, f(e[2])); p(20, f(e[3])); p(30, 0); p(11, f(e[4])); p(21, f(e[5])); p(31, 0)
        elif e[0] == "circle": p(0, "CIRCLE"); p(8, e[1]); p(10, f(e[2])); p(20, f(e[3])); p(30, 0); p(40, f(e[4]))
        else:
            s = "".join(rep.get(ch, ch if 32 <= ord(ch) < 127 else "?") for ch in e[4]); h = {"center": 1, "right": 2}.get(e[6], 0)
            p(0, "TEXT"); p(8, e[1]); p(10, f(e[2])); p(20, f(e[3])); p(30, 0); p(40, f(e[5])); p(1, s)
            if h: p(72, h); p(11, f(e[2])); p(21, f(e[3])); p(31, 0)
    p(0, "ENDSEC"); p(0, "EOF"); return "\r\n".join(o) + "\r\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--folder", required=True); ap.add_argument("--ps"); ap.add_argument("--fondasi"); ap.add_argument("--tipe", nargs="*")
    ap.add_argument("--tanpa-pdf", action="store_true"); ap.add_argument("--out")
    a = ap.parse_args()
    ROOT = os.path.abspath(a.folder)
    ps = json.load(open(os.path.abspath(a.ps) if a.ps else sorted(glob.glob(os.path.join(ROOT, "*.ps.json")))[0], encoding="utf-8"))
    fpp = os.path.abspath(a.fondasi) if a.fondasi else (sorted(glob.glob(os.path.join(ROOT, "*Fondasi.proyek.json"))) or [None])[0]
    fp = json.load(open(fpp, encoding="utf-8")) if fpp else {}
    tdir = lambda t: os.path.join(ROOT, re.sub(r'[\\/:*?"<>|]+', "-", t).strip())
    pilih = a.tipe or [t["nama"] for t in ps["tipe"]]
    halaman = []
    for t in pilih:
        tp = next(x for x in ps["tipe"] if x["nama"] == t); d = tdir(t); os.makedirs(d, exist_ok=True)
        E = gambar_tipe(tp, ps["umum"], d, fp)
        svg = ke_svg(E, t)
        open(os.path.join(d, f"{t} - Gambar Baja.svg"), "w", encoding="utf-8").write(svg)
        open(os.path.join(d, f"{t} - Gambar Baja.dxf"), "w", encoding="latin-1", newline="").write(ke_dxf(E))
        halaman.append((t, svg)); print(f"{t}: Gambar Baja .svg/.dxf OK")
    if a.tanpa_pdf: return
    lap = ps.get("laporan", {})
    css = ("@page{size:A3 landscape;margin:10mm}body{margin:0;font-family:Arial,sans-serif}"
           ".pg{page-break-after:always;height:270mm;display:flex;flex-direction:column}.pg:last-child{page-break-after:auto}"
           ".hd{display:flex;justify-content:space-between;font-size:11pt;border-bottom:1.5px solid #222;padding-bottom:3mm;margin-bottom:3mm}"
           ".pg svg{flex:1;width:100%;height:100%}")
    body = "".join(f'<div class="pg"><div class="hd"><b>{html.escape(lap.get("proyek", ""))} — {html.escape(t)}</b>'
                   f'<span>{html.escape(lap.get("drawing", ""))} — steel support as designed (STAAD) — page {i + 1}/{len(halaman)}</span></div>'
                   f'{s.split("?>")[-1]}</div>' for i, (t, s) in enumerate(halaman))
    hp = os.path.join(ROOT, "_gambar_baja.html")
    open(hp, "w", encoding="utf-8").write(f"<!doctype html><html><head><meta charset='utf-8'><style>{css}</style></head><body>{body}</body></html>")
    out = os.path.abspath(a.out or os.path.join(ROOT, "PDF", "Gambar Baja - Pipe Support.pdf")); os.makedirs(os.path.dirname(out), exist_ok=True)
    edge = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
    subprocess.run([edge, "--headless", "--disable-gpu", "--no-pdf-header-footer", f"--print-to-pdf={out}",
                    "file:///" + urllib.parse.quote(hp.replace("\\", "/"))], capture_output=True, timeout=180)
    os.remove(hp)
    print(f"PDF: {out} {'OK' if os.path.exists(out) else 'GAGAL'}")


if __name__ == "__main__":
    main()
