// VALIDATION part8 — pile group: layout (spacing/edge), Converse–Labarre efficiency, lateral p-multipliers,
// biaxial per-pile distribution (hand-calc)
import { pileLayoutCheck, pileGridInfo, pileGroupEfficiency, lateralPMultipliers, evaluatePileGroupCombo } from '../shared/pileGroup.js';
import { evaluatePileCombo } from '../shared/stabilityCheck.js';
let pass=0, fail=0;
function eq(n,g,e,t=1e-6){const o=Math.abs(g-e)<=t;if(o){pass++;console.log('PASS '+n+'='+g);}else{fail++;console.log('FAIL '+n+' got='+g+' exp='+e);}}
function ok(n,c,x=''){if(c){pass++;console.log('PASS '+n+' '+x);}else{fail++;console.log('FAIL '+n+' '+x);}}

// ---- Layout: 2x2 at (+-1, +-1.5), cap 3.4 x 4.6, D = 0.4 (limits in m: min 2D, warn spacing 3D, warn edge 1D)
const g22 = [{x:-1,y:-1.5},{x:1,y:-1.5},{x:-1,y:1.5},{x:1,y:1.5}];
const lim = { spacingMin: 0.8, spacingWarn: 1.2, edgeWarn: 0.4 };
const a = pileLayoutCheck(g22, 3.4, 4.6, lim);
eq('A s_min',a.spacing.actual,2.0,1e-9);            // x-direction gap 2.0 < y-direction gap 3.0
eq('A uc spacing',a.spacing.uc,0.8/2.0,1e-9);       // 0.8 / 2.0 = 0.4
ok('A spacing OK',a.spacing.status==='OK');
eq('A e_min',a.edge.actual,0.7,1e-9);               // min(3.4/2-1, 4.6/2-1.5) = min(0.7, 0.8)
ok('A edge OK + pass',a.edge.status==='OK' && a.overallPass===true);
// spacing 1.0 (between 2D and 3D) and edge 0.2 (< 1D) -> both WARNING but still pass
const b = pileLayoutCheck([{x:-0.5,y:0},{x:0.5,y:0}], 1.4, 1.0, lim);
eq('B s',b.spacing.actual,1.0,1e-9); eq('B e',b.edge.actual,0.2,1e-9);   // min(0.7-0.5, 0.5-0)=0.2
ok('B warnings',b.spacing.status==='WARNING' && b.edge.status==='WARNING' && b.overallPass===true && b.warnings.length===2);
// spacing 0.6 < 2D -> FAIL, uc = 0.8/0.6
const c = pileLayoutCheck([{x:-0.3,y:0},{x:0.3,y:0}], 3, 3, lim);
eq('C uc',c.spacing.uc,0.8/0.6,1e-9); ok('C FAIL',c.spacing.status==='FAIL' && c.overallPass===false);
// pile centre outside the cap -> edge FAIL regardless of warn limit
const d = pileLayoutCheck([{x:-1,y:0},{x:1,y:0}], 1.8, 3, { spacingMin: 0.8 });
eq('D e',d.edge.actual,-0.1,1e-9); ok('D outside FAIL',d.edge.status==='FAIL' && d.inside===false);
// nothing set -> NOT SET, never PASS
const e = pileLayoutCheck(g22, 3.4, 4.6, {});
ok('E NOT SET',e.spacing.status==='NOT SET' && e.edge.status==='NOT SET' && e.overallPass===false && e.notSet.length===2);
ok('F single pile spacing N/A',pileLayoutCheck([{x:0,y:0}],2,2,lim).spacing.status==='N/A');

// ---- Grid detection
ok('grid 2x2',pileGridInfo(g22).regular===true && pileGridInfo(g22).m===2 && pileGridInfo(g22).n===2);
ok('grid L-shape irregular',pileGridInfo([{x:0,y:0},{x:1,y:0},{x:0,y:1}]).regular===false);

