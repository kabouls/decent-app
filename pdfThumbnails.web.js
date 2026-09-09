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
//
// Three real fixes below, all aimed at large/many-page PDFs:
//
// 1. `source` accepts EITHER a uri (string, fetched as before - the
//    only option every other caller of this function still uses) OR
//    already-fetched bytes (Uint8Array). App.js's initial-add path
//    already has to fetch the whole file once for pdf-lib to parse it -
//    before this, this function fetched the SAME file a second time
//    independently via pdfjsLib.getDocument({url}), which for a large
//    file is a genuinely wasteful duplicate download+read. Passing the
//    bytes it already has straight into getDocument({data}) skips that
//    second fetch entirely.
//
// 2. Yielding between pages (`await tick()`). Each `page.render()` call
//    still genuinely blocks the main thread for however long that one
//    page takes - awaiting the promise doesn't change that, it just
//    means control returns to the event loop AFTER each page instead of
//    only after all of them. Without an explicit yield in between, the
//    browser gets essentially zero chances to paint or handle input for
//    the entire loop's duration on a many-page document, which is what
//    "the whole window goes laggy" during a big upload actually was.
//    A bare setTimeout(0) forces an actual macrotask boundary, which is
//    enough for the browser to catch up on a paint/input frame between
//    pages, at the cost of the whole batch taking a little longer in
//    total (worth it - responsive-but-slower beats frozen).
//
// 3. pdf.destroy() in a finally block. The pdfjsLib.getDocument(...)
//    document object holds real memory (parsed PDF structure, and on
//    top of that whatever the worker/WASM side is holding) for as long
//    as it's referenced - which, before this, was forever, since
//    nothing ever called .destroy() on it once thumbnails were pulled
//    out. That's very likely part of why the browser stayed laggy even
//    after removing the file from the UI: the PDF.js document itself
//    was still alive in memory, this function just never let it go.
//
// None of this touches the OTHER big cost for a large PDF, which is
// pdf-lib's own PDFDocument.load() over in App.js - that's a separate,
// synchronous, single-threaded parse with no yielding of its own, and
// is a well-documented characteristic of pdf-lib on large/complex
// files, not something fixable from this file. The only real fix for
// that specific cost would be moving it off the main thread entirely
// (a Web Worker), which is a substantially bigger, separate change.
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

export const generateWebPdfThumbnails = async (source, scale = 0.4) => {
  let pdf = null;
  try {
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
    const isBytes = source instanceof Uint8Array || (typeof ArrayBuffer !== 'undefined' && source instanceof ArrayBuffer);
    pdf = isBytes
      ? await pdfjsLib.getDocument({ data: source }).promise
      : await pdfjsLib.getDocument({ url: source }).promise;
    const thumbnails = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      thumbnails.push(canvas.toDataURL('image/jpeg', 0.7));
      page.cleanup(); // releases this page's own render resources immediately, rather than waiting for pdf.destroy() below
      if (i < pdf.numPages) await tick();
    }
    return thumbnails;
  } catch (e) {
    console.warn('Web PDF thumbnail generation failed:', e);
    return null;
  } finally {
    if (pdf) {
      try { pdf.destroy(); } catch (e) { /* best-effort cleanup, nothing to do if this itself fails */ }
    }
  }
};

export const generateNativePdfThumbnails = async () => null;
