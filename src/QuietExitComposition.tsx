// React/TypeScript video composition.
import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

export const QuietExitComposition: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // --- Dynamic Color Palette ---
  const BG_COLOR = '#0D0C0B';
  const TEXT_MAIN = '#F5F2EB';
  const ACCENT_GOLD = '#C5A880';
  const MUTED_GRAY = '#6E6A63';

  // --- Animation Springs & Interpolations ---
  // Section 1: 02:14 AM and Subtitle (0 - 150 frames)
  const introOpacity = interpolate(frame, [0, 20, 130, 150], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const timeSpring = spring({
    frame,
    fps,
    config: { damping: 15, mass: 0.8 },
  });

  // Section 2: Emotional Equation / Kinetic Graph (130 - 390 frames)
  const graphProgress = interpolate(frame, [140, 240], [0, 100], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const graphOpacity = interpolate(frame, [130, 150, 370, 390], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Section 3: The Quiet Exit Core Message (370 - 580 frames)
  const coreMessageOpacity = interpolate(frame, [380, 410, 560, 580], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const coreTextTranslate = interpolate(frame, [380, 410], [40, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Section 4: Outro / Brand Identity (570 - 750 frames)
  const outroOpacity = interpolate(frame, [575, 605], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: BG_COLOR,
        fontFamily: "'IBM Plex Sans Arabic', 'Tajawal', sans-serif",
        color: TEXT_MAIN,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '0 80px',
        direction: 'rtl',
      }}
    >
      {/* Subtle Background Glow Accent */}
      <div
        style={{
          position: 'absolute',
          width: 500,
          height: 500,
          borderRadius: '50%',
          background: `radial-gradient(circle, rgba(197, 168, 128, 0.06) 0%, transparent 70%)`,
          pointerEvents: 'none',
        }}
      />

      {/* --- ACT 1: The Midnight Reality --- */}
      {frame < 160 && (
        <div
          style={{
            opacity: introOpacity,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 20,
          }}
        >
          <div
            style={{
              fontSize: 32,
              letterSpacing: 6,
              color: MUTED_GRAY,
              fontVariantNumeric: 'tabular-nums',
              transform: `scale(${timeSpring})`,
            }}
          >
            02:14 AM
          </div>
          <h2
            style={{
              fontSize: 48,
              fontWeight: 400,
              lineHeight: 1.5,
              textAlign: 'center',
              color: TEXT_MAIN,
              maxWidth: 800,
            }}
          >
            حرب باردة.. ما يدري عنها أحد
          </h2>
        </div>
      )}

      {/* --- ACT 2: Kinetic Metric (Energy vs Breadcrumbs) --- */}
      {frame >= 130 && frame < 400 && (
        <div
          style={{
            opacity: graphOpacity,
            width: '100%',
            maxWidth: 820,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <span
            style={{
              fontSize: 26,
              color: ACCENT_GOLD,
              letterSpacing: 2,
              marginBottom: 40,
            }}
          >
            معادلة الاستنزاف
          </span>

          <svg width="700" height="200" viewBox="0 0 700 200" fill="none">
            {/* Guide Grid */}
            <line x1="0" y1="180" x2="700" y2="180" stroke="#252320" strokeWidth="2" />
            
            {/* Depleting Investment Curve */}
            <path
              d="M 50 30 C 250 30, 450 160, 650 160"
              stroke={MUTED_GRAY}
              strokeWidth="3"
              strokeDasharray="600"
              strokeDashoffset={600 - (graphProgress / 100) * 600}
            />

            {/* Glowing Focal Node */}
            {graphProgress > 70 && (
              <circle
                cx="650"
                cy="160"
                r="6"
                fill={ACCENT_GOLD}
                style={{
                  filter: 'drop-shadow(0 0 10px rgba(197, 168, 128, 0.8))',
                }}
              />
            )}
          </svg>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              width: '650px',
              marginTop: 20,
              fontSize: 22,
              color: MUTED_GRAY,
            }}
          >
            <span>عطاؤك المستمر</span>
            <span>فتات الاهتمام</span>
          </div>
        </div>
      )}

      {/* --- ACT 3: The Quiet Dignity Revelation --- */}
      {frame >= 370 && frame < 590 && (
        <div
          style={{
            opacity: coreMessageOpacity,
            transform: `translateY(${coreTextTranslate}px)`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: 30,
          }}
        >
          <div
            style={{
              width: 48,
              height: 2,
              backgroundColor: ACCENT_GOLD,
            }}
          />
          <h1
            style={{
              fontSize: 54,
              fontWeight: 500,
              lineHeight: 1.6,
              color: TEXT_MAIN,
              maxWidth: 850,
            }}
          >
            الانسحاب الهادئ ما كان بيوم ضعف..
            <br />
            <span style={{ color: ACCENT_GOLD }}>الانسحاب كان استرداد لهيبتك.</span>
          </h1>
        </div>
      )}

      {/* --- ACT 4: Elegant Identity Stamp (Outro) --- */}
      {frame >= 570 && (
        <div
          style={{
            opacity: outroOpacity,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 24,
          }}
        >
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: '50%',
              backgroundColor: ACCENT_GOLD,
              boxShadow: '0 0 20px rgba(197, 168, 128, 0.6)',
            }}
          />
          <h3
            style={{
              fontSize: 42,
              fontWeight: 400,
              letterSpacing: 4,
              color: TEXT_MAIN,
              margin: 0,
            }}
          >
            مَلاذ
          </h3>
          <p
            style={{
              fontSize: 24,
              color: MUTED_GRAY,
              letterSpacing: 1.5,
              margin: 0,
            }}
          >
            بروتوكول الـ 21 يوماً للتشافي الصامت
          </p>
        </div>
      )}
    </AbsoluteFill>
  );
};