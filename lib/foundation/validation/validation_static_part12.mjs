// VALIDATION part12 — foundation geometry consistency (pedestal inside footing, Df >= Hf with a pedestal / Df >= 0 without, pile embedment)
import { foundationGeometryCheck } from '../static/foundationSizing.js';
let pass=0, fail=0;
function ok(n,c,x=''){if(c){pass++;console.log('PASS '+n+' '+x);}else{fail++;console.log('FAIL '+n+' '+x);}}
const codes = (r) => r.issues.map(i => i.code).join(',');
const base = { Bf: 2.4, Lf: 2.4, Hf: 0.4, Df: 1.0 };

ok('plain footing passes', foundationGeometryCheck(base).overallPass);
ok('centred pedestal 1.25 passes', foundationGeometryCheck({ ...base, hasPed: true, Bp: 1.25, Lp: 1.25 }).overallPass);
// flush: |0.575| + 1.25/2 = 1.2 = Bf/2 -> allowed
ok('flush pedestal edge allowed', foundationGeometryCheck({ ...base, hasPed: true, Bp: 1.25, Lp: 1.25, OffX: 0.575 }).overallPass);
// 0.6 + 0.625 = 1.225 > 1.2 -> pedX, 0.025 m out
const px = foundationGeometryCheck({ ...base, hasPed: true, Bp: 1.25, Lp: 1.25, OffX: -0.6 });
ok('offset x out', codes(px) === 'pedX', codes(px));
ok('offset x amount 0.025', /0\.025 m beyond/.test(px.issues[0].text), px.issues[0].text);
const pz = foundationGeometryCheck({ ...base, hasPed: true, Bp: 1.0, Lp: 1.0, OffZ: 0.8 });
ok('offset z out', codes(pz) === 'pedZ', codes(pz));
ok('pedestal wider than footing', codes(foundationGeometryCheck({ ...base, hasPed: true, Bp: 3.0, Lp: 1.0 })) === 'pedX');
ok('both directions out', codes(foundationGeometryCheck({ ...base, hasPed: true, Bp: 3.0, Lp: 3.0 })) === 'pedX,pedZ');
ok('pedestal ignored without pedestal', foundationGeometryCheck({ ...base, hasPed: false, Bp: 9, Lp: 9, OffX: 5 }).overallPass);
// with a pedestal the footing may project too (Hf - Df = 0.1); the pedestal top Gp must not be below the footing top
ok('Df < Hf with pedestal, Gp 0.275 ok', foundationGeometryCheck({ ...base, Df: 0.3, hasPed: true, Bp: 1, Lp: 1, Gp: 0.275 }).overallPass);
ok('Df < Hf with pedestal, Gp 0.05 < 0.1', codes(foundationGeometryCheck({ ...base, Df: 0.3, hasPed: true, Bp: 1, Lp: 1, Gp: 0.05 })) === 'pedHeight');
ok('Gp = projection (flush tops) ok', foundationGeometryCheck({ ...base, Df: 0.3, hasPed: true, Bp: 1, Lp: 1, Gp: 0.1 }).overallPass);
ok('Df < 0 with pedestal', codes(foundationGeometryCheck({ ...base, Df: -0.1, hasPed: true, Bp: 1, Lp: 1, Gp: 1 })) === 'depth');
ok('Df < Hf without pedestal allowed (projects)', foundationGeometryCheck({ ...base, Df: 0.3 }).overallPass);
ok('Df = 0 without pedestal allowed (on grade)', foundationGeometryCheck({ ...base, Df: 0 }).overallPass);
ok('Df < 0 without pedestal (floating)', codes(foundationGeometryCheck({ ...base, Df: -0.1 })) === 'depth');
ok('zero size', codes(foundationGeometryCheck({ ...base, Bf: 0 })).startsWith('size'));
ok('zero pedestal size', codes(foundationGeometryCheck({ ...base, hasPed: true, Bp: 0, Lp: 1 })).startsWith('pedSize'));
ok('pile embed 0.1 < 0.4 ok', foundationGeometryCheck({ ...base, isPile: true, hEmbed: 0.1 }).overallPass);
ok('pile embed = Hf fails', codes(foundationGeometryCheck({ ...base, isPile: true, hEmbed: 0.4 })) === 'embed');
ok('pile embed ignored for shallow', foundationGeometryCheck({ ...base, isPile: false, hEmbed: 0.9 }).overallPass);
console.log(`PART12: ${pass} pass, ${fail} fail`);
process.exit(fail>0?1:0);
