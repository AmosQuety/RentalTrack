import { RemoteLedgerRepository } from '../../repositories/remote/RemoteLedgerRepository';
import { RemotePaymentRepository } from '../../repositories/remote/RemotePaymentRepository';
import { RemoteTenantRepository } from '../../repositories/remote/RemoteTenantRepository';
import { Logger } from '../logger';
import { RetryStrategy } from './RetryStrategy';
import { SyncManager } from './SyncManager';

const BATCH_SIZE = 25;

export class SyncWorker {
  static async executeBackgroundSync(syncManager: SyncManager): Promise<void> {
    Logger.info(`Triggering batch sync process...`, { actionType: 'SYNC_START' });
    
    try {
      const pendingItems = await syncManager.getPendingQueue(BATCH_SIZE);
      if (pendingItems.length === 0) {
        Logger.info(`Queue empty. Nothing to sync.`, { actionType: 'SYNC_EMPTY' });
        return;
      }

      Logger.info(`Processing operations with Exponential Backoff.`, { actionType: 'SYNC_PROCESSING', queueSize: pendingItems.length });

      const tenantRepo = new RemoteTenantRepository();
      const paymentRepo = new RemotePaymentRepository();
      const ledgerRepo = new RemoteLedgerRepository();

      for (const item of pendingItems) {
        try {
          // Wrapped in execution strategy: 5 max attempts, starting at 1000ms delay exponentially backing off.
          await RetryStrategy.execute(async () => {
            const payload = JSON.parse(item.payload);
            let latestVersionAssigned = payload.version || 1;

            if (item.table_name === 'tenants') {
               if (item.operation === 'INSERT') {
                 const res = await tenantRepo.create(payload);
                 latestVersionAssigned = res.version;
               } else if (item.operation === 'UPDATE') {
                 await tenantRepo.update(item.record_id, payload);
               } else if (item.operation === 'DELETE') {
                 await tenantRepo.delete(item.record_id);
               }
            } 
            else if (item.table_name === 'payments') {
               if (item.operation === 'INSERT') {
                 const res = await paymentRepo.create(payload);
                 latestVersionAssigned = res.version;
               } else if (item.operation === 'DELETE') {
                 await paymentRepo.delete(item.record_id);
               }
            }
            else if (item.table_name === 'ledger_entries') {
               if (item.operation === 'INSERT') {
                 const res = await ledgerRepo.create(payload);
                 latestVersionAssigned = res.version;
               }
            }

            // Sync successfully resolved with Remote Authority. Remove from local queue.
            await syncManager.markSynced(item.queue_id, item.table_name, item.record_id, latestVersionAssigned);
            Logger.info(`Successfully pushed operation`, { actionType: 'SYNC_ITEM_SUCCESS', table: item.table_name, operation: item.operation, id: item.record_id });

          }, 5, 1000); 

        } catch (itemErr) {
          // We don't crash the whole worker if one item consistently fails all 5 retries.
          // We log it and let it retry on the next overall worker execution tick.
          // TO-DO: Implement dead-letter-queue for permanent poison pills > 25 attempts.
          Logger.warn(`Item failed 5 backoff retries. Leaving in queue.`, { actionType: 'SYNC_ITEM_FAILED', queueId: item.queue_id });
        }
      }

      Logger.info(`Batch resolution complete.`, { actionType: 'SYNC_COMPLETE' });

    } catch (error: any) {
       Logger.error(`Critical worker failure`, { actionType: 'SYNC_WORKER_CRASHED', error: error.message });
       throw error;
    }
  }
}
