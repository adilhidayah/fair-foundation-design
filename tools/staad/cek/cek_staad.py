# cek_staad.py
# Membuat tabel cek hasil STAAD.Pro: lendutan vertikal, simpangan angin, simpangan gempa (D.Cd/Ie)
# dan rasio baja. File .std user TIDAK diubah: model disalin ke folder sementara, ditambah blok
# PRINT di akhir (sebelum FINISH), dijalankan dengan engine SProStaad tanpa GUI, lalu .ANL dibaca.
#
# Pakai:
#   python -I cek_staad.py --model "E:\...\Model.std" --config "E:\...\Model.cek.json"
#   python -I cek_staad.py --model "...std" --config "...json" --anl "hasil.ANL"   (tanpa running)
import argparse, csv, ctypes, glob, json, math, os, re, shutil, subprocess, sys, time

sys.stdout.reconfigure(encoding="utf-8")
KE_MM = {"MM": 1.0, "MMS": 1.0, "CM": 10.0, "METE": 1000.0, "METER": 1000.0, "INCH": 25.4, "FEET": 304.8, "KM": 1e6}

def berhenti(pesan):
    print("BERHENTI: " + pesan)
    sys.exit(1)

# ---------------------------------------------------------------- daftar & grup STAAD
def baca_std(path):
    with open(path, encoding="latin-1") as f:
        return f.read().splitlines()

def gabung_lanjutan(baris):
    """Gabungkan baris STAAD yang diakhiri '-' (lanjutan)."""
    hasil, buf = [], ""
    for b in baris:
        t = b.split("*")[0].rstrip() if b.lstrip().startswith("*") else b.rstrip()
        if t.endswith("-"):
            buf += t[:-1] + " "
        else:
            hasil.append(buf + t)
            buf = ""
    if buf:
        hasil.append(buf)
    return hasil

def grup_std(baris):
    """Grup dari START GROUP DEFINITION ... END GROUP DEFINITION: {'_NAMA': [no,...]}."""
    grup, aktif = {}, False
    for b in gabung_lanjutan(baris):
        u = b.strip().upper()
        if u.startswith("START GROUP DEFINITION"):
            aktif = True; continue
        if u.startswith("END GROUP DEFINITION"):
            aktif = False; continue
        if aktif and u.startswith("_"):
            nama, _, isi = u.partition(" ")
            grup[nama] = urai_daftar(isi, {})
    return grup

def urai_daftar(teks, grup):
    """'1 TO 10 BY 2 15 _KOLOM' / [1,2] / 'ALL' -> list int (ALL -> None)."""
    if teks is None:
        return None
    if isinstance(teks, list):
        return [int(x) for x in teks]
    if isinstance(teks, int):
        return [teks]
    tok = str(teks).replace(",", " ").replace(";", " ").upper().split()
    if tok == ["ALL"]:
        return None
    hasil, i = [], 0
    while i < len(tok):
        t = tok[i]
        if t.startswith("_"):
            if t not in grup:
                berhenti(f"grup {t} tidak ada di START GROUP DEFINITION file .std")
            hasil += grup[t]; i += 1
        elif i + 2 < len(tok) and tok[i + 1] == "TO":
            a, b, s = int(t), int(tok[i + 2]), 1
            i += 3
            if i + 1 < len(tok) and tok[i] == "BY":
                s = int(tok[i + 1]); i += 2
            hasil += list(range(a, b + 1, s))
        else:
            hasil.append(int(t)); i += 1
    return hasil

def kasus_beban_std(baris):
    ada = set()
    for b in baris:
        m = re.match(r"^\s*LOAD\s+(?:COMB(?:INATION)?\s+(?:SRSS\s+|ABS\s+|CQC\s+)?)?(\d+)\b", b, re.I)
        if m:
            ada.add(int(m.group(1)))
    return ada

def tulis_daftar(perintah, nomor):
    """Baris STAAD dengan daftar nomor, dipecah dengan lanjutan '-' agar < 79 kolom."""
    teks = " ".join(str(n) for n in sorted(set(nomor)))
    baris, cur = [], perintah
    for t in teks.split():
        if len(cur) + len(t) + 3 > 72:
            baris.append(cur + " -"); cur = ""
        cur = (cur + " " + t).strip() if cur else t
    baris.append(cur)
    return baris

# ---------------------------------------------------------------- batas izin
def urai_batas(batas):
    """10 -> ('mm',10) ; 'L/240' -> ('L',240) ; 'H/200' -> ('H',200) ; '0.02H' -> ('Hx',0.02)."""
    if isinstance(batas, (int, float)):
        return ("mm", float(batas))
    s = str(batas).replace(" ", "").upper()
    m = re.match(r"^([LH])/([\d.]+)$", s)
    if m:
        return (m.group(1), float(m.group(2)))
    m = re.match(r"^([\d.]+)\*?([LH])$", s)
    if m:
        return (m.group(2) + "x", float(m.group(1)))
    try:
        return ("mm", float(s.replace("MM", "")))
    except ValueError:
        berhenti(f"format batas tidak dikenal: {batas} (pakai angka mm, 'L/240', 'H/200' atau '0.02H')")

def nilai_batas(batas, panjang_mm):
    jenis, v = batas
    if jenis == "mm":
        return v
    if panjang_mm is None:
        return None
    return panjang_mm / v if jenis in ("L", "H") else panjang_mm * v

# ---------------------------------------------------------------- running engine
def cari_engine():
    kandidat = sorted(glob.glob(r"C:\Program Files\Bentley\Engineering\STAAD.Pro*\STAAD\SProStaad\SProStaad.exe"))
    if not kandidat:
        berhenti("SProStaad.exe tidak ditemukan di C:\\Program Files\\Bentley\\Engineering\\STAAD.Pro*")
    return kandidat[-1]

