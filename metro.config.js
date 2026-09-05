const { getSentryExpoConfig } = require("@sentry/react-native/metro");

const config = getSentryExpoConfig(__dirname);

// The @ffmpeg/ffmpeg package's worker.js uses a Vite-specific
// (/* @vite-ignore */) dynamic import comment that Metro's bundler
// doesn't understand and throws a SyntaxError trying to parse - even
// though this file is never actually meant to run through Metro's
// bundle at all (it's loaded at runtime as a separate Worker script,
// see classWorkerURL in App.js). Stubbing it out here on web stops
// Metro from ever trying to transform the real file; the actual
// working copy is fetched from a CDN at runtime instead.
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName.includes('@ffmpeg/ffmpeg') && moduleName.includes('worker')) {
    return { type: 'empty' };
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;