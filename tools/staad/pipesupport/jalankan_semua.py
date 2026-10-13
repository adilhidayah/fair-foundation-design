"""Batch semua tipe pipe support: STAAD (pipesupport.py --jalankan) -> pondasi (MASTER CALCULATOR tools/staad-stability.mjs)
-> PDF (laporan_pdf.py). Hanya mencetak RINGKASAN satu baris per tipe (hemat konteks); detail ada di file per tipe dan di
"Ringkasan Semua Tipe.md". Struktur: <folder>/<Tipe>/ = STAAD + laporan + pondasi + DXF/SVG per tipe, <folder>/PDF/ = semua PDF.
Jalankan TANPA -I (laporan_pdf butuh paket user-site `markdown`):
  python jalankan_semua.py --folder <folder Kalkulasi> [--ps x.ps.json] [--fondasi y.Fondasi.proyek.json] [--tipe "T-POST 1.2" ...]
                           [--tanpa-staad] [--tanpa-pdf]
Pondasi: tipe dipetakan ke preset lewat "preset_per_tipe" di file proyek pondasi (kunci = nomor tipe, mis. "1.2" dari "T-POST 1.2");
tipe tanpa preset (di platform / slab) dilewati. Node tumpuan STAAD = 1 (dasar tiang dari pipesupport.py)."""
import argparse, glob, importlib.util, json, os, re, subprocess, sys

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))
NODE_TOOL = os.path.normpath(os.path.join(HERE, "..", "..", "staad-stability.mjs"))   # repo: tools/staad-stability.mjs

ap = argparse.ArgumentParser()
ap.add_argument("--folder", required=True); ap.add_argument("--ps"); ap.add_argument("--fondasi")
ap.add_argument("--tipe", nargs="*"); ap.add_argument("--pdf-dir", default="PDF"); ap.add_argument("--tanpa-staad", action="store_true"); ap.add_argument("--tanpa-pdf", action="store_true")
a = ap.parse_args()
os.chdir(a.folder)
ps_path = os.path.abspath(a.ps or sorted(glob.glob("*.ps.json"))[0])
fp_path = os.path.abspath(a.fondasi or sorted(glob.glob("*Fondasi.proyek.json"))[0])
ROOT = os.getcwd()
tdir = lambda t: os.path.join(ROOT, re.sub(r'[\/:*?"<>|]+', "-", t).strip())   # satu folder per tipe
pdf_dir = os.path.join(ROOT, a.pdf_dir); os.makedirs(pdf_dir, exist_ok=True)
ps = json.load(open(ps_path, encoding="utf-8"))
fp = json.load(open(fp_path, encoding="utf-8"))
semua = [t["nama"] for t in ps["tipe"]]
pilih = a.tipe or semua
run = lambda cmd: subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
hasil = {t: {"tipe": t} for t in pilih}

# 1. STAAD: satu config berisi semua tipe; jalankan per tipe yang dipilih lewat config sementara (tipe lain tidak diubah)
if not a.tanpa_staad:
    for t in pilih:
        os.makedirs(tdir(t), exist_ok=True)
        cfg = dict(ps); cfg["tipe"] = [x for x in ps["tipe"] if x["nama"] == t]; cfg["folder"] = tdir(t)
        tmp = os.path.join(tdir(t), "_tmp.ps.json")
        json.dump(cfg, open(tmp, "w", encoding="utf-8"), ensure_ascii=False)
        r = run([sys.executable, "-I", os.path.join(HERE, "pipesupport.py"), "--config", tmp, "--jalankan"])
        os.remove(tmp)
        o = r.stdout
        h = hasil[t]
        m = re.search(r"analisis: error = (\S+)", o); h["err"] = m.group(1) if m else "?"
        m = re.search(r"cek torsi: (.*)", o)
        if m:
            vals = re.findall(r"([A-Za-z]+)[^;]*? ([\d.]+|inf) (OK|NOT OK)", m.group(1))
            h["uc_tiang"] = max((float(v) for n, v, s in vals if n == "Tiang"), default=None)
            h["uc_lengan"] = max((float(v) for n, v, s in vals if n == "Lengan"), default=None)
            h["baja_ok"] = all(s == "OK" for _, _, s in vals)
        simp = re.findall(r"simpangan (.+?) (H/\d+): (.*)", o)
        h["simp_ok"] = bool(simp) and all("NOT OK" not in x[2] for x in simp)
        kl = re.search(r"kelangsingan: (.*)", o)
        h["klr_max"] = max((float(x) for x in re.findall(r"KL/r ([\d.]+)", kl.group(1))), default=None) if kl else None
        if r.returncode != 0 or h["err"] not in ("0",):
            h["catatan"] = (r.stderr.strip().splitlines() or ["STAAD error"])[-1][:120]

# 2. pondasi
_spec = importlib.util.spec_from_file_location("pipesupport", os.path.join(HERE, "pipesupport.py"))
_pspy = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(_pspy)
def kolom_gambar(t):
    """profil tiang untuk gambar pondasi (foundation-drawing.mjs): dimensi mm + orientasi sama dengan model STAAD"""
    tp = next((x for x in ps["tipe"] if x["nama"] == t), None)
    if not tp: return None
    d = _pspy.dimensi_profil(tp["tiang"]["profil"])
    return {"name": d["nama"], "shape": "L" if d["jenis"] == "L" else "C", "h": d["h"], "b": d["b"], "tw": d["tw"], "tf": d["tf"],
            "cy": round(d["cy"], 2), "toe": tp["tiang"].get("ujung_sayap", "+Z")}
