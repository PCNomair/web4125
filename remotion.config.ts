import { Config } from '@remotion/cli/config';
import config from './video.config.json';

Config.setVideoImageFormat(config.imageFormat as 'jpeg' | 'png');
Config.setJpegQuality(config.jpegQuality);
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
