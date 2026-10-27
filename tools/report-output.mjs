// Report files of the command-line tools: Markdown -> standalone A4 HTML (css/report.css, lib/foundation/report/reportDocument.js) and
// HTML -> PDF with a Chrome / Chromium / Edge that is already installed (headless --print-to-pdf; no npm package).
//   findBrowser(explicit?)       path of a Chromium-based browser, or null (FAIR_BROWSER / CHROME_PATH override the search)
//   htmlToPdf(htmlPath, pdfPath, browser?) -> { ok, pdf?, note? }
//   buildHtmlReport({ md, cfg, drawingDir, drawings }) -> HTML string (the Markdown report body, the document header from cfg.report,
//                                                          the foundation drawings embedded as SVG)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildReportDocument, markdownToHtml, escapeHtmlText } from '../lib/foundation/index.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPORT_CSS = path.join(HERE, '..', 'css', 'report.css');

export function findBrowser(explicit = null) {
  const env = process.env;
  const cands = [explicit, env.FAIR_BROWSER, env.CHROME_PATH];
  if (process.platform === 'win32') {
    const roots = [env.ProgramFiles, env['ProgramFiles(x86)'], env.LOCALAPPDATA].filter(Boolean);
    roots.forEach((r) => cands.push(path.join(r, 'Google', 'Chrome', 'Application', 'chrome.exe'), path.join(r, 'Microsoft', 'Edge', 'Application', 'msedge.exe'), path.join(r, 'Chromium', 'Application', 'chrome.exe')));
  } else if (process.platform === 'darwin') {
    cands.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Chromium.app/Contents/MacOS/Chromium');
  } else {
    for (const n of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge', 'microsoft-edge-stable']) {
      const w = spawnSync('which', [n], { encoding: 'utf8' });
      if (w.status === 0 && w.stdout.trim()) cands.push(w.stdout.trim());
    }
    if (env.PLAYWRIGHT_BROWSERS_PATH) cands.push(path.join(env.PLAYWRIGHT_BROWSERS_PATH, 'chromium'));
  }
  return cands.filter(Boolean).find((c) => { try { return fs.statSync(c).isFile(); } catch { return false; } }) || null;
}

export function htmlToPdf(htmlPath, pdfPath, browser = null) {
  const exe = findBrowser(browser);
  if (!exe) return { ok: false, note: 'No Chrome / Chromium / Edge found. Open the HTML report in a browser and print it (Ctrl+P → Save as PDF), or set FAIR_BROWSER to the browser executable.' };
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fair-pdf-'));
  try {
    for (const headless of ['--headless=new', '--headless']) {
      try { fs.rmSync(pdfPath, { force: true }); } catch { /* none */ }
      const args = [headless, '--disable-gpu', '--no-pdf-header-footer', '--print-to-pdf-no-header', `--user-data-dir=${profile}`, `--print-to-pdf=${path.resolve(pdfPath)}`,
        ...((typeof process.getuid === 'function' && process.getuid() === 0) || process.env.CI ? ['--no-sandbox'] : []), pathToFileURL(path.resolve(htmlPath)).href];
      const r = spawnSync(exe, args, { encoding: 'utf8', timeout: 90000 });
      if (fs.existsSync(pdfPath) && fs.statSync(pdfPath).size > 500) return { ok: true, pdf: pdfPath, browser: exe };
      if (r.error && r.error.code === 'ENOENT') break;
    }
    return { ok: false, note: `The browser (${exe}) did not write the PDF. Open the HTML report and print it to PDF instead.` };
  } finally {
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

// Report data of the .fnd (REPORT command): cfg.report = { by, date, rev, location, companyDocId, contractorDocId, pages }.
export function buildHtmlReport({ md, cfg = {}, drawingDir = null, drawings = [] }) {
  const lines = String(md).replace(/\r\n?/g, '\n').split('\n');
  const t = lines.findIndex((l) => /^#\s+/.test(l));
  const title = t >= 0 ? lines[t].replace(/^#\s+/, '').trim() : 'Foundation calculation report';
  // the drawings are embedded as SVG below: the Markdown image links to the same files are left out
  const keep = lines.filter((l, i) => i !== t && !(drawings.length && /^!\[[^\]]*\]\([^)]*\.svg\)\s*$/.test(l)));
  const body = markdownToHtml(t >= 0 ? keep.join('\n') : md);
  const meta = { project: cfg.project || '', ...(cfg.report || {}) };
  let figs = '';
  for (const d of drawings) {
    if (!d || !d.svg || !drawingDir) continue;
    try {
      const svg = fs.readFileSync(path.join(drawingDir, d.svg), 'utf8').replace(/^<\?xml[^>]*\?>\s*/, '');
      figs += `<figure>${svg}<figcaption>${escapeHtmlText(d.name || d.svg)}</figcaption></figure>\n`;
    } catch { /* drawing file missing: skip */ }
  }
  const css = fs.readFileSync(REPORT_CSS, 'utf8');
  return buildReportDocument({
    title, meta,
    bodyHtml: `<div class="report-block"><div class="section-label" style="margin-top:0">${escapeHtmlText(title)}</div>\n${body}</div>\n` + (figs ? `<div class="report-block page-break-before"><div class="section-label">Drawings</div>\n${figs}</div>` : ''),
    css,
    footer: 'Generated by FAIR Foundation Design (command input). Results are for checking by a qualified engineer; verify against the project design basis.'
  });
}
