// VALIDATION part7 — import/textParsers (OCR / pasted text -> candidates). Expected values by hand.
import { parseLoadTypeText, parseEquipmentWeightText, parseFactorCell, parseComboImport, parseFoundationDimText } from '../import/textParsers.js';
let pass=0, fail=0;
function eq(n,g,e,t=1e-9){const o=Math.abs(g-e)<=t;if(o){pass++;console.log('PASS '+n+'='+g);}else{fail++;console.log('FAIL '+n+' got='+g+' exp='+e);}}
function ok(n,c,x=''){if(c){pass++;console.log('PASS '+n+' '+x);}else{fail++;console.log('FAIL '+n+' '+x);}}
const js=JSON.stringify;

// --- Load types: numbering stripped, category folded into Empty/Operating/Test sub-items, headers skipped ---
const lt=parseLoadTypeText('No.\nSymbol\n1. Dead Load D\nEquipment Load\na. Empty Load E(E)\nb. Operating Load E(O)\n2) Impact Load IMPACT');
ok('lt count',lt.length===3,js(lt));
ok('lt D',lt[0].code==='D'&&lt[0].label==='Dead Load');
ok('lt E(E) category',lt[1].code==='E(E)'&&lt[1].label==='Equipment Empty Load',lt[1].label);
ok('lt E(O) category',lt[2].code==='E(O)'&&lt[2].label==='Equipment Operating Load');
ok('lt blacklist symbol',!lt.some(r=>/impact/i.test(r.code)));

// --- Equipment weights: raw value + unit, no conversion in lib; unmarked -> 'ton' ---
const ew=parseEquipmentWeightText('Empty weight 12.5 ton\nOperating weight 30000 kg\nHydro test 45');
ok('ew conds',ew.map(r=>r.cond).join()==='empty,operating,test');
eq('ew empty value',ew[0].value,12.5);ok('ew empty unit',ew[0].unit==='ton');
eq('ew oper value',ew[1].value,30000);ok('ew oper unit kg (not converted)',ew[1].unit==='kg');
eq('ew test value',ew[2].value,45);ok('ew test unmarked -> ton',ew[2].unit==='ton');
const ew2=parseEquipmentWeightText('Empty: n/a');
ok('ew no number -> not found, line kept',ew2[0].found===false&&ew2[0].line==='Empty: n/a');
ok('ew missing keyword -> not found, no line',ew2[1].found===false&&ew2[1].line===undefined);

// --- Factor cells: blank/dash = 0, decimal comma, junk = NaN ---
eq('fc blank',parseFactorCell(''),0);eq('fc dash',parseFactorCell('-'),0);eq('fc emdash',parseFactorCell('—'),0);
eq('fc comma',parseFactorCell('1,112'),1.112);eq('fc neg',parseFactorCell('-0.9'),-0.9);
ok('fc junk NaN',Number.isNaN(parseFactorCell('x')));

// --- Combo import, tab-separated (Excel): by column position; header case/space-insensitive ---
const codes=['D','L','E(O)','WX'];
const tab=parseComboImport('No.\tCombination\td\tL\tE (O)\tWX\tFOO(X)\n101\t1.4D\t1.4\t\t\t\t\n102\tD+L+WX\t1\t1\t\t0,6\t\n\tOperating\t\t\t\t\t\n103\tbad\tx\t1\t\t\t',codes);
ok('tab ok',tab.ok&&tab.tabbed===true);
ok('tab codes mapped',js(tab.codes)===js(['D','L','E(O)','WX']),js(tab.codes));
ok('tab unknown header reported',js(tab.unknown)===js(['FOO(X)']),js(tab.unknown));
ok('tab rows (group row skipped)',tab.rows.length===3,js(tab.rows));
ok('tab 101',tab.rows[0].lc==='101'&&tab.rows[0].name==='1.4D'&&js(tab.rows[0].f)===js({D:1.4}));
ok('tab 102 comma',js(tab.rows[1].f)===js({D:1,L:1,WX:0.6}));
ok('tab 103 flagged bad',tab.rows[2].bad===true&&js(tab.rows[2].f)===js({L:1}));

