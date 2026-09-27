/**
 * Structured Logger — Phase 6 Production Hardening
 *
 * Emits JSON-structured log entries with mandatory context fields:
 *   timestamp, level, message, request_id?, tenant_id?, action_type?
 *
 * In production builds the `babel-plugin-transform-remove-console` plugin
 * strips raw console.* calls, but Logger output passes through this module
 * so it can later be forwarded to a remote ingestion endpoint (e.g. Logtail,
 * Datadog, or a custom /logs endpoint on the backend).
 */

import * as Sentry from '@sentry/react-native';
import { nanoid } from './nanoid';

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface LogContext {
  requestId?: string;
  tenantId?: number | string;
  userId?: string;
  actionType?: string;
  [key: string]: unknown;
}

// ---------- optional remote transport (stub) ----------
type RemoteTransport = (payload: object) => void;
let _remoteTransport: RemoteTransport | null = null;

export const Logger = {
  /**
   * Register a remote transport (e.g. POST to /api/logs).
   * Call once at app startup before any logging happens.
   */
  setTransport(fn: RemoteTransport) {
    _remoteTransport = fn;
  },

  log(level: LogLevel, message: string, context?: LogContext): void {
    const payload = {
      timestamp: new Date().toISOString(),
      level,
      message,
      requestId: context?.requestId ?? nanoid(8),
      ...context,
    };

    // Always pretty-print in dev; stringify for prod pipelines
    const output = __DEV__ ? payload : JSON.stringify(payload);

    switch (level) {
      case 'info':
        console.info('[INFO]', output);
        break;
      case 'warn':
        console.warn('[WARN]', output);
        break;
      case 'error':
        console.error('[ERROR]', output);
        if (!__DEV__) {
          Sentry.withScope((scope) => {
            if (context?.requestId) scope.setTag('requestId', String(context.requestId));
            if (context?.actionType) scope.setTag('actionType', String(context.actionType));
            if (context?.tenantId) scope.setTag('tenantId', String(context.tenantId));
            
            Object.entries(context || {}).forEach(([key, value]) => {
              if (key !== 'error' && key !== 'requestId' && key !== 'actionType' && key !== 'tenantId') {
                scope.setExtra(key, value);
              }
            });
            
            const err = context?.error instanceof Error ? context.error : new Error(message);
            Sentry.captureException(err);
          });
        }
        break;
      case 'debug':
        if (__DEV__) console.debug('[DEBUG]', output);
        break;
    }

    if (_remoteTransport && !__DEV__) {
      try {
        _remoteTransport(payload);
      } catch {
        // Never throw from the logger itself
      }
    }
  },

  info: (msg: string, ctx?: LogContext) => Logger.log('info', msg, ctx),
  warn: (msg: string, ctx?: LogContext) => Logger.log('warn', msg, ctx),
  error: (msg: string, ctx?: LogContext) => Logger.log('error', msg, ctx),
  debug: (msg: string, ctx?: LogContext) => Logger.log('debug', msg, ctx),
};
