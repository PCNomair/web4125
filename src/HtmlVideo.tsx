import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  AbsoluteFill,
  Audio,
  continueRender,
  delayRender,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { VIDEO } from './config';
import { buildSeekableDocument } from './timeline';
import { realRaf, seekTo, waitForPageReady } from './seek';

export type HtmlVideoProps = {
  /** Path inside public/, e.g. "scenes/1.html" */
  file: string;
  /** Optional audio track inside public/, set automatically by the scanner */
  audio?: string | null;
  /** Repeat the HTML timeline every N seconds (null = one continuous timeline) */
  loopSeconds?: number | null;
};

export const HtmlVideo: React.FC<HtmlVideoProps> = ({ file, audio, loopSeconds }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const lastTimeRef = useRef<number>(-1);
  const pendingTimeRef = useRef<number>(0);
  const loadedAtRef = useRef<number>(0);

  const [srcdoc, setSrcdoc] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [ready, setReady] = useState(false);

  const [loadHandle, setLoadHandle] = useState(() =>
    delayRender(`Loading ${file}`, { timeoutInMilliseconds: 180_000 }),
  );

  const url = staticFile(file);

  // Fetch the HTML once and inline it together with the virtual clock.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const html = await response.text();
        const baseHref = new URL(url, window.location.href).href.replace(/[^/]*$/, '');
        if (!cancelled) setSrcdoc(buildSeekableDocument(html, baseHref));
      } catch (err) {
        console.error(`[html-video] could not load ${file}:`, err);
        if (!cancelled) setSrcdoc(`<body style="background:#000;color:#f66;font:24px sans-serif;padding:40px">Failed to load ${file}</body>`);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [url, file]);

  // Bring a freshly loaded page to `seconds`. The virtual clock starts at 0 with
  // the page's own timers queued, so a single advance is enough — never clear it.
  const replayTo = useCallback(
    async (doc: Document, seconds: number) => {
      seekTo(doc, seconds, VIDEO.durationInSeconds, { loopSeconds });
      await realRaf(doc.defaultView as never);
    },
    [loopSeconds],
  );

  const onLoad = useCallback(() => {
    const doc = iframeRef.current?.contentDocument ?? null;
    if (!doc) {
      setReady(true);
      loadedAtRef.current = performance.now();
      continueRender(loadHandle);
      return;
    }
    waitForPageReady(doc)
      .catch((err) => console.error('[html-video] readiness failed:', err))
      .then(async () => {
        const target = pendingTimeRef.current;
        try {
          await replayTo(doc, target);
        } catch (err) {
          console.error('[html-video] initial seek failed:', err);
        }
        lastTimeRef.current = target;
        loadedAtRef.current = performance.now();
        setReady(true);
        continueRender(loadHandle);
      });
  }, [loadHandle, replayTo]);

  // Seek once per frame, then wait for an actual paint before the screenshot.
  useLayoutEffect(() => {
    if (!ready || !srcdoc) return;
    const doc = iframeRef.current?.contentDocument ?? null;
    const seconds = frame / fps;

    const handle = delayRender(`frame ${frame}`, { timeoutInMilliseconds: 90_000 });

    if (!doc) {
      realRaf(null).then(() => continueRender(handle));
      return;
    }

    if (seconds + 1e-6 < lastTimeRef.current) {
      // Frames should arrive in ascending order; if one doesn't, rebuild the
      // document so the JS timeline can be replayed deterministically.
      console.warn(`[html-video] backward frame ${frame} (${seconds}s < ${lastTimeRef.current}s) — reloading`);
      pendingTimeRef.current = seconds;
      lastTimeRef.current = seconds;
      setReady(false);
      setLoadHandle(delayRender(`reload for frame ${frame}`, { timeoutInMilliseconds: 180_000 }));
      setVersion((v) => v + 1);
      continueRender(handle);
      return;
    }

    try {
      seekTo(doc, seconds, VIDEO.durationInSeconds, { loopSeconds });
    } catch (err) {
      console.error('[html-video] seek failed:', err);
    }
    lastTimeRef.current = seconds;

    realRaf(doc.defaultView as never).then(() => continueRender(handle));
  }, [frame, fps, ready, srcdoc, loopSeconds]);

  return (
    <AbsoluteFill style={{ backgroundColor: VIDEO.backgroundColor }}>
      {srcdoc ? (
        <iframe
          key={version}
          ref={iframeRef}
          srcDoc={srcdoc}
          title={file}
          onLoad={onLoad}
          scrolling="no"
          style={{
            width,
            height,
            border: 'none',
            display: 'block',
            overflow: 'hidden',
            pointerEvents: 'none',
            backgroundColor: VIDEO.backgroundColor,
          }}
        />
      ) : null}
      {audio ? <Audio src={staticFile(audio)} /> : null}
    </AbsoluteFill>
  );
};
