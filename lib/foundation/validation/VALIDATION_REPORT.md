# VALIDATION REPORT — Foundation Calculation Library
Date: 18 Sep 2026, last updated 26 Sep 2026. Method: independent hand-calculation vectors, run with Node 24.
**Total: 607 checks, 607 pass, 0 fail** (16 files, run 14 Oct 2026).

| File | Scope | Checks |
|---|---|---:|
| validation_shared_part1.mjs | bearing capacity, load combinations, stability (shallow + legacy pile) | 21 |
| validation_shared_part2.mjs | pedestal P-M, soil correlations, settlement | 17 |
| validation_shared_part3.mjs | anchor bolts, footing one-way / punching shear, pile cap moment, flexure | 16 |
| validation_shared_part4.mjs | wind, seismic, settlement check | 15 |
| validation_cat_part5.mjs | static / rotating / reciprocating / pipe rack categories, foundation sizing, load kinds | 91 |
| validation_cat_part6.mjs | skid-mounted category | 23 |
| validation_import_part7.mjs | text / OCR import parsers (incl. Tab 02 foundation dimensions) | 62 |
| validation_shared_part8.mjs | pile group: layout, efficiency, p-multipliers, biaxial forces + torsion, efficiency on/off | 105 |
| validation_shared_part9.mjs | LRFD combination set, pile cap shear from pile reactions | 58 |
| validation_shared_part10.mjs | pile cap flexure, both axes, bottom + top | 25 |
| validation_shared_part11.mjs | punching shear with unbalanced moment | 16 |
| validation_static_part12.mjs | foundation geometry consistency (+ cap-only above-grade warning) | 23 |
| validation_shared_part13.mjs | autoSizeFooting() (B = L and H) + autoSizeDepth() (B, L, H fixed, Df only): 0.05 m grid vs known thresholds + 400 random brute-force cases | 29 |
| validation_shared_part14.mjs | audit fixes 14 Oct 2026: anchor Vb (SI 0.6 / 3.7), one-way shear Vc (Table 22.5.5.1 cases, no 0.17 floor without Av,min), pedestal P-M (phi from net tensile strain, pure-tension end, envelope lookup) | 38 |
| validation_shared_part15.mjs | spread footing from the soil pressure: contact pressure (full / partial / biaxial, signs, pedestal offset), flexure at the pedestal faces, one-way shear at d, punching — closed forms + brute-force grid | 41 |
| validation_shared_part16.mjs | STAAD support reactions → FAIR load inputs (staadReactionToFair): worked example, +x / +z lateral loads, 300 random load sets vs vector statics, vertical rows, kinds | 27 |
| **Total** | | **607** |

Counts are the `PASS` lines each file prints; every file exits 0 on all-pass, 1 on any fail.

## Scope & references

### part1–4 — shared checks
- bearingCapacity: Terzaghi table vs Bowles table values; Meyerhof φ = 30° vs Das textbook (Nq ≈ 18.4, Nc ≈ 30.1,
  Nγ ≈ 15.7, tol 0.05–0.08); qu hand-calc 809.42.
- loadCombinations: hand-summed D + 0.75L + 0.45W with dW/dh transfer.
- stability: full-contact q = (P/BL)(1 ± 6e/B), Beff = B − 2e uplift, FS sliding/overturning, pile F = P/n ± M·dx/Σx².
- pedestal / anchor: ca1, Nsa = Ase·futa, Nb = kc·λ·√fc·hef^1.5, bolt force distribution (bolt coordinates in m).
  **26 Sep 2026:** +2 vectors — 4 bolts at (±0.15, ±0.15) m, M = 54 kN·m → T = 90 kN; with P = 100 kN → 65 kN.
  (The UI passed bolt coordinates in mm, making the moment term 1000× too small; fixed in `js/tabs/anchor.js`.)
- footing: one-way vc = 0.17λ√fc·b·d, two-way bo interior, pile cap moment, flexure As,min.
- soil: Cn = √(100/σv) capped, Peck φ, Stroud cu, Bowles Es, γsub = γsat − 9.81.
- settlement: Se = qB(1 − ν²)/Es·If·0.8, Sc = H/(1 + e0)·C·log10 (NC + OC branches).
- wind (force method) and seismic (Fa/Fv, SDS/SD1, Cs) generators.

### part5–6 — equipment categories and sizing
- static / rotating / reciprocating / pipe rack / skid: lateral M = F·h, unbalance m·e·ω², fn = (1/2π)√(k/m),
  ±20 % band, X = (F0/k)/√((1 − r²)² + (2ζr)²), mass ratios 3 / 5, pier self-weight, iterative sizePierFooting q ≤ qa,
  bolt sums, skid plan + 2·edge.
