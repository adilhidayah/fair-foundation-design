# VALIDATION REPORT — Foundation Calculation Library
Date: 18 Sep 2026, last updated 13 Oct 2026. Method: independent hand-calculation vectors, run with Node 24.
**Total: 1103 checks, 1103 pass, 0 fail** (36 files, run 15 Oct 2026).

| File | Scope | Checks |
|---|---|---:|
| validation_shared_part1.mjs | bearing capacity, load combinations, stability (shallow + legacy pile) | 21 |
| validation_shared_part2.mjs | pedestal P-M, soil correlations, settlement | 17 |
| validation_shared_part3.mjs | anchor bolts, footing one-way / punching shear, pile cap moment, flexure (A_s,min of a footing Table 8.6.1.1 / project 'beam' option, bar layout in 25 mm steps, bar count over the width between covers), pedestal shear with axial load (§22.5) and ρmin option | 42 |
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
| validation_shared_part17.mjs | footing punching at an edge / corner: critical section cut by the footing edges, J_c about its centroid, moment shift; two-way size effect λs | 31 |
| validation_import_part18.mjs | STAAD import (.std load cases / REPEAT LOAD, .ANL support reactions, reaction → FAIR signs) + batch shallow-footing stability + footing and pedestal design + drawing + anchor-bolt top ties + pedestal auto-size + depth above the bottom mat (tools/staad-stability.mjs, tools/foundation-drawing.mjs) | 85 |
| validation_shared_part19.mjs | anchor group ACI 318M-19 Ch. 17: forces on a rigid plate, breakout with edges and hef', pullout, side-face blowout, steel, shear, anchor reinforcement + l_dh | 19 |
| validation_shared_part20.mjs | autoSizeFooting() (B = L and H) + autoSizeDepth() (B, L, H fixed, Df only): 0.05 m grid vs known thresholds + 400 random brute-force cases | 29 |
| validation_shared_part21.mjs | audit fixes 14 Oct 2026: anchor Vb (SI 0.6 / 3.7), one-way shear Vc (Table 22.5.5.1 cases, no 0.17 floor without Av,min), pedestal P-M (phi from net tensile strain, pure-tension end, envelope lookup) | 38 |
| validation_shared_part22.mjs | independent spread-footing reference (spreadFooting.js): contact pressure (full / partial / biaxial), flexure at the pedestal faces, one-way shear at d, punching — closed forms + brute-force grid | 41 |
| validation_shared_part23.mjs | STAAD support reactions → FAIR load inputs (staadReactionToFair): worked example, +x / +z lateral loads, 300 random load sets vs vector statics, vertical rows, kinds | 27 |
| validation_shared_part24.mjs | cross-check footingDesign.js (app) vs spreadFooting.js (independent Newton-solver reference): contact plane, flexure at the pedestal faces, one-way shear, punching — 600 random cases, 449 with partial contact, agreement ≤ 1e-8 | 6 |
| validation_shared_part25.mjs | pile group of the Filter Coalescer 101-F-2201 A/B/C foundation (12 piles): reactions with the correct moment lever arms (93.44 kN service / 119.5 kN factored vs 158.10 / 232.0 kN of the swapped pairing in the source document), lateral per pile, Converse–Labarre and manual Eg | 20 |
| validation_shared_part26.mjs | pile settlement, Vesic (1977) / Das §11.18: S1, S2, S3, group factor, hand-worked values, negative control for the source document's tip-load error, scaling and invalid inputs | 17 |
| validation_shared_part27.mjs | several load points on one pile cap: equivalent group load, global and section equilibrium on 400 random layouts (couples, cap weight), hand-worked sections of the 12-pile / 3-vessel cap, one point = single-pedestal model | 16 |
| validation_shared_part36.mjs | minimum contact area (combineFootingChecks minContact): e/B 0.20 → contact 0.90, UC 0.7778; e/B 0.30 → 0.60, UC 1.1667 governs; full contact UC 0.70; biaxial; no contact UC ∞; criterion off = unchanged | 8 |
| validation_shared_part35.mjs | top reinforcement option (topLayerDesign): bottom only (top for hogging, previous behaviour) / two layers (top mat ≥ ρ_top·b·t, default 0.0009): 1080 mm², D16 @ 425 (7 bars) by hand, hogging design governs when larger, TOP MAT command, CLI tables shallow + pile cap with bottom layers unchanged | 15 |
| validation_import_part34.mjs | report generator: Markdown → HTML (headings, tables with right-aligned numbers and the governing row, lists, bold / italic / code, subscripts, HTML escaping, images), document header (plain and document-table form), REPORT command, fair-run HTML with every number of the Markdown tables unchanged, PDF via an installed Chrome / Chromium / Edge (skipped when none; `FAIR_REQUIRE_PDF=1` makes a missing PDF a failure) | 22 |
| validation_shared_part33.mjs | several load points on a pile cap WITH a pedestal under each point: foundationSizing(pedAreas) (ΔW 695.322 kN), splitCombinationLoad(pedFrac) (point loads 297.203 / 576.934 / 297.203 kN, group M_x −93.199 kN·m), equilibrium of 400 random layouts, pedestalBaseActions (hand values), pedestal geometry (outside, overlap) | 20 |
| validation_import_part32.mjs | auto-thickness of a pile cap (AUTO THICKNESS with SUPPORT PILE): H = 0.30 m punching of the pedestal UC 1.136 by hand (ΔW 100.224 kN, d 209 mm, v_u 1.4063 / φv_c 1.2375 MPa), smallest passing H confirmed by single runs, Dp lock, no passing H, invalid trial | 12 |
| validation_import_part31.mjs | pile cap structure from STAAD factored combinations (tools/staad-pile.mjs): flexure M_u = 359.01 kN·m, A_s,min governs, one-way V_u 190.5 kN, punching of the pedestal 908.19 kN and of the pile 132.97 kN (hand calculation), thin cap fails, missing LRFD reaction reported | 16 |
| validation_import_part30.mjs | FAIR command input for a pile cap (SUPPORT PILE) + tools/staad-pile.mjs: parser, 3 × 3 pile group hand calculation (ΔW 251.424 kN, Eg 0.7269, F_max 83.49 / 89.05 kN, lateral 3.514 kN), CLI = tool, NOT SET limits fail | 21 |
| validation_import_part29.mjs | FAIR command input (.fnd, STAAD style): every command → its config field, line-numbered errors, CLI report identical to the JSON route | 24 |
| validation_shared_part28.mjs | punching of a pile through the pile cap (ACI 318M-19 §22.6, Table 22.6.5.2): interior / edge / corner sections, λs, φV_c = 797.2 kN for the Filter Coalescer pile (source document 797.22), tension pile, circular pile | 14 |
| **Total** | | **1103** |

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

