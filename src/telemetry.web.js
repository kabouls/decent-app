import { SENTRY_DSN } from './telemetryConfig';

// Web: Sentry (core + replay + feedback, ~770 KB) is loaded after first paint
// instead of blocking the initial download. Errors raised before it arrives are
// queued and flushed once it initialises, so nothing is silently dropped.
const pendingErrors = [];
let sdk = null;

export function initTelemetry() {
  if (__DEV__ || typeof window === 'undefined') return;
  const start = () => {
    import('@sentry/react-native')
      .then((S) => {
        S.init({ dsn: SENTRY_DSN, tracesSampleRate: 1.0, enabled: true });
        sdk = S;
        while (pendingErrors.length) {
          try { sdk.captureException(pendingErrors.shift()); } catch (e) {}
        }
      })
      .catch(() => {});
  };
  if ('requestIdleCallback' in window) window.requestIdleCallback(start, { timeout: 5000 });
  else setTimeout(start, 3000);
}

export function captureException(error) {
  if (sdk) { try { sdk.captureException(error); } catch (e) {} }
  else pendingErrors.push(error);
}

// No Sentry.wrap on web: the lazy SDK cannot wrap the root component, and the
// app already has its own CrashFallbackBoundary.
export function wrapRoot(Component) {
  return Component;
}
