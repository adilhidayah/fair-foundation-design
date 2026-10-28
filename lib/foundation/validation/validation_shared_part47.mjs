// Check-operand disclosure for anchor mechanism cards; ACI 318M-19 §§17.6 / 17.7.
// Known part19 hand vector: M16, pedestal 300, spacing 130, hef 300, Mz 5, Fx 4.
// No change to existing strengths, UC, load sharing or interaction.
import { anchorGroupCheck, computeAnchorCapacity, evaluateAnchorCombo } from '../index.js';
let pass = 0, fail = 0;
const near = (a, b) => Math.abs(a - b) < 1e-8;
function ok(name, c) { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'} ${name}`); }
const base = { shearAnchors:4, shearBasis:'Validation vector assumes equal sharing among four anchors', Bp: 300, Lp: 300, sx: 130, sz: 130, da: 16, Ase: 157, futa: 400, hef: 300, Abrg: 290, fc: 21.7, seismic: true, Mz: 5, Fx: 4 };
const r = anchorGroupCheck(base), mode = (res, key) => res.modeDetails.find(m => m.key === key);
ok('7 distinct group mechanisms', r.modeDetails.length === 7 && new Set(r.modeDetails.map(m => m.key)).size === 7);
// F = 5e6 * 65 / 130² = 19.230769 kN; φNsa = .75*157*400 = 47.1 kN.
ok('steel tension: 19.230769 / 47.1 kN per anchor', near(mode(r, 'steelN').demand, 19.23076923076923) && near(mode(r, 'steelN').capacity, 47.1));
// Two tensile anchors. Concrete factor sc*.phi = .75*.70 = .525.
ok('breakout tension: 38.461538 / 18.409967 kN group', near(mode(r, 'breakoutN').demand, 38.46153846153846) && near(mode(r, 'breakoutN').capacity, 18.409966730007955));
ok('pullout: .525*8*290*21.7 /1000 = 26.4306 kN', near(mode(r, 'pullout').capacity, 26.4306));
ok('side-face: group demand per loaded edge', mode(r, 'blowout').applicable && near(mode(r, 'blowout').demand, 38.46153846153846) && near(mode(r, 'blowout').capacity, 28.87554896447858));
ok('steel shear: V/4 = 1 kN, .65*.6*157*400 = 24.492 kN', near(mode(r, 'steelV').demand, 1) && near(mode(r, 'steelV').capacity, 24.492));
ok('concrete shear: front-row demand 4 kN', near(mode(r, 'breakoutV').demand, 4) && near(mode(r, 'breakoutV').capacity, 7.3819378036494685));
ok('pryout: total group demand 4 kN', near(mode(r, 'pryout').demand, 4) && near(mode(r, 'pryout').capacity, 64.97635316473396));
ok('disclosed ratios equal the existing seven UC values', r.modeDetails.every((m, i) => m.uc === [...r.tension, ...r.shear][i].uc && near(m.demand / m.capacity, m.uc)));
const grout = anchorGroupCheck({ ...base, groutPad: true });
ok('grout changes steel shear capacity to 19.5936 kN', near(mode(grout, 'steelV').capacity, 19.5936));
const short = anchorGroupCheck({ ...base, hef: 100 });
ok('side-face not required has no fictitious infinite capacity', mode(short, 'blowout').applicable === false && mode(short, 'blowout').capacity === null);
const zero = anchorGroupCheck({ ...base, P: 40, Mz: 0, Fx: 0 });
ok('zero tensile demand: breakout is NOT REQUIRED, no undefined 0/0 ratio', mode(zero, 'breakoutN').applicable===false && mode(zero, 'breakoutN').uc===0 && mode(zero, 'breakoutN').demand===0 && mode(zero, 'breakoutN').capacity===0);
const bars = [[-93.5,-93.5],[93.5,-93.5],[93.5,93.5],[-93.5,93.5]];
const reinforced = anchorGroupCheck({ ...base, shearAnchors:2, reinf: { bars, db: 13, fy: 420, topCover: 50 }, shearReinf: { type: 'ties', n: 2, db: 13, fy: 420, case: 2 } });
ok('reinforcement replaces concrete check without mixing load bases', near(mode(reinforced, 'reinfN').demand, 38.46153846153846) && near(mode(reinforced, 'reinfV').demand, 4));
const inadequate = anchorGroupCheck({ ...base, shearAnchors:2, hef: 100, reinf: { bars, db: 13, fy: 420, topCover: 50 }, shearReinf: { type: 'ties', n: 1, db: 10, fy: 420, case: 2 } });
ok('inadequate development: effective capacity zero, UC infinity', mode(inadequate, 'reinfN').capacity === 0 && mode(inadequate, 'reinfN').uc === Infinity);
ok('inadequate ties: effective capacity zero, UC infinity', mode(inadequate, 'reinfV').capacity === 0 && mode(inadequate, 'reinfV').uc === Infinity);
// Independent simple single-anchor vector: two anchors at ±.1 m, M=2 -> Tmax=10 kN; H=4 -> Hi=2 kN.
const cap = computeAnchorCapacity({ ca1: 100, da: 16, Ase: 100, futa: 400, hef: 100, Abrg: 100, fc: 25, lambda: 1, anchorType: 'cast-in', cracked: true, phiNsa: .75, phiNcb: .70, phiNpn: .70, phiVsa: .65, phiVcb: .70, phiVcp: .70 });
const single = evaluateAnchorCombo([{x:-.1,y:0},{x:.1,y:0}], 0, 4, 2, cap);
ok('single: six modes with separate φ strengths', single.modeDetails.length === 6);
ok('single steel tension 10 / 30 kN', near(mode(single, 'steelN').demand, 10) && near(mode(single, 'steelN').capacity, 30));
ok('single concrete tension 10 / 35 kN', near(mode(single, 'breakoutN').capacity, 35));
ok('single pullout 10 / 14 kN', near(mode(single, 'pullout').capacity, 14));
ok('single steel shear 2 / 15.6 kN', near(mode(single, 'steelV').demand, 2) && near(mode(single, 'steelV').capacity, 15.6));
ok('single governing mode matches the pre-existing aggregate checks', near(Math.max(...single.modeDetails.filter(m => m.key.endsWith('N') || m.key === 'pullout').map(m => m.uc)), single.checks[0].uc) && near(Math.max(...single.modeDetails.filter(m => ['steelV','breakoutV','pryout'].includes(m.key)).map(m => m.uc)), single.checks[1].uc));
console.log(`PART47: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