// ---- Converse–Labarre: Eg = 1 - theta[(n-1)m+(m-1)n]/(90mn), theta = atan(D/s) deg
// 2x2, D=0.4, s=1.2 (3D): theta = 18.4349488, bracket = 4, 90mn = 360 -> Eg = 1 - 73.7397953/360
const s22 = [{x:-0.6,y:-0.6},{x:0.6,y:-0.6},{x:-0.6,y:0.6},{x:0.6,y:0.6}];
const e22 = pileGroupEfficiency({ piles: s22, D: 0.4, type: 'friction' });
eq('CL 2x2 theta',e22.thetaDeg,18.4349488,1e-6); eq('CL 2x2 Eg',e22.Eg,0.79516723,1e-6);
// 3x3, D=0.5, s=1.5 (3D): bracket = 12, 90mn = 810 -> Eg = 1 - 221.2193856/810 = 0.72689
const s33 = []; for (const x of [-1.5,0,1.5]) for (const y of [-1.5,0,1.5]) s33.push({x,y});
eq('CL 3x3 Eg',pileGroupEfficiency({ piles: s33, D: 0.5, type: 'friction' }).Eg,0.72689,1e-5);
ok('CL end-bearing = 1',pileGroupEfficiency({ piles: s22, D: 0.4, type: 'end' }).Eg===1);
// apply = false (user switch): Eg = 1, not applied, even for friction piles and a manual Eg < 1; default apply = true unchanged
const off = pileGroupEfficiency({ piles: s22, D: 0.4, type: 'friction', apply: false });
ok('Eg off -> 1, not applied', off.valid && off.Eg===1 && off.applied===false && off.method==='off');
ok('Eg off overrides manual Eg', pileGroupEfficiency({ piles: s22, D: 0.4, type: 'friction', manualEg: 0.7, apply: false }).Eg===1);
ok('Eg off still needs piles', pileGroupEfficiency({ piles: [], D: 0.4, apply: false }).valid===false);
eq('Eg default (apply omitted) unchanged', pileGroupEfficiency({ piles: s33, D: 0.5, type: 'friction' }).Eg, 0.72689, 1e-5);
const thr = pileGroupEfficiency({ piles: s22, D: 0.4, type: 'friction', sNoReduction: 1.2 });
ok('CL s >= threshold -> 1',thr.Eg===1 && thr.applied===false);
ok('CL s < threshold -> applied',pileGroupEfficiency({ piles: s22, D: 0.4, type: 'friction', sNoReduction: 1.5 }).applied===true);
const irr = pileGroupEfficiency({ piles: [{x:0,y:0},{x:1,y:0},{x:0,y:1}], D: 0.4, type: 'friction' });
ok('CL irregular -> Eg NaN',Number.isNaN(irr.Eg) && irr.applied===false);
eq('CL manual',pileGroupEfficiency({ piles: [{x:0,y:0},{x:1,y:0},{x:0,y:1}], D: 0.4, type: 'friction', manualEg: 0.85 }).Eg,0.85,1e-12);
ok('CL single pile',pileGroupEfficiency({ piles: [{x:0,y:0}], D: 0.4, type: 'friction' }).Eg===1);
ok('CL D<=0 invalid',pileGroupEfficiency({ piles: s22, D: 0, type: 'friction' }).valid===false);

