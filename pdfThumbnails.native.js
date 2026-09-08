// See pdfThumbnails.web.js for why this is a separate platform-extension
// file rather than a single shared file with a runtime Platform.OS
// check - the same reasoning applies in reverse here: react-native-pdf-
// thumbnail is a native module with no web implementation, and keeping
// it out of a file the web bundle ever touches avoids the equivalent
// resolution problem on that side.

export const generateWebPdfThumbnails = async () => null;

// size is the width in pixels react-native-pdf-thumbnail renders each
// page at - defaults to the small grid-tile size, but PDF compression
// needs a much larger render (the whole point is a readable page, not a
// thumbnail), so it's a parameter rather than hardcoded.
export const generateNativePdfThumbnails = async (uri, size = 70) => {
  try {
    const PdfThumbnail = require('react-native-pdf-thumbnail').default;
    const results = await PdfThumbnail.generateAllPages(uri, size);
    return results.map((r) => r.uri);
  } catch (e) {
    console.warn('Native PDF thumbnail generation failed (needs a native rebuild if the dependency was just added):', e);
    return null;
  }
};
