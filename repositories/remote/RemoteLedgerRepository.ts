import { LedgerEntry } from '../../../domain/ledger';
import { supabase } from '../../../services/api/supabase';
import { ILedgerRepository } from '../interfaces/ILedgerRepository';

export class RemoteLedgerRepository implements ILedgerRepository {
  async getAllByTenant(tenantId: number): Promise<LedgerEntry[]> {
    const { data, error } = await supabase
      .from('ledger_entries')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('reference_date', { ascending: false })
      .order('entry_id', { ascending: false });

    if (error) throw new Error(error.message);
    return data as LedgerEntry[];
  }

  async create(entry: Omit<LedgerEntry, 'entry_id' | 'created_at'>): Promise<LedgerEntry> {
    const { data, error } = await supabase
      .from('ledger_entries')
      .insert([entry])
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as LedgerEntry;
  }

  async getUpdatedSince(timestamp: string): Promise<LedgerEntry[]> {
    const { data, error } = await supabase
      .from('ledger_entries')
      .select('*')
      .gt('created_at', timestamp);

    if (error) throw new Error(error.message);
    return data as LedgerEntry[];
  }
}
