import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { Database, initializeDatabase } from '../db/database';
import { Payment, Settings as SettingsType, Tenant } from '../libs/types';
import { NotificationService } from '../services/notifications';
import { Logger } from '../services/logger/index';

// Removed global event emitter to fix render loops
// UI will now rely purely on useFocusEffect for data refreshing.

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
        
        // CRITICAL: Add timeout to prevent infinite hanging
        const initTimeout = new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Database initialization timeout')), 30000)
        );

        await Promise.race([
          initializeDatabase(),
          initTimeout
        ]);
        
        console.log('✅ Database initialized');
        setIsInitialized(true);

        // Defer non-critical services by 500ms to allow UI to render first
        setTimeout(async () => {
          // Initialize notifications
          try {
            await NotificationService.initialize();
          } catch (notifError) {
            Logger.warn('Notification initialization failed', { error: notifError });
          }

          // Run system heartbeat
          try {
            // Note: userId will be updated when called from authenticated screens
            await Database.runSystemHeartbeat('SYSTEM_INIT');
          } catch (heartbeatError) {
            Logger.warn('Heartbeat failed', { error: heartbeatError });
          }
          
          // Update tenant statuses
          try {
            await Database.updateAllTenantStatuses('SYSTEM_INIT');
          } catch (statusError) {
            Logger.warn('Status update failed', { error: statusError });
          }

          // Check pending reminders
          try {
            await NotificationService.checkPendingReminders();
          } catch (reminderError) {
            Logger.warn('Reminder check failed', { error: reminderError });
          }

          Logger.info('Background services initialized', { actionType: 'APP_INIT_BG_COMPLETE' });
        }, 500);

        Logger.info('App initialization complete', { actionType: 'APP_INIT_SUCCESS' });
      } catch (err) {
        Logger.error('CRITICAL: App initialization failed', { error: err });
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

  const runHeartbeat = useCallback(async (userId: string): Promise<{
    statusUpdates: number;
    suspensionAlerts: string[];
    contractAlerts: string[];
  }> => {
    try {
      const results = await Database.runSystemHeartbeat(userId);
      setHeartbeatResults(results);
      return results;
    } catch (error) {
      Logger.error('Failed to run heartbeat', { error });
      throw error;
    }
  }, []);

  const addTenant = useCallback(async (userId: string, tenant: Parameters<typeof Database.addTenant>[1]) => {
    const result = await Database.addTenant(userId, tenant);
    return result;
  }, []);

  const updateTenant = useCallback(async (tenantId: number, userId: string, updates: Parameters<typeof Database.updateTenant>[2]) => {
    await Database.updateTenant(tenantId, userId, updates);
  }, []);

  const deleteTenant = useCallback(async (tenantId: number, userId: string) => {
    await Database.deleteTenant(tenantId, userId);
  }, []);

  const recordPayment = useCallback(async (userId: string, payment: Omit<Parameters<typeof Database.recordPayment>[1], 'tenantId'> & { tenantId: number }) => {
    const result = await Database.recordPayment(userId, { ...payment, tenantId: payment.tenantId });

    if (result.shouldAlertPartial && result.alertMessage) {
      Logger.info('Partial Payment Alert', { alertMessage: result.alertMessage });
    }
    
    return result.paymentId;
  }, []);

  const cancelPayment = useCallback(async (paymentId: number, userId: string, reason: string) => {
    await Database.cancelPayment(paymentId, userId, reason);
  }, []);

  const getSettings = useCallback(async (userId: string) => Database.getSettings(userId), []);
  const updateSettings = useCallback(async (userId: string, settings: Partial<SettingsType>) => {
    await Database.updateSettings(userId, settings);
  }, []);

  return {
    isInitialized,
    error,
    heartbeatResults,
    initAttempts,

    // Core methods
    getAllTenants: useCallback(async (userId: string) => Database.getAllTenants(userId), []),
    getTenant: useCallback(async (tenantId: number, userId: string) => Database.getTenant(tenantId, userId), []),
    getPaymentById: useCallback(async (paymentId: number, userId: string) => Database.getPaymentById(paymentId, userId), []),
    addTenant,
    updateTenant,
    deleteTenant,
      
    // Payment methods
    recordPayment,
    cancelPayment,
    getPaymentHistory: useCallback(async (tenantId: number, userId: string) => Database.getPaymentHistory(tenantId, userId), []),
    getPaymentStats: useCallback(async (userId: string) => Database.getPaymentStats(userId), []),
    getMonthlyTrend: useCallback(async (userId: string) => Database.getMonthlyTrend(userId), []),
    getDashboardStats: useCallback(async (userId: string) => Database.getDashboardStats(userId), []),
    getTenantStats: useCallback(async (tenantId: number, userId: string) => Database.getTenantStats(tenantId, userId), []),
    getTenantWithDetails: useCallback(async (tenantId: number, userId: string) => Database.getTenantWithDetails(tenantId, userId), []),
    getRecentPayments: useCallback(async (userId: string, limit?: number) => Database.getRecentPayments(userId, limit), []),

    // System methods
    runHeartbeat,
    updateAllTenantStatuses: useCallback(async (userId: string) => Database.updateAllTenantStatuses(userId), []),
    resetCreditBalance: useCallback(async (tenantId: number, userId: string) => Database.resetCreditBalance(tenantId, userId), []),
    recalculatePaymentStats: useCallback(async () => Database.recalculatePaymentStats(), []),
    getCollectionRate: useCallback(async (userId: string) => Database.getCollectionRate(userId), []),
    getLedgerSummary: useCallback(async (userId: string, fromDate: string, toDate: string) => Database.getLedgerSummary(fromDate, toDate, userId), []),

    // Reminder methods
    getUpcomingReminders: useCallback(async (userId: string, daysAhead?: number) => Database.getUpcomingReminders(userId, daysAhead), []),
    getReminders: useCallback(async (userId: string, tenantId?: number) => Database.getReminders(userId, tenantId), []),
    
    // Settings methods
    getSettings,
    updateSettings,

    // Search & Filter
    searchTenants: useCallback(async (userId: string, query: string) => Database.searchTenants(userId, query), []),
    getOverdueTenants: useCallback(async (userId: string) => Database.getOverdueTenants(userId), []),
    getTenantsDueSoon: useCallback(async (userId: string) => Database.getTenantsDueSoon(userId), []),
    getPaidTenants: useCallback(async (userId: string) => Database.getPaidTenants(userId), []),
    
    // Utility
    getTotalMonthlyRent: useCallback(async (userId: string) => Database.getTotalMonthlyRent(userId), []),
    getTotalCreditBalance: useCallback(async (userId: string) => Database.getTotalCreditBalance(userId), []),
  };
};

// useAutoRefresh removed to fix render loops. Screens should use useFocusEffect instead.