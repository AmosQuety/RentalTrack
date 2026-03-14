import * as SQLite from 'expo-sqlite';
import { Payment } from '../../libs/types';
import { SyncManager } from '../../services/sync/SyncManager';
import { IPaymentRepository } from '../interfaces/IPaymentRepository';

export class LocalPaymentRepository implements IPaymentRepository {
  private db: SQLite.SQLiteDatabase;
  private syncManager: SyncManager;

  constructor(db: SQLite.SQLiteDatabase) {
    this.db = db;
    this.syncManager = new SyncManager(db);
  }

  async getAllByTenant(tenantId: number, userId: string): Promise<Payment[]> {
    return this.db.getAllAsync<Payment>(
      'SELECT * FROM payments WHERE tenant_id = ? AND user_id = ? AND deleted_at IS NULL ORDER BY payment_date DESC',
      [tenantId, userId]
    );
  }

  async getById(id: number, userId: string): Promise<Payment | null> {
    return this.db.getFirstAsync<Payment>(
      'SELECT * FROM payments WHERE payment_id = ? AND user_id = ? AND deleted_at IS NULL',
      [id, userId]
    );
  }

  async create(userId: string, paymentData: Omit<Payment, 'payment_id' | 'payment_date' | 'user_id' | 'is_dirty' | 'version'>): Promise<Payment> {
    const timestamp = new Date().toISOString();
    
    const result = await this.db.runAsync(
      `INSERT INTO payments (
        tenant_id, amount_paid, months_paid_for, next_due_date, payment_date, 
        rent_amount_at_payment, rent_cycle_at_payment, 
        user_id, created_at, is_dirty
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        paymentData.tenant_id,
        paymentData.amount_paid,
        paymentData.months_paid_for,
        paymentData.next_due_date,
        timestamp,
        paymentData.rent_amount_at_payment || null,
        paymentData.rent_cycle_at_payment || null,
        userId,
        timestamp
      ]
    );

    const newPayment = await this.getById(result.lastInsertRowId, userId);
    if (!newPayment) throw new Error('Failed to retrieve newly created payment');

    await this.syncManager.enqueueOperation('payments', newPayment.payment_id, 'INSERT', newPayment);
    return newPayment;
  }

  async delete(id: number, userId: string): Promise<void> {
    const timestamp = new Date().toISOString();
    await this.db.runAsync(
      `UPDATE payments SET deleted_at = ?, is_dirty = 1, version = version + 1 WHERE payment_id = ? AND user_id = ?`,
      [timestamp, id, userId]
    );

    const deletedRecord = await this.db.getFirstAsync<Payment>(
      'SELECT * FROM payments WHERE payment_id = ? AND user_id = ?', [id, userId]
    );
    
    if (deletedRecord) {
      await this.syncManager.enqueueOperation('payments', id, 'DELETE', { ...deletedRecord, deleted_at: timestamp });
    }
  }

  async getUpdatedSince(userId: string, timestamp: string): Promise<Payment[]> {
    return this.db.getAllAsync<Payment>(
      'SELECT * FROM payments WHERE user_id = ? AND (created_at > ? OR deleted_at > ?)',
      [userId, timestamp, timestamp]
    );
  }
}
