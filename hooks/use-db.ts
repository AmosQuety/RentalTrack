// hooks/use-db.ts - COMPLETE VERSION
import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { Database, initializeDatabase } from '../db/database';
import { NotificationService } from '../services/notifications';

type DatabaseEventType = 'tenant_added' | 'tenant_updated' | 'tenant_deleted' | 'payment_recorded' | 'settings_updated';
type DatabaseEventListener = () => void;

class DatabaseEventEmitter {
  private listeners: Map<DatabaseEventType, Set<DatabaseEventListener>> = new Map();

  subscribe(event: DatabaseEventType, listener: DatabaseEventListener): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);

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
  const [initAttempts, setInitAttempts] = useState(0);
  const [heartbeatResults, setHeartbeatResults] = useState<{
    statusUpdates: number;
    suspensionAlerts: string[];
    contractAlerts: string[];
  } | null>(null);

  useEffect(() => {
    const initApp = async () => {
      try {
        console.log('🚀 Starting app initialization...');
        
        // CRITICAL: Add timeout to prevent infinite hanging
        const initTimeout = new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Database initialization timeout')), 30000)
        );

        await Promise.race([
          initializeDatabase(),
          initTimeout
        ]);
        
        console.log('✅ Database initialized');

        // Initialize notifications (non-blocking)
        try {
          await NotificationService.initialize();
          console.log('✅ Notifications initialized');
        } catch (notifError) {
          console.warn('⚠️ Notification initialization failed (non-critical):', notifError);
        }

        // Run system heartbeat (non-blocking)
        try {
          const results = await Database.runSystemHeartbeat();
          setHeartbeatResults(results);
          console.log('✅ System heartbeat completed');
        } catch (heartbeatError) {
          console.warn('⚠️ Heartbeat failed (non-critical):', heartbeatError);
        }
        
        // Update tenant statuses (non-blocking)
        try {
          await Database.updateAllTenantStatuses();
          console.log('✅ Tenant statuses updated');
        } catch (statusError) {
          console.warn('⚠️ Status update failed (non-critical):', statusError);
        }

        // Check pending reminders (non-blocking)
        try {
          await NotificationService.checkPendingReminders();
          console.log('✅ Reminders checked');
        } catch (reminderError) {
          console.warn('⚠️ Reminder check failed (non-critical):', reminderError);
        }

        setIsInitialized(true);
        console.log('🎉 App initialization complete');
      } catch (err) {
        console.error('❌ CRITICAL: App initialization failed:', err);
        const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
        setError(errorMessage);
        
        // Retry logic
        const currentAttempt = initAttempts + 1;
        setInitAttempts(currentAttempt);
        
        if (currentAttempt < 3) {
          console.log(`🔄 Retrying initialization (attempt ${currentAttempt + 1}/3)...`);
          setTimeout(() => {
            setError(null);
            initApp();
          }, 2000);
        } else {
          // Show user-friendly error after max attempts
          Alert.alert(
            'Initialization Failed',
            'The app failed to start properly. Please restart the app or reinstall if the problem persists.\n\nError: ' + errorMessage,
            [
              {
                text: 'Retry',
                onPress: () => {
                  setError(null);
                  setInitAttempts(0);
                  initApp();
                }
              }
            ]
          );
        }
      }
    };

    initApp();
  }, []); // Only run once on mount

  const runHeartbeat = useCallback(async (): Promise<{
    statusUpdates: number;
    suspensionAlerts: string[];
    contractAlerts: string[];
  }> => {
    try {
      const results = await Database.runSystemHeartbeat();
      setHeartbeatResults(results);
      return results;
    } catch (error) {
      console.error('Failed to run heartbeat:', error);
      throw error;
    }
  }, []);

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
    // ADD THESE ADDITIONAL EVENTS
    dbEvents.emit('payment_recorded'); // Payments are affected when tenant is deleted
    dbEvents.emit('tenant_updated'); // Other tenants' stats might change
  }, []);

  const recordPayment = useCallback(async (payment: any) => {
    const result = await Database.recordPayment(payment);
    dbEvents.emit('payment_recorded');

    if (result.shouldAlertPartial && result.alertMessage) {
      console.log('🔔 Partial Payment Alert:', result.alertMessage);
    }
    
    return result.paymentId;
  }, []);

  const cancelPayment = useCallback(async (paymentId: number, reason: string) => {
    await Database.cancelPayment(paymentId, reason);
    dbEvents.emit('payment_recorded');
  }, []);

  const updateSettings = useCallback(async (settings: any) => {
    await Database.updateSettings(settings);
    dbEvents.emit('settings_updated');
  }, []);

  return {
    isInitialized,
    error,
    heartbeatResults,
    initAttempts,

    // Core methods
    getAllTenants: Database.getAllTenants,
    getTenant: Database.getTenant,
    addTenant,
    updateTenant,
    deleteTenant,
      
    // Payment methods
    recordPayment,
    cancelPayment,
    getPaymentHistory: Database.getPaymentHistory,
    getPaymentStats: Database.getPaymentStats, // ✅ NOW EXPORTED
    getMonthlyTrend: Database.getMonthlyTrend, // ✅ NOW EXPORTED
    getDashboardStats: Database.getDashboardStats,
    getTenantStats: Database.getTenantStats, // ✅ NOW EXPORTED
    getTenantWithDetails: Database.getTenantWithDetails,
    getRecentPayments: Database.getRecentPayments,

    // System methods
    runHeartbeat,
    updateAllTenantStatuses: Database.updateAllTenantStatuses,
    resetCreditBalance: Database.resetCreditBalance, // ✅ NOW EXPORTED
     recalculatePaymentStats: Database.recalculatePaymentStats, // ✅ ADD THIS LINE

    // Reminder methods
    getUpcomingReminders: Database.getUpcomingReminders, // ✅ NOW EXPORTED
    getReminders: Database.getReminders,
    
    // Settings methods
    getSettings: Database.getSettings,
    updateSettings,

    // Search & Filter
    searchTenants: Database.searchTenants,
    getOverdueTenants: Database.getOverdueTenants,
    getTenantsDueSoon: Database.getTenantsDueSoon,
    getPaidTenants: Database.getPaidTenants,
    
    // Utility
    getTotalMonthlyRent: Database.getTotalMonthlyRent,
    getTotalCreditBalance: Database.getTotalCreditBalance,
  };
};

export const useAutoRefresh = (
  loadDataFn: () => Promise<void>,
  events: DatabaseEventType[]
) => {
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const unsubscribers = events.map(event => 
      dbEvents.subscribe(event, async () => {
        console.log(`🔄 Auto-refreshing due to: ${event}`);
        try {
          await loadDataFn();
        } catch (error) {
          console.error('Auto-refresh failed:', error);
        }
      })
    );

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [loadDataFn, events]);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await loadDataFn();
    } catch (error) {
      console.error('Manual refresh failed:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [loadDataFn]);

  return { isRefreshing, refresh };
};