import { Config } from '@remotion/cli/config';
import rawConfig from './video.config.json';

const config = rawConfig as typeof rawConfig & { jpegQuality?: number };

Config.setVideoImageFormat(config.imageFormat as 'jpeg' | 'png');
if (config.imageFormat === 'jpeg') Config.setJpegQuality(config.jpegQuality ?? 90);
Config.setCodec(config.codec as 'h264');
Config.setCrf(config.crf);
Config.setPixelFormat('yuv420p');
Config.setConcurrency(config.concurrency);
Config.setChromiumOpenGlRenderer(config.gl as 'swangle' | 'angle' | 'egl' | 'swiftshader');
Config.overrideWebpackConfig((current) => ({
  ...current,
  module: {
    ...current.module,
    rules: [
      ...(current.module?.rules ?? []),
      {
        test: /\.html$/i,
        type: 'asset/source',
      },
    ],
  },
}));
