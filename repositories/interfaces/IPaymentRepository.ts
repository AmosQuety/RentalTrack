import { Payment } from '../../libs/types';

export interface IPaymentRepository {
  /**
   * Fetch all payments for a tenant and user
   */
  getAllByTenant(tenantId: number, userId: string): Promise<Payment[]>;

  /**
   * Fetch a payment by ID and user ID
   */
  getById(id: number, userId: string): Promise<Payment | null>;

  /**
   * Record a new payment.
   */
  create(userId: string, payment: Omit<Payment, 'payment_id' | 'payment_date' | 'user_id' | 'is_dirty' | 'version'>): Promise<Payment>;
  
  /**
   * Soft delete a payment.
   */
  delete(id: number, userId: string): Promise<void>;
  
  /**
   * SYNC: Fetch only records updated after a certain timestamp (Delta Pull)
   */
  getUpdatedSince(userId: string, timestamp: string): Promise<Payment[]>;
}
