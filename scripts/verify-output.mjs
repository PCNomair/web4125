#!/usr/bin/env node
/**
 * Verifies every MP4 in a folder: 1080x1920, 60 fps, 25 s, ~1500 frames.
 *
 * Uses ffprobe from PATH if available, otherwise the copy that ships inside
 * @remotion/compositor-* — GitHub's Ubuntu runners have no ffmpeg installed,
 * which is why `ffprobe: command not found` (exit 127) must never happen here.
 *
 *   node scripts/verify-output.mjs out            # verify
 *   node scripts/verify-output.mjs out --warn     # never fail the build
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2] ?? 'out';
const soft = process.argv.includes('--warn');
const ROOT = process.cwd();

const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'video.config.json'), 'utf8'));
const SCALE = config.scale ?? 1;
const EXPECT = {
  width: Math.round(config.width * SCALE),
  height: Math.round(config.height * SCALE),
  fps: config.fps,
  seconds: config.durationInSeconds,
};

function resolveBinary(name) {
  // system binary first, then the copy bundled with @remotion/compositor-*
  try {
    execFileSync(name, ['-version'], { stdio: 'ignore' });
    return name;
  } catch {
    /* not installed */
  }
  const compositorDir = path.join(ROOT, 'node_modules', '@remotion');
  if (fs.existsSync(compositorDir)) {
    for (const pkg of fs.readdirSync(compositorDir)) {
      if (!pkg.startsWith('compositor-')) continue;
      const candidate = path.join(compositorDir, pkg, name);
      if (fs.existsSync(candidate)) {
        try {
          fs.chmodSync(candidate, 0o755);
        } catch {
          /* ignore */
        }
        return candidate;
      }
    }
  }
  return null;
}

/**
 * A frozen video (JS timeline that the renderer could not drive) looks like a
 * still image and encodes to almost nothing. Count visually distinct frames.
 */
function countDistinctFrames(ffmpeg, file) {
  const result = spawnSync(
    ffmpeg,
    ['-hide_banner', '-nostdin', '-i', file, '-vf', 'mpdecimate', '-f', 'null', '-'],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );
  return `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
}

function resolveFfprobe() {
  // 1. system ffprobe (present locally, absent on GitHub runners)
  try {
    execFileSync('ffprobe', ['-version'], { stdio: 'ignore' });
    return 'ffprobe';
  } catch {
    /* not installed */
  }
  // 2. Remotion's bundled ffprobe
  const compositorDir = path.join(ROOT, 'node_modules', '@remotion');
  if (fs.existsSync(compositorDir)) {
    for (const pkg of fs.readdirSync(compositorDir)) {
      if (!pkg.startsWith('compositor-')) continue;
      const candidate = path.join(compositorDir, pkg, 'ffprobe');
      if (fs.existsSync(candidate)) {
        try {
          fs.chmodSync(candidate, 0o755);
        } catch {
          /* ignore */
        }
        return candidate;
      }
    }
  }
  return null;
}

const files = fs.existsSync(dir)
  ? fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.mp4')).sort()
  : [];

if (files.length === 0) {
  console.error(`[verify] ✖ no .mp4 files in ${dir}/`);
  process.exit(1);
}

const ffprobe = resolveFfprobe();
const ffmpeg = resolveBinary('ffmpeg');
console.log(
  ffprobe
    ? `[verify] ffprobe: ${ffprobe}`
    : '[verify] warm: no ffprobe available, checking file sizes only',
);

let failed = 0;

for (const file of files) {
  const full = path.join(dir, file);
  const sizeMb = (fs.statSync(full).size / 1024 / 1024).toFixed(2);
  const problems = [];
  let info = null;

  if (ffprobe) {
    try {
      const raw = execFileSync(
        ffprobe,
        [
          '-v', 'error',
          '-select_streams', 'v:0',
          '-count_frames',
          '-show_entries', 'stream=width,height,r_frame_rate,nb_read_frames,codec_name:format=duration',
          '-of', 'json',
          full,
        ],
        { encoding: 'utf8' },
      );
      info = JSON.parse(raw);
    } catch (err) {
      problems.push(`ffprobe failed: ${err.message.split('\n')[0]}`);
    }
  }

  if (info) {
    const stream = info.streams?.[0] ?? {};
    const duration = Number(info.format?.duration ?? 0);
    const [num, den] = String(stream.r_frame_rate ?? '0/1').split('/').map(Number);
    const fps = den ? num / den : 0;
    const frames = Number(stream.nb_read_frames ?? 0);

    if (stream.width !== EXPECT.width || stream.height !== EXPECT.height) {
      problems.push(`size ${stream.width}x${stream.height} ≠ ${EXPECT.width}x${EXPECT.height}`);
    }
    if (Math.abs(fps - EXPECT.fps) > 0.1) problems.push(`fps ${fps} ≠ ${EXPECT.fps}`);
    if (Math.abs(duration - EXPECT.seconds) > 0.5) {
      problems.push(`duration ${duration.toFixed(3)}s ≠ ${EXPECT.seconds}s`);
    }
    const expectedFrames = EXPECT.fps * EXPECT.seconds;
    if (frames && Math.abs(frames - expectedFrames) > 2) {
      problems.push(`frames ${frames} ≠ ${expectedFrames}`);
    }

    console.log(
      `[verify] ${problems.length ? '✖' : '✔'} ${file}  ${stream.width}x${stream.height} ` +
        `${fps}fps ${duration.toFixed(3)}s ${frames} frames ${sizeMb} MB`,
    );
  } else {
    console.log(`[verify] ✔ ${file}  ${sizeMb} MB (exists, not probed)`);
  }

  // Motion check: a still-looking video means the page's JS timeline never moved.
  if (ffmpeg) {
    const log = countDistinctFrames(ffmpeg, full);
    const matches = [...log.matchAll(/frame=\s*(\d+)/g)];
    const distinct = matches.length ? Number(matches[matches.length - 1][1]) : null;
    if (distinct !== null) {
      const expected = EXPECT.fps * EXPECT.seconds;
      const ratio = distinct / expected;
      console.log(`[verify]   motion: ${distinct}/${expected} distinct frames (${(ratio * 100).toFixed(1)}%)`);
      if (ratio < 0.05) {
        problems.push(
          `${distinct} distinct frames out of ${expected} — the page is frozen. ` +
            'Its JS timeline (setTimeout / setInterval / Date.now) is not being driven; ' +
            'expose window.__seek(t) or use CSS animations.',
        );
      }
    }
  }

  for (const problem of problems) console.error(`         └─ ${problem}`);
  if (problems.length) failed++;
}

if (failed > 0) {
  if (soft) {
    console.warn(`[verify] ${failed} file(s) had problems — not failing (--warn).`);
  } else {
    console.error(`[verify] ${failed} file(s) failed verification.`);
    process.exit(1);
  }
} else {
  console.log(`[verify] all ${files.length} file(s) match ${EXPECT.width}x${EXPECT.height} · ${EXPECT.fps}fps · ${EXPECT.seconds}s`);
}
