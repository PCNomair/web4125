/**
 * Deterministic time-travel for a page inside the render iframe.
 *
 * Two timelines have to be moved together:
 *
 *  1. the JS timeline — `setTimeout` / `setInterval` / `requestAnimationFrame` /
 *     `Date.now`, handled by the virtual clock injected in timeline.ts. Seeking
 *     means "fire every timer due up to t, in order".
 *  2. the CSS timeline — animations and transitions. Every animation is paused
 *     and its `currentTime` is set relative to the virtual moment it was created,
 *     so elements injected at 13.2 s by a timer still start their animation at
 *     exactly 13.2 s of video time instead of wherever the wall clock was.
 */

type VirtualWindow = Window & {
  __advanceTo?: (target: number) => number;
  __vnow?: () => number;
  __resetClock?: () => void;
  __lastFiredAt?: number;
  __seek?: (t: number, meta?: Record<string, unknown>) => void;
  __ready?: unknown;
};

const animationStarts = new WeakMap<Animation, number>();

const win = (doc: Document): VirtualWindow | null => doc.defaultView as VirtualWindow | null;

const realRaf = (w: VirtualWindow | null): Promise<void> =>
  new Promise((resolve) => {
    const raf = (w && (w as unknown as { __realRaf?: (cb: FrameRequestCallback) => number }).__realRaf) || requestAnimationFrame;
    raf(() => raf(() => resolve()));
  });

/** Pause every animation and remember the virtual moment it appeared. */
const syncAnimations = (doc: Document, virtualNow: number): void => {
  let animations: Animation[] = [];
  try {
    animations = doc.getAnimations();
  } catch {
    return;
  }
  for (const animation of animations) {
    if (!animationStarts.has(animation)) animationStarts.set(animation, virtualNow);
  }
};

export const waitForPageReady = async (doc: Document, timeoutMs = 60_000): Promise<void> => {
  const w = win(doc);

  try {
    await doc.fonts.ready;
  } catch {
    /* older engines */
  }

  await Promise.all(
    Array.from(doc.images ?? []).map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.addEventListener('load', () => resolve(), { once: true });
            img.addEventListener('error', () => resolve(), { once: true });
          }),
    ),
  );

  const ready = w?.__ready;
  if (ready && typeof (ready as Promise<unknown>).then === 'function') {
    await Promise.race([
      (ready as Promise<unknown>).catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  }

  await realRaf(w);
};

/**
 * Move the page to `seconds` of video time.
 * The virtual clock only moves forward; `reset` re-starts it from zero (needed
 * if the renderer ever asks for an earlier frame than the current one).
 */
export const seekTo = (
  doc: Document,
  seconds: number,
  durationInSeconds: number,
  options: { loopSeconds?: number | null } = {},
): void => {
  const w = win(doc);
  if (!w) return;

  const loop = options.loopSeconds && options.loopSeconds > 0 ? options.loopSeconds : null;
  const t = loop ? ((seconds % loop) + loop) % loop : seconds;
  const targetMs = Math.round(t * 1000);

  // 1. virtual JS timeline: fire every timer due up to t
  let virtualNow = targetMs;
  try {
    if (typeof w.__advanceTo === 'function') virtualNow = w.__advanceTo(targetMs);
  } catch (err) {
    console.error('[html-video] virtual clock advance failed:', err);
  }

  // 2. register animations that appeared during this advance. Anchor them to the
  //    virtual moment the timer that injected them fired, so a scene swapped in at
  //    4.4 s starts its 0.65 s entrance at 4.4 s of video time.
  const lastFired = typeof w.__lastFiredAt === 'number' ? w.__lastFiredAt : -1;
  syncAnimations(doc, lastFired >= 0 ? lastFired : virtualNow);

  // 3. CSS timeline: pause + seek relative to each animation's virtual birth
  const progress = durationInSeconds > 0 ? Math.min(1, Math.max(0, t / durationInSeconds)) : 0;
  const root = doc.documentElement;
  if (root) {
    root.style.setProperty('--remotion-time', `${t}s`);
    root.style.setProperty('--t', `${t}s`);
    root.style.setProperty('--remotion-progress', `${progress}`);
  }

  let animations: Animation[] = [];
  try {
    animations = doc.getAnimations();
  } catch {
    animations = [];
  }
  for (const animation of animations) {
    const start = animationStarts.get(animation) ?? 0;
    try {
      animation.pause();
      animation.currentTime = Math.max(0, virtualNow - start);
    } catch {
      /* unseekable animation */
    }
  }

  // 4. <video>/<audio> elements hold the matching frame
  doc.querySelectorAll('video, audio').forEach((media) => {
    const el = media as HTMLMediaElement;
    try {
      el.pause();
      el.muted = true;
      const mediaDuration = el.duration;
      if (Number.isFinite(mediaDuration) && mediaDuration > 0) el.currentTime = t % mediaDuration;
    } catch {
      /* ignore */
    }
  });

  // 5. author hook + DOM event
  if (typeof w.__seek === 'function') {
    try {
      w.__seek(t, { progress, duration: durationInSeconds });
    } catch (err) {
      console.error('[html-video] window.__seek() threw:', err);
    }
  }
  try {
    const EventCtor: typeof CustomEvent =
      (w as Window & { CustomEvent: typeof CustomEvent }).CustomEvent ?? CustomEvent;
    doc.dispatchEvent(new EventCtor('remotion-seek', { detail: { time: t, progress, duration: durationInSeconds } }));
  } catch {
    /* ignore */
  }
};

export { realRaf };
