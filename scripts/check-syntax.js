import { readdir } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

const roots = ['src', 'scripts', 'public'];
const files = [];

for (const root of roots) {
  await collectJavaScriptFiles(root);
}

files.sort((left, right) => left.localeCompare(right));
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], {
    cwd: process.cwd(),
    stdio: 'inherit'
  });
  if (result.status !== 0) {
    process.exitCode = result.status || 1;
    break;
  }
}

if (!process.exitCode) {
  console.log(`Syntax check passed for ${files.length} JavaScript files.`);
}

async function collectJavaScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await collectJavaScriptFiles(path);
    } else if (entry.isFile() && extname(entry.name) === '.js') {
      files.push(relative(process.cwd(), path));
    }
  }
}
