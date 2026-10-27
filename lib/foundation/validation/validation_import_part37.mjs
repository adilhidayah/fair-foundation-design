// VALIDATION part37 — STAAD support reactions per combination -> the app's load model (staadReactionCombos, Tab 03 "Import STAAD").
// The import writes five unit load types (FY, FX, FZ, MX, MZ typed in the STAAD sign mode) whose combination factors are the reactions.
// Checked: the vectors the app builds from them (staadReactionToFair -> buildComboBase -> stdComboVector) equal the CLI's
// reactionToFoundationLoad + kD·ΔW for every combination (P, Fx, Fz, Mx, Mz and the transfer to the underside), kD from REPEAT LOAD,
// temporary = a Wind / Seismic case in the combination, the LAST reaction table of the .ANL, units, node choice, missing combinations.
import { staadReactionCombos, staadReactionToFair, buildComboBase, stdComboVector, reactionToFoundationLoad, parseStaadReactions } from '../index.js';
let pass = 0, fail = 0;
function ok(n, c, x = '') { if (c) { pass++; console.log('PASS ' + n + ' ' + x); } else { fail++; console.log('FAIL ' + n + ' ' + x); } }
const near = (a, b, tol) => Math.abs(a - b) <= tol;

const std = ['LOAD 3 LOADTYPE Dead TITLE D', 'JOINT LOAD', '1 FY -1', 'LOAD 5 LOADTYPE Live TITLE L', 'JOINT LOAD', '1 FY -1', 'LOAD 9 LOADTYPE Wind TITLE WX', 'JOINT LOAD', '1 FX 1',
  'LOAD 11 LOADTYPE Seismic-H TITLE EQ', 'JOINT LOAD', '1 FX 1',
  'LOAD 101 D+L', 'REPEAT LOAD', '3 1 5 1', 'LOAD 102 D+0.6W', 'REPEAT LOAD', '3 1 9 0.6', 'LOAD 103 0.6D+0.7E', 'REPEAT LOAD', '3 0.6 11 0.7',
  'LOAD 104 NESTED', 'REPEAT LOAD', '102 1.5', 'LOAD 301 1.2D+1.6L', 'REPEAT LOAD', '3 1.2 5 1.6', ''].join('\n');
const hdr = ['   SUPPORT REACTIONS -UNIT KN   METE    STRUCTURE TYPE = SPACE', '   -----------------', ' JOINT  LOAD   FORCE-X   FORCE-Y   FORCE-Z     MOM-X     MOM-Y     MOM Z'];
const R = { 101: [0.3, 9.0, -0.2, 0.1, 0.02, 0.3], 102: [-0.6, 9.5, 0.2, 0.4, 0.01, 0.8], 103: [-1.2, 5.1, 0.4, -0.3, 0, 1.1], 104: [-0.9, 14.2, 0.3, 0.6, 0, 1.2], 301: [0.4, 12.9, -0.3, 0.2, 0, 0.4] };
const row = (first, n, lc, r) => `${first ? `${String(n).padStart(7)}  ` : '         '}${lc} ${r.map(v => v.toFixed(2).padStart(10)).join('')}`;
const table = (scale) => [...hdr, ...Object.entries(R).map(([lc, r], i) => row(i === 0, 1, lc, r.map(v => v * scale))), ...Object.entries(R).map(([lc, r], i) => row(i === 0, 7, lc, r.map(v => -v)))];
const anl = [...table(5), '', ...table(1), ''].join('\n');   // first analysis different: the last table counts

