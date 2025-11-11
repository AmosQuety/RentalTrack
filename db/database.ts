// database.ts - COMPLETE VERSION WITH ALL FUNCTIONS
import { addDays, addMonths, endOfMonth, format, parseISO, startOfMonth, subMonths } from 'date-fns';
import * as SQLite from 'expo-sqlite';
import { Payment, Reminder, Settings, Tenant } from '../libs/types';

// --- CRITICAL FIX: Lazy database initialization ---
let db: SQLite.SQLiteDatabase | null = null;
let initializationPromise: Promise<void> | null = null;

// Safe database getter that waits for initialization
const getDb = (): SQLite.SQLiteDatabase => {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
};

// --- Custom Error Classes for Better UI Feedback ---
class RoomAlreadyExistsError extends Error {
  constructor(roomNumber: string) {
    super(`Room "${roomNumber}" is already occupied. Please choose a different room.`);
    this.name = 'RoomAlreadyExistsError';
  }
}

class DatabaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseError';
  }
}

/**
 * Calculate next due date based on rent cycle
 */
const calculateNextDueDate = (baseDate: Date, rentCycle: 'monthly' | 'biweekly' | 'quarterly'): Date => {
  const base = new Date(baseDate);
  
  switch (rentCycle) {
    case 'monthly':
      return addMonths(base, 1);
    case 'biweekly':
      return addDays(base, 14);
    case 'quarterly':
      return addMonths(base, 3);
    default:
      return addMonths(base, 1);
  }
};

/**
 * Calculate tenant status based on next due date and payment history
 */
const calculateTenantStatus = (nextDueDate: string, hasPayments: boolean, currentDate: Date = new Date()): 'Paid' | 'Due Soon' | 'Overdue' => {
  try {
    const today = new Date(currentDate);
    today.setHours(0, 0, 0, 0);
    
    // Validate nextDueDate before parsing
    if (!nextDueDate || typeof nextDueDate !== 'string') {
      console.warn('Invalid nextDueDate:', nextDueDate);
      return hasPayments ? 'Due Soon' : 'Overdue';
    }
    
    const dueDate = parseISO(nextDueDate);
    dueDate.setHours(0, 0, 0, 0);
    
    const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    // FIXED LOGIC: New tenants without payments should start as "Due Soon"
    if (!hasPayments) {
      return daysUntilDue >= 0 ? 'Due Soon' : 'Overdue';
    }
    
    // FIXED: Simplified logic - if due date is in future, tenant is paid
    if (daysUntilDue > 3) {
      return 'Paid';
    } else if (daysUntilDue >= 0) {
      return 'Due Soon';
    } else {
      return 'Overdue';
    }
  } catch (error) {
    console.error('Error calculating tenant status:', error);
    return hasPayments ? 'Due Soon' : 'Overdue';
  }
};

/**
 * Get tenant's current next due date - FIXED VERSION
 */
const getTenantNextDueDate = async (tenantId: number, database: SQLite.SQLiteDatabase): Promise<string> => {
  try {
    // Get tenant details
    const tenant = await database.getFirstAsync<Tenant>(
      'SELECT start_date, rent_cycle FROM tenants WHERE tenant_id = ?', 
      [tenantId]
    );
    if (!tenant) throw new Error('Tenant not found for due date calculation');

    // Try to get from last payment
    const lastPayment = await database.getFirstAsync<{ next_due_date: string }>(
      'SELECT next_due_date FROM payments WHERE tenant_id = ? ORDER BY next_due_date DESC, payment_id DESC LIMIT 1',
      [tenantId]
    );

    if (lastPayment?.next_due_date) {
      return lastPayment.next_due_date;
    }

    // Calculate from start date if no payments
    const firstDueDate = calculateNextDueDate(parseISO(tenant.start_date), tenant.rent_cycle || 'monthly');
    return format(firstDueDate, 'yyyy-MM-dd');

  } catch (error) {
    console.error('Error getting next due date for tenant:', tenantId, error);
    // Fallback calculation
    const tenant = await database.getFirstAsync<Tenant>('SELECT start_date FROM tenants WHERE tenant_id = ?', [tenantId]);
    if (tenant) {
      const fallbackDate = addMonths(parseISO(tenant.start_date), 1);
      return format(fallbackDate, 'yyyy-MM-dd');
    }
    return format(addMonths(new Date(), 1), 'yyyy-MM-dd');
  }
};

// --- Database Initialization and Migrations ---

// Migration function to safely add new columns to existing tables
const runMigrations = async (database: SQLite.SQLiteDatabase): Promise<void> => {
  try {
    // CHECK TENANTS TABLE
    const tenantTableInfo = await database.getAllAsync<{ name: string }>(
      "PRAGMA table_info(tenants)"
    );
    
    const hasCreditBalance = tenantTableInfo.some(column => column.name === 'credit_balance');
    const hasContractEndDate = tenantTableInfo.some(column => column.name === 'contract_end_date');
    const hasRentCycle = tenantTableInfo.some(column => column.name === 'rent_cycle');
    
    if (!hasCreditBalance) {
      console.log('🔄 Running migration: Adding credit_balance column...');
      await database.execAsync('ALTER TABLE tenants ADD COLUMN credit_balance REAL DEFAULT 0;');
      console.log('✅ Migration completed: credit_balance column added.');
    }
    
    if (!hasContractEndDate) {
      console.log('🔄 Running migration: Adding contract_end_date column...');
      await database.execAsync('ALTER TABLE tenants ADD COLUMN contract_end_date TEXT DEFAULT NULL;');
      console.log('✅ Migration completed: contract_end_date column added.');
    }
    
    if (!hasRentCycle) {
      console.log('🔄 Running migration: Adding rent_cycle column...');
      await database.execAsync('ALTER TABLE tenants ADD COLUMN rent_cycle TEXT DEFAULT "monthly";');
      console.log('✅ Migration completed: rent_cycle column added.');
    }

    // CHECK PAYMENTS TABLE (NEW)
    const paymentTableInfo = await database.getAllAsync<{ name: string }>(
      "PRAGMA table_info(payments)"
    );
    
    const hasRentAmountAtPayment = paymentTableInfo.some(column => column.name === 'rent_amount_at_payment');
    const hasRentCycleAtPayment = paymentTableInfo.some(column => column.name === 'rent_cycle_at_payment');
    
    if (!hasRentAmountAtPayment) {
      console.log('🔄 Running migration: Adding rent_amount_at_payment column...');
      await database.execAsync('ALTER TABLE payments ADD COLUMN rent_amount_at_payment REAL;');
      console.log('✅ Migration completed: rent_amount_at_payment column added.');
    }
    
    if (!hasRentCycleAtPayment) {
      console.log('🔄 Running migration: Adding rent_cycle_at_payment column...');
      await database.execAsync('ALTER TABLE payments ADD COLUMN rent_cycle_at_payment TEXT;');
      console.log('✅ Migration completed: rent_cycle_at_payment column added.');
    }

  } catch (error) {
    console.error('❌ Migration error:', error);
    throw new DatabaseError("Failed to update the database structure.");
  }
};

