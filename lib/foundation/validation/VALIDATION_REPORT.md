# VALIDATION REPORT — Foundation Calculation Library
Date: 18 Sep 2026 (updated 24 Sep 2026). Method: independent hand-calculation vectors run with Node 24.
Total: 166 checks, 166 pass, 0 fail.

## Scope & references
- bearingCapacity: Terzaghi table vs Bowles table values; Meyerhof phi=30 vs
  Das textbook (Nq~18.4, Nc~30.1, Ng~15.7, tol 0.05-0.08); qu hand-calc 809.42.
- loadCombinations: hand-summed D+0.75L+0.45W with dW/dh transfer.
- stability: full-contact q=(P/BL)(1±6e/B), Beff=B-2e uplift, FS slide/OT, pile F=P/n±M·dx/Σx².
- pedestal anchor: ca1, Nsa=Ase·futa, Nb=kc·λ·√fc·hef^1.5, bolt distribution.
- footing: 1-way vc=0.17λ√fc·b·d, 2-way bo interior, pile-cap moment, flexure As-min.
- soil: Cn=√(100/σv) capped, Peck phi, Stroud cu, Bowles Es, γsub=γsat-9.81.
- settlement: Se=qB(1-ν²)/Es·If·0.8, Sc=H/(1+e0)·C·log10 (NC + OC branches).
- static/rotating/reciprocating/piperack/skid: lateral M=F·h, unbalance m·e·ω²,
  fn=(1/2π)√(k/m), ±20% band, X=(F0/k)/√((1-r²)²+(2ζr)²), mass ratios 3/5,
  pier self-weight, iterative sizePierFooting q≤qa, bolt sums, skid plan+2·edge.
- static foundationSizing 'block' (Footing / Pile Cap Only, 24 Sep 2026): input Hf,
  backfill hs=Df-Hf over full Af, Ws=γs·Af·hs, ΔH=Hf, Df<Hf invalid (+9 checks).
- static foundationSizing pedestal grout (24 Sep 2026): grout is part of the pedestal,
  Hp=Gp+Dp+tG, Wp=γc·Ap·Hp, ΔH=Hp+Hf; groutT omitted -> legacy vectors unchanged (+5 checks).
- static foundationSizing block + grout (24 Sep 2026): HfTot=Hf+tG over full Af, hs=max(Df-HfTot,0),
  ΔH=HfTot; flush cap with grout above grade stays valid (+9 checks).
- buildStdCombos seismic codes renamed (24 Sep 2026): operating VX/VZ -> EQX/EQZ, empty EQX/EQZ ->
  EQEX/EQEZ; factor values unchanged (LC111 0.7/0.21, LC121 0.525/0.1575 @ SDS 0.5) (+7 checks).
- load type kinds (24 Sep 2026): LOAD_KINDS / loadTypeVector / buildComboBase — a load type's direction
  (V: P; X: Fx,Mz,dMz=H·dh; Z: Fz, Mx=-M, dMx=-H·dh) and temporary flag come from its chosen kind, not its code
  (engineer notation, e.g. "V" = eqX/eqZ). dW added once on D (else first dead-kind code); unknown kind ->
  excluded + reported as untyped. Default codes give the same vectors as before (+19 checks).
  Vertical kinds also take their own biaxial H/M: Hz -> Fz (dMx = -Hz·dh), Mx -> Mx; lateral kinds ignore
  Hz/Mx (+6 checks).
- punching shear with unbalanced moment (26 Sep 2026, validation_shared_part11, 16 checks): eccentricPunchingStress —
  ACI 318M-19 §8.4.4.2, interior: vu = Vu/(bo·d) + Σ γv·|Mu|·c_AB/Jc, γf = 1/(1 + (2/3)√(b1/b2)), Jc = d·b1³/6 + b1·d³/6 + d·b2·b1²/2.
  500×500, d = 400: bo = 3600, Jc = 204.0e9 mm⁴, γv = 0.4; Vu = 500 kN, Mz = 100 kN·m → 0.3472 + 0.0882 = 0.4355 MPa;
  biaxial equal moments add both terms; 600×400 rectangular γf 0.5729 / 0.6265, Jc 237.33e9 / 170.67e9; edge/corner → invalid.
- pile cap flexure both axes, bottom + top (25 Sep 2026, validation_shared_part10, 25 checks, not yet in the total above):
  pileCapMomentAxis — net M per side = Σ F_i·(|c_i − c_p| − h_p), bottom = max(0, larger side), top = max(0, larger −side).
  6 piles ×100 kN, h_p = 0.4: outer piles arm 0.8 → 160 kN·m each side; uplift −40 kN on one column → +side −64 (top 64),
  −side 160 (bottom 160); pedestal offset 0.5 → 60 / 280; y axis h_p = 0.1 → 150; bottom equals pileCapMoment().