- static foundationSizing 'block' (Footing / Pile Cap Only): input Hf, backfill hs = Df − Hf over full Af,
  Ws = γs·Af·hs, ΔH = Hf, Df < Hf invalid.
- pedestal grout: part of the pedestal, Hp = Gp + Dp + tG, ΔH = Hp + Hf; block + grout: HfTot = Hf + tG,
  hs = max(Df − HfTot, 0). Grout weight reported separately as Wg (Wp, Wf are concrete only).
- buildStdCombos (LC101–126, ASD): seismic codes EQX(E)/EQZ(E)/EQX(O)/EQZ(O); LC111 0.7/0.21, LC121 0.525/0.1575 @ SDS 0.5.
- load type kinds: LOAD_KINDS / loadTypeVector / buildComboBase — direction from the chosen kind
  (V: P; X: Fx, Mz, dMz = H·dh; Z: Fz, Mx = −M, dMx = −H·dh), vertical kinds take their own Hz/Mx; dW added once on D;
  unknown kind excluded and reported as untyped.

### part7 — import parsers
- parseLoadTypeText, parseEquipmentWeightText, parseFactorCell, parseComboImport: numbering stripped, category headings
  folded into sub-items, header rows skipped, factor cells parsed; results are candidates for user review only.

### part8 — pile group (25 Sep 2026)
- pileLayoutCheck: min c/c spacing and pile-to-cap-edge distance vs project limits (spacing FAIL uc = limit/s, warnings
  for spacing < recommended and edge < warn limit, centre outside cap = FAIL, unset limits = NOT SET, never PASS).
- Converse–Labarre Eg = 1 − θ[(n − 1)m + (m − 1)n]/(90mn), θ = atan(D/s): 2×2 @ 3D = 0.79517, 3×3 @ 3D = 0.72689.
- lateral p-multipliers (AASHTO LRFD T10.7.2.4-1, editable table) by row, 4D interpolation, < 3D held, ≥ 5D clamped.
- evaluatePileGroupCombo: F_i = P/n + Mz,c·dx/Σdx² − Mx,c·dy/Σdy² (reproduces evaluatePileCombo when uniaxial), governing
  pile for F_max / F_min; load point `at` gives Mz,c = Mz + P(at.x − x̄), Mx,c = Mx − P(at.y − ȳ); torsion
  T = a_y·Hx − a_x·Hz, J = Σr², Vx_i = Hx/n + T·dy_i/J, Vz_i = Hz/n − T·dx_i/J (2×2 @ ±1, ±1.5, Hx = 100 @ y = 0.5:
  T = 50, J = 13, V_max = 31.009 kN vs H/n = 25; equilibrium checked; lever rule 75/25 on a 2-pile line).

### part9 — LRFD set and pile cap shear (25 Sep 2026)
- buildLrfdCombos(SDS = 0.5): 27 combos LC201–227; 1.4D, 1.2D + 1.6L + 0.5Lr, 1.2D + 1.0W + L + 0.5Lr, 0.9D + 1.0W,
  (1.2 + 0.2SDS)D = 1.3 and (0.9 − 0.2SDS)D = 0.8 with 1.0E + 0.3E⊥; test condition has no seismic combos.
- pile share of a reaction on a section: 1 if s ≥ dp/2, 0 if s ≤ −dp/2, else (s + dp/2)/dp (dp = 0.4: s = 0.1 → 0.75).
- one-way: 6 piles × 100 kN, pedestal 0.8, d = 0.6 → sections ±1.0, Vu = 200 kN (d = 0.7 → 150; asymmetric 240/160;
  y-axis 225); tension and compression shares not netted. Punching: perimeter half-size 0.7 → Vu = 450 kN
  (tension pile 350; offset pedestal 500; small pedestal = ΣF = 600).

### part10 — pile cap flexure (25 Sep 2026)
- pileCapMomentAxis: net M per side = Σ F_i·(|c_i − c_p| − h_p); bottom = max(0, larger side), top = max(0, larger −side).
  6 piles × 100 kN, h_p = 0.4 → 160 kN·m each side; uplift −40 kN on one column → + side −64 (top 64), − side 160;
  pedestal offset 0.5 → 60 / 280; y axis h_p = 0.1 → 150; bottom equals pileCapMoment().

