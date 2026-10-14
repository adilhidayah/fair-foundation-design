// ==========================================================================
// FOUNDATION DRAWING — plan, section, pedestal section and footing reinforcement of one shallow foundation, from the results of
// tools/staad-stability.mjs (stability + footingDesignCheck + pedestalDesignCheck). Geometry in mm (model space, y up), written
// as DXF R12 (layers CONCRETE / REBAR / DIM / TEXT / AXIS / HIDDEN, for the drafter) and as SVG (for the report).
// Drawing only — no calculation; every size and bar comes from the result objects.
// ==========================================================================

const LAYERS = { CONCRETE: 7, REBAR: 1, DIM: 3, TEXT: 7, AXIS: 4, HIDDEN: 8, STEEL: 5 };   // DXF colour numbers
const TXT = 40, TXT_TITLE = 70;                                                            // text heights (mm, model)

function sheet() {
  const E = [];
  const api = {
    E,
    line(layer, x1, y1, x2, y2) { E.push({ t: 'line', layer, x1, y1, x2, y2 }); },
    rect(layer, x, y, w, h) { api.line(layer, x, y, x + w, y); api.line(layer, x + w, y, x + w, y + h); api.line(layer, x + w, y + h, x, y + h); api.line(layer, x, y + h, x, y); },
    circle(layer, x, y, r, fill = false) { E.push({ t: 'circle', layer, x, y, r, fill }); },
    text(layer, x, y, h, s, align = 'left') { E.push({ t: 'text', layer, x, y, h, s, align }); },
    // linear dimension between two points, offset `off` (perpendicular, to the left of p1 -> p2), text = value in mm or a label
    dim(x1, y1, x2, y2, off, label) {
      const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
      const a1 = [x1 + nx * off, y1 + ny * off], a2 = [x2 + nx * off, y2 + ny * off];
      api.line('DIM', x1 + nx * Math.sign(off) * 20, y1 + ny * Math.sign(off) * 20, a1[0] + nx * Math.sign(off) * 20, a1[1] + ny * Math.sign(off) * 20);
      api.line('DIM', x2 + nx * Math.sign(off) * 20, y2 + ny * Math.sign(off) * 20, a2[0] + nx * Math.sign(off) * 20, a2[1] + ny * Math.sign(off) * 20);
      api.line('DIM', a1[0], a1[1], a2[0], a2[1]);
      const tk = 25, ux = dx / L, uy = dy / L;                                   // architectural ticks
      [a1, a2].forEach(([x, y]) => api.line('DIM', x - (ux + nx) * tk / 1.4, y - (uy + ny) * tk / 1.4, x + (ux + nx) * tk / 1.4, y + (uy + ny) * tk / 1.4));
      const vertical = Math.abs(dx) < 1e-9;
      const tx = (a1[0] + a2[0]) / 2 + (vertical ? (off < 0 ? -15 : 15) : 0), ty = (a1[1] + a2[1]) / 2 + (vertical ? -TXT / 2 : (off > 0 ? 12 : -TXT - 12));
      E.push({ t: 'text', layer: 'DIM', x: tx, y: ty, h: TXT * 0.9, s: label ?? String(Math.round(L)), align: vertical ? (off < 0 ? 'right' : 'left') : 'center' });
    }
  };
  return api;
}

const r0 = (v) => Math.round(v);
const elv = (m) => (Math.abs(m) < 5e-4 ? '±0.000' : (m > 0 ? '+' : '−') + Math.abs(m).toFixed(3));

