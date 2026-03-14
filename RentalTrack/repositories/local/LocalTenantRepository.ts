import * as SQLite from 'expo-sqlite';
import { Tenant } from '../../libs/types';
import { SyncManager } from '../../services/sync/SyncManager';
import { ITenantRepository } from '../interfaces/ITenantRepository';

export class LocalTenantRepository implements ITenantRepository {
  private db: SQLite.SQLiteDatabase;
  private syncManager: SyncManager;

  constructor(db: SQLite.SQLiteDatabase) {
    this.db = db;
    this.syncManager = new SyncManager(db);
  }

  async getAll(userId: string): Promise<Tenant[]> {
    return this.db.getAllAsync<Tenant>(
      'SELECT * FROM tenants WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC',
      [userId]
    );
  }

  async getById(id: number, userId: string): Promise<Tenant | null> {
    return this.db.getFirstAsync<Tenant>(
      'SELECT * FROM tenants WHERE tenant_id = ? AND user_id = ? AND deleted_at IS NULL',
      [id, userId]
    );
  }

  async create(userId: string, tenantData: Omit<Tenant, 'tenant_id' | 'created_at' | 'updated_at' | 'user_id'>): Promise<Tenant> {
    const timestamp = new Date().toISOString();
    const result = await this.db.runAsync(
      `INSERT INTO tenants (
        name, phone, room_number, start_date, contract_end_date, 
        monthly_rent, rent_cycle, user_id, created_at, updated_at, is_dirty
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        tenantData.name, 
        tenantData.phone || null, 
        tenantData.room_number, 
        tenantData.start_date, 
        tenantData.contract_end_date || null, 
        tenantData.monthly_rent, 
        tenantData.rent_cycle || 'monthly',
        userId,
        timestamp,
        timestamp
      ]
    );

    const newTenant = await this.getById(result.lastInsertRowId, userId);
    if (!newTenant) throw new Error('Failed to retrieve newly created tenant');

    // Enqueue for background sync
    await this.syncManager.enqueueOperation('tenants', newTenant.tenant_id, 'INSERT', newTenant);

    return newTenant;
  }

  async update(id: number, userId: string, updates: Partial<Tenant>): Promise<void> {
    const setKeys = [];
    const setValues = [];

    for (const [key, value] of Object.entries(updates)) {
      if (key === 'tenant_id' || key === 'created_at' || key === 'user_id') continue;
      setKeys.push(`${key} = ?`);
      setValues.push(value);
    }

    if (setKeys.length === 0) return;

    setKeys.push('updated_at = ?');
    const timestamp = new Date().toISOString();
    setValues.push(timestamp);

    setKeys.push('is_dirty = 1');
    setKeys.push('version = version + 1');

    setValues.push(id); 
    setValues.push(userId);

    await this.db.runAsync(
      `UPDATE tenants SET ${setKeys.join(', ')} WHERE tenant_id = ? AND user_id = ?`,
      setValues
    );

    const updatedTenant = await this.getById(id, userId);
    if (updatedTenant) {
      await this.syncManager.enqueueOperation('tenants', id, 'UPDATE', updatedTenant);
    }
  }

  async delete(id: number, userId: string): Promise<void> {
    const timestamp = new Date().toISOString();
    await this.db.runAsync(
      `UPDATE tenants SET deleted_at = ?, is_dirty = 1, version = version + 1 WHERE tenant_id = ? AND user_id = ?`,
      [timestamp, id, userId]
    );

    const deletedRecord = await this.db.getFirstAsync<Tenant>(
      'SELECT * FROM tenants WHERE tenant_id = ? AND user_id = ?', [id, userId]
    );
    
    if (deletedRecord) {
      await this.syncManager.enqueueOperation('tenants', id, 'DELETE', { ...deletedRecord, deleted_at: timestamp });
    }
  }

  async getUpdatedSince(userId: string, timestamp: string): Promise<Tenant[]> {
    return this.db.getAllAsync<Tenant>(
      'SELECT * FROM tenants WHERE user_id = ? AND (updated_at > ? OR deleted_at > ?) ORDER BY updated_at ASC',
      [userId, timestamp, timestamp]
    );
  }
}
