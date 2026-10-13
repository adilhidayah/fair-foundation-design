"""Tipe pondasi standar dari hasil desain per pipe support: tipe pedestal P# (ukuran + tulangan + sengkang + angkur + tinggi),
tipe footing Fot# (B x L x H + tulangan) dan tipe pondasi F# = kombinasi (P#, Fot#). Dikelompokkan otomatis dari
"<Tipe> - Fondasi.md" (hasil jalankan_semua / staad-stability). Tiap kasus lalu dihitung ulang dengan ukuran tipenya DIKUNCI
(tanpa auto-size footing / pedestal / tebal, jarak angkur tetap) sebagai konfirmasi; gambar pondasi per tipe F memakai kasus
penentu (UC stabilitas terbesar). Output: <folder>/Jadwal Tipe Pondasi.md + tipe_pondasi.json, <folder>/Tipe Pondasi/<F#> .dxf/.svg,
<folder>/PDF/Jadwal Tipe Pondasi.pdf.
  python tipe_pondasi.py --folder <folder Kalkulasi> [--ps x.ps.json] [--fondasi y.Fondasi.proyek.json] [--tanpa-cek] [--tanpa-pdf]"""
import argparse, glob, html, importlib.util, json, os, re, shutil, subprocess, sys, urllib.parse

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))
NODE_TOOL = os.path.normpath(os.path.join(HERE, "..", "..", "staad-stability.mjs"))
_spec = importlib.util.spec_from_file_location("pipesupport", os.path.join(HERE, "pipesupport.py"))
PS = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(PS)