// Steel column outline in plan, relative to the column centroid (x = STAAD X, y = STAAD Z), mm.
// column = { name, shape: 'C' | 'L', h, b, tw, tf, cy, toe: '+Z' | '-Z' }
//   C: web along X (strong axis resists the arm moment), flanges toward `toe`; cy = centroid from the back of the web.
//   L (equal leg, BETA ANGLE in STAAD): legs along −X and +Z from the heel; cy = centroid from the back of each leg.
function columnOutline(c) {
  if (c.shape === 'L') {
    const L = c.h, t = c.tw, cy = c.cy;
    return [[0, 0], [-L, 0], [-L, t], [-t, t], [-t, L], [0, L]].map(([u, v]) => [u + cy, v - cy]);
  }
  const h = c.h, b = c.b, tw = c.tw, tf = c.tf, s = String(c.toe || '+Z').startsWith('-') ? -1 : 1;
  return [[-h / 2, 0], [h / 2, 0], [h / 2, b], [h / 2 - tf, b], [h / 2 - tf, tw], [-h / 2 + tf, tw], [-h / 2 + tf, b], [-h / 2, b]]
    .map(([u, v]) => [u, s * (v - c.cy)]);
}
// x-extent of the column seen in section A-A (along x) and the inner visible edges
function columnElevation(c) {
  if (c.shape === 'L') return { x1: -c.h + c.cy, x2: c.cy, inner: [c.cy - c.tw] };
  return { x1: -c.h / 2, x2: c.h / 2, inner: [] };
}