### part17 — footing punching at an edge / corner (footingDesign.js)
- Interior section reproduces eccentricPunchingStress() exactly (v<sub>u</sub>, J<sub>c</sub>, no moment shift).
- Edge (pedestal 0.5 at x 0.7 on a 2 × 2 footing, d 0.3): b<sub>o</sub> 2.2, x̄ 0.522727, J<sub>z</sub> 0.0390091, J<sub>x</sub> 0.0818 m⁴,
  V<sub>u</sub> 344, M<sub>z,c</sub> = V<sub>u</sub>(x<sub>p</sub> − x̄) = 60.982, γ<sub>v</sub> 0.384088, v<sub>u</sub> 0.807783 MPa; v<sub>c</sub> (a) governs, (c) 2.7690.
- Corner (0.7, 0.7): b<sub>o</sub> 1.4, centroid 0.475, J<sub>z</sub> 0.0230125, V<sub>u</sub> 351, v<sub>u</sub> 1.316171 MPa, (c) 2.8575.
- Limits: section spanning two opposite edges and pedestal outside the footing are invalid; face exactly d/2 from the edge -> edge.
- Size effect λs = √(2/(1 + 0.004d)) ≤ 1 in all three v<sub>c</sub> expressions (Table 22.6.5.2): d 300 -> 0.953463, edge v<sub>c</sub> (a)
  1.723369, (c) 2.640125, corner (c) 2.724564; twoWayShearCheck() d 435 -> 0.854358, (a) 1.409690, (b) 2.178612, (c) 2.358667;
  λs = 1 for d ≤ 250. Browser (d 341, λs 0.920): punching UC manual 0.289 -> 0.314, pile 0.037 -> 0.041, soil 0.078 -> 0.085.
