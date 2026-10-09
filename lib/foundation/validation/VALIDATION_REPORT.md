# VALIDATION REPORT — Foundation Calculation Library
Date: 18 Sep 2026, last updated 9 Oct 2026. Method: independent hand-calculation vectors, run with Node 24.
**Total: 596 checks, 596 pass, 0 fail** (16 files, run 9 Oct 2026).

| File | Scope | Checks |
|---|---|---:|
| validation_shared_part1.mjs | bearing capacity, load combinations, stability (shallow + legacy pile) | 21 |
| validation_shared_part2.mjs | pedestal P-M, soil correlations, settlement | 17 |
| validation_shared_part3.mjs | anchor bolts, footing one-way / punching shear, pile cap moment, flexure | 16 |
| validation_shared_part4.mjs | seismic, settlement check | 15 |
| validation_cat_part5.mjs | static / rotating / reciprocating / pipe rack categories, foundation sizing, load kinds | 91 |
| validation_cat_part6.mjs | skid-mounted category | 23 |
| validation_import_part7.mjs | text / OCR import parsers (incl. Tab 02 foundation dimensions) | 62 |
| validation_shared_part8.mjs | pile group: layout, efficiency, p-multipliers, biaxial forces + torsion, efficiency on/off | 105 |
| validation_shared_part9.mjs | LRFD combination set, pile cap shear from pile reactions | 58 |
| validation_shared_part10.mjs | pile cap flexure, both axes, bottom + top | 25 |
| validation_shared_part11.mjs | punching shear with unbalanced moment | 16 |
| validation_static_part12.mjs | foundation geometry consistency (+ cap-only above-grade warning) | 23 |
| validation_shared_part13.mjs | shallow footing with an offset pedestal; biaxial kern / overturning in the governing UC | 22 |
| validation_shared_part14.mjs | biaxial no-tension soil pressure (rigid footing); "no eccentricity limit" option; Meyerhof effective area | 43 |
| validation_shared_part15.mjs | wind force generator, ASCE 7-22 Ch. 29 (Table 26.11-1 constants, Kz with zmin, qz without Kd, Ke) | 26 |
| validation_shared_part16.mjs | shallow footing design actions from the net soil pressure: flexure at the pedestal faces, one-way shear at d, punching at d/2 | 33 |
| **Total** | | **596** |

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
- seismic (Fa/Fv, SDS/SD1, Cs) generator. (Wind was listed here but had no vector; it is covered by part15 since 9 Oct 2026.)

### part16 — shallow footing design actions (footingDesign.js)
- Uniform pressure (B = L = 2, P = 400, pedestal 0.5, d 0.3): M = qLc²/2 = 56.25, V = 90, punching 336; net with w = 20 kPa: 45 / 72 / 268.8.
- Trapezoidal (M<sub>z</sub> 40 → q = 100 + 30x): face moments 68.906 / 43.594 by direct integration; sign convention
  (M<sub>z</sub> > 0 compresses +x, M<sub>x</sub> > 0 compresses −z) in all four directions.
- Triangular partial contact (q<sub>max</sub> = 2P/[3L(B/2 − e)] = 400): face moments 93.75 / 0.694, net hogging on the uplift
  side 2.118, punching 214.667. Offset pedestal (uniform) and perimeter-at-edge rejection.
- Biaxial partial contact (contact 71%): ∫q = P and first moments = P·x<sub>R</sub>, P·z<sub>R</sub>; flexure (4 faces), one-way and punching
  against an independent 800 × 800 midpoint grid (agreement ~1e-7).
- UI wiring checked in a headless browser: default data LC206 (P<sub>u</sub> 360.1, M<sub>z</sub> 166.5, partial contact) hand calc
  q<sub>max</sub> 135.61, V<sub>u</sub> = 72.13 − 13.75 = 58.38 kN, M<sub>u</sub> = 49.14 − 9.71 = 39.43 kN·m (app 135.6 / 58.4 / 39.4); pile mode output identical
  to the previous commit apart from wording.

### part15 — wind generator (ASCE 7-22)
- Table 26.11-1 constants B/C/D (α, z<sub>g</sub>, z<sub>min</sub>, ft → m), K<sub>z</sub> = 2.41(z/z<sub>g</sub>)<sup>2/α</sup> with z raised to z<sub>min</sub>,
  q<sub>z</sub> = 0.613K<sub>z</sub>K<sub>zt</sub>K<sub>e</sub>V² (Eq. 26.10-1, no K<sub>d</sub>), F = q<sub>z</sub>K<sub>d</sub>GC<sub>f</sub>A<sub>f</sub> (Eq. 29.4-1), K<sub>e</sub> = e<sup>−0.000119z<sub>e</sub></sup>.