// foundation result r (staad-stability), drawing options: baseplate { B, L, t } (m, mm), bolts { n, dia, sx, sz } (mm)
export function buildFoundationDrawing(r, opts = {}) {
  const f = r.f, D = r.design, P = r.pedestal, sz = r.w.sizing;
  const S = sheet();
  const B = r.B * 1000, L = r.L * 1000, t = sz.Hf * 1000, Df = sz.Df * 1000, Dp = Df - t;
  const hasPed = f.type !== 'block';
  const Bp = hasPed ? f.Bp * 1000 : 0, Lp = hasPed ? f.Lp * 1000 : 0, Gp = hasPed ? (f.pedGp || 0) * 1000 : 0, gr = f.groutT || 0;
  const ox = hasPed ? (f.OffX || 0) * 1000 : 0, oz = hasPed ? (f.OffZ || 0) * 1000 : 0;
  const bp = opts.baseplate || f.baseplate || null, bolts = opts.bolts || f.bolts || null;
  const colm = opts.column || f.column || null;
  const cc = D ? D.cc : 75, dbF = D ? D.bar : 13;
  const AN = P && P.anchor ? P.anchor : null, AA = AN ? AN.A : null, AR = AN && AN.res ? AN.res.ar : null;   // anchors (ACI 318M-19 ch. 17) when checked
  const HPN = AN && AN.hairpin ? AN.hairpin : null;                                                       // hairpin anchor reinforcement (legs in plan, e, d_b)
  const hooked = !!(AA && AA.reinforcement) && !HPN;                                                      // pedestal bars = anchor reinforcement, 90° hook at the top
  const flex = D && D.flex ? Object.fromEntries(D.flex.map(c => [c.key, c])) : {};
  const barTxt = (c) => (c && c.required && c.s ? `D${dbF}-${c.s}` + (c.n ? ` (${c.n} bars)` : '') : null);
  const gap = 900;

  // ---------------- 1. PLAN (origin = footing centre; x = STAAD X, y = STAAD Z) ----------------
  S.rect('CONCRETE', -B / 2, -L / 2, B, L);
  if (hasPed) S.rect('CONCRETE', ox - Bp / 2, oz - Lp / 2, Bp, Lp);
  if (bp) S.rect('STEEL', ox - bp.B * 500, oz - bp.L * 500, bp.B * 1000, bp.L * 1000);
  if (bolts) [[-1, -1], [1, -1], [1, 1], [-1, 1]].slice(0, bolts.n || 4).forEach(([a, b]) => S.circle('STEEL', ox + a * bolts.sx / 2, oz + b * bolts.sz / 2, bolts.dia / 2 + 1.5));
  S.line('AXIS', ox, -L / 2 - 250, ox, L / 2 + 250); S.line('AXIS', -B / 2 - 250, oz, B / 2 + 250, oz);
  S.dim(-B / 2, -L / 2, B / 2, -L / 2, -200, `${r0(B)}`);
  S.dim(-B / 2, L / 2, -B / 2, -L / 2, -200, `${r0(L)}`);
  if (hasPed) {
    S.dim(ox - Bp / 2, L / 2, ox + Bp / 2, L / 2, 200, `${r0(Bp)}`);
    S.dim(B / 2, oz - Lp / 2, B / 2, oz + Lp / 2, -200, `${r0(Lp)}`);
  }
  if (bolts) S.text('TEXT', ox + Bp / 2 + 40, oz - Lp / 2 - 90, TXT, `${bolts.n || 4}-M${bolts.dia} @ ${bolts.sx}×${bolts.sz}`);
  if (bp) S.text('TEXT', ox + Bp / 2 + 40, oz + Lp / 2 + 40, TXT, `BP ${r0(bp.B * 1000)}×${r0(bp.L * 1000)}×${bp.t}`);
  if (colm) {
    const pts = columnOutline(colm);
    pts.forEach(([x, z], i) => { const [x2, z2] = pts[(i + 1) % pts.length]; S.line('STEEL', ox + x, oz + z, ox + x2, oz + z2); });
    S.text('TEXT', ox + Bp / 2 + 40, oz + Lp / 2 + 40 + TXT * 1.6, TXT, `COLUMN ${colm.name}`);
  }
  S.text('TEXT', 0, -L / 2 - 520, TXT_TITLE, `FOUNDATION PLAN — ${f.name}`, 'center');
  S.text('TEXT', 0, -L / 2 - 620, TXT, 'x = STAAD X, z = STAAD Z (pipe direction)', 'center');

  // ---------------- 2. SECTION along x (origin x = footing centre; y = 0 at FGL) ----------------
  const sx0 = B / 2 + gap + B / 2;
  const X = (x) => sx0 + x;
  S.line('CONCRETE', X(-B / 2 - 400), 0, X(B / 2 + 400), 0);                    // finished grade
  for (let x = -B / 2 - 400; x < B / 2 + 400; x += 120) S.line('HIDDEN', X(x), 0, X(x + 60), -60);
  S.rect('CONCRETE', X(-B / 2), -Df, B, t);
  if (hasPed) {
    S.rect('CONCRETE', X(ox - Bp / 2), -Dp, Bp, Dp + Gp);
    if (gr) S.rect('HIDDEN', X(ox - Bp / 2), Gp, Bp, gr);
    if (bp) S.rect('STEEL', X(ox - bp.B * 500), Gp + gr, bp.B * 1000, bp.t);
    const hef = AA ? AA.hef : null, tH = bolts ? 0.6 * bolts.dia : 0;
    if (bolts) [-1, 1].forEach(a => {
      const xb0 = ox + a * bolts.sx / 2, yBot = hef ? Gp - hef - tH : Gp - Math.min(Dp + Gp - 100, 400);
      S.line('STEEL', X(xb0), Gp + gr + (bp ? bp.t : 0) + 60, X(xb0), yBot + tH);
      if (hef) {                                                                // headed bolt, 35° breakout plane towards the pedestal face
        S.rect('STEEL', X(xb0 - 0.75 * bolts.dia), yBot, 1.5 * bolts.dia, tH);
        const xe = ox + a * Bp / 2, dxp = Math.abs(xe - xb0);
        S.line('HIDDEN', X(xb0), Gp - hef, X(xe), Gp - hef + dxp * Math.tan(35 * Math.PI / 180));
      }
    });
    if (bolts && hef) S.dim(X(ox - bolts.sx / 2), Gp, X(ox - bolts.sx / 2), Gp - hef, -140, `h_ef ${r0(hef)}`);
    if (HPN && AR) {
      const cov = AA.topCover ?? 50, yH = Gp - cov, yL = Gp - AR.legLen, e = HPN.a, db = HPN.db, rb = 2 * db;   // seen along z: the hairpins coincide
      [-1, 1].forEach(a => S.line('REBAR', X(ox + a * e), yH - rb, X(ox + a * e), yL));                         // legs of the hairpins
      S.line('REBAR', X(ox - e + rb), yH, X(ox + e - rb), yH);                                                  // top of the bend
      [-1, 1].forEach(a => S.line('REBAR', X(ox + a * e), yH - rb, X(ox + a * (e - rb)), yH));                  // 180° bend (chamfer symbol)
      S.dim(X(ox + e + 60), yH, X(ox + e + 60), yL, 220, `${r0(AR.legLen - cov)}`);
    }
    if (colm) {                                                                  // column stub with a break line
      const e = columnElevation(colm), y0 = Gp + gr + (bp ? bp.t : 0), y1 = y0 + 350, zz = 25;
      S.line('STEEL', X(ox + e.x1), y0, X(ox + e.x1), y1); S.line('STEEL', X(ox + e.x2), y0, X(ox + e.x2), y1);
      e.inner.forEach(x => S.line('STEEL', X(ox + x), y0, X(ox + x), y1));
      const xm = (e.x1 + e.x2) / 2;
      S.line('STEEL', X(ox + e.x1 - 20), y1, X(ox + xm - zz), y1); S.line('STEEL', X(ox + xm - zz), y1, X(ox + xm), y1 + zz);
      S.line('STEEL', X(ox + xm), y1 + zz, X(ox + xm), y1 - zz); S.line('STEEL', X(ox + xm), y1 - zz, X(ox + xm + zz), y1);
      S.line('STEEL', X(ox + xm + zz), y1, X(ox + e.x2 + 20), y1);
      S.text('TEXT', X(ox + e.x2 + 60), y0 + 200, TXT, `COLUMN ${colm.name}`);
    }
  }
  S.line('AXIS', X(ox), -Df - 200, X(ox), Gp + gr + (colm ? 620 : 400));
  // footing bars in section: bottom bars along x (line, hooks up), bars along z as dots; top bars if required
  const yb = -Df + cc + dbF / 2;
  S.line('REBAR', X(-B / 2 + cc), yb, X(B / 2 - cc), yb);
  [-1, 1].forEach(a => S.line('REBAR', X(a * (B / 2 - cc)), yb, X(a * (B / 2 - cc)), yb + Math.min(12 * dbF, t - 2 * cc)));
  // n bars evenly between the covers (count rounded up in the design, nominal spacing written as D13-s)
  const even = (c, len) => { const n = c?.n || 2, a0 = -len / 2 + cc + dbF / 2, a1 = len / 2 - cc - dbF / 2; return Array.from({ length: n }, (_, i) => a0 + i * (a1 - a0) / (n - 1)); };
  even(flex['z-bottom'], B).forEach(x => S.circle('REBAR', X(x), yb + dbF, dbF / 2, true));
  const topReq = flex['x-top']?.required || flex['z-top']?.required;
  if (topReq) {
    const yt = -Df + t - cc - dbF / 2;
    S.line('REBAR', X(-B / 2 + cc), yt, X(B / 2 - cc), yt);
    [-1, 1].forEach(a => S.line('REBAR', X(a * (B / 2 - cc)), yt, X(a * (B / 2 - cc)), yt - Math.min(12 * dbF, t - 2 * cc)));
  }
  // pedestal bars: vertical with 90° hook on the bottom mat; ties
  if (hasPed && P && P.pm && P.pm.found) {
    const dpr = P.dPrime, xb = [ox - Bp / 2 + dpr, ox + Bp / 2 - dpr], yTop = Gp - (hooked ? (AA.topCover ?? 50) : 40), yBot = yb + dbF + P.bar / 2;
    xb.forEach((x, i) => {
      S.line('REBAR', X(x), yBot, X(x), yTop); S.line('REBAR', X(x), yBot, X(x + (i ? 1 : -1) * 12 * P.bar), yBot);
      if (hooked) S.line('REBAR', X(x), yTop, X(x + (i ? -1 : 1) * 12 * P.bar), yTop);        // 90° hook into the core, tail 12 d_b
    });
    const tx1 = ox - Bp / 2 + (dpr - P.bar / 2 - P.tie / 2), tx2 = ox + Bp / 2 - (dpr - P.bar / 2 - P.tie / 2);
    const yTopT = P.topTies ? Gp - 125 : Gp - 40;                                // top 125 mm: the anchor-bolt ties
    for (let y = -Dp + 50; y < yTopT - 1e-6; y += P.tieS) S.line('REBAR', X(tx1), y, X(tx2), y);
    if (P.topTies) for (let i = 0; i < P.topTies.n; i++) { const y = Gp - 40 - i * (85 / Math.max(P.topTies.n - 1, 1)); S.line('REBAR', X(tx1), y, X(tx2), y); }
    S.text('TEXT', X(ox + Bp / 2 + 440), -Dp / 2, TXT, `${P.pm.n * 2} D${P.bar}`);
    S.text('TEXT', X(ox + Bp / 2 + 440), -Dp / 2 - 60, TXT, `Ø${P.tie}-${P.tieS}`);
    if (P.topTies) S.text('TEXT', X(ox + Bp / 2 + 440), Gp - 90, TXT, `${P.topTies.n} Ø${P.topTies.dia} within 125 (top)`);
    if (HPN && AR) {
      S.text('TEXT', X(ox + Bp / 2 + 440), -Dp / 2 - 140, TXT, `ANCHOR REINFORCEMENT (ACI 318M-19 17.5.2.1):`);
      S.text('TEXT', X(ox + Bp / 2 + 440), -Dp / 2 - 200, TXT, `${HPN.n} hairpin${HPN.n > 1 ? 's' : ''} Ø${HPN.db} (${HPN.legs.length} legs @ ±${HPN.a} × ±${HPN.b} mm), 180° bend at top`);
      S.text('TEXT', X(ox + Bp / 2 + 440), -Dp / 2 - 260, TXT, `legs ${r0(AR.legLen)} mm from top; l_dh ${r0(AR.ldh)} ≤ ${r0(AR.avail)}, l_d ${r0(AR.ld)} ≤ ${r0(AR.availLow)} mm`);
    }
    if (hooked) {
      S.text('TEXT', X(ox + Bp / 2 + 440), -Dp / 2 - 140, TXT, `ANCHOR REINFORCEMENT (ACI 318M-19 17.5.2.1):`);
      S.text('TEXT', X(ox + Bp / 2 + 440), -Dp / 2 - 200, TXT, `pedestal bars D${P.bar}, 90° hook at top, tail ${12 * P.bar} mm`);
      if (AR) S.text('TEXT', X(ox + Bp / 2 + 440), -Dp / 2 - 260, TXT, `${AR.n} × D${P.bar} within 0.5 h_ef of tension anchors; l_dh ${r0(AR.ldh)} ≤ ${r0(AR.avail)} mm above 35° plane`);
    }
  }
  if (barTxt(flex['x-bottom'])) S.text('TEXT', X(-B / 2 + 40), yb - TXT - 90, TXT, `${barTxt(flex['x-bottom'])} (B) both ways`);
  if (topReq) S.text('TEXT', X(-B / 2 + 40), -Df + t + 30, TXT, `${barTxt(flex['x-top']) || barTxt(flex['z-top'])} (T)`);
  // levels
  const lvl = (y, s, up = 0) => { S.line('DIM', X(B / 2 + 80), y, X(B / 2 + 520), y);
    if (up) S.line('DIM', X(B / 2 + 520), y, X(B / 2 + 560), y + up);
    S.text('DIM', X(B / 2 + (up ? 570 : 120)), y + 12 + up, TXT * 0.9, s); };
  lvl(0, `EL ${elv(0)} FGL`);
  lvl(-Df, `EL ${elv(-Df / 1000)} B.O. footing`);
  lvl(-Dp, `EL ${elv(-Dp / 1000)} T.O. footing`);
  if (hasPed) { lvl(Gp, `EL ${elv(Gp / 1000)} T.O. pedestal`); if (gr) lvl(Gp + gr, `EL ${elv((Gp + gr) / 1000)} B.O.B. plate`, 70); }
  S.dim(X(-B / 2), -Df, X(B / 2), -Df, -220, `${r0(B)}`);
  S.dim(X(-B / 2), -Dp, X(-B / 2), -Df, -200, `${r0(t)}`);
  if (hasPed) {
    S.dim(X(ox - Bp / 2), 0, X(ox - Bp / 2), -Dp, 360, `${r0(Dp)}`);
    if (Gp > 0) S.dim(X(ox - Bp / 2), Gp, X(ox - Bp / 2), 0, 360, `${r0(Gp)}`);
    const yPd = colm ? Gp + gr + (bp ? bp.t : 0) + 350 + 160 : Gp + gr + 250;   // above the column stub when drawn
    S.dim(X(ox - Bp / 2), yPd, X(ox + Bp / 2), yPd, 0, `${r0(Bp)}`);
  }
  S.text('TEXT', X(0), -Df - 520, TXT_TITLE, 'SECTION A-A (along x)', 'center');

  // ---------------- 3. PEDESTAL SECTION (bars + ties) ----------------
  const py0 = -L / 2 - 1300 - Lp / 2;
  if (hasPed && P && P.pm && P.pm.found) {
    const PX = (x) => x, PY = (y) => py0 + y, dpr = P.dPrime, n = P.pm.n;
    S.rect('CONCRETE', PX(-Bp / 2), PY(-Lp / 2), Bp, Lp);
    const c = (P.dPrime - P.bar / 2 - P.tie / 2);
    S.rect('REBAR', PX(-Bp / 2 + c), PY(-Lp / 2 + c), Bp - 2 * c, Lp - 2 * c);
    S.line('REBAR', PX(-Bp / 2 + c), PY(Lp / 2 - c - 70), PX(-Bp / 2 + c + 60), PY(Lp / 2 - c - 10));            // 135° hook mark
    for (const xs of [-Bp / 2 + dpr, Bp / 2 - dpr]) for (let i = 0; i < n; i++) {
      const z = n > 1 ? -Lp / 2 + dpr + i * (Lp - 2 * dpr) / (n - 1) : 0;
      S.circle('REBAR', PX(xs), PY(z), P.bar / 2, true);
    }
    S.dim(PX(-Bp / 2), PY(-Lp / 2), PX(Bp / 2), PY(-Lp / 2), -150, `${r0(Bp)}`);
    S.dim(PX(-Bp / 2), PY(Lp / 2), PX(-Bp / 2), PY(-Lp / 2), -150, `${r0(Lp)}`);
    S.text('TEXT', PX(Bp / 2 + 80), PY(40), TXT, `${n * 2} D${P.bar} (${n} per face ⟂ x)`);
    S.text('TEXT', PX(Bp / 2 + 80), PY(-30), TXT, `Ties Ø${P.tie}-${P.tieS}, ${P.legs} legs` + (P.topTies ? ` + ${P.topTies.n} Ø${P.topTies.dia} at top` : ''));
    if (P.topTies && bolts) [[-1, -1], [1, -1], [1, 1], [-1, 1]].slice(0, bolts.n || 4).forEach(([a, b]) => S.circle('STEEL', PX(a * bolts.sx / 2), PY(b * bolts.sz / 2), bolts.dia / 2));
    S.text('TEXT', PX(Bp / 2 + 80), PY(-100), TXT, `Clear cover ${r0(P.dPrime - P.bar / 2 - P.tie)} mm, ρ = ${(P.pm.rho * 100).toFixed(2)} %`);
    if (bolts) {
      S.dim(PX(-bolts.sx / 2), PY(Lp / 2), PX(bolts.sx / 2), PY(Lp / 2), 140, `${bolts.sx}`);
      S.text('TEXT', PX(Bp / 2 + 80), PY(-170), TXT, `${bolts.n || 4}-M${bolts.dia} @ ${bolts.sx}×${bolts.sz}, headed (h_ef ${AA ? r0(AA.hef) : '-'})`);
    }
    if (hooked) S.text('TEXT', PX(Bp / 2 + 80), PY(-240), TXT, `Bars: anchor reinf., hooked at top`);
    if (HPN) {
      HPN.legs.forEach(([u, v]) => S.circle('REBAR', PX(u), PY(v), HPN.db / 2, true));
      [-1, 1].slice(HPN.n > 1 ? 0 : 0, HPN.n > 1 ? 2 : 1).forEach(sg => S.line('REBAR', PX(-HPN.a), PY(sg * HPN.b), PX(HPN.a), PY(sg * HPN.b)));   // bends of the hairpins along x
      S.text('TEXT', PX(Bp / 2 + 80), PY(-240), TXT, `${HPN.n} hairpin${HPN.n > 1 ? 's' : ''} Ø${HPN.db}, legs @ ±${HPN.a} × ±${HPN.b} mm`);
    }
    S.text('TEXT', PX(0), PY(-Lp / 2 - 420), TXT_TITLE, 'PEDESTAL SECTION B-B', 'center');
  }

  // ---------------- 4. FOOTING REINFORCEMENT PLAN ----------------
  const fx0 = sx0, fy0 = Math.min(py0, -Df - 750 - L / 2);
  const FX = (x) => fx0 + x, FY = (y) => fy0 + y;
  S.rect('CONCRETE', FX(-B / 2), FY(-L / 2), B, L);
  if (hasPed) S.rect('HIDDEN', FX(ox - Bp / 2), FY(oz - Lp / 2), Bp, Lp);
  if (flex['x-bottom']?.s) even(flex['x-bottom'], L).forEach(z => S.line('REBAR', FX(-B / 2 + cc), FY(z), FX(B / 2 - cc), FY(z)));   // bars along x
  if (flex['z-bottom']?.s) even(flex['z-bottom'], B).forEach(x => S.line('REBAR', FX(x), FY(-L / 2 + cc), FX(x), FY(L / 2 - cc)));   // bars along z
  if (barTxt(flex['x-bottom'])) S.text('TEXT', FX(B / 2 + 80), FY(60), TXT, `${barTxt(flex['x-bottom'])} along x (B)`);
  if (barTxt(flex['z-bottom'])) S.text('TEXT', FX(B / 2 + 80), FY(-10), TXT, `${barTxt(flex['z-bottom'])} along z (B)`);
  if (topReq) S.text('TEXT', FX(B / 2 + 80), FY(-80), TXT, `Top: ${barTxt(flex['x-top']) || '-'} along x, ${barTxt(flex['z-top']) || '-'} along z`);
  S.text('TEXT', FX(B / 2 + 80), FY(-150), TXT, `Cover ${cc} mm, H = ${r0(t)} mm`);
  S.text('TEXT', FX(0), FY(-L / 2 - 420), TXT_TITLE, 'FOOTING REINFORCEMENT (bottom mat shown)', 'center');
  return S.E;
}

