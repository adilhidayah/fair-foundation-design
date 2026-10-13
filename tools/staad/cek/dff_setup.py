# dff_setup.py
# Memasang cek lendutan per bentang (DFF / DJ1 / DJ2 / CAN) ke model STAAD.Pro 2025 (AISC 360) dan mengubah
# desain baja agar memakai envelope, karena STAAD hanya menjalankan cek DFF bila LOAD LIST desain berupa envelope:
#   envelope TYPE STRENGTH        -> cek kekuatan
#   envelope TYPE SERVICEABILITY  -> cek lendutan DFF
# Satu load case hanya boleh ada di satu envelope (kalau tidak muncul WARNING tumpang tindih), sehingga kombinasi
# layan untuk lendutan dibuat sebagai SALINAN (nomor LC + offset).
#
# Pakai (file asli tidak ditimpa kecuali --keluar sama dengan --model):
#   python -I dff_setup.py --model "E:\...\Model.std" --config "E:\...\Model.cek.json" --keluar "E:\...\Model REV1.std"
#
# Config (bagian "dff_setup" di file .cek.json):
#   "dff_setup": {
#     "bentang": [ {"member": "55 TO 57", "dff": 200, "dj1": 37, "dj2": 40},      # balok dipecah: DJ1/DJ2 = tumpuan
#                  {"member": "81 84 87", "dff": 200},                            # tanpa DJ = ujung member sendiri
#                  {"member": "47 TO 54", "dff": 120, "can": 1} ],                # kantilever
#     "layan": "101 TO 104 201 TO 204",     # kombinasi layan yang disalin untuk cek lendutan
#     "offset": 500,                         # salinan = LC + offset (601..604, 701..704)
#     "kekuatan": "101 TO 140 201 TO 240",   # kombinasi untuk cek kekuatan (envelope STRENGTH)
#     "envelope_lain": [ {"beban": "301 TO 327 401 TO 427", "tipe": "STRENGTH"},
#                        {"beban": "501 TO 504", "tipe": "SERVICEABILITY"} ]      # opsional, tidak ikut desain
#   }
# Catatan: parameter RATIO juga dipakai STAAD untuk rasio lendutan DFF; rasio lendutan STAAD memakai resultan
# LOCAL-XYZ (ikut lendutan horizontal), bukan hanya vertikal.
import argparse, json, os, re, sys

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cek_staad import urai_daftar, grup_std, tulis_daftar, berhenti

