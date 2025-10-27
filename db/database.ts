// db/database.ts
import * as SQLite from 'expo-sqlite';
import { Payment, Reminder, Settings, Tenant } from '../libs/types';

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
        notification_enabled INTEGER DEFAULT 1,
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
  // Get database instance for direct access
  getDb: () => db,

  // Get all tenants
  getAllTenants: async (): Promise<Tenant[]> => {
    try {
      const tenants = await db.getAllAsync<Tenant>('SELECT * FROM tenants ORDER BY name');
      return tenants || [];
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
  }): Promise<number> => {
    try {
      // Insert tenant
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
      
      const tenantId = result.lastInsertRowId;
      
      // Create initial reminder for the tenant
      const nextDueDate = new Date(tenant.startDate);
      nextDueDate.setMonth(nextDueDate.getMonth() + 1);
      
      try {
        const { NotificationService } = await import('../services/notifications');
        await NotificationService.createReminder(
          tenantId,
          nextDueDate.toISOString().split('T')[0]
        );
      } catch (notifError) {
        console.warn('⚠️ Failed to create initial reminder:', notifError);
        // Don't throw - tenant was created successfully
      }
      
      return tenantId;
    } catch (error) {
      console.error('❌ Error adding tenant:', error);
      throw error;
    }
  },

  // Update tenant
