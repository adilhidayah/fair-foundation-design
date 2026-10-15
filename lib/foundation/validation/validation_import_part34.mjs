// VALIDATION part34 — report generator: Markdown -> standalone HTML (lib/foundation/report/reportDocument.js), the REPORT command of the
// .fnd, tools/fair-run.mjs HTML output and (when a Chrome / Chromium / Edge is installed) the PDF. The text of the numbers is not
// changed by the generator: the checks compare the produced HTML with the hand-written expected markup and the numbers of the
// Markdown report with those of the HTML.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { markdownToHtml, inlineMarkdown, buildReportDocument, reportHeaderHtml, parseFndCommands } from '../index.js';
import { findBrowser } from '../../../tools/report-output.mjs';
let pass = 0, fail = 0, skip = 0;
function ok(n, c, x = '') { if (c) { pass++; console.log('PASS ' + n + ' ' + x); } else { fail++; console.log('FAIL ' + n + ' ' + x); } }

// ---- 1. inline formatting ----
ok('bold, italic, code span (code is not formatted)', inlineMarkdown('a **b** *c* `x_y **z**`') === 'a <strong>b</strong> <em>c</em> <code>x_y **z**</code>');
ok('subscripts: E_g, A_s,min, f_y, P_all,g; a trailing comma / dot stays outside', inlineMarkdown('E_g = 1, A_s,min, f_y. P_all,g') === 'E<sub>g</sub> = 1, A<sub>s,min</sub>, f<sub>y</sub>. P<sub>all,g</sub>');
ok('no subscript for a multi-letter base (file_name) or in code', inlineMarkdown('file_name `a_b`') === 'file_name <code>a_b</code>');
ok('HTML special characters are escaped before formatting', inlineMarkdown('a<b & "c" > 1') === 'a&lt;b &amp; &quot;c&quot; &gt; 1');
ok('a script tag in the text cannot become markup', !/<script/i.test(inlineMarkdown('<script>alert(1)</script>')) && /&lt;script&gt;/.test(inlineMarkdown('<script>alert(1)</script>')));

// ---- 2. blocks ----
const html = markdownToHtml('# Title — x\n\nHello **bold**.\nSecond line.\n\n## Sec\n\n| A | B |\n|---|---|\n| 1 | x ◄ |\n| 12.5 kN | a<b |\n| - | ∞ |\n\n- one\n- two *it*\n\n### Sub\n\n![F1](a%20b.svg)\n');
ok('first H1 = report header, "## " = section label, "###" = sub title', /^<div class="report-header"><h2>Title — x<\/h2><\/div>/.test(html) && html.includes('<div class="section-label">Sec</div>') && html.includes('<h3 class="sub-title">Sub</h3>'));
ok('a paragraph joins its lines', html.includes('<p>Hello <strong>bold</strong>. Second line.</p>'));
ok('table: header cells, numeric cells right-aligned, "◄" marks the governing row, text escaped', html.includes('<tr><th>A</th><th>B</th></tr>') && html.includes('<tr class="governing"><td class="num">1</td><td>x ◄</td></tr>')
  && html.includes('<tr><td class="num">12.5 kN</td><td>a&lt;b</td></tr>') && html.includes('<td class="num">-</td><td class="num">∞</td>'));
ok('bullet list', html.includes('<ul><li>one</li><li>two <em>it</em></li></ul>'));
ok('image line -> figure with the decoded source', html.includes('<figure><img src="a b.svg" alt="F1">'));
const cells = markdownToHtml('| a | b |\n|---|---|\n| x \\| y | 2 |');
ok('an escaped pipe stays inside its cell', cells.includes('<td>x | y</td><td class="num">2</td>'));

// ---- 3. document ----
const meta = { project: 'Pipe <support> PT TIP', location: 'Plant 3', by: 'A. Engineer', date: '2026-10-15', rev: 'A' };
const plain = buildReportDocument({ title: 'T', meta, bodyHtml: '<p>body</p>', css: '.x{}' });
ok('plain header: project (escaped), location, calculated by, date, revision', plain.includes('<h2>Pipe &lt;support&gt; PT TIP</h2>') && plain.includes('Location/Client: Plant 3') && plain.includes('Calculated by: A. Engineer') && plain.includes('Date: 2026-10-15') && plain.includes('Rev: A'));
ok('the title tag, inline CSS, body and the print button are in the document; one <html>', plain.includes('<title>Pipe &lt;support&gt; PT TIP — T</title>') && plain.includes('.x{}') && plain.includes('<p>body</p>') && plain.includes('onclick="window.print()"') && (plain.match(/<html/g) || []).length === 1);
const dh = reportHeaderHtml('T', { ...meta, companyDocId: '23026-CAL-001', contractorDocId: '', pages: '1 / 6', logo1: 'data:image/png;base64,AAAA' });
ok('document header table when IDs / logos are given: IDs, "—" for an empty one, pages, revision, logo', dh.includes('<strong>23026-CAL-001</strong>') && dh.includes('Contractor Document ID<strong>—</strong>') && dh.includes('<strong>1 / 6</strong>') && dh.includes('Revision Number<strong>A</strong>') && dh.includes('<img src="data:image/png;base64,AAAA"'));
ok('header:false and toolbar:false leave them out', !buildReportDocument({ title: 'T', meta, header: false, toolbar: false }).includes('report-header') && !buildReportDocument({ title: 'T', meta, toolbar: false }).includes('report-toolbar'));

