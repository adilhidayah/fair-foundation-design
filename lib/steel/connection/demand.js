// ==========================================================================
// STEEL CONNECTION — required strength (demand) by design mode
// The mode is a project decision (asked to the user, recorded in the connection config), not chosen by the library.
//   analysis   : forces from the analysis load combinations as given (ASD or LRFD)
//   omega0     : forces from overstrength combinations (ASCE 7-22 §12.4.3, E = Ω0·QE) supplied by the caller,
//                e.g. collectors / roof bracing (ASCE 7-22 §12.10.2.1)
//   ocbf-brace : OCBF diagonal brace connection, AISC 341-16 F1.6a — tension: lesser of the expected brace yield
//                RyFyAg (LRFD; /1.5 ASD) and the overstrength load effect
//   omf-moment : OMF FR beam-to-column connection, AISC 341-16 E1.6b — flexure: lesser of 1.1RyMp/αs and the
//                overstrength load effect; shear: 2(1.1RyMp/αs)/Lh + gravity shear, or the overstrength load effect
// αs = 1.0 (LRFD) / 1.5 (ASD), AISC 341-16 B3.1.
// Units: kN, kN·m, mm, MPa.
// ==========================================================================

export const DEMAND_MODES = {
  analysis: 'Forces from the analysis load combinations',
  omega0: 'Forces from the overstrength load combinations (ASCE 7-22 §12.4.3)',
  'ocbf-brace': 'OCBF brace connection, AISC 341-16 F1.6a',
  'omf-moment': 'OMF beam-to-column moment connection, AISC 341-16 E1.6b',
};

const lesser = (a, b) => (b == null ? a : Math.min(a, Math.abs(b)));
// The seismic requirement is in addition to the non-seismic load combinations (AISC 341-16 A1 / B2): the connection
// demand is never lower than the analysis (e.g. wind) demand. 26-10-2026: before this, ocbf-brace / omf-moment / omega0
// returned only the seismic value (CCO Shelter: OCBF T 3.75 kN overstrength < 5.36 kN wind).
const atLeast = (seis, ana) => Math.max(Math.abs(seis || 0), Math.abs(ana || 0));

// analysis = { P, V, M, T } (absolute governing values), omega0 = same keys from the overstrength combinations (optional)
// member = { Ag (mm²), Z (mm³), Fy, Ry } of the brace / beam framing in, Lh (mm) = distance between plastic hinges, Vgrav (kN)
export function connectionDemand({ mode = 'analysis', method = 'ASD', analysis = {}, omega0 = null, member = {} }) {
  const as = method === 'LRFD' ? 1.0 : 1.5;
  const notes = [];
  if (mode === 'analysis') return { ...analysis, mode, source: DEMAND_MODES.analysis, notes };
  if (mode === 'omega0') {
    if (!omega0) throw new Error('omega0 mode needs the overstrength forces');
    const out = { ...omega0 };
    for (const k of ['T', 'C', 'V', 'M', 'P', 'H']) if (omega0[k] != null || analysis[k] != null) out[k] = atLeast(omega0[k], analysis[k]);
    notes.push('demand = max(overstrength, analysis) per force (AISC 341-16 A1)');
    return { ...out, mode, source: DEMAND_MODES.omega0, notes };
  }
  if (mode === 'ocbf-brace') {
    if (!(member.Ag && member.Fy && member.Ry)) throw new Error('ocbf-brace needs member Ag, Fy, Ry');
    const Pexp = member.Ry * member.Fy * member.Ag / 1000 / as;
    const Tseis = lesser(Pexp, omega0 && omega0.T);
    const T = atLeast(Tseis, analysis.T);
    notes.push(`expected brace yield RyFyAg/αs = ${member.Ry}·${member.Fy}·${member.Ag.toFixed(0)}/${as} = ${Pexp.toFixed(2)} kN`);
    if (omega0 && omega0.T != null) notes.push(`overstrength load effect ${Math.abs(omega0.T).toFixed(2)} kN; lesser governs`);
    if (T > Tseis) notes.push(`analysis tension ${Math.abs(analysis.T).toFixed(2)} kN > seismic requirement ${Tseis.toFixed(2)} kN; analysis governs`);
    // compression: not lower than the analysis / overstrength compression (verify AISC 341-16 F1.6a(2) for the project)
    const C = Math.max(Math.abs(analysis.C || 0), Math.abs((omega0 && omega0.C) || 0));
    notes.push('compression demand = max(analysis, overstrength) compression; verify AISC 341-16 F1.6a(2)');
    return { T, C, V: analysis.V || 0, mode, source: DEMAND_MODES['ocbf-brace'], notes, Pexp };
  }
  if (mode === 'omf-moment') {
    if (!(member.Z && member.Fy && member.Ry)) throw new Error('omf-moment needs member Z, Fy, Ry');
    const Mexp = 1.1 * member.Ry * member.Fy * member.Z / 1e6 / as;
    const M = atLeast(lesser(Mexp, omega0 && omega0.M), analysis.M);
    notes.push(`1.1RyMp/αs = 1.1·${member.Ry}·${member.Fy}·${member.Z.toFixed(0)}/${as} = ${Mexp.toFixed(2)} kN·m`);
    if (omega0 && omega0.M != null) notes.push(`overstrength moment ${Math.abs(omega0.M).toFixed(2)} kN·m; lesser governs, not below analysis`);
    let V = analysis.V || 0;
    if (member.Lh) {
      const Vexp = 2 * Mexp / (member.Lh / 1000) + (member.Vgrav || 0);
      V = atLeast(lesser(Vexp, omega0 && omega0.V), analysis.V);
      notes.push(`shear 2·1.1RyMp/(αs·Lh) + Vgrav = ${Vexp.toFixed(2)} kN (Lh ${member.Lh} mm)`);
    }
    const P = atLeast(omega0 && omega0.P, analysis.P);
    return { M, V, P, mode, source: DEMAND_MODES['omf-moment'], notes, Mexp };
  }
  throw new Error('unknown demand mode ' + mode);
}
