// libs/types.ts - UPDATED
export interface Tenant {
  tenant_id: number;
  name: string;
  phone: string;
  room_number: string;
  start_date: string;
  contract_end_date: string; 
  monthly_rent: number;
  rent_cycle: 'monthly' | 'biweekly' | 'quarterly';
  status: 'Paid' | 'Due Soon' | 'Overdue' | 'Suspended';
  credit_balance: number;
  notes: string;
  created_at: string;
  updated_at: string;
  user_id: string;
  version: number;
  is_dirty: number;
  deleted_at: string | null;
}

export interface Payment {
  payment_id: number;
  tenant_id: number;
  amount_paid: number;
  months_paid_for: number;
  payment_date: string;
  next_due_date: string;
  payment_method: string;
  notes: string;
  created_at: string;
  receipt_url?: string | null;
  rent_amount_at_payment?: number;
  rent_cycle_at_payment?: string;
  user_id: string;
  version: number;
  is_dirty: number;
  deleted_at: string | null;
}

export interface Settings {
  setting_id: number;
  reminder_days_before_due: number;
  reminder_time: string;
  notification_enabled: number; // SQLite INTEGER: 1 = enabled, 0 = disabled
  currency: string;
  theme: string;
  auto_suspend_days: number;
  contract_reminder_days: number;
  created_at: string;
  updated_at?: string;
  user_id: string;
  is_dirty?: number;
  version?: number;
}

export interface Reminder {
  reminder_id: number;
  tenant_id: number;
  due_date: string;
  reminder_date: string;
  status: 'Pending' | 'Sent' | 'Cancelled';
  message: string;
  created_at: string;
  name?: string;
  room_number?: string;
  user_id: string;
  version: number;
  is_dirty: number;
  deleted_at: string | null;
}

// NEW: Analytics types
export interface AnalyticsData {
  receivedThisMonth: number;
  expectedThisMonth: number;
  collectionRate: number;
  overdueTrend: { week: string; amount: number }[];
  tenantReliability: { tenantId: number; name: string; avgDaysLate: number }[];
  expiringContracts: number;
  autoSuspensionAlerts: string[];
}