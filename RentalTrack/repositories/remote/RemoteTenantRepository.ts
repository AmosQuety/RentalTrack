import { Tenant } from '../../../libs/types';
import { supabase } from '../../../services/api/supabase';
import { ITenantRepository } from '../interfaces/ITenantRepository';

export class RemoteTenantRepository implements ITenantRepository {
  async getAll(): Promise<Tenant[]> {
    const { data, error } = await supabase
      .from('tenants')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data as Tenant[];
  }

  async getById(id: number): Promise<Tenant | null> {
    const { data, error } = await supabase
      .from('tenants')
      .select('*')
      .eq('tenant_id', id)
      .is('deleted_at', null)
      .single();

    if (error) {
       // Single resturns an error if no rows found
       if (error.code === 'PGRST116') return null;
       throw new Error(error.message);
    }
    return data as Tenant;
  }

  async create(tenant: Omit<Tenant, 'tenant_id' | 'created_at' | 'updated_at'>): Promise<Tenant> {
    const { data, error } = await supabase
      .from('tenants')
      .insert([tenant])
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as Tenant;
  }

  async update(id: number, updates: Partial<Tenant>): Promise<void> {
    const { error } = await supabase
      .from('tenants')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('tenant_id', id);

    if (error) throw new Error(error.message);
  }

  async delete(id: number): Promise<void> {
    const { error } = await supabase
      .from('tenants')
      .update({ deleted_at: new Date().toISOString() })
      .eq('tenant_id', id);

    if (error) throw new Error(error.message);
  }

  async getUpdatedSince(timestamp: string): Promise<Tenant[]> {
    const { data, error } = await supabase
      .from('tenants')
      .select('*')
      // Note: Supabase supports or syntax: `or=(updated_at.gt.${timestamp},deleted_at.gt.${timestamp})`
      .or(`updated_at.gt.${timestamp},deleted_at.gt.${timestamp}`)
      .order('updated_at', { ascending: true });

    if (error) throw new Error(error.message);
    return data as Tenant[];
  }
}