- LRFD set + pile cap shear from pile reactions (25 Sep 2026, validation_shared_part9, 58 checks, not yet in the total above):
  buildLrfdCombos(SDS=0.5): 27 combos LC201–227; 1.4D, 1.2D+1.6L+0.5Lr, 1.2D+1.0W+L+0.5Lr, 0.9D+1.0W,
  (1.2+0.2SDS)D = 1.3 and (0.9−0.2SDS)D = 0.8 with 1.0E + 0.3E⊥; test condition has no seismic combos.
  Pile share of reaction on a section: 1 if s ≥ dp/2, 0 if s ≤ −dp/2, else (s+dp/2)/dp (dp = 0.4: s = 0.1 → 0.75).
  One-way: 6 piles × 100 kN, pedestal 0.8, d = 0.6 → sections ±1.0, V_u = 200 kN (d = 0.7 → 150 kN, asymmetric 240/160,
  y-axis 225); tension and compression shares are not netted. Punching: perimeter half-size 0.7, outer piles full,
  inner piles 25 % → V_u = 450 kN (tension pile case 350 kN; offset pedestal 500 kN; small pedestal = ΣF = 600 kN).
- pile group (25 Sep 2026, validation_shared_part8, 101 checks, not yet included in the total above): pileLayoutCheck —
  min c/c spacing and pile-to-cap-edge distance vs project limits (min spacing FAIL uc = limit/s, warnings for
  spacing < recommended and edge < warn limit, centre outside cap = FAIL, unset limits = NOT SET, never PASS);
  Converse–Labarre Eg = 1 − θ[(n−1)m+(m−1)n]/(90mn), θ = atan(D/s): 2×2 @3D = 0.79517, 3×3 @3D = 0.72689;
  lateral p-multipliers (AASHTO LRFD T10.7.2.4-1, editable table) row-by-row incl. 4D interpolation, <3D held,
  ≥5D clamped; evaluatePileGroupCombo biaxial F_i = P/n + Mz·dx/Σdx² − Mx·dy/Σdy², reproduces evaluatePileCombo
  when uniaxial, reports the governing pile for F_max / F_min. Eccentricity + torsion: load action point `at`
  (pedestal centre) gives Mz,c = Mz + P(at.x − x̄), Mx,c = Mx − P(at.y − ȳ); lateral T = a_y·Hx − a_x·Hz + Mt,
  J = Σr², Vx_i = Hx/n + T·dy_i/J, Vz_i = Hz/n − T·dx_i/J (2×2 @ ±1,±1.5, Hx=100 @ y=0.5: T=50, J=13,
  V_max = 31.009 kN vs H/n = 25; force/moment equilibrium checked; lever rule 75/25 on a 2-pile line).
- buildStdCombos seismic codes renamed again (24 Sep 2026): operating EQX/EQZ -> EQX(O)/EQZ(O), empty
  EQEX/EQEZ -> EQX(E)/EQZ(E) (same style as E(E)/E(O)/E(T)); factor values unchanged, same check count.
- static foundationSizing grouting split (24 Sep 2026): grout weight reported separately as
  Wg=γc·Ap·tG (pedestal) / γc·Af·tG (block); Wp=γc·Ap·(Gp+Dp), Wf=γc·Af·Hf are concrete only.
  Hp, HfTot, ΔH and total weight unchanged; vectors 'grout Wp' 1.155->1.14, 'blkG Wf' 5.8752->5.5296 (+3 checks).
  UI no longer passes lean concrete (Wl=0) — lean concrete removed from the foundation dead load.

## How to re-run
node lib/foundation/validation/validation_shared_part1.mjs
node lib/foundation/validation/validation_shared_part2.mjs
node lib/foundation/validation/validation_shared_part3.mjs
node lib/foundation/validation/validation_shared_part4.mjs
node lib/foundation/validation/validation_cat_part5.mjs
node lib/foundation/validation/validation_cat_part6.mjs
Each exits 0 on all-pass, 1 on any fail.

## Notes
- Tolerances: exact integer arithmetic 1e-9; textbook comparisons 0.05-0.08.
- pmInteractionCurve/searchPedestalBars covered by smoke (curve shape + bar search);
  full P-M numeric benchmark vs textbook example recommended as follow-up with
  project fc/fy/bar schedule.
- piperackCombos covered indirectly via combineLoadCombo vectors; two-direction
  envelope logic verified by inspection (gov = max |Mbot|).
