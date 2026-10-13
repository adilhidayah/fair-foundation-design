"""PDF brief untuk drafter: satu halaman A3 landscape per tipe (judul tipe, gambar pondasi SVG dari tools/staad-stability.mjs,
tabel ukuran / elevasi / tulangan / base plate / anchor / catatan). Membaca hanya file kecil per tipe (ringkasan pondasi .md + config).
  python brief_drafter.py --folder <folder Kalkulasi> [--ps x.ps.json] [--fondasi y.Fondasi.proyek.json] [--tipe ...] [--out PDF/...pdf]
Struktur folder seperti jalankan_semua.py: <folder>/<Tipe>/ berisi "<Tipe> - Fondasi.md" dan "<Tipe> - Fondasi - *.svg"."""
import argparse, glob, json, os, re, subprocess, sys, urllib.parse, datetime

sys.stdout.reconfigure(encoding="utf-8")
ap = argparse.ArgumentParser()
ap.add_argument("--folder", required=True); ap.add_argument("--ps"); ap.add_argument("--fondasi"); ap.add_argument("--tipe", nargs="*")
ap.add_argument("--out")
a = ap.parse_args()
ROOT = os.path.abspath(a.folder)
ps = json.load(open(os.path.abspath(a.ps) if a.ps else sorted(glob.glob(os.path.join(ROOT, "*.ps.json")))[0], encoding="utf-8"))
fp = json.load(open(os.path.abspath(a.fondasi) if a.fondasi else sorted(glob.glob(os.path.join(ROOT, "*Fondasi.proyek.json")))[0], encoding="utf-8"))
lap = ps.get("laporan", {})
tdir = lambda t: os.path.join(ROOT, re.sub(r'[\\/:*?"<>|]+', "-", t).strip())


def kv(md):
    """Description | Value rows of the report-format summary table"""
    out = {}
    for l in md.splitlines():
        m = re.match(r"^\| ([^|*][^|]*?) \| ([^|]+?) \| ([^|]*?) \|", l)
        if m and m.group(1) not in ("Description", "Parameter"):
            out.setdefault(m.group(1), (m.group(2), m.group(3)))
    return out


