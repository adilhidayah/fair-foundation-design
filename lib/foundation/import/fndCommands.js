// FAIR command input (.fnd): a STAAD-style text file -> the config object of tools/staad-stability.mjs.
// Pure function, no file access, no formulas: it only maps words to config fields (the checks are in the lib and in the tool).
//
//   * comment                        one command per line, case-insensitive, quotes keep spaces: "PS-1.2 F1"
//   LC 101 TO 110 120                a trailing "-" (or "_") continues the command on the next line
//
//   PROJECT Pipe support PT TIP      STD file.std            ANL file.ANL
//   LC 101 TO 164                    LC LRFD 301 TO 400      DEAD CASE 3
//   CONCRETE UNIT WEIGHT 24          SOIL UNIT WEIGHT 18     ALLOWABLE BEARING 100      FRICTION 0.4
//   ECCENTRICITY 1/6                 (1/6 | 1/4 | NONE | a number)
//   FS SLIDING 1.5 [1.5]             FS OVERTURNING 1.5 [1.5]       (permanent [temporary])
//   BEARING METHOD RIGID             (RIGID | MEYERHOF)      MIN CONTACT 0.7
//   SOIL C 6.865 PHI 18.81 METHOD MEYERHOF FS 3 [FSTEMP 2] [FAILURE GENERAL] [BETA 0]
//   DESIGN FC 21.7 FY 420 COVER 75 BAR 13 [LAMBDA 1] [ASMIN SLAB|BEAM] [SPACING 25]
//   AUTO THICKNESS TO 0.8 STEP 0.05 [FROM 0.3] [OPTIMIZE]
//   PEDESTAL DESIGN BAR 16 TIE 10 LEGS 2 COVER 50 FYT 420 RHOMIN 0.01
//   PEDESTAL AUTOSIZE TO 0.8 STEP 0.05
//   ANCHOR ASE 157 FUTA 400 HEF 300 ABRG 400 [OMEGA0 2.5] [REINFORCEMENT] [SPACING 100 150] [SPACING STEP 10] [SMIN 100]
//   DRAWINGS ON
//
//   FOUNDATION "PS-1.2 F1" NODE 1 TYPE PEDESTAL      (TYPE PEDESTAL | BLOCK) — the lines below belong to this foundation
//     FOOTING 1.0 1.0 0.3 [DEPTH 0.9]                B  L  H  (m), DEPTH = bottom below grade
//     PEDESTAL 0.3 0.3 [TOP 0.3]                     Bp Lp (m), TOP = pedestal top above grade
//     DP 0.6                                         pedestal below grade: Df = Dp + H
//     OFFSET 0 0     GROUT 25                        pedestal offset x z (m), grout (mm)
//     AUTOSIZE 0.6 2.5 0.1                           smallest square footing: from to step (m)
//     BASEPLATE 0.4 0.4 25                           B L (m), t (mm)       BOLTS 4 DIA 24 SX 200 SZ 200   (mm)
//     LC 101 TO 130  LC LRFD 301 TO 330  DEAD CASE 3 (override the global ones)
//   FINISH
//
//   Pile cap (4B, run by tools/staad-pile.mjs; with DESIGN + LC LRFD also the cap structure, 5B): the foundation line gets SUPPORT PILE, the criteria are the pile's
//   PILE CAPACITY COMPRESSION 600 TENSION 200 LATERAL 50     allowable load of ONE pile, kN (ASD)
//   PILE DIAMETER 400    PILE TYPE FRICTION                  mm;  FRICTION | END (end bearing: Eg = 1)
//   PILE SHAPE SQUARE|CIRCULAR                               pile section for the punching of the piles (default square)
//   PILE EFFICIENCY AUTO [NOREDUCTION 3D] | MANUAL 0.9 | OFF  group efficiency Eg (AUTO = Converse-Labarre)
//   PILE LIMITS MIN 2.5D WARN 3D EDGE 0.4                    min / recommended spacing, edge warning: m, or "<n>D" times D
//   AUTO THICKNESS TO 1.5 STEP 0.05 [FROM 0.5]                smallest cap thickness H that passes 4B and the structure (needs DESIGN + LC LRFD; DP locks the pedestal depth)
//   PILE LATERAL PMULT ON [AVERAGE]                          lateral p-multipliers (default off)
//   FOUNDATION PC-1 NODE 1 TYPE PEDESTAL SUPPORT PILE        (CAP B L H [DEPTH Df] = FOOTING; PEDESTAL / OFFSET / GROUT as above)
//     PILE GRID 3 3 SPACING 1.2 1.2                          nx x nz grid centred on the cap centre (x, z in m)
//     PILE 1 -0.6 -0.6                                       or one pile per line: number x z (m); 9 or more lines are fine
//
// parseFndCommands(text) -> { config, errors: ['line 12: ...'], warnings: [...] }; config is {} fields only for what was written.