### part11 — punching with unbalanced moment (26 Sep 2026)
- eccentricPunchingStress, ACI 318M-19 §8.4.4.2, interior: vu = Vu/(bo·d) + Σ γv·|Mu|·c_AB/Jc,
  γf = 1/(1 + (2/3)√(b1/b2)), Jc = d·b1³/6 + b1·d³/6 + d·b2·b1²/2.
  500×500, d = 400: bo = 3600, Jc = 204.0e9 mm⁴, γv = 0.4; Vu = 500 kN, Mz = 100 kN·m → 0.3472 + 0.0882 = 0.4355 MPa;
  equal biaxial moments add both terms; 600×400: γf 0.5729 / 0.6265, Jc 237.33e9 / 170.67e9; edge / corner → invalid.

### part16 — STAAD support reactions → FAIR load inputs (14 Oct 2026)
FAIR takes H and M of a lateral load with the same sign when they overturn the same way (P down +; Mz > 0 compresses +x, Mx > 0 compresses −z). STAAD (Y up) reports the forces the
support exerts on the structure, so H = −FX, Hz = −FZ, M = +MZ (X types), M = −MX (Z types), P = FY, Mx = +MX (vertical rows). Check by vector statics (independent of the mapping):
loads F at points r on the structure → reactions R = −ΣF, M_r = −Σ r×F → mapped → loadTypeVector() → the pressure centre (xe, ze) of the FAIR vector equals the one from statics
(xe = −MZ_f/P, ze = MX_f/P for the action on the foundation): 300 random load sets, worst 3e-16. Worked example: +x load 100 kN at 5 m, dh 1.275 m: Mz at the underside = 627.5 kN·m;
typing the STAAD numbers without the mapping gives 372.5 (41 % low, unconservative). In the browser: STAAD mode FX −100 / MZ +500 → Fx 100, Mz 500, dMz 127.5; FZ −60 / MX −240 → Fz 60, Mx −240, dMx −76.5.

### part15 — spread footing from the soil pressure (14 Oct 2026)
Replaces the pile-derived footing flexure / V_u that the shallow mode used (Mu = 0, minimum steel, always PASS). Rigid footing, linear pressure q = q0 + a·x + c·z, no tension
(partial contact solved by Newton on exact polygon integrals), net of the factored footing + backfill weight w (pedestal weight = column load). Vectors:
B = L = 4 m, P = 1000 kN, pedestal 1 × 1 m: q = 62.5 kPa, face moment q·L·c²/2 = 281.25 kN·m, one-way shear q·L·(c − d) = 275 kN (d 0.4), punching 1000 − 62.5·1.4² = 877.5 kN;
with w = 20 kPa: 191.25 kN·m and 596.7 kN. Inside the kern (ex = 0.5 m): qmax/qmin = 109.375 / 15.625 kPa, M+ = 439.45 kN·m. Partial contact (ex = 1.2 m): qmax = 2P/(3L(B/2 − e)) = 208.33 kPa,
contact 60 %. 40 random biaxial partial-contact cases: N, N·ex, N·ez of the solved plane match a brute-force grid (< 1 %); eccentric pedestal with w and partial contact: M, V and
punching agree with the grid within 0.4 %. Signs: Mz > 0 → compression on +x, Mx > 0 → compression on −z; an offset column equals the equivalent moment. In the browser (4 × 4 × 0.7 m, 27 LRFD combinations)
the UI moments and shear agree with an independent grid + numeric-Newton solver within 0.2 kN·m / 0.2 kN.

### part14 — audit fixes (14 Oct 2026)
Found by an independent recalculation of the shallow workflow against the UI (loads, 4A, bearing, shear, pedestal P-M, anchors all agreed except these):
- Anchor shear breakout: Vb used the US-customary coefficient 7 with SI units (11.67x too high). Now min[0.6(le/da)^0.2·√da·λ√f'c·ca1^1.5, 3.7λ√f'c·ca1^1.5]
  (ACI 318M-19 §17.7.2.2.1). Hand vectors: da 20 / hef 300 / f'c 25 / ca1 100 → (a) 20,335 N, (b) 18,500 N → Vb 18,500 N; da 12 / hef 200 / f'c 30 / ca1 200 → (a) 48,805 N governs;
  US-customary equation converted to SI (19.70 kN) agrees with (a) within 4 %.
