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
//    was originally written as the fix for "stuck on Sharpening forever"
//    while workerSrc pointed at unpkg.com - now that the worker is
//    self-hosted (same-origin, no external fetch at all), that specific
//    failure mode is gone, but this guard is kept regardless as real
//    defense-in-depth: pdfjsLib.getDocument(...).promise and page
//    render/getPage calls can still hang for other reasons (a
//    genuinely malformed PDF, a browser-specific pdf.js edge case), and
//    a promise that never settles means every .then() in App.js that
//    would clear a loading spinner never fires, forever - no amount of
//    try/catch on the CALLER's side can fix that; the guard has to live
//    here, at the actual unbounded operation. withTimeout can't cancel
//    the underlying call once started (there's no plumbed-through
//    AbortController for this), so a timeout means the abandoned
//    operation keeps running invisibly in the background rather than
//    truly stopping - but the caller gets an honest failure back
//    instead of hanging forever, which is what actually matters here.
const PDF_RENDER_TIMEOUT_MS = 20000;
const withTimeout = (promise, label) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), PDF_RENDER_TIMEOUT_MS))
]);

// Same fix as App.js's yieldToBrowser (b767) - setTimeout gets throttled
// to a minimum of ~1 second per call in backgrounded browser tabs, a
// real, well-documented power-saving behavior, not a bug in this code
// specifically. That fix only ever touched yieldToBrowser in App.js
// though - this file has its own, separate tick() function for the
// exact same purpose (yielding once per page during thumbnail
// generation while a PDF loads), and never got the same fix. On a
// large document, one ~1s stall per page compounds into exactly the
// "barely moves when the tab isn't focused" symptom this was reported
// as - not a new bug, the same one living in a second, un-fixed place.
const tick = () => (typeof document !== 'undefined' && document.hidden) ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, 0));

// workerSrc below points at a same-origin, self-hosted copy of pdfjs-
// dist's worker script (public/pdf.worker.min.mjs), not an external CDN.
// This was already fixed once - documented as b750, specifically to
// remove exactly this dependency and the indefinite-hang risk that
// comes with it - but the actual file was genuinely missing from
// public/ (confirmed directly, not assumed), meaning every single PDF
// load was silently fetching the worker fresh from unpkg.com on every
// single load: a full external network round-trip (DNS + TLS +
// download from a third party) on every upload, that a same-origin,
// browser-cacheable local file entirely removes. This is very likely
// the single biggest available speedup for PDF loading - not a new
// optimization, a regression back to the exact problem already solved
// once. If pdfjs-dist is ever upgraded, this file needs re-copying from
// node_modules/pdfjs-dist/build/pdf.worker.min.mjs to stay in sync -
// mismatched versions between the library and its worker script is a
// real, silent failure mode, not just a version-string mismatch.
// workerSrc below points at a same-origin, self-hosted copy of pdfjs-
// dist's worker script (public/pdf.worker.min.mjs), not an external CDN.
// This was already fixed once - documented as b750, specifically to
// remove exactly this dependency and the indefinite-hang risk that
// comes with it - but the actual file was genuinely missing from
// public/ (confirmed directly, not assumed), meaning every single PDF
// load was silently fetching the worker fresh from unpkg.com on every
// single load: a full external network round-trip (DNS + TLS +
// download from a third party) on every upload, that a same-origin,
// browser-cacheable local file entirely removes. This is very likely
// the single biggest available speedup for PDF loading - not a new
// optimization, a regression back to the exact problem already solved
// once. If pdfjs-dist is ever upgraded, this file needs re-copying from
// node_modules/pdfjs-dist/build/pdf.worker.min.mjs to stay in sync -
// mismatched versions between the library and its worker script is a
// real, silent failure mode, not just a version-string mismatch.
//
// documentCache/clearPdfDocumentCache below were entirely missing from
// this file - confirmed directly against the very first upload of this
// project this session, not something introduced tonight. App.js's own
// code was written assuming both existed (three call sites pass a 5th
// cacheKey argument this function never had a parameter for at all, and
// two call sites call clearPdfDocumentCache directly), meaning: the
// document-caching optimization this was clearly designed to provide
// (reuse an already-parsed PDF across multiple page views instead of
// re-fetching and re-parsing the whole file every single time) has been
// silently doing nothing all session, AND clearPdfDocumentCache being
// genuinely undefined crashed the live site outright the moment
// anything actually called it (App.js's resetPdfHighResCaches, on every
// PDF container switch). Both are real, not cosmetic - the missing
// cache is a genuine, likely large performance gap for anyone paging
// through a multi-page PDF's high-res preview; the missing function is
// what was actively crashing production.
const documentCache = {};

