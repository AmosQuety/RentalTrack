import { supabase } from '../api/supabase';
import { Database, initializeDatabase } from '../../db/database';
import { Logger } from '../logger';

const SYNC_TABLES = ['tenants', 'payments', 'reminders', 'ledger_entries', 'settings'];

export const DeltaPull = {
  /**
   * Fetches remote updates from Supabase and applies them locally using Last-Write-Wins.
   */
  pullChanges: async (userId: string) => {
    await initializeDatabase();
    const db = Database.getDb();
    
    try {
      // 1. Get last sync timestamp
      const metaRow = await db.getFirstAsync<{ last_sync_at: string }>(
        'SELECT last_sync_at FROM sync_metadata WHERE user_id = ?',
        [userId]
      );
      const lastSyncAt = metaRow?.last_sync_at || '1970-01-01T00:00:00Z';

      Logger.info(`Sync: Starting delta pull since ${lastSyncAt}`);

      for (const table of SYNC_TABLES) {
        // We pull records that have been updated since our last sync
        // Try updated_at first, fallback to created_at if it fails
        let remoteUpdates: any[] | null = null;
        
        const { data: updates, error: updateError } = await supabase
          .from(table)
          .select('*')
          .gt('updated_at', lastSyncAt)
          .eq('user_id', userId);

        if (updateError) {
          Logger.warn(`Sync: updated_at failed for ${table}, falling back to created_at`, { error: updateError });
          const { data: fallback, error: fallbackError } = await supabase
            .from(table)
            .select('*')
            .gt('created_at', lastSyncAt)
            .eq('user_id', userId);

          if (fallbackError) {
            Logger.error(`Sync: Failed to pull remote updates for ${table}`, { error: fallbackError });
            continue;
          }
          remoteUpdates = fallback;
        } else {
          remoteUpdates = updates;
        }

        if (!remoteUpdates || remoteUpdates.length === 0) continue;

        Logger.info(`Sync: Processing ${remoteUpdates.length} updates for ${table}`);

        for (const remote of remoteUpdates) {
          const pkField = table === 'tenants' ? 'tenant_id' : 
                          table === 'payments' ? 'payment_id' :
                          table === 'reminders' ? 'reminder_id' : 'entry_id';
          
          const local = await db.getFirstAsync<any>(
            `SELECT version FROM ${table} WHERE ${pkField} = ? AND user_id = ?`,
            [remote[pkField], userId]
          );

          if (!local) {
            // Handle New Record
            const keys = Object.keys(remote);
            const columns = keys.join(', ');
            const placeholders = keys.map(() => '?').join(', ');
            const values = Object.values(remote) as any[];
            
            await db.runAsync(
              `INSERT INTO ${table} (${columns}, is_dirty) VALUES (${placeholders}, 0)`,
              values
            );
          } else if (remote.version > local.version) {
            // Apply Last-Write-Wins
            const entries = Object.entries(remote).filter(([key]) => key !== pkField && key !== 'user_id');
            const setClause = entries.map(([key]) => `${key} = ?`).join(', ');
            const values = entries.map(([_, val]) => val);
            
            await db.runAsync(
              `UPDATE ${table} SET ${setClause}, is_dirty = 0 WHERE ${pkField} = ? AND user_id = ?`,
              [...(values as any[]), remote[pkField], userId]
            );
          }
        }
      }

      // 2. Update last sync timestamp to now (UTC)
      const newSyncAt = new Date().toISOString();
      await db.runAsync(
        `INSERT OR REPLACE INTO sync_metadata (user_id, last_sync_at) VALUES (?, ?)`,
        [userId, newSyncAt]
      );

      Logger.info('Sync: Delta pull completed successfully');
    } catch (err) {
      Logger.error('Sync: Fatal error during delta pull', { error: err instanceof Error ? err : new Error(String(err)) });
    }
  }
};
