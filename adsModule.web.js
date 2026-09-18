// Web stub. react-native-google-mobile-ads has no web implementation at
// all (it's a native mobile ad SDK wrapper) - and critically, its own
// internals import react-native/Libraries/Utilities/codegenNativeComponent,
// which Metro's web bundler cannot resolve at all. Gating the require()
// at runtime with Platform.OS/ADS_ENABLED checks does NOT stop Metro from
// trying to statically bundle the module for the web target - Metro walks
// the whole require() graph regardless of any runtime conditional
// wrapping it. This file's entire purpose is having ZERO reference to
// that package anywhere in its source, so Metro's web bundler literally
// never has a reason to look at it. Same mechanism this project's own
// pdfThumbnails.web.js/.native.js pair already uses, just the opposite
// direction (there, the real logic is on the web side).
export const NativeAdCard = () => null;

export const initAds = () => {};
