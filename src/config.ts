import config from '../video.config.json';

export type VideoConfig = {
  width: number;
  height: number;
  fps: number;
  durationInSeconds: number;
  backgroundColor: string;
  loopSeconds: number | null;
  /** Multiplier used only by fixed-size HTML inputs; TSX uses native output dimensions. */
  scale?: number;
};

export const VIDEO = config as VideoConfig;

export const DURATION_IN_FRAMES = Math.max(1, Math.round(VIDEO.fps * VIDEO.durationInSeconds));
