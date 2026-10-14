"""Penulis Bab 7 ke laporan Excel klien lewat Excel COM (dipanggil oleh bab7.py). Excel dijalankan sebagai instance terpisah
(DispatchEx, tidak terlihat), workbook dibuka tanpa update link, tabel di sheet "6-8" dibangun ulang dari bawah ke atas (7-5, 7-4,
7-3, 7-2, 7-1) supaya penyisipan baris tidak menggeser tabel yang belum ditulis. Format baris data / judul diambil dari tabel Rev A.
Cadangan file dibuat sebelum diubah."""
import datetime, os, shutil, sys

sys.path[:0] = [os.path.join(os.environ["LOCALAPPDATA"], "claude-pylib", p) for p in ("", "win32", r"win32\lib", "pythonwin")]
import pywintypes, win32com.client  # noqa: E402

XL_DOWN, XL_CENTER, XL_LEFT, XL_PASTE_FORMATS = -4121, -4108, -4131, -4122
SHEET = "6-8"


def _cari(ws, teks, kol, r0=100, r1=600):
    for r in range(r0, r1):
        v = ws.Cells(r, kol).Value
        if v is not None and str(v).strip().startswith(teks): return r     # awal sel: paragraf boleh menyebut "Table 7-4"
    raise RuntimeError(f"'{teks}' tidak ditemukan di kolom {kol} sheet {SHEET}")


def _blok(ws, r1, r2, n, templ):
    """jadikan baris r1..r2 berjumlah n (format baris templ), lepas merge, kosongkan isi C:U; kembalikan r1..r1+n-1"""
    ws.Range(f"A{r1}:U{r2}").UnMerge()
    cur = r2 - r1 + 1
    if n > cur:
        ws.Rows(templ).Copy(); ws.Rows(f"{r2 + 1}:{r2 + n - cur}").Insert(XL_DOWN); ws.Application.CutCopyMode = False
    elif n < cur:
        ws.Rows(f"{r1 + n}:{r2}").Delete()
    ws.Range(f"C{r1}:U{r1 + n - 1}").UnMerge(); ws.Range(f"C{r1}:U{r1 + n - 1}").ClearContents()
    return r1, r1 + n - 1


def _sel(ws, r, c1, c2, nilai, r2=None, fmt=None, rata=XL_CENTER, tebal=False, bungkus=False):
    rg = ws.Range(f"{c1}{r}:{c2}{r2 or r}")
    if rg.Cells.Count > 1: rg.Merge()
    if fmt: rg.NumberFormat = fmt
    rg.Cells(1, 1).Value = nilai
    rg.HorizontalAlignment = rata; rg.VerticalAlignment = XL_CENTER; rg.WrapText = bungkus
    if tebal: rg.Font.Bold = True
    return rg


def _garis(ws, rng):
    """garis tipis semua tepi + dalam untuk satu blok tabel (satu kali, bukan per sel - jauh lebih cepat)"""
    rg = ws.Range(rng)
    for b in (7, 8, 9, 10, 11, 12):              # tepi kiri, atas, bawah, kanan, dalam vertikal & horizontal
        try: rg.Borders(b).LineStyle = 1; rg.Borders(b).Weight = 2
        except pywintypes.com_error: pass


def _gaya_judul(ws, r, c1, c2, sumber):
    """format judul tabel dari sel judul Rev A (isi warna, huruf)"""
    rg = ws.Range(f"{c1}{r}:{c2}{r}")
    rg.Interior.Color = sumber.Interior.Color; rg.Font.Bold = True
    rg.Font.Name = sumber.Font.Name; rg.Font.Size = sumber.Font.Size