// ---------------- writers ----------------
function bounds(E) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  const add = (x, y) => { x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x); y2 = Math.max(y2, y); };
  E.forEach(e => {
    if (e.t === 'line') { add(e.x1, e.y1); add(e.x2, e.y2); }
    else if (e.t === 'circle') { add(e.x - e.r, e.y - e.r); add(e.x + e.r, e.y + e.r); }
    else { const w = e.s.length * e.h * 0.72; add(e.x - (e.align === 'center' ? w / 2 : e.align === 'right' ? w : 0), e.y); add(e.x + w, e.y + e.h); }
  });
  return { x1, y1, x2, y2 };
}

export function toDXF(E, title = 'FOUNDATION') {
  const o = [];
  const p = (c, v) => o.push(String(c), String(v));
  p(0, 'SECTION'); p(2, 'HEADER'); p(9, '$ACADVER'); p(1, 'AC1009'); p(9, '$INSUNITS'); p(70, 4); p(0, 'ENDSEC');
  p(0, 'SECTION'); p(2, 'TABLES');
  p(0, 'TABLE'); p(2, 'LTYPE'); p(70, 3);
  [['CONTINUOUS', 'Solid line', []], ['DASHED', 'Dashed __ __', [12.7, -6.35]], ['CENTER', 'Center ____ _ ____', [31.75, -6.35, 6.35, -6.35]]].forEach(([nm, ds, pat]) => {
    p(0, 'LTYPE'); p(2, nm); p(70, 0); p(3, ds); p(72, 65); p(73, pat.length); p(40, pat.reduce((a, b) => a + Math.abs(b), 0)); pat.forEach(v => p(49, v));
  });
  p(0, 'ENDTAB');
  p(0, 'TABLE'); p(2, 'LAYER'); p(70, Object.keys(LAYERS).length);
  Object.entries(LAYERS).forEach(([nm, col]) => { p(0, 'LAYER'); p(2, nm); p(70, 0); p(62, col); p(6, nm === 'AXIS' ? 'CENTER' : nm === 'HIDDEN' ? 'DASHED' : 'CONTINUOUS'); });
  p(0, 'ENDTAB');
  p(0, 'TABLE'); p(2, 'STYLE'); p(70, 1); p(0, 'STYLE'); p(2, 'STANDARD'); p(70, 0); p(40, 0); p(41, 1); p(50, 0); p(71, 0); p(42, 2.5); p(3, 'txt'); p(4, ''); p(0, 'ENDTAB');
  p(0, 'ENDSEC');
  p(0, 'SECTION'); p(2, 'ENTITIES');
  const f = (v) => (+v).toFixed(2);
  E.forEach(e => {
    if (e.t === 'line') { p(0, 'LINE'); p(8, e.layer); p(10, f(e.x1)); p(20, f(e.y1)); p(30, 0); p(11, f(e.x2)); p(21, f(e.y2)); p(31, 0); }
    else if (e.t === 'circle') {
      p(0, 'CIRCLE'); p(8, e.layer); p(10, f(e.x)); p(20, f(e.y)); p(30, 0); p(40, f(e.r));
      if (e.fill) { p(0, 'CIRCLE'); p(8, e.layer); p(10, f(e.x)); p(20, f(e.y)); p(30, 0); p(40, f(e.r / 2)); }
    } else {
      const h = e.align === 'center' ? 1 : e.align === 'right' ? 2 : 0;
      p(0, 'TEXT'); p(8, e.layer); p(10, f(e.x)); p(20, f(e.y)); p(30, 0); p(40, f(e.h)); p(1, e.s.replace(/[^\x20-\x7e]/g, c => ({ '±': '%%p', '×': 'x', '−': '-', 'Ø': '%%c', 'ρ': 'rho', '°': '%%d', '⟂': 'perp.', '—': '-' }[c] ?? '?')));
      if (h) { p(72, h); p(11, f(e.x)); p(21, f(e.y)); p(31, 0); }
    }
  });
  p(0, 'ENDSEC'); p(0, 'EOF');
  return o.join('\r\n') + '\r\n';
}