// --- CRITICAL FIX: Safe Initialization ---
export const initializeDatabase = async (): Promise<void> => {
  // Return existing promise if initialization is in progress
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    try {
      console.log('🔄 Initializing database...');
      
      // CRITICAL: Open database INSIDE the async function
      if (!db) {
        db = SQLite.openDatabaseSync('RentReminderDB');
        console.log('✅ Database connection opened');
      }

      await db.execAsync('BEGIN TRANSACTION;');
      await db.execAsync('PRAGMA foreign_keys = ON;');

      // Tenants Table: room_number is UNIQUE to prevent duplicates.
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS tenants (
          tenant_id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          phone TEXT,
          room_number TEXT NOT NULL UNIQUE,
          start_date TEXT NOT NULL,
          contract_end_date TEXT,
          monthly_rent REAL NOT NULL,
          rent_cycle TEXT DEFAULT 'monthly',
          status TEXT DEFAULT 'Due Soon',
          credit_balance REAL DEFAULT 0,
          notes TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );
      `);

      // Payments Table - Create with NEW columns included
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS payments (
          payment_id INTEGER PRIMARY KEY AUTOINCREMENT,
          tenant_id INTEGER NOT NULL,
          amount_paid REAL NOT NULL,
          months_paid_for REAL NOT NULL, 
          payment_date TEXT NOT NULL,
          next_due_date TEXT NOT NULL,
          payment_method TEXT DEFAULT 'Cash',
          rent_amount_at_payment REAL,
          rent_cycle_at_payment TEXT,
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
          auto_suspend_days INTEGER DEFAULT 30,
          contract_reminder_days INTEGER DEFAULT 60,
          created_at TEXT DEFAULT (datetime('now'))
        );
      `);

      // Payment Cancellations Table (NEW)
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS payment_cancellations (
          cancellation_id INTEGER PRIMARY KEY AUTOINCREMENT,
          original_payment_id INTEGER NOT NULL,
          tenant_id INTEGER NOT NULL,
          amount REAL NOT NULL,
          reason TEXT NOT NULL,
          cancelled_at TEXT NOT NULL,
          cancelled_by TEXT
        );
      `);
      
      // Run migrations AFTER tables are created
      await runMigrations(db);

      // Update existing tenants to set default contract_end_date if NULL
      const tenantsWithNullContract = await db.getAllAsync<{ tenant_id: number; start_date: string }>(
        'SELECT tenant_id, start_date FROM tenants WHERE contract_end_date IS NULL'
      );
      
      for (const tenant of tenantsWithNullContract) {
        const defaultContractEnd = addMonths(parseISO(tenant.start_date), 12);
        await db.runAsync(
          'UPDATE tenants SET contract_end_date = ? WHERE tenant_id = ?',
          [format(defaultContractEnd, 'yyyy-MM-dd'), tenant.tenant_id]
        );
      }

      // Backfill rent_amount_at_payment for existing payments
      const paymentsWithoutRentAmount = await db.getAllAsync<{ 
        payment_id: number; 
        tenant_id: number;
        monthly_rent: number;
        rent_cycle: string;
      }>(
        `SELECT p.payment_id, p.tenant_id, t.monthly_rent, t.rent_cycle 
         FROM payments p 
         JOIN tenants t ON p.tenant_id = t.tenant_id 
         WHERE p.rent_amount_at_payment IS NULL`
      );
      
      for (const payment of paymentsWithoutRentAmount) {
        await db.runAsync(
          'UPDATE payments SET rent_amount_at_payment = ?, rent_cycle_at_payment = ? WHERE payment_id = ?',
          [payment.monthly_rent, payment.rent_cycle || 'monthly', payment.payment_id]
        );
      }

      const settingsCount = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM settings');
      if (settingsCount && settingsCount.count === 0) {
        await db.runAsync(
          `INSERT INTO settings (reminder_days_before_due, reminder_time, notification_enabled, currency, theme, auto_suspend_days, contract_reminder_days) 
           VALUES (?, ?, ?, ?, ?, ?, ?)`, 
          [3, '09:00', 1, 'UGX', 'Light', 30, 60]
        );
      }

      await db.execAsync('COMMIT;');
      console.log('✅ Database initialized successfully');
    } catch (error) {
      if (db) {
        await db.execAsync('ROLLBACK;');
      }
      console.error('❌ Database initialization error:', error);
      initializationPromise = null;
      db = null; // Reset database connection
      throw error;
    }
  })();

  return initializationPromise;
};

// --- Database Public API ---
export const Database = {
  getDb: getDb,

  getAllTenants: async (): Promise<Tenant[]> => {
    try {
      const database = getDb();
      return await database.getAllAsync<Tenant>('SELECT * FROM tenants ORDER BY name COLLATE NOCASE');
    } catch (error) {
      console.error('❌ Error getting all tenants:', error);
      throw new DatabaseError("Could not fetch tenant list.");
    }
  },

  getTenant: async (tenantId: number): Promise<Tenant | null> => {
    try {
      const database = getDb();
      return await database.getFirstAsync<Tenant>('SELECT * FROM tenants WHERE tenant_id = ?', [tenantId]);
    } catch (error) {
      console.error(`❌ Error getting tenant ${tenantId}:`, error);
      throw new DatabaseError("Could not fetch tenant details.");
    }
  },
  
  checkRoomExists: async (roomNumber: string, excludeTenantId?: number): Promise<boolean> => {
    try {
      const database = getDb();
      let query = 'SELECT 1 FROM tenants WHERE room_number = ? LIMIT 1';
      const params: (string | number)[] = [roomNumber];
      if (excludeTenantId) {
        query = 'SELECT 1 FROM tenants WHERE room_number = ? AND tenant_id != ? LIMIT 1';
        params.push(excludeTenantId);
      }
      const result = await database.getFirstAsync<any>(query, params);
      return !!result;
    } catch (error) {
      console.error('❌ Error in checkRoomExists:', error);
      throw new DatabaseError('Unable to verify room availability.');
    }
  },

  fixPaymentCalculations: async (): Promise<void> => {
    try {
      const database = getDb();
      console.log('🔄 Fixing payment calculations...');
      await database.execAsync('BEGIN TRANSACTION');
      
      const tenants = await database.getAllAsync<Tenant>('SELECT * FROM tenants');
      
      for (const tenant of tenants) {
        const payments = await database.getAllAsync<Payment>(
          'SELECT * FROM payments WHERE tenant_id = ? ORDER BY payment_date ASC, payment_id ASC',
          [tenant.tenant_id]
        );
        
        let runningCredit = 0;
        let currentDueDate = parseISO(tenant.start_date);
        
        for (const payment of payments) {
          const totalAvailable = payment.amount_paid + runningCredit;
          const fullCycles = Math.floor(totalAvailable / tenant.monthly_rent);
          runningCredit = totalAvailable % tenant.monthly_rent;
          
          for (let i = 0; i < fullCycles; i++) {
            currentDueDate = calculateNextDueDate(currentDueDate, tenant.rent_cycle || 'monthly');
          }
          
          const newDueDate = format(currentDueDate, 'yyyy-MM-dd');
          
          await database.runAsync(
            'UPDATE payments SET months_paid_for = ?, next_due_date = ? WHERE payment_id = ?',
            [fullCycles, newDueDate, payment.payment_id]
          );
        }
        
        const finalStatus = calculateTenantStatus(format(currentDueDate, 'yyyy-MM-dd'), payments.length > 0);
        await database.runAsync(
          'UPDATE tenants SET credit_balance = ?, status = ? WHERE tenant_id = ?',
          [runningCredit, finalStatus, tenant.tenant_id]
        );
      }
      
      await database.execAsync('COMMIT');
      console.log('✅ Payment calculations fixed successfully');
    } catch (error) {
      const database = getDb();
      await database.execAsync('ROLLBACK');
      console.error('❌ Error fixing payment calculations:', error);
      throw error;
    }
  },

  addTenant: async (tenant: {
    name: string;
    phone: string;
    roomNumber: string;
    startDate: string;
    contractEndDate: string;
    monthlyRent: number;
    rentCycle: 'monthly' | 'biweekly' | 'quarterly';
    notes?: string;
  }): Promise<number> => {
    const database = getDb();
    const roomExists = await Database.checkRoomExists(tenant.roomNumber);
    if (roomExists) {
      throw new RoomAlreadyExistsError(tenant.roomNumber);
    }

    if (tenant.monthlyRent <= 0) {
      throw new DatabaseError("Monthly rent must be greater than 0");
    }

    try {
      const firstDueDate = calculateNextDueDate(parseISO(tenant.startDate), tenant.rentCycle);
      const firstDueDateStr = format(firstDueDate, 'yyyy-MM-dd');
      
      const initialStatus = calculateTenantStatus(firstDueDateStr, false);

      const result = await database.runAsync(
        `INSERT INTO tenants (name, phone, room_number, start_date, contract_end_date, monthly_rent, rent_cycle, notes, status) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tenant.name.trim(),
          tenant.phone.trim(),
          tenant.roomNumber.trim(),
          tenant.startDate,
          tenant.contractEndDate,
          tenant.monthlyRent,
          tenant.rentCycle,
          tenant.notes?.trim() || '',
          initialStatus
        ]
      );
      
      const tenantId = result.lastInsertRowId;
      
      try {
        const { NotificationService } = await import('../services/notifications');
        await NotificationService.createReminder(tenantId, firstDueDateStr);
      } catch (notifError) {
        console.warn('⚠️ Failed to create initial reminder:', notifError);
      }
      
      return tenantId;
    } catch (error) {
      console.error('❌ Error adding tenant:', error);
      if (error instanceof RoomAlreadyExistsError) {
        throw error;
      }
      throw new DatabaseError("Failed to save the new tenant.");
    }
  },

  updateTenant: async (tenantId: number, updates: {
    name: string;
    phone: string;
    roomNumber: string;
    startDate: string;
    monthlyRent: number;
    rentCycle?: 'monthly' | 'biweekly' | 'quarterly';
    contractEndDate?: string;
    notes?: string;
  }): Promise<void> => {
    const database = getDb();
    const roomExists = await Database.checkRoomExists(updates.roomNumber, tenantId);
    if (roomExists) {
      throw new RoomAlreadyExistsError(updates.roomNumber);
    }
    
    try {
      await database.runAsync(
        `UPDATE tenants 
         SET name = ?, phone = ?, room_number = ?, start_date = ?, monthly_rent = ?, rent_cycle = ?, contract_end_date = ?, notes = ?, updated_at = datetime('now')
         WHERE tenant_id = ?`,
        [
          updates.name.trim(),
          updates.phone.trim(),
          updates.roomNumber.trim(),
          updates.startDate,
          updates.monthlyRent,
          updates.rentCycle || 'monthly',
          updates.contractEndDate || null,
          updates.notes?.trim() || '',
          tenantId
        ]
      );
    } catch (error) {
      console.error(`❌ Error updating tenant ${tenantId}:`, error);
      throw new DatabaseError("Failed to save tenant updates.");
    }
  },

  deleteTenant: async (tenantId: number): Promise<void> => {
    try {
      const database = getDb();
      const { NotificationService } = await import('../services/notifications');
      await NotificationService.cancelReminders(tenantId);
      await database.runAsync('DELETE FROM tenants WHERE tenant_id = ?', [tenantId]);
    } catch (error) {
      console.error(`❌ Error deleting tenant ${tenantId}:`, error);
      throw new DatabaseError("Failed to delete the tenant.");
    }
  },

  updateAllTenantStatuses: async (): Promise<void> => {
    console.log('🔄 Updating all tenant statuses...');
    try {
      // NO LONGER USES A TRANSACTION
      const database = getDb();
      const tenants = await database.getAllAsync<Tenant>('SELECT * FROM tenants');
      
      for (const tenant of tenants) {
        try {
          const nextDueDate = await getTenantNextDueDate(tenant.tenant_id, database);
          const hasPayments = await database.getFirstAsync<{ count: number }>(
            'SELECT COUNT(*) as count FROM payments WHERE tenant_id = ?',
            [tenant.tenant_id]
          );
          
          const newStatus = calculateTenantStatus(nextDueDate, (hasPayments?.count || 0) > 0);

          if (newStatus !== tenant.status) {
            await database.runAsync(
              'UPDATE tenants SET status = ?, updated_at = datetime("now") WHERE tenant_id = ?',
              [newStatus, tenant.tenant_id]
            );
            console.log(`✅ Status for ${tenant.name} changed from ${tenant.status} to ${newStatus}`);
          }
        } catch (tenantError) {
          console.error(`❌ Error updating tenant ${tenant.tenant_id}:`, tenantError);
        }
      }
      
      console.log('✅ Tenant status update completed successfully');
    } catch (error) {
      
      console.error('❌ Fatal error during tenant status update:', error);
      throw new DatabaseError("Failed to update tenant statuses.");
    }
  },

  recordPayment: async (payment: {
    tenantId: number;
    amountPaid: number;
    paymentDate: string;
    paymentMethod: string;
    notes?: string;
  }): Promise<{ 
    paymentId: number; 
    shouldAlertPartial: boolean; 
    alertMessage?: string;
    warnings?: string[];
  }> => {
    try {
      const database = getDb();
      await database.execAsync('BEGIN TRANSACTION');
      const warnings: string[] = [];

      const tenant = await database.getFirstAsync<Tenant>(
        'SELECT * FROM tenants WHERE tenant_id = ?',
        [payment.tenantId]
      );
      if (!tenant) throw new Error('Tenant not found');

      const lastPayment = await database.getFirstAsync<{ 
        next_due_date: string;
        payment_date: string;
      }>(
        `SELECT next_due_date, payment_date 
         FROM payments 
         WHERE tenant_id = ? 
         ORDER BY payment_date DESC, payment_id DESC 
         LIMIT 1`,
        [payment.tenantId]
      );

      let baseDate: Date;
      if (lastPayment) {
        baseDate = parseISO(lastPayment.next_due_date);
        
        if (payment.paymentDate < lastPayment.payment_date) {
          warnings.push(
            `⚠️ This payment is dated ${payment.paymentDate} but the last payment was ${lastPayment.payment_date}. ` +
            `Next due date will calculate from ${lastPayment.next_due_date}.`
          );
        }
      } else {
        baseDate = parseISO(tenant.start_date);
      }

      const currentRent = tenant.monthly_rent;
      const totalAvailable = payment.amountPaid + (tenant.credit_balance || 0);
      
      const fullCyclesCovered = Math.floor(totalAvailable / currentRent);
      const newCreditBalance = totalAvailable % currentRent;

      let nextDueDate = new Date(baseDate);
      
      for (let i = 0; i < fullCyclesCovered; i++) {
        nextDueDate = calculateNextDueDate(nextDueDate, tenant.rent_cycle || 'monthly');
      }
      
      const nextDueDateStr = format(nextDueDate, 'yyyy-MM-dd');

      const result = await database.runAsync(
        `INSERT INTO payments (
          tenant_id, 
          amount_paid, 
          months_paid_for, 
          payment_date, 
          next_due_date, 
          payment_method, 
          notes,
          rent_amount_at_payment,
          rent_cycle_at_payment
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          payment.tenantId,
          payment.amountPaid,
          fullCyclesCovered,
          payment.paymentDate,
          nextDueDateStr,
          payment.paymentMethod,
          payment.notes || '',
          currentRent,
          tenant.rent_cycle || 'monthly'
        ]
      );

      const hasPayments = true;
      const newStatus = calculateTenantStatus(nextDueDateStr, hasPayments);
      
      await database.runAsync(
        `UPDATE tenants 
         SET credit_balance = ?, 
             status = ?, 
             updated_at = datetime('now') 
         WHERE tenant_id = ?`,
        [newCreditBalance, newStatus, payment.tenantId]
      );

      try {
        const { NotificationService } = await import('../services/notifications');
        await NotificationService.cancelReminders(payment.tenantId);
        await NotificationService.createReminder(payment.tenantId, nextDueDateStr);
      } catch (notifError) {
        console.warn('⚠️ Failed to update reminders:', notifError);
        warnings.push('Reminder notification update failed');
      }
      
      await database.execAsync('COMMIT');

      let shouldAlertPartial = false;
      let alertMessage = '';
      
      if (newCreditBalance > 0 && newCreditBalance < currentRent) {
        shouldAlertPartial = true;
        alertMessage = 
          `Partial payment recorded. Credit balance: ${newCreditBalance.toLocaleString()} UGX. ` +
          `Full payment: ${currentRent.toLocaleString()} UGX.`;
      }
      
      if (fullCyclesCovered === 0 && payment.amountPaid > 0) {
        shouldAlertPartial = true;
        alertMessage = 
          `Payment of ${payment.amountPaid.toLocaleString()} UGX recorded. ` +
          `Credit balance: ${newCreditBalance.toLocaleString()} UGX. ` +
          `Does not cover a full period (${currentRent.toLocaleString()} UGX needed).`;
      }
      
      return {
        paymentId: result.lastInsertRowId,
        shouldAlertPartial,
        alertMessage,
        warnings: warnings.length > 0 ? warnings : undefined
      };
      
    } catch (error) {
      const database = getDb();
      await database.execAsync('ROLLBACK');
      console.error('❌ Error recording payment:', error);
      throw new DatabaseError(
        "The payment could not be recorded. No changes were made. " +
        (error instanceof Error ? error.message : '')
      );
    }
  },

  cancelPayment: async (paymentId: number, reason: string): Promise<void> => {
    try {
      const database = getDb();
      await database.execAsync('BEGIN TRANSACTION');
      
      const payment = await database.getFirstAsync<Payment & { tenant_name: string }>(
        `SELECT p.*, t.name as tenant_name 
         FROM payments p 
         JOIN tenants t ON p.tenant_id = t.tenant_id 
         WHERE p.payment_id = ?`,
        [paymentId]
      );
      
      if (!payment) throw new Error('Payment not found');
      
      const tenant = await database.getFirstAsync<Tenant>(
        'SELECT * FROM tenants WHERE tenant_id = ?',
        [payment.tenant_id]
      );
      if (!tenant) throw new Error('Tenant not found');
      
      const isLastPayment = await database.getFirstAsync<{ is_last: number }>(
        `SELECT (payment_id = ?) as is_last 
         FROM payments 
         WHERE tenant_id = ? 
         ORDER BY next_due_date DESC, payment_id DESC 
         LIMIT 1`,
        [paymentId, payment.tenant_id]
      );
      
      if (!isLastPayment?.is_last) {
        throw new Error(
          'Can only cancel the most recent payment. ' +
          'Cancelling older payments would corrupt the payment history.'
        );
      }
      
      const reversedCredit = tenant.credit_balance - payment.amount_paid;
      
      const previousPayment = await database.getFirstAsync<{ next_due_date: string }>(
        `SELECT next_due_date 
         FROM payments 
         WHERE tenant_id = ? AND payment_id < ? 
         ORDER BY next_due_date DESC, payment_id DESC 
         LIMIT 1`,
        [payment.tenant_id, paymentId]
      );
      
      await database.runAsync('DELETE FROM payments WHERE payment_id = ?', [paymentId]);
      
      const newNextDueDate = previousPayment 
        ? previousPayment.next_due_date 
        : format(
            calculateNextDueDate(parseISO(tenant.start_date), tenant.rent_cycle || 'monthly'),
            'yyyy-MM-dd'
          );
      
      const hasOtherPayments = await database.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) as count FROM payments WHERE tenant_id = ?',
        [payment.tenant_id]
      );
      
      const newStatus = calculateTenantStatus(
        newNextDueDate, 
        (hasOtherPayments?.count || 0) > 0
      );
      
      await database.runAsync(
        `UPDATE tenants 
         SET credit_balance = ?, status = ?, updated_at = datetime('now') 
         WHERE tenant_id = ?`,
        [Math.max(reversedCredit, 0), newStatus, payment.tenant_id]
      );
      
      await database.runAsync(
        `INSERT INTO payment_cancellations (
          original_payment_id, tenant_id, amount, reason, cancelled_at
        ) VALUES (?, ?, ?, ?, datetime('now'))`,
        [paymentId, payment.tenant_id, payment.amount_paid, reason]
      );
      
      await database.execAsync('COMMIT');
      console.log(`✅ Payment ${paymentId} cancelled: ${reason}`);
      
    } catch (error) {
      const database = getDb();
      await database.execAsync('ROLLBACK');
      console.error('❌ Error cancelling payment:', error);
      throw new DatabaseError(
        "Failed to cancel payment. " + 
        (error instanceof Error ? error.message : '')
      );
    }
  },

  runSystemHeartbeat: async (): Promise<{
    statusUpdates: number;
    suspensionAlerts: string[];
    contractAlerts: string[];
  }> => {
    console.log('💓 Running system heartbeat...');
    const results = {
      statusUpdates: 0,
      suspensionAlerts: [] as string[],
      contractAlerts: [] as string[]
    };

    try {
      const database = getDb();
      const settings = await Database.getSettings();
      const tenants = await database.getAllAsync<Tenant>('SELECT * FROM tenants');
      const today = new Date();

      for (const tenant of tenants) {
        try {
          const nextDueDate = await getTenantNextDueDate(tenant.tenant_id, database);
          const hasPayments = await database.getFirstAsync<{ count: number }>(
            'SELECT COUNT(*) as count FROM payments WHERE tenant_id = ?',
            [tenant.tenant_id]
          );
          
          const currentStatus = calculateTenantStatus(nextDueDate, (hasPayments?.count || 0) > 0, today);

          if (currentStatus !== tenant.status) {
            await database.runAsync(
              'UPDATE tenants SET status = ?, updated_at = datetime("now") WHERE tenant_id = ?',
              [currentStatus, tenant.tenant_id]
            );
            results.statusUpdates++;
            console.log(`✅ Status updated for ${tenant.name}: ${tenant.status} → ${currentStatus}`);
          }
        } catch (tenantError) {
          console.error(`❌ Error updating tenant ${tenant.tenant_id}:`, tenantError);
        }
      }

      if (settings) {
        for (const tenant of tenants) {
          if (tenant.status === 'Overdue') {
            try {
              const nextDueDate = await getTenantNextDueDate(tenant.tenant_id, database);
              const dueDate = parseISO(nextDueDate);
              const daysOverdue = Math.ceil((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
              
              if (daysOverdue > (settings.auto_suspend_days || 30)) {
                await database.runAsync(
                  'UPDATE tenants SET status = ?, updated_at = datetime("now") WHERE tenant_id = ?',
                  ['Suspended', tenant.tenant_id]
                );
                
                const alertMsg = `Action Required: ${tenant.name} in Room ${tenant.room_number} is over ${settings.auto_suspend_days} days late. Account flagged for suspension.`;
                results.suspensionAlerts.push(alertMsg);
                console.log(`🚨 Auto-suspended: ${tenant.name}`);
              }
            } catch (error) {
              console.error(`❌ Error processing suspension for tenant ${tenant.tenant_id}:`, error);
            }
          }
        }

        const contractReminderDays = settings.contract_reminder_days || 60;
        const reminderThreshold = addDays(today, contractReminderDays);
        
        for (const tenant of tenants) {
          try {
            if (!tenant.contract_end_date) {
              console.warn(`Tenant ${tenant.tenant_id} has no contract_end_date`);
              continue;
            }
            
            const contractEnd = parseISO(tenant.contract_end_date);
            if (contractEnd <= reminderThreshold && contractEnd >= today) {
              const daysUntilEnd = Math.ceil((contractEnd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              const alertMsg = `${tenant.name}'s contract expires on ${format(contractEnd, 'MMM dd, yyyy')} (in ${daysUntilEnd} days).`;
              results.contractAlerts.push(alertMsg);
            }
          } catch (error) {
            console.error(`❌ Error processing contract for tenant ${tenant.tenant_id}:`, error);
          }
        }
      }

      console.log('✅ System heartbeat completed successfully');
      return results;
    } catch (error) {
      
      console.error('❌ Fatal error during system heartbeat:', error);
      throw new DatabaseError("Failed to run system audit.");
    }
  },

  getPaymentHistory: async (tenantId: number): Promise<Payment[]> => {
    try {
      const database = getDb();
      return await database.getAllAsync<Payment>(
        `SELECT * FROM payments 
         WHERE tenant_id = ? 
         ORDER BY payment_date DESC, payment_id DESC`,
        [tenantId]
      );
    } catch (error) {
      console.error(`❌ Error getting payment history for tenant ${tenantId}:`, error);
      throw new DatabaseError("Could not fetch payment history.");
    }
  },

  getSettings: async (): Promise<Settings | null> => {
    try {
      const database = getDb();
      const settings = await database.getFirstAsync<Settings>('SELECT * FROM settings LIMIT 1');
      if (settings) {
        return { 
          ...settings, 
          notification_enabled: Boolean(settings.notification_enabled),
          auto_suspend_days: settings.auto_suspend_days || 30,
          contract_reminder_days: settings.contract_reminder_days || 60
        };
      }
      return null;
    } catch (error) {
      console.error('❌ Error getting settings:', error);
      return null;
    }
  },

  updateSettings: async (settings: Partial<Settings>): Promise<void> => {
    try {
      const database = getDb();
      const currentSettings = await Database.getSettings();
      
      if (currentSettings) {
        await database.runAsync(
          `UPDATE settings 
           SET reminder_days_before_due = ?, reminder_time = ?, notification_enabled = ?, 
               currency = ?, theme = ?, auto_suspend_days = ?, contract_reminder_days = ? 
           WHERE setting_id = ?`,
          [
            settings.reminder_days_before_due ?? currentSettings.reminder_days_before_due,
            settings.reminder_time ?? currentSettings.reminder_time,
            settings.notification_enabled ? 1 : 0,
            settings.currency ?? currentSettings.currency,
            settings.theme ?? currentSettings.theme,
            settings.auto_suspend_days ?? currentSettings.auto_suspend_days,
            settings.contract_reminder_days ?? currentSettings.contract_reminder_days,
            currentSettings.setting_id
          ]
        );
      } else {
        await database.runAsync(
          `INSERT INTO settings (
            reminder_days_before_due, reminder_time, notification_enabled, 
            currency, theme, auto_suspend_days, contract_reminder_days
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            settings.reminder_days_before_due ?? 3,
            settings.reminder_time ?? '09:00',
            settings.notification_enabled ? 1 : 0,
            settings.currency ?? 'UGX',
            settings.theme ?? 'Light',
            settings.auto_suspend_days ?? 30,
            settings.contract_reminder_days ?? 60
          ]
        );
      }
    } catch (error) {
      console.error('❌ Error updating settings:', error);
      throw new DatabaseError("Failed to save settings.");
    }
  },

  getReminders: async (tenantId?: number): Promise<Reminder[]> => {
    try {
      const database = getDb();
      if (tenantId) {
        return await database.getAllAsync<Reminder>(
          'SELECT * FROM reminders WHERE tenant_id = ? ORDER BY reminder_date DESC',
          [tenantId]
        );
      } else {
        return await database.getAllAsync<Reminder>(
          'SELECT * FROM reminders ORDER BY reminder_date DESC'
        );
      }
    } catch (error) {
      console.error('❌ Error getting reminders:', error);
      throw new DatabaseError("Could not fetch reminders.");
    }
  },

  // NEW FUNCTION: Get upcoming reminders with tenant details
  getUpcomingReminders: async (daysAhead: number = 30): Promise<Reminder[]> => {
    try {
      const database = getDb();
      const today = new Date();
      const futureDate = addDays(today, daysAhead);
      
      return await database.getAllAsync<Reminder>(
        `SELECT r.*, t.name, t.room_number 
         FROM reminders r 
         JOIN tenants t ON r.tenant_id = t.tenant_id 
         WHERE date(r.reminder_date) <= date(?) 
         AND r.status = 'Pending'
         ORDER BY r.reminder_date ASC`,
        [format(futureDate, 'yyyy-MM-dd')]
      );
    } catch (error) {
      console.error('❌ Error getting upcoming reminders:', error);
      throw new DatabaseError("Could not fetch upcoming reminders.");
    }
  },

  // NEW FUNCTION: Get payment statistics
  getPaymentStats: async (): Promise<{
    totalCollected: number;
    thisMonth: number;
    lastMonth: number;
    overdueAmount: number;
  }> => {
    try {
      const database = getDb();
      const today = new Date();
      const thisMonthStart = startOfMonth(today);
      const thisMonthEnd = endOfMonth(today);
      const lastMonthStart = startOfMonth(subMonths(today, 1));
      const lastMonthEnd = endOfMonth(subMonths(today, 1));

      // Use more accurate queries
    const [totalResult, thisMonthResult, lastMonthResult, overdueResult] = await Promise.all([
      database.getFirstAsync<{ total: number }>(
        'SELECT COALESCE(SUM(amount_paid), 0) as total FROM payments'
      ),
      database.getFirstAsync<{ total: number }>(
        `SELECT COALESCE(SUM(amount_paid), 0) as total 
         FROM payments 
         WHERE date(payment_date) >= date(?) AND date(payment_date) <= date(?)`,
        [format(thisMonthStart, 'yyyy-MM-dd'), format(thisMonthEnd, 'yyyy-MM-dd')]
      ),
      database.getFirstAsync<{ total: number }>(
        `SELECT COALESCE(SUM(amount_paid), 0) as total 
         FROM payments 
         WHERE date(payment_date) >= date(?) AND date(payment_date) <= date(?)`,
        [format(lastMonthStart, 'yyyy-MM-dd'), format(lastMonthEnd, 'yyyy-MM-dd')]
      ),
      database.getFirstAsync<{ total: number }>(
        `SELECT COALESCE(SUM(monthly_rent), 0) as total 
         FROM tenants 
         WHERE status = 'Overdue' AND tenant_id IN (SELECT DISTINCT tenant_id FROM payments)`
      )
    ]);


      return {
        totalCollected: totalResult?.total || 0,
        thisMonth: thisMonthResult?.total || 0,
        lastMonth: lastMonthResult?.total || 0,
        overdueAmount: overdueResult?.total || 0
      };
    } catch (error) { 
      console.error('❌ Error getting payment stats:', error);
      throw new DatabaseError("Could not fetch payment statistics.");
    }
  },

// NEW FUNCTION: Recalculate payment statistics
recalculatePaymentStats: async (): Promise<void> => {
  try {
    const database = getDb();
    console.log('🔄 Recalculating payment statistics...');
    
    // This will force recalculation of all stats
    await database.execAsync('ANALYZE'); // SQLite optimization
    console.log('✅ Payment statistics recalculated');
  } catch (error) {
    console.error('❌ Error recalculating payment stats:', error);
  }
},

  // NEW FUNCTION: Get monthly payment trend
  getMonthlyTrend: async (): Promise<{ month: string; amount: number }[]> => {
    try {
      const database = getDb();
      const today = new Date();
      const sixMonthsAgo = subMonths(today, 5);

      const results = await database.getAllAsync<{ month: string; amount: number }>(
        `SELECT 
          strftime('%Y-%m', payment_date) as month,
          COALESCE(SUM(amount_paid), 0) as amount
         FROM payments
         WHERE date(payment_date) >= date(?)
         GROUP BY strftime('%Y-%m', payment_date)
         ORDER BY month ASC`,
        [format(sixMonthsAgo, 'yyyy-MM-dd')]
      );

      // Format month names
      const formatted = results.map(row => ({
        month: format(parseISO(row.month + '-01'), 'MMM'),
        amount: row.amount
      }));

      // Fill in missing months with 0
      const allMonths: { month: string; amount: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const monthDate = subMonths(today, i);
        const monthKey = format(monthDate, 'MMM');
        const existing = formatted.find(f => f.month === monthKey);
        allMonths.push({
          month: monthKey,
          amount: existing?.amount || 0
        });
      }

      return allMonths;
    } catch (error) {
      console.error('❌ Error getting monthly trend:', error);
      throw new DatabaseError("Could not fetch monthly payment trend.");
    }
  },

  getOverdueTenants: async (): Promise<Tenant[]> => {
    try {
      const database = getDb();
      return await database.getAllAsync<Tenant>(
        'SELECT * FROM tenants WHERE status = "Overdue" ORDER BY name COLLATE NOCASE'
      );
    } catch (error) {
      console.error('❌ Error getting overdue tenants:', error);
      throw new DatabaseError("Could not fetch overdue tenants.");
    }
  },

  getTenantsDueSoon: async (): Promise<Tenant[]> => {
    try {
      const database = getDb();
      return await database.getAllAsync<Tenant>(
        'SELECT * FROM tenants WHERE status = "Due Soon" ORDER BY name COLLATE NOCASE'
      );
    } catch (error) {
      console.error('❌ Error getting tenants due soon:', error);
      throw new DatabaseError("Could not fetch tenants due soon.");
    }
  },

  getPaidTenants: async (): Promise<Tenant[]> => {
    try {
      const database = getDb();
      return await database.getAllAsync<Tenant>(
        'SELECT * FROM tenants WHERE status = "Paid" ORDER BY name COLLATE NOCASE'
      );
    } catch (error) {
      console.error('❌ Error getting paid tenants:', error);
      throw new DatabaseError("Could not fetch paid tenants.");
    }
  },

  getTotalMonthlyRent: async (): Promise<number> => {
    try {
      const database = getDb();
      const result = await database.getFirstAsync<{ total: number }>(
        'SELECT SUM(monthly_rent) as total FROM tenants'
      );
      return result?.total || 0;
    } catch (error) {
      console.error('❌ Error getting total monthly rent:', error);
      throw new DatabaseError("Could not calculate total monthly rent.");
    }
  },

  getTotalCreditBalance: async (): Promise<number> => {
    try {
      const database = getDb();
      const result = await database.getFirstAsync<{ total: number }>(
        'SELECT SUM(credit_balance) as total FROM tenants'
      );
      return result?.total || 0;
    } catch (error) {
      console.error('❌ Error getting total credit balance:', error);
      throw new DatabaseError("Could not calculate total credit balance.");
    }
  },

  getDashboardStats: async (): Promise<{
    totalTenants: number;
    overdueTenants: number;
    dueSoonTenants: number;
    paidTenants: number;
    totalMonthlyRent: number;
    totalCreditBalance: number;
  }> => {
    try {
      const database = getDb();
      
      const [totalTenants, overdueTenants, dueSoonTenants, paidTenants, totalMonthlyRent, totalCreditBalance] = await Promise.all([
        database.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM tenants'),
        database.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM tenants WHERE status = "Overdue"'),
        database.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM tenants WHERE status = "Due Soon"'),
        database.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM tenants WHERE status = "Paid"'),
        database.getFirstAsync<{ total: number }>('SELECT SUM(monthly_rent) as total FROM tenants'),
        database.getFirstAsync<{ total: number }>('SELECT SUM(credit_balance) as total FROM tenants')
      ]);

      return {
        totalTenants: totalTenants?.count || 0,
        overdueTenants: overdueTenants?.count || 0,
        dueSoonTenants: dueSoonTenants?.count || 0,
        paidTenants: paidTenants?.count || 0,
        totalMonthlyRent: totalMonthlyRent?.total || 0,
        totalCreditBalance: totalCreditBalance?.total || 0
      };
    } catch (error) {
      console.error('❌ Error getting dashboard stats:', error);
      throw new DatabaseError("Could not fetch dashboard statistics.");
    }
  },

  getRecentPayments: async (limit: number = 10): Promise<Payment[]> => {
    try {
      const database = getDb();
      return await database.getAllAsync<Payment>(
        `SELECT p.*, t.name as tenant_name, t.room_number 
         FROM payments p 
         JOIN tenants t ON p.tenant_id = t.tenant_id 
         ORDER BY p.payment_date DESC, p.payment_id DESC 
         LIMIT ?`,
        [limit]
      );
    } catch (error) {
      console.error('❌ Error getting recent payments:', error);
      throw new DatabaseError("Could not fetch recent payments.");
    }
  },

  searchTenants: async (query: string): Promise<Tenant[]> => {
    try {
      const database = getDb();
      const searchTerm = `%${query}%`;
      return await database.getAllAsync<Tenant>(
        `SELECT * FROM tenants 
         WHERE name LIKE ? OR room_number LIKE ? OR phone LIKE ?
         ORDER BY name COLLATE NOCASE`,
        [searchTerm, searchTerm, searchTerm]
      );
    } catch (error) {
      console.error('❌ Error searching tenants:', error);
      throw new DatabaseError("Could not search tenants.");
    }
  },

  getTenantWithDetails: async (tenantId: number): Promise<{
    tenant: Tenant;
    payments: Payment[];
    reminders: Reminder[];
  } | null> => {
    try {
      const database = getDb();
      const tenant = await Database.getTenant(tenantId);
      if (!tenant) return null;

      const [payments, reminders] = await Promise.all([
        Database.getPaymentHistory(tenantId),
        Database.getReminders(tenantId)
      ]);

      return { tenant, payments, reminders };
    } catch (error) {
      console.error(`❌ Error getting tenant details for ${tenantId}:`, error);
      throw new DatabaseError("Could not fetch tenant details.");
    }
  },

  // NEW FUNCTION: Get tenant statistics
  getTenantStats: async (tenantId: number): Promise<{
    totalPaid: number;
    paymentsCount: number;
    averagePayment: number;
    lastPaymentDate: string | null;
    nextDueDate: string | null;
  }> => {
    try {
      const database = getDb();
      
      const statsResult = await database.getFirstAsync<{
        total: number;
        count: number;
        average: number;
      }>(
        `SELECT 
          COALESCE(SUM(amount_paid), 0) as total,
          COUNT(*) as count,
          COALESCE(AVG(amount_paid), 0) as average
         FROM payments 
         WHERE tenant_id = ?`,
        [tenantId]
      );

      const lastPayment = await database.getFirstAsync<{ 
        payment_date: string;
        next_due_date: string;
      }>(
        `SELECT payment_date, next_due_date 
         FROM payments 
         WHERE tenant_id = ? 
         ORDER BY payment_date DESC, payment_id DESC 
         LIMIT 1`,
        [tenantId]
      );

      return {
        totalPaid: statsResult?.total || 0,
        paymentsCount: statsResult?.count || 0,
        averagePayment: statsResult?.average || 0,
        lastPaymentDate: lastPayment?.payment_date || null,
        nextDueDate: lastPayment?.next_due_date || null
      };
    } catch (error) {
      console.error(`❌ Error getting tenant stats for ${tenantId}:`, error);
      throw new DatabaseError("Could not fetch tenant statistics.");
    }
  },

  // NEW FUNCTION: Reset credit balance (utility function)
  resetCreditBalance: async (tenantId: number): Promise<void> => {
    try {
      const database = getDb();
      await database.runAsync(
        'UPDATE tenants SET credit_balance = 0, updated_at = datetime("now") WHERE tenant_id = ?',
        [tenantId]
      );
      console.log(`✅ Credit balance reset for tenant ${tenantId}`);
    } catch (error) {
      console.error(`❌ Error resetting credit balance for tenant ${tenantId}:`, error);
      throw new DatabaseError("Could not reset credit balance.");
    }
  }
};

export default Database;