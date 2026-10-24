#!/usr/bin/env node
/**
 * Renders every HTML file in public/scenes/ to out/<id>.mp4
 *
 * Efficiency notes
 * - The Remotion bundle is built ONCE and reused for every scene.
 * - A single headless browser instance is shared by all compositions.
 * - Each composition is rendered with Remotion's own parallel frame capture
 *   (frames are grabbed concurrently, encoded by ffmpeg afterwards).
 * - `ONLY` env var (comma separated ids or file names) renders a subset, so a
 *   CI matrix can split work across machines.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { ensureBrowser, openBrowser, renderMedia, selectComposition } from '@remotion/renderer';
const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'video.config.json'), 'utf8'));

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'out');
const ENTRY = path.join(ROOT, 'src', 'index.ts');
const OVERWRITE = process.env.OVERWRITE !== '0';

const readScenes = () => {
  const file = path.join(ROOT, 'src', 'scenes.generated.ts');
  const source = fs.readFileSync(file, 'utf8');
  const match = source.match(/export const SCENES: Scene\[\] = (\[[\s\S]*?\n\]);/);
  if (!match) throw new Error('Could not parse src/scenes.generated.ts — run `npm run scan` first.');
  return JSON.parse(match[1]);
};

const log = (...args) => console.log('[render]', ...args);
const fail = (message) => {
  console.error(`\n[render] ✖ ${message}`);
  process.exit(1);
};

const main = async () => {
  const allScenes = readScenes();
  if (allScenes.length === 0) fail('No HTML files in public/scenes/. Nothing to render.');

  const only = (process.env.ONLY ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const scenes = only.length
    ? allScenes.filter((scene) =>
        only.some(
          (want) =>
            want === scene.id ||
            want === scene.file ||
            want === path.basename(scene.file) ||
            path.basename(scene.file, '.html') === want,
        ),
      )
    : allScenes;

  if (scenes.length === 0) {
    fail(`ONLY=${process.env.ONLY} did not match any scene. Available: ${allScenes.map((s) => s.id).join(', ')}`);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const concurrency = process.env.CONCURRENCY || config.concurrency;
  const totalSeconds = config.durationInSeconds;

  log(`Remotion ${require_pkg_version()}`);
  log(`Format: ${config.width}x${config.height} @ ${config.fps}fps, ${totalSeconds}s (${config.fps * totalSeconds} frames)`);
  log(`Scenes to render: ${scenes.length}`);
  log(`Concurrency: ${concurrency} (cpus: ${os.cpus().length})`);

  log('Ensuring headless browser…');
  await ensureBrowser();

  log('Building Remotion bundle (once for all scenes)…');
  const t0 = Date.now();
  const serveUrl = await bundle({
    entryPoint: ENTRY,
    publicDir: path.join(ROOT, 'public'),
    onProgress: (percent) => {
      if (percent % 25 === 0) log(`  bundle ${percent}%`);
    },
  });
  log(`Bundle ready in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const browser = await openBrowser('chrome', {
    chromiumOptions: { gl: config.gl, enableMultiProcessOnLinux: true },
  });

  const results = [];
  const startedAt = Date.now();

  try {
    for (const [index, scene] of scenes.entries()) {
      const outputLocation = path.join(OUT_DIR, `${scene.id}.mp4`);
      log(`\n[${index + 1}/${scenes.length}] ${scene.file} → ${path.relative(ROOT, outputLocation)}`);

      const inputProps = {
        file: scene.file,
        audio: scene.audio ?? null,
        loopSeconds: config.loopSeconds,
      };

      const composition = await selectComposition({
        serveUrl,
        id: scene.id,
        inputProps,
        puppeteerInstance: browser,
        chromiumOptions: { gl: config.gl },
      });

      const sceneStart = Date.now();
      let lastLogged = -1;

      await renderMedia({
        composition,
        serveUrl,
        codec: config.codec,
        outputLocation,
        inputProps,
        puppeteerInstance: browser,
        chromiumOptions: { gl: config.gl, enableMultiProcessOnLinux: true },
        concurrency,
        scale: config.scale ?? 1,
        crf: config.crf,
        imageFormat: config.imageFormat,
        ...(config.imageFormat === 'jpeg' ? { jpegQuality: config.jpegQuality ?? 90 } : {}),
        x264Preset: config.x264Preset,
        pixelFormat: config.pixelFormat ?? 'yuv420p',
        colorSpace: config.colorSpace ?? 'bt709',
        audioCodec: scene.audio ? 'aac' : null,
        muted: !scene.audio,
        enforceAudioTrack: false,
        overwrite: OVERWRITE,
        logLevel: 'info',
        timeoutInMilliseconds: 120_000,
        onProgress: ({ progress, encodedFrames, renderedFrames, stitchStage }) => {
          const step = Math.floor(progress * 10) * 10;
          if (step > lastLogged && step < 100) {
            lastLogged = step;
            log(
              `  ${String(step).padStart(3)}%  rendered ${renderedFrames}/${composition.durationInFrames}` +
                (stitchStage === 'encoding' ? `  (encoding ${encodedFrames})` : ''),
            );
          }
        },
      });

      const size = fs.statSync(outputLocation).size;
      const seconds = (Date.now() - sceneStart) / 1000;
      log(`  ✔ done in ${seconds.toFixed(1)}s — ${(size / 1024 / 1024).toFixed(1)} MB`);
      results.push({ id: scene.id, file: path.relative(ROOT, outputLocation), size, seconds });
    }
  } finally {
    await browser.close({ silent: true });
  }

  const summary = {
    renderedAt: new Date().toISOString(),
    width: config.width,
    height: config.height,
    fps: config.fps,
    durationInSeconds: totalSeconds,
    totalSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(1)),
    videos: results,
  };
  fs.writeFileSync(path.join(OUT_DIR, 'render-report.json'), JSON.stringify(summary, null, 2));

  log(`\n✔ Rendered ${results.length} video(s) in ${summary.totalSeconds}s total.`);
  for (const r of results) log(`   ${r.file}  (${(r.size / 1024 / 1024).toFixed(1)} MB)`);
};

function require_pkg_version() {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', 'remotion', 'package.json'), 'utf8')).version;
  } catch {
    return '(version unknown)';
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