const r = staadReactionCombos({ std, anl, lcAsd: '101 TO 104', lcLrfd: '301-302' });
ok('import ok: node 1 by default (nodes 1, 7), dead case 3', r.ok && r.node === 1 && JSON.stringify(r.nodes) === '[1,7]' && r.dead === 3);
ok('4 ASD + 1 LRFD combinations, 302 reported missing', r.lc.length === 4 && r.lrfd.length === 1 && JSON.stringify(r.missing.lrfd) === '[302]');
ok('the LAST reaction table is used (LC 101 FY = 9.0, not 45)', r.lc[0].f.FY === 9 && r.lc[0].f.FX === 0.3);
ok('kD from REPEAT LOAD: 1, 1, 0.6, and 1.5 through a nested combination', r.lc.map(c => c.kD).join(',') === '1,1,0.6,1.5' && r.lrfd[0].kD === 1.2);
ok('temporary = Wind / Seismic case in the combination (102 W, 103 E, 104 via 102), TMP factor 1', r.lc.map(c => c.temporary).join(',') === 'false,true,true,true' && r.lc[1].f.TMP === 1 && r.lc[0].f.TMP === undefined);
ok('lc numbers are strings (app combination rows)', r.lc.every(c => typeof c.lc === 'string'));

// ---- the app's vectors = the CLI's loads for every combination ----
const dh = 1.25, dW = 7.07;
const items = r.loadTypes.map(lt => {
  const raw = { P: lt.values.P || 0, H: lt.values.H || 0, M: lt.values.M || 0, Hz: lt.values.Hz || 0, Mx: lt.values.Mx || 0 };
  return { code: lt.code, kind: lt.kind, ...(staadReactionToFair(lt.kind, raw) || raw) };   // STAAD sign mode of Tab 03
});
const base = buildComboBase(items, dh, dW).base;
const reac = parseStaadReactions(anl).reactions;
let worst = 0;
for (const c of [...r.lc, ...r.lrfd]) {
  const v = stdComboVector(c.f, base), cl = reactionToFoundationLoad(reac[`1:${c.lc}`]);
  const P = cl.P + c.kD * dW, Mz = cl.Mz + cl.Fx * dh, Mx = cl.Mx - cl.Fz * dh;
  worst = Math.max(worst, Math.abs(v.P + v.dP - P), Math.abs(v.Fx - cl.Fx), Math.abs(v.Fz - cl.Fz), Math.abs(v.Mz + v.dMz - Mz), Math.abs(v.Mx + v.dMx - Mx), Math.abs(v.Mz - cl.Mz), Math.abs(v.Mx - cl.Mx));
}
ok('app vectors (top and underside) = CLI reactionToFoundationLoad + kD·ΔW, M + H·Δh for all 5 combinations', worst < 1e-9, worst.toExponential(2));
const v101 = stdComboVector(r.lc[0].f, base);
ok('LC 101 by hand: P = FY = 9.0, Fx = −FX = −0.3, Fz = −FZ = 0.2, Mx = MX = 0.1, Mz = MZ = 0.3; underside P = 9 + 7.07', near(v101.P, 9, 1e-12) && near(v101.Fx, -0.3, 1e-12) && near(v101.Fz, 0.2, 1e-12) && near(v101.Mx, 0.1, 1e-12) && near(v101.Mz, 0.3, 1e-12) && near(v101.P + v101.dP, 16.07, 1e-12));
ok('the TMP marker carries no load', ['P', 'Fx', 'Fz', 'Mx', 'Mz', 'dP', 'dMx', 'dMz'].every(k => base.TMP[k] === 0));

// ---- node choice, units, errors ----
const r7 = staadReactionCombos({ std, anl, node: 7, lcAsd: '101' });
ok('node 7: its own reactions (FY = −9.0)', r7.ok && r7.lc[0].f.FY === -9);
ok('unknown node -> error listing the nodes', !staadReactionCombos({ std, anl, node: 5, lcAsd: '101' }).ok);
ok('KIP / FEET reactions -> error asking for KN / METER', /KN \/ METER/.test(staadReactionCombos({ std, anl: anl.replace(/KN   METE/g, 'KIP  FEET'), lcAsd: '101' }).error || ''));
ok('no reaction table -> error', !staadReactionCombos({ std, anl: 'nothing', lcAsd: '101' }).ok);
ok('a bad list item -> error', !staadReactionCombos({ std, anl, lcAsd: '101-x' }).ok);
console.log(`\nPASS ${pass}  FAIL ${fail}`); process.exit(fail ? 1 : 0);
