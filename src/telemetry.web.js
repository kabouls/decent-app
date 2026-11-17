import { SENTRY_DSN } from './telemetryConfig';

// Web: the Sentry SDK (core + replay + feedback, ~770 KB) is loaded lazily.
// It starts after 20 s of idle time, or immediately on the first captured
// error - whichever comes first. Errors raised before it arrives are queued
// and flushed once it initialises, so nothing is silently dropped.
const pendingErrors = [];
let sdk = null;
let started = false;

function flush() {
  if (!sdk) return;
  while (pendingErrors.length) {
    try { sdk.captureException(pendingErrors.shift()); } catch (e) {}
  }
}

function start() {
  if (started || __DEV__ || typeof window === 'undefined') return;
  started = true;
  import('@sentry/react-native')
    .then((S) => {
      S.init({ dsn: SENTRY_DSN, tracesSampleRate: 1.0, enabled: true });
      sdk = S;
      flush();
    })
    .catch(() => {});
}

export function initTelemetry() {
  if (__DEV__ || typeof window === 'undefined') return;
  const idle = () => {
    if ('requestIdleCallback' in window) window.requestIdleCallback(start, { timeout: 20000 });
    else setTimeout(start, 20000);
  };
  idle();
}

export function captureException(error) {
  pendingErrors.push(error);
  // An error is the moment crash reporting matters most - don't wait for idle.
  start();
  flush();
}

// No Sentry.wrap on web: the lazy SDK cannot wrap the root component, and the
// app already has its own CrashFallbackBoundary.
export function wrapRoot(Component) {
  return Component;
}
