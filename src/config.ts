import config from '../video.config.json';

export type VideoConfig = {
  width: number;
  height: number;
  fps: number;
  durationInSeconds: number;
  backgroundColor: string;
  loopSeconds: number | null;
};

export const VIDEO = config as VideoConfig;

export const DURATION_IN_FRAMES = Math.max(1, Math.round(VIDEO.fps * VIDEO.durationInSeconds));
