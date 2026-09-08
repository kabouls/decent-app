module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      // unstable_transformImportMeta converts `import.meta` usage into
      // something Metro/Hermes can actually handle, instead of passing
      // the raw syntax through and failing with "import.meta may only
      // appear in a module" - which is exactly what pdfjs-dist's own
      // internal code was hitting on web. This is Expo's own documented
      // fix for this exact error (becomes the default in SDK 56 - this
      // project is on SDK 54, so it needs to be turned on explicitly
      // for now). No babel.config.js existed before this, so there's
      // nothing else here to preserve - this is Expo's standard minimal
      // config with just this one option added.
      ['babel-preset-expo', { unstable_transformImportMeta: true }]
    ]
  };
};
