import { Tenant } from '../../../libs/types';

export interface ITenantRepository {
  /**
   * Fetch all active tenants for a user
   */
  getAll(userId: string): Promise<Tenant[]>;

  /**
   * Fetch a tenant by ID and user ID
   */
  getById(id: number, userId: string): Promise<Tenant | null>;

  /**
   * Create a new tenant. Returns the created Tenant (with ID).
   */
  create(userId: string, tenant: Omit<Tenant, 'tenant_id' | 'created_at' | 'updated_at' | 'user_id'>): Promise<Tenant>;

  /**
   * Update an existing tenant.
   */
  update(id: number, userId: string, updates: Partial<Tenant>): Promise<void>;

  /**
   * Soft delete a tenant.
   */
  delete(id: number, userId: string): Promise<void>;

  /**
   * SYNC: Fetch only records updated after a certain timestamp (Delta Pull)
   */
  getUpdatedSince(userId: string, timestamp: string): Promise<Tenant[]>;
}
