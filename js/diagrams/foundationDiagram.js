import { fmt } from '../core/format.js?v=20261015e';

// Shallow foundation stability — plan + section with bearing pressure.
// Pure SVG string builder (no DOM access) — values in, markup out.
// opts (all optional, older calls keep the centred drawing):
//   OffX, OffZ — pedestal offset from the footing centre (m): the plan draws the pedestal there, with a dimension line;
//   Mx, Mz, P  — moments / load at the footing centroid: the resultant is plotted at (Mz/P, −Mx/P) — x right, z up — instead
//                of on the x axis only (app sign convention: Mz > 0 compresses +x, Mx > 0 compresses −z);
//   eccRatio   — allowable e/B (1/6, 1/4): the kern diamond 6ex/B + 6ez/L ≤ 1 (scaled) is drawn dashed.
// The section is cut in the direction of the larger offset (B / x if equal), pedestal at its offset, and the larger
// bearing pressure drawn on the side the resultant lies.
export function foundationDiagramSVG(B, L, Bp, Lp, t, hp, H, M, e, qmax, qmin, opts = {}) {
  const OffX = opts.OffX || 0, OffZ = opts.OffZ || 0;
  const hasRes = Number.isFinite(opts.P) && opts.P > 0 && (Number.isFinite(opts.Mx) || Number.isFinite(opts.Mz));
  const exR = hasRes ? (opts.Mz || 0) / opts.P : e, ezR = hasRes ? -(opts.Mx || 0) / opts.P : 0; // resultant (x, z)
  // ---- plan ----
  const planX0 = 20, planY0 = 25, planW = 280, planH = 170;
  const scaleP = Math.min((planW - 50) / Math.max(B, 0.01), (planH - 50) / Math.max(L, 0.01));
  const fW = B * scaleP, fH = L * scaleP;
  const pW = Math.min(Bp, B) * scaleP, pH = Math.min(Lp, L) * scaleP;
  const cx = planX0 + planW / 2, cy = planY0 + planH / 2;
  const fx = cx - fW / 2, fy = cy - fH / 2;
  const pcx = cx + OffX * scaleP, pcy = cy - OffZ * scaleP; // pedestal centre (z up on screen)
  const px = pcx - pW / 2, py = pcy - pH / 2;
  const rX = cx + exR * scaleP, rY = cy - ezR * scaleP;
  const f1 = (n) => n.toFixed(1);
  const hasOff = Math.abs(OffX) > 1e-9 || Math.abs(OffZ) > 1e-9;
  const kern = opts.eccRatio > 0
    ? `<polygon class="kern" points="${f1(cx + opts.eccRatio * B * scaleP)},${f1(cy)} ${f1(cx)},${f1(cy - opts.eccRatio * L * scaleP)} ${f1(cx - opts.eccRatio * B * scaleP)},${f1(cy)} ${f1(cx)},${f1(cy + opts.eccRatio * L * scaleP)}"/>
      <text class="dim-text kern-text" x="${f1(fx + 3)}" y="${f1(fy + fH - 4)}">kern e/B ≤ 1/${fmt(1 / opts.eccRatio, 0)}</text>` : '';
  const offDim = hasOff ? `<line class="dim" style="stroke-dasharray:3 2;" x1="${f1(cx)}" y1="${f1(cy)}" x2="${f1(pcx)}" y2="${f1(pcy)}"/>
      <circle cx="${f1(pcx)}" cy="${f1(pcy)}" r="2" fill="var(--accent)"/>
      <text class="dim-text" x="${f1(fx + 3)}" y="${f1(fy - 5)}">pedestal offset: Off X = ${fmt(OffX, 2)} m, Off Z = ${fmt(OffZ, 2)} m</text>` : '';
  const eccMarker = (Math.abs(exR) > 0.001 || Math.abs(ezR) > 0.001) ? `<circle cx="${f1(rX)}" cy="${f1(rY)}" r="3" fill="var(--fail)"/>
    <text class="load-text" x="${f1(rX + 5)}" y="${f1(rY - 5)}">e</text>` : '';
  // ---- section: in the direction of the larger offset ----
  const alongL = Math.abs(OffZ) > Math.abs(OffX);
  const W = alongL ? L : B, Wp = alongL ? Lp : Bp, off = alongL ? OffZ : OffX;
  const resSide = alongL ? ezR : exR; // > 0: resultant on the right (+x / +z) -> larger pressure on the right
  const secX0 = 340, secY0 = 25, secW = 300, secH = 170;
  const scaleS = Math.min((secW - 70) / Math.max(W, 0.01), (secH - 80) / Math.max(t + hp, 0.01));
  const sfW = W * scaleS, sfH = t * scaleS;
  const spW = Math.min(Wp, W) * scaleS, spH = hp * scaleS;
  const baseY = secY0 + secH - 30;
  const scx = secX0 + secW / 2;
  const sfx = scx - sfW / 2, sfy = baseY - sfH;
  const spcx = scx + off * scaleS; // pedestal / load point in the section
  const spx = spcx - spW / 2, spy = sfy - spH;
  const pScale = 28 / Math.max(qmax, 0.01);
  const qLeft = resSide < 0 ? qmax : Math.max(qmin, 0), qRight = resSide < 0 ? Math.max(qmin, 0) : qmax;
  const hLeft = qLeft * pScale, hRight = qRight * pScale;
  const hArrow = Math.abs(H) > 0.01 ? `<line class="load-line" x1="${f1(spcx)}" y1="${f1(spy - 24)}" x2="${f1(spcx + 22)}" y2="${f1(spy - 24)}" marker-end="url(#fdn-arrow-fail)"/>
    <text class="load-text" x="${f1(spcx + 25)}" y="${f1(spy - 19)}">H=${fmt(H, 0)}</text>` : '';
  const mText = Math.abs(M) > 0.01 ? `<text class="load-text" x="${f1(spcx + 5)}" y="${f1(spy - 34)}">M=${fmt(M, 0)}</text>` : '';
  const secOffDim = Math.abs(off) > 1e-9 ? `<line class="centerline" x1="${f1(scx)}" y1="${f1(sfy - 14)}" x2="${f1(scx)}" y2="${f1(baseY + 4)}"/>
    <text class="dim-text" x="${f1(scx + (off > 0 ? -4 : 4))}" y="${f1(sfy - 6)}" text-anchor="${off > 0 ? 'end' : 'start'}">footing ℄</text>` : '';
  return `<svg class="fdn-diagram" viewBox="0 0 660 220" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <marker id="fdn-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" fill="var(--line-strong)"/>
        </marker>
        <marker id="fdn-arrow-fail" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" fill="var(--fail)"/>
        </marker>
      </defs>
    <line class="divider" x1="330" y1="10" x2="330" y2="210"/>
    <text class="panel-title" x="${planX0}" y="16">Plan View</text>
    <text class="panel-title" x="${secX0}" y="16">Section (${alongL ? 'L direction, z →' : 'B direction, x →'})</text>
    <rect class="outline-footing" x="${f1(fx)}" y="${f1(fy)}" width="${f1(fW)}" height="${f1(fH)}"/>
    ${kern}
    <rect class="outline-pedestal" x="${f1(px)}" y="${f1(py)}" width="${f1(pW)}" height="${f1(pH)}"/>
    <line class="centerline" x1="${f1(cx)}" y1="${f1(fy - 8)}" x2="${f1(cx)}" y2="${f1(fy + fH + 8)}"/>
    <line class="centerline" x1="${f1(fx - 8)}" y1="${f1(cy)}" x2="${f1(fx + fW + 8)}" y2="${f1(cy)}"/>
    ${offDim}
    ${eccMarker}
    <line class="dim" x1="${f1(fx)}" y1="${f1(fy + fH + 14)}" x2="${f1(fx + fW)}" y2="${f1(fy + fH + 14)}"/>
    <text class="dim-text" x="${f1(cx)}" y="${f1(fy + fH + 27)}" text-anchor="middle">B = ${fmt(B, 2)} m</text>
    <line class="dim" x1="${f1(fx + fW + 14)}" y1="${f1(fy)}" x2="${f1(fx + fW + 14)}" y2="${f1(fy + fH)}"/>
    <text class="dim-text" x="${f1(fx + fW + 18)}" y="${f1(cy)}">L = ${fmt(L, 2)} m</text>
    <rect class="outline-footing" x="${f1(sfx)}" y="${f1(sfy)}" width="${f1(sfW)}" height="${f1(sfH)}"/>
    <rect class="outline-pedestal" x="${f1(spx)}" y="${f1(spy)}" width="${f1(spW)}" height="${f1(spH)}"/>
    ${secOffDim}
    <line class="load-line" x1="${f1(spcx)}" y1="${f1(spy - 24)}" x2="${f1(spcx)}" y2="${f1(spy)}" marker-end="url(#fdn-arrow-fail)"/>
    <text class="load-text" x="${f1(spcx - 14)}" y="${f1(spy - 4)}">P</text>
    ${hArrow}
    ${mText}
    <polygon class="pressure" points="${f1(sfx)},${f1(baseY)} ${f1(sfx)},${f1(baseY + hLeft)} ${f1(sfx + sfW)},${f1(baseY + hRight)} ${f1(sfx + sfW)},${f1(baseY)}"/>
    <text class="dim-text" x="${f1(sfx)}" y="${f1(baseY + hLeft + 12)}" text-anchor="middle">${fmt(qLeft, 0)}</text>
    <text class="dim-text" x="${f1(sfx + sfW)}" y="${f1(baseY + hRight + 12)}" text-anchor="middle">${fmt(qRight, 0)}</text>
    <text class="dim-text" x="${f1(scx)}" y="${f1(baseY + Math.max(hLeft, hRight) + 24)}" text-anchor="middle">Bearing pressure (kPa)</text>
  </svg>`;
}