def jalankan(model, blok, timeout):
    baris = baca_std(model)
    idx = max((i for i, b in enumerate(baris) if b.strip().upper() == "FINISH"), default=len(baris))
    baru = baris[:idx] + ["*", "* ==== DITAMBAHKAN OLEH cek_staad.py (salinan sementara) ===="] + blok + baris[idx:]
    if idx == len(baris):
        baru.append("FINISH")
    # Engine STAAD gagal ("Cannot Open Input File") bila path berisi spasi, tanda hubung, atau terlalu
    # panjang -> pakai path pendek 8.3 (mis. C:\Users\MSI~1\...) dan nama folder hanya angka.
    akar = os.path.join(os.path.expandvars(r"%LOCALAPPDATA%"), "Temp", "staadcek")
    os.makedirs(akar, exist_ok=True)
    for lama in glob.glob(os.path.join(akar, "*")):  # bersihkan run > 2 hari
        if time.time() - os.path.getmtime(lama) > 2 * 86400:
            shutil.rmtree(lama, ignore_errors=True)
    kerja = os.path.join(akar, time.strftime("%Y%m%d%H%M%S"))
    os.makedirs(kerja, exist_ok=True)
    buf = ctypes.create_unicode_buffer(260)
    if ctypes.windll.kernel32.GetShortPathNameW(kerja, buf, 260):
        kerja = buf.value
    if re.search(r"[\s\-]", kerja):
        berhenti(f"tidak bisa mendapat path tanpa spasi/tanda hubung untuk folder kerja: {kerja}")
    std = os.path.join(kerja, "cek.std")
    with open(std, "w", encoding="latin-1", newline="\r\n") as f:
        f.write("\n".join(baru) + "\n")
    anl = os.path.join(kerja, "cek.ANL")
    print(f"Menjalankan engine STAAD pada salinan: {std}")
    p = subprocess.Popen([cari_engine(), std], cwd=kerja)
    mulai = time.time()
    selesai = False
    while time.time() - mulai < timeout:
        time.sleep(1)
        if os.path.exists(anl):
            with open(anl, encoding="latin-1", errors="replace") as f:
                if "END OF THE STAAD.Pro RUN" in f.read():
                    selesai = True; break
        if p.poll() is not None and not os.path.exists(anl):
            break
        if time.time() - mulai > 30 and not os.path.exists(anl) and not os.path.exists(os.path.join(kerja, "cek.log")):
            print("Engine tidak menulis output dalam 30 detik (kemungkinan dialog 'Cannot Open Input File').")
            break
    if p.poll() is None:  # jendela "STAAD Analysis and Design" tetap terbuka -> tutup (proses milik skrip ini)
        p.kill()
    if not selesai:
        log = os.path.join(kerja, "cek.log")
        ekor = open(log, encoding="latin-1", errors="replace").read()[-1500:] if os.path.exists(log) else ""
        berhenti(f"analisis tidak selesai dalam {timeout} detik.\n{ekor}")
    print(f"Analisis selesai ({time.time() - mulai:.0f} detik).")
    return anl

# ---------------------------------------------------------------- parser .ANL
def angka(s):
    return [float(x) for x in re.findall(r"-?\d+\.\d+(?:E[-+]?\d+)?|-?\d+(?=\s|$)", s, re.I)]

