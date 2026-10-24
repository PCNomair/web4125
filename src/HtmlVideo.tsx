import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
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
import { installSeekEngine, seekTo, waitForReady } from './seek';

export type HtmlVideoProps = {
  /** Path inside public/, e.g. "scenes/demo.html" */
  file: string;
  /** Optional audio track inside public/, set automatically by the scanner */
  audio?: string | null;
  /** Repeat the HTML animation every N seconds (null = one continuous timeline) */
  loopSeconds?: number | null;
};

/**
 * Renders one HTML file as a full video: the iframe holds the page, and every
 * Remotion frame seeks that page to the matching timestamp before capture.
 */
export const HtmlVideo: React.FC<HtmlVideoProps> = ({ file, audio, loopSeconds }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [docReady, setDocReady] = useState(false);

  // Blocks rendering until the HTML file (and all of its assets) are usable.
  const [loadHandle] = useState(() =>
    delayRender(`Loading ${file}`, { timeoutInMilliseconds: 180_000 }),
  );

  const onLoad = useCallback(() => {
    const doc = iframeRef.current?.contentDocument ?? null;
    if (!doc) {
      // Cross-origin document — cannot drive it frame-by-frame.
      setDocReady(true);
      continueRender(loadHandle);
      return;
    }
    installSeekEngine(doc);
    waitForReady(doc)
      .catch((err) => console.error('[html-video] readiness check failed:', err))
      .then(() => {
        try {
          seekTo(doc, 0, loopSeconds, VIDEO.durationInSeconds);
        } catch (err) {
          console.error('[html-video] initial seek failed:', err);
        }
        setDocReady(true);
        continueRender(loadHandle);
      });
  }, [file, loadHandle, loopSeconds]);

  // Seek once per frame; hold the screenshot until the browser has painted.
  useLayoutEffect(() => {
    if (!docReady) return;
    const handle = delayRender(`Seeking ${file} @ frame ${frame}`, {
      timeoutInMilliseconds: 60_000,
    });
    const doc = iframeRef.current?.contentDocument ?? null;
    if (doc) {
      try {
        seekTo(doc, frame / fps, loopSeconds, VIDEO.durationInSeconds);
      } catch (err) {
        console.error('[html-video] seek failed:', err);
      }
    }
    requestAnimationFrame(() =>
      requestAnimationFrame(() => continueRender(handle)),
    );
  }, [frame, fps, docReady, file, loopSeconds]);

  return (
    <AbsoluteFill style={{ backgroundColor: VIDEO.backgroundColor }}>
      <iframe
        ref={iframeRef}
        src={encodeURI(staticFile(file))}
        title={file}
        onLoad={onLoad}
        onError={() => {
          continueRender(loadHandle);
          setDocReady(true);
        }}
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
      {audio ? <Audio src={staticFile(audio)} /> : null}
    </AbsoluteFill>
  );
};