def ringkas(nomor):
    """[101,102,103,104,201] -> '101 TO 104 201'"""
    n = sorted(set(nomor)); out, i = [], 0
    while i < len(n):
        j = i
        while j + 1 < len(n) and n[j + 1] == n[j] + 1:
            j += 1
        out.append(f"{n[i]} TO {n[j]}" if j - i >= 2 else " ".join(str(x) for x in n[i:j + 1]))
        i = j + 1
    return " ".join(out)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--config", required=True)
    ap.add_argument("--keluar", required=True, help="file .std hasil (boleh sama dengan --model untuk menimpa)")
    a = ap.parse_args()
    cfg = json.load(open(a.config, encoding="utf-8-sig")).get("dff_setup")
    if not cfg:
        berhenti("config tidak punya bagian \"dff_setup\"")
    s = open(a.model, encoding="latin-1").read().replace("\r\n", "\n")
    if re.search(r"^\s*DFF\s", s, re.M | re.I):
        berhenti("model sudah berisi DFF; dff_setup.py tidak dijalankan dua kali")
    grup = grup_std(s.splitlines())

    # 1. salinan kombinasi layan (REPEAT LOAD) -> LC + offset
    off = int(cfg.get("offset", 500))
    layan = urai_daftar(cfg["layan"], grup)
    salinan = []
    for lc in layan:
        m = re.search(rf"^LOAD {lc}\b([^\n]*)\n(REPEAT LOAD\n(?:[^\n]*\n)*?)(?=LOAD |PERFORM|\*|DEFINE|CHANGE|FINISH)", s, re.M)
        if not m:
            berhenti(f"LOAD {lc} (REPEAT LOAD) tidak ditemukan untuk disalin")
        salinan.append(f"LOAD {lc + off} DEFL{m.group(1)}\n{m.group(2)}")
    posisi = [m.end() for m in re.finditer(r"^PERFORM ANALYSIS[^\n]*\n", s, re.M)]
    if not posisi:
        berhenti("PERFORM ANALYSIS tidak ditemukan")
    akhir = s.rfind("PERFORM ANALYSIS", 0, posisi[-1])  # sisipkan sebelum PERFORM ANALYSIS terakhir
    s = s[:akhir] + "*** salinan kombinasi layan untuk cek lendutan (DFF)\n" + "".join(salinan) + s[akhir:]

    # 2. envelope tanpa tumpang tindih
    env = ["DEFINE ENVELOPE", f"{ringkas(urai_daftar(cfg['kekuatan'], grup))} ENVELOPE 1 TYPE STRENGTH",
           f"{ringkas([lc + off for lc in layan])} ENVELOPE 2 TYPE SERVICEABILITY"]
    for k, e in enumerate(cfg.get("envelope_lain", []), start=3):
        env.append(f"{ringkas(urai_daftar(e['beban'], grup))} ENVELOPE {k} TYPE {e.get('tipe', 'SERVICEABILITY').upper()}")
    env.append("END DEFINE ENVELOPE")
    blok_env = "\n".join(env) + "\n"
    m = re.search(r"^DEFINE ENVELOPE\n.*?^END DEFINE ENVELOPE\n", s, re.M | re.S)
    if m:
        s = s[:m.start()] + blok_env + s[m.end():]
    else:
        i = s.find("PARAMETER")
        s = s[:s.rfind("\n", 0, s.rfind("LOAD LIST", 0, i)) + 1] + blok_env + s[s.rfind("\n", 0, s.rfind("LOAD LIST", 0, i)) + 1:]

    # 3. LOAD LIST desain -> envelope 1 (kekuatan) + 2 (lendutan)
    m = re.search(r"^LOAD LIST[^\n]*(?:-\n[^\n]*)*\n(?=(?:\*[^\n]*\n)*PARAMETER)", s, re.M)
    if not m:
        berhenti("baris LOAD LIST tepat sebelum PARAMETER (blok desain) tidak ditemukan")
    s = s[:m.start()] + "LOAD LIST ENVELOPE 1 2\n" + s[m.end():]

    # 4. DFF / DJ1 / DJ2 / CAN sebelum RATIO (atau sebelum CHECK CODE)
    baris = ["* ---- cek lendutan per bentang (DFF = L/xxx, DJ1-DJ2 = tumpuan bentang)"]
    for b in cfg["bentang"]:
        mb = urai_daftar(b["member"], grup)
        baris += tulis_daftar(f"DFF {b['dff']} MEMB", mb)
        if b.get("dj1"):
            baris += tulis_daftar(f"DJ1 {b['dj1']} MEMB", mb) + tulis_daftar(f"DJ2 {b['dj2']} MEMB", mb)
        if b.get("can"):
            baris += tulis_daftar(f"CAN {b['can']} MEMB", mb)
    m = re.search(r"^RATIO\s", s, re.M) or re.search(r"^CHECK CODE", s, re.M)
    if not m:
        berhenti("RATIO / CHECK CODE tidak ditemukan di blok desain")
    s = s[:m.start()] + "\n".join(baris) + "\n" + s[m.start():]

    open(a.keluar, "w", encoding="latin-1", newline="\r\n").write(s)
    print(f"OK: {len(salinan)} salinan kombinasi layan (+{off}), {len(cfg['bentang'])} grup bentang DFF, "
          f"LOAD LIST ENVELOPE 1 2 -> {a.keluar}")

if __name__ == "__main__":
    main()
