// ==========================================================================
// AUTO-SIZE FOOTING (shallow, square plan B = L, thickness H) — deterministic search. Pure: no DOM.
//
// The solver does not know any engineering formula itself. `evaluate({ B, H })` (supplied by the caller) runs the
// project's own checks for that trial size and answers:
//   { geometryOk?: boolean, stabilityPass: boolean, shearPass: boolean | null, info?: any }
// shearPass = null means "no shear check applies" (counted as passing). `info` is handed back untouched (UI messages).
//
// Search (sizes on a grid of `step` m, so results are multiples of step; B = L):
//   1. H: smallest H in [Hmin, Hmax] that passes the shear checks, evaluated at B = Bmin.
//   2. B: smallest B in [Bmin, Bmax] that passes the stability checks (kern, bearing, sliding, overturning) at that H.
//   3. If the shear checks fail at that B (shear depends on B for the chosen load source), raise H to the smallest
//      value that passes at that B and repeat from 2 — H only ever increases, so the loop ends.
// Each "smallest" search is coarse-to-fine: stride `coarse` grid steps until the first pass, then the grid points
// between the last failing and the first passing one are scanned in order — it assumes a check that passes at a size
// keeps passing at larger ones (true for these checks); the final answer is always re-evaluated before it is returned.
// Returns { ok, B, H, evals, reason, failed: [...], info } — B / H are the last trial sizes (the answer when ok).
// ==========================================================================
export async function autoSizeFooting({ evaluate, Bmin = 0.5, Bmax = 10, Hmin = 0.3, Hmax = 3, step = 0.05, coarse = 10, H0 = null, maxRounds = 10 }) {
  const EPS = 1e-9;
  const val = (k) => +(k * step).toFixed(6);
  const kUp = (x) => Math.ceil(x / step - EPS);
  const kDown = (x) => Math.floor(x / step + EPS);
  const kBmin = kUp(Bmin), kBmax = kDown(Bmax), kHmin = kUp(Hmin), kHmax = kDown(Hmax);
  let evals = 0;
  const cache = new Map();
  const ev = async (kB, kH) => {
    const key = kB + '|' + kH;
    if (!cache.has(key)) { evals += 1; cache.set(key, await evaluate({ B: val(kB), H: val(kH) })); }
    return cache.get(key);
  };
  const stabOk = async (kB, kH) => { const r = await ev(kB, kH); return r.geometryOk !== false && r.stabilityPass === true; };
  const shearOk = async (kB, kH) => { const r = await ev(kB, kH); return r.geometryOk !== false && r.shearPass !== false; };
  // Smallest k in [kLo, kHi] with pass(k), or null.
  const findMin = async (pass, kLo, kHi) => {
    if (kLo > kHi) return null;
    if (await pass(kLo)) return kLo;
    let prev = kLo;
    for (;;) {
      const k = Math.min(prev + coarse, kHi);
      if (await pass(k)) {
        for (let j = prev + 1; j < k; j++) if (await pass(j)) return j;
        return k;
      }
      if (k === kHi) return null;
      prev = k;
    }
  };
  const result = (ok, kB, kH, reason, failed) => ({ ok, B: val(kB), H: val(kH), evals, reason, failed, info: cache.has(kB + '|' + kH) ? cache.get(kB + '|' + kH).info : undefined });
  if (!(kHmin <= kHmax) || !(kBmin <= kBmax)) return result(false, kBmin, kHmin, 'Empty size range (check Bmin/Bmax and Hmin/Hmax).', ['range']);

  // 1. H from the shear checks
  let kH = await findMin((k) => shearOk(kBmin, k), kHmin, kHmax);
  let shearImpossible = false;
  if (kH === null) { shearImpossible = true; kH = H0 === null ? kHmin : Math.min(Math.max(kUp(H0), kHmin), kHmax); }

  // 2-3. B from the stability checks, H raised while shear still fails at that B
  for (let round = 0; round < maxRounds; round++) {
    const kB = await findMin((k) => stabOk(k, kH), kBmin, kBmax);
    if (kB === null) return result(false, kBmax, kH, `Stability checks are not satisfied up to B = L = ${val(kBmax).toFixed(2)} m at H = ${val(kH).toFixed(2)} m.`, shearImpossible ? ['stability', 'shear'] : ['stability']);
    if (await shearOk(kB, kH)) {
      if (shearImpossible) return result(false, kB, kH, `Shear checks are not satisfied up to H = ${val(kHmax).toFixed(2)} m.`, ['shear']);
      return result(true, kB, kH, '', []);
    }
    const kH2 = await findMin((k) => shearOk(kB, k), kH + 1, kHmax);
    if (kH2 === null) return result(false, kB, kH, `Shear checks are not satisfied up to H = ${val(kHmax).toFixed(2)} m.`, ['shear']);
    kH = kH2;
  }
  return result(false, kBmin, kH, 'No convergence.', ['convergence']);
}
