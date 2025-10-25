// hooks/use-db.ts
import { useEffect, useState } from 'react';
import { initializeDatabase, Database } from '../db/database';
import { NotificationService } from '../services/notifications';

export const useDatabase = () => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initApp = async () => {
      try {
        // Initialize database
        await initializeDatabase();
        
        // Initialize notifications
        await NotificationService.initialize();
        
        // Check for pending reminders
        await NotificationService.checkPendingReminders();
        
        setIsInitialized(true);
      } catch (err) {
        console.error('Failed to initialize app:', err);
        setError(err instanceof Error ? err.message : 'Unknown error occurred');
      }
    };

    initApp();
  }, []);

  return {
    isInitialized,
    error,
    // Tenant methods
    getAllTenants: Database.getAllTenants,
    getTenant: Database.getTenant,
    addTenant: Database.addTenant,
    
    // Payment methods
    recordPayment: Database.recordPayment,
    getPaymentHistory: Database.getPaymentHistory,
    
    // Reminder methods
    getUpcomingReminders: Database.getUpcomingReminders,
    
    // Settings methods
    getSettings: Database.getSettings,
    updateSettings: Database.updateSettings,
    
    // Generic query
    executeQuery: Database.executeQuery,
  };
};