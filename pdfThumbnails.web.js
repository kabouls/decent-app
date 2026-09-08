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
//
// pdfjs-dist is imported dynamically here, not as a static top-level
// import - tried static once already, and without the babel.config.js
// unstable_transformImportMeta fix in place, that made things strictly
// worse (crashed the whole app on load instead of just this feature,
// since App.js imports this file at startup). With that babel fix now
// in place, static *should* be safe and is arguably cleaner, but
// keeping this dynamic for now means even if the babel fix turns out to
// be incomplete for some edge case, the failure stays contained to "no
// thumbnail" rather than "nothing works" - a deliberately conservative
// choice until the babel fix is confirmed working end-to-end.
export const generateWebPdfThumbnails = async (uri, scale = 0.4) => {
  try {
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
    const pdf = await pdfjsLib.getDocument({ url: uri }).promise;
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
