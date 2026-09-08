// See pdfThumbnails.web.js for why this is a separate platform-extension
// file rather than a single shared file with a runtime Platform.OS
// check - the same reasoning applies in reverse here: react-native-pdf-
// thumbnail is a native module with no web implementation, and keeping
// it out of a file the web bundle ever touches avoids the equivalent
// resolution problem on that side.

export const generateWebPdfThumbnails = async () => null;

export const generateNativePdfThumbnails = async (uri) => {
  try {
    const PdfThumbnail = require('react-native-pdf-thumbnail').default;
    const results = await PdfThumbnail.generateAllPages(uri, 70);
    return results.map((r) => r.uri);
  } catch (e) {
    console.warn('Native PDF thumbnail generation failed (needs a native rebuild if the dependency was just added):', e);
    return null;
  }
};
