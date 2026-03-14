import { LedgerEntry } from '../../libs/types';

export interface ILedgerRepository {
  /**
   * Fetch all ledger entries for a tenant and user
   */
  getAllByTenant(tenantId: number, userId: string): Promise<LedgerEntry[]>;

  /**
   * Create a new ledger entry.
   */
  create(userId: string, entry: Omit<LedgerEntry, 'entry_id' | 'created_at' | 'user_id' | 'is_dirty' | 'version'>): Promise<LedgerEntry>;

  /**
   * SYNC: Fetch only records updated after a certain timestamp (Delta Pull)
   */
  getUpdatedSince(userId: string, timestamp: string): Promise<LedgerEntry[]>;
}