pages, daftar, ring = [], [], []
for t in (a.tipe or [x["nama"] for x in ps["tipe"]]):
    d = tdir(t)
    mdp = os.path.join(d, f"{t} - Fondasi.md")
    svg = sorted(glob.glob(os.path.join(d, f"{t} - Fondasi - *.svg")))
    if not os.path.exists(mdp) or not svg:
        daftar.append(f"{t}: dilewati (tanpa pondasi / belum dijalankan)"); continue
    md = open(mdp, encoding="utf-8").read()
    v = kv(md)
    tp = next(x for x in ps["tipe"] if x["nama"] == t)
    num = re.search(r"(\d+\.\d+)(-\w+)?", t)
    pr = fp.get("presets", {}).get((fp.get("preset_per_tipe", {}).get(num.group(0)) or fp.get("preset_per_tipe", {}).get(num.group(1), "")) if num else "", {})
    bp, bo = pr.get("baseplate"), pr.get("bolts")
    Gp = pr.get("pedGp", 0); gr = pr.get("groutT", 0) / 1000
    g = lambda k: v.get(k, ("-",))[0]
    Df = float(g("Depth (FGL to bottom)")) if g("Depth (FGL to bottom)") != "-" else None
    H = float(g("Thickness")) if g("Thickness") != "-" else None
    rows = [
        ("Footing (B × L × H)", f"{g('Width (x)')} × {g('Length (z)')} × {g('Thickness')} m"),
        ("Bottom of footing", f"EL −{Df:.3f}" if Df else "-"),
        ("Top of footing", f"EL −{Df - H:.3f}" if Df and H else "-"),
        ("Footing bars, bottom (x / z)", g("Reinforcement bottom (x / z)")),
        ("Footing bars, top (x / z)", g("Reinforcement top (x / z)")),
        ("Concrete cover footing", f"{fp['criteria']['design'].get('cover', 75)} mm"),
        ("Pedestal (B × L)", f"{g('Width')} × {g('Length')} m"),
        ("Top of pedestal", f"EL +{Gp:.3f}"),
        ("Grout / B.O.B. plate", f"{gr * 1000:.0f} mm / EL +{Gp + gr:.3f}"),
        ("Pedestal bars", g("Flexural reinforcement")),
        ("Pedestal ties", g("Stirrups")),
        ("Base plate", f"{bp['B'] * 1000:.0f} × {bp['L'] * 1000:.0f} × {bp['t']} mm" if bp else "-"),
        ("Anchor bolts", (g("Anchor bolts").split(" (")[0] + " mm") if g("Anchor bolts") != "-" else (f"{bo['n']}-M{bo['dia']} @ {bo['sx']} × {bo['sz']} mm" if bo else "-")),
        ("Concrete / rebar", f"f'c {fp['criteria']['design']['fc']} MPa, fy {fp['criteria']['design']['fy']} MPa, ties fyt {fp['criteria'].get('pedestal', {}).get('fyt', '-')} MPa"),
        ("Steel post", f"{tp['tiang']['profil']}, beam {tp['level'][0].get('profil', tp['tiang']['profil'])}" + (f", drawing sheet {tp['sheet']}" if tp.get('sheet') else "")),
    ]
    ring.append({"t": t, "page": len(pages) + 2, "fdn": rows[0][1], "bot": rows[1][1], "bb": rows[3][1], "bt": rows[4][1],
                 "ped": rows[6][1], "hped": f"{float(Df - H) + Gp:.3f} m" if Df and H else "-", "pbar": rows[9][1], "tie": rows[10][1],
                 "bp": rows[11][1], "bolt": rows[12][1], "top": rows[7][1]})
    cap = tp.get("cap", lap.get("cap", ""))
    dxf = os.path.basename(svg[0])[:-4] + ".dxf"
    tab = "".join(f"<tr><td>{k}</td><td>{val}</td></tr>" for k, val in rows)
    rel = os.path.relpath(svg[0], ROOT).replace("\\", "/")
    pages.append(f"""<section class="page">
<div class="hd"><div class="tt">{t} — FOUNDATION F1</div><div class="sub">{lap.get('proyek', '')}{' · ' + lap['drawing'] if lap.get('drawing') else ''}</div></div>
<div class="body"><div class="dwg"><img src="{urllib.parse.quote(rel)}"></div>
<div class="side"><table>{tab}</table>
<p class="nt">Dimensions in mm, levels in m (FGL = ±0.000). Bars: bottom mat shown in the reinforcement plan; top bars where noted.
Pedestal bars with 90° hook on the bottom mat; ties with 135° hooks. CAD file: <b>{t}/{dxf}</b> (DXF R12, layers CONCRETE, REBAR, DIM,
TEXT, AXIS, HIDDEN, STEEL).</p>{f'<div class="cap">{cap}</div>' if cap else ''}</div></div></section>""")
    daftar.append(f"{t}: halaman {len(pages) + 1}")

# page 1: summary of every foundation (sizes, bars, base plate, anchors) + general notes
crit = fp["criteria"]
trs = "".join(f"<tr><td><b>{x['t']}</b></td><td>{x['fdn']}</td><td>{x['bot']}</td><td>{x['bb']}</td><td>{x['bt']}</td><td>{x['ped']}</td>"
              f"<td>{x['hped']}</td><td>{x['top']}</td><td>{x['pbar']}</td><td>{x['tie']}</td><td>{x['bp']}</td><td>{x['bolt']}</td><td>{x['page']}</td></tr>" for x in ring)