export const generateWebPdfThumbnails = async (source, scale = 0.4, pageNumber = null, onPageReady = null, cacheKey = null) => {
  let pdf = null;
  let fromCache = false;
  try {
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

    if (cacheKey && documentCache[cacheKey]) {
      // Reuse the already-parsed document instead of re-fetching and
      // re-parsing the same file from scratch - this is the entire
      // point of cacheKey existing as a parameter at all.
      pdf = documentCache[cacheKey];
      fromCache = true;
    } else {
      const isBytes = source instanceof Uint8Array || (typeof ArrayBuffer !== 'undefined' && source instanceof ArrayBuffer);
      const loadPromise = isBytes
        ? pdfjsLib.getDocument({ data: source }).promise
        : pdfjsLib.getDocument({ url: source }).promise;
      pdf = await withTimeout(loadPromise, 'PDF document load');
      if (cacheKey) documentCache[cacheKey] = pdf; // caller is responsible for calling clearPdfDocumentCache(cacheKey) once done with this batch - see the two real call sites in App.js
    }

    const renderOnePage = async (num) => {
      const page = await withTimeout(pdf.getPage(num), `Page ${num} fetch`);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await withTimeout(page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise, `Page ${num} render`);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
      page.cleanup();
      return dataUrl;
    };

    if (pageNumber != null) {
      return await renderOnePage(pageNumber); // single string, not an array - caller asked for exactly one page
    }

    const thumbnails = new Array(pdf.numPages).fill(null);
    // Batches of BATCH_SIZE pages render concurrently instead of
    // strictly one at a time - real, meaningful wall-clock speedup for
    // large documents, since each page involves both pdf.js decode work
    // and separate canvas/JPEG-encode work that can genuinely overlap.
    // Modest batch size on purpose - too high risks overwhelming memory
    // on a large document rather than actually finishing faster.
    //
    // Correctness detail that matters here: pages within a batch can
    // finish in ANY order (page 2 might complete before page 1 if it's
    // simpler), so this fills `thumbnails` by INDEX, not by push() -
    // push() would put out-of-order results in the wrong positions in
    // the final array. onPageReady still fires the moment each
    // individual page's own render finishes (not after the whole
    // batch), so the UI still updates progressively, same as before -
    // it just may reveal pages 1-3 in a slightly different order than
    // strictly 1, then 2, then 3.
    //
    // Per-page error isolation is preserved exactly as before, just
    // moved inside each page's own promise in the batch rather than
    // around a single sequential await - one bad page still doesn't
    // abort its batch-mates or any later batch.
    const BATCH_SIZE = 3;
    for (let batchStart = 1; batchStart <= pdf.numPages; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE - 1, pdf.numPages);
      const batchIndices = [];
      for (let i = batchStart; i <= batchEnd; i++) batchIndices.push(i);
      await Promise.all(batchIndices.map(async (i) => {
        let dataUrl = null;
        try {
          dataUrl = await renderOnePage(i);
        } catch (e) {
          console.warn(`Page ${i} failed to render, skipping it and continuing with the rest:`, e);
        }
        thumbnails[i - 1] = dataUrl;
        if (onPageReady) onPageReady(i - 1, dataUrl); // 0-indexed, matching how callers index their own page arrays - dataUrl may be null here, callers already treat that as "no thumbnail" (falls back to placeholder), same as any other failure
      }));
      if (batchEnd < pdf.numPages) await tick();
    }
    return thumbnails;
  } catch (e) {
    console.warn('Web PDF thumbnail generation failed:', e);
    return null;
  } finally {
    // Never destroy a document that's either freshly cached or was
    // reused FROM the cache - it needs to stay alive and parseable for
    // whatever the next call with the same cacheKey does. Only
    // destroyed when clearPdfDocumentCache actually removes it from the
    // cache below. Uncached calls (cacheKey null/undefined) keep the
    // original behavior exactly - destroy immediately, since nothing
    // else will ever reuse that instance.
    if (pdf && !cacheKey && !fromCache) {
      try { pdf.destroy(); } catch (e) { /* best-effort cleanup, nothing to do if this itself fails */ }
    }
  }
};

// cacheKey provided: clears and destroys just that one cached document
// (used after finishing a specific batch - see App.js's
// handleExportPdfAsImages). No cacheKey: clears every cached document
// (used on a full container switch - see App.js's
// resetPdfHighResCaches, which calls this unconditionally on every PDF
// Editor container change). Both calling conventions are real, existing
// call sites in App.js, not hypothetical.
export const clearPdfDocumentCache = (cacheKey = null) => {
  const keysToClear = cacheKey ? [cacheKey] : Object.keys(documentCache);
  keysToClear.forEach((key) => {
    const cached = documentCache[key];
    if (cached) {
      try { cached.destroy(); } catch (e) { /* best-effort cleanup, nothing to do if this itself fails */ }
      delete documentCache[key];
    }
  });
};

export const generateNativePdfThumbnails = async () => null;
