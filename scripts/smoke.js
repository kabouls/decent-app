#!/usr/bin/env node
// Boot smoke test: serves the exported web build, loads it in headless Chrome,
// and asserts the app actually renders and its options panel opens. Catches
// blank-screen regressions (bad import, undefined at render, broken context)
// that a bundle step alone will happily ship.
//
// Usage: node scripts/smoke.js [buildDir]   (default: dist)
// Needs Node >= 22 (global WebSocket) and Chrome/Chromium installed.
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.resolve(ROOT, process.argv[2] || 'dist');
const PORT = 8124;
const DPORT = 9334;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.wasm': 'application/wasm' };

function findChrome() {
  const candidates = [process.env.CHROME_BIN, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium-browser', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].filter(Boolean);
  const hit = candidates.find((p) => fs.existsSync(p));
  if (!hit) throw new Error('Chrome not found. Set CHROME_BIN.');
  return hit;
}

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let file = path.join(DIR, decodeURIComponent(req.url.split('?')[0]));
      if (!file.startsWith(DIR)) { res.writeHead(403); return res.end(); }
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        const index = path.join(file, 'index.html');
        file = fs.existsSync(index) ? index : path.join(DIR, 'index.html');
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

async function main() {
  if (!fs.existsSync(path.join(DIR, 'index.html'))) {
    throw new Error('No build at ' + DIR + ' - run `npx expo export -p web` first.');
  }
  const server = await serve();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'decent-smoke-'));
  const chrome = spawn(findChrome(), [
    '--headless=new', '--remote-debugging-port=' + DPORT, '--remote-allow-origins=*',
    '--user-data-dir=' + profile, '--window-size=504,780', '--disable-gpu',
    '--no-sandbox', '--disable-dev-shm-usage', '--disable-breakpad', '--no-first-run',
    '--hide-scrollbars', 'about:blank'
  ], { stdio: 'ignore' });

  const cleanup = () => { try { chrome.kill('SIGKILL'); } catch (e) {} server.close(); };
  process.on('exit', cleanup);

  let page = null;
  for (let i = 0; i < 40 && !page; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${DPORT}/json`)).json();
      page = list.find((t) => t.type === 'page');
    } catch (e) {}
    if (!page) await sleep(300);
  }
  if (!page) throw new Error('Chrome DevTools endpoint never came up');

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws connect failed')); });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  };
  const send = (method, params = {}) => new Promise((res) => {
    const mid = ++id;
    pending.set(mid, res);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true });
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  const waitFor = async (label, expression, timeout = 25000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await evaluate(expression)) { console.log('  ok  ' + label); return true; }
      await sleep(400);
    }
    throw new Error('timed out waiting for: ' + label);
  };
  const clickAt = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await sleep(60);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 504, height: 780, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT });
  console.log('smoke: ' + DIR);

  await waitFor('feed chrome renders', "document.body.innerText.includes('Popularity') && document.body.innerText.includes('Newest')");
  await waitFor('no fatal render error', "!document.body.innerText.includes('Uncaught')");

  const gear = await evaluate(`(() => {
    const svgs = [...document.querySelectorAll('svg')].filter(s => s.getBoundingClientRect().y < 60);
    if (!svgs.length) return null;
    const el = svgs[svgs.length - 1];
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: window.innerWidth };
  })()`);
  if (!gear) throw new Error('no header icon found to open options');
  await clickAt(gear.x, gear.y);
  await sleep(1200);
  if (!(await evaluate("document.body.innerText.includes('About App')"))) {
    // fall back to the gear's known position at the right edge of the header
    await clickAt(gear.w - 59, 30);
    await sleep(1200);
  }
  await waitFor('options panel opens', "document.body.innerText.includes('About App') && document.body.innerText.includes('Support & Legal')", 8000);

  await evaluate("window.scrollTo(0, 0)");
  console.log('smoke: PASS');
  ws.close();
  cleanup();
  process.exit(0);
}

main().catch((e) => { console.error('smoke: FAIL - ' + e.message); process.exit(1); });
