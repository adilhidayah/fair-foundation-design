// VALIDATION part15 — wind force generator, ASCE 7-22 Chapter 29 force method (windForceASCE722).
// Hand-calc vectors worked independently in US units (z in ft, V in mph, qz = 0.00256·Kz·Kzt·Ke·V² psf,
// 1 psf = 47.880 Pa) against the library's SI path, so the ft -> m conversion of Table 26.11-1 is checked too.
import { WIND_EXPOSURE, groundElevationFactor, windForceASCE722 } from '../index.js';
let pass = 0, fail = 0;
function ok(n, c, x = '') { if (c) { pass++; console.log('PASS ' + n + ' ' + x); } else { fail++; console.log('FAIL ' + n + ' ' + x); } }
const rel = (a, b, tol) => Math.abs(a - b) <= tol * Math.abs(b);
const base = { V: 45, exposure: 'C', z: 6, Kzt: 1.0, Kd: 0.90, Ke: 1.0, G: 0.85, Cf: 1.2, h: 3, Asx: 8, Asz: 8 };

// ---- 1. Table 26.11-1 constants (ft -> m) ----
ok('B: alpha 7.5, zg 3280 ft, zmin 30 ft', WIND_EXPOSURE.B.alpha === 7.5 && rel(WIND_EXPOSURE.B.zg, 999.744, 1e-9) && rel(WIND_EXPOSURE.B.zmin, 9.144, 1e-9));
ok('C: alpha 9.8, zg 2460 ft, zmin 15 ft', WIND_EXPOSURE.C.alpha === 9.8 && rel(WIND_EXPOSURE.C.zg, 749.808, 1e-9) && rel(WIND_EXPOSURE.C.zmin, 4.572, 1e-9));
ok('D: alpha 11.5, zg 1935 ft, zmin 7 ft', WIND_EXPOSURE.D.alpha === 11.5 && rel(WIND_EXPOSURE.D.zg, 589.788, 1e-9) && rel(WIND_EXPOSURE.D.zmin, 2.1336, 1e-9));

// ---- 2. Kz = 2.41·(z/zg)^(2/α), z raised to zmin ----
const kz = (exposure, z) => windForceASCE722({ ...base, exposure, z }).Kz;
ok('Kz C, z 6 m = 0.899702', rel(kz('C', 6), 0.899702, 1e-5), kz('C', 6));
ok('Kz B, z 6 m (< zmin 9.14) = Kz at 30 ft = 0.689207', rel(kz('B', 6), 0.689207, 1e-5), kz('B', 6));
ok('Kz B, z 20 m = 0.849157', rel(kz('B', 20), 0.849157, 1e-5), kz('B', 20));
ok('Kz D, z 1.5 m (< zmin 2.13) = 0.906555', rel(kz('D', 1.5), 0.906555, 1e-5), kz('D', 1.5));
ok('Kz C, z 30 m = 1.249528', rel(kz('C', 30), 1.249528, 1e-5), kz('C', 30));
ok('Kz at zg = 2.41 (all exposures)', ['B', 'C', 'D'].every(e => rel(kz(e, WIND_EXPOSURE[e].zg), 2.41, 1e-12)));
ok('z reported = zmin when below it', rel(windForceASCE722({ ...base, exposure: 'B', z: 3 }).z, 9.144, 1e-12));
// Table 26.10-1 spot values unchanged from ASCE 7-16 (C 15 ft 0.85, 30 ft 0.98, 60 ft 1.13), table rounding 0.01
ok('Kz C 15 ft ~ 0.85', Math.abs(kz('C', 15 * 0.3048) - 0.85) <= 0.006, kz('C', 15 * 0.3048));
ok('Kz C 30 ft ~ 0.98', Math.abs(kz('C', 30 * 0.3048) - 0.98) <= 0.006, kz('C', 30 * 0.3048));
ok('Kz C 60 ft ~ 1.13', Math.abs(kz('C', 60 * 0.3048) - 1.13) <= 0.006, kz('C', 60 * 0.3048));

// ---- 3. qz (Eq. 26.10-1, no Kd) and F = qz·Kd·G·Cf·Af (Eq. 29.4-1) ----
// Default popup data: qz = 1117.449 Pa, F = 8.2065 kN, M = 24.6196 kN·m (US-unit hand calc; 0.613 vs 0.00256·47.88/0.44704² = 0.6133)
const r1 = windForceASCE722(base);
ok('vector 1 qz = 1117.45 Pa', rel(r1.qz, 1117.449, 1e-3), r1.qz);
ok('vector 1 Fx = 8.2065 kN', rel(r1.Fx, 8.2065, 1e-3), r1.Fx);
ok('vector 1 Mz = 24.620 kN·m', rel(r1.Mz, 24.6196, 1e-3), r1.Mz);
ok('vector 1 Fz = Fx (Asx = Asz)', rel(r1.Fz, r1.Fx, 1e-12) && rel(r1.Mx, r1.Mz, 1e-12));
ok('qz independent of Kd', rel(windForceASCE722({ ...base, Kd: 0.85 }).qz, r1.qz, 1e-12));
ok('F proportional to Kd', rel(windForceASCE722({ ...base, Kd: 0.45 }).Fx, r1.Fx / 2, 1e-12));
ok('Ke omitted -> 1.0', rel(windForceASCE722({ ...base, Ke: undefined }).qz, r1.qz, 1e-12));

// Vector 2: B, z 6 m (zmin), Kzt 1.1, Kd 0.85, ze 500 m -> Ke 0.942236, G 0.85, Cf 0.8, Asx 12.5, Asz 5, h 4.2
// qz = 887.218 Pa, Fx = 6.4102 kN, Mz = 26.9226 kN·m; Fz = Fx·5/12.5
ok('Ke at ze 500 m = 0.942236', rel(groundElevationFactor(500), 0.942236, 1e-6), groundElevationFactor(500));
ok('Ke at sea level = 1', groundElevationFactor(0) === 1 && groundElevationFactor(-10) === 1);
const r2 = windForceASCE722({ V: 45, exposure: 'B', z: 6, Kzt: 1.1, Kd: 0.85, Ke: groundElevationFactor(500), G: 0.85, Cf: 0.8, h: 4.2, Asx: 12.5, Asz: 5 });
ok('vector 2 qz = 887.22 Pa', rel(r2.qz, 887.218, 1e-3), r2.qz);
ok('vector 2 Fx = 6.4102 kN', rel(r2.Fx, 6.4102, 1e-3), r2.Fx);
ok('vector 2 Mz = 26.923 kN·m', rel(r2.Mz, 26.9226, 1e-3), r2.Mz);
ok('vector 2 Fz = 2.5641 kN, Mx = Fz·h', rel(r2.Fz, 6.4102 * 5 / 12.5, 1e-3) && rel(r2.Mx, r2.Fz * 4.2, 1e-12), r2.Fz);

console.log(`\npart15: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