pre = fp.get("preset_per_tipe", {})
for t in pilih:
    h = hasil[t]
    num = re.search(r"(\d+\.\d+)", t)
    preset = pre.get(num.group(1)) if num else None
    if not preset:
        h["fondasi"] = "- (tanpa pondasi sendiri)"; continue
    os.makedirs(tdir(t), exist_ok=True)
    fcfg = os.path.join(tdir(t), f"{t} - Fondasi.json")
    fnd = {"name": f"F1 ({t})", "node": 1, "preset": preset}
    kol = kolom_gambar(t)
    if kol: fnd["column"] = kol
    json.dump({"extends": fp_path, "project": f"{ps.get('laporan', {}).get('proyek', '')} - {t}", "std": f"{t}.std", "anl": f"{t}.ANL",
               "foundations": [fnd]}, open(fcfg, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    r = run(["node", NODE_TOOL, fcfg, "--out", os.path.join(tdir(t), f"{t} - Fondasi.md")])
    line = next((l for l in r.stdout.splitlines() if l.startswith("F1")), r.stderr.strip()[-150:])
    h["fondasi_ok"] = ": PASS" in line
    m = re.search(r"footing ([\d.]+ × [\d.]+ × [\d.]+) m", line); h["footing"] = m.group(1) if m else "-"
    m = re.search(r"pedestal: (?:OK|NOT OK) — (\d+ D\d+), ties D(\d+) @ (\d+)", line)
    h["pedestal"] = f"{m.group(1)}, Ø{m.group(2)}-{m.group(3)}" if m else "-"
    m = re.search(r"— L/C (\d+), ([^,]+), UC ([\d.∞]+)", line); h["stab"] = f"{m.group(2)} {m.group(3)} (L/C {m.group(1)})" if m else line[:80]

# 3. PDF
if not a.tanpa_pdf:
    for t in pilih:
        if not os.path.exists(os.path.join(tdir(t), f"{t} - Perhitungan.md")):
            hasil[t]["pdf"] = "- (belum ada laporan STAAD)"; continue
        r = run([sys.executable, os.path.join(HERE, "laporan_pdf.py"), "--folder", tdir(t), "--tipe", t, "--ps", ps_path, "--fondasi", fp_path,
                 "--out-dir", pdf_dir])
        hasil[t]["pdf"] = "OK" if " True " in r.stdout else ("GAGAL: " + (r.stderr.strip().splitlines() or ["?"])[-1][:80])

# 3b. brief drafter (satu PDF, satu halaman per tipe berpondasi)
brief = ""
if not a.tanpa_pdf:
    r = run([sys.executable, os.path.join(HERE, "brief_drafter.py"), "--folder", ROOT, "--ps", ps_path, "--fondasi", fp_path])   # brief always covers every type
    brief = (r.stdout.strip().splitlines() or ["BRIEF: gagal " + r.stderr.strip()[-120:]])[-1]

# 3c. gambar baja (elevasi / potongan / base plate dari config model STAAD), satu PDF untuk semua tipe
if not a.tanpa_pdf:
    r = run([sys.executable, os.path.join(HERE, "gambar_baja.py"), "--folder", ROOT, "--ps", ps_path, "--fondasi", fp_path])
    gb = next((l for l in r.stdout.splitlines() if l.startswith("PDF:")), "GAMBAR BAJA: gagal " + r.stderr.strip()[-120:])
    brief = (brief + "
" if brief else "") + gb

# 4. ringkasan (layar + file)
f = lambda v: "-" if v is None else (f"{v:.3f}" if isinstance(v, float) else str(v))
head = "| Tipe | STAAD err | UC tiang | UC lengan | KL/r maks | Baja | Simpangan | Footing (m) | Pedestal | Stabilitas penentu | Pondasi | PDF |"
rows = [head, "|" + "---|" * 12]
for t in pilih:
    h = hasil[t]
    rows.append(f"| {t} | {h.get('err', '-')} | {f(h.get('uc_tiang'))} | {f(h.get('uc_lengan'))} | {f(h.get('klr_max'))} | "
                f"{'OK' if h.get('baja_ok') else ('-' if 'baja_ok' not in h else 'NOT OK')} | {'OK' if h.get('simp_ok') else ('-' if 'simp_ok' not in h else 'NOT OK')} | "
                f"{h.get('footing', '-')} | {h.get('pedestal', '-')} | {h.get('stab', h.get('fondasi', '-'))} | "
                f"{'OK' if h.get('fondasi_ok') else ('-' if 'fondasi_ok' not in h else 'NOT OK')} | {h.get('pdf', '-')} |"
                + (f" {h['catatan']}" if h.get("catatan") else ""))
# keep the rows of types not run this time (partial runs with --tipe), in the order of the config
ring_p = os.path.join(ROOT, "Ringkasan Semua Tipe.md")
if (a.tipe or a.tanpa_staad) and os.path.exists(ring_p):   # --tanpa-staad: keep the steel columns of the previous run
    old = {l.split("|")[1].strip(): l for l in open(ring_p, encoding="utf-8").read().splitlines() if l.startswith("| T") or (l.startswith("| ") and not l.startswith("| Tipe"))}
    new = {r.split("|")[1].strip(): r for r in rows[2:]}
    def merge(t):                       # --tanpa-staad: steel columns of the new row are empty -> take them from the old row
        n_, o_ = new.get(t), old.get(t)
        if n_ and o_ and a.tanpa_staad:
            nc, oc = n_.split("|"), o_.split("|"); n_ = "|".join(oc[i] if 2 <= i <= 7 else nc[i] for i in range(len(nc)))
        return n_ or o_
    rows = rows[:2] + [merge(t) for t in semua if t in new or t in old]
open(ring_p, "w", encoding="utf-8").write("# Ringkasan semua tipe pipe support\n\n" + "\n".join(rows) + "\n")
print("\n".join(rows))
if brief: print(brief)
