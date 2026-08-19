import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'functions');

const collectJavaScript = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules') continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectJavaScript(fullPath)));
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(fullPath);
  }
  return files;
};

const main = async () => {
  const files = (await collectJavaScript(root)).sort();
  const failures = files.filter((file) => {
    const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
    return result.error || result.status !== 0;
  });
  if (failures.length) throw new Error(`Functions syntax failed for ${failures.length} file(s).`);
  console.log(`Functions syntax passed for ${files.length} JavaScript files.`);
};

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