def baca(md):
    g = lambda k: (re.search(r"^\| " + re.escape(k) + r" \| ([^|]+?) \|", md, re.M) or [None, None])[1]
    if not g("Width (x)"): return None
    an = re.search(r"(\d+)-M(\d+) @ (\d+) × (\d+)", g("Anchor bolts") or "")
    hp = re.search(r"top ([\d.]+) m above grade, ([\d.]+) m below grade", md)
    uc = re.search(r"^\| F\d+ \([^|]*\) \|(?:[^|]*\|){6} ([^|]+?) \| ([\d.∞]+) \|", md, re.M)
    return dict(B=float(g("Width (x)")), L=float(g("Length (z)")), H=float(g("Thickness")), Df=float(g("Depth (FGL to bottom)")),
                bot=re.sub(r"\s*\(\d+\)", "", g("Reinforcement bottom (x / z)") or "-"), top=re.sub(r"\s*\(\d+\)", "", g("Reinforcement top (x / z)") or "-"),
                bot_n=g("Reinforcement bottom (x / z)"), top_n=g("Reinforcement top (x / z)"),
                Bp=float(g("Width")), Lp=float(g("Length")), bars=g("Flexural reinforcement"), ties=g("Stirrups"),
                anc=dict(n=int(an.group(1)), dia=int(an.group(2)), sx=int(an.group(3)), sz=int(an.group(4))) if an else None,
                Gp=float(hp.group(1)) if hp else None, Dp=float(hp.group(2)) if hp else None,
                uc=float(uc.group(2)) if uc and uc.group(2) != "∞" else None, cek=uc.group(1) if uc else "")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--folder", required=True); ap.add_argument("--ps"); ap.add_argument("--fondasi")
    ap.add_argument("--tanpa-cek", action="store_true"); ap.add_argument("--tanpa-pdf", action="store_true")
    a = ap.parse_args(); ROOT = os.path.abspath(a.folder)
    ps_path = os.path.abspath(a.ps or sorted(glob.glob(os.path.join(ROOT, "*.ps.json")))[0])
    fp_path = os.path.abspath(a.fondasi or sorted(glob.glob(os.path.join(ROOT, "*Fondasi.proyek.json")))[0])
    ps = json.load(open(ps_path, encoding="utf-8")); fp = json.load(open(fp_path, encoding="utf-8"))
    tdir = lambda t: os.path.join(ROOT, re.sub(r'[\\/:*?"<>|]+', "-", t).strip())
    kasus = []
    for tp in ps["tipe"]:
        p = os.path.join(tdir(tp["nama"]), f"{tp['nama']} - Fondasi.md")
        if os.path.exists(p):
            d = baca(open(p, encoding="utf-8").read())
            if d: kasus.append((tp, d))
    # ---- kelompok
    kp = lambda d: (d["Bp"], d["Lp"], d["bars"], d["ties"], json.dumps(d["anc"], sort_keys=True), d["Gp"], d["Dp"])
    kf = lambda d: (d["B"], d["L"], d["H"], d["Df"], d["bot"], d["top"])
    ped = sorted({kp(d) for _, d in kasus}, key=lambda k: (k[0], k[1], -(json.loads(k[4]) or {}).get("dia", 0), k[5] or 0))
    fot = sorted({kf(d) for _, d in kasus}, key=lambda k: (k[0], k[1], k[2]))
    P = {k: f"P{i + 1}" for i, k in enumerate(ped)}; Fo = {k: f"Fot{i + 1}" for i, k in enumerate(fot)}
    komb = sorted({(Fo[kf(d)], P[kp(d)]) for _, d in kasus}, key=lambda x: (int(x[0][3:]), int(x[1][1:])))
    Ft = {c: f"F{i + 1}" for i, c in enumerate(komb)}
    peta = {tp["nama"]: dict(F=Ft[(Fo[kf(d)], P[kp(d)])], P=P[kp(d)], Fot=Fo[kf(d)]) for tp, d in kasus}
    # ---- konfirmasi: hitung ulang tiap kasus dengan ukuran tipe dikunci
    hasil = {}
    out_dir = os.path.join(ROOT, "Tipe Pondasi"); os.makedirs(out_dir, exist_ok=True)
    pre_map = fp.get("preset_per_tipe", {})
    for tp, d in kasus:
        t = tp["nama"]; m = peta[t]; nama_f = f"{m['F']} ({m['P']}-{m['Fot']})"
        if a.tanpa_cek: hasil[t] = ("-", d["uc"], None); continue
        num = re.search(r"(\d+\.\d+)(-\w+)?", t); preset = pre_map.get(num.group(0)) or pre_map.get(num.group(1))
        pr = PS.dimensi_profil(tp["tiang"]["profil"])
        fnd = {"name": nama_f, "node": 1, "preset": preset, "Bf": d["B"], "Lf": d["L"], "Hf": d["H"], "Bp": d["Bp"], "Lp": d["Lp"],
               "autosize": None, "column": {"name": pr["nama"], "shape": "L" if pr["jenis"] == "L" else "C", "h": pr["h"], "b": pr["b"],
                                            "tw": pr["tw"], "tf": pr["tf"], "cy": round(pr["cy"], 2), "toe": tp["tiang"].get("ujung_sayap", "+Z")}}
        if d["anc"]: fnd["bolts"] = d["anc"]
        cfg = {"extends": fp_path, "project": f"{ps.get('laporan', {}).get('proyek', '')} - {t} ({nama_f})", "std": f"{t}.std", "anl": f"{t}.ANL",
               "criteria": {"design": {"autoThickness": None}, "pedestal": {"autoSize": None, "anchor": {"spacings": [d["anc"]["sx"]] if d["anc"] else None}}},
               "foundations": [fnd]}
        cj = os.path.join(tdir(t), f"{t} - Fondasi Tipe.json"); json.dump(cfg, open(cj, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        mdp = os.path.join(tdir(t), f"{t} - Fondasi Tipe.md")
        r = subprocess.run(["node", NODE_TOOL, cj, "--out", mdp], capture_output=True, text=True, encoding="utf-8", errors="replace")
        line = next((l for l in r.stdout.splitlines() if l.startswith(m["F"])), (r.stderr.strip() or "?")[-160:])
        d2 = baca(open(mdp, encoding="utf-8").read()) if os.path.exists(mdp) else None
        hasil[t] = ("PASS" if ": PASS" in line else "FAIL", d2["uc"] if d2 else None, line)
        print(f"{t}: {nama_f} {hasil[t][0]} (UC {hasil[t][1]})")
    # gambar per tipe F: kasus dengan UC terbesar
    gambar = {}
    for c, F in Ft.items():
        anggota = [t for t, m in peta.items() if m["F"] == F]
        gov = max(anggota, key=lambda t: hasil.get(t, ("", 0, ""))[1] or 0)
        nama_f = f"{F} ({c[1]}-{c[0]})"
        for ext in ("svg", "dxf"):
            src = os.path.join(tdir(gov), f"{gov} - Fondasi Tipe - {nama_f}.{ext}")
            if os.path.exists(src): shutil.copy2(src, os.path.join(out_dir, f"{nama_f}.{ext}")); gambar.setdefault(F, (gov, os.path.join(out_dir, f"{nama_f}.svg")))
    # ---- jadwal
    lok = {tp["nama"]: tp.get("lokasi", "") for tp, _ in kasus}
    md = ["# Foundation types — pipe supports", "",
          "Grouped from the designed foundations (one per pipe support case); each case re-checked with its type sizes locked "
          "(no auto-size of footing, pedestal or thickness; anchor spacing fixed). Concrete f'c and rebar as the project criteria.", "",
          "## Pedestal types", "", "| Type | Size (mm) | Height above / below grade (m) | Longitudinal | Ties | Anchor bolts |", "|---|---|---|---|---|---|"]
    for k, n in sorted(P.items(), key=lambda x: int(x[1][1:])):
        an = json.loads(k[4]) if k[4] != "null" else None
        md.append(f"| **{n}** | {k[0] * 1000:.0f} × {k[1] * 1000:.0f} | {k[5]:.3f} / {k[6]:.3f} | {k[2]} | {k[3]} | "
                  + (f"{an['n']}-M{an['dia']} @ {an['sx']} × {an['sz']}" if an else "-") + " |")
    md += ["", "## Footing types", "", "| Type | B × L × H (m) | Depth FGL to bottom (m) | Bottom bars (x / z) | Top bars (x / z) |", "|---|---|---|---|---|"]
    for k, n in sorted(Fo.items(), key=lambda x: int(x[1][3:])):
        cnt = next(d for _, d in kasus if kf(d) == k)
        md.append(f"| **{n}** | {k[0]:.2f} × {k[1]:.2f} × {k[2]:.2f} | {k[3]:.2f} | {cnt['bot_n']} | {cnt['top_n']} |")
    # nomor pipe support per kasus (config "ps": [{no, qty, pipa, tos}] dari jadwal); tanpa daftar -> lokasi teks
    psl = {tp["nama"]: tp.get("ps") or [] for tp, _ in kasus}
    qty = lambda t: sum(int(x.get("qty", 1)) for x in psl[t])
    psno = lambda t: ", ".join(x["no"] for x in psl[t]) if psl[t] else lok[t]
    md += ["", "## Foundation types", "", "| Type | Pedestal | Footing | Pipe support no. (per case) | Qty (EA) | Check with type sizes (max UC, governing case) | Drawing |",
           "|---|---|---|---|---|---|---|"]
    for c, F in Ft.items():
        anggota = [t for t, m in peta.items() if m["F"] == F]
        st = [hasil[t] for t in anggota]; ok = all(s[0] in ("PASS", "-") for s in st)
        ucm = max((s[1] or 0) for s in st); gov = max(anggota, key=lambda t: hasil[t][1] or 0)
        md.append(f"| **{F}** | {c[1]} | {c[0]} | " + "<br>".join(f"{t}: {psno(t)}" for t in anggota) +
                  f" | {sum(qty(t) for t in anggota) or '-'} | {'OK' if ok else 'NOT OK'} — {ucm:.3f} ({gov}) | `Tipe Pondasi/{F} ({c[1]}-{c[0]}).dxf` |")
    md += ["", "## Pipe support → foundation type", "",
           "| Pipe support no. | Qty (EA) | Pipe | T.O.S. (EL) | Case | Foundation | Pedestal | Footing | Check | UC |", "|---|---|---|---|---|---|---|---|---|---|"]
    for tp, d in kasus:
        t = tp["nama"]; m = peta[t]; s = hasil[t]
        for x in (psl[t] or [dict(no=lok[t], qty="-", pipa="-", tos="-")]):
            md.append(f"| {x['no']} | {x['qty']} | {x['pipa']} | {x['tos']} | {t} | {m['F']} | {m['P']} | {m['Fot']} | {s[0]} | "
                      f"{s[1] if s[1] is not None else '-'} |")
    md += ["", f"Total pipe supports on own foundation: **{sum(qty(t) for t in peta)} EA**."]
    tanpa = [tp for tp in ps["tipe"] if tp["nama"] not in peta] + list(ps.get("kantilever", []))
    md += ["", "Without own foundation (existing platform / slab / foundation by another drawing / cantilever on the platform): " +
           "; ".join(f"{tp['nama']} ({', '.join(x['no'] for x in tp.get('ps') or []) or '-'})" for tp in tanpa) + "."]
    open(os.path.join(ROOT, "Jadwal Tipe Pondasi.md"), "w", encoding="utf-8").write("\n".join(md) + "\n")
    json.dump({"pedestal": {n: dict(B=k[0], L=k[1], bars=k[2], ties=k[3], anchor=json.loads(k[4]), Gp=k[5], Dp=k[6]) for k, n in P.items()},
               "footing": {n: dict(B=k[0], L=k[1], H=k[2], Df=k[3], bottom=k[4], top=k[5]) for k, n in Fo.items()},
               "pondasi": {F: dict(P=c[1], Fot=c[0]) for c, F in Ft.items()}, "kasus": peta},
              open(os.path.join(ROOT, "tipe_pondasi.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    n_fail = sum(1 for s in hasil.values() if s[0] == "FAIL")
    print(f"Tipe: {len(P)} pedestal, {len(Fo)} footing, {len(Ft)} pondasi; konfirmasi gagal: {n_fail}")
    if a.tanpa_pdf: return
    import markdown
    lap = ps.get("laporan", {})
    css = ("@page{size:A3 landscape;margin:12mm}body{font-family:Arial,sans-serif;font-size:10pt}table{border-collapse:collapse;width:100%;margin:6px 0}"
           "td,th{border:1px solid #999;padding:3px 6px;vertical-align:top}th{background:#eee}h1{font-size:15pt}h2{font-size:12pt;margin-top:12px}"
           ".pg{page-break-before:always}.pg svg{width:100%;height:235mm}")
    body = markdown.markdown("\n".join(md), extensions=["tables"])
    for F, (gov, svg) in sorted(gambar.items(), key=lambda x: int(x[0][1:])):
        c = next(k for k, v in Ft.items() if v == F)
        s = open(svg, encoding="utf-8").read(); s = s[s.index("<svg"):]
        s = re.sub(r'width="\d+" height="\d+"', "", s, count=1)
        body += f'<div class="pg"><h2>{F} ({c[1]}-{c[0]}) — drawn for the governing case {html.escape(gov)}</h2>{s}</div>'
    hp = os.path.join(ROOT, "_tipe.html")
    open(hp, "w", encoding="utf-8").write(f"<!doctype html><html><head><meta charset='utf-8'><style>{css}</style></head><body>"
                                          f"<p><b>{html.escape(lap.get('proyek', ''))}</b> — {html.escape(lap.get('drawing', ''))}</p>{body}</body></html>")
    out = os.path.join(ROOT, "PDF", "Jadwal Tipe Pondasi.pdf")
    subprocess.run([r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe", "--headless", "--disable-gpu", "--no-pdf-header-footer",
                    f"--print-to-pdf={out}", "file:///" + urllib.parse.quote(hp.replace("\\", "/"))], capture_output=True, timeout=180)
    os.remove(hp); print(f"PDF: {out} {'OK' if os.path.exists(out) else 'GAGAL'}")


if __name__ == "__main__":
    main()
