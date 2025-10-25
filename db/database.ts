// db/database.ts
import * as SQLite from 'expo-sqlite';
import { Tenant, Payment, Settings, Reminder } from '../libs/types';

// Open database connection
const db = SQLite.openDatabaseSync('RentReminderDB');

export const initializeDatabase = async (): Promise<void> => {
  try {
    // Enable foreign keys
    await db.execAsync('PRAGMA foreign_keys = ON;');

    // Tenants Table
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS tenants (
        tenant_id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT,
        room_number TEXT NOT NULL,
        start_date TEXT NOT NULL,
        monthly_rent REAL NOT NULL,
        status TEXT DEFAULT 'Due Soon',
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `);

    // Payments Table
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS payments (
        payment_id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL,
        amount_paid REAL NOT NULL,
        months_paid_for REAL NOT NULL,
        payment_date TEXT NOT NULL,
        next_due_date TEXT NOT NULL,
        payment_method TEXT DEFAULT 'Cash',
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants (tenant_id) ON DELETE CASCADE
      );
    `);

    // Reminders Table
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS reminders (
        reminder_id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL,
        due_date TEXT NOT NULL,
        reminder_date TEXT NOT NULL,
        status TEXT DEFAULT 'Pending',
        message TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (tenant_id) REFERENCES tenants (tenant_id) ON DELETE CASCADE
      );
    `);

    // Settings Table
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS settings (
        setting_id INTEGER PRIMARY KEY AUTOINCREMENT,
        reminder_days_before_due INTEGER DEFAULT 3,
        reminder_time TEXT DEFAULT '09:00',
        notification_enabled BOOLEAN DEFAULT 1,
        currency TEXT DEFAULT 'UGX',
        theme TEXT DEFAULT 'Light',
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);

    // Create indexes
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_reminders_status ON reminders(status);
      CREATE INDEX IF NOT EXISTS idx_reminders_tenant ON reminders(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_reminders_date ON reminders(reminder_date);
    `);

    // Insert default settings if none exist
    const settingsCount = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM settings'
    );
    
    if (settingsCount && settingsCount.count === 0) {
      await db.runAsync(
        `INSERT INTO settings (reminder_days_before_due, reminder_time, notification_enabled, currency, theme) 
         VALUES (?, ?, ?, ?, ?)`,
        [3, '09:00', 1, 'UGX', 'Light']
      );
    }

    console.log('✅ Database initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    throw error;
  }
};

// Helper function to calculate tenant status
const calculateTenantStatus = (nextDueDate: string): 'Paid' | 'Due Soon' | 'Overdue' => {
  const today = new Date();
  const dueDate = new Date(nextDueDate);
  const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  
  if (daysUntilDue < 0) return 'Overdue';
  if (daysUntilDue <= 3) return 'Due Soon';
  return 'Paid';
};