const num = (t) => { const v = Number(t); return t !== undefined && t !== '' && Number.isFinite(v) ? v : NaN; };

function tokenize(line) {
  const out = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m;
  while ((m = re.exec(line))) out.push(m[1] !== undefined ? { v: m[1], q: true } : { v: m[2], q: false });
  return out;
}
// Case list: "101 TO 110 120" -> "101-110,120" (the form parseCaseList() reads).
function caseList(words) {
  const out = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (!/^\d+$/.test(w)) throw new Error(`bad load case "${w}"`);
    if (words[i + 1] && words[i + 1].toUpperCase() === 'TO') {
      if (!/^\d+$/.test(words[i + 2] || '')) throw new Error('TO needs a load case number');
      out.push(`${w}-${words[i + 2]}`); i += 2;
    } else out.push(w);
  }
  if (!out.length) throw new Error('no load cases');
  return out.join(',');
}
// "KEY value KEY value": reads the named numeric options (flags without a value listed in `flags`).
function options(words, numeric, flags = [], strings = []) {
  const o = {}, up = words.map(w => w.toUpperCase());
  for (let i = 0; i < words.length; i++) {
    const k = up[i];
    if (numeric.includes(k)) {
      const v = num(words[i + 1]);
      if (Number.isNaN(v)) throw new Error(`${k} needs a number`);
      o[k] = v; i++;
    } else if (strings.includes(k)) {
      if (words[i + 1] === undefined) throw new Error(`${k} needs a value`);
      o[k] = words[i + 1]; i++;
    } else if (flags.includes(k)) o[k] = true;
    else throw new Error(`unknown word "${words[i]}"`);
  }
  return o;
}
// "2.5D" stays a string (times the pile diameter, resolved by the tool); a plain number is metres
const limitValue = (t) => {
  if (/^[\d.]+\s*D$/i.test(t)) return t.toUpperCase();
  const v = num(t); if (Number.isNaN(v) || !(v > 0)) throw new Error(`"${t}" is not a length in m or "<n>D"`);
  return v;
};
const nums = (words, min, max, what) => {
  const v = words.map(num);
  if (v.length < min || v.length > max || v.some(Number.isNaN)) throw new Error(`${what}`);
  return v;
};
const setIf = (target, map, o) => { for (const [from, to] of Object.entries(map)) if (o[from] !== undefined) target[to] = o[from]; };