updateTenant: async (tenantId: number, updates: {
  name: string;
  phone: string;
  roomNumber: string;
  startDate: string;
  monthlyRent: number;
  notes?: string;
}): Promise<void> => {
  try {
    await db.runAsync(
      `UPDATE tenants 
       SET name = ?, phone = ?, room_number = ?, start_date = ?, monthly_rent = ?, notes = ?, updated_at = datetime('now')
       WHERE tenant_id = ?`,
      [
        updates.name.trim(),
        updates.phone.trim(),
        updates.roomNumber.trim(),
        updates.startDate,
        updates.monthlyRent,
        updates.notes?.trim() || '',
        tenantId
      ]
    );
    
    console.log(`✅ Updated tenant ${tenantId}`);
  } catch (error) {
    console.error('❌ Error updating tenant:', error);
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
  }): Promise<number> => {
  try {
    // Get tenant's monthly rent
    const tenant = await db.getFirstAsync<{ monthly_rent: number }>(
      'SELECT monthly_rent FROM tenants WHERE tenant_id = ?',
      [payment.tenantId]
    );

    if (!tenant) {
      throw new Error('Tenant not found');
    }

    // FIX: Calculate FULL months covered (no partial months)
    const fullMonthsCovered = Math.floor(payment.amountPaid / tenant.monthly_rent);
    const remainingAmount = payment.amountPaid % tenant.monthly_rent;
    
    // Get last payment to calculate next due date
    const lastPayment = await db.getFirstAsync<{ next_due_date: string }>(
      'SELECT next_due_date FROM payments WHERE tenant_id = ? ORDER BY payment_date DESC LIMIT 1',
      [payment.tenantId]
    );

    let baseDate: Date;
    if (lastPayment) {
      baseDate = new Date(lastPayment.next_due_date);
    } else {
      // For first payment, use the tenant's start date
      const tenantData = await db.getFirstAsync<{ start_date: string }>(
        'SELECT start_date FROM tenants WHERE tenant_id = ?',
        [payment.tenantId]
      );
      baseDate = new Date(tenantData!.start_date);
    }

    const nextDueDate = new Date(baseDate);
    nextDueDate.setMonth(nextDueDate.getMonth() + fullMonthsCovered);

    // Insert payment
    const result = await db.runAsync(
      `INSERT INTO payments (tenant_id, amount_paid, months_paid_for, payment_date, next_due_date, payment_method, notes) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        payment.tenantId,
        payment.amountPaid,
        fullMonthsCovered, // Store full months only
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

    // Handle remaining amount (credit for next month)
    if (remainingAmount > 0) {
      console.log(`💰 Credit of ${remainingAmount} UGX will apply to next payment`);
      // You could store this in a separate credits table or add to notes
    }

    // Cancel existing reminders and create new one
    try {
      const { NotificationService } = await import('../services/notifications');
      await NotificationService.cancelReminders(payment.tenantId);
      await NotificationService.createReminder(
        payment.tenantId, 
        nextDueDate.toISOString().split('T')[0]
      );
    } catch (notifError) {
      console.warn('⚠️ Failed to update reminders:', notifError);
    }

    return result.lastInsertRowId;
  } catch (error) {
    console.error('❌ Error recording payment:', error);
    throw error;
  }
},

  // Get payment history for tenant
  getPaymentHistory: async (tenantId: number): Promise<Payment[]> => {
    try {
      const payments = await db.getAllAsync<Payment>(
        'SELECT * FROM payments WHERE tenant_id = ? ORDER BY payment_date DESC',
        [tenantId]
      );
      return payments || [];
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

      const reminders = await db.getAllAsync<Reminder>(
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
      return reminders || [];
    } catch (error) {
      console.error('❌ Error getting upcoming reminders:', error);
      return [];
    }
  },

  // Settings management
  getSettings: async (): Promise<Settings | null> => {
    try {
      const settings = await db.getFirstAsync<Settings>('SELECT * FROM settings LIMIT 1');
      // Convert integer to boolean for notification_enabled
      if (settings) {
        return {
          ...settings,
          notification_enabled: Boolean(settings.notification_enabled)
        };
      }
      return settings;
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
          settings.notification_enabled ? 1 : 0,
          settings.currency ?? current.currency,
          settings.theme ?? current.theme,
          current.setting_id
        ]
      );
    } catch (error) {
      console.error('❌ Error updating settings:', error);
      throw error;
    }
  },

  // Delete tenant (CASCADE deletes payments and reminders)
  deleteTenant: async (tenantId: number): Promise<void> => {
    try {
      // Cancel any pending reminders first
      const { NotificationService } = await import('../services/notifications');
      await NotificationService.cancelReminders(tenantId);

      // Delete tenant (CASCADE will delete related records)
      await db.runAsync('DELETE FROM tenants WHERE tenant_id = ?', [tenantId]);
      
      console.log(`✅ Deleted tenant ${tenantId}`);
    } catch (error) {
      console.error('❌ Error deleting tenant:', error);
      throw error;
    }
  },

  // Get payment statistics
  getPaymentStats: async (): Promise<{
    totalCollected: number;
    thisMonth: number;
    lastMonth: number;
    overdueAmount: number;
  }> => {
    try {
      const now = new Date();
      const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];

      // Total collected
      const total = await db.getFirstAsync<{ total: number }>(
        'SELECT COALESCE(SUM(amount_paid), 0) as total FROM payments'
      );

      // This month
      const thisMonth = await db.getFirstAsync<{ total: number }>(
        'SELECT COALESCE(SUM(amount_paid), 0) as total FROM payments WHERE payment_date >= ?',
        [thisMonthStart]
      );

      // Last month
      const lastMonth = await db.getFirstAsync<{ total: number }>(
        'SELECT COALESCE(SUM(amount_paid), 0) as total FROM payments WHERE payment_date BETWEEN ? AND ?',
        [lastMonthStart, lastMonthEnd]
      );

      // Overdue amount (tenants with Overdue status)
      const overdue = await db.getFirstAsync<{ total: number }>(
        'SELECT COALESCE(SUM(monthly_rent), 0) as total FROM tenants WHERE status = ?',
        ['Overdue']
      );

      return {
        totalCollected: total?.total || 0,
        thisMonth: thisMonth?.total || 0,
        lastMonth: lastMonth?.total || 0,
        overdueAmount: overdue?.total || 0,
      };
    } catch (error) {
      console.error('❌ Error getting payment stats:', error);
      return {
        totalCollected: 0,
        thisMonth: 0,
        lastMonth: 0,
        overdueAmount: 0,
      };
    }
  },

  // Get monthly payment trend (last 6 months)
  getMonthlyTrend: async (): Promise<{ month: string; amount: number }[]> => {
    try {
      const months = [];
      const now = new Date();

      for (let i = 5; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthStart = date.toISOString().split('T')[0];
        const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0).toISOString().split('T')[0];

        const result = await db.getFirstAsync<{ total: number }>(
          'SELECT COALESCE(SUM(amount_paid), 0) as total FROM payments WHERE payment_date BETWEEN ? AND ?',
          [monthStart, monthEnd]
        );

        months.push({
          month: date.toLocaleDateString('en-US', { month: 'short' }),
          amount: result?.total || 0,
        });
      }

      return months;
    } catch (error) {
      console.error('❌ Error getting monthly trend:', error);
      return [];
    }
  }
};

export default Database;