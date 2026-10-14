"""Laporan PDF satu tipe pipe support: ringkasan format laporan (data desain, UC, lendutan, pondasi), gambar pondasi,
Lampiran A (laporan skill staad-pipesupport) dan Lampiran B (laporan pondasi MASTER CALCULATOR tools/staad-stability.mjs).
Butuh: paket python `markdown` (pip install --user markdown) dan Microsoft Edge (cetak PDF headless). Jalankan TANPA -I
(paket user-site): python laporan_pdf.py --folder <folder Kalkulasi> --tipe "T-POST 1.2" [--ps x.ps.json] [--fondasi y.json]
Teks proyek dari blok "laporan" di .ps.json: {"proyek", "drawing", "standar", "cap"} dan per tipe "sheet", "cap"."""
import sys, os, re, json, subprocess, urllib.parse, datetime, glob, argparse
import markdown

ap = argparse.ArgumentParser()
ap.add_argument("--folder", required=True); ap.add_argument("--tipe", required=True)
ap.add_argument("--ps"); ap.add_argument("--fondasi"); ap.add_argument("--out-dir")
a = ap.parse_args()
folder, tipe = a.folder, a.tipe
for k in ("ps", "fondasi", "out_dir"):                 # paths relative to the caller, before chdir
    if getattr(a, k): setattr(a, k, os.path.abspath(getattr(a, k)))
os.chdir(folder)
ps_path = os.path.abspath(a.ps) if a.ps else next(iter(sorted(glob.glob("*.ps.json"))), None)
fp_path = os.path.abspath(a.fondasi) if a.fondasi else next(iter(sorted(glob.glob("*Fondasi.proyek.json"))), None)
if not ps_path or not fp_path: sys.exit("BERHENTI: --ps / --fondasi tidak ditemukan")
ps = json.load(open(ps_path, encoding="utf-8"))
fp = json.load(open(fp_path, encoding="utf-8"))
lap = ps.get("laporan", {})
steel_md = open(f"{tipe} - Perhitungan.md", encoding="utf-8").read()
fdn_md = open(f"{tipe} - Fondasi.md", encoding="utf-8").read() if os.path.exists(f"{tipe} - Fondasi.md") else None
if fdn_md: fdn_md = "\n".join(l for l in fdn_md.splitlines() if not l.startswith("![")) + "\n"   # drawing has its own page
tp = next(t for t in ps["tipe"] if t["nama"] == tipe)
um = ps["umum"]


def md_table(md, caption_regex):
    """rows of the first Markdown table after a line matching caption_regex"""
    lines = md.splitlines()
    for i, l in enumerate(lines):
        if re.search(caption_regex, l):
            rows = []
            for l2 in lines[i + 1:]:
                if l2.startswith("|"):
                    cells = [c.strip() for c in l2.strip().strip("|").split("|")]
                    if not set("".join(cells)) <= set("-: "):
                        rows.append(cells)
                elif rows:
                    break
            return rows
    return []


ratio = md_table(steel_md, r"Tabel 4 Steel Ratio")
torsi = md_table(steel_md, r"^## Cek torsi (?:UNP|siku)")
vdef = md_table(steel_md, r"Tabel 1 Vertical Deflection")
hdef = md_table(steel_md, r"Tabel 2 Horizontal Deflection")
qdef = md_table(steel_md, r"Tabel 3 Horizontal Deflection Caused by Earthquake")
tor = {r[0].split(" ")[0]: r for r in torsi[1:]}

prof_col = tp["tiang"]["profil"]
prof_beam = tp["level"][0].get("profil", prof_col)
col_r = next((r for r in ratio[1:] if r[0] == "Tiang"), None)
beam_r = next((r for r in ratio[1:] if r[0] == "Lengan"), None)
gov_col = tor.get("Tiang")
gov_beam = tor.get("Lengan")
uc_col = gov_col[11] if gov_col else col_r[4]
uc_beam = max((r[11] for r in torsi[1:] if r[0].startswith("Lengan")), default=beam_r[4])
H_col = float(tp["tiang"]["tinggi"]) * 1000
span = max(float(tp["level"][0].get("kiri", 0)), float(tp["level"][0].get("kanan", 0))) * 1000
vmax = max(vdef[1:], key=lambda r: float(r[3])) if len(vdef) > 1 else None
hmax = next((r for r in hdef[1:] if r[0] == "Max Res"), None)
H_cek = float(hmax[8]) * 200 if hmax else H_col      # tinggi yang dipakai cek simpangan (batas H/200) = sumbu lengan atas dari dasar
qmax = next((r for r in qdef[1:] if r[0] == "Max Res"), None)