// --- Combo import, OCR text: trailing numbers right-aligned onto code columns ---
const ocr=parseComboImport('LC | D | L | E(O) | WX\n201 1.2 1.6 1.2 0.5\n202 D only 0.9\nEmpty Condition',codes);
ok('ocr ok',ocr.ok&&ocr.tabbed===false);
ok('ocr 201 full row factors',js(ocr.rows[0].f)===js({D:1.2,L:1.6,'E(O)':1.2,WX:0.5})&&ocr.rows[0].bad===false);
// Known limitation (pre-existing): a numbers-only OCR row loses its LC number (read as a numeric token, then
// trimmed to the code-column count). Factors are unaffected. Update this check if that behaviour is fixed.
ok('ocr 201 LC number dropped (known limitation)',ocr.rows[0].lc==='',ocr.rows[0].lc);
ok('ocr 202 short row -> right-aligned to WX, flagged',js(ocr.rows[1].f)===js({WX:0.9})&&ocr.rows[1].bad===true&&ocr.rows[1].name==='D only');
ok('ocr text-only row skipped',ocr.rows.length===2);
const auto=parseComboImport('D\tL\n1.2\t1',codes);
ok('auto name from factors',auto.rows[0].name==='1.2D + L',auto.rows[0].name);
ok('no header -> not ok',parseComboImport('1 2 3\n4 5 6',codes).reason==='no-header');

// --- Foundation dimensions (Tab 02): raw value + unit, no conversion in lib ---
const fdGet=(r,k)=>r.fields.find(f=>f.key===k);
const fd=parseFoundationDimText('Pile cap 2.4 x 2.4 x 0.8 m, Df 1.5m\npedestal 1250 x 1250 mm Gp=275 mm, Off X: 0,3 OffZ -0.2\ngrout 25 mm, embedment 0.1');
ok('fd support pile (pile cap)',fd.support==='pile');ok('fd type pedestal',fd.type==='pedestal');
eq('fd Bf',fdGet(fd,'Bf').value,2.4);ok('fd Bf unit from group end',fdGet(fd,'Bf').unit==='m');
eq('fd Lf',fdGet(fd,'Lf').value,2.4);eq('fd Hf',fdGet(fd,'Hf').value,0.8);
eq('fd Df',fdGet(fd,'Df').value,1.5);ok('fd Df unit m',fdGet(fd,'Df').unit==='m');
eq('fd Bp raw mm (not converted)',fdGet(fd,'Bp').value,1250);ok('fd Bp unit mm',fdGet(fd,'Bp').unit==='mm');
eq('fd Lp',fdGet(fd,'Lp').value,1250);eq('fd Gp',fdGet(fd,'Gp').value,275);ok('fd Gp unit mm',fdGet(fd,'Gp').unit==='mm');
eq('fd OffX decimal comma',fdGet(fd,'OffX').value,0.3);ok('fd OffX no unit -> null',fdGet(fd,'OffX').unit===null);
eq('fd OffZ negative',fdGet(fd,'OffZ').value,-0.2);
eq('fd grout',fdGet(fd,'tGrout').value,25);ok('fd grout unit',fdGet(fd,'tGrout').unit==='mm');
eq('fd embed',fdGet(fd,'hEmbed').value,0.1);
ok('fd no conflicts',fd.conflicts.length===0,js(fd.conflicts));
const fd2=parseFoundationDimText('footing 3 x 2.5 x 0.6, Hf 0.7, no pedestal, shallow foundation\npedestal 1.2 x 1.2 x 1.5\nthousands Bf 1,250');
ok('fd2 support shallow',fd2.support==='shallow');ok('fd2 type block (no pedestal)',fd2.type==='block');
eq('fd2 Hf first wins',fdGet(fd2,'Hf').value,0.6);
ok('fd2 Hf conflict reported',fd2.conflicts.some(c=>c.key==='Hf'&&c.value===0.7));
ok('fd2 Bf conflict thousands separator',fd2.conflicts.some(c=>c.key==='Bf'&&c.value===1250));
ok('fd2 third pedestal value ignored',fd2.ignored.length===1&&!fdGet(fd2,'Gp'));
const fd3=parseFoundationDimText('pile or shallow, 2.4 x 2.4, embedment depth 0.1');
ok('fd3 both support words -> null',fd3.support===null);
ok('fd3 bare size group without keyword ignored',fd3.fields.length===0,js(fd3.fields));

console.log(`PART7: ${pass} pass, ${fail} fail`);
process.exit(fail>0?1:0);
