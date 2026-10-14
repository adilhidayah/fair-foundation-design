// VALIDATION part13 — autoSizeFooting(): smallest square B = L and thickness H on a 0.05 m grid, from synthetic checks
// with known thresholds (the solver has no engineering formula of its own; the UI supplies the real checks).
import { autoSizeFooting, autoSizeThickness } from '../shared/autoSizeFooting.js';
let pass = 0, fail = 0;
function ok(n, c, x = '') { if (c) { pass++; console.log('PASS ' + n + ' ' + x); } else { fail++; console.log('FAIL ' + n + ' ' + x); } }
const near = (a, b) => Math.abs(a - b) < 1e-9;

// Brute-force reference on the same grid: first H (shear), then first B (stability) — all thresholds monotone.
const grid = (lo, hi, step = 0.05) => { const out = []; for (let k = Math.ceil(lo / step - 1e-9); k * step <= hi + 1e-9; k++) out.push(+(k * step).toFixed(6)); return out; };

// 1. Independent thresholds: stability needs B >= 2.37, shear needs H >= 0.62 -> grid answer B 2.40, H 0.65
{
  const calls = [];
  const r = await autoSizeFooting({ Bmin: 1.0, Hmin: 0.3, Hmax: 2.0, Bmax: 8,
    evaluate: ({ B, H }) => { calls.push([B, H]); return { stabilityPass: B >= 2.37 - 1e-12, shearPass: H >= 0.62 - 1e-12 }; } });
  ok('independent: ok', r.ok === true);
  ok('independent: B = 2.40', near(r.B, 2.40), String(r.B));
  ok('independent: H = 0.65', near(r.H, 0.65), String(r.H));
  ok('independent: far fewer trials than the grid scan', r.evals < 40 && calls.length === r.evals, 'evals ' + r.evals);
  ok('independent: nothing smaller passes (B 2.35 fails)', !(2.35 >= 2.37) && !(0.60 >= 0.62));
}
// 2. Threshold exactly on a grid point is accepted (not pushed up): B >= 2.40, H >= 0.65
{
  const r = await autoSizeFooting({ Bmin: 1.0, evaluate: ({ B, H }) => ({ stabilityPass: B >= 2.40 - 1e-9, shearPass: H >= 0.65 - 1e-9 }) });
  ok('on-grid threshold: B 2.40, H 0.65', near(r.B, 2.40) && near(r.H, 0.65), `${r.B}, ${r.H}`);
}
// 3. Start values already pass -> returned unchanged after the minimum number of trials
{
  const r = await autoSizeFooting({ Bmin: 1.5, Hmin: 0.4, evaluate: () => ({ stabilityPass: true, shearPass: true }) });
  ok('already passing: B = Bmin, H = Hmin', r.ok && near(r.B, 1.5) && near(r.H, 0.4), `${r.B}, ${r.H}`);
}
// 4. Stability depends on H (weight helps): B needed = 4.0 - 1.0*H with H from shear = 0.80 -> B >= 3.20
{
  const r = await autoSizeFooting({ Bmin: 1.0, Hmin: 0.3, evaluate: ({ B, H }) => ({ stabilityPass: B >= 4.0 - 1.0 * H - 1e-9, shearPass: H >= 0.80 - 1e-9 }) });
  ok('B depends on H: B 3.20, H 0.80', r.ok && near(r.B, 3.20) && near(r.H, 0.80), `${r.B}, ${r.H}`);
}
// 5. Shear depends on B (Vu grows with B): H needed = 0.2*B -> converges with H raised in a later round
{
  const r = await autoSizeFooting({ Bmin: 1.0, Hmin: 0.3, Hmax: 3, evaluate: ({ B, H }) => ({ stabilityPass: B >= 3.0 - 1e-9, shearPass: H >= 0.2 * B - 1e-9 }) });
  ok('shear depends on B: B 3.00, H 0.60', r.ok && near(r.B, 3.00) && near(r.H, 0.60), `${r.B}, ${r.H}`);
}
// 6. Random monotone thresholds agree with the brute-force grid answer
{
  let allSame = true, n = 0;
  for (let i = 0; i < 200; i++) {
    const bReq = 0.6 + ((i * 37) % 700) / 100, hReq = 0.25 + ((i * 53) % 150) / 100; // 0.6-7.6 m, 0.25-1.75 m
    const r = await autoSizeFooting({ Bmin: 0.5, Bmax: 10, Hmin: 0.3, Hmax: 3,
      evaluate: ({ B, H }) => ({ stabilityPass: B >= bReq - 1e-9, shearPass: H >= hReq - 1e-9 }) });
    const refH = grid(0.3, 3).find(h => h >= hReq - 1e-9), refB = grid(0.5, 10).find(b => b >= bReq - 1e-9);
    n++;
    if (!(r.ok && near(r.B, refB) && near(r.H, refH))) { allSame = false; console.log('  mismatch', bReq, hReq, r.B, r.H, refB, refH); }
  }
  ok(`200 random thresholds match the brute-force grid (${n})`, allSame);
}
// 7. Failures: stability never passes, shear never passes, geometry never ok
{
  const a = await autoSizeFooting({ Bmin: 1, Bmax: 4, evaluate: () => ({ stabilityPass: false, shearPass: true }) });
  ok('stability impossible: not ok, reason names the limit', a.ok === false && a.failed.includes('stability') && /4\.00 m/.test(a.reason), a.reason);
  ok('stability impossible: B returned = Bmax', near(a.B, 4));
  const b = await autoSizeFooting({ Bmin: 1, Hmax: 1.5, evaluate: () => ({ stabilityPass: true, shearPass: false }) });
  ok('shear impossible: not ok, failed = shear', b.ok === false && b.failed.join() === 'shear' && /1\.50 m/.test(b.reason), b.reason);
  const c = await autoSizeFooting({ Bmin: 1, evaluate: () => ({ geometryOk: false, stabilityPass: true, shearPass: true }) });
  ok('geometry never ok: not ok', c.ok === false);
  const d = await autoSizeFooting({ Bmin: 5, Bmax: 3, evaluate: () => ({ stabilityPass: true, shearPass: true }) });
  ok('empty B range: not ok, failed = range', d.ok === false && d.failed.join() === 'range');
}
// 8. shearPass null = no shear check: only B is searched, H = Hmin
{
  let seenH = new Set();
  const r = await autoSizeFooting({ Bmin: 1, Hmin: 0.45, evaluate: ({ B, H }) => { seenH.add(H); return { stabilityPass: B >= 2.0 - 1e-9, shearPass: null }; } });
  ok('no shear check: H = Hmin, B 2.00', r.ok && near(r.H, 0.45) && near(r.B, 2.0), `${r.B}, ${r.H}`);
  ok('no shear check: H never varied', seenH.size === 1);
}
// 9. Trials are cached (an identical size is never evaluated twice) and results are multiples of the step
{
  const seen = new Map(); let dup = 0;
  const r = await autoSizeFooting({ Bmin: 1, step: 0.1, evaluate: ({ B, H }) => { const k = B + '|' + H; if (seen.has(k)) dup++; seen.set(k, 1); return { stabilityPass: B >= 2.34, shearPass: H >= 0.52 }; } });
  ok('cache: no duplicate trial', dup === 0, 'dup ' + dup);
  ok('step 0.1: B 2.40, H 0.60', near(r.B, 2.4) && near(r.H, 0.6), `${r.B}, ${r.H}`);
}
// 10. info of the answer is returned; async evaluate is awaited
{
  const r = await autoSizeFooting({ Bmin: 1, evaluate: async ({ B, H }) => { await Promise.resolve(); return { stabilityPass: B >= 1.5, shearPass: true, info: { B, H } }; } });
  ok('async evaluate + info of the answer', r.ok && r.info && near(r.info.B, r.B) && near(r.info.H, r.H));
}
// 11. autoSizeThickness (plan fixed): stability needs H >= 0.43 (weight), shear needs H >= 0.62 -> H 0.65
{
  const r = await autoSizeThickness({ evaluate: ({ H }) => ({ stabilityPass: H >= 0.43 - 1e-9, shearPass: H >= 0.62 - 1e-9 }) });
  ok('thickness only: H = 0.65', r.ok && near(r.H, 0.65), String(r.H));
  const r2 = await autoSizeThickness({ evaluate: ({ H }) => ({ stabilityPass: H >= 0.80 - 1e-9, shearPass: H >= 0.62 - 1e-9 }) });
  ok('thickness only: stability governs, H = 0.80', r2.ok && near(r2.H, 0.80), String(r2.H));
  const r3 = await autoSizeThickness({ Hmin: 0.45, evaluate: () => ({ stabilityPass: true, shearPass: null }) });
  ok('thickness only: already passing -> Hmin, 1 trial', r3.ok && near(r3.H, 0.45) && r3.evals === 1, `${r3.H}, ${r3.evals}`);
  // 200 random thresholds vs brute force
  let same = true;
  for (let i = 0; i < 200; i++) {
    const hs = 0.25 + ((i * 41) % 200) / 100, hv = 0.25 + ((i * 59) % 200) / 100; // 0.25-2.25 m
    const r = await autoSizeThickness({ Hmin: 0.3, Hmax: 3, evaluate: ({ H }) => ({ stabilityPass: H >= hs - 1e-9, shearPass: H >= hv - 1e-9 }) });
    const ref = grid(0.3, 3).find(h => h >= Math.max(hs, hv) - 1e-9);
    if (!(r.ok && near(r.H, ref))) { same = false; console.log('  mismatch', hs, hv, r.H, ref); }
  }
  ok('thickness only: 200 random thresholds match the brute-force grid', same);
  // stability never passes (plan too small): failed names it, H returned = Hmax
  const f1 = await autoSizeThickness({ Hmax: 1.2, evaluate: ({ H }) => ({ stabilityPass: false, shearPass: H >= 0.5 }) });
  ok('plan too small: failed = stability, H = Hmax', f1.ok === false && f1.failed.join() === 'stability' && near(f1.H, 1.2) && /stability/.test(f1.reason) && /1\.20 m/.test(f1.reason), f1.reason);
  const f2 = await autoSizeThickness({ Hmax: 0.5, evaluate: () => ({ stabilityPass: false, shearPass: false }) });
  ok('both fail at Hmax: failed = stability,shear', f2.failed.join() === 'stability,shear');
  const f3 = await autoSizeThickness({ Hmax: 0.2, Hmin: 0.3, evaluate: () => ({ stabilityPass: true, shearPass: true }) });
  ok('empty H range: failed = range', f3.ok === false && f3.failed.join() === 'range');
  const f4 = await autoSizeThickness({ evaluate: () => ({ geometryOk: false, stabilityPass: true, shearPass: true }) });
  ok('geometry never ok: failed includes geometry', f4.ok === false && f4.failed.includes('geometry'));
  // info of the answer; no duplicate trials
  let dup = 0; const seen = new Set();
  const g = await autoSizeThickness({ evaluate: ({ H }) => { if (seen.has(H)) dup++; seen.add(H); return { stabilityPass: H >= 1.0 - 1e-9, shearPass: true, info: H }; } });
  ok('thickness only: info of the answer, no duplicate trial', g.ok && near(g.info, g.H) && dup === 0, `dup ${dup}`);
}
console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
