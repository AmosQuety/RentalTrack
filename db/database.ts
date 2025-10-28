// db/database.ts
import { addMonths, format, parseISO } from 'date-fns';
import * as SQLite from 'expo-sqlite';
import { Payment, Reminder, Settings, Tenant } from '../libs/types';

// Open database connection
const db = SQLite.openDatabaseSync('RentReminderDB');

// Add this at the top of database.ts
class RoomAlreadyExistsError extends Error {
  constructor(roomNumber: string) {
    super(`Room "${roomNumber}" is already occupied by another tenant. Please choose a different room.`);
    this.name = 'RoomAlreadyExistsError';
  }
}

class DatabaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseError';
  }
}

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
    room_number TEXT NOT NULL UNIQUE,  -- ADD UNIQUE CONSTRAINT
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

  // Add this function to the Database object in database.ts
checkRoomExists: async (roomNumber: string, excludeTenantId?: number): Promise<boolean> => {
  try {
    let query = 'SELECT COUNT(*) as count FROM tenants WHERE room_number = ?';
    const params = [roomNumber.trim()];
    
    if (excludeTenantId) {
      query += ' AND tenant_id != ?';
      params.push(excludeTenantId);
    }
    
    const result = await db.getFirstAsync<{ count: number }>(query, params);
    return (result?.count || 0) > 0;
  } catch (error) {
    console.error('❌ Error checking room availabitility:', error);
    throw new DatabaseError('Unable to verify room availability. Please try again.');
    
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
      // Check if room already exists
    const roomExists = await Database.checkRoomExists(tenant.roomNumber);
    if (roomExists) {
      throw new RoomAlreadyExistsError(tenant.roomNumber);
      
    }

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
      // Re-throw our custom errors, wrap others in user-friendly messages
      if (error instanceof RoomAlreadyExistsError || error instanceof DatabaseError){
      throw error;
      }
    }
    throw new DatabaseError('Failed to add tenant. Please check your information and try again.');
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
      // Check if room already exists (excluding current tenant)
    const roomExists = await Database.checkRoomExists(updates.roomNumber, tenantId);
    if (roomExists) {
       
      throw new RoomAlreadyExistsError(updates.roomNumber);
    }


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
    if (error instanceof RoomAlreadyExistsError || error instanceof DatabaseError) {

    throw error;
  }
    throw new DatabaseError('Failed to update tenant. Please check your information and try again.');
  }
},