def parse_anl(path):
    with open(path, encoding="latin-1", errors="replace") as f:
        L = f.read().splitlines()
    data = {"panjang": {}, "ujung": {}, "koord": {}, "disp": {}, "sect": {}, "baja": {}, "reaksi": {}, "error": [],
            "warning": 0}
    i, n = 0, len(L)
    while i < n:
        s = L[i]
        u = s.upper()
        if re.search(r"\*\*+\s*ERROR", u):
            data["error"].append(" ".join(x.strip() for x in L[i:i + 2]))
        if "WARNING" in u and not u.lstrip()[:1].isdigit():
            data["warning"] += 1
        # --- MEMBER INFORMATION
        if u.strip() == "MEMBER INFORMATION":
            m = re.search(r"LENGTH.*", L[i + 3]) if i + 3 < n else None
            sat = re.search(r"\((\w+)\s*\)", L[i + 3]) if i + 3 < n else None
            f = KE_MM.get(sat.group(1).upper(), 1.0) if sat else 1.0
            i += 4
            while i < n and "END OF DATA" not in L[i]:
                m = re.match(r"^\s+(\d+)\s+(\d+)\s+(\d+)\s+(-?[\d.]+)\s", L[i])
                if m:
                    mb = int(m.group(1))
                    data["panjang"][mb] = float(m.group(4)) * f
                    data["ujung"][mb] = (int(m.group(2)), int(m.group(3)))
                i += 1
            continue
        # --- JOINT COORDINATES
        if re.match(r"^\s*JOINT COORDINATES\s*$", s) and i + 1 < n and "---" in L[i + 1]:
            f = 1000.0
            j = i + 2
            while j < n and "END OF DATA" not in L[j]:
                h = re.search(r"COORDINATES ARE\s+(\w+)", L[j], re.I)
                if h and h.group(1).upper() in KE_MM:
                    f = KE_MM[h.group(1).upper()]
                m = re.match(r"^\s+(\d+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*$", L[j])
                if m:
                    data["koord"][int(m.group(1))] = tuple(float(m.group(k)) * f for k in (2, 3, 4))
                j += 1
            i = j; continue
        # --- JOINT DISPLACEMENT (CM RADIANS)
        m = re.match(r"^\s*JOINT DISPLACEMENT \(\s*(\w+)", s)
        if m:
            f = KE_MM.get(m.group(1).upper(), 10.0)
            j, node = i + 1, None
            while j < n and "END OF LATEST" not in L[j] and "JOINT DISPLACEMENT (" not in L[j]:
                t = L[j]
                m2 = re.match(r"^\s+(\d+)\s+(\d+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s", t)
                m3 = re.match(r"^\s{8,}(\d+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s", t)
                if m2:
                    node = int(m2.group(1)); lc = int(m2.group(2)); v = [float(m2.group(k)) for k in (3, 4, 5)]
                elif m3 and node is not None:
                    lc = int(m3.group(1)); v = [float(m3.group(k)) for k in (2, 3, 4)]
                else:
                    j += 1; continue
                data["disp"][(node, lc)] = tuple(x * f for x in v)
                j += 1
            i = j; continue
        # --- SUPPORT REACTIONS -UNIT KN METE (satuan dari UNIT METER KN yang disisipkan sebelum PRINT)
        if "SUPPORT REACTIONS -UNIT" in u:
            # tabel berlanjut ke halaman berikut dengan header baru tanpa nomor joint -> node dibawa lintas header
            j, node = i + 1, data.get("_node_reaksi")
            while j < n and "END OF LATEST" not in L[j] and "SUPPORT REACTIONS -UNIT" not in L[j]:
                t = L[j]
                m2 = re.match(r"^\s+(\d+)\s+(\d+)" + r"\s+(-?[\d.]+(?:E[+-]?\d+)?)" * 6 + r"\s*$", t)
                m3 = re.match(r"^\s{8,}(\d+)" + r"\s+(-?[\d.]+(?:E[+-]?\d+)?)" * 6 + r"\s*$", t)
                if m2:
                    node = int(m2.group(1)); data["reaksi"][(node, int(m2.group(2)))] = tuple(float(x) for x in m2.groups()[2:])
                elif m3 and node is not None:
                    data["reaksi"][(node, int(m3.group(1)))] = tuple(float(x) for x in m3.groups()[1:])
                j += 1
            data["_node_reaksi"] = node
            i = j; continue
        # --- MEMBER SECTION DISPLACEMENTS
        if u.strip() == "MEMBER SECTION DISPLACEMENTS":
            f = 10.0
            j, mb, lc, buf = i + 1, None, None, []
            def simpan():
                if mb is not None and lc is not None and len(buf) >= 39:
                    data["sect"][(mb, lc)] = [tuple(buf[k:k + 3]) for k in range(0, 39, 3)]
            while j < n and "END OF SECT DISPL" not in L[j]:
                t = L[j]
                h = re.search(r"UNITS ARE\s*-\s*(\w+)", t)
                if h:
                    f = KE_MM.get(h.group(1).upper(), 10.0)
                m2 = re.match(r"^\s{4,8}(\d+)\s+(\d+)\s+(-?\d+\.\d+.*)$", t)
                m3 = re.match(r"^\s{9,13}(\d+)\s+(-?\d+\.\d+.*)$", t)
                m4 = re.match(r"^\s{15,}(-?\d+\.\d+(?:\s+-?\d+\.\d+)*)\s*$", t)
                if m2:
                    simpan(); mb, lc = int(m2.group(1)), int(m2.group(2)); buf = [float(x) * f for x in m2.group(3).split()]
                elif m3:
                    simpan(); lc = int(m3.group(1)); buf = [float(x) * f for x in m3.group(2).split()]
                elif m4 and mb is not None:
                    buf += [float(x) * f for x in m4.group(1).split()]
                j += 1
            simpan()
            i = j; continue
        # --- DESAIN BAJA, format kotak (AISC 360-16 dsb.)
        m = re.search(r"Member No:\s*(\d+)\s+Profile:\s*(.+?)\s*(?:\(|\|)", s)
        if m and i + 1 < n:
            m2 = re.search(r"Status:\s*(\w+)\s+Ratio:\s*([\d.]+)\s+Loadcase:\s*(\d+)", L[i + 1])
            if m2:
                prof = re.sub(r"^(ST|D|TA|LD|SD|T|CM|FR|TC|BC|TB)\s+", "", m.group(2).strip())
                data["baja"][int(m.group(1))] = (prof, m2.group(1), float(m2.group(2)), int(m2.group(3)))
        # --- DESAIN BAJA, format tabel lama (TRACK 0/1)
        m = re.match(r"^\s*\*?\s*(\d+)\s+(?:(ST|D|TA|LD|SD|T|CM|FR|TC|BC|TB|PIP|TUB)\s+)?(\S+)\s+\(?[^)]*\)?\s*(PASS|FAIL)\s+(.+?)\s+([\d.]+)\s+(\d+)\s*$", s)
        if m and "Status" not in s:
            data["baja"][int(m.group(1))] = (m.group(3), m.group(4), float(m.group(6)), int(m.group(7)))
        i += 1
    data["desain"] = parse_desain("\n".join(L))
    return data

NUM = r"(-?[\d.]+(?:E[+-]?\d+)?)"