export const Database = {
  // Generic query execution
  executeQuery: async (query: string, params: any[] = []): Promise<any> => {
    try {
      return await db.execAsync(query, params);
    } catch (error) {
      console.error('❌ Query execution error:', error);
      throw error;
    }
  },

  // Get all tenants
  getAllTenants: async (): Promise<Tenant[]> => {
    try {
      return await db.getAllAsync<Tenant>('SELECT * FROM tenants ORDER BY name');
    } catch (error) {
      console.error('❌ Error getting tenants:', error);
      return [];
    }
  },

  // Get tenant by ID
  getTenant: async (tenantId: number): Promise<Tenant | null> => {
    try {
      return await db.getFirstAsync<Tenant>(
        'SELECT * FROM tenants WHERE tenant_id = ?',
        [tenantId]
      );
    } catch (error) {
      console.error('❌ Error getting tenant:', error);
      return null;
    }
  },

  // Add new tenant
  addTenant: async (tenant: {
    name: string;
    phone: string;
    roomNumber: string;
    startDate: string;
    monthlyRent: number;
    notes?: string;
  }): Promise<SQLite.SQLiteRunResult> => {
    try {
      const result = await db.runAsync(
        `INSERT INTO tenants (name, phone, room_number, start_date, monthly_rent, notes) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          tenant.name.trim(),
          tenant.phone.trim(),
          tenant.roomNumber.trim(),
          tenant.startDate,
          tenant.monthlyRent,
          tenant.notes?.trim() || ''
        ]
      );
      
      // Create initial reminder for the tenant
      const nextDueDate = new Date(tenant.startDate);
      nextDueDate.setMonth(nextDueDate.getMonth() + 1);
      
      const { NotificationService } = await import('../services/notifications');
      await NotificationService.createReminder(
        result.lastInsertRowId as number,
        nextDueDate.toISOString().split('T')[0]
      );
      
      return result;
    } catch (error) {
      console.error('❌ Error adding tenant:', error);
      throw error;
    }
  },

  // Record payment
  recordPayment: async (payment: {
    tenantId: number;
    amountPaid: number;
    paymentDate: string;
    paymentMethod: string;
    notes?: string;
  }): Promise<SQLite.SQLiteRunResult> => {
    try {
      // Get tenant's monthly rent
      const tenant = await db.getFirstAsync<{ monthly_rent: number }>(
        'SELECT monthly_rent FROM tenants WHERE tenant_id = ?',
        [payment.tenantId]
      );

      if (!tenant) {
        throw new Error('Tenant not found');
      }

      // Calculate months covered
      const monthsPaidFor = payment.amountPaid / tenant.monthly_rent;
      
      // Get last payment to calculate next due date
      const lastPayment = await db.getFirstAsync<{ next_due_date: string }>(
        'SELECT next_due_date FROM payments WHERE tenant_id = ? ORDER BY payment_date DESC LIMIT 1',
        [payment.tenantId]
      );

      const baseDate = lastPayment ? new Date(lastPayment.next_due_date) : new Date(payment.paymentDate);
      const nextDueDate = new Date(baseDate);
      nextDueDate.setMonth(nextDueDate.getMonth() + monthsPaidFor);

      // Insert payment
      const result = await db.runAsync(
        `INSERT INTO payments (tenant_id, amount_paid, months_paid_for, payment_date, next_due_date, payment_method, notes) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          payment.tenantId,
          payment.amountPaid,
          monthsPaidFor,
          payment.paymentDate,
          nextDueDate.toISOString().split('T')[0],
          payment.paymentMethod,
          payment.notes || ''
        ]
      );

      // Update tenant status
      const status = calculateTenantStatus(nextDueDate.toISOString().split('T')[0]);
      await db.runAsync(
        'UPDATE tenants SET status = ?, updated_at = datetime("now") WHERE tenant_id = ?',
        [status, payment.tenantId]
      );

      // Cancel existing reminders and create new one
      const { NotificationService } = await import('../services/notifications');
      await NotificationService.cancelReminders(payment.tenantId);
      await NotificationService.createReminder(
        payment.tenantId, 
        nextDueDate.toISOString().split('T')[0]
      );

      return result;
    } catch (error) {
      console.error('❌ Error recording payment:', error);
      throw error;
    }
  },

  // Get payment history for tenant
  getPaymentHistory: async (tenantId: number): Promise<Payment[]> => {
    try {
      return await db.getAllAsync<Payment>(
        'SELECT * FROM payments WHERE tenant_id = ? ORDER BY payment_date DESC',
        [tenantId]
      );
    } catch (error) {
      console.error('❌ Error getting payment history:', error);
      return [];
    }
  },

  // Get upcoming reminders
  getUpcomingReminders: async (daysAhead: number = 7): Promise<Reminder[]> => {
    try {
      const today = new Date();
      const futureDate = new Date();
      futureDate.setDate(today.getDate() + daysAhead);

      return await db.getAllAsync<Reminder>(
        `SELECT r.*, t.name, t.room_number 
         FROM reminders r 
         JOIN tenants t ON r.tenant_id = t.tenant_id 
         WHERE date(r.reminder_date) BETWEEN date(?) AND date(?)
         AND r.status = 'Pending'
         ORDER BY r.reminder_date ASC`,
        [
          today.toISOString().split('T')[0],
          futureDate.toISOString().split('T')[0]
        ]
      );
    } catch (error) {
      console.error('❌ Error getting upcoming reminders:', error);
      return [];
    }
  },

  // Settings management
  getSettings: async (): Promise<Settings | null> => {
    try {
      return await db.getFirstAsync<Settings>('SELECT * FROM settings LIMIT 1');
    } catch (error) {
      console.error('❌ Error getting settings:', error);
      return null;
    }
  },

  updateSettings: async (settings: Partial<Settings>): Promise<void> => {
    try {
      const current = await db.getFirstAsync<Settings>('SELECT * FROM settings LIMIT 1');
      if (!current) {
        throw new Error('No settings found');
      }

      await db.runAsync(
        `UPDATE settings SET 
          reminder_days_before_due = ?,
          reminder_time = ?,
          notification_enabled = ?,
          currency = ?,
          theme = ?
         WHERE setting_id = ?`,
        [
          settings.reminder_days_before_due ?? current.reminder_days_before_due,
          settings.reminder_time ?? current.reminder_time,
          settings.notification_enabled ?? current.notification_enabled,
          settings.currency ?? current.currency,
          settings.theme ?? current.theme,
          current.setting_id
        ]
      );
    } catch (error) {
      console.error('❌ Error updating settings:', error);
      throw error;
    }
  }
};

export default Database;