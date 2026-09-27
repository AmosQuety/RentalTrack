import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { jwtDecode } from 'jwt-decode';
import { Logger } from '../services/logger';
import { SyncManager } from '../services/sync/SyncManager';
import { SmartScheduler } from '../services/notifications/SmartScheduler';
import { NotificationService } from '../services/notifications';
import {
  AuthHubTokens,
  getAuthHubConfig,
  refreshAuthHubTokens,
  revokeAuthHubSession,
} from '../services/auth/authhub';

interface User {
  user_id: string;
  email: string;
  role: string;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  signIn: (tokens: AuthHubTokens) => Promise<void>;
  signOut: () => Promise<void>;
  dirtyCount: number;
  refreshDirtyCount: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

const SESSION_KEY = 'authhub_session';

// AuthHub-issued JWTs are RS256-signed and verified server-side (Supabase RLS via
// AuthHub's JWKS endpoint). Decoding here is display-only — never use `role` from
// this payload to gate anything security-sensitive on the client.
interface AuthHubClaims {
  sub: string;
  email: string;
  role?: string;
}

const decodeUser = (idOrAccessToken: string): User | null => {
  try {
    const claims = jwtDecode<AuthHubClaims>(idOrAccessToken);
    return { user_id: claims.sub, email: claims.email, role: claims.role ?? 'user' };
  } catch (e) {
    Logger.error('Auth: Failed to decode token', { error: e instanceof Error ? e : new Error(String(e)) });
    return null;
  }
};

const loadSession = async (): Promise<AuthHubTokens | null> => {
  const raw = await SecureStore.getItemAsync(SESSION_KEY);
  return raw ? (JSON.parse(raw) as AuthHubTokens) : null;
};

const saveSession = (tokens: AuthHubTokens) => SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(tokens));
const clearSession = () => SecureStore.deleteItemAsync(SESSION_KEY);

// Refresh a little before actual expiry to avoid a request racing an already-expired token.
const REFRESH_SAFETY_MARGIN_MS = 60_000;

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [dirtyCount, setDirtyCount] = useState(0);
  const tokensRef = useRef<AuthHubTokens | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applySession = (tokens: AuthHubTokens) => {
    tokensRef.current = tokens;
    const decoded = decodeUser(tokens.idToken ?? tokens.accessToken);
    setUser(decoded);
    scheduleRefresh(tokens);
  };

  const scheduleRefresh = (tokens: AuthHubTokens) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    const delay = Math.max(tokens.expiresAt - Date.now() - REFRESH_SAFETY_MARGIN_MS, 0);
    refreshTimerRef.current = setTimeout(() => {
      performRefresh().catch((err) =>
        Logger.error('Auth: Scheduled token refresh failed', { error: err instanceof Error ? err : new Error(String(err)) })
      );
    }, delay);
  };

  const performRefresh = async (): Promise<void> => {
    const current = tokensRef.current;
    if (!current) return;
    const config = getAuthHubConfig();
    const refreshed = await refreshAuthHubTokens(config, current.refreshToken);
    await saveSession(refreshed);
    applySession(refreshed);
  };

  useEffect(() => {
    const restore = async () => {
      try {
        const stored = await loadSession();
        if (!stored) return;

        if (stored.expiresAt <= Date.now()) {
          const config = getAuthHubConfig();
          const refreshed = await refreshAuthHubTokens(config, stored.refreshToken);
          await saveSession(refreshed);
          applySession(refreshed);
        } else {
          applySession(stored);
        }
      } catch (err) {
        Logger.error('Auth: Failed to restore session', { error: err instanceof Error ? err : new Error(String(err)) });
        await clearSession();
      } finally {
        setIsLoading(false);
      }
    };
    restore();

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, []);

  const signIn = async (tokens: AuthHubTokens) => {
    await saveSession(tokens);
    applySession(tokens);
  };

  const signOut = async () => {
    const current = tokensRef.current;
    try {
      if (current) {
        const config = getAuthHubConfig();
        await revokeAuthHubSession(config, current.accessToken);
      }
    } catch (err) {
      // Best-effort: local session is cleared regardless of server-side revoke success.
      Logger.warn('Auth: Server-side session revoke failed', { error: err instanceof Error ? err.message : String(err) });
    } finally {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      tokensRef.current = null;
      await clearSession();
      setUser(null);
      setDirtyCount(0);
    }
  };

  const refreshDirtyCount = async () => {
    if (user) {
      try {
        const count = await SyncManager.getDirtyCount(user.user_id);
        setDirtyCount(count);
      } catch (err) {
        console.warn('Auth: Failed to refresh dirty count', err);
      }
    } else {
      setDirtyCount(0);
    }
  };

  useEffect(() => {
    let syncTimer: any;
    let countTimer: any;
    let initialSchedule: any;
    let periodicSchedule: any;

    if (user) {
      // Start auto-sync every 30s
      syncTimer = SyncManager.startAutoSync(user.user_id, 30000);

      // Also refresh dirty count every 5s for UI responsiveness
      refreshDirtyCount();
      countTimer = setInterval(refreshDirtyCount, 5000);

      const runScheduler = () => {
        SmartScheduler.scheduleAll(user.user_id).catch(err =>
          Logger.error('Auth: SmartScheduler failed', { error: err, userId: user.user_id })
        );
        NotificationService.checkPendingReminders(user.user_id).catch(err =>
          Logger.error('Auth: checkPendingReminders failed', { error: err, userId: user.user_id })
        );
      };

      // Initial run after 5s (buffer for initial sync)
      initialSchedule = setTimeout(runScheduler, 5000);
      // Periodic run every 4 hours
      periodicSchedule = setInterval(runScheduler, 4 * 60 * 60 * 1000);

      // Also perform an immediate sync on login/app start
      SyncManager.sync(user.user_id).then(refreshDirtyCount).catch(err =>
        Logger.error('Auth: Initial sync failed', { error: err instanceof Error ? err : new Error(String(err)) })
      );
    }

    return () => {
      if (syncTimer) clearInterval(syncTimer);
      if (countTimer) clearInterval(countTimer);
      if (initialSchedule) clearTimeout(initialSchedule);
      if (periodicSchedule) clearInterval(periodicSchedule);
    };
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, isLoading, signIn, signOut, dirtyCount, refreshDirtyCount }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