summary = f"""<section class="page">
<div class="hd"><div class="tt">FOUNDATION SCHEDULE — PIPE SUPPORTS</div><div class="sub">{lap.get('proyek', '')}{' · ' + lap['drawing'] if lap.get('drawing') else ''} · {datetime.date.today().strftime('%d %b %Y')}</div></div>
<table class="sch"><tr><th>Type</th><th>Footing B × L × H</th><th>Bottom of footing</th><th>Footing bars bottom (x / z)</th><th>Footing bars top (x / z)</th>
<th>Pedestal B × L</th><th>Pedestal height</th><th>Top of pedestal</th><th>Pedestal bars</th><th>Pedestal ties</th><th>Base plate</th><th>Anchor bolts</th><th>Page</th></tr>{trs}</table>
<p class="nt"><b>General notes:</b> dimensions in mm, levels in m, FGL = ±0.000. Concrete f'c {crit['design']['fc']} MPa; reinforcement fy {crit['design']['fy']} MPa,
ties fyt {crit.get('pedestal', {}).get('fyt', '-')} MPa. Cover: footing {crit['design'].get('cover', 75)} mm, pedestal {crit.get('pedestal', {}).get('clearCover', 50)} mm (clear).
Footing bars written at the nominal spacing; the count given is placed evenly between the covers. Pedestal bars with 90° hook on the bottom mat;
ties with 135° hooks; the top ties (within 125 mm of the top of the pedestal) enclose the anchor bolts and the longitudinal bars (ACI 318M-19 §10.7.6.1.6).
Grout {fp.get('presets', {}) and next(iter(fp['presets'].values())).get('groutT', 25)} mm under the base plate. CAD files (DXF R12) in each type folder.</p>
{f'<div class="cap">{lap["cap"]}</div>' if lap.get('cap') else ''}</section>"""
pages.insert(0, summary)

html = f"""<!doctype html><html><head><meta charset="utf-8"><title>Drafter brief — foundations</title><style>
@page {{ size: A3 landscape; margin: 10mm; }}
body {{ font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; }}
.page {{ page-break-after: always; height: 275mm; display: flex; flex-direction: column; border: 1.5px solid #111; padding: 6mm; box-sizing: border-box; }}
.page:last-child {{ page-break-after: auto; }}
.hd {{ border-bottom: 2px solid #111; padding-bottom: 3mm; margin-bottom: 4mm; }}
.tt {{ font-size: 24pt; font-weight: bold; }} .sub {{ font-size: 10pt; color: #444; }}
.body {{ flex: 1; display: flex; gap: 6mm; min-height: 0; }}
.dwg {{ flex: 1; display: flex; align-items: center; justify-content: center; min-width: 0; }}
.dwg img {{ width: 100%; height: 225mm; object-fit: contain; }}
.side {{ width: 120mm; font-size: 9.5pt; }}
table {{ border-collapse: collapse; width: 100%; }} td {{ border: 1px solid #666; padding: 1.6mm 2mm; vertical-align: top; }}
td:first-child {{ font-weight: bold; width: 46mm; background: #f1f1f1; }}
.nt {{ font-size: 8.5pt; color: #333; }}
table.sch {{ font-size: 9.5pt; }} table.sch th {{ background: #e3e3e3; border: 1px solid #666; padding: 1.6mm 2mm; }}
table.sch td {{ text-align: center; }} table.sch td:first-child {{ width: auto; background: none; }} .cap {{ color: #b00; border: 2px solid #b00; padding: 1.5mm 3mm; font-weight: bold; font-size: 9pt; }}
</style></head><body>{''.join(pages)}</body></html>"""
nama = lap.get("nama_brief", "Brief Drafter - Pondasi Pipe Support")
out_pdf = os.path.abspath(a.out) if a.out else os.path.join(ROOT, "PDF", f"{nama}.pdf")
os.makedirs(os.path.dirname(out_pdf), exist_ok=True)
out_html = os.path.join(ROOT, f"_{nama}.html")
open(out_html, "w", encoding="utf-8").write(html)
edge = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
url = "file:///" + urllib.parse.quote(out_html.replace("\\", "/"))
subprocess.run([edge, "--headless", "--disable-gpu", "--no-pdf-header-footer", f"--print-to-pdf={out_pdf}", url], capture_output=True, timeout=180)
print(f"BRIEF: {out_pdf} {'OK' if os.path.exists(out_pdf) else 'GAGAL'} — " + "; ".join(daftar))