updateAllTenantStatuses: async (): Promise<void> => {
    try {
      console.log('🔄 Updating all tenant statuses...');
      const tenants = await db.getAllAsync<Tenant>('SELECT * FROM tenants');
      
      let updatedCount = 0;
      
      for (const tenant of tenants) {
        // Get the most recent payment's next_due_date
        const lastPayment = await db.getFirstAsync<{ next_due_date: string }>(
          'SELECT next_due_date FROM payments WHERE tenant_id = ? ORDER BY payment_date DESC LIMIT 1',
          [tenant.tenant_id]
        );
        
        // Use last payment's next_due_date, or fallback to start_date + 1 month if no payments
        let nextDueDate: string;
        if (lastPayment?.next_due_date) {
          nextDueDate = lastPayment.next_due_date;
        } else {
          // For tenants with no payments yet, calculate from start_date
          const startDate = new Date(tenant.start_date);
          startDate.setMonth(startDate.getMonth() + 1);
          nextDueDate = startDate.toISOString().split('T')[0];
        }
        
        const newStatus = calculateTenantStatus(nextDueDate);
        
        // Update if status changed
        if (newStatus !== tenant.status) {
          await db.runAsync(
            'UPDATE tenants SET status = ?, updated_at = datetime("now") WHERE tenant_id = ?',
            [newStatus, tenant.tenant_id]
          );
          updatedCount++;
          console.log(`✅ Updated ${tenant.name} from ${tenant.status} to ${newStatus}`);
        }
      }
      
      console.log(`✅ Tenant status update complete: ${updatedCount} tenants updated`);
    } catch (error) {
      console.error('❌ Error updating tenant statuses:', error);
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
    const tenant = await db.getFirstAsync<{ monthly_rent: number, start_date:string }>(
      'SELECT monthly_rent, start_date FROM tenants WHERE tenant_id = ?',
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
    if (lastPayment?.next_due_date) {
      baseDate = new Date(lastPayment.next_due_date);
    } else {
        // For first payment, use the tenant's start date
      baseDate = parseISO(tenant.start_date);
    }

     // FIXED: Use date-fns for correct month calculations
    const nextDueDate = addMonths(baseDate, fullMonthsCovered);

    nextDueDate.setMonth(nextDueDate.getMonth() + fullMonthsCovered);

    // Insert payment
    const result = await db.runAsync(
      `INSERT INTO payments (tenant_id, amount_paid, months_paid_for, payment_date, next_due_date, payment_method, notes) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        payment.tenantId,
        payment.amountPaid,
        fullMonthsCovered,
        payment.paymentDate,
        format(nextDueDate, 'yyyy-MM-dd'), 
        payment.paymentMethod,
        payment.notes || ''
      ]
    );

    // Update tenant status
   const status = calculateTenantStatus(format(nextDueDate, 'yyyy-MM-dd'));
    await db.runAsync(
      'UPDATE tenants SET status = ?, updated_at = datetime("now") WHERE tenant_id = ?',
      [status, payment.tenantId]
    );

    // Cancel existing reminders and create new one
    try {
      const { NotificationService } = await import('../services/notifications');
      await NotificationService.cancelReminders(payment.tenantId);
      await NotificationService.createReminder(
        payment.tenantId, 
         format(nextDueDate, 'yyyy-MM-dd')
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

// db/database.ts
// Core Rent Logic (where it primarily resides):
// initializeDatabase: Well-structured, creates tables, indexes, and sets default settings. Good use of PRAGMA foreign_keys = ON;.
// RoomAlreadyExistsError / DatabaseError: Excellent! Custom error classes are a huge improvement for specific error handling and clearer error messages to the user.
// checkRoomExists: Good validation to prevent duplicate room numbers.
// addTenant & updateTenant: Correctly use checkRoomExists.
// calculateTenantStatus: This is the heart of your tenant status logic.
// Issue: daysUntilDue <= 3 for 'Due Soon' and daysUntilDue < 0 for 'Overdue'. This logic defines the payment status and needs to be robust.
// Improvement: The status is based on nextDueDate. This nextDueDate is only explicitly updated in recordPayment. What happens if no payment is made for a long time? The status will remain Due Soon or Overdue, but the next_due_date in the payments table (which is what calculateTenantStatus uses as nextDueDate implicitly, via the most recent payment) won't naturally advance.
// CRITICAL RENT LOGIC FLAW: The status in the tenants table is only explicitly updated in recordPayment. If no payment is made, the status will not automatically change from 'Paid' to 'Due Soon' to 'Overdue'. There needs to be a background task or periodic check that updates tenant statuses based on their next_due_date and the current date. This is the most significant missing piece for production readiness in the rent logic.
// Recommendation: Implement a background service (e.g., using expo-task-manager or a simpler useEffect with an interval in a main component, which triggers checkAndAdvanceTenantStatuses function in database.ts). This function would iterate through all tenants, re-calculate their status based on the current date and their latest next_due_date from payments, and update the tenants.status column.
// recordPayment:
// fullMonthsCovered: Math.floor(payment.amountPaid / tenant.monthly_rent) is correct for whole months.
// remainingAmount: payment.amountPaid % tenant.monthly_rent is correct for credit.
// baseDate for nextDueDate: This is crucial. It correctly picks the next_due_date from the last payment or the tenant's start date. This implies a rolling next_due_date based on payments, which is a common and usually desired behavior.
// nextDueDate.setMonth(nextDueDate.getMonth() + fullMonthsCovered): This is the critical date calculation point. As mentioned above, using native Date.setMonth can lead to issues if the day of the month is greater than the number of days in the target month (e.g., Jan 31 + 1 month = March 2nd/3rd). Absolutely use a date library here for correctness.
// remainingAmount > 0: Good log, but for production, you might want to explicitly store and track this "credit" for a tenant in a separate field or table, rather than just in notes or a console log. This allows proper accounting for partial payments.
// Reminder handling: Correctly cancels old and creates new reminders.
// getPaymentStats & getMonthlyTrend: Good analytical functions. Date range calculations are solid.
// Improvements for Production:
// Automated Status Updates (CRITICAL): As detailed above, implement a mechanism to periodically update tenants.status and generate reminders for overdue tenants, not just when a payment is recorded. This is the biggest gap in the rental lifecycle management.
// Date Library: Replace all native Date object manipulations (especially setMonth, setDate) with date-fns or moment.js to avoid bugs.
// Transaction Management: For recordPayment, which involves multiple db.runAsync calls (insert payment, update tenant status, cancel/create reminders), these operations should ideally be wrapped in a single database transaction. If any step fails, the entire transaction should roll back, ensuring data consistency. SQLite supports transactions (BEGIN TRANSACTION;, COMMIT;, ROLLBACK;).
// Error Detail: When console.error('❌ Error getting tenants:', error); happens, it might be beneficial to log the full stack trace of the error in production.
// Constants: status strings ('Paid', 'Due Soon', 'Overdue') should be defined as constants to prevent typos.
// db.getAllAsync and db.getFirstAsync: These are good wrappers.
// Type Safety: Explicitly typing the parameters and return values of all database functions (which you've mostly done) is crucial for maintainability.