export function toSVG(E, title = '') {
  const b = bounds(E), m = 150, W = b.x2 - b.x1 + 2 * m, H = b.y2 - b.y1 + 2 * m;
  const X = (x) => (x - b.x1 + m).toFixed(1), Y = (y) => (b.y2 - y + m).toFixed(1);
  const col = { CONCRETE: '#222', REBAR: '#c0262d', DIM: '#1f7a3a', TEXT: '#222', AXIS: '#2b6cb0', HIDDEN: '#888', STEEL: '#1d4ed8' };
  const sw = { CONCRETE: 6, REBAR: 5, DIM: 2.5, AXIS: 2.5, HIDDEN: 3, STEEL: 4 };
  const dash = { AXIS: '60 15 10 15', HIDDEN: '25 15' };
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W.toFixed(0)} ${H.toFixed(0)}" width="${(W / 6).toFixed(0)}" height="${(H / 6).toFixed(0)}" style="background:#fff;font-family:Arial,sans-serif">`];
  if (title) out.push(`<title>${esc(title)}</title>`);
  E.forEach(e => {
    if (e.t === 'line') out.push(`<line x1="${X(e.x1)}" y1="${Y(e.y1)}" x2="${X(e.x2)}" y2="${Y(e.y2)}" stroke="${col[e.layer]}" stroke-width="${sw[e.layer] || 3}"${dash[e.layer] ? ` stroke-dasharray="${dash[e.layer]}"` : ''}/>`);
    else if (e.t === 'circle') out.push(`<circle cx="${X(e.x)}" cy="${Y(e.y)}" r="${e.r.toFixed(1)}" stroke="${col[e.layer]}" stroke-width="3" fill="${e.fill ? col[e.layer] : 'none'}"/>`);
    else out.push(`<text x="${X(e.x)}" y="${Y(e.y)}" font-size="${e.h.toFixed(0)}" fill="${col[e.layer]}" text-anchor="${e.align === 'center' ? 'middle' : e.align === 'right' ? 'end' : 'start'}">${esc(e.s)}</text>`);
  });
  out.push('</svg>');
  return out.join('\n');
}
