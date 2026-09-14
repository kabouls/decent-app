// See pdfThumbnails.web.js for why this is a separate platform-extension
// file rather than a single shared file with a runtime Platform.OS
// check.

export const generateWebPdfThumbnails = async () => null;

// Native PDF page thumbnails are intentionally disabled for now.
//
// This previously used react-native-pdf-thumbnail, which turned out to
// be a poor fit for this project: its own README states plainly "this
// module does not work in Expo," and that held up in practice - getting
// it to compile at all required two separate fixes (a Kotlin nullability
// crash on newer Android SDKs, then a namespace mismatch between its
// AndroidManifest.xml and its actual Kotlin package that broke Expo's
// autolinking), and there was no strong reason to expect that was the
// last issue rather than the second of several, given the library
// disclaims Expo support outright.
//
// Every caller of generateNativePdfThumbnails already treats a null
// result as a normal, handled case - falling back to an existing
// thumbnail, showing a plain placeholder icon, or skipping that one page
// - because the same contract already existed for ordinary failures
// (a corrupt page, a render timeout, etc.). Returning null
// unconditionally here means native PDF Editor works in every respect
// except page thumbnails specifically no longer render on native devices
// - everything else (editing, export, compress, and all of it on web via
// pdf.js, which has no relation to this library) is unaffected.
//
// Revisit this with a properly Expo-compatible native rendering approach
// as a separate, focused piece of work - not as another patch bolted
// onto a library that has already cost three separate build failures
// while explicitly telling us it isn't meant to work here.
export const generateNativePdfThumbnails = async () => null;
