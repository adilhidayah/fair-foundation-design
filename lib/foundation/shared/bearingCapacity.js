// ==========================================================================
// SHARED — BEARING CAPACITY (SOIL)
// Terzaghi (1943) or Meyerhof (1963) allowable bearing capacity, used by every
// equipment category. Pure functions: plain numbers in, plain objects out —
// no DOM access, no dependency on any other part of the app.
//
// Requires a runtime that supports JSON module import attributes (Chrome/Edge
// 123+, Node 22+) — true for any recent browser via a dev server, and for a
// bundler (Vite/Webpack/etc.) which handles `.json` imports natively either
// way. If you ever need broader/older-browser support, replace the import
// below with the JSON file's contents inlined as a plain JS object.
// ==========================================================================
import terzaghiTable from './bearingCapacityFactors.json' with { type: 'json' };

function interpTable(x, breakpoints, values) {
  if (x <= breakpoints[0]) return values[0];
  if (x >= breakpoints[breakpoints.length - 1]) return values[values.length - 1];
  for (let i = 0; i < breakpoints.length - 1; i++) {
    if (x >= breakpoints[i] && x <= breakpoints[i + 1]) {
      const t = (x - breakpoints[i]) / (breakpoints[i + 1] - breakpoints[i]);
      return values[i] + t * (values[i + 1] - values[i]);
    }
  }
  return values[values.length - 1];
}

export function terzaghiFactors(phiDeg) {
  const phiClamped = Math.max(0, Math.min(50, phiDeg));
  return {
    Nc: interpTable(phiClamped, terzaghiTable.phi, terzaghiTable.Nc),
    Nq: interpTable(phiClamped, terzaghiTable.phi, terzaghiTable.Nq),
    Ng: interpTable(phiClamped, terzaghiTable.phi, terzaghiTable.Ng),
    clamped: phiDeg !== phiClamped
  };
}

// Meyerhof (1963) bearing capacity factors — exact closed form.
export function meyerhofFactors(phiDeg) {
  if (phiDeg <= 0) return { Nc: 5.14, Nq: 1.0, Ng: 0.0 };
  const phi = phiDeg * Math.PI / 180;
  const Nq = Math.exp(Math.PI * Math.tan(phi)) * Math.pow(Math.tan(Math.PI/4 + phi/2), 2);
  const Nc = (Nq - 1) / Math.tan(phi);
  const Ng = (Nq - 1) * Math.tan(1.4 * phi);
  return { Nc, Nq, Ng };
}

export function terzaghiShapeFactors(shape, B, L) {
  if (shape === 'strip') return { sc: 1.0, sg: 1.0 };
  if (shape === 'square') return { sc: 1.3, sg: 0.8 };
  if (shape === 'circular') return { sc: 1.3, sg: 0.6 };
  const bl = L > 0 ? B / L : 0;
  return { sc: 1 + 0.3 * bl, sg: 1 - 0.2 * bl };
}

// Terzaghi (1943) or Meyerhof (1963) allowable bearing capacity.
export function bearingCapacityCheck({ c, phiDeg, gamma, shape, B, L, Df, method, FS, failure, beta }) {
  const q = gamma * Df;
  let qu, methodNote, detail;
  if (method === 'terzaghi') {
    const useC = (failure === 'local') ? (2/3) * c : c;
    const usePhi = (failure === 'local') ? Math.atan((2/3) * Math.tan(phiDeg * Math.PI/180)) * 180/Math.PI : phiDeg;
    const { Nc, Nq, Ng, clamped } = terzaghiFactors(usePhi);
    const { sc, sg } = terzaghiShapeFactors(shape, B, L);
    qu = useC * Nc * sc + q * Nq + 0.5 * gamma * B * Ng * sg;
    methodNote = `Terzaghi (1943), ${failure === 'local' ? 'local' : 'general'} shear failure`;
    detail = { type: 'terzaghi', failure, useC, usePhi, Nc, Nq, Ng, clamped, shape, sc, sg, q };
  } else {
    const { Nc, Nq, Ng } = meyerhofFactors(phiDeg);
    const phi = phiDeg * Math.PI / 180;
    const Kp = Math.pow(Math.tan(Math.PI/4 + phi/2), 2);
    const bl = shape === 'strip' ? 0 : B / L;
    const Fcs = 1 + 0.2 * Kp * bl;
    const Fqs = 1 + 0.1 * Kp * bl;
    const Fgs = Fqs;
    const sqrtKp = Math.sqrt(Kp);
    const Fcd = 1 + 0.2 * sqrtKp * (Df / B);
    const Fqd = 1 + 0.1 * sqrtKp * (Df / B);
    const Fgd = Fqd;
    const Fci = Math.pow(1 - beta/90, 2);
    const Fqi = Fci;
    const Fgi = (phiDeg > 0) ? Math.pow(Math.max(1 - beta/phiDeg, 0), 2) : (beta === 0 ? 1 : 0);
    qu = c*Nc*Fcs*Fcd*Fci + q*Nq*Fqs*Fqd*Fqi + 0.5*gamma*B*Ng*Fgs*Fgd*Fgi;
    methodNote = 'Meyerhof (1963), general bearing capacity equation';
    detail = { type: 'meyerhof', Nc, Nq, Ng, bl, Fcs, Fqs, Fcd, Fqd, Fci, Fgi, q, beta, Df, B };
  }
  const qa = qu / FS;
  return { qu, qa, methodNote, detail };
}
