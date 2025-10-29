import { addDays, addMonths, format, parseISO } from 'date-fns';
import * as SQLite from 'expo-sqlite';
import { Payment, Reminder, Settings, Tenant } from '../libs/types';

// --- Singleton Pattern for Database Initialization ---
let initializationPromise: Promise<void> | null = null;
const db = SQLite.openDatabaseSync('RentReminderDB');

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

    if (!hasPayments) {
      return daysUntilDue < 0 ? 'Overdue' : 'Due Soon';
    }

    if (daysUntilDue < 0) return 'Overdue';
    if (daysUntilDue <= 3) return 'Due Soon';
    return 'Paid';
  } catch (error) {
    console.error('Error calculating tenant status:', error);
    return hasPayments ? 'Due Soon' : 'Overdue';
  }
};

/**
 * Get tenant's current next due date - FIXED VERSION
 */
const getTenantNextDueDate = async (tenantId: number, db: SQLite.SQLiteDatabase): Promise<string> => {
  try {
    // Get tenant details
    const tenant = await db.getFirstAsync<Tenant>(
      'SELECT start_date, rent_cycle FROM tenants WHERE tenant_id = ?', 
      [tenantId]
    );
    if (!tenant) throw new Error('Tenant not found for due date calculation');

    // Try to get from last payment
    const lastPayment = await db.getFirstAsync<{ next_due_date: string }>(
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
    const tenant = await db.getFirstAsync<Tenant>('SELECT start_date FROM tenants WHERE tenant_id = ?', [tenantId]);
    if (tenant) {
      const fallbackDate = addMonths(parseISO(tenant.start_date), 1);
      return format(fallbackDate, 'yyyy-MM-dd');
    }
    return format(addMonths(new Date(), 1), 'yyyy-MM-dd');
  }
};

// --- Database Initialization and Migrations ---

// Migration function to safely add new columns to existing tables
const runMigrations = async (): Promise<void> => {
  try {
    // CHECK TENANTS TABLE
    const tenantTableInfo = await db.getAllAsync<{ name: string }>(
      "PRAGMA table_info(tenants)"
    );
    
    const hasCreditBalance = tenantTableInfo.some(column => column.name === 'credit_balance');
    const hasContractEndDate = tenantTableInfo.some(column => column.name === 'contract_end_date');
    const hasRentCycle = tenantTableInfo.some(column => column.name === 'rent_cycle');
    
    if (!hasCreditBalance) {
      console.log('🔄 Running migration: Adding credit_balance column...');
      await db.execAsync('ALTER TABLE tenants ADD COLUMN credit_balance REAL DEFAULT 0;');
      console.log('✅ Migration completed: credit_balance column added.');
    }
    
    if (!hasContractEndDate) {
      console.log('🔄 Running migration: Adding contract_end_date column...');
      await db.execAsync('ALTER TABLE tenants ADD COLUMN contract_end_date TEXT DEFAULT NULL;');
      console.log('✅ Migration completed: contract_end_date column added.');
    }
    
    if (!hasRentCycle) {
      console.log('🔄 Running migration: Adding rent_cycle column...');
      await db.execAsync('ALTER TABLE tenants ADD COLUMN rent_cycle TEXT DEFAULT "monthly";');
      console.log('✅ Migration completed: rent_cycle column added.');
    }

    // CHECK PAYMENTS TABLE (NEW)
    const paymentTableInfo = await db.getAllAsync<{ name: string }>(
      "PRAGMA table_info(payments)"
    );
    
    const hasRentAmountAtPayment = paymentTableInfo.some(column => column.name === 'rent_amount_at_payment');
    const hasRentCycleAtPayment = paymentTableInfo.some(column => column.name === 'rent_cycle_at_payment');
    
    if (!hasRentAmountAtPayment) {
      console.log('🔄 Running migration: Adding rent_amount_at_payment column...');
      await db.execAsync('ALTER TABLE payments ADD COLUMN rent_amount_at_payment REAL;');
      console.log('✅ Migration completed: rent_amount_at_payment column added.');
    }
    
    if (!hasRentCycleAtPayment) {
      console.log('🔄 Running migration: Adding rent_cycle_at_payment column...');
      await db.execAsync('ALTER TABLE payments ADD COLUMN rent_cycle_at_payment TEXT;');
      console.log('✅ Migration completed: rent_cycle_at_payment column added.');
    }

  } catch (error) {
    console.error('❌ Migration error:', error);
    throw new DatabaseError("Failed to update the database structure.");
  }
};

export const initializeDatabase = async (): Promise<void> => {
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    try {
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
      await runMigrations();

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
      await db.execAsync('ROLLBACK;');
      console.error('❌ Database initialization error:', error);
      initializationPromise = null;
      throw error;
    }
  })();

  return initializationPromise;
};

