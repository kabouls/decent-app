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
//
// pageNumber (optional, 1-indexed): returns just that one page's uri
// (a single string) instead of the full array - added to match
// pdfThumbnails.web.js's equivalent fix (see that file's comment for
// why: rendering every page just to show one was the real cause of a
// many-page PDF staying slow/high-memory well after it finished
// loading). Unlike the web version, this does NOT yet skip rendering
// the other pages internally - react-native-pdf-thumbnail's single-page
// API (if this package version exposes one) hasn't been confirmed here,
// so this still calls generateAllPages underneath and just returns the
// one result asked for. That means native gets a consistent API and the
// same caching behavior as web, but not yet the same actual savings -
// worth revisiting once the single-page native API is confirmed.
export const generateNativePdfThumbnails = async (uri, size = 70, pageNumber = null) => {
  try {
    const PdfThumbnail = require('react-native-pdf-thumbnail').default;
    const results = await PdfThumbnail.generateAllPages(uri, size);
    if (pageNumber != null) {
      const match = results[pageNumber - 1];
      return match ? match.uri : null;
    }
    return results.map((r) => r.uri);
  } catch (e) {
    console.warn('Native PDF thumbnail generation failed (needs a native rebuild if the dependency was just added):', e);
    return null;
  }
};
