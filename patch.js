const fs = require('fs');
const path = require('path');
// The two SVG diagram modules this script maintains (moved out of app.js into js/diagrams/).
const FILES = {
  foundationDiagramSVG: path.join(__dirname, 'js', 'diagrams', 'foundationDiagram.js'),
  foundSizeDiagramSVG: path.join(__dirname, 'js', 'diagrams', 'foundSizeDiagram.js'),
};
for (const [fnName, path] of Object.entries(FILES)) {
let content = fs.readFileSync(path, 'utf8');
const origLen = content.length;
let changed = false;
function log(m) { console.log('[' + fnName + '] ' + m); }

// 1) planHtml axes patch (idempotent) — foundSize diagram uses fsize-arrow
const axesMarker = '(pcx+fW/2 + 25)';
if (content.includes(axesMarker) || content.includes('Coordinate Axes')) {
  log("planHtml axes: already patched, skipping");
} else {
  const oldAxesPattern = /<line class="centerline" x1="\$\{pcx\.toFixed\(1\)\}" y1="\$\{\(ffy-8\)\.toFixed\(1\)\}" x2="\$\{pcx\.toFixed\(1\)\}" y2="\$\{\(ffy\+fL\+8\)\.toFixed\(1\)\}"\/>\s*<line class="centerline" x1="\$\{\(ffx-8\)\.toFixed\(1\)\}" y1="\$\{pcy\.toFixed\(1\)\}" x2="\$\{\(ffx\+fW\+8\)\.toFixed\(1\)\}" y2="\$\{pcy\.toFixed\(1\)\}"\/>/;
  const axesReplacement = `<line class="centerline" x1="\${(pcx-fW/2 - 10).toFixed(1)}" y1="\${pcy.toFixed(1)}" x2="\${(pcx+fW/2 + 20).toFixed(1)}" y2="\${pcy.toFixed(1)}" marker-end="url(#fsize-arrow)"/>
      <text class="dim-text" x="\${(pcx+fW/2 + 25).toFixed(1)}" y="\${(pcy+4).toFixed(1)}">x</text>
      <!-- Z-axis (North/Up) -->
      <line class="centerline" x1="\${pcx.toFixed(1)}" y1="\${(pcy+fL/2 + 10).toFixed(1)}" x2="\${pcx.toFixed(1)}" y2="\${(pcy-fL/2 - 20).toFixed(1)}" marker-end="url(#fsize-arrow)"/>
      <text class="dim-text" x="\${(pcx+4).toFixed(1)}" y="\${(pcy-fL/2 - 20).toFixed(1)}">z</text>
      <circle cx="\${pcx.toFixed(1)}" cy="\${pcy.toFixed(1)}" r="3" fill="var(--accent)"/>
      <text class="dim-text" x="\${(pcx+5).toFixed(1)}" y="\${(pcy-5).toFixed(1)}">(0,0)</text>`;
  if (oldAxesPattern.test(content)) {
    content = content.replace(oldAxesPattern, axesReplacement);
    changed = true;
    log("planHtml axes: applied");
  } else {
    log("planHtml axes: old block not found, skipping");
  }
}

// 2) SVG marker defs (idempotent, unique ids per diagram)
//    foundationDiagramSVG -> fdn-arrow + fdn-arrow-fail
//    foundSizeDiagramSVG  -> fsize-arrow (unique, avoids duplicate-id clash)
const WANT = {
  foundationDiagramSVG: { ids: ['fdn-arrow', 'fdn-arrow-fail'], fail: true },
  foundSizeDiagramSVG: { ids: ['fsize-arrow'], fail: false },
};
function markerDef(id, colorVar) {
  return '        <marker id="' + id + '" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">\n'
    + '          <path d="M0,0 L8,4 L0,8 z" fill="var(' + colorVar + ')"/>\n'
    + '        </marker>';
}
function ensureSingleHeader(funcName) {
  const want = WANT[funcName];
  const funcIdx = content.indexOf('function ' + funcName);
  if (funcIdx < 0) { log(funcName + ": function not found"); return; }
  const retIdx = content.indexOf('return `<svg class="fdn-diagram" viewBox="0 0 660 220"', funcIdx);
  if (retIdx < 0) { log(funcName + ": 660 header not found"); return; }
  const divIdx = content.indexOf('<line class="divider"', retIdx);
  if (divIdx < 0) { log(funcName + ": divider not found"); return; }
  const headerBlock = content.slice(retIdx, divIdx);
  const defsCount = (headerBlock.match(/<defs>/g) || []).length;
  const ok = defsCount === 1 && want.ids.every(id => headerBlock.includes('id="' + id + '"'));
  if (ok) { log(funcName + ": marker defs already clean, skipping"); return; }
  const defsInner = want.fail
    ? markerDef('fdn-arrow', '--line-strong') + '\n' + markerDef('fdn-arrow-fail', '--fail')
    : markerDef('fsize-arrow', '--line-strong');
  const indent = '  return `<svg class="fdn-diagram" viewBox="0 0 660 220" xmlns="http://www.w3.org/2000/svg">\n      <defs>\n' + defsInner + '\n      </defs>';
  content = content.slice(0, retIdx) + indent + '\n\n    ' + content.slice(divIdx);
  changed = true;
  log(funcName + ": marker defs cleaned (was " + defsCount + " defs blocks)");
}
ensureSingleHeader(fnName);

// 2b) foundSize centerlines must reference fsize-arrow (idempotent, scoped)
(function fixFsizeRefs() {
  const fnIdx = content.indexOf('function foundSizeDiagramSVG');
  if (fnIdx < 0) return;
  const endFn = content.indexOf('function calcFoundSize', fnIdx);
  const seg = content.slice(fnIdx, endFn < 0 ? undefined : endFn);
  const bad = seg.match(/<line class="centerline"[^>]*url\(#fdn-arrow\)"/g) || [];
  if (bad.length > 0) {
    const fixed = seg.replace(/(<line class="centerline"[^>]*?)url\(#fdn-arrow\)"/g, '$1url(#fsize-arrow)"');
    content = content.slice(0, fnIdx) + fixed + (endFn < 0 ? '' : content.slice(endFn));
    changed = true;
    log("foundSize refs: pointed " + bad.length + " centerline(s) to #fsize-arrow");
  } else {
    log("foundSize refs: already using #fsize-arrow");
  }
})();

// 3) load-line arrows must use fail marker (idempotent)
const badLoad = content.match(/<line class="load-line"[^>]*url\(#fdn-arrow\)"/g) || [];
if (badLoad.length > 0) {
  content = content.replace(/<line class="load-line"([^>]*?)marker-end="url\(#fdn-arrow\)"/g,
    '<line class="load-line"$1marker-end="url(#fdn-arrow-fail)"');
  changed = true;
  log("load-line arrows: pointed " + badLoad.length + " arrow(s) to #fdn-arrow-fail");
} else {
  log("load-line arrows: already pointing to fail marker");
}

if (changed) { fs.writeFileSync(path, content, 'utf8'); log("File updated (" + origLen + " -> " + content.length + ")"); }
else { log("No changes needed - file already patched"); }
}
console.log("Done");