// --- Database Public API ---
export const Database = {
  getDb: () => db,

  getAllTenants: async (): Promise<Tenant[]> => {
    try {
      return await db.getAllAsync<Tenant>('SELECT * FROM tenants ORDER BY name COLLATE NOCASE');
    } catch (error) {
      console.error('❌ Error getting all tenants:', error);
      throw new DatabaseError("Could not fetch tenant list.");
    }
  },

  getTenant: async (tenantId: number): Promise<Tenant | null> => {
    try {
      return await db.getFirstAsync<Tenant>('SELECT * FROM tenants WHERE tenant_id = ?', [tenantId]);
    } catch (error) {
      console.error(`❌ Error getting tenant ${tenantId}:`, error);
      throw new DatabaseError("Could not fetch tenant details.");
    }
  },
  
  checkRoomExists: async (roomNumber: string, excludeTenantId?: number): Promise<boolean> => {
    try {
      let query = 'SELECT 1 FROM tenants WHERE room_number = ? LIMIT 1';
      const params: (string | number)[] = [roomNumber];
      if (excludeTenantId) {
        query = 'SELECT 1 FROM tenants WHERE room_number = ? AND tenant_id != ? LIMIT 1';
        params.push(excludeTenantId);
      }
      const result = await db.getFirstAsync<any>(query, params);
      return !!result;
    } catch (error) {
      console.error('❌ Error in checkRoomExists:', error);
      throw new DatabaseError('Unable to verify room availability.');
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
    const roomExists = await Database.checkRoomExists(tenant.roomNumber);
    if (roomExists) {
      throw new RoomAlreadyExistsError(tenant.roomNumber);
    }

    // Validate monthly rent
    if (tenant.monthlyRent <= 0) {
      throw new DatabaseError("Monthly rent must be greater than 0");
    }

    try {
      // Calculate first due date and initial status
      const firstDueDate = calculateNextDueDate(parseISO(tenant.startDate), tenant.rentCycle);
      const firstDueDateStr = format(firstDueDate, 'yyyy-MM-dd');
      
      const initialStatus = calculateTenantStatus(firstDueDateStr, false);

      const result = await db.runAsync(
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
    const roomExists = await Database.checkRoomExists(updates.roomNumber, tenantId);
    if (roomExists) {
      throw new RoomAlreadyExistsError(updates.roomNumber);
    }
    
    try {
      await db.runAsync(
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
      const { NotificationService } = await import('../services/notifications');
      await NotificationService.cancelReminders(tenantId);
      await db.runAsync('DELETE FROM tenants WHERE tenant_id = ?', [tenantId]);
    } catch (error) {
      console.error(`❌ Error deleting tenant ${tenantId}:`, error);
      throw new DatabaseError("Failed to delete the tenant.");
    }
  },

  updateAllTenantStatuses: async (): Promise<void> => {
    console.log('🔄 Updating all tenant statuses...');
    try {
      await db.execAsync('BEGIN TRANSACTION');
      const tenants = await db.getAllAsync<Tenant>('SELECT * FROM tenants');
      
      for (const tenant of tenants) {
        try {
          const nextDueDate = await getTenantNextDueDate(tenant.tenant_id, db);
          const hasPayments = await db.getFirstAsync<{ count: number }>(
            'SELECT COUNT(*) as count FROM payments WHERE tenant_id = ?',
            [tenant.tenant_id]
          );
          
          const newStatus = calculateTenantStatus(nextDueDate, (hasPayments?.count || 0) > 0);

          if (newStatus !== tenant.status) {
            await db.runAsync(
              'UPDATE tenants SET status = ?, updated_at = datetime("now") WHERE tenant_id = ?',
              [newStatus, tenant.tenant_id]
            );
            console.log(`✅ Status for ${tenant.name} changed from ${tenant.status} to ${newStatus}`);
          }
        } catch (tenantError) {
          console.error(`❌ Error updating tenant ${tenant.tenant_id}:`, tenantError);
        }
      }
      
      await db.execAsync('COMMIT');
      console.log('✅ Tenant status update completed successfully');
    } catch (error) {
      await db.execAsync('ROLLBACK');
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
      await db.execAsync('BEGIN TRANSACTION');
      const warnings: string[] = [];

      // 1. Get tenant with ALL relevant data
      const tenant = await db.getFirstAsync<Tenant>(
        'SELECT * FROM tenants WHERE tenant_id = ?',
        [payment.tenantId]
      );
      if (!tenant) throw new Error('Tenant not found');

      // 2. Get last payment by NEXT_DUE_DATE
      const lastPayment = await db.getFirstAsync<{ 
        next_due_date: string;
        payment_date: string;
      }>(
        `SELECT next_due_date, payment_date 
         FROM payments 
         WHERE tenant_id = ? 
         ORDER BY next_due_date DESC, payment_id DESC 
         LIMIT 1`,
        [payment.tenantId]
      );

      // 3. Determine baseDate for calculation
      let baseDate: Date;
      if (lastPayment) {
        baseDate = parseISO(lastPayment.next_due_date);
        
        if (payment.paymentDate < lastPayment.payment_date) {
          warnings.push(
            `⚠️ This payment is dated ${payment.paymentDate} but the last payment was ${lastPayment.payment_date}. ` +
            `Next due date will still calculate from ${lastPayment.next_due_date}.`
          );
        }
      } else {
        baseDate = calculateNextDueDate(
          parseISO(tenant.start_date), 
          tenant.rent_cycle || 'monthly'
        );
      }

      // 4. CONTRACT END DATE CHECK
      if (tenant.contract_end_date) {
        const contractEnd = parseISO(tenant.contract_end_date);
        const totalAvailable = payment.amountPaid + (tenant.credit_balance || 0);
        const monthsCovered = Math.floor(totalAvailable / tenant.monthly_rent);
        
        let projectedDate = new Date(baseDate);
        for (let i = 0; i < monthsCovered; i++) {
          projectedDate = calculateNextDueDate(projectedDate, tenant.rent_cycle || 'monthly');
        }
        
        if (projectedDate > contractEnd) {
          warnings.push(
            `⚠️ This payment extends beyond contract end date (${format(contractEnd, 'MMM dd, yyyy')}). ` +
            `Consider contract renewal.`
          );
        }
      }

      // 5. PERFORM CALCULATION with current rent amount
      const currentRent = tenant.monthly_rent;
      const totalAvailable = payment.amountPaid + (tenant.credit_balance || 0);
      const fullCyclesCovered = Math.floor(totalAvailable / currentRent);
      const newCreditBalance = totalAvailable % currentRent;

      // 6. Calculate next_due_date
      let nextDueDate = new Date(baseDate);
      for (let i = 0; i < fullCyclesCovered; i++) {
        nextDueDate = calculateNextDueDate(nextDueDate, tenant.rent_cycle || 'monthly');
      }
      const nextDueDateStr = format(nextDueDate, 'yyyy-MM-dd');

      // 7. OVERPAYMENT WARNING
      if (payment.amountPaid > (currentRent * 3)) {
        warnings.push(
          `💰 Large payment detected (${payment.amountPaid.toLocaleString()} UGX). ` +
          `Covers ${fullCyclesCovered} payment periods.`
        );
      }

      // 8. Record payment WITH rent amount snapshot
      const result = await db.runAsync(
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

      // 9. Update tenant status
      const newStatus = calculateTenantStatus(nextDueDateStr, true);
      
      await db.runAsync(
        `UPDATE tenants 
         SET credit_balance = ?, 
             status = ?, 
             updated_at = datetime('now') 
         WHERE tenant_id = ?`,
        [newCreditBalance, newStatus, payment.tenantId]
      );

      // 10. Update reminders
      try {
        const { NotificationService } = await import('../services/notifications');
        await NotificationService.cancelReminders(payment.tenantId);
        await NotificationService.createReminder(payment.tenantId, nextDueDateStr);
      } catch (notifError) {
        console.warn('⚠️ Failed to update reminders:', notifError);
        warnings.push('Reminder notification update failed');
      }
      
      await db.execAsync('COMMIT');

      // 11. Determine alert needs
      let shouldAlertPartial = false;
      let alertMessage = '';
      
      if ((newStatus === 'Due Soon' || newStatus === 'Overdue') && newCreditBalance > 0) {
        shouldAlertPartial = true;
        const balanceDue = currentRent - newCreditBalance;
        alertMessage = 
          `Partial payment of ${payment.amountPaid.toLocaleString()} UGX recorded for ${tenant.name}. ` +
          `Credit balance: ${newCreditBalance.toLocaleString()} UGX. ` +
          `Balance due: ${balanceDue.toLocaleString()} UGX.`;
      }
      
      if (fullCyclesCovered === 0) {
        shouldAlertPartial = true;
        alertMessage = 
          `Payment of ${payment.amountPaid.toLocaleString()} UGX recorded. ` +
          `This brings credit to ${newCreditBalance.toLocaleString()} UGX, ` +
          `but does not cover a full period (${currentRent.toLocaleString()} UGX needed).`;
      }
      
      return {
        paymentId: result.lastInsertRowId,
        shouldAlertPartial,
        alertMessage,
        warnings: warnings.length > 0 ? warnings : undefined
      };
      
    } catch (error) {
      await db.execAsync('ROLLBACK');
      console.error('❌ Error recording payment:', error);
      throw new DatabaseError(
        "The payment could not be recorded. No changes were made. " +
        (error instanceof Error ? error.message : '')
      );
    }
  },

  cancelPayment: async (paymentId: number, reason: string): Promise<void> => {
    try {
      await db.execAsync('BEGIN TRANSACTION');
      
      // Get payment details
      const payment = await db.getFirstAsync<Payment & { tenant_name: string }>(
        `SELECT p.*, t.name as tenant_name 
         FROM payments p 
         JOIN tenants t ON p.tenant_id = t.tenant_id 
         WHERE p.payment_id = ?`,
        [paymentId]
      );
      
      if (!payment) throw new Error('Payment not found');
      
      // Get tenant
      const tenant = await db.getFirstAsync<Tenant>(
        'SELECT * FROM tenants WHERE tenant_id = ?',
        [payment.tenant_id]
      );
      if (!tenant) throw new Error('Tenant not found');
      
      // Check if this is the most recent payment
      const isLastPayment = await db.getFirstAsync<{ is_last: number }>(
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
      
      // Reverse the credit balance
      const reversedCredit = tenant.credit_balance - payment.amount_paid;
      
      // Get the previous payment's next_due_date to restore
      const previousPayment = await db.getFirstAsync<{ next_due_date: string }>(
        `SELECT next_due_date 
         FROM payments 
         WHERE tenant_id = ? AND payment_id < ? 
         ORDER BY next_due_date DESC, payment_id DESC 
         LIMIT 1`,
        [payment.tenant_id, paymentId]
      );
      
      // Delete the payment
      await db.runAsync('DELETE FROM payments WHERE payment_id = ?', [paymentId]);
      
      // Update tenant status
      const newNextDueDate = previousPayment 
        ? previousPayment.next_due_date 
        : format(
            calculateNextDueDate(parseISO(tenant.start_date), tenant.rent_cycle || 'monthly'),
            'yyyy-MM-dd'
          );
      
      const hasOtherPayments = await db.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) as count FROM payments WHERE tenant_id = ?',
        [payment.tenant_id]
      );
      
      const newStatus = calculateTenantStatus(
        newNextDueDate, 
        (hasOtherPayments?.count || 0) > 0
      );
      
      await db.runAsync(
        `UPDATE tenants 
         SET credit_balance = ?, status = ?, updated_at = datetime('now') 
         WHERE tenant_id = ?`,
        [Math.max(reversedCredit, 0), newStatus, payment.tenant_id]
      );
      
      // Log the cancellation
      await db.runAsync(
        `INSERT INTO payment_cancellations (
          original_payment_id, tenant_id, amount, reason, cancelled_at
        ) VALUES (?, ?, ?, ?, datetime('now'))`,
        [paymentId, payment.tenant_id, payment.amount_paid, reason]
      );
      
      await db.execAsync('COMMIT');
      console.log(`✅ Payment ${paymentId} cancelled: ${reason}`);
      
    } catch (error) {
      await db.execAsync('ROLLBACK');
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
      await db.execAsync('BEGIN TRANSACTION');
      const settings = await Database.getSettings();
      const tenants = await db.getAllAsync<Tenant>('SELECT * FROM tenants');
      const today = new Date();

      // Stage 1: Update Financial Statuses
      for (const tenant of tenants) {
        try {
          const nextDueDate = await getTenantNextDueDate(tenant.tenant_id, db);
          const hasPayments = await db.getFirstAsync<{ count: number }>(
            'SELECT COUNT(*) as count FROM payments WHERE tenant_id = ?',
            [tenant.tenant_id]
          );
          
          const currentStatus = calculateTenantStatus(nextDueDate, (hasPayments?.count || 0) > 0, today);

          if (currentStatus !== tenant.status) {
            await db.runAsync(
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

      // Stage 2: Automated Administrative Decisions
      if (settings) {
        for (const tenant of tenants) {
          if (tenant.status === 'Overdue') {
            try {
              const nextDueDate = await getTenantNextDueDate(tenant.tenant_id, db);
              const dueDate = parseISO(nextDueDate);
              const daysOverdue = Math.ceil((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
              
              if (daysOverdue > (settings.auto_suspend_days || 30)) {
                await db.runAsync(
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

        // Stage 3: Check for Upcoming Events
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

      await db.execAsync('COMMIT');
      console.log('✅ System heartbeat completed successfully');
      return results;
    } catch (error) {
      await db.execAsync('ROLLBACK');
      console.error('❌ Fatal error during system heartbeat:', error);
      throw new DatabaseError("Failed to run system audit.");
    }
  },

  getPaymentHistory: async (tenantId: number): Promise<Payment[]> => {
    try {
      return await db.getAllAsync<Payment>(
        'SELECT * FROM payments WHERE tenant_id = ? ORDER BY payment_date DESC, payment_id DESC', 
        [tenantId]
      );
    } catch (error) {
      console.error(`❌ Error getting payment history for tenant ${tenantId}:`, error);
      throw new DatabaseError("Could not fetch payment history.");
    }
  },

  getUpcomingReminders: async (daysAhead: number = 30): Promise<Reminder[]> => {
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      const futureDate = format(addDays(new Date(), daysAhead), 'yyyy-MM-dd');

      return await db.getAllAsync<Reminder>(
        `SELECT r.*, t.name, t.room_number 
         FROM reminders r JOIN tenants t ON r.tenant_id = t.tenant_id 
         WHERE date(r.reminder_date) BETWEEN date(?) AND date(?) AND r.status = 'Pending'
         ORDER BY r.reminder_date ASC`,
        [today, futureDate]
      );
    } catch (error) {
        console.error('❌ Error getting upcoming reminders:', error);
        return [];
    }
  },

  getSettings: async (): Promise<Settings | null> => {
    try {
      const settings = await db.getFirstAsync<Settings>('SELECT * FROM settings LIMIT 1');
      if(settings) {
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
      const current = await Database.getSettings();
      if (!current) {
        throw new DatabaseError("No settings found to update.");
      }

      await db.runAsync(
        `UPDATE settings SET 
            reminder_days_before_due = COALESCE(?, reminder_days_before_due),
            reminder_time = COALESCE(?, reminder_time),
            notification_enabled = COALESCE(?, notification_enabled),
            currency = COALESCE(?, currency),
            theme = COALESCE(?, theme),
            auto_suspend_days = COALESCE(?, auto_suspend_days),
            contract_reminder_days = COALESCE(?, contract_reminder_days)
         WHERE setting_id = ?`,
        [
          settings.reminder_days_before_due,
          settings.reminder_time,
          settings.notification_enabled ? 1 : 0,
          settings.currency,
          settings.theme,
          settings.auto_suspend_days,
          settings.contract_reminder_days,
          current.setting_id
        ]
      );
    } catch (error) {
      console.error('❌ Error updating settings:', error);
      throw new DatabaseError("Failed to update settings.");
    }
  },

  // MISSING METHODS ADDED BACK:
  getPaymentStats: async (): Promise<{
    totalCollected: number;
    thisMonth: number;
    lastMonth: number;
    overdueAmount: number;
  }> => {
    try {
        const now = new Date();
        const thisMonthStart = format(new Date(now.getFullYear(), now.getMonth(), 1), 'yyyy-MM-dd');
        const lastMonthStart = format(new Date(now.getFullYear(), now.getMonth() - 1, 1), 'yyyy-MM-dd');
        const lastMonthEnd = format(new Date(now.getFullYear(), now.getMonth(), 0), 'yyyy-MM-dd');

        const total = await db.getFirstAsync<{ total: number }>('SELECT COALESCE(SUM(amount_paid), 0) as total FROM payments');
        const thisMonth = await db.getFirstAsync<{ total: number }>('SELECT COALESCE(SUM(amount_paid), 0) as total FROM payments WHERE payment_date >= ?', [thisMonthStart]);
        const lastMonth = await db.getFirstAsync<{ total: number }>('SELECT COALESCE(SUM(amount_paid), 0) as total FROM payments WHERE payment_date BETWEEN ? AND ?', [lastMonthStart, lastMonthEnd]);
        const overdue = await db.getFirstAsync<{ total: number }>('SELECT COALESCE(SUM(monthly_rent), 0) as total FROM tenants WHERE status = ?', ['Overdue']);

        return {
            totalCollected: total?.total || 0,
            thisMonth: thisMonth?.total || 0,
            lastMonth: lastMonth?.total || 0,
            overdueAmount: overdue?.total || 0,
        };
    } catch (error) {
        console.error('❌ Error getting payment stats:', error);
        return { totalCollected: 0, thisMonth: 0, lastMonth: 0, overdueAmount: 0 };
    }
  },

  getMonthlyTrend: async (): Promise<{ month: string; amount: number }[]> => {
    try {
        const months = [];
        const now = new Date();
        for (let i = 5; i >= 0; i--) {
            const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const monthStart = format(date, 'yyyy-MM-dd');
            const monthEnd = format(new Date(date.getFullYear(), date.getMonth() + 1, 0), 'yyyy-MM-dd');
            const result = await db.getFirstAsync<{ total: number }>('SELECT COALESCE(SUM(amount_paid), 0) as total FROM payments WHERE payment_date BETWEEN ? AND ?', [monthStart, monthEnd]);
            months.push({
                month: format(date, 'MMM'),
                amount: result?.total || 0,
            });
        }
        return months;
    } catch (error) {
        console.error('❌ Error getting monthly trend:', error);
        return [];
    }
  },

  // NEW: Reset credit balance (for admin purposes)
  resetCreditBalance: async (tenantId: number, newBalance: number = 0): Promise<void> => {
    try {
      await db.runAsync(
        'UPDATE tenants SET credit_balance = ?, updated_at = datetime("now") WHERE tenant_id = ?',
        [newBalance, tenantId]
      );
      console.log(`✅ Reset credit balance for tenant ${tenantId} to ${newBalance}`);
    } catch (error) {
      console.error('❌ Error resetting credit balance:', error);
      throw new DatabaseError("Failed to reset credit balance.");
    }
  },

  // NEW: Get tenant with their current credit balance and next due date
  getTenantWithDetails: async (tenantId: number): Promise<(Tenant & { next_due_date: string }) | null> => {
    try {
      return await db.getFirstAsync<Tenant & { next_due_date: string }>(`
        SELECT t.*, 
               COALESCE(
                 (SELECT next_due_date FROM payments WHERE tenant_id = t.tenant_id ORDER BY next_due_date DESC, payment_id DESC LIMIT 1),
                 date(t.start_date, '+1 month')
               ) as next_due_date
        FROM tenants t
        WHERE t.tenant_id = ?
      `, [tenantId]);
    } catch (error) {
      console.error(`❌ Error getting tenant details ${tenantId}:`, error);
      throw new DatabaseError("Could not fetch tenant details.");
    }
  },

  getTenantStats: async (tenantId: number): Promise<{
    totalPaid: number;
    lastPaymentDate: string | null;
    nextDueDate: string;
    creditBalance: number;
    paymentCount: number;
  }> => {
    try {
      const totalPaidResult = await db.getFirstAsync<{ total: number }>(
        'SELECT COALESCE(SUM(amount_paid), 0) as total FROM payments WHERE tenant_id = ?',
        [tenantId]
      );
      
      const lastPayment = await db.getFirstAsync<{ payment_date: string }>(
        'SELECT payment_date FROM payments WHERE tenant_id = ? ORDER BY payment_date DESC LIMIT 1',
        [tenantId]
      );
      
      const paymentCountResult = await db.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) as count FROM payments WHERE tenant_id = ?',
        [tenantId]
      );
      
      const tenant = await db.getFirstAsync<Tenant>('SELECT credit_balance FROM tenants WHERE tenant_id = ?', [tenantId]);
      
      const nextDueDate = await getTenantNextDueDate(tenantId, db);

      return {
        totalPaid: totalPaidResult?.total || 0,
        lastPaymentDate: lastPayment?.payment_date || null,
        nextDueDate,
        creditBalance: tenant?.credit_balance || 0,
        paymentCount: paymentCountResult?.count || 0
      };
    } catch (error) {
      console.error(`❌ Error getting stats for tenant ${tenantId}:`, error);
      throw new DatabaseError("Could not fetch tenant statistics.");
    }
  },

  getDashboardStats: async (): Promise<{
    totalTenants: number;
    overdueCount: number;
    dueSoonCount: number;
    paidCount: number;
    totalMonthlyRent: number;
  }> => {
    try {
      const totalTenantsResult = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM tenants');
      const overdueResult = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM tenants WHERE status = "Overdue"');
      const dueSoonResult = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM tenants WHERE status = "Due Soon"');
      const paidResult = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM tenants WHERE status = "Paid"');
      const totalRentResult = await db.getFirstAsync<{ total: number }>('SELECT COALESCE(SUM(monthly_rent), 0) as total FROM tenants');

      return {
        totalTenants: totalTenantsResult?.count || 0,
        overdueCount: overdueResult?.count || 0,
        dueSoonCount: dueSoonResult?.count || 0,
        paidCount: paidResult?.count || 0,
        totalMonthlyRent: totalRentResult?.total || 0
      };
    } catch (error) {
      console.error('❌ Error getting dashboard stats:', error);
      throw new DatabaseError("Could not fetch dashboard statistics.");
    }
  }
};

export default Database;