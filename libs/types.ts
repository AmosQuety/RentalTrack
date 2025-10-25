// libs/types.ts
export interface Tenant {
  tenant_id: number;
  name: string;
  phone: string;
  room_number: string;
  start_date: string;
  monthly_rent: number;
  status: 'Paid' | 'Due Soon' | 'Overdue';
  notes: string;
  created_at: string;
  updated_at: string;
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
}

export interface Settings {
  setting_id: number;
  reminder_days_before_due: number;
  reminder_time: string;
  notification_enabled: boolean;
  currency: string;
  theme: string;
  created_at: string;
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
}