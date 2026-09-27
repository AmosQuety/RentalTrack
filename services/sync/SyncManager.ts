import * as SQLite from 'expo-sqlite';
import { supabase } from '../api/supabase';
import { Database, initializeDatabase } from '../../db/database';
import { Logger } from '../logger';
import { DeltaPull } from './DeltaPull';

const SYNC_TABLES = ['tenants', 'payments', 'reminders', 'ledger_entries', 'settings'];

export class SyncManager {
  private _db?: SQLite.SQLiteDatabase;

  constructor(db?: SQLite.SQLiteDatabase) {
    this._db = db;
  }

  private async getDb(): Promise<SQLite.SQLiteDatabase> {
    if (this._db) return this._db;
    await initializeDatabase();
    return Database.getDb();
  }

  /**
   * Static bridge methods for AuthContext (Singleton usage)
   */
  static async sync(userId: string) {
    return new SyncManager().sync(userId);
  }

  static startAutoSync(userId: string, intervalMs?: number) {
    return new SyncManager().startAutoSync(userId, intervalMs);
  }

  static async getDirtyCount(userId: string): Promise<number> {
    return new SyncManager().getDirtyCount(userId);
  }

  /**
   * Enqueues a local mutation for background synchronization.
   */
  async enqueueOperation(tableName: string, recordId: number, operation: 'INSERT' | 'UPDATE' | 'DELETE', payload: any) {
    try {
      const db = await this.getDb();
      const userId = payload.user_id || '';
      await db.runAsync(
        `INSERT INTO sync_queue (table_name, record_id, operation, payload, user_id) VALUES (?, ?, ?, ?, ?)`,
        [tableName, recordId, operation, JSON.stringify(payload), userId]
      );
      
      // Also log the operation locally
      await db.runAsync(
        `INSERT INTO operation_logs (table_name, record_id, action, user_id) VALUES (?, ?, ?, ?)`,
        [tableName, recordId, operation, userId]
      );
    } catch (err) {
      Logger.error(`Sync: Failed to enqueue operation for ${tableName}`, { error: err instanceof Error ? err : new Error(String(err)) });
    }
  }

  /**
   * Pushes all local changes (is_dirty = 1) to Supabase.
   */
  async pushChanges(userId: string) {
    const db = await this.getDb();
    for (const table of SYNC_TABLES) {
      try {
        const dirtyRecords = await db.getAllAsync<any>(
          `SELECT * FROM ${table} WHERE is_dirty = 1 AND user_id = ?`,
          [userId]
        );

        if (dirtyRecords.length === 0) continue;

        Logger.info(`Sync: Pushing ${dirtyRecords.length} dirty records for ${table}`);

        for (const record of dirtyRecords) {
          const { is_dirty, ...syncRecord } = record;
          
          const { error } = await supabase
            .from(table)
            .upsert(syncRecord);

          if (error) {
            Logger.error(`Sync: Failed to push record to ${table}`, { 
              error: error as any, 
              recordId: record.tenant_id || record.payment_id || record.reminder_id || record.entry_id || record.setting_id 
            });
            continue;
          }

          const pkField = table === 'tenants' ? 'tenant_id' : 
                          table === 'payments' ? 'payment_id' :
                          table === 'reminders' ? 'reminder_id' :
                          table === 'ledger_entries' ? 'entry_id' : 'setting_id';
                     
          await db.runAsync(
            `UPDATE ${table} SET is_dirty = 0 WHERE ${pkField} = ? AND user_id = ?`,
            [record[pkField], userId]
          );
        }
      } catch (err) {
        Logger.error(`Sync: Fatal error pushing changes for ${table}`, { error: err instanceof Error ? err : new Error(String(err)) });
      }
    }
  }

  /**
   * Performs a full sync: Push local changes, then Pull remote changes.
   */
  async sync(userId: string) {
    Logger.info('Sync: Starting full synchronization cycle');
    await this.pushChanges(userId);
    await DeltaPull.pullChanges(userId);
    Logger.info('Sync: Full synchronization cycle completed');
  }

  /**
   * Starts a periodic sync timer.
   */
  startAutoSync(userId: string, intervalMs: number = 30000) {
    Logger.info(`Sync: Starting auto-sync every ${intervalMs / 1000}s`);
    const timer = setInterval(() => {
      this.sync(userId).catch(err => 
        Logger.error('Sync: Periodic sync failed', { error: err instanceof Error ? err : new Error(String(err)) })
      );
    }, intervalMs);
    return timer;
  }

  /**
   * Returns the total number of dirty records across all tables.
   */
  async getDirtyCount(userId: string): Promise<number> {
    let total = 0;
    const db = await this.getDb();
    for (const table of SYNC_TABLES) {
      try {
        const result = await db.getFirstAsync<{ count: number }>(
          `SELECT COUNT(*) as count FROM ${table} WHERE is_dirty = 1 AND user_id = ?`,
          [userId]
        );
        total += result?.count || 0;
      } catch (err) {
        // Table might not exist or other error, skip
      }
    }
    return total;
  }
}
