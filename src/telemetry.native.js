import * as Sentry from '@sentry/react-native';
import { SENTRY_DSN } from './telemetryConfig';

// Native: initialise immediately - the SDK is part of the native runtime and
// crash reporting matters from the first frame.
export function initTelemetry() {
  Sentry.init({ dsn: SENTRY_DSN, tracesSampleRate: 1.0, enabled: !__DEV__ });
}

export function captureException(error) {
  try { Sentry.captureException(error); } catch (e) {}
}

export function wrapRoot(Component) {
  return Sentry.wrap(Component);
}