- One-way shear (bw 1000, d 341, f'c 30, rho 0.5 %): Av < Av,min → Eq. (c) with λs = 0.924 → Vc 194.78 kN (UC 220 kN → 1.506); the 0.17 floor (317.5 kN) is only for Av ≥ Av,min (larger of (a), (b)).
  Before: UC 0.924 for the same section. λs is kept for footings (conservative; §13.2.6.2 may exempt shallow foundations — verify).
- Pedestal P-M (600 × 600, d' 65, 8 D25 per layer, f'c 30, fy 420): φ was taken from the compressive-positive strain, so φ = 0.65 over the whole flexure range (φMn 18–30 % low).
  Now φ = 0.90 at c = 120 mm (net tensile strain 0.0104), 0.7869 at c = 240 mm, 0.65 once c > d2; pure-tension point φPn = −0.9·Ast·fy = −2,969 kN; Pu beyond it is out of range.
  The full 1250 × 1250 section: φMn at Pu = 0 changes from 2,437 to 3,374 kN·m (strain-compatibility with a finer grid gives 3,385).
- Not changed (by design, documented): the bolt group is assumed centred on the pedestal (ca1 from the group centroid).

### part13 — autoSizeFooting (14 Oct 2026)
The solver has no engineering formula; it searches B = L (stability) and H (shear) on a 0.05 m grid using caller-supplied checks. Vectors:
stability needs B ≥ 2.37, shear needs H ≥ 0.62 → B = 2.40, H = 0.65 (20 trials, not a grid scan); thresholds on a grid point are accepted
(2.40 / 0.65); B depending on H (B ≥ 4.0 − H, H ≥ 0.80 → B 3.20); H depending on B (H ≥ 0.2·B, B ≥ 3.0 → B 3.00, H 0.60); 200 random
thresholds equal the brute-force grid answer; no solution (stability / shear / geometry / empty range) returns ok = false with the reason;
no trial is evaluated twice. autoSizeDepth (footing size fixed by the site, only Df searched): stability needs Df ≥ 2.62 → 2.65; on-grid 2.60 accepted; 200 random thresholds = brute force; Dmax not enough → failed = stability; shear failing (independent of Df) → failed = shear. The UI wiring (js/tabs/autoSize.js) was checked in a headless browser: one step smaller (B − 0.05 or H − 0.05)
fails a check, the found size passes all. Depth-only mode in the browser (default load data, pedestal): 3.5 × 3.5 × 0.40 m → Df 2.65 m (Df 2.60 gives kern UC 1.006), 3.0 × 4.0 × 0.40 m → Df 3.80 m (3.75 gives 1.002); footing only 3.0 × 4.0 × 0.40 m → Df 1.30 m (1.25 gives 1.035).

### part12 — foundation geometry consistency (26 Sep 2026)
- foundationGeometryCheck: Bf, Lf, Hf > 0; Df ≥ Hf; pedestal inside the footing, |OffX| + Bp/2 ≤ Bf/2 and |OffZ| + Lp/2 ≤ Lf/2
  (flush edge allowed; 2.4 m footing, Bp 1.25, OffX −0.6 → 0.025 m out); pile embedment h < Hf (h = Hf fails);
  pedestal / pile checks skipped when not applicable.

## How to re-run
```
node lib/foundation/validation/validation_shared_part1.mjs
node lib/foundation/validation/validation_shared_part2.mjs
node lib/foundation/validation/validation_shared_part3.mjs
node lib/foundation/validation/validation_shared_part4.mjs
node lib/foundation/validation/validation_cat_part5.mjs
node lib/foundation/validation/validation_cat_part6.mjs
node lib/foundation/validation/validation_import_part7.mjs
node lib/foundation/validation/validation_shared_part8.mjs
node lib/foundation/validation/validation_shared_part9.mjs
node lib/foundation/validation/validation_shared_part10.mjs
node lib/foundation/validation/validation_shared_part11.mjs
node lib/foundation/validation/validation_static_part12.mjs
node lib/foundation/validation/validation_shared_part13.mjs
node lib/foundation/validation/validation_shared_part14.mjs
node lib/foundation/validation/validation_shared_part15.mjs
node lib/foundation/validation/validation_shared_part16.mjs
```

## Notes
- Tolerances: exact arithmetic 1e-9 (1e-6 / 1e-7 where the expected value is a rounded constant); textbook comparisons 0.05–0.08.
- pmInteractionCurve / searchPedestalBars are covered by smoke checks (curve shape + bar search); a full P-M numeric benchmark
  against a textbook example is still recommended with the project f'c / fy / bar schedule.
- piperackCombos is covered indirectly via combineLoadCombo vectors; the two-direction envelope (gov = max |Mbot|) by inspection.
- The library tests do not cover the UI wiring (unit conversions, which combinations a tab uses). Those were checked in a
  headless browser against independent hand calculations (see docs/PROJECT_INSTRUCTIONS.md §11) — the anchor-bolt unit bug
  found on 26 Sep 2026 was of that kind.
