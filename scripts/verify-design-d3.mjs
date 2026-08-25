import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const srcRoot = path.join(root, 'src');

async function filesUnder(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await filesUnder(full)));
    else if (/\.(css|tsx?|mjs)$/.test(entry.name)) files.push(full);
  }
  return files;
}

const files = await filesUnder(srcRoot);
const source = (await Promise.all(files.map((file) => readFile(file, 'utf8')))).join('\n');
const css = await readFile(path.join(srcRoot, 'index.css'), 'utf8');
const cssLower = css.toLowerCase();
const sheet = await readFile(path.join(srcRoot, 'components/Sheet.tsx'), 'utf8');
const contact = await readFile(path.join(srcRoot, 'components/ContactOpponentButton.tsx'), 'utf8');
const tree = await readFile(path.join(srcRoot, 'components/Tree.tsx'), 'utf8');

const checks = [
  ['legacy clay literals removed', !/FF6B35|ff6b35|255,\s*107,\s*53/.test(source)],
  ['nav token removed', !/bg-nav|--color-nav/.test(source)],
  ['dark page/card/recess tokens split', ['#0b3027', '#143d34', '#06211b'].every((value) => cssLower.includes(value))],
  ['light page/card/recess tokens split', ['#deded5', '#ffffff', '#d2d2c7'].every((value) => cssLower.includes(value))],
  ['keyboard focus utility exists', (css.match(/focus-visible/g) || []).length >= 1],
  [
    'reduced motion rule exists',
    css.includes('prefers-reduced-motion') && css.includes('.animate-spin') && css.includes('.animate-pulse'),
  ],
  ['old disabled opacity overrides removed', !/disabled:opacity-(25|30|35|40)/.test(source)],
  ['duplicate button variants removed', !/variant=["'](danger|primary)["']/.test(source)],
  ['legacy placeholder class removed', !source.includes('placeholder-gray-500')],
  ['Sheet default is max-md', !sheet.includes("maxWidthClassName = 'max-w-lg'")],
  ['icon pill override removed', !contact.includes('!px-1.5')],
  ['Tree indent widths preserved', (tree.match(/w-\[calc\(100%-/g) || []).length === 2],
  ['LoadingBar override removed', !source.includes('barColorClassName')],
];

const failures = checks.filter(([, pass]) => !pass).map(([label]) => label);
for (const [label, pass] of checks) console.log(`${pass ? 'PASS' : 'FAIL'} ${label}`);
if (failures.length) {
  console.error(`Design D3 verification failed: ${failures.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log('Design D3 verification passed.');
}
