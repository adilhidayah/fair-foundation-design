# cari_profil.py
# Cari profil TIANG (atau lengan) teringan yang lolos SEMUA cek pipesupport.py (rasio STAAD + H3.3, KL/r, lendutan,
# simpangan, putaran) untuk satu tipe. Tiap kandidat dijalankan di folder sementara - config & folder proyek TIDAK
# diubah, kecuali dengan --terapkan. Mencetak satu baris per kandidat (hemat konteks).
#
#   python -I cari_profil.py --config "<proyek>.ps.json" --tipe "T-POST 1.5" [--bagian tiang|lengan]
#                            [--kandidat L75X75X9,L90X90X7] [--maks 8] [--semua] [--terapkan]
# Tanpa --kandidat: semua profil sejenis (siku sama kaki / kanal JIS) dengan luas >= profil sekarang, urut luas naik.
import argparse, datetime, json, os, re, sqlite3, subprocess, sys, importlib.util

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))
PS = os.path.join(HERE, "pipesupport.py")
spec = importlib.util.spec_from_file_location("ps", PS); ps = importlib.util.module_from_spec(spec); spec.loader.exec_module(ps)

ap = argparse.ArgumentParser()
ap.add_argument("--config", required=True); ap.add_argument("--tipe", required=True)
ap.add_argument("--bagian", choices=("tiang", "lengan"), default="tiang", help="lengan = profil semua level")
ap.add_argument("--kandidat"); ap.add_argument("--maks", type=int, default=8)
ap.add_argument("--semua", action="store_true", help="jangan berhenti di kandidat lolos pertama")
ap.add_argument("--terapkan", action="store_true", help="tulis profil lolos pertama ke config (+ catatan revisi)")
a = ap.parse_args()

cfg = json.load(open(a.config, encoding="utf-8"))
tp = next((t for t in cfg["tipe"] if t["nama"] == a.tipe), None) or ps.berhenti(f"tipe {a.tipe} tidak ada di config")
lama = tp["tiang"]["profil"] if a.bagian == "tiang" else tp["level"][0].get("profil", tp["tiang"]["profil"])
if a.kandidat:
    kand = [k.strip().upper() for k in a.kandidat.split(",") if k.strip()]
else:
    con = sqlite3.connect(f"file:{ps.DB}?mode=ro", uri=True)
    siku = lama.upper().startswith("L")
    nama = [r[0] for r in con.execute("select StaadName from JP where StaadTable = ?", ("Angle" if siku else "Channel",))]
    if siku: nama = [n for n in nama if re.match(r"L(\d+)X\1X", n)]          # sama kaki saja
    A0 = ps.dimensi_profil(lama)["A"]
    kand = sorted((n for n in nama if ps.dimensi_profil(n)["A"] >= A0 - 1e-6), key=lambda n: ps.dimensi_profil(n)["A"])[:a.maks]

akar = os.path.join(os.path.expandvars(r"%LOCALAPPDATA%"), "Temp", "pipesupport_cari", datetime.datetime.now().strftime("%Y%m%d%H%M%S"))
lolos = []
print(f"{a.tipe} - {a.bagian} (sekarang {lama}); folder kerja {akar}")
for k in kand:
    t = json.loads(json.dumps(tp))
    if a.bagian == "tiang": t["tiang"]["profil"] = k
    else:
        for lv in t["level"]: lv["profil"] = k
    c = json.loads(json.dumps(cfg)); c["tipe"] = [t]
    d = os.path.join(akar, k); os.makedirs(d, exist_ok=True); c["folder"] = d
    f = os.path.join(d, "c.ps.json"); json.dump(c, open(f, "w", encoding="utf-8"), ensure_ascii=False)
    r = subprocess.run([sys.executable, "-I", PS, "--config", f, "--jalankan"], capture_output=True, text=True, encoding="utf-8", errors="replace")
    o = r.stdout
    err = re.search(r"analisis: error = (\S+)", o)
    tor = re.search(r"cek torsi: (.*)", o); kl = re.search(r"kelangsingan: (.*)", o)
    md_p = os.path.join(d, f"{a.tipe} - Perhitungan.md")
    nok = [l for l in open(md_p, encoding="utf-8").read().splitlines() if "NOT OK" in l] if os.path.exists(md_p) else ["(laporan tidak ada)"]
    ok = r.returncode == 0 and err and err.group(1) == "0" and not nok
    uc = max((float(x) for x in re.findall(r" ([\d.]+) (?:OK|NOT OK)", tor.group(1))), default=float("nan")) if tor else float("nan")
    klr = max((float(x) for x in re.findall(r"KL/r ([\d.]+)", kl.group(1))), default=float("nan")) if kl else float("nan")
    sebab = "; ".join(sorted({re.sub(r"\s+", " ", l.split("|")[1]).strip() for l in nok if l.count("|") > 2}))[:120]
    print(f"  {k:12s} A {ps.dimensi_profil(k)['A']:6.0f} mm² | UC maks {uc:.3f} | KL/r {klr:.0f} | "
          + ("LOLOS" if ok else f"GAGAL ({len(nok)} baris: {sebab})"))
    if ok:
        lolos.append(k)
        if not a.semua: break

if not lolos:
    print("Tidak ada kandidat yang lolos - tambah --maks atau beri --kandidat lebih besar."); sys.exit(1)
print(f"Teringan yang lolos: {lolos[0]}")
if a.terapkan:
    for t in cfg["tipe"]:
        if t["nama"] != a.tipe: continue
        if a.bagian == "tiang": t["tiang"]["profil"] = lolos[0]
        else:
            for lv in t["level"]: lv["profil"] = lolos[0]
        t["revisi"] = (t.get("revisi", "") + f" {a.bagian.capitalize()} {lama} (IFC) -> {lolos[0]} (cari_profil.py, "
                       f"{datetime.date.today().isoformat()}).").strip()
    json.dump(cfg, open(a.config, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"Config diperbarui: {a.config}")
