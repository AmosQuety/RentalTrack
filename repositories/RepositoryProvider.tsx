import NetInfo from '@react-native-community/netinfo';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { getSharedDb } from '../db/shared-db';
import { ILedgerRepository } from './interfaces/ILedgerRepository';
import { IPaymentRepository } from './interfaces/IPaymentRepository';
import { ITenantRepository } from './interfaces/ITenantRepository';
import { LocalLedgerRepository } from './local/LocalLedgerRepository';
import { LocalPaymentRepository } from './local/LocalPaymentRepository';
import { LocalTenantRepository } from './local/LocalTenantRepository';

interface RepositoriesContextType {
  tenantRepository: ITenantRepository;
  paymentRepository: IPaymentRepository;
  ledgerRepository: ILedgerRepository;
  isOnline: boolean;
}

const RepositoriesContext = createContext<RepositoriesContextType | null>(null);

export const RepositoriesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOnline, setIsOnline] = useState(true);
  
  // NOTE: Offline-First architecture insists the UI always reads/writes from Local Adapters implicitly.
  // The SyncWorker handles moving data out of SQLite to the Remote Adapters in the background.
  // We expose `isOnline` here so the UI can show indicators, but the Repositories remain statically localized.
  const [repositories, setRepositories] = useState<RepositoriesContextType | null>(null);

  useEffect(() => {
    let isMounted = true;
    
    // Listen to network state dynamically
    const unsubscribeNetInfo = NetInfo.addEventListener(state => {
      setIsOnline(!!state.isConnected && !!state.isInternetReachable);
    });

    const initRepositories = () => {
      // Use the shared singleton — initializeDatabase() in use-db.ts calls openSharedDb()
      // first, so by the time RepositoriesProvider mounts, the DB is already open.
      const db = getSharedDb();
      
      const localTenantRepo = new LocalTenantRepository(db);
      const localPaymentRepo = new LocalPaymentRepository(db);
      const localLedgerRepo = new LocalLedgerRepository(db);

      if (isMounted) {
        setRepositories({
          tenantRepository: localTenantRepo,
          paymentRepository: localPaymentRepo,
          ledgerRepository: localLedgerRepo,
          isOnline: true, // initial state before listener fires
        });
      }
    };

    initRepositories();

    return () => {
      isMounted = false;
      unsubscribeNetInfo();
    };
  }, []);

  // Make sure we re-inject the `isOnline` state correctly into the wrapper
  const currentContextValue = repositories ? { ...repositories, isOnline } : null;

  if (!currentContextValue) {
    // Return empty or loading indicator while DB resolves
    return null; 
  }

  return (
    <RepositoriesContext.Provider value={currentContextValue}>
      {children}
    </RepositoriesContext.Provider>
  );
};

export const useRepositories = () => {
  const context = useContext(RepositoriesContext);
  if (!context) {
    throw new Error('useRepositories must be used within a RepositoriesProvider');
  }
  return context;
};