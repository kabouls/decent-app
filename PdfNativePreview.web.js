// Web never renders this component - every usage in App.js is inside a
// Platform.OS !== 'web' branch. This file exists purely so Metro's
// .web.js/.native.js platform-extension resolution has something to
// pick for the web bundle, instead of resolving to the native file -
// which imports a package with no web build at all.
export default function PdfNativePreview() {
  return null;
}
