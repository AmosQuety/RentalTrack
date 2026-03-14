import Constants from 'expo-constants';
import { Logger } from './index';

/**
 * Error Monitoring — Sentry integration (env-gated).
 *
 * To activate full Sentry reporting:
 *   1. Run: npx expo install @sentry/react-native
 *   2. Set EXPO_PUBLIC_SENTRY_DSN in your .env / EAS Secrets
 *   3. Un-comment the Sentry blocks below.
 */

// import * as Sentry from '@sentry/react-native';

const SENTRY_DSN: string | undefined =
  (Constants.expoConfig?.extra?.sentryDsn as string | undefined) ??
  process.env.EXPO_PUBLIC_SENTRY_DSN;

export const initErrorMonitoring = (): void => {
  if (!SENTRY_DSN) {
    Logger.warn('Error monitoring: EXPO_PUBLIC_SENTRY_DSN not set — using Logger fallback only', {
      actionType: 'MONITORING_INIT',
    });
    return;
  }

  /*
  Sentry.init({
    dsn: SENTRY_DSN,
    debug: __DEV__,
    tracesSampleRate: __DEV__ ? 1.0 : 0.2,
    environment: __DEV__ ? 'development' : 'production',
    enableNative: true,
  });
  */

  Logger.info('Error monitoring initialised', {
    actionType: 'MONITORING_INIT',
    dsn: SENTRY_DSN.substring(0, 20) + '…', // never log full DSN
  });
};

/**
 * Capture an exception — forwards to Sentry when available,
 * always writes to the structured logger.
 */
export const captureException = (
  error: Error,
  metadata?: Record<string, unknown>
): void => {
  Logger.error(error.message, {
    actionType: 'EXCEPTION_CAUGHT',
    stack: error.stack,
    ...metadata,
  });

  // Sentry.captureException(error, { extra: metadata });
};

/**
 * Capture a non-fatal message (e.g. a degraded-state warning).
 */
export const captureMessage = (
  message: string,
  level: 'info' | 'warning' | 'error' = 'info',
  metadata?: Record<string, unknown>
): void => {
  Logger.warn(message, { actionType: 'CAPTURE_MESSAGE', sentryLevel: level, ...metadata });

  // Sentry.captureMessage(message, level);
};
