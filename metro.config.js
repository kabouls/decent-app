const { getSentryExpoConfig } = require("@sentry/react-native/metro");
const path = require("path");

const config = getSentryExpoConfig(__dirname);

// pdf-lib's ESM build (es/) uses a tslib-based interop pattern
// (tslib.default) that crashes at runtime under Metro - "tslib.default
// is undefined" - even though pdf-lib's own package.json correctly
// declares "main": "cjs/index.js" (its working CommonJS build).
// resolverMainFields alone did not fix this even after a full cache
// clear, which means something in this Metro/Expo version's resolution
// pipeline is choosing an ESM-oriented entry for `import` statements
// regardless of main-field priority (most likely a package-exports-
// style condition, even though pdf-lib has no "exports" field of its
// own to trigger that normally). Rather than fight that heuristic
// further, this intercepts resolution for the literal string "pdf-lib"
// and points it directly at the known-good CJS file, sidestepping
// whatever is choosing the ESM path.
const upstreamResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "pdf-lib") {
    return {
      type: "sourceFile",
      filePath: path.resolve(__dirname, "node_modules/pdf-lib/cjs/index.js"),
    };
  }
  if (upstreamResolveRequest) {
    return upstreamResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
