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
// Four real fixes below, all aimed at large/many-page PDFs:
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
// 2. `pageNumber` (optional, 1-indexed) renders ONLY that one page and
//    returns a single data URL instead of an array - added because
//    App.js's "live preview" high-res render was calling this with no
//    page number, which means it rendered and kept in memory EVERY
//    page of the document at 2.5x scale the moment the FIRST page was
//    viewed, not just the one actually on screen. For a many-page PDF
//    that's the real explanation for "1GB+ memory, still laggy after
//    it loads" - viewing page 1 of a 14-page document was silently
//    rendering and caching all 14 pages at high resolution. Omitting
//    pageNumber keeps the original all-pages behavior, still needed by
//    the rail-thumbnail callers.
//
// 4. `onPageReady(index, dataUrl)` (optional) - called after each page
//    finishes, for callers doing the full-document render (rail
//    thumbnails) who want to show pages as they complete instead of
//    waiting for the entire document to finish before updating anything.
//    A 14-page PDF where every tile sits on a spinner until the whole
//    batch is done LOOKS frozen even though it's technically still
//    yielding between pages - showing page 1 the moment it's ready
//    (typically well under a second) makes the difference between
//    "stuck" and "loading."
//
// 5. A hard timeout around every await that can hang indefinitely. This
//    is the actual fix for "stuck on Sharpening forever" - workerSrc
//    above points at unpkg.com, an external CDN fetched fresh on every
//    call with zero timeout of its own. If that fetch ever stalls (slow
//    network, an ad-blocker or corporate firewall blocking unpkg, a
//    brief offline moment), pdfjsLib.getDocument(...).promise simply
//    never settles - not rejects, never resolves either - which means
//    every .then() in App.js that would clear a loading spinner never
//    fires, forever, regardless of how well-written that calling code
//    is. No amount of try/catch on the CALLER's side can fix a promise
//    that never settles; the guard has to live here, at the actual
//    unbounded operation. withTimeout can't cancel the underlying
//    fetch/worker call once started (there's no plumbed-through
//    AbortController for this), so a timeout means the abandoned
//    operation keeps running invisibly in the background rather than
//    truly stopping - but the caller gets an honest failure back
//    instead of hanging forever, which is what actually matters here.
const PDF_RENDER_TIMEOUT_MS = 20000;
const withTimeout = (promise, label) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), PDF_RENDER_TIMEOUT_MS))
]);

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

export const generateWebPdfThumbnails = async (source, scale = 0.4, pageNumber = null, onPageReady = null) => {
  let pdf = null;
  try {
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
    const isBytes = source instanceof Uint8Array || (typeof ArrayBuffer !== 'undefined' && source instanceof ArrayBuffer);
    const loadPromise = isBytes
      ? pdfjsLib.getDocument({ data: source }).promise
      : pdfjsLib.getDocument({ url: source }).promise;
    pdf = await withTimeout(loadPromise, 'PDF document load');

    const renderOnePage = async (num) => {
      const page = await withTimeout(pdf.getPage(num), `Page ${num} fetch`);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await withTimeout(page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise, `Page ${num} render`);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
      page.cleanup();
      return dataUrl;
    };

    if (pageNumber != null) {
      return await renderOnePage(pageNumber); // single string, not an array - caller asked for exactly one page
    }

    const thumbnails = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const dataUrl = await renderOnePage(i);
      thumbnails.push(dataUrl);
      if (onPageReady) onPageReady(i - 1, dataUrl); // 0-indexed, matching how callers index their own page arrays
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
