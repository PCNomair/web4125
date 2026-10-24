import React from 'react';
import { Composition } from 'remotion';
import { HtmlVideo } from './HtmlVideo';
import { SCENES } from './scenes.generated';
import { DURATION_IN_FRAMES, VIDEO } from './config';

/** Used when public/scenes/ is empty, so the Studio still opens cleanly. */
const Placeholder: React.FC = () => {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#08090d',
        color: '#8fa6ff',
        fontFamily: 'Helvetica, Arial, sans-serif',
        fontSize: 46,
        textAlign: 'center',
        lineHeight: 1.4,
        padding: 80,
      }}
    >
      Add an .html file to public/scenes/ to create a video.
    </div>
  );
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {SCENES.map((scene) => (
        <Composition
          key={scene.id}
          id={scene.id}
          component={HtmlVideo}
          durationInFrames={DURATION_IN_FRAMES}
          fps={VIDEO.fps}
          width={VIDEO.width}
          height={VIDEO.height}
          defaultProps={{
            file: scene.file,
            audio: scene.audio,
            loopSeconds: VIDEO.loopSeconds,
          }}
        />
      ))}

      {SCENES.length === 0 ? (
        <Composition
          id="empty"
          component={Placeholder}
          durationInFrames={DURATION_IN_FRAMES}
          fps={VIDEO.fps}
          width={VIDEO.width}
          height={VIDEO.height}
        />
      ) : null}
    </>
  );
};
