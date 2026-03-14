import React, { createContext, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { Logger } from '../services/logger';
import { SyncManager } from '../services/sync/SyncManager';
import { SmartScheduler } from '../services/notifications/SmartScheduler';
import { NotificationService } from '../services/notifications';

interface User {
  user_id: string;
  email: string;
  role: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  signIn: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
  dirtyCount: number;
  refreshDirtyCount: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

const TOKEN_KEY = 'auth_token';

// Simple manual base64 decoder for JWT payload
const base64Decode = (str: string) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let output = '';
  str = String(str).replace(/=+$/, '');
  for (
    let bc = 0, bs = 0, buffer, idx = 0;
    (buffer = str.charAt(idx++));
    ~buffer && ((bs = bc % 4 ? bs * 64 + buffer : buffer), bc++ % 4)
      ? (output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6))))
      : 0
  ) {
    buffer = chars.indexOf(buffer);
  }
  return output;
};

const decodeJwt = (token: string) => {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(base64Decode(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload;
  } catch (e) {
    return null;
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [dirtyCount, setDirtyCount] = useState(0);

  useEffect(() => {
    const loadToken = async () => {
      try {
        const storedToken = await SecureStore.getItemAsync(TOKEN_KEY);
        if (storedToken) {
          const payload = decodeJwt(storedToken);
          if (payload) {
            setUser({
              user_id: String(payload.user_id),
              email: payload.email,
              role: payload.role
            });
            setToken(storedToken);
          } else {
            // Invalid token
            await SecureStore.deleteItemAsync(TOKEN_KEY);
          }
        }
      } catch (err) {
        Logger.error('Auth: Failed to load token', { error: err instanceof Error ? err : new Error(String(err)) });
      } finally {
        setIsLoading(false);
      }
    };
    loadToken();
  }, []);

  const signIn = async (newToken: string) => {
    try {
      await SecureStore.setItemAsync(TOKEN_KEY, newToken);
      const payload = decodeJwt(newToken);
      if (payload) {
        setUser({
          user_id: String(payload.user_id),
          email: payload.email,
          role: payload.role
        });
        setToken(newToken);
      }
    } catch (err) {
      Logger.error('Auth: Failed to sign in', { error: err instanceof Error ? err : new Error(String(err)) });
      throw err;
    }
  };

  const signOut = async () => {
    try {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      setUser(null);
      setToken(null);
      setDirtyCount(0);
    } catch (err) {
      Logger.error('Auth: Failed to sign out', { error: err instanceof Error ? err : new Error(String(err)) });
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

      // --- PHASE 13: Integrated Smart Scheduling ---
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
    <AuthContext.Provider value={{ user, token, isLoading, signIn, signOut, dirtyCount, refreshDirtyCount }}>
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