def parse_desain(txt):
    """Detail blok desain AISC 360 STAAD 2025 per member (TRACK 0/1/2):
    head  = status, rasio penentu, LC, lokasi, ref, Pz, C/T, Vy, Vx, Tz, My, Mx  (semua TRACK)
    kuat  = (rasio kekuatan, LC, pasal)                                  (TRACK 1+)
    tekan = (mode, Pr, Pc, Pr/Pc, LC)  tekuk tekan penentu              (TRACK 1+)
    lgs   = (jenis C/T, KL/r aktual, KL/r izin)                          (TRACK 1+)
    dff   = span, batas, DJ1-DJ2, DFF, CAN, rasio/Δ/LC LOCAL-Y dan LOCAL-XYZ (TRACK 1+, perlu DFF + envelope)"""
    hasil = {}
    for blk in re.split(r"\n\|\*?\s+Member No:\s+", txt)[1:]:
        try:
            mb = int(blk.split()[0])
        except ValueError:
            continue
        r = hasil.setdefault(mb, {})
        if "head" not in r:
            kep = blk[:900]
            pr = re.match(r"\d+\s+Profile:\s+(?:(?:ST|D|TA|LD|SD|T|CM|FR|TC|BC|TB|PIP|TUB)\s+)?(\S+)", kep)
            st = re.search(r"Status:\s+(\w+)\s+Ratio:\s+" + NUM + r"\s+Loadcase:\s+(\d+)", kep)
            lo = re.search(r"Location:\s+" + NUM + r"\s+Ref:\s+(.+?)\s*\|", kep)
            f1 = re.search(r"Pz:\s+" + NUM + r"\s+([CT]?)\s+Vy:\s+" + NUM + r"\s+Vx:\s+" + NUM, kep)
            f2_ = re.search(r"Tz:\s+" + NUM + r"\s+My:\s+" + NUM + r"\s+Mx:\s+" + NUM, kep)
            if pr and st:
                r["head"] = dict(profil=pr.group(1), status=st.group(1), rasio=float(st.group(2)), lc=int(st.group(3)),
                                 lok=float(lo.group(1)) if lo else None, ref=lo.group(2).strip() if lo else "",
                                 pz=float(f1.group(1)) if f1 else None, ct=f1.group(2) if f1 else "",
                                 vy=float(f1.group(3)) if f1 else None, vx=float(f1.group(4)) if f1 else None,
                                 tz=float(f2_.group(1)) if f2_ else None, my=float(f2_.group(2)) if f2_ else None,
                                 mx=float(f2_.group(3)) if f2_ else None)
        k = re.search(r"STRENGTH CHECKS.*?Critical L/C\s*:\s*(\d+)\s+Ratio\s*:\s*" + NUM + r".*?Condition\s*:\s*(\S+)", blk, re.S)
        if k and "kuat" not in r:
            r["kuat"] = (float(k.group(2)), int(k.group(1)), k.group(3))
        sec = re.search(r"CHECKS FOR AXIAL COMPRESSION.*?(?=CHECKS FOR SHEAR|CHECKS FOR BENDING|CHECKS FOR AXIAL TENSION|\Z)", blk, re.S)
        if sec:
            for t in re.finditer(r"\|\s*(FLEX\. BUCK\. [XY]|FLEX\. TOR\. BUCK|TOR\. BUCK)\s+" + NUM + r"\s+" + NUM + r"\s+"
                                 + NUM + r"\s+\S+\s+(\d+)", sec.group(0)):
                v = (t.group(1), float(t.group(2)), float(t.group(3)), float(t.group(4)), int(t.group(5)))
                if "tekan" not in r or v[3] > r["tekan"][3]:
                    r["tekan"] = v
            # format TRACK 2: judul mode di satu baris, DEMAND/CAPACITY/RATIO di baris-baris berikutnya
            for t in re.finditer(r"\|\s*(FLEXURAL BUCKLING [XY]|FLEXURAL-TORSIONAL-BUCKLING|TORSIONAL BUCKLING)\s*\|\s*\n"
                                 r"[^\n]*DEMAND[^\n]*\n\|\s*" + NUM + r"\s+" + NUM + r"\s+" + NUM + r"\s+\S+\s+(\d+)", sec.group(0)):
                v = (t.group(1), float(t.group(2)), float(t.group(3)), float(t.group(4)), int(t.group(5)))
                if "tekan" not in r or v[3] > r["tekan"][3]:
                    r["tekan"] = v
        lg = re.search(r"(COMPRESSION|TENSION) SLENDERNESS[^\n]*\n\|\s*Actual Slenderness Ratio\s*:\s*" + NUM
                       + r"[^\n]*\n\|\s*Allowable Slenderness Ratio\s*:\s*" + NUM, blk)
        if lg and "lgs" not in r:
            r["lgs"] = ("C" if lg.group(1) == "COMPRESSION" else "T", float(lg.group(2)), float(lg.group(3)))
        if "SERVICEABILITY DESIGN RESULTS" in blk and "dff" not in r:
            sv = blk[blk.index("SERVICEABILITY DESIGN RESULTS"):]
            h = re.search(r"DFF:\s+" + NUM + r"\s+DFH:\s+\S+\s+CAN:\s+(\d)", sv)
            c = re.search(r"LOCAL-Y\s+" + NUM + r"\s+" + NUM + r"\s+(\d+),\s*(\d+)", sv)
            oy = re.search(r"Deflection Output:.*?LOCAL-Y\s+" + NUM + r"\[\w+\]\s+\S+\s+" + NUM + r"\s+\S+\s+(\d+)", sv, re.S)
            ox = re.search(r"Deflection Output:.*?LOCAL-XY?Z\s+" + NUM + r"\[\w+\]\s+\S+\s+" + NUM + r"\s+\S+\s+(\d+)", sv, re.S)
            if h and c and oy:
                r["dff"] = dict(DFF=float(h.group(1)), CAN=int(h.group(2)), span=float(c.group(1)) * 1000,
                                batas=float(c.group(2)) * 1000, dj=f"{c.group(3)}-{c.group(4)}",
                                ry=float(oy.group(1)), dy=float(oy.group(2)) * 1000, lcy=int(oy.group(3)),
                                rx=float(ox.group(1)) if ox else None, dx=float(ox.group(2)) * 1000 if ox else None,
                                lcx=int(ox.group(3)) if ox else None)
    return hasil