// ---- 4. REPORT command ----
const rp = parseFndCommands('REPORT BY "A. Engineer" DATE 2026-10-15 REV B LOCATION "Plant 3 / Unit 12" COMPANYDOC 23026-CAL-001 CONTRACTORDOC - PAGES "1 / 6"\nREPORT REV C');
ok('REPORT fields (quoted values keep spaces); a later REPORT adds / overrides', JSON.stringify(rp.config.report) === JSON.stringify({ by: 'A. Engineer', date: '2026-10-15', rev: 'C', location: 'Plant 3 / Unit 12', companyDocId: '23026-CAL-001', contractorDocId: '-', pages: '1 / 6' }));
ok('REPORT with an unknown word is a line error', parseFndCommands('REPORT FOO 1').errors.some(e => /^line 1:.*unknown word/.test(e)));

// ---- 5. fair-run: HTML (and PDF when a browser is installed) ----
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fair-rep-'));
fs.writeFileSync(path.join(dir, 'a.std'), ['LOAD 3 LOADTYPE Dead TITLE D', 'JOINT LOAD', '1 FY -10', 'LOAD 5 LOADTYPE Live TITLE L', 'JOINT LOAD', '1 FY -5', 'LOAD 101 D+L', 'REPEAT LOAD', '3 1 5 1', ''].join('\n'));
fs.writeFileSync(path.join(dir, 'a.ANL'), ['   SUPPORT REACTIONS -UNIT KN   METE    STRUCTURE TYPE = SPACE', '   -----------------', ' JOINT  LOAD   FORCE-X   FORCE-Y   FORCE-Z     MOM-X     MOM-Y     MOM Z', '      1  101      1.00     15.00      0.00      0.00      0.00      1.50', ''].join('\n'));
fs.writeFileSync(path.join(dir, 'r.fnd'), ['PROJECT Report test', 'REPORT BY "A. Engineer" DATE 2026-10-15 REV A', 'STD a.std', 'ANL a.ANL', 'LC 101', 'CONCRETE UNIT WEIGHT 24', 'SOIL UNIT WEIGHT 18', 'ALLOWABLE BEARING 100', 'FRICTION 0.4', 'ECCENTRICITY NONE',
  'FS SLIDING 1.5', 'FS OVERTURNING 1.5', 'FOUNDATION F1 NODE 1 TYPE PEDESTAL', ' FOOTING 1.2 1.2 0.3 DEPTH 0.8', ' PEDESTAL 0.3 0.3 TOP 0.3', ' GROUT 25', 'FINISH', ''].join('\n'));
const tool = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../tools/fair-run.mjs');
const browser = findBrowser();
const run = spawnSync(process.execPath, [tool, path.join(dir, 'r.fnd'), ...(browser ? ['--pdf'] : [])], { encoding: 'utf8', timeout: 120000 });
const md = fs.readFileSync(path.join(dir, 'r - Stability.md'), 'utf8'), h = fs.existsSync(path.join(dir, 'r - Stability.html')) ? fs.readFileSync(path.join(dir, 'r - Stability.html'), 'utf8') : '';
ok('fair-run writes the HTML next to the Markdown', run.status !== 2 && h.length > 2000, (run.stderr || '').split('\n')[0]);
ok('the HTML carries the header of the REPORT command and the project', h.includes('Calculated by: A. Engineer') && h.includes('Date: 2026-10-15') && h.includes('Rev: A') && h.includes('<h2>Report test</h2>'));
// every number of the Markdown tables is in the HTML, unchanged
const nums = [...new Set((md.match(/\|\s*-?\d+\.\d+\s*(?=\|)/g) || []).map(x => x.replace(/[|\s]/g, '')))];
ok(`the ${nums.length} different decimal numbers of the Markdown tables are all in the HTML as they are`, nums.length > 10 && nums.every(x => h.includes(x)), `${nums.length}`);
ok('no raw Markdown left in the HTML: no pipe-table lines, no "**", no "## "', !/^\s*\|/m.test(h) && !h.includes('**') && !/^## /m.test(h));
if (browser) {
  const pdf = path.join(dir, 'r - Stability.pdf');
  const have = fs.existsSync(pdf) ? fs.readFileSync(pdf) : null;
  if (have) ok('PDF written by the installed browser: "%PDF" header and at least one page', have.subarray(0, 5).toString() === '%PDF-' && (have.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length >= 1, `${have.length} bytes`);
  else if (process.env.FAIR_REQUIRE_PDF) ok('PDF written by the installed browser', false, (run.stdout || '').split('\n').find(l => /PDF/.test(l)) || '');
  else { skip++; console.log('SKIP PDF: the browser did not write it (' + (run.stdout || '').split('\n').find(l => /PDF/.test(l)) + ') — set FAIR_REQUIRE_PDF=1 to make this a failure'); }
} else { skip++; console.log('SKIP PDF: no Chrome / Chromium / Edge found'); }
fs.rmSync(dir, { recursive: true, force: true });
console.log(`\nPASS ${pass}  FAIL ${fail}  SKIP ${skip}`); process.exit(fail ? 1 : 0);