ok = lambda b: "OK" if b else "NOT OK"
today = datetime.date.today().strftime("%d %b %Y")
cap = tp.get("cap", lap.get("cap", ""))
crit = fp["criteria"]

summary = f"""
<h2>1. Design Data</h2>
<table class="kv">
<tr><th colspan="2">Steel structure (pipe support {tipe})</th></tr>
<tr><td>Column / beam</td><td>{prof_col} / {prof_beam} (JIS), ASTM A36: F<sub>y</sub> {um['material']['Fy_MPa']} MPa, F<sub>u</sub> {um['material']['Fu_MPa']} MPa</td></tr>
{f"<tr><td>Represents</td><td>{tp['lokasi']}</td></tr>" if tp.get('lokasi') else ''}
<tr><td>Geometry</td><td>column height {H_col:.0f} mm from {tp.get('dasar', lap.get('dasar', 'the base plate'))}{' (<b>' + tp['tos_catatan'] + '</b>)' if tp.get('tos_catatan') else ''}; {'; '.join((f"beam at +{lv['elev']:.3f} m welded to the side of the column" if lv.get('elev') is not None else 'beam seated on the column (cover plate)') + f", {lv['kiri']*1000:.0f} + {lv['kanan']*1000:.0f} mm" for lv in tp['level'])}</td></tr>
<tr><td>Pipe</td><td>{'; '.join(f"{p['nama']} DN{p['DN']} sch {p['sch']}, {p['isi']}, span {p['span']} m, {p['tumpuan']} μ {p['mu']}, x = {p['x']} m" for lv in tp['level'] for p in lv['pipa'])}; Test = Operating</td></tr>
<tr><td>Wind</td><td>ASCE 7-22 Ch. 29, V {um['angin']['V']} m/s, exposure {um['angin']['eksposur']}, minimum 0.77 kPa</td></tr>
<tr><td>Seismic</td><td>S<sub>s</sub> {um['gempa']['Ss']}, S<sub>1</sub> {um['gempa']['S1']}, site class SD (SNI 1726:2019), I<sub>e</sub> {um['gempa']['Ie']}, R = C<sub>d</sub> = {um['gempa']['R']}, ρ = 1.0</td></tr>
<tr><td>Combinations</td><td>Project design basis Table 15-2 (ASD) / 15-3 (LRFD), T = pipe friction; ASD 101–164, LRFD 301–400</td></tr>
<tr><td>Design</td><td>AISC 360-22 ASD, K = 2.1 (cantilever column), torsion AISC H3.3 / DG9 in addition to STAAD</td></tr>
<tr><th colspan="2">Foundation</th></tr>
<tr><td>Soil</td><td>c {crit['soil']['c']} kPa, φ {crit['soil']['phi']}°, γ<sub>s</sub> {crit['gs']} kN/m³; Meyerhof, SF {crit['soil']['FS']} (permanent) / {crit['soil']['FSTemp']} (temporary); effective area beyond the kern</td></tr>
<tr><td>Stability</td><td>SF overturning &amp; sliding {crit['fsOTPerm']} (permanent) / {crit['fsOTTemp']} (temporary), μ {crit['mu']}, minimum contact {crit['minContact']*100:.0f} %, no net uplift</td></tr>
<tr><td>Concrete</td><td>f'c {crit['design']['fc']} MPa, γ<sub>c</sub> {crit['gc']} kN/m³, f<sub>y</sub> {crit['design']['fy']} MPa, ties f<sub>yt</sub> {crit['pedestal']['fyt']} MPa; A<sub>s,min</sub> footing max(0.0018bh, 1.4bd/f<sub>y</sub>), pedestal ρ ≥ {crit['pedestal']['rhoMin']*100:.1f} %</td></tr>
</table>

<h2>2. Result</h2>
<h3>2.1 Structural Design</h3>
<table class="res"><caption>Table 2-1 Structural Member Design</caption>
<tr><th>Type</th><th>Member</th><th>Profile</th></tr>
<tr><td rowspan="2">{tipe}</td><td>Column</td><td>{prof_col}</td></tr><tr><td>Beam</td><td>{prof_beam}</td></tr></table>
<table class="res"><caption>Table 2-2 Maximum Unity Check (governing of STAAD AISC 360-22 and torsion H3.3)</caption>
<tr><th>Type</th><th>Member</th><th>UC</th><th>LC</th><th>Status</th></tr>
<tr><td rowspan="2">{tipe}</td><td>Column</td><td class="hl">{uc_col}</td><td class="hl">{col_r[3]}</td><td>{ok(float(uc_col) <= 1)}</td></tr>
<tr><td>Beam</td><td class="hl">{uc_beam}</td><td class="hl">{beam_r[3]}</td><td>{ok(float(uc_beam) <= 1)}</td></tr></table>
<p class="note">Deflection limit: beam supporting pipes (cantilever) ΔV = L/180 (= 2L/360); column ΔH = H/200 (general, all service combinations).</p>
<table class="res"><caption>Table 2-3 Maximum Deflection Check</caption>
<tr><th rowspan="2">Type</th><th rowspan="2">Member</th><th rowspan="2">Span / height (mm)</th><th colspan="2">Deflection (mm)</th><th rowspan="2">Status</th></tr>
<tr><th>Design</th><th>Allowable</th></tr>
<tr><td rowspan="2">{tipe}</td><td>Column</td><td>{H_cek:.0f}</td><td class="hl">{hmax[7]}</td><td class="hl">{hmax[8]}</td><td>{hmax[9]}</td></tr>
<tr><td>Beam</td><td>{span:.0f}</td><td class="hl">{vmax[3]}</td><td class="hl">{vmax[4]}</td><td>{vmax[5]}</td></tr></table>
<p class="note">Seismic drift Δ·C<sub>d</sub>/I<sub>e</sub> = {qmax[9]} mm ≤ {qmax[10]} mm (0.02H): {qmax[11]}. Further checks (KL/r, torsion, displacement at the pipe point,
permanent-load sway first / second order) in Appendix A.</p>
"""

