// VALIDATION — shared modules vs hand-calculation
// Run: node validation_shared.mjs  (Node 22+ for JSON import attribute)
import { terzaghiFactors, meyerhofFactors, terzaghiShapeFactors, bearingCapacityCheck } from '../shared/bearingCapacity.js';
import { defaultCombos, combineLoadCombo } from '../shared/loadCombinations.js';
import { evaluateFoundationCombo, evaluatePileCombo } from '../shared/stabilityCheck.js';
import { phiMnAtP, computeGoverningCa1, computeAnchorCapacity, evaluateAnchorCombo, searchPedestalBars } from '../shared/pedestalCheck.js';
import { oneWayShearCheck, twoWayShearCheck, pileCapMoment, flexuralDesign } from '../shared/footingCheck.js';
import { correctSPT, phiFromSPT, cuFromSPT, esFromSPT, soilDefaults } from '../shared/soilProperties.js';
import { elasticSettlement, consolidationSettlement, settlementCheck } from '../shared/settlementCheck.js';

let pass = 0, fail = 0;
function eq(name, got, exp, tol = 1e-6) {
  const ok = Math.abs(got - exp) <= tol;
  if (ok) { pass++; console.log('PASS ' + name + ' got=' + got); }
  else { fail++; console.log('FAIL ' + name + ' got=' + got + ' exp=' + exp); }
}
function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log('PASS ' + name + ' ' + extra); }
  else { fail++; console.log('FAIL ' + name + ' ' + extra); }
}

// --- Terzaghi table exact ---
let t = terzaghiFactors(25);
eq('terz25.Nc', t.Nc, 25.1, 1e-9); eq('terz25.Nq', t.Nq, 12.72, 1e-9); eq('terz25.Ng', t.Ng, 9.7, 1e-9);
// interpolation phi=27.5
t = terzaghiFactors(27.5);
eq('terz27.5.Nc', t.Nc, 31.15, 1e-9); eq('terz27.5.Nq', t.Nq, 17.59, 1e-9); eq('terz27.5.Ng', t.Ng, 14.7, 1e-9);
// clamp
t = terzaghiFactors(60); ok('terz clamp', t.clamped === true && t.Nc === 347.5, JSON.stringify(t));
// Meyerhof phi=0
let m = meyerhofFactors(0); ok('meyer0', m.Nc === 5.14 && m.Nq === 1.0 && m.Ng === 0.0);
// Meyerhof phi=30 vs Das textbook ~ (18.4, 30.1, 15.7)
m = meyerhofFactors(30);
eq('meyer30.Nq', m.Nq, 18.4, 0.05); eq('meyer30.Nc', m.Nc, 30.14, 0.08); eq('meyer30.Ng', m.Ng, 15.67, 0.08);
// shape factors
let s = terzaghiShapeFactors('square'); ok('shape sq', s.sc === 1.3 && s.sg === 0.8);
s = terzaghiShapeFactors('strip'); ok('shape strip', s.sc === 1.0 && s.sg === 1.0);
s = terzaghiShapeFactors('rect', 2, 5); eq('shape rect sc', s.sc, 1.12, 1e-9); eq('shape rect sg', s.sg, 0.92, 1e-9);
// bearing hand-calc: c=10 phi25 gamma18 sq B2 L2 Df1.5 FS3 general
let b = bearingCapacityCheck({ c: 10, phiDeg: 25, gamma: 18, shape: 'square', B: 2, L: 2, Df: 1.5, method: 'terzaghi', FS: 3, failure: 'general', beta: 0 });
eq('bearing qu', b.qu, 809.42, 0.02); eq('bearing qa', b.qa, 269.8067, 0.02);
// local shear uses 2/3 c and reduced phi
b = bearingCapacityCheck({ c: 20, phiDeg: 30, gamma: 18, shape: 'square', B: 2, L: 2, Df: 1.5, method: 'terzaghi', FS: 3, failure: 'local', beta: 0 });
eq('local useC', b.detail.useC, 40 / 3, 1e-9);
ok('local usePhi<30', b.detail.usePhi < 30 && b.detail.usePhi > 20, 'usePhi=' + b.detail.usePhi);