- Browser: default footing interior result unchanged (UC 0.078); Off X 0.5 -> edge b<sub>o</sub> 4,582 mm, (0.5, −0.5) -> corner 2,991 mm.

### part18 — STAAD import and batch stability (import/staadOutput.js, tools/staad-stability.mjs)
Parser vectors on a synthetic .std / .ANL (continuation lines, nested REPEAT LOAD, LOAD COMB, page breaks in the reaction table, units). Reaction signs from the statics of a fixed column base (load F at height h: FX = −F, MZ = +F·h; FZ = −F, MX = −F·h) against loadTypeVector()'s convention. Footing self-weight and Δh by hand (pedestal and block), P = R_Y + kD·ΔW with kD from the dead-case factor, Mz + Fx·Δh, FS sliding μP/H, overturning P·(B/2)/Mz; net uplift → not valid. q_a from soil with the Meyerhof (1963) formula against an independent hand calc (shape / depth factors, Nγ = (Nq − 1)tan1.4φ); Meyerhof effective area beyond the kern: B′ = B − 2e_x, L′ = L − 2e_z, q′ = P/(B′L′), q′_a recomputed for B′ × L′; full contact keeps the rigid formula. Bearing FS permanent / temporary (q_a,temp = q_u/FS_temp); auto-size returns the first passing square size and every smaller trial fails. Project file: "extends" deep merge, presets, locked pedestal depth Dp (Df = Dp + Hf, Δh = Gp + Dp + grout + Hf). Static uplift classification (rigid footing, no tension): none inside the kern (6ex/B + 6ez/L ≤ 1), partial outside it, net uplift P ≤ 0, base separation e ≥ B/2. Optional minimum contact area: UC = minContact / contact ratio (statics), governs below the limit. Footing thickness and reinforcement from LRFD reactions (footingDesignCheck, same lib functions as 5B shallow), concentric hand calc: net pressure w = kD·(Wf/A + Ws/(A − Ap)), Mu = qn·L·a²/2 at the pedestal face, As,min = 0.0018·b·h (fy 420, Table 8.6.1.1) or the project 'beam' option max(0.0018bh, 1.4bd/fy), bars at a spacing rounded down to 25 mm (barLayout), one-way Vu = qn·L·(a − d) and φVc (Eq. 22.5.5.1(c), λs, ρw of the bottom bars), punching b_o = 4(c + d), Vu = qn·(A − (c + d)²), v = Vu/(b_o·d), φvc (Table 22.6.5.2 with λs); d < 150 mm fails. Pedestal from STAAD reactions: actions at the base P_u = R_Y + kD·W_ped, M = M_top + H·H_p, d′ = cover + tie + d_b/2, ρ ≥ 1 %, ties at min(16d_b, 48d_tie, least dimension) rounded to 25 mm. pedestalShearCheck (part3): V_c = [0.66ρ^(1/3)√f'c + N_u/(6A_g)]·b_w·d (Table 22.5.5.1 c), tension reduces V_c (≥ 0), ties s = A_v·f_yt·d/V_s ≤ d/2, minimum ties A_v/s ≥ max(0.062√f'c, 0.35)·b_w/f_yt. Anchor bolts in the top of the pedestal (§10.7.6.1.6): 3 × D10 / 2 × D13 within 125 mm, bolts inside the ties (bolt edge vs tie inner face), bolt / corner bar clear distance √2·(bar − bolt offset) − (d_bolt + d_b)/2.

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
- CLI pile cap 5B vs the app (15 Oct 2026, headless browser, not part of the CI): tools/staad-pile.mjs (`pileCapDesignCheck`) and the app's 5B tab
  (Tab 02 pile support, Tab 03 STAAD support-reaction mode, LRFD combinations, 6.1 / 6.2 / 6.3 from the pile reactions) were run on the same
  inputs: 2 geometries (centred 3 × 3 piles with a 0.6 × 0.6 pedestal; 2 × 4 piles with a 0.8 × 0.5 pedestal offset (0.15, −0.2) m) × 3 load sets
  (gravity with small lateral, large biaxial lateral, net uplift with hogging) × 4 combinations. Compared: ΔW, M_u of the four sections (bottom and
  top, x and z), V_u and UC of the one-way shear in both directions, V_u / v_u / UC of the pedestal punching, UC of the pile punching —
  all equal (ΔW to 0.03 kN, forces and moments to ≤ 0.06, UC to ≤ 0.002; the app rounds its display). The STAAD → FAIR sign mapping is
  independent in the two (`staadReactionToFair` in the app, `reactionToFoundationLoad` in the CLI). The app's equipment load types (E(E), E(O), E(T)) take
  P from the equipment inputs, so a free-form vertical load type (Lr) was used for the third load set.
- Multi-point pedestals, UI wiring (15 Oct 2026, headless browser): Tab 02 pile support + Pile Cap + Pedestal + 3 load points (shares 1 : 2 : 1, 0.8 × 0.8, 0.9 × 0.7, 0.8 × 0.8 m) on a 6.4 × 3.2 × 1.0 m cap, STAAD-sign loads D / L / Lr and 3 LRFD combinations. ΔW 695.3 kN, pedestal weights 12.288 / 12.096 / 12.288 kN and the 4B group load (P 2093.42, M_x −93.1997 kN·m for 1.4D) agree with the hand calculation of part33; 5A (bars, ρ, UC per pedestal) and 09 (c_a1 and UC per pedestal) were recomputed from the raw numbers outside the app with searchPedestalBars / evaluateAnchorCombo — all equal. The CLI-vs-app 5B comparison above was repeated after the change: unchanged (single pedestal).
- App report export (15 Oct 2026, headless browser, not part of the CI): Summary tab → "Export report (HTML)" after visiting every tab: one standalone HTML file (315 KB, 12 report blocks, 43 tables, 8 diagrams, no "Show all N rows" buttons, all rows present, title / header / date from the Summary inputs), opened without the app and printed to a 30-page A4 PDF — text, tables and SVG diagrams (styles written inline) as in Report Preview, light palette, page numbers; no console errors. The CLI HTML / PDF (pile cap and shallow footing with drawings) were read page by page as PDF images.
- Top reinforcement option, UI wiring (16 Oct 2026, headless browser): 5B "Top reinforcement" = Two layers on the default pile cap (2.4 × 2.4 × 0.4 m, no hogging) adds x / z top mats of 0.0009·2400·400 = 864 mm² (the minimum-mat rows say so), bottom layers unchanged; on the shallow default (hogging present) the hogging design (1728 mm²) governs in both modes. The CLI drawing shows the top bars in the section and a separate top-mat plan.
- Kern with no eccentricity limit, UI (16 Oct 2026, headless browser): 4A "No limit — bearing governs" keeps the kern out of the governing UC (combineFootingChecks, unchanged); the Design Status list now shows it as "Contact area (kern, information) — min 72 % in contact — INFO" instead of "Eccentricity (kern) 1.953 NG"; with 1/6 the row stays a UC (1.953 NG). Auto-Size summaries print the same information text.
- Minimum contact area, app vs CLI (16 Oct 2026, headless browser): footing 0.60 × 0.60 × 0.30, Df 0.95, pedestal 0.30 (Gp 0.275), STAAD-sign loads, 3 ASD combinations, no e limit, min contact 70 %: app UC per L/C 0.700 / 0.729 / 1.044 = tools/staad-stability.mjs 0.700 / 0.7292 / 1.0433 (app ΔW from the 0.1 kN display value 7.0 vs 7.014 kN); status FAIL governed by "Contact area (min 70 %)" at L/C 103, the same in the Design Status list and the Focus Canvas; without the criterion PASS, UC 0.848 (overturning). Also fixed: with "No limit" the app had still put the biaxial kern into the governing UC (r.allChecks) — now the kern is left out, as in combineFootingChecks().
