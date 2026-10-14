// ==========================================================================
// AUTO-SIZE FOOTING (shallow, square plan B = L, thickness H) — deterministic search. Pure: no DOM.
//
// The solver does not know any engineering formula itself. `evaluate({ B, H })` (supplied by the caller) runs the
// project's own checks for that trial size and answers:
//   { geometryOk?: boolean, stabilityPass: boolean, shearPass: boolean | null, info?: any }
// shearPass = null means "no shear check applies" (counted as passing). `info` is handed back untouched (UI messages).
//
// Search (sizes on a grid of `step` m, so results are multiples of step; B = L):
//   1. H: the smallest H in [Hmin, Hmax] that passes the shear checks at B = Bmin (a start value only — shear may depend on B).
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

  // 1. Starting H: the smallest H that passes the shear checks at B = Bmin. Shear may depend on B (V_u from the soil pressure) and
  //    a very small footing may have no valid shear result at all, so when no H passes here the search simply starts from
  //    Hmin — the loop below raises H at the B found for stability.
  let kH = await findMin((k) => shearOk(kBmin, k), kHmin, kHmax);
  if (kH === null) kH = kHmin; // H0 (the thickness typed in Tab 02) is deliberately not the start: the result must be the smallest passing H

  // 2-3. B from the stability checks, H raised while shear still fails at that B
  for (let round = 0; round < maxRounds; round++) {
    const kB = await findMin((k) => stabOk(k, kH), kBmin, kBmax);
    if (kB === null) return result(false, kBmax, kH, `Stability checks are not satisfied up to B = L = ${val(kBmax).toFixed(2)} m at H = ${val(kH).toFixed(2)} m.`, ['stability']);
    if (await shearOk(kB, kH)) return result(true, kB, kH, '', []);
    const kH2 = await findMin((k) => shearOk(kB, k), kH + 1, kHmax);
    if (kH2 === null) return result(false, kB, kH, `Shear checks are not satisfied up to H = ${val(kHmax).toFixed(2)} m.`, ['shear']);
    kH = kH2;
  }
  return result(false, kBmin, kH, 'No convergence.', ['convergence']);
}

// ==========================================================================
// AUTO-SIZE DEPTH ONLY — plan size (B x L, any shape) AND thickness H are fixed by the site / the user; only the embedment
// depth Df is searched.
// evaluate({ Df }) -> { geometryOk?: boolean, stabilityPass: boolean, shearPass: boolean | null, info?: any }
// (the caller keeps B, L and H). Smallest Df in [Dmin, Dmax] on the `step` grid for which the stability AND shear checks pass.
// A deeper footing carries more soil on top of it (and a larger q_a), which helps kern / sliding / overturning — the same
// coarse-to-fine scan as above. Shear capacity does not depend on Df: if shear fails the search ends without a result and
// failed contains 'shear' (H must be changed instead); failed = ['stability'] means even Dmax is not enough.
// Returns { ok, Df, evals, reason, failed, info }.
// ==========================================================================
export async function autoSizeDepth({ evaluate, Dmin = 0.3, Dmax = 5, step = 0.05, coarse = 10 }) {
  const EPS = 1e-9;
  const val = (k) => +(k * step).toFixed(6);
  const kLo = Math.ceil(Dmin / step - EPS), kHi = Math.floor(Dmax / step + EPS);
  let evals = 0;
  const cache = new Map();
  const ev = async (k) => { if (!cache.has(k)) { evals += 1; cache.set(k, await evaluate({ Df: val(k) })); } return cache.get(k); };
  const allOk = async (k) => { const r = await ev(k); return r.geometryOk !== false && r.stabilityPass === true && r.shearPass !== false; };
  if (!(kLo <= kHi)) return { ok: false, Df: val(kLo), evals, reason: 'Empty depth range (check Dmin / Dmax).', failed: ['range'], info: undefined };
  let found = null;
  if (await allOk(kLo)) found = kLo;
  else {
    let prev = kLo;
    for (;;) {
      const k = Math.min(prev + coarse, kHi);
      if (await allOk(k)) {
        found = k;
        for (let j = prev + 1; j < k; j++) if (await allOk(j)) { found = j; break; }
        break;
      }
      if (k === kHi) break;
      prev = k;
    }
  }
  if (found !== null) return { ok: true, Df: val(found), evals, reason: '', failed: [], info: cache.get(found).info };
  const last = await ev(kHi);
  const failed = [];
  if (last.geometryOk === false) failed.push('geometry');
  if (last.stabilityPass !== true) failed.push('stability');
  if (last.shearPass === false) failed.push('shear');
  return { ok: false, Df: val(kHi), evals, reason: `Still failing at Df = ${val(kHi).toFixed(2)} m with the fixed footing size: ${failed.length ? failed.join(' + ') : 'checks'}.`, failed, info: last.info };
}
