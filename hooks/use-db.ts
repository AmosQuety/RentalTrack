// hooks/use-db.ts - ENHANCED VERSION
import { useCallback, useEffect, useState } from 'react';
import { Database, initializeDatabase } from '../db/database';
import { NotificationService } from '../services/notifications';

// Event emitter for database changes
type DatabaseEventType = 'tenant_added' | 'tenant_updated' | 'tenant_deleted' | 'payment_recorded' | 'settings_updated';
type DatabaseEventListener = () => void;

class DatabaseEventEmitter {
  private listeners: Map<DatabaseEventType, Set<DatabaseEventListener>> = new Map();

  subscribe(event: DatabaseEventType, listener: DatabaseEventListener): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);

    // Return unsubscribe function
    return () => {
      this.listeners.get(event)?.delete(listener);
    };
  }

  emit(event: DatabaseEventType): void {
    console.log(`📢 Database event: ${event}`);
    this.listeners.get(event)?.forEach(listener => {
      try {
        listener();
      } catch (error) {
        console.error('Error in database event listener:', error);
      }
    });
  }
}

export const dbEvents = new DatabaseEventEmitter();

export const useDatabase = () => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initApp = async () => {
      try {
        await initializeDatabase();
        await NotificationService.initialize();
        
        // NEW: Update tenant statuses on app start
        await Database.updateAllTenantStatuses();
        await NotificationService.checkPendingReminders();
        

        setIsInitialized(true);
      } catch (err) {
        console.error('Failed to initialize app:', err);
        setError(err instanceof Error ? err.message : 'Unknown error occurred');
      }
    };

    initApp();
  }, []);

  // Enhanced tenant methods with event emission
  const addTenant = useCallback(async (tenant: any) => {
    const result = await Database.addTenant(tenant);
    dbEvents.emit('tenant_added');
    return result;
  }, []);

  const updateTenant = useCallback(async (tenantId: number, updates: any) => {
    await Database.updateTenant(tenantId, updates);
    dbEvents.emit('tenant_updated');
  }, []);

  const deleteTenant = useCallback(async (tenantId: number) => {
    await Database.deleteTenant(tenantId);
    dbEvents.emit('tenant_deleted');
  }, []);

  // Enhanced payment method with event emission
  const recordPayment = useCallback(async (payment: any) => {
    const result = await Database.recordPayment(payment);
    dbEvents.emit('payment_recorded');
    return result;
  }, []);

  // Enhanced settings method with event emission
  const updateSettings = useCallback(async (settings: any) => {
    await Database.updateSettings(settings);
    dbEvents.emit('settings_updated');
  }, []);

  return {
    isInitialized,
    error,
    // Tenant methods
    getAllTenants: Database.getAllTenants,
    getTenant: Database.getTenant,
    addTenant,
    updateTenant,
    deleteTenant,
    
    // Payment methods
    recordPayment,
    getPaymentHistory: Database.getPaymentHistory,
    getPaymentStats: Database.getPaymentStats,
    getMonthlyTrend: Database.getMonthlyTrend,
    
    // Reminder methods
    getUpcomingReminders: Database.getUpcomingReminders,
    
    // Settings methods
    getSettings: Database.getSettings,
    updateSettings,
  };
};

// Custom hook for auto-refreshing data
export const useAutoRefresh = (
  loadDataFn: () => Promise<void>,
  events: DatabaseEventType[]
) => {
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Auto-refresh when database events occur
  useEffect(() => {
    const unsubscribers = events.map(event => 
      dbEvents.subscribe(event, async () => {
        console.log(`🔄 Auto-refreshing due to: ${event}`);
        await loadDataFn();
      })
    );

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [loadDataFn, events]);

  // Manual refresh function for pull-to-refresh
  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await loadDataFn();
    } finally {
      setIsRefreshing(false);
    }
  }, [loadDataFn]);

  return { isRefreshing, refresh };
};

// hooks/use-db.ts
// Logic:
// Centralizes database initialization.
// Provides isInitialized state.
// DatabaseEventEmitter: This is an excellent pattern for reactive updates across your app without complex global state. Very good job implementing this.
// useAutoRefresh: This hook beautifully leverages the DatabaseEventEmitter to automatically reload data in components when relevant database events occur. This is a robust solution for ensuring data freshness.
// Improvements for Production:
// Error Display: setError is stored but not displayed in the useDatabase hook itself. Consider how this error state would be presented to the user (e.g., a global error banner).
// Singleton Pattern for dbEvents: dbEvents is instantiated globally. This is appropriate for a singleton event bus.
// useCallback for DB calls: Wrapping the mutating DB functions (addTenant, updateTenant, deleteTenant, recordPayment, updateSettings) in useCallback is a good practice as it prevents unnecessary re-creations of these functions and potentially unnecessary re-renders in components that depend on them.