- Hand-calc worked in US units (ft, mph, psf) — default popup data: q<sub>z</sub> 1117.45 Pa, F 8.2065 kN (ASCE 7-16 code: 8.19 kN);
  Exposure B below z<sub>min</sub>, K<sub>zt</sub> 1.1, z<sub>e</sub> 500 m: F 6.4102 kN. Table 26.10-1 spot values for C (0.85 / 0.98 / 1.13).

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

### part12 — foundation geometry consistency (26 Sep 2026)
- foundationGeometryCheck: Bf, Lf, Hf > 0; Df ≥ Hf; pedestal inside the footing, |OffX| + Bp/2 ≤ Bf/2 and |OffZ| + Lp/2 ≤ Lf/2
  (flush edge allowed; 2.4 m footing, Bp 1.25, OffX −0.6 → 0.025 m out); pile embedment h < Hf (h = Hf fails);
  pedestal / pile checks skipped when not applicable.

### part13 — offset pedestal on a shallow footing; biaxial checks govern (9 Oct 2026)
- pedestalOffsetMoments (statics about the footing centroid): no offset → 0; P at +x → ΔMz = +P·OffX, P at +z → ΔMx = −P·OffZ
  (app sign convention); backfill centroid z_s = −OffZ·Ap/(Af − Ap); kD scales the self-weight only; a uniform-weight
  pedestal + soil prism over the whole footing gives zero net moment.
- Pipe support, STAAD node 1, LC 115 (kD = 0.6 − 0.14·0.623), footing 1.30 × 1.40 × 0.25, Df 0.90, pedestal 0.30 × 0.30,
  OffZ 0.30: ΔW = 33.21 kN, Δh = 1.200 m, ΔMx,off = −0.340, P = 17.65 kN, Mx = −1.267, Mz = 2.545 kN·m, biaxial kern
  (2.545/17.65/1.3 + 1.267/17.65/1.4)·6 = 0.973, biaxial OT UC 1.5/(17.65·0.65/2.545) = 0.333.
- combineFootingChecks: B = L = 1.2, P = 10, Mx = Mz = 1.1 — resultant e = 0.156 ≤ B/6 (uniaxial passes, UC 0.778) but the
  kern diamond gives 1.100 → combined result fails, governed by the biaxial kern; all-pass case; invalid result passed through.

### part14 — biaxial soil pressure without tension; no eccentricity limit (9 Oct 2026)
- biaxialSoilPressure: full contact q = (P/BL)(1 ± 6ex/B ± 6ez/L) (2.0 × 3.0, P 600, ex 0.10, ez 0.15 → 160 / 40 kPa; kern line
  → 2P/A); uniaxial beyond the kern q_max = 2P/[3L(B/2 − e)] (266.667, contact 75 %; along z 333.333); corner-triangle closed form
  q_max = 6P/(s·t), s = 4(B/2 − ex), t = 4(L/2 − ez) (416.667, contact 18 %; rectangular 1071.43); four general partial-contact
  cases checked by an independent 600 × 600 grid integration of the returned plane (ΣV, ΣM about both axes, contact area);
  continuity at the kern line; resultant outside the footing / P ≤ 0 → invalid.
- combineFootingChecks with { eccLimit: false, ucBearingBiaxial }: eccentricity checks left out, biaxial bearing added; the call
  without options is unchanged.
- meyerhofEffectiveArea: B' = B − 2ex, L' = L − 2ez, q' = P/(B'L') (2.0 × 3.0, P 600, ex 0.5, ez 0.3 → 1.0 × 2.4, 250 kPa); shorter
  effective side taken as the width; invalid at ex ≥ B/2; q_u with B' × L' (Terzaghi rectangular, DCPT-01 soil) = hand calc; q_a(B', L') < q_a(B, L).

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
```

## Notes
- Tolerances: exact arithmetic 1e-9 (1e-6 / 1e-7 where the expected value is a rounded constant); textbook comparisons 0.05–0.08.
- pmInteractionCurve / searchPedestalBars are covered by smoke checks (curve shape + bar search); a full P-M numeric benchmark
  against a textbook example is still recommended with the project f'c / fy / bar schedule.
- piperackCombos is covered indirectly via combineLoadCombo vectors; the two-direction envelope (gov = max |Mbot|) by inspection.
- The library tests do not cover the UI wiring (unit conversions, which combinations a tab uses). Those were checked in a
  headless browser against independent hand calculations (see docs/PROJECT_INSTRUCTIONS.md §11) — the anchor-bolt unit bug
  found on 26 Sep 2026 was of that kind.