# foundation summary (report format) straight from the foundation report; a type without its own foundation (on a slab /
# platform) gets a note instead and no drawing / Appendix B
if fdn_md:
    fsec = fdn_md[fdn_md.index("## Summary per foundation (report format)"):]
    fsec = fsec[:fsec.index("\n## ", 5)] if "\n## " in fsec[5:] else fsec
    fsec = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", fsec).replace("## Summary per foundation (report format)", "")
    fsec = re.sub(r"### .*— summary \(report format\)", "", fsec)
    summary += "<h3>2.2 Foundation Design</h3>" + markdown.markdown(fsec, extensions=["tables"])
else:
    summary += ("<h3>2.2 Foundation</h3><p class='note'>No foundation of its own (base plate on the slab with dyna bolts / on a platform): "
                f"the support reactions for the slab / platform check are in the STAAD output <code>{tipe}.ANL</code> (SUPPORT REACTIONS, ASD and LRFD).</p>")

md = lambda s: markdown.markdown(s, extensions=["tables"])
steel_html = md(steel_md.replace("# Pipe support", "# Appendix A — Pipe support", 1))
fdn_html = md(fdn_md.replace("# Foundation stability", "# Appendix B — Foundation stability", 1)) if fdn_md else ""
# tables with many columns -> small print
steel_html = steel_html.replace("<table>", '<table class="small">')
fdn_html = fdn_html.replace("<table>", '<table class="small">')

