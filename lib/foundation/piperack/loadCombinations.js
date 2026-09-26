// ==========================================================================
// PIPE RACK — LOAD COMBINATIONS (per pier, two directions)
// Extends the shared ASCE 7 ASD baseline: same factors, but evaluated
// separately in longitudinal (L-dir) and transversal (T-dir) because H/M
// differ per direction. Pure functions — no DOM access.
// ==========================================================================

import { defaultCombos, combineLoadCombo } from '../shared/loadCombinations.js';

// Split the shared 'T' (thermal) map into per-direction H/M before combining:
// thermalByDir = { L: {H, M}, T: {H, M} }.
export function piperackCombos({ loads, thermalByDir, loadTypeCodes = ['D', 'L', 'W', 'E', 'T'], dW = 0, dh = 0 }) {
  const combos = defaultCombos();
  return combos.map((combo) => {
    // Transversal governs bearing/OT in most racks — evaluate both, keep envelope.
    const forDir = (dir) => {
      const dirLoads = { ...loads };
      const th = thermalByDir[dir];
      if (th) dirLoads.T = { P: 0, H: th.H, M: th.M };
      return combineLoadCombo(combo, dirLoads, loadTypeCodes, dW, dh);
    };
    const resL = forDir('L');
    const resT = forDir('T');
    const gov = Math.abs(resT.Mbot) >= Math.abs(resL.Mbot) ? resT : resL;
    return { combo: combo.name, factors: combo.f, dirL: resL, dirT: resT, governing: gov };
  });
}