// ---- Lateral p-multipliers (table 3D: 0.8/0.4/0.3, 5D: 1.0/0.85/0.7), D = 0.4, load along x
const at = (s, nx=2) => { const p=[]; for (let i=0;i<nx;i++) for (const y of [-1,1]) p.push({x:i*s,y}); return p; };
const l3 = lateralPMultipliers({ piles: at(1.2), D: 0.4, dir: 'x' });   // s = 3D
eq('Pm 3D row1',l3.rows[0].Pm,0.8,1e-12); eq('Pm 3D row2',l3.rows[1].Pm,0.4,1e-12);
eq('Pm 3D avg',l3.PmAvg,0.6,1e-12); eq('Pm 3D min',l3.PmMin,0.4,1e-12);
const l5 = lateralPMultipliers({ piles: at(2.0), D: 0.4, dir: 'x' });   // 5D
eq('Pm 5D avg',l5.PmAvg,0.925,1e-12); eq('Pm 5D min',l5.PmMin,0.85,1e-12);
const l4 = lateralPMultipliers({ piles: at(1.6), D: 0.4, dir: 'x' });   // 4D: 0.8+0.1=0.9, 0.4+0.225=0.625
eq('Pm 4D row1',l4.rows[0].Pm,0.9,1e-12); eq('Pm 4D row2',l4.rows[1].Pm,0.625,1e-12);
eq('Pm 4D avg',l4.PmAvg,0.7625,1e-12);
const l2 = lateralPMultipliers({ piles: at(0.8), D: 0.4, dir: 'x' });   // 2D: below table -> held at 3D values
ok('Pm 2D below range',l2.belowRange===true && Math.abs(l2.PmAvg-0.6)<1e-12);
const l6 = lateralPMultipliers({ piles: at(2.4), D: 0.4, dir: 'x' });   // 6D: clamped at 5D
eq('Pm 6D clamped',l6.PmAvg,0.925,1e-12);
const l33 = lateralPMultipliers({ piles: at(1.2, 3), D: 0.4, dir: 'x' }); // 3 rows at 3D: 0.8, 0.4, 0.3
eq('Pm 3 rows avg',l33.PmAvg,0.5,1e-12); eq('Pm 3 rows min',l33.PmMin,0.3,1e-12);
const l44 = lateralPMultipliers({ piles: at(1.2, 4), D: 0.4, dir: 'x' }); // row 4 uses the last (row 3+) value
eq('Pm 4 rows avg',l44.PmAvg,(0.8+0.4+0.3+0.3)/4,1e-12);
const l1 = lateralPMultipliers({ piles: at(1.2), D: 0.4, dir: 'z' });   // load along y: 2 rows of 2 (y = +-1) at 2.0 m = 5D
eq('Pm dir z',l1.PmAvg,0.925,1e-12);
const lrow = lateralPMultipliers({ piles: [{x:0,y:-1},{x:0,y:1}], D: 0.4, dir: 'x' });
ok('Pm single row',lrow.applied===false && lrow.PmAvg===1 && lrow.PmMin===1);
// unequal rows: 1 pile in one row, 3 in the other, 3D. Loaded toward +x the leading row is the 3-pile row.
const uneq = [{x:0,y:0},{x:1.2,y:-1},{x:1.2,y:0},{x:1.2,y:1}];
eq('Pm uneq lead=3-pile',lateralPMultipliers({ piles: uneq, D: 0.4, dir: 'x', sign: 1 }).PmAvg,(3*0.8+1*0.4)/4,1e-12);
eq('Pm uneq lead=1-pile',lateralPMultipliers({ piles: uneq, D: 0.4, dir: 'x', sign: -1 }).PmAvg,(1*0.8+3*0.4)/4,1e-12);
eq('Pm uneq worse of both',lateralPMultipliers({ piles: uneq, D: 0.4, dir: 'x' }).PmAvg,(1*0.8+3*0.4)/4,1e-12);