def tulis_csv(path, desain):
    import csv
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["Member", "Profile", "Status", "Governing Ratio", "LC", "Location (m)", "Ref",
                    "Strength Ratio", "Strength LC", "Clause", "Pr (kN)", "Pc (kN)", "Pr/Pc", "KL/r", "KL/r allow",
                    "Pz (kN)", "C/T", "Vy (kN)", "Vx (kN)", "Tz (kNm)", "My (kNm)", "Mx (kNm)"])
        for mb in sorted(desain):
            r = desain[mb]; h = r.get("head")
            if not h:
                continue
            k = r.get("kuat", ("", "", "")); t = r.get("tekan"); lg = r.get("lgs")
            w.writerow([mb, h["profil"], h["status"], h["rasio"], h["lc"], h["lok"], h["ref"], k[0], k[1], k[2],
                        t[1] if t else "", t[2] if t else "", t[3] if t else "",
                        lg[1] if lg and lg[0] == "C" else "", lg[2] if lg and lg[0] == "C" else "",
                        h["pz"], h["ct"], h["vy"], h["vx"], h["tz"], h["my"], h["mx"]])

def jalankan_track0(model, keluar, timeout):
    """Jalankan salinan model dengan TRACK 0 (output desain ringkas) lalu salin .ANL ke `keluar`."""
    baris = [re.sub(r"^(\s*TRACK)\s+[12](\s)", r"\g<1> 0\2", b + " ", flags=re.I).rstrip() for b in baca_std(model)]
    tmp = os.path.join(os.path.expandvars(r"%LOCALAPPDATA%"), "Temp", "staadcek_t0.std")
    with open(tmp, "w", encoding="latin-1", newline="\r\n") as f:
        f.write("\n".join(baris) + "\n")
    anl = jalankan(tmp, [], timeout)
    shutil.copy2(anl, keluar)
    return keluar

# ---------------------------------------------------------------- perhitungan
def lendutan_member(titik, mode):
    """Lendutan vertikal (Y) maksimum suatu member dari 13 titik (mm)."""
    dy = [p[1] for p in titik]
    if mode == "absolut":   # perpindahan vertikal total (termasuk rotasi/lentur tiang), mis. ujung lengan pipe support
        return max(abs(y) for y in dy)
    if mode == "kantilever":
        ref = dy[0] if abs(dy[0]) <= abs(dy[-1]) else dy[-1]
        return max(abs(y - ref) for y in dy)
    return max(abs(dy[k] - (dy[0] + (dy[-1] - dy[0]) * k / 12.0)) for k in range(13))

def tinggi(node, data):
    if not data["koord"] or node not in data["koord"]:
        return None
    y0 = min(c[1] for c in data["koord"].values())
    return data["koord"][node][1] - y0

def f2(x):
    return "-" if x is None else f"{x:.2f}"

def status(nilai, batas):
    if batas is None:
        return "?"
    return "OK" if nilai <= batas + 1e-9 else "NOT OK"

def tabel(judul, kolom, baris):
    out = [f"**{judul}**", "", "| " + " | ".join(kolom) + " |", "|" + "|".join("---" for _ in kolom) + "|"]
    out += ["| " + " | ".join(str(x) for x in b) + " |" for b in baris]
    return "\n".join(out) + "\n"

