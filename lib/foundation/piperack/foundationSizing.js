// ==========================================================================
// PIPE RACK — FOUNDATION SIZING (per pier, iterative with self-weight)
// Trial dimensions -> self-weight -> re-check service pressure -> grow until
// pass or limits hit. Pure functions — no DOM access.
//
// This closes the circular dependency noted in PROJECT_INSTRUCTIONS.md §4:
// sizing needs dead load, dead load needs size. The loop runs here in code
// (not manually by the user): start from B0/L0, add dW, check q <= qa,
// enlarge B/L by step until pass or maxIter.
// ==========================================================================

export function pierSelfWeight({ Bf, Lf, Hf, Df, gc, gs, Bp, Lp, Hp }) {
  const Af = Bf * Lf;
  const Wf = gc * Af * Hf;
  const Ap = Bp * Lp;
  const Wp = gc * Ap * Hp;
  const Dp = Math.max(0, Df - Hf);
  const Ws = gs * Math.max(Af - Ap, 0) * Dp;
  const totalTon = Wf + Wp + Ws;
  return { Af, Wf, Wp, Ws, totalTon, totalKN: totalTon * 9.80665, deltaH: Hp + Hf };
}

// Iterate footing plan size until service bearing q = P/A <= qa.
// P0: service vertical at pier top (kN, unfactored, governing combo envelope).
// Returns the first passing size or { converged:false } at limits.
export function sizePierFooting({ P0_kN, qa_kPa, B0 = 1.5, L0 = 1.5, step = 0.25, maxB = 6, maxIter = 40, weightFn, fixed }) {
  let B = B0, L = L0;
  for (let i = 0; i < maxIter; i++) {
    const w = weightFn({ Bf: B, Lf: L, ...fixed });
    const P = P0_kN + w.totalKN;
    const q = P / (B * L);
    if (q <= qa_kPa) return { converged: true, iters: i + 1, B, L, P_kN: P, q_kPa: q, qa_kPa, selfWeight: w };
    // Grow the short side first to stay near-square, then both.
    if (B <= L) B = Math.min(B + step, maxB); else L = Math.min(L + step, maxB);
    if (B >= maxB && L >= maxB) {
      const w2 = weightFn({ Bf: B, Lf: L, ...fixed });
      const P2 = P0_kN + w2.totalKN;
      return { converged: false, iters: i + 1, B, L, P_kN: P2, q_kPa: P2 / (B * L), qa_kPa, selfWeight: w2 };
    }
  }
  return { converged: false, iters: maxIter, B, L, P_kN: NaN, q_kPa: NaN, qa_kPa };
}