// ---- Biaxial distribution. 2x2 at (+-1, +-1.5): Sxx = 4, Syy = 9. P = 2000, Mz = 600 -> +-600/4 = +-150
const Qc=800, Qt=300, Ql=80;
const u = evaluatePileGroupCombo(g22, { P: 2000, Hx: 100, Hz: 0, Mx: 0, Mz: 600 }, { Qc, Qt, Ql });
eq('U Fmax',u.Fmax,650,1e-9); eq('U Fmin',u.Fmin,350,1e-9);   // 500 +- 150
ok('U max at pile 2 (1,-1.5)',u.FmaxPile.i===2 && u.FmaxPile.x===1 && u.FmaxPile.y===-1.5);
eq('U ucC',u.checks[0].uc,650/800,1e-9); eq('U ucT',u.checks[1].uc,0,1e-12);
eq('U Hi',u.Hi,25,1e-9); eq('U ucL',u.checks[2].uc,25/80,1e-9);
// same case through the legacy uniaxial function -> identical
const old = evaluatePileCombo(g22, 2000, 100, 600, Qc, Qt, Ql);
eq('U == legacy Fmax',u.Fmax,old.Fmax,1e-9); eq('U == legacy Fmin',u.Fmin,old.Fmin,1e-9);
eq('U == legacy ucL',u.checks[2].uc,old.checks[2].uc,1e-9);
// Mx = -300 (compression on +y): -Mx*dy/Syy = 300*(+-1.5)/9 = +-50 -> #1 300, #2 600, #3 400, #4 700
const bx = evaluatePileGroupCombo(g22, { P: 2000, Hx: 0, Hz: 0, Mx: -300, Mz: 600 }, { Qc, Qt, Ql });
eq('BX #1',bx.pileForces[0].F,300,1e-9); eq('BX #2',bx.pileForces[1].F,600,1e-9);
eq('BX #3',bx.pileForces[2].F,400,1e-9); eq('BX #4',bx.pileForces[3].F,700,1e-9);
ok('BX max #4 / min #1',bx.FmaxPile.i===4 && bx.FminPile.i===1);
// uplift + group efficiency: P = 400 -> #1 = 100-150-50 = -100, #4 = 100+150+50 = 300; Eg = 0.8 -> Qc 640, Qt 240
const up = evaluatePileGroupCombo(g22, { P: 400, Hx: 0, Hz: 0, Mx: -300, Mz: 600 }, { Qc, Qt, Ql }, { Eg: 0.8 });
eq('UP Fmin',up.Fmin,-100,1e-9); eq('UP ucT',up.checks[1].uc,100/240,1e-9);
eq('UP ucC',up.checks[0].uc,300/640,1e-9); ok('UP governing',up.governingCheck.name==='Compression');
// lateral biaxial: Hx = 90, Hz = 120 -> Hix = 22.5, Hiz = 30, Hi = 37.5 (Pm = 1)
const lb = evaluatePileGroupCombo(g22, { P: 2000, Hx: 90, Hz: 120, Mx: 0, Mz: 0 }, { Qc, Qt, Ql });
eq('LB Hi',lb.Hi,37.5,1e-9); eq('LB ucL',lb.checks[2].uc,37.5/80,1e-9);
// with Pm: x 0.4 (min) / 0.6 (avg), z 0.8 / 0.9
const latX = { PmAvg: 0.6, PmMin: 0.4 }, latZ = { PmAvg: 0.9, PmMin: 0.8 };
const lg = evaluatePileGroupCombo(g22, { P: 2000, Hx: 90, Hz: 120, Mx: 0, Mz: 0 }, { Qc, Qt, Ql }, { latX, latZ });
eq('LG ucx',lg.ucLx,22.5/(0.4*80),1e-9); eq('LG ucz',lg.ucLz,30/(0.8*80),1e-9);
eq('LG ucL governing-Pm',lg.checks[2].uc,0.845051,1e-5);   // sqrt(0.703125^2 + 0.46875^2)
const la = evaluatePileGroupCombo(g22, { P: 2000, Hx: 90, Hz: 120, Mx: 0, Mz: 0 }, { Qc, Qt, Ql }, { latX, latZ, lateralMethod: 'average' });
eq('LA ucL average-Pm',la.checks[2].uc,0.627174,1e-5);     // sqrt(0.46875^2 + 0.416667^2)
// ---- Eccentricity + torsion. 2x2 at (+-1, +-1.5): J = 4(1 + 2.25) = 13
// Hx = 100 acting at y = 0.5 above the centroid line: T = a_y*Hx = 50; Vx = 25 + 50*dy/13, Vz = -50*dx/13
const tq = evaluatePileGroupCombo(g22, { P: 0, Hx: 100, Hz: 0, Mx: 0, Mz: 0, at: { x: 0, y: 0.5 } }, { Qc, Qt, Ql });
eq('TQ T',tq.T,50,1e-9); eq('TQ J',tq.J,13,1e-9);
eq('TQ #1 Vx',tq.latPiles[0].Vx,25-50*1.5/13,1e-9);            // 19.23077
eq('TQ #1 Vz',tq.latPiles[0].Vz,50/13,1e-9);                   // +3.84615
eq('TQ #4 Vx',tq.latPiles[3].Vx,25+50*1.5/13,1e-9);            // 30.76923
eq('TQ #4 Vz',tq.latPiles[3].Vz,-50/13,1e-9);
eq('TQ sum Vx',tq.latPiles.reduce((s,p)=>s+p.Vx,0),100,1e-9);  // equilibrium
eq('TQ sum Vz',tq.latPiles.reduce((s,p)=>s+p.Vz,0),0,1e-9);
eq('TQ moment balance',tq.latPiles.reduce((s,p)=>s+p.y*p.Vx-p.x*p.Vz,0),50,1e-9);
eq('TQ Vmax',tq.Vmax,Math.sqrt(162500)/13,1e-9);               // 31.00869, first of the two tied piles
ok('TQ Vmax pile #3',tq.VmaxPile.i===3);
eq('TQ ucL',tq.checks[2].uc,31.00869/80,1e-6);
ok('TQ worse than H/n alone',tq.checks[2].uc>25/80);
// pure torque Mt = 130: Vx = 130*dy/13 = +-15, Vz = -130*dx/13 = -+10 -> V = sqrt(325) for every pile
const mt = evaluatePileGroupCombo(g22, { P: 0, Mt: 130 }, { Qc, Qt, Ql });
eq('MT V',mt.Vmax,Math.sqrt(325),1e-9); eq('MT ucL',mt.checks[2].uc,Math.sqrt(325)/80,1e-9);
// Hz = 100 at x = 0.5: T = -a_x*Hz = -50 -> Vx = -50*dy/13, Vz = 25 + 50*dx/13 (+x piles take more)
const hz = evaluatePileGroupCombo(g22, { P: 0, Hz: 100, at: { x: 0.5, y: 0 } }, { Qc, Qt, Ql });
eq('HZ T',hz.T,-50,1e-9); eq('HZ #2 Vz',hz.latPiles[1].Vz,25+50/13,1e-9); eq('HZ #1 Vx',hz.latPiles[0].Vx,50*1.5/13,1e-9);
// two piles on a line (0,+-1), Hx = 100 at y = 0.5: lever rule -> 75 / 25
const ln = evaluatePileGroupCombo(line2(), { P: 0, Hx: 100, at: { x: 0, y: 0.5 } }, { Qc, Qt, Ql });
eq('LN near pile',ln.latPiles[1].Vx,75,1e-9); eq('LN far pile',ln.latPiles[0].Vx,25,1e-9);
// single pile: torsion cannot be distributed, flagged
const sg = evaluatePileGroupCombo([{x:0,y:0}], { P: 0, Hx: 100, at: { x: 0, y: 0.5 } }, { Qc, Qt, Ql });
ok('single pile torsionIgnored',sg.valid===true && sg.torsionIgnored===true && Math.abs(sg.latPiles[0].Vx-100)<1e-9);
// ... but an eccentric P on a single pile is a real moment the axial model cannot carry -> invalid, not silently ignored
ok('single pile eccentric P invalid',evaluatePileGroupCombo([{x:0,y:0}], { P: 100, at: { x: 0, y: 0.5 } }, { Qc, Qt, Ql }).valid===false);
// vertical load acting off-centre: P = 2000 at x = 0.5 -> Mz,c = 1000 -> F = 500 +- 1000/4
const ev = evaluatePileGroupCombo(g22, { P: 2000, at: { x: 0.5, y: 0 } }, { Qc, Qt, Ql });
eq('EV Mzc',ev.Mzc,1000,1e-9); eq('EV Fmax',ev.Fmax,750,1e-9); eq('EV Fmin',ev.Fmin,250,1e-9);
// eccentric pile group: piles (0,0),(2,0), P = 200 straight above pile 1 -> pile 1 carries all of it
const asym = evaluatePileGroupCombo([{x:0,y:0},{x:2,y:0}], { P: 200 }, { Qc: 1000, Qt, Ql });
eq('ASYM F1',asym.pileForces[0].F,200,1e-9); eq('ASYM F2',asym.pileForces[1].F,0,1e-9);
function line2() { return [{x:0,y:-1},{x:0,y:1}]; }

// invalid: piles on one line cannot resist the moment; Qt = 0 with uplift -> infinite UC
const line = [{x:0,y:-1},{x:0,y:1}];
ok('line + Mz invalid',evaluatePileGroupCombo(line, { P: 100, Mz: 50 }, { Qc, Qt, Ql }).valid===false);
ok('line + Mx valid',evaluatePileGroupCombo(line, { P: 100, Mx: 50 }, { Qc, Qt, Ql }).valid===true);
ok('Qt=0 uplift -> Infinity',evaluatePileGroupCombo(g22, { P: 400, Mz: 600 }, { Qc, Qt: 0, Ql }).checks[1].uc===Infinity);
ok('bad Eg invalid',evaluatePileGroupCombo(g22, { P: 100 }, { Qc, Qt, Ql }, { Eg: 1.2 }).valid===false);
console.log(`PART8: ${pass} pass, ${fail} fail`);
process.exit(fail>0?1:0);
