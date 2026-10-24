#!/usr/bin/env node
/**
 * Housekeeping.
 *   npm run clean              → remove out/ (rendered videos), reports and generated scene list
 *   npm run clean -- --cache   → also remove the downloaded headless browser (node_modules/.remotion)
 *   npm run clean -- --deps    → also remove node_modules (full reset)
 *   npm run clean -- --all     → everything above
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const args = process.argv.slice(2);
const has = (flag) => args.includes(flag) || args.includes('--all');

const targets = [path.join(ROOT, 'out'), path.join(ROOT, 'src', 'scenes.generated.ts')];
if (has('--cache')) targets.push(path.join(ROOT, 'node_modules', '.remotion'));

let removed = 0;
for (const target of targets) {
  if (!fs.existsSync(target)) continue;
  fs.rmSync(target, { recursive: true, force: true });
  console.log(`[clean] removed ${path.relative(ROOT, target)}`);
  removed++;
}

if (has('--deps')) {
  const deps = path.join(ROOT, 'node_modules');
  if (fs.existsSync(deps)) {
    fs.rmSync(deps, { recursive: true, force: true });
    console.log('[clean] removed node_modules');
    removed++;
  }
}

console.log(removed === 0 ? '[clean] nothing to remove — already tidy.' : `[clean] done (${removed} removed).`);
