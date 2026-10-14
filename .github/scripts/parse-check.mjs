// Parses every given file as an ES module (no execution, imports are not resolved) and reports syntax errors.
import { SourceTextModule } from 'node:vm';
import fs from 'node:fs';
let bad = 0;
for (const f of process.argv.slice(2)) {
  try { new SourceTextModule(fs.readFileSync(f, 'utf8'), { identifier: f }); }
  catch (e) { bad++; console.log(`::error file=${f}::${String(e.message).split('\n')[0]}`); }
}
console.log(`${process.argv.length - 2 - bad} of ${process.argv.length - 2} files parse`);
process.exit(bad ? 1 : 0);