svgs = [f for f in os.listdir(".") if f.startswith(f"{tipe} - Fondasi - ") and f.endswith(".svg")]
svg = svgs[0] if (svgs and fdn_md) else None
dxf = svg[:-4] + ".dxf" if svg else None
dwg_html = (f"""<div class="pb"></div><h2>3. Foundation Drawing — {tipe}</h2>
<p class="note">Same content as the DXF for the drafter: <code>{dxf}</code> (DXF R12, mm; layers CONCRETE, REBAR, DIM, TEXT, AXIS, HIDDEN, STEEL).</p>
<img class="dwg" src="{urllib.parse.quote(svg)}">""" if svg else "")

html = f"""<!doctype html><html><head><meta charset="utf-8"><title>{tipe} — calculation sample</title>
<style>
@page {{ size: A4; margin: 16mm 14mm 16mm 14mm; }}
body {{ font-family: Arial, Helvetica, sans-serif; font-size: 9pt; color: #111; }}
h1 {{ font-size: 15pt; margin: 0 0 4mm; }} h2 {{ font-size: 12pt; margin: 6mm 0 2mm; border-bottom: 1px solid #333; }}
h3 {{ font-size: 10.5pt; margin: 4mm 0 2mm; }}
table {{ border-collapse: collapse; margin: 2mm 0 3mm; }} th, td {{ border: 1px solid #555; padding: 1.2mm 2mm; vertical-align: top; }}
th {{ background: #e8e8e8; }} caption {{ font-style: italic; margin-bottom: 1mm; }}
table.kv td:first-child {{ width: 32mm; font-weight: bold; }} table.kv {{ width: 100%; }}
table.res td, table.res th {{ text-align: center; }} td.hl {{ background: #fff59a; }}
table.small {{ font-size: 7pt; }} table.small td, table.small th {{ padding: 0.6mm 1.2mm; }}
.cover {{ border: 2px solid #111; padding: 6mm; margin-bottom: 6mm; }}
.stamp {{ color: #b00; font-weight: bold; border: 2px solid #b00; display: inline-block; padding: 1mm 3mm; margin-top: 2mm; }}
.note {{ font-size: 8.5pt; }} .pb {{ page-break-before: always; }}
img.dwg {{ width: 100%; }} code {{ font-size: 8pt; }}
</style></head><body>
<div class="cover"><h1>{lap.get('judul', 'CALCULATION')} — PIPE SUPPORT {tipe}{' AND FOUNDATION' if fdn_md else ''}</h1>
{lap.get('proyek', '')}{', drawing ' + lap['drawing'] if lap.get('drawing') else ''}{', sheet ' + str(tp['sheet']) if tp.get('sheet') else ''}<br>
Codes: {lap.get('standar', 'ASCE 7-22, AISC 360-22, ACI 318M-19')} — {today}<br>
Tools: STAAD.Pro 2025 (staad-pipesupport), FAIR Foundation Design library (tools/staad-stability.mjs)<br>
{f'<div class="stamp">{cap}</div>' if cap else ''}</div>
{summary}
{dwg_html}
<div class="pb"></div>{steel_html}
{'<div class="pb"></div>' + fdn_html if fdn_html else ''}
</body></html>"""
html = re.sub(r'<img alt="[^"]*" src="[^"]*\.svg" />', "", html)   # drawing already on its own page
nama_out = lap.get("nama_file", "Kalkulasi")
out_html = f"{tipe} - {nama_out}.html"
open(out_html, "w", encoding="utf-8").write(html)
out_pdf = os.path.join(os.path.abspath(a.out_dir) if a.out_dir else os.getcwd(), f"{tipe} - {nama_out}.pdf")
edge = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
url = "file:///" + urllib.parse.quote(os.path.abspath(out_html).replace("\\", "/"))
subprocess.run([edge, "--headless", "--disable-gpu", "--no-pdf-header-footer", f"--print-to-pdf={out_pdf}", url],
               capture_output=True, timeout=120)
print(out_pdf, os.path.exists(out_pdf), os.path.getsize(out_pdf) if os.path.exists(out_pdf) else 0)