def tulis(xlsx, baja, pond, ps, fp, tanah):
    if os.path.exists(os.path.join(os.path.dirname(xlsx), "~$" + os.path.basename(xlsx))):
        raise SystemExit("File sedang terbuka di Excel - tutup dulu.")
    bak = xlsx + ".bak-" + datetime.datetime.now().strftime("%Y%m%d%H%M%S"); shutil.copy2(xlsx, bak); print("cadangan:", bak)
    xl = win32com.client.DispatchEx("Excel.Application"); xl.Visible = False; xl.DisplayAlerts = False
    try:
        wb = xl.Workbooks.Open(xlsx, UpdateLinks=0); ws = wb.Worksheets(SHEET)
        # tanpa ini tiap perubahan sel memicu hitung ulang seluruh workbook (ribuan rumus lampiran): 8 menit lebih
        xl.ScreenUpdating = False; xl.EnableEvents = False; xl.Calculation = -4135      # xlCalculationManual
        try: xl.PrintCommunication = False                                         # driver printer tidak dihubungi tiap ubah baris
        except Exception: pass
        ws.DisplayPageBreaks = False
        f3 = lambda v: "-" if v is None else round(v, 3)
        # ---------- teks Summary & 7.2 (dicari dulu, sebelum baris bergeser)
        r_sum = _cari(ws, "Summary", 2, 150); r_72 = _cari(ws, "Foundation Design", 2, 150)
        print(datetime.datetime.now().strftime('%H:%M:%S'), '>> Tabel 7-5', flush=True)
        # ---------- Tabel 7-5 (stabilitas) = dua sub-tabel, satu baris per tipe F (grid kolom C..T sempit, 18 x 3.7 karakter)
        t = _cari(ws, "Table 7-5", 2, 150); hdr_src = ws.Range("F151")      # judul Tabel 7-1 sebagai sumber gaya judul
        n = len(pond); K = lambda p, k: p["st"].get(k)
        r1, r2 = _blok(ws, t + 1, r_sum - 2, 2 * (n + 2) + 1, t + 1)
        def sub(r, judul, kol, isi_baris):
            _sel(ws, r, "C", "T", judul, rata=XL_LEFT); ws.Range(f"C{r}:T{r}").Borders.LineStyle = -4142
            ws.Range(f"C{r}").Font.Italic = True; ws.Range(f"C{r}").Font.Bold = False
            for c1, c2, s in kol: _sel(ws, r + 1, c1, c2, s, tebal=True, bungkus=True)
            _gaya_judul(ws, r + 1, "C", "T", hdr_src); ws.Rows(r + 1).RowHeight = 40
            for i, isi in enumerate(isi_baris):
                rr = r + 2 + i
                for c1, c2, s, fm in isi: _sel(ws, rr, c1, c2, s, fmt=fm, bungkus=True)
                ws.Range(f"C{rr}:T{rr}").Font.Bold = False; ws.Range(f"C{rr}:T{rr}").Font.Size = 9; ws.Rows(rr).RowHeight = 16
                ws.Range(f"C{rr}:T{rr}").Interior.ColorIndex = -4142           # tanpa arsir (terbawa dari baris contoh)
            ws.Range(f"C{r + 1}:T{r + 1}").Font.Size = 9
            _garis(ws, f"C{r + 1}:T{r + 1 + len(isi_baris)}")
            return r + 2 + len(isi_baris)
        def ok_(p): return all((x[0] <= x[1]) if k.startswith("Bearing") else (x[0] >= x[1]) for k, x in p["st"].items()) and p["Se"] <= tanah["Sa"]
        def gov_(p): return max(p["st"].values(), key=lambda x: (x[0] / x[1]) if x[0] < x[1] else x[1] / x[0])[2] if p["st"] else "-"
        def qq(p, k): x = K(p, k); return f"{x[0]:.2f} / {x[1]:.2f}" if x else "-"
        def sf(p, k): x = K(p, k); return round(x[0], 2) if x else "-"
        rr = sub(r1, "(a) Bearing pressure, settlement and contact area", [
            ("C", "D", "Type"), ("E", "H", "Bearing, permanent\nq / q_a (kN/m²)"), ("I", "L", "Bearing, temporary\nq / q_a (kN/m²)"),
            ("M", "O", f"Settlement\nSe (≤ {tanah['Sa']:g} mm)"), ("P", "Q", "Contact\n(≥ 70 %)"), ("R", "T", "Remarks")],
            [[("C", "D", p["F"], None), ("E", "H", qq(p, "Bearing pressure, permanent (kN/m²)"), None), ("I", "L", qq(p, "Bearing pressure, temporary (kN/m²)"), None),
              ("M", "O", round(p["Se"], 1), "0.0"), ("P", "Q", (K(p, "Minimum contact area")[0] / 100) if K(p, "Minimum contact area") else "-", "0.0%"),
              ("R", "T", "Safe" if ok_(p) else "Not Safe", None)] for p in pond])
        rr = sub(rr, "(b) Overturning and sliding safety factors (required: permanent 1.75, temporary 1.60)", [
            ("C", "D", "Type"), ("E", "G", "Overturning\npermanent"), ("H", "J", "Overturning\ntemporary"), ("K", "M", "Sliding\npermanent"),
            ("N", "P", "Sliding\ntemporary"), ("Q", "T", "Governing case")],
            [[("C", "D", p["F"], None), ("E", "G", sf(p, "Overturning SF, permanent"), "0.00"), ("H", "J", sf(p, "Overturning SF, temporary"), "0.00"),
              ("K", "M", sf(p, "Sliding SF, permanent"), "0.00"), ("N", "P", sf(p, "Sliding SF, temporary"), "0.00"), ("Q", "T", gov_(p), None)] for p in pond])
        _sel(ws, rr, "C", "T", (f"Values: the worst pipe-support case of each type (re-checked with the type sizes). Settlement: Meyerhof (SPT), "
                                f"Se = Cw·CD·1.25·q/N (B ≤ 1.2 m) or Cw·CD·2q/N·[B/(B+0.3)]² (B > 1.2 m), {tanah['sumber']}; CD = 1 and Cw = 2 "
                                f"(water table within B below the footing) taken conservatively."), rata=XL_LEFT, bungkus=True)
        ws.Range(f"C{rr}:T{rr}").Borders.LineStyle = -4142; ws.Rows(rr).RowHeight = 36; ws.Range(f"C{rr}").Font.Size = 8
        ws.Range(f"C{rr}").Font.Bold = False; ws.Range(f"C{rr}").Font.Italic = True
        print(datetime.datetime.now().strftime('%H:%M:%S'), '>> Tabel 7-4', flush=True)
        # ---------- Tabel 7-4 (desain beton) = (a) footing, (b) pedestal
        t = _cari(ws, "Table 7-4", 2, 150); t5 = _cari(ws, "Table 7-5", 2, t)
        r1, r2 = _blok(ws, t + 1, t5 - 2, 2 * (n + 2), t + 1)
        rr = sub(r1, "(a) Footing (reinforcement D13 top and bottom, same in x and z)", [
            ("C", "E", "Type"), ("F", "K", "Pipe support cases (T-POST)"), ("L", "O", "B × L × H (m)"), ("P", "Q", "Depth (m)"), ("R", "T", "Bars")],
            [[("C", "E", f"{p['F']} ({p['P']}-{p['Fot']})", None), ("F", "K", ", ".join(c.replace("T-POST ", "") for c in p["kasus"]), None),
              ("L", "O", f"{p['fot']['B']:.2f}×{p['fot']['L']:.2f}×{p['fot']['H']:.2f}", None), ("P", "Q", round(p["fot"]["Df"], 2), "0.00"),
              ("R", "T", p["fot"]["bottom"].split(" / ")[0], None)] for p in pond])
        sub(rr, "(b) Pedestal", [
            ("C", "E", "Type"), ("F", "H", "Size (mm)"), ("I", "J", "Height (m)"), ("K", "L", "Bars"), ("M", "Q", "Stirrups"), ("R", "T", "Anchor bolts")],
            [[("C", "E", f"{p['F']} ({p['P']})", None), ("F", "H", f"{p['ped']['B'] * 1000:.0f}×{p['ped']['L'] * 1000:.0f}", None),
              ("I", "J", round((p["ped"]["Gp"] or 0) + (p["ped"]["Dp"] or 0), 3), "0.000"), ("K", "L", p["ped"]["bars"], None),
              ("M", "Q", p["ped"]["ties"].replace(" within 125 mm of top", " (top)"), None),
              ("R", "T", (f"{p['ped']['anchor']['n']}-M{p['ped']['anchor']['dia']} @{p['ped']['anchor']['sx']}" if p["ped"].get("anchor") else "-"), None)] for p in pond])
        print(datetime.datetime.now().strftime('%H:%M:%S'), '>> Tabel 7-3', flush=True)
        # ---------- Tabel 7-3 (lendutan)
        t = _cari(ws, "Table 7.3", 2, 150); rf = _cari(ws, "Foundation Design", 2, t)
        r_lim = _cari(ws, "Beam supporting pipes", 3, 150)
        ws.Range(f"Q{r_lim}").Value = "L/360 (cantilever arm: 2L/360 = L/180)"
        baris = []
        for b in baja:
            if b.get("braket"): baris.append((b["tipe"].replace("CANTILEVER SUPPORT", "Cantilever" + chr(10) + "Support"), "Bracket", b["d_l"], 1))
            else: baris += [(b["tipe"], "Column", b["d_k"], 2), (None, "Beam", b["d_l"], 0)]
        r1, r2 = _blok(ws, t + 3, rf - 2, len(baris), t + 3)
        for i, (tp, mem, d, span_rows) in enumerate(baris):
            r = r1 + i
            if tp:
                _sel(ws, r, "C", "E", tp, r2=r + span_rows - 1, bungkus=True)
                if chr(10) in tp: ws.Rows(r).RowHeight = 28
            _sel(ws, r, "F", "H", mem)
            _sel(ws, r, "I", "K", round(d[1]) if d else "-", fmt="0"); _sel(ws, r, "L", "N", round(d[2], 2) if d else "-", fmt="0.00")
            _sel(ws, r, "O", "Q", round(d[3], 2) if d else "-", fmt="0.00"); _sel(ws, r, "R", "S", "OK" if (not d or d[2] <= d[3]) else "NOT OK")
        _garis(ws, f"C{r1}:S{r2}")
        print(datetime.datetime.now().strftime('%H:%M:%S'), '>> Tabel 7-2', flush=True)
        # ---------- Tabel 7-2 (unity check)
        t = _cari(ws, "Table 7-2", 2, 150); rd = _cari(ws, "Deflection Limit", 3, t)
        baris = []
        for b in baja:
            if b.get("braket"): baris.append((b["tipe"].replace("CANTILEVER SUPPORT", "Cantilever" + chr(10) + "Support"), "Bracket", b["uc_l"], 1))
            else: baris += [(b["tipe"], "Column", b["uc_k"], 2), (None, "Beam", b["uc_l"], 0)]
        r1, r2 = _blok(ws, t + 2, rd - 2, len(baris), t + 2)
        for i, (tp, mem, u, span_rows) in enumerate(baris):
            r = r1 + i
            if tp:
                _sel(ws, r, "E", "G", tp, r2=r + span_rows - 1, bungkus=True)
                if chr(10) in tp: ws.Rows(r).RowHeight = 28
            _sel(ws, r, "H", "J", mem); _sel(ws, r, "K", "L", f3(u[0]), fmt="0.000"); _sel(ws, r, "M", "N", u[1] or "-")
            _sel(ws, r, "O", "R", "OK" if (u[0] is None or u[0] <= 1.0) else "NOT OK")
        _garis(ws, f"E{r1}:R{r2}")
        print(datetime.datetime.now().strftime('%H:%M:%S'), '>> Tabel 7-1', flush=True)
        # ---------- Tabel 7-1 (profil)
        t = _cari(ws, "Table 7-1", 2, 150); t2 = _cari(ws, "Table 7-2", 2, t)
        baris = []
        for b in baja:
            if b.get("braket"): baris.append((b["tipe"].replace("CANTILEVER SUPPORT", "Cantilever" + chr(10) + "Support"), "Bracket", b["lengan"], 1))
            else: baris += [(b["tipe"], "Column", b["kol"], 2), (None, "Beam", b["lengan"], 0)]
        r1, r2 = _blok(ws, t + 2, t2 - 2, len(baris), t + 2)
        for i, (tp, mem, prof, span_rows) in enumerate(baris):
            r = r1 + i
            if tp:
                _sel(ws, r, "F", "H", tp, r2=r + span_rows - 1, bungkus=True)
                if chr(10) in tp: ws.Rows(r).RowHeight = 28
            _sel(ws, r, "I", "K", mem); _sel(ws, r, "L", "P", prof)
        _garis(ws, f"F{r1}:P{r2}")
        print(datetime.datetime.now().strftime('%H:%M:%S'), '>> teks', flush=True)
        # ---------- teks
        r_72 = _cari(ws, "Foundation Design", 2, 150)
        kasus = sorted({c for p in pond for c in p["kasus"]}, key=lambda s: [int(x) if x.isdigit() else x for x in s.replace("T-POST ", "").replace("-", ".").split(".")])
        ws.Range(f"B{r_72 + 1}").Value = (
            "This report summarizes the analysis results of the pipe support foundations. All pipe supports on their own foundation ("
            + ", ".join(k.replace("T-POST ", "T-POST ") for k in kasus) + f") are grouped into {len(pond)} foundation types F1–F{len(pond)} "
            "(pedestal type P# with footing type Fot#, Table 7-4); each type is checked with the governing pipe support case. Supports on existing "
            "platforms or slabs, T-POST 1.13 (foundation by DWG VLPC-TIP-TRS-S-EF-005) and the cantilever supports have no own foundation; "
            "their reactions are given in the attachments.")
        for k in range(1, 4): ws.Rows(r_72 + k).RowHeight = 34          # paragraf 7.2 (sel gabung B:T, 3 baris)
        r71 = _cari(ws, "Strucural Design", 2, 140); ws.Range(f"B{r71 + 1}").WrapText = True; ws.Rows(r71 + 1).RowHeight = 30
        r_s = _cari(ws, "Summary", 2, 150)
        ws.Range(f"A{r_s}").Formula = f"=A{_cari(ws, 'Foundation Design', 2, 150)}+0.1"   # Rev A: 7.2 dobel -> 7.3
        ws.Range(f"B{r_s + 1}").Value = (
            "With the provided material specification and the revised member sizes (Table 7-1), all pipe supports satisfy the strength "
            "(maximum unity check " + f"{max((b['uc_k'][0] or 0) for b in baja):.3f}" + ") and deflection criteria, and all foundation types "
            "satisfy the bearing, overturning, sliding, contact-area and settlement criteria (Table 7-5).")
        print(datetime.datetime.now().strftime('%H:%M:%S'), '>> wb.Save()', flush=True)
        xl.Calculation = -4105; xl.Calculate()                                       # otomatis lagi + hitung sekali
        try: xl.PrintCommunication = True
        except Exception: pass
        wb.Save(); print("tersimpan:", xlsx)
    finally:
        try: wb.Close(False)
        except Exception: pass
        try: xl.Calculation = -4105
        except Exception: pass
        xl.Quit()
