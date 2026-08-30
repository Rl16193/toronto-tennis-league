// Cross-platform launcher for `export-dataset-xlsx.py`, so `npm run dataset:xlsx` works whether the
// Python launcher is `py` (Windows), `python3`, or `python`. The export itself is Python because
// openpyxl is the tool for writing .xlsx, and the repository already builds spreadsheets that way.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'export-dataset-xlsx.py');
const forwarded = process.argv.slice(2);

const candidates = process.platform === 'win32' ? ['py', 'python', 'python3'] : ['python3', 'python'];
for (const interpreter of candidates) {
  const result = spawnSync(interpreter, [script, ...forwarded], { stdio: 'inherit' });
  // ENOENT means this interpreter is not installed — try the next name rather than reporting a
  // failed export. Any other outcome is the script's own, so pass its exit code straight through.
  if (result.error?.code === 'ENOENT') continue;
  process.exit(result.status ?? 1);
}

console.error(`Could not find a Python interpreter (tried: ${candidates.join(', ')}).`);
console.error('Install Python 3, or run the exporter directly: python3 scripts/export-dataset-xlsx.py');
process.exit(1);
