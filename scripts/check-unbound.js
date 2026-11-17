#!/usr/bin/env node
// Fails when a file references an identifier that has no binding, which is a
// runtime ReferenceError that a bundler will not catch. Run with no arguments
// to check App.js and every module under src/.
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const parser = require(path.join(ROOT, 'node_modules/@babel/parser'));
const traverse = require(path.join(ROOT, 'node_modules/@babel/traverse')).default;

const GLOBALS = new Set(['console','Math','Date','JSON','Object','Array','String','Number','Boolean','Promise','Set','Map','WeakMap','Symbol','Error','RegExp','parseInt','parseFloat','isNaN','setTimeout','clearTimeout','setInterval','clearInterval','requestAnimationFrame','cancelAnimationFrame','fetch','URL','URLSearchParams','Blob','File','FileReader','FormData','window','document','navigator','location','localStorage','sessionStorage','atob','btoa','encodeURIComponent','decodeURIComponent','encodeURI','decodeURI','undefined','NaN','Infinity','globalThis','Intl','alert','performance','process','require','module','exports','__DEV__','global','Path2D','XMLSerializer','ImageData','CanvasRenderingContext2D','OffscreenCanvas','Worker','createImageBitmap','ImageBitmap','indexedDB','caches','history','screen','matchMedia','getComputedStyle','MutationObserver','ResizeObserver','IntersectionObserver','Event','CustomEvent','DOMParser','Node','Element','HTMLElement','HTMLCanvasElement','HTMLInputElement','requestIdleCallback','ReadableStream','AbortController','TextEncoder','TextDecoder','crypto','structuredClone','queueMicrotask','navigator']);

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(p);
    return e.name.endsWith('.js') ? [p] : [];
  });
}

const args = process.argv.slice(2);
const files = args.length ? args.map((a) => path.resolve(ROOT, a)) : [path.join(ROOT, 'App.js'), ...walk(path.join(ROOT, 'src'))];
let total = 0;
for (const file of files) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  let ast;
  try {
    ast = parser.parse(fs.readFileSync(file, 'utf8'), { sourceType: 'module', plugins: ['jsx', 'classProperties', 'dynamicImport', 'optionalChaining', 'nullishCoalescingOperator'] });
  } catch (e) {
    console.log('PARSE ERROR ' + rel + ': ' + e.message);
    total++;
    continue;
  }
  const bad = new Set();
  traverse(ast, {
    Identifier(p) {
      if (!p.isReferencedIdentifier()) return;
      if (!GLOBALS.has(p.node.name) && !p.scope.hasBinding(p.node.name)) bad.add(p.node.name);
    },
    JSXOpeningElement(p) {
      const n = p.node.name;
      if (n.type !== 'JSXIdentifier' || !/^[A-Z]/.test(n.name)) return;
      if (!p.scope.hasBinding(n.name)) bad.add(n.name);
    }
  });
  if (bad.size) { console.log('UNBOUND ' + rel + ': ' + [...bad].sort().join(', ')); total += bad.size; }
}
console.log(total ? 'FAILED: ' + total + ' unresolved identifier(s)' : 'ok: ' + files.length + ' files resolve');
process.exit(total ? 1 : 0);
