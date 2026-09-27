import { Payment } from '../../../libs/types';
import { supabase } from '../../../services/api/supabase';
import { IPaymentRepository } from '../interfaces/IPaymentRepository';

export class RemotePaymentRepository implements IPaymentRepository {
  async getAllByTenant(tenantId: number): Promise<Payment[]> {
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('payment_date', { ascending: false });

    if (error) throw new Error(error.message);
    return data as Payment[];
  }

  async getById(id: number): Promise<Payment | null> {
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('payment_id', id)
      .is('deleted_at', null)
      .single();

    if (error) {
       if (error.code === 'PGRST116') return null;
       throw new Error(error.message);
    }
    return data as Payment;
  }

  async create(payment: Omit<Payment, 'payment_id' | 'payment_date'>): Promise<Payment> {
    const timestamp = new Date().toISOString();
    const { data, error } = await supabase
      .from('payments')
      .insert([{ ...payment, payment_date: timestamp }])
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as Payment;
  }

  async delete(id: number): Promise<void> {
    const { error } = await supabase
      .from('payments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('payment_id', id);

    if (error) throw new Error(error.message);
  }

  async getUpdatedSince(timestamp: string): Promise<Payment[]> {
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .or(`created_at.gt.${timestamp},deleted_at.gt.${timestamp}`);

    if (error) throw new Error(error.message);
    return data as Payment[];
  }
}
