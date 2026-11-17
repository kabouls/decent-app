// Web-only image compression worker pool. Encoding (and the up-to-N encode
// passes the target-size search needs) happens off the main thread, so the UI
// keeps painting while a large image or PDF page is compressed.
// Native keeps the existing ImageManipulator path.
const WORKER_SRC = `
self.onmessage = async (event) => {
  const { id, buffer, targetBytes, maxWidth, maxHeight, mime } = event.data;
  try {
    const bitmap = await createImageBitmap(new Blob([buffer]));
    let baseW = bitmap.width;
    let baseH = bitmap.height;
    if (maxWidth && baseW > maxWidth) {
      baseH = Math.round(baseH * (maxWidth / baseW));
      baseW = maxWidth;
    }
    if (maxHeight && baseH > maxHeight) {
      baseW = Math.round(baseW * (maxHeight / baseH));
      baseH = maxHeight;
    }
    const canvas = new OffscreenCanvas(baseW, baseH);
    const ctx = canvas.getContext('2d');
    // Pick a starting scale from a rough bytes-per-pixel estimate instead of
    // brute-forcing every quality at full size: for JPEG ~0.12 B/px at q0.72,
    // for PNG ~1.2 B/px. Then at most four encodes (vs fifteen before).
    const bytesPerPixel = mime === 'image/png' ? 1.2 : 0.12;
    let scale = 1;
    if (targetBytes) {
      const estimated = baseW * baseH * bytesPerPixel;
      if (estimated > targetBytes) {
        scale = Math.max(0.3, Math.min(1, Math.sqrt(targetBytes / estimated)));
      }
    }
    const plan = mime === 'image/png'
      ? [[scale, 1], [scale * 0.8, 1], [scale * 0.6, 1]]
      : [[scale, 0.72], [scale, 0.5], [scale * 0.7, 0.45]];
    let best = null;
    for (const [s, quality] of plan) {
      const w = Math.max(1, Math.round(baseW * s));
      const h = Math.max(1, Math.round(baseH * s));
      canvas.width = w;
      canvas.height = h;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(bitmap, 0, 0, w, h);
      const blob = await canvas.convertToBlob({ type: mime, quality });
      const ab = await blob.arrayBuffer();
      if (!best || ab.byteLength < best.buffer.byteLength) {
        best = { buffer: ab, width: w, height: h };
      }
      if (!targetBytes || ab.byteLength <= targetBytes) {
        self.postMessage({ id, ok: true, buffer: ab, width: w, height: h, mime }, [ab]);
        return;
      }
    }
    self.postMessage({ id, ok: true, buffer: best.buffer, width: best.width, height: best.height, mime }, [best.buffer]);
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err) });
  }
};
`;

const MIME = { JPEG: 'image/jpeg', PNG: 'image/png', WEBP: 'image/webp' };
let pool = null;
let roundRobin = 0;
let seq = 0;
let workerUrl = null;

export function canUseImageWorker() {
  return typeof Worker !== 'undefined'
    && typeof OffscreenCanvas !== 'undefined'
    && typeof createImageBitmap !== 'undefined'
    && typeof Blob !== 'undefined';
}

function getPool() {
  if (pool) return pool;
  workerUrl = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
  pool = [new Worker(workerUrl), new Worker(workerUrl)];
  for (const w of pool) {
    w.__queue = Promise.resolve();
    w.onerror = () => {};
  }
  return pool;
}

export async function compressImageInWorker(bytes, { targetBytes, maxWidth, maxHeight, format }) {
  const mime = MIME[format] || MIME.JPEG;
  const worker = getPool()[roundRobin++ % pool.length];
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const id = ++seq;

  const run = () => new Promise((resolve, reject) => {
    const onMessage = (event) => {
      if (!event.data || event.data.id !== id) return;
      worker.removeEventListener('message', onMessage);
      if (event.data.ok) {
        resolve({
          bytes: new Uint8Array(event.data.buffer),
          width: event.data.width,
          height: event.data.height,
          mime: event.data.mime,
        });
      } else {
        reject(new Error(event.data.error || 'worker compression failed'));
      }
    };
    worker.addEventListener('message', onMessage);
    worker.postMessage({ id, buffer, targetBytes, maxWidth, maxHeight, mime }, [buffer]);
  });

  const task = worker.__queue.then(run, run);
  worker.__queue = task.catch(() => {});
  return task;
}
