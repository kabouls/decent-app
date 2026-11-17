let promise;
export function loadPdfLib() {
  if (!promise) promise = import('pdf-lib');
  return promise;
}