# ---------------------------------------------------------------- utama
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--config", required=True)
    ap.add_argument("--anl", help="pakai .ANL yang sudah ada (harus sudah berisi blok print yang dibutuhkan)")
    ap.add_argument("--timeout", type=int, default=900)
    ap.add_argument("--keluar", help="file laporan .md (default: <model> - Cek Hasil.md)")
    ap.add_argument("--csv", nargs="?", const="", help="tulis hasil desain per member ke CSV (default: <model> - Steel Design.csv)")
    ap.add_argument("--track0", nargs="?", const="", help="jalankan juga salinan TRACK 0 dan simpan .ANL ringkas "
                                                          "(default: <model> - TRACK0.ANL)")
    a = ap.parse_args()

    if not os.path.exists(a.model):
        berhenti(f"file model tidak ada: {a.model}")
    with open(a.config, encoding="utf-8") as f:
        cfg = json.load(f)
    baris_std = baca_std(a.model)
    grup = grup_std(baris_std)
    lc_ada = kasus_beban_std(baris_std)

    def daftar_lc(x):
        lst = urai_daftar(x, grup) or sorted(lc_ada)
        hilang = [c for c in lst if lc_ada and c not in lc_ada]
        if hilang:
            print(f"PERINGATAN: kasus beban tidak ditemukan di .std, diabaikan: {hilang}")
        return [c for c in lst if not lc_ada or c in lc_ada]

    lv = cfg.get("lendutan_vertikal", [])
    ld = cfg.get("lendutan_dff", [])
    sa = cfg.get("simpangan_angin")
    sg = cfg.get("simpangan_gempa")
    rb = cfg.get("rasio_baja", [])
    ak = cfg.get("aksial", False)
    rt = cfg.get("reaksi_tumpuan", [])
    if isinstance(rt, dict):
        rt = [rt]
    for g in rt:
        g["_node"] = urai_daftar(g.get("node", "ALL"), grup)
        g["_lc"] = daftar_lc(g.get("beban"))
    for g in ld:
        g["_member"] = urai_daftar(g["member"], grup)

    for g in lv:
        g["_member"] = urai_daftar(g["member"], grup)
        g["_lc"] = daftar_lc(g.get("beban"))
        g["_batas"] = urai_batas(g["batas"])
    for s in (sa, sg):
        if s:
            s["_node"] = urai_daftar(s.get("node", "ALL"), grup)
            s["_lc"] = daftar_lc(s.get("beban"))
            s["_batas"] = urai_batas(s["batas"])
    for g in rb:
        g["_member"] = urai_daftar(g.get("member", "ALL"), grup)

    # ---- blok print yang ditambahkan ke salinan model
    blok = ["UNIT MMS KN"]
    if any(g["_member"] is None for g in lv):
        blok += ["PRINT MEMBER INFO ALL"]
    elif lv:
        blok += tulis_daftar("PRINT MEMBER INFO LIST", [m for g in lv for m in g["_member"]])
    pakai_h = any(s and s["_batas"][0] in ("H", "Hx") for s in (sa, sg))
    if pakai_h:
        blok += ["PRINT JOINT COORDINATES"]
    if lv:
        semua_m = None if any(g["_member"] is None for g in lv) else [m for g in lv for m in g["_member"]]
        blok += tulis_daftar("LOAD LIST", [c for g in lv for c in g["_lc"]])
        blok += ["PRINT SECTION DISPLACEMENTS NOGLOBAL ALL"] if semua_m is None else \
                 tulis_daftar("PRINT SECTION DISPLACEMENTS NOGLOBAL LIST", semua_m)
    for s in (sa, sg):
        if s:
            blok += tulis_daftar("LOAD LIST", s["_lc"])
            blok += ["PRINT JOINT DISPLACEMENTS ALL"] if s["_node"] is None else \
                     tulis_daftar("PRINT JOINT DISPLACEMENTS LIST", s["_node"])
    if rt:  # paling akhir: UNIT METER KN agar reaksi dalam kN dan kN.m
        blok += ["UNIT METER KN"] + tulis_daftar("LOAD LIST", sorted({c for g in rt for c in g["_lc"]}))
        blok += ["PRINT SUPPORT REACTION"]

    anl = a.anl or jalankan(a.model, blok, a.timeout)
    d = parse_anl(anl)
    lap = [f"# Cek hasil STAAD: {os.path.basename(a.model)}", "",
           f"Sumber output: `{anl}`  ", f"Error di output: {len(d['error'])}", ""]
    for e in d["error"][:10]:
        lap.append(f"- {e}")
    if d["error"]:
        lap.append("")
    no = 1

    # ---- 1. lendutan vertikal
    if lv:
        rows = []
        for g in lv:
            terbaik = None  # (rasio, mb, lc, nilai, izin)
            for mb in (g["_member"] or sorted({k[0] for k in d["sect"]})):
                Lm = d["panjang"].get(mb)
                izin = nilai_batas(g["_batas"], Lm)
                for lc in g["_lc"]:
                    t = d["sect"].get((mb, lc))
                    if not t:
                        continue
                    v = lendutan_member(t, g.get("mode", "relatif"))
                    r = v / izin if izin else v
                    if terbaik is None or r > terbaik[0]:
                        terbaik = (r, mb, lc, v, izin)
            if terbaik is None:
                rows.append([g["tipe"], "-", "-", "tidak ada data", "-", "?"])
            else:
                _, mb, lc, v, izin = terbaik
                rows.append([g["tipe"], mb, lc, f2(v), f2(izin), status(v, izin)])
        lap.append(tabel(f"Tabel {no} Vertical Deflection", ["Type", "Beam", "L/C", "Deflection (Δ) mm",
                                                              "Allowable deflection (Δall) mm", "Status"], rows))
        no += 1

    # ---- 1b. lendutan per bentang dari cek DFF STAAD (butuh DFF/DJ1/DJ2 + LOAD LIST ENVELOPE, lihat dff_setup.py)
    if ld:
        rows = []
        for g in ld:
            calon = [(r["dff"]["ry"], mb, r["dff"]) for mb, r in d["desain"].items()
                     if "dff" in r and (g["_member"] is None or mb in g["_member"])]
            if not calon:
                rows.append([g["tipe"], "-", "-", "-", "tidak ada hasil DFF", "-", "-", "?"]); continue
            _, mb, v = max(calon, key=lambda c: (c[0], -c[1]))
            krit = f"L/{v['DFF']:.0f}" + (" (kantilever)" if v["CAN"] else "")
            rows.append([g["tipe"], mb, v["lcy"], f"{v['span']:.0f}", v["dj"], f2(v["dy"]), krit, f2(v["batas"]),
                         status(v["dy"], v["batas"])])
        lap.append(tabel(f"Tabel {no} Vertical Deflection (per bentang, STAAD DFF)",
                         ["Type", "Beam", "L/C", "Length (L) mm", "DJ1-DJ2", "Deflection (Δ) mm", "Criteria",
                          "Allowable deflection (Δall) mm", "Status"], rows))
        resultan = [(g["tipe"], max(((r["dff"]["rx"], mb) for mb, r in d["desain"].items() if "dff" in r and r["dff"]["rx"]
                                     is not None and (g["_member"] is None or mb in g["_member"])), default=None)) for g in ld]
        cat = [f"{t}: member {x[1]} rasio {x[0]:.3f}" for t, x in resultan if x and x[0] > 0.5]
        if cat:
            lap.append("Rasio lendutan resultan (LOCAL-XYZ, ikut arah horizontal) yang dipakai STAAD sebagai rasio "
                       "penentu: " + "; ".join(cat) + "\n")
        no += 1

    # ---- 2 & 3. simpangan horizontal
    def simpangan(s, judul, gempa):
        # Baris Max/Min X/Z = node/LC dengan komponen terbesar ke arah itu; nilai yang dicek adalah
        # resultan horizontal Res = sqrt(X^2 + Z^2) (Y vertikal tidak ikut). Baris "Max Res" = resultan
        # terbesar dari semua node/LC. Gempa: Res x Cd/Ie, Cd per arah lewat "Cd_arah": {"X": .., "Z": ..}
        # (Cd baris "Max Res" mengikuti komponen yang dominan).
        label = s.get("arah", {"X": "Long", "Z": "Trans"})
        ie = float(s.get("Ie", 1.0))
        cd_ax = lambda ax: float(s.get("Cd_arah", {}).get(ax, s.get("Cd", 1.0))) if gempa else 1.0
        calon = [(node, lc, v) for (node, lc), v in d["disp"].items()
                 if lc in s["_lc"] and (s["_node"] is None or node in s["_node"])]
        rows = []

        def baris(nama, lab, node, lc, v, ax):
            res = math.hypot(v[0], v[2])
            cd = cd_ax(ax)
            nilai = res * cd / ie
            izin = nilai_batas(s["_batas"], tinggi(node, d))
            row = [nama, lab, node, lc, f2(v[0]), f2(v[1]), f2(v[2]), f2(res)]
            if gempa:
                row += [f2(cd), f2(nilai)]
            return row + [f2(izin), status(nilai, izin)]

        for ax, lab in label.items():
            k = "XYZ".index(ax.upper())
            for tanda, nama in ((1, "Max"), (-1, "Min")):
                pilih = [c for c in calon if tanda * c[2][k] > 0]
                if pilih:
                    node, lc, v = max(pilih, key=lambda c: tanda * c[2][k])
                    rows.append(baris(f"{nama} {ax.upper()}", lab, node, lc, v, ax.upper()))
                else:
                    rows.append([f"{nama} {ax.upper()}", lab, "-", "-"] + ["-"] * (6 if gempa else 4)
                                + ["-", "- (tidak ada simpangan ke arah ini)"])
        if calon:
            def rasio(c):
                ax = "X" if abs(c[2][0]) >= abs(c[2][2]) else "Z"
                izin = nilai_batas(s["_batas"], tinggi(c[0], d))
                return math.hypot(c[2][0], c[2][2]) * cd_ax(ax) / ie / (izin or 1.0)
            node, lc, v = max(calon, key=rasio)
            ax = "X" if abs(v[0]) >= abs(v[2]) else "Z"
            rows.append(baris("Max Res", label.get(ax, ax), node, lc, v, ax))
        kepala = ["Displ.", "Dir", "Node", "LC", "X (mm)", "Y (mm)", "Z (mm)", "Res √(X²+Z²) (mm)"]
        if gempa:
            kepala += ["Cd", "Res.Cd/Ie (mm)"]
        return tabel(judul, kepala + ["Allowable Sway (mm)", "Check"], rows)

    if sa:
        lap.append(simpangan(sa, f"Tabel {no} Horizontal Deflection Caused by Wind Load", False)); no += 1
    if sg:
        lap.append(simpangan(sg, f"Tabel {no} Horizontal Deflection Caused by Earthquake Load "
                                 f"(Ie = {sg.get('Ie', 1.0)})", True)); no += 1

    # ---- 4. rasio baja. "Actual Ratio" = rasio kekuatan (STRENGTH CHECKS) bila tersedia (TRACK 1+), selain itu
    # rasio penentu. Rasio penentu STAAD bisa berasal dari cek lendutan DFF -> ditampilkan terpisah bila berbeda.
    if rb:
        rows, gagal, beda = [], [], []
        for g in rb:
            lim = float(g.get("batas", 1.0))
            calon = []
            for mb, v in d["baja"].items():
                if g["_member"] is not None and mb not in g["_member"]:
                    continue
                k = d["desain"].get(mb, {}).get("kuat")
                calon.append((k[0] if k else v[2], mb, v, k))
            gagal += [mb for _, mb, v, _ in calon if v[1] == "FAIL" or v[2] > 1.0]
            if not calon:
                rows.append([g["nama"], "-", "-", "-", "tidak ada data", "-", "?"]); continue
            # member tanpa rincian kekuatan (TRACK 0) hanya punya rasio penentu (bisa dari DFF) -> jangan dibandingkan
            # dengan rasio kekuatan member TRACK 1
            kuat_ = [c for c in calon if c[3]] or calon
            r, mb, v, k = max(kuat_, key=lambda c: (c[0], -c[1]))
            lc, ref = (k[1], k[2]) if k else (v[3], d["desain"].get(mb, {}).get("head", {}).get("ref", ""))
            rows.append([g["nama"], mb, v[0], lc, f"{r:.2f}", ref, f"{lim:.2f}", "OK" if r <= lim + 1e-9 else "NOT OK"])
            gov = max(calon, key=lambda c: c[2][2])
            if k and gov[2][2] > r + 0.005:
                h = d["desain"].get(gov[1], {}).get("head", {})
                beda.append(f"{g['nama']}: rasio penentu STAAD {gov[2][2]:.2f} (member {gov[1]}, {h.get('ref', '')}, "
                            f"L/C {gov[2][3]})")
        lap.append(tabel(f"Tabel {no} Steel Ratio Check", ["Member", "Beam", "Member Property", "L/C",
                                                            "Actual Ratio", "Clause", "Allowable Ratio", "Check"], rows))
        if beda:
            lap.append("Rasio penentu STAAD yang lebih besar dari rasio kekuatan: " + "; ".join(beda) + "\n")
        if gagal:
            lap.append(f"Member FAIL / rasio > 1: {sorted(set(gagal))}\n")
        no += 1

    # ---- 5. gaya tekan aksial vs kapasitas tekuk (Pr/Pc) dan kelangsingan, per grup rasio_baja
    if ak and rb and any("tekan" in r for r in d["desain"].values()):
        rows = []
        for g in rb:
            calon = [(r["tekan"][3], mb, r) for mb, r in d["desain"].items()
                     if "tekan" in r and (g["_member"] is None or mb in g["_member"])]
            if not calon:
                continue
            q, mb, r = max(calon, key=lambda c: (c[0], -c[1]))
            lg = [x["lgs"] for m2, x in d["desain"].items() if "lgs" in x and x["lgs"][0] == "C"
                  and (g["_member"] is None or m2 in g["_member"])]
            kl = max(lg, key=lambda x: x[1]) if lg else None
            kat = "tekan dominan (H1-1a)" if q >= 0.2 else "lentur dominan (H1-1b)"
            rows.append([g["nama"], mb, r["head"]["profil"] if "head" in r else "-", r["tekan"][4], f"{r['tekan'][1]:.2f}",
                         f"{r['tekan'][2]:.1f}", f"{q:.3f}", r["tekan"][0], f"{kl[1]:.0f}" if kl else "-",
                         f"{kl[2]:.0f}" if kl else "-", kat])
        lap.append(tabel(f"Tabel {no} Axial Compression (Pr/Pc) and Slenderness",
                         ["Member", "Beam", "Member Property", "L/C", "Pr (kN)", "Pc = Pn/Ω (kN)", "Pr/Pc",
                          "Buckling mode", "KL/r max", "KL/r allow", "Kategori"], rows))
        lap.append("Pr/Pc ≥ 0.2 memakai persamaan interaksi H1-1a, < 0.2 H1-1b (AISC 360-22 Pasal H1.1). "
                   "KL/r max diambil dari blok COMPRESSION SLENDERNESS member grup.\n")
        no += 1
    # ---- 6. reaksi tumpuan (kN, kN.m): maks/min tiap komponen per node + baris envelope, per kelompok beban
    if rt:
        for g in rt:
            calon = [(node, lc, v) for (node, lc), v in d["reaksi"].items()
                     if lc in g["_lc"] and (g["_node"] is None or node in g["_node"])]
            if not calon:
                lap.append(tabel(f"Tabel {no} Support Reactions - {g['nama']}", ["Node", "Keterangan"],
                                 [["-", "tidak ada data reaksi"]])); no += 1; continue
            ada_m = any(abs(x) > 1e-9 for _, _, v in calon for x in v[3:])

            def ekstrem(baris_, k):
                hi = max(baris_, key=lambda c: c[2][k]); lo = min(baris_, key=lambda c: c[2][k])
                return [f"{hi[2][k]:.2f} ({hi[1]})", f"{lo[2][k]:.2f} ({lo[1]})"]

            def mres(baris_):
                c = max(baris_, key=lambda c: math.hypot(c[2][3], c[2][5]))
                return [f"{math.hypot(c[2][3], c[2][5]):.2f} ({c[1]})"]

            rows = []
            for node in sorted({c[0] for c in calon}):
                b = [c for c in calon if c[0] == node]
                rows.append([node] + ekstrem(b, 0) + ekstrem(b, 1) + ekstrem(b, 2) + (mres(b) if ada_m else []))
            env = []
            for k in (0, 1, 2):
                hi = max(calon, key=lambda c: c[2][k]); lo = min(calon, key=lambda c: c[2][k])
                env += [f"**{hi[2][k]:.2f}** ({hi[1]}, N{hi[0]})", f"**{lo[2][k]:.2f}** ({lo[1]}, N{lo[0]})"]
            if ada_m:
                c = max(calon, key=lambda c: math.hypot(c[2][3], c[2][5]))
                env += [f"**{math.hypot(c[2][3], c[2][5]):.2f}** ({c[1]}, N{c[0]})"]
            rows.append(["Envelope"] + env)
            kepala = ["Node", "Fx max (L/C)", "Fx min (L/C)", "Fy max (L/C)", "Fy min (L/C)", "Fz max (L/C)",
                      "Fz min (L/C)"] + (["√(Mx²+Mz²) max (L/C)"] if ada_m else [])
            lap.append(tabel(f"Tabel {no} Support Reactions - {g['nama']} (kN{', kN.m' if ada_m else ''})", kepala, rows))
            lap.append("Fy positif = tekan ke fondasi (reaksi ke atas), Fy negatif = tarik/uplift. "
                       + ("" if ada_m else "Momen reaksi semua 0 (tumpuan sendi). ") + "\n")
            no += 1

    if rb:
        if d["baja"]:
            mb_max = max(d["baja"], key=lambda m: (d["baja"][m][2], -m))
            lap.append(f"Rasio terbesar seluruh model: member {mb_max} = {d['baja'][mb_max][2]:.3f} "
                       f"({d['baja'][mb_max][0]}, L/C {d['baja'][mb_max][3]}); {len(d['baja'])} member didesain.\n")

    if d["error"] and not (d["sect"] or d["disp"] or d["baja"]):
        lap.insert(4, "**Analisis berhenti karena ERROR di atas - tabel kosong. Perbaiki model lalu jalankan lagi.**\n")
    teks = "\n".join(lap)
    print(teks)
    keluar = a.keluar or os.path.splitext(a.model)[0] + " - Cek Hasil.md"
    with open(keluar, "w", encoding="utf-8") as f:
        f.write(teks)
    print(f"LAPORAN: {keluar}")
    if a.csv is not None and d["desain"]:
        csvp = a.csv or os.path.splitext(a.model)[0] + " - Steel Design.csv"
        tulis_csv(csvp, d["desain"])
        print(f"CSV: {csvp} ({sum(1 for r in d['desain'].values() if 'head' in r)} member)")
    if a.csv is not None and d["reaksi"]:
        csvr = os.path.splitext(a.model)[0] + " - Support Reactions.csv"
        with open(csvr, "w", encoding="utf-8-sig", newline="") as f:
            w = csv.writer(f)
            w.writerow(["Node", "L/C", "Fx (kN)", "Fy (kN)", "Fz (kN)", "Mx (kN.m)", "My (kN.m)", "Mz (kN.m)"])
            for (node, lc), v in sorted(d["reaksi"].items()):
                w.writerow([node, lc] + list(v))
        print(f"CSV reaksi: {csvr} ({len(d['reaksi'])} baris)")
    if a.track0 is not None:
        t0 = a.track0 or os.path.splitext(a.model)[0] + " - TRACK0.ANL"
        print(f"ANL TRACK 0: {jalankan_track0(a.model, t0, a.timeout)}")
    sys.exit(2 if d["error"] else 0)

if __name__ == "__main__":
    main()