export function parseFndCommands(text) {
  const config = {}, errors = [], warnings = [];
  let cur = null;                       // foundation being filled
  const crit = () => (config.criteria ||= {});
  const des = () => (crit().design ||= {});
  const ped = () => (crit().pedestal ||= {});

  // physical lines -> logical commands (a trailing "-" continues; "*" starts a comment)
  const cmds = [];
  let acc = '', accNo = 0;
  String(text).split(/\r?\n/).forEach((raw, i) => {
    const line = raw.replace(/^﻿/, '').replace(/^\s*\*.*$/, '').trim();
    if (!acc) accNo = i + 1;
    if (/[-_]$/.test(line) && !/\d-$/.test(line) && line.length > 1) { acc += line.slice(0, -1) + ' '; return; }
    const full = (acc + line).trim();
    acc = '';
    if (full) cmds.push({ no: accNo, text: full });
  });
  if (acc.trim()) cmds.push({ no: accNo, text: acc.trim() });

  for (const { no, text: t } of cmds) {
    const tok = tokenize(t);
    const raw = tok.map(x => x.v), w = raw.map(x => x.toUpperCase());
    // quoted words keep their case and are never keywords
    const kw = (i) => (tok[i] && !tok[i].q ? w[i] : null);
    const rest = (n) => raw.slice(n);
    try {
      const k0 = kw(0), k1 = kw(1);
      if (k0 === 'FAIR' || k0 === 'FINISH' || k0 === 'END') { if (k0 === 'FINISH' || k0 === 'END') cur = null; continue; }
      else if (k0 === 'PROJECT') config.project = rest(1).join(' ');
      else if (k0 === 'STD') config.std = rest(1).join(' ');
      else if (k0 === 'ANL') config.anl = rest(1).join(' ');
      else if (k0 === 'UNIT') { /* the .ANL must be printed in KN / METER; this line is accepted for readability only */ }
      else if (k0 === 'DEAD' && k1 === 'CASE') {
        const v = num(raw[2]); if (!Number.isInteger(v)) throw new Error('DEAD CASE needs a load case number');
        (cur || config).dead_case = v;
      } else if (k0 === 'LC') {
        if (k1 === 'LRFD') (cur || config).lc_lrfd = caseList(rest(2));
        else (cur || config).lc = caseList(rest(1));
      } else if (k0 === 'FOUNDATION') {
        if (!raw[1]) throw new Error('FOUNDATION needs a name');
        const o = options(rest(2), ['NODE'], [], ['TYPE', 'SUPPORT']);
        cur = { name: raw[1] };
        if (o.SUPPORT !== undefined) {
          if (o.SUPPORT.toLowerCase() !== 'pile' && o.SUPPORT.toLowerCase() !== 'shallow') throw new Error('SUPPORT is PILE or SHALLOW');
          if (o.SUPPORT.toLowerCase() === 'pile') cur.support = 'pile';
        }
        if (o.NODE !== undefined) cur.node = o.NODE;
        if (o.TYPE !== undefined) {
          const ty = o.TYPE.toLowerCase();
          if (ty !== 'pedestal' && ty !== 'block') throw new Error('TYPE is PEDESTAL or BLOCK');
          cur.type = ty;
        }
        (config.foundations ||= []).push(cur);
      } else if (cur && (k0 === 'FOOTING' || k0 === 'CAP')) {
        const v = nums(raw.slice(1, 4), 3, 3, 'FOOTING needs B L H (m)');
        [cur.Bf, cur.Lf, cur.Hf] = v;
        const o = options(rest(4), ['DEPTH']); if (o.DEPTH !== undefined) cur.Df = o.DEPTH;
      } else if (cur && k0 === 'PEDESTAL' && k1 !== 'DESIGN' && k1 !== 'AUTOSIZE') {
        const v = nums(raw.slice(1, 3), 2, 2, 'PEDESTAL needs Bp Lp (m)');
        [cur.Bp, cur.Lp] = v;
        const o = options(rest(3), ['TOP']); if (o.TOP !== undefined) cur.pedGp = o.TOP;
      } else if (cur && k0 === 'DP') cur.Dp = nums(raw.slice(1), 1, 1, 'DP needs a number (m)')[0];
      else if (cur && k0 === 'OFFSET') [cur.OffX, cur.OffZ] = nums(raw.slice(1), 2, 2, 'OFFSET needs x z (m)');
      else if (cur && k0 === 'GROUT') cur.groutT = nums(raw.slice(1), 1, 1, 'GROUT needs a number (mm)')[0];
      else if (cur && k0 === 'AUTOSIZE') { const v = nums(raw.slice(1), 3, 3, 'AUTOSIZE needs from to step (m)'); cur.autosize = { from: v[0], to: v[1], step: v[2] }; }
      else if (cur && k0 === 'BASEPLATE') { const v = nums(raw.slice(1), 3, 3, 'BASEPLATE needs B L t (m, m, mm)'); cur.baseplate = { B: v[0], L: v[1], t: v[2] }; }
      else if (cur && k0 === 'BOLTS') {
        const n = num(raw[1]); if (!Number.isInteger(n)) throw new Error('BOLTS needs the number of bolts');
        const o = options(rest(2), ['DIA', 'SX', 'SZ']);
        cur.bolts = { n, dia: o.DIA, sx: o.SX, sz: o.SZ };
      }
      else if (cur && k0 === 'PILE' && k1 === 'GRID') {
        const g = nums(raw.slice(2, 4), 2, 2, 'PILE GRID needs nx nz (counts)');
        if (!g.every(v => Number.isInteger(v) && v > 0) || g[0] * g[1] > 200) throw new Error('PILE GRID counts must be positive integers (at most 200 piles)');
        if (w[4] !== 'SPACING') throw new Error('PILE GRID nx nz SPACING sx sz');
        const sp = nums(raw.slice(5, 7), 2, 2, 'SPACING needs sx sz (m)');
        const piles = (cur.piles ||= []);
        for (let j = 0; j < g[1]; j++) for (let i = 0; i < g[0]; i++) piles.push({ x: +((i - (g[0] - 1) / 2) * sp[0]).toFixed(4), y: +((j - (g[1] - 1) / 2) * sp[1]).toFixed(4) });
      } else if (cur && k0 === 'PILE' && /^\d+$/.test(raw[1] || '')) {
        const v = nums(raw.slice(2, 4), 2, 2, 'PILE n x z (m)');
        (cur.piles ||= []).push({ x: v[0], y: v[1] });
      } else if (k0 === 'PILE') {
        const pl = (crit().pile ||= {});
        if (k1 === 'CAPACITY') { const o = options(rest(2), ['COMPRESSION', 'TENSION', 'LATERAL']); setIf(pl, { COMPRESSION: 'Qc', TENSION: 'Qt', LATERAL: 'Ql' }, o); }
        else if (k1 === 'DIAMETER') pl.D = nums(raw.slice(2), 1, 1, 'PILE DIAMETER needs mm')[0];
        else if (k1 === 'SHAPE') { const sh = (w[2] || '').toLowerCase(); if (sh !== 'square' && sh !== 'circular') throw new Error('PILE SHAPE is SQUARE or CIRCULAR'); pl.shape = sh; }
        else if (k1 === 'TYPE') { const ty = (w[2] || '').toLowerCase(); if (ty !== 'friction' && ty !== 'end') throw new Error('PILE TYPE is FRICTION or END'); pl.type = ty; }
        else if (k1 === 'EFFICIENCY') {
          const m = w[2];
          if (m === 'OFF') pl.efficiency = { apply: false };
          else if (m === 'MANUAL') pl.efficiency = { manualEg: nums(raw.slice(3), 1, 1, 'PILE EFFICIENCY MANUAL needs Eg (0-1]')[0] };
          else if (m === 'AUTO') { const o = options(rest(3), [], [], ['NOREDUCTION']); pl.efficiency = o.NOREDUCTION !== undefined ? { sNoReduction: limitValue(o.NOREDUCTION) } : {}; }
          else throw new Error('PILE EFFICIENCY is AUTO, MANUAL <Eg> or OFF');
        } else if (k1 === 'LIMITS') {
          const o = options(rest(2), [], [], ['MIN', 'WARN', 'EDGE']);
          pl.limits = {};
          if (o.MIN !== undefined) pl.limits.spacingMin = limitValue(o.MIN);
          if (o.WARN !== undefined) pl.limits.spacingWarn = limitValue(o.WARN);
          if (o.EDGE !== undefined) pl.limits.edgeWarn = limitValue(o.EDGE);
        } else if (k1 === 'LATERAL') {
          if (w[2] !== 'PMULT' || !['ON', 'OFF'].includes(w[3])) throw new Error('PILE LATERAL PMULT ON|OFF [AVERAGE]');
          pl.lateral = { pMultipliers: w[3] === 'ON', ...(w[4] === 'AVERAGE' ? { method: 'average' } : {}) };
        } else throw new Error(`unknown PILE command "${raw[1] || ''}"`);
      }
      else if (k0 === 'CONCRETE' && k1 === 'UNIT') crit().gc = nums(raw.slice(3), 1, 1, 'CONCRETE UNIT WEIGHT needs kN/m3')[0];
      else if (k0 === 'SOIL' && k1 === 'UNIT') crit().gs = nums(raw.slice(3), 1, 1, 'SOIL UNIT WEIGHT needs kN/m3')[0];
      else if (k0 === 'ALLOWABLE') crit().qa = nums(raw.slice(2), 1, 1, 'ALLOWABLE BEARING needs kPa')[0];
      else if (k0 === 'FRICTION') crit().mu = nums(raw.slice(1), 1, 1, 'FRICTION needs a coefficient')[0];
      else if (k0 === 'ECCENTRICITY') {
        const v = w[1];
        if (v === 'NONE') crit().ecc = 0;
        else if (v === '1/6' || v === '1/4') crit().ecc = v;
        else crit().ecc = nums(raw.slice(1), 1, 1, 'ECCENTRICITY is 1/6, 1/4, NONE or a ratio')[0];
      } else if (k0 === 'FS' && (k1 === 'SLIDING' || k1 === 'OVERTURNING')) {
        const v = nums(raw.slice(2), 1, 2, `FS ${k1} needs permanent [temporary]`);
        const key = k1 === 'SLIDING' ? 'Slide' : 'OT';
        crit()['fs' + key + 'Perm'] = v[0]; crit()['fs' + key + 'Temp'] = v[1] ?? v[0];
      } else if (k0 === 'BEARING' && k1 === 'METHOD') {
        const m = (w[2] || '').toLowerCase();
        if (m !== 'rigid' && m !== 'meyerhof') throw new Error('BEARING METHOD is RIGID or MEYERHOF');
        crit().bearMethod = m;
      } else if (k0 === 'MIN' && k1 === 'CONTACT') crit().minContact = nums(raw.slice(2), 1, 1, 'MIN CONTACT needs a ratio')[0];
      else if (k0 === 'SOIL') {
        const o = options(rest(1), ['C', 'PHI', 'FS', 'FSTEMP', 'BETA'], [], ['METHOD', 'FAILURE']);
        const s = {}; setIf(s, { C: 'c', PHI: 'phi', FS: 'FS', FSTEMP: 'FSTemp', BETA: 'beta' }, o);
        if (o.METHOD) s.method = o.METHOD.toLowerCase();
        if (o.FAILURE) s.failure = o.FAILURE.toLowerCase();
        crit().soil = s;
      } else if (k0 === 'DESIGN') {
        const o = options(rest(1), ['FC', 'FY', 'COVER', 'BAR', 'LAMBDA', 'SPACING'], [], ['ASMIN']);
        setIf(des(), { FC: 'fc', FY: 'fy', COVER: 'cover', BAR: 'bar', LAMBDA: 'lambda', SPACING: 'spacingStep' }, o);
        if (o.ASMIN) des().asMin = o.ASMIN.toLowerCase();
      } else if (k0 === 'AUTO' && k1 === 'THICKNESS') {
        const o = options(rest(2), ['TO', 'STEP', 'FROM'], ['OPTIMIZE']);
        const a = {}; setIf(a, { TO: 'to', STEP: 'step', FROM: 'from', OPTIMIZE: 'optimize' }, o);
        des().autoThickness = a;
      } else if (k0 === 'PEDESTAL' && k1 === 'DESIGN') {
        const o = options(rest(2), ['BAR', 'TIE', 'LEGS', 'COVER', 'FYT', 'RHOMIN']);
        setIf(ped(), { BAR: 'bar', TIE: 'tie', LEGS: 'legs', COVER: 'clearCover', FYT: 'fyt', RHOMIN: 'rhoMin' }, o);
      } else if (k0 === 'PEDESTAL' && k1 === 'AUTOSIZE') {
        const o = options(rest(2), ['TO', 'STEP']);
        ped().autoSize = { ...(o.STEP !== undefined ? { step: o.STEP } : {}), ...(o.TO !== undefined ? { to: o.TO } : {}) };
      } else if (k0 === 'ANCHOR') {
        // SPACING takes a list of numbers (or STEP n) — pulled out before the key/value options
        const a = ped().anchor ||= {};
        const i = w.indexOf('SPACING');
        let body = raw;
        if (i > 0) {
          const after = w.slice(i + 1);
          if (after[0] === 'STEP') { a.spacingStep = nums(raw.slice(i + 2, i + 3), 1, 1, 'SPACING STEP needs a number (mm)')[0]; body = raw.slice(0, i).concat(raw.slice(i + 3)); }
          else {
            let j = i + 1; while (j < raw.length && !Number.isNaN(num(raw[j]))) j++;
            if (j === i + 1) throw new Error('SPACING needs numbers (mm) or STEP n');
            a.spacings = raw.slice(i + 1, j).map(Number); body = raw.slice(0, i).concat(raw.slice(j));
          }
        }
        const o = options(body.slice(1), ['ASE', 'FUTA', 'HEF', 'ABRG', 'OMEGA0', 'SMIN'], ['REINFORCEMENT']);
        setIf(a, { ASE: 'Ase', FUTA: 'futa', HEF: 'hef', ABRG: 'Abrg', OMEGA0: 'omega0', SMIN: 'sMin', REINFORCEMENT: 'reinforcement' }, o);
      } else if (k0 === 'DRAWINGS') config.drawings = (w[1] || 'ON') !== 'OFF';
      else throw new Error(cur || !['FOOTING', 'CAP', 'PEDESTAL', 'DP', 'OFFSET', 'GROUT', 'AUTOSIZE', 'BASEPLATE', 'BOLTS', 'PILE'].includes(k0)
        ? `unknown command "${raw[0]}"` : `${k0} belongs under a FOUNDATION line`);
    } catch (e) {
      errors.push(`line ${no}: ${e.message}  [${t}]`);
    }
  }
  if (!config.foundations || !config.foundations.length) errors.push('no FOUNDATION defined');
  if (!config.std || !config.anl) errors.push('STD and ANL files are required');
  if (!config.lc) errors.push('LC (ASD load cases) is required');
  const pileF = (config.foundations || []).filter(f => f.support === 'pile');
  if (pileF.length && pileF.length !== config.foundations.length) errors.push('SUPPORT PILE and shallow foundations cannot be mixed in one file yet');
  if (pileF.length) {
    const pl = config.criteria && config.criteria.pile || {};
    for (const [k, nm] of [['Qc', 'PILE CAPACITY COMPRESSION'], ['Qt', 'PILE CAPACITY TENSION'], ['Ql', 'PILE CAPACITY LATERAL'], ['D', 'PILE DIAMETER']]) if (!(pl[k] > 0)) errors.push(`${nm} is required for SUPPORT PILE`);
    for (const f of pileF) if (!f.piles || !f.piles.length) errors.push(`${f.name}: no piles (PILE GRID or PILE n x z)`);
    const at = config.criteria && config.criteria.design && config.criteria.design.autoThickness;
    if (at) {
      if (at.optimize) errors.push('AUTO THICKNESS OPTIMIZE is not needed for SUPPORT PILE (B × L follow the piles; the smallest passing H is used)');
      if (at.to === undefined) errors.push('AUTO THICKNESS needs TO <m> for SUPPORT PILE');
      if (!config.lc_lrfd && !pileF.every(f => f.lc_lrfd)) errors.push('AUTO THICKNESS needs LC LRFD (the cap structure is designed from the factored combinations)');
      if (!config.criteria.design.fc) errors.push('AUTO THICKNESS needs DESIGN FC ... FY ...');
    }
    if (!config.criteria || config.criteria.gc === undefined || config.criteria.gs === undefined) errors.push('CONCRETE UNIT WEIGHT and SOIL UNIT WEIGHT are required (cap weight)');
  }
  for (const f of config.foundations || []) {
    for (const k of ['Bf', 'Lf', 'Hf']) if (f[k] === undefined && !(f.autosize && f.support !== 'pile')) { errors.push(`${f.name}: FOOTING B L H missing`); break; }
    if (f.Df === undefined && f.Dp === undefined) warnings.push(`${f.name}: no DEPTH / DP — the tool needs the footing bottom below grade`);
  }
  return { config, errors, warnings };
}
