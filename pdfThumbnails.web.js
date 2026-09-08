// Metro's .web.js / .native.js platform-extension convention - this file
// is ONLY ever bundled when building for web. A runtime `Platform.OS ===
// 'web'` check inside a single shared file does NOT achieve this: Metro
// still statically resolves every import it can find in the source,
// regardless of what a runtime condition would actually execute, which
// is exactly what broke the iOS/Android build here - pdfjs-dist contains
// Node.js-specific code (`import.meta.url`) that Hermes cannot parse at
// all, so just having it importable anywhere in a file that native also
// bundles crashes the whole native build, even though the code path
// wrapping it never runs there.
//
// generateNativePdfThumbnails is exported here too (as a no-op) purely
// so App.js can import both names from the same module path without
// needing its own platform branching at the call site - only the
// function matching the actual running platform ever does real work.

// scale is a pdf.js viewport scale factor - defaults to the small grid-
// tile render, but PDF compression needs a much larger render (the whole
// point is a readable page, not a thumbnail), so it's a parameter rather
// than hardcoded.
export const generateWebPdfThumbnails = async (uri, scale = 0.4) => {
  try {
    const pdfjsLib = await import('pdfjs-dist');
    // unpkg mirrors npm directly, so this always matches whatever version
    // is actually installed - cdnjs requires manual curation per package
    // and may lag behind or simply not carry every patch version. The
    // worker file itself is also .mjs, not .js, as of pdfjs-dist v4+ -
    // the old .js filename this pointed to no longer exists, which was
    // silently failing every thumbnail generation (caught, fell through
    // to the null fallback, one 'PDF' icon per page instead of a real
    // preview - functionally invisible unless you go looking at exactly
    // this failure mode).
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
    const pdf = await pdfjsLib.getDocument(uri).promise;
    const thumbnails = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      thumbnails.push(canvas.toDataURL('image/jpeg', 0.7));
    }
    return thumbnails;
  } catch (e) {
    console.warn('Web PDF thumbnail generation failed:', e);
    return null;
  }
};

export const generateNativePdfThumbnails = async () => null;
