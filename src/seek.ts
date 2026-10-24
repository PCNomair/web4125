/**
 * Deterministic time-travel for an HTML document living inside an <iframe>.
 *
 * The problem: an HTML file animates in real time, but a renderer needs frame
 * N to be pixel-identical every single time it is captured (and frames are
 * captured out of order, in parallel, across several browser tabs).
 *
 * The solution:
 *  1. Freeze the document — every CSS animation is paused, transitions are
 *     zeroed, media is paused, scrollbars are hidden.
 *  2. Seek — all Web Animations (CSS animations, WAAPI, ::before/::after) get
 *     `currentTime = t`. This is exact, delay-aware and cheap.
 *  3. Notify — `--remotion-time` / `--t` CSS variables, a `remotion-seek` DOM
 *     event and an optional author hook `window.__seek(t)` for canvas/JS scenes.
 */

const STYLE_ID = 'remotion-seek-engine';

const FREEZE_CSS = `
*, *::before, *::after {
  animation-play-state: paused !important;
  transition-duration: 0s !important;
  transition-delay: 0s !important;
  caret-color: transparent !important;
  scroll-behavior: auto !important;
}
html, body { scrollbar-width: none !important; }
::-webkit-scrollbar { width: 0 !important; height: 0 !important; }
`;

export const installSeekEngine = (doc: Document): void => {
  if (!doc.head || doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = FREEZE_CSS;
  doc.head.appendChild(style);
};

const raf = (): Promise<void> =>
  new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

/** Wait until fonts, images and (if provided) window.__ready are done. */
export const waitForReady = async (doc: Document, timeoutMs = 60_000): Promise<void> => {
  const win = doc.defaultView as (Window & {
    __ready?: Promise<unknown>;
    __seek?: (t: number) => void;
  }) | null;
  if (!win) return;

  try {
    await doc.fonts.ready;
  } catch {
    /* older engines */
  }

  const images = Array.from(doc.images ?? []);
  await Promise.all(
    images.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.addEventListener('load', () => resolve(), { once: true });
            img.addEventListener('error', () => resolve(), { once: true });
          }),
    ),
  );

  if (win.__ready && typeof (win.__ready as Promise<unknown>).then === 'function') {
    await Promise.race([
      win.__ready.catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  }

  await raf();
};

/**
 * Move the iframe document to `seconds`.
 * `loopSeconds` > 0 makes a shorter HTML animation repeat inside the video.
 */
export const seekTo = (
  doc: Document,
  seconds: number,
  loopSeconds?: number | null,
  totalSeconds?: number,
): void => {
  const t =
    loopSeconds && loopSeconds > 0 ? ((seconds % loopSeconds) + loopSeconds) % loopSeconds : seconds;
  const ms = t * 1000;
  const win = doc.defaultView as (Window & {
    __seek?: (t: number, meta?: Record<string, unknown>) => void;
  }) | null;
  const root = doc.documentElement;
  if (!root) return;

  const progress = totalSeconds && totalSeconds > 0 ? Math.min(1, Math.max(0, seconds / totalSeconds)) : 0;

  root.style.setProperty('--remotion-time', `${t}s`);
  root.style.setProperty('--t', `${t}s`);
  root.style.setProperty('--remotion-progress', `${progress}`);

  // 1. Pausing + seeking every CSS/WAAPI animation on the page (incl. pseudo elements).
  let animations: Animation[] = [];
  try {
    animations = doc.getAnimations();
  } catch {
    animations = [];
  }
  for (const animation of animations) {
    try {
      animation.pause();
      animation.currentTime = ms;
    } catch {
      /* ignore unseekable animations */
    }
  }

  // 2. <video>/<audio> tags: hold them at the matching frame.
  doc.querySelectorAll('video, audio').forEach((media) => {
    const el = media as HTMLMediaElement;
    try {
      el.pause();
      el.muted = true;
      const duration = el.duration;
      if (Number.isFinite(duration) && duration > 0) {
        el.currentTime = t % duration;
      }
    } catch {
      /* ignore */
    }
  });

  // 3. Author hook — required for <canvas>/WebGL/JS-driven scenes.
  if (win && typeof win.__seek === 'function') {
    try {
      win.__seek(t, { progress, duration: totalSeconds });
    } catch (err) {
      console.error('[html-video] window.__seek() threw:', err);
    }
  }

  // 4. Generic hook for anything else listening (same-realm CustomEvent).
  try {
    const EventCtor: typeof CustomEvent =
      (win as (Window & { CustomEvent: typeof CustomEvent }) | null)?.CustomEvent ?? CustomEvent;
    doc.dispatchEvent(
      new EventCtor('remotion-seek', { detail: { time: t, progress, duration: totalSeconds } }),
    );
  } catch {
    /* ignore */
  }
};

export { raf };
