#!/usr/bin/env node
/**
 * Builds the render plan for a GitHub Actions matrix.
 *
 *   node scripts/plan.mjs             → prints JSON to stdout
 *   node scripts/plan.mjs --github    → appends `matrix=` / `count=` to $GITHUB_OUTPUT
 *   ONLY=a,b node scripts/plan.mjs    → restrict to those scenes (id or file name)
 *
 * Run `npm run scan` first (the workflows do).
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const source = fs.readFileSync(path.join(ROOT, 'src', 'scenes.generated.ts'), 'utf8');
const match = source.match(/export const SCENES: Scene\[\] = (\[[\s\S]*?\n\]);/);
if (!match) {
  console.error('[plan] Could not read src/scenes.generated.ts — run `npm run scan`.');
  process.exit(1);
}

const scenes = JSON.parse(match[1]);
const only = (process.env.ONLY ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const matches = (scene) => (want) =>
  want === scene.id ||
  want === scene.file ||
  want === path.basename(scene.file) ||
  path.basename(scene.file, '.html') === want;

const selected = only.length ? scenes.filter((s) => only.some(matches(s))) : scenes;

if (only.length && selected.length === 0) {
  console.error(
    `[plan] ONLY=${process.env.ONLY} matched nothing. Available: ${scenes.map((s) => s.id).join(', ') || '(none)'}`,
  );
  process.exit(1);
}

const include = selected.map((s) => ({ id: s.id, file: s.file, artifact: `video-${s.id}` }));
const plan = { include, count: include.length };
const payload = JSON.stringify(plan);

if (process.argv.includes('--github')) {
  const out = process.env.GITHUB_OUTPUT;
  if (!out) {
    console.error('[plan] GITHUB_OUTPUT is not set.');
    process.exit(1);
  }
  fs.appendFileSync(out, `matrix=${JSON.stringify(include)}\ncount=${include.length}\n`);
}

process.stdout.write(payload);
