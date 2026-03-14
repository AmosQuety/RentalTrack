import * as SQLite from 'expo-sqlite';
import { LedgerEntry } from '../../libs/types';
import { SyncManager } from '../../services/sync/SyncManager';
import { ILedgerRepository } from '../interfaces/ILedgerRepository';

export class LocalLedgerRepository implements ILedgerRepository {
  private db: SQLite.SQLiteDatabase;
  private syncManager: SyncManager;

  constructor(db: SQLite.SQLiteDatabase) {
    this.db = db;
    this.syncManager = new SyncManager(db);
  }

  async getAllByTenant(tenantId: number, userId: string): Promise<LedgerEntry[]> {
    return this.db.getAllAsync<LedgerEntry>(
      'SELECT * FROM ledger_entries WHERE tenant_id = ? AND user_id = ? ORDER BY reference_date DESC, entry_id DESC',
      [tenantId, userId]
    );
  }

  async create(userId: string, entryData: Omit<LedgerEntry, 'entry_id' | 'created_at' | 'user_id' | 'is_dirty' | 'version'>): Promise<LedgerEntry> {
    const timestamp = new Date().toISOString();
    
    const result = await this.db.runAsync(
      `INSERT INTO ledger_entries (
        tenant_id, type, amount, description, reference_date, original_payment_id, 
        user_id, created_at, is_dirty
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        entryData.tenant_id,
        entryData.type,
        entryData.amount,
        entryData.description,
        entryData.reference_date,
        entryData.original_payment_id || null,
        userId,
        timestamp
      ]
    );

    const newEntry = await this.db.getFirstAsync<LedgerEntry>(
      'SELECT * FROM ledger_entries WHERE entry_id = ? AND user_id = ?',
      [result.lastInsertRowId, userId]
    );
    
    if (!newEntry) throw new Error('Failed to retrieve newly created ledger entry');

    // Ledgers are append-only. 
    await this.syncManager.enqueueOperation('ledger_entries', newEntry.entry_id!, 'INSERT', newEntry);
    
    return newEntry;
  }

  async getUpdatedSince(userId: string, timestamp: string): Promise<LedgerEntry[]> {
    return this.db.getAllAsync<LedgerEntry>(
      'SELECT * FROM ledger_entries WHERE user_id = ? AND created_at > ?',
      [userId, timestamp]
    );
  }
}